import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { withSpan } from '../otel';
import { loggers } from '../logger';
import { ffmpegProcessor } from './ffmpeg';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const logger = loggers.media.child({ component: 'whisper' });

export interface WhisperConfig {
  model: string; // tiny, base, small, medium, large
  language?: string; // auto-detect if not specified
  task: 'transcribe' | 'translate';
  outputFormat: 'srt' | 'vtt' | 'json' | 'txt';
  initialPrompt?: string;
}

export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avgLogprob: number;
  compressionRatio: number;
  noSpeechProb: number;
}

export interface TranscriptionResult {
  language: string;
  languageConfidence: number;
  duration: number;
  text: string;
  segments: TranscriptionSegment[];
  wordCount: number;
  characterCount: number;
  outputPath: string;
  metadata: {
    model: string;
    processingTimeMs: number;
    whisperVersion?: string;
    audioInfo: {
      duration: number;
      sampleRate: number;
      channels: number;
    };
  };
}

export interface SubtitleTrack {
  language: string;
  languageCode: string;
  format: 'srt' | 'vtt';
  content: string;
  path: string;
  confidence: number;
  wordCount: number;
  characterCount: number;
}

// Default Whisper configuration optimized for social media content
export const WHISPER_CONFIGS: Record<string, WhisperConfig> = {
  fast: {
    model: 'base',
    task: 'transcribe',
    outputFormat: 'json',
    initialPrompt: 'Social media content, informal speech, slang, hashtags, mentions.'
  },
  accurate: {
    model: 'medium',
    task: 'transcribe', 
    outputFormat: 'json',
    initialPrompt: 'Social media content with proper punctuation and capitalization.'
  },
  multilingual: {
    model: 'large',
    task: 'transcribe',
    outputFormat: 'json'
  }
};

export class WhisperProcessor {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || os.tmpdir();
  }

  // =============================================
  // Main Transcription Methods
  // =============================================

  async transcribeVideo(
    videoPath: string,
    config: WhisperConfig = WHISPER_CONFIGS.fast
  ): Promise<TranscriptionResult> {
    return withSpan('whisper.transcribe_video', {
      'media.input_path': path.basename(videoPath),
      'whisper.model': config.model,
      'whisper.language': config.language || 'auto',
      'whisper.task': config.task
    }, async (span) => {
      const startTime = Date.now();

      try {
        // Step 1: Extract audio from video
        const audioPath = this.generateTempPath('audio', 'wav');
        await ffmpegProcessor.extractAudio(videoPath, audioPath);

        logger.info({
          videoPath: path.basename(videoPath),
          audioPath: path.basename(audioPath),
          config
        }, 'Starting video transcription');

        // Step 2: Transcribe audio
        const result = await this.transcribeAudio(audioPath, config);

        // Step 3: Clean up temporary audio file
        await this.cleanup(audioPath);

        const processingTimeMs = Date.now() - startTime;

        span.setAttributes({
          'whisper.language_detected': result.language,
          'whisper.confidence': result.languageConfidence,
          'whisper.duration': result.duration,
          'whisper.word_count': result.wordCount,
          'whisper.processing_time_ms': processingTimeMs
        });

        logger.info({
          videoPath: path.basename(videoPath),
          language: result.language,
          confidence: result.languageConfidence,
          duration: result.duration,
          wordCount: result.wordCount,
          processingTimeMs
        }, 'Video transcription completed');

        // Update metadata with processing time
        result.metadata.processingTimeMs = processingTimeMs;

        return result;

      } catch (error) {
        const processingTimeMs = Date.now() - startTime;
        span.recordException(error as Error);
        span.setAttributes({
          'whisper.processing_time_ms': processingTimeMs,
          'whisper.error': true
        });

        logger.error({
          err: error,
          videoPath: path.basename(videoPath),
          processingTimeMs
        }, 'Video transcription failed');

        throw error;
      }
    });
  }

  async transcribeAudio(
    audioPath: string,
    config: WhisperConfig = WHISPER_CONFIGS.fast
  ): Promise<TranscriptionResult> {
    return withSpan('whisper.transcribe_audio', {
      'media.input_path': path.basename(audioPath),
      'whisper.model': config.model
    }, async () => {
      // Generate output path for JSON results
      const outputPath = this.generateTempPath('transcription', 'json');

      // Build Whisper command
      const whisperCommand = await this.buildWhisperCommand(
        audioPath,
        outputPath,
        config
      );

      logger.info({
        audioPath: path.basename(audioPath),
        outputPath: path.basename(outputPath),
        command: whisperCommand
      }, 'Running Whisper transcription');

      // Execute Whisper
      await this.executeWhisperCommand(whisperCommand);

      // Parse results
      const result = await this.parseWhisperOutput(outputPath, config);

      // Add audio info
      const audioInfo = await this.getAudioInfo(audioPath);
      result.metadata.audioInfo = audioInfo;

      return result;
    });
  }

  // =============================================
  // Subtitle Generation
  // =============================================

  async generateSubtitles(
    transcriptionResult: TranscriptionResult,
    formats: Array<'srt' | 'vtt'> = ['srt']
  ): Promise<SubtitleTrack[]> {
    return withSpan('whisper.generate_subtitles', {
      'whisper.language': transcriptionResult.language,
      'whisper.formats': formats.join(','),
      'whisper.segments_count': transcriptionResult.segments.length
    }, async () => {
      const subtitles: SubtitleTrack[] = [];

      for (const format of formats) {
        const subtitlePath = this.generateTempPath(`subtitle_${transcriptionResult.language}`, format);
        
        let content: string;
        if (format === 'srt') {
          content = this.convertToSRT(transcriptionResult.segments);
        } else if (format === 'vtt') {
          content = this.convertToVTT(transcriptionResult.segments);
        } else {
          throw new Error(`Unsupported subtitle format: ${format}`);
        }

        // Write subtitle file
        await writeFile(subtitlePath, content, 'utf-8');

        subtitles.push({
          language: transcriptionResult.language,
          languageCode: this.getLanguageCode(transcriptionResult.language),
          format,
          content,
          path: subtitlePath,
          confidence: transcriptionResult.languageConfidence,
          wordCount: transcriptionResult.wordCount,
          characterCount: content.length
        });

        logger.info({
          language: transcriptionResult.language,
          format,
          path: path.basename(subtitlePath),
          length: content.length
        }, 'Generated subtitle track');
      }

      return subtitles;
    });
  }

  // =============================================
  // Private Helper Methods
  // =============================================

  private async buildWhisperCommand(
    inputPath: string,
    outputPath: string,
    config: WhisperConfig
  ): Promise<string> {
    const command = [
      'whisper',
      `"${inputPath}"`,
      `--model ${config.model}`,
      `--task ${config.task}`,
      `--output_format ${config.outputFormat}`,
      `--output_dir "${path.dirname(outputPath)}"`,
      '--verbose False'
    ];

    // Language specification
    if (config.language) {
      command.push(`--language ${config.language}`);
    }

    // Initial prompt for context
    if (config.initialPrompt) {
      command.push(`--initial_prompt "${config.initialPrompt}"`);
    }

    // Optimize for speed vs accuracy
    if (config.model === 'tiny' || config.model === 'base') {
      command.push('--fp16 False'); // Faster on CPU
    }

    // Additional optimizations for social media content
    command.push('--condition_on_previous_text False'); // Better for short clips
    command.push('--no_speech_threshold 0.6'); // Detect silence better
    command.push('--logprob_threshold -1.0'); // More conservative word filtering

    return command.join(' ');
  }

  private async executeWhisperCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(command, { 
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 10 * 60 * 1000 // 10 minute timeout
      }, (error, stdout, stderr) => {
        if (error) {
          logger.error({
            command,
            exitCode: error.code,
            stdout,
            stderr
          }, 'Whisper command failed');

          reject(new Error(`Whisper failed: ${error.message}\nStderr: ${stderr}`));
        } else {
          logger.debug({
            command,
            stdout: stdout.substring(0, 500) // Truncate for logging
          }, 'Whisper command completed');
          
          resolve();
        }
      });
    });
  }

  private async parseWhisperOutput(
    outputPath: string,
    config: WhisperConfig
  ): Promise<TranscriptionResult> {
    try {
      const jsonContent = await readFile(outputPath, 'utf-8');
      const whisperOutput = JSON.parse(jsonContent);

      // Calculate text statistics
      const fullText = whisperOutput.text || '';
      const wordCount = fullText.split(/\s+/).filter((word: string) => word.length > 0).length;
      const characterCount = fullText.length;

      // Calculate average confidence from segments
      const segments = whisperOutput.segments || [];
      let totalConfidence = 0;
      let segmentCount = 0;

      for (const segment of segments) {
        if (segment.avg_logprob !== undefined) {
          // Convert log probability to confidence score (0-1)
          totalConfidence += Math.exp(segment.avg_logprob);
          segmentCount++;
        }
      }

      const averageConfidence = segmentCount > 0 ? totalConfidence / segmentCount : 0.5;

      const result: TranscriptionResult = {
        language: whisperOutput.language || 'unknown',
        languageConfidence: averageConfidence,
        duration: whisperOutput.duration || 0,
        text: fullText,
        segments: segments.map((segment: any, index: number) => ({
          id: segment.id || index,
          seek: segment.seek || 0,
          start: segment.start || 0,
          end: segment.end || 0,
          text: segment.text || '',
          tokens: segment.tokens || [],
          temperature: segment.temperature || 0,
          avgLogprob: segment.avg_logprob || 0,
          compressionRatio: segment.compression_ratio || 0,
          noSpeechProb: segment.no_speech_prob || 0
        })),
        wordCount,
        characterCount,
        outputPath,
        metadata: {
          model: config.model,
          processingTimeMs: 0, // Will be set by caller
          audioInfo: {
            duration: 0, // Will be set by caller
            sampleRate: 0,
            channels: 0
          }
        }
      };

      // Clean up temporary JSON file
      await this.cleanup(outputPath);

      return result;

    } catch (error) {
      logger.error({
        err: error,
        outputPath: path.basename(outputPath)
      }, 'Failed to parse Whisper output');
      
      throw new Error(`Failed to parse Whisper output: ${error instanceof Error ? error.message : error}`);
    }
  }

  private convertToSRT(segments: TranscriptionSegment[]): string {
    let srt = '';
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      srt += `${i + 1}\n`;
      srt += `${this.formatSRTTimestamp(segment.start)} --> ${this.formatSRTTimestamp(segment.end)}\n`;
      srt += `${segment.text.trim()}\n\n`;
    }
    
    return srt;
  }

  private convertToVTT(segments: TranscriptionSegment[]): string {
    let vtt = 'WEBVTT\n\n';
    
    for (const segment of segments) {
      vtt += `${this.formatVTTTimestamp(segment.start)} --> ${this.formatVTTTimestamp(segment.end)}\n`;
      vtt += `${segment.text.trim()}\n\n`;
    }
    
    return vtt;
  }

  private formatSRTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  private formatVTTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
  }

  private getLanguageCode(language: string): string {
    const languageCodes: Record<string, string> = {
      'english': 'en',
      'french': 'fr',
      'spanish': 'es',
      'german': 'de',
      'italian': 'it',
      'portuguese': 'pt',
      'russian': 'ru',
      'japanese': 'ja',
      'chinese': 'zh',
      'arabic': 'ar',
      'hindi': 'hi',
      'korean': 'ko'
    };
    
    return languageCodes[language.toLowerCase()] || language.substring(0, 2);
  }

  private async getAudioInfo(audioPath: string): Promise<{ duration: number; sampleRate: number; channels: number }> {
    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${audioPath}"`;
      const { stdout } = await execAsync(command);
      const probe = JSON.parse(stdout);
      
      const audioStream = probe.streams.find((s: any) => s.codec_type === 'audio');
      
      return {
        duration: parseFloat(probe.format.duration || '0'),
        sampleRate: parseInt(audioStream?.sample_rate || '0'),
        channels: parseInt(audioStream?.channels || '0')
      };
    } catch (error) {
      logger.warn({ err: error, audioPath }, 'Failed to get audio info');
      return { duration: 0, sampleRate: 0, channels: 0 };
    }
  }

  // =============================================
  // Utility Methods
  // =============================================

  async checkWhisperInstallation(): Promise<{ installed: boolean; version?: string; error?: string }> {
    try {
      const { stdout } = await execAsync('whisper --version');
      const versionMatch = stdout.match(/whisper\s+([^\s]+)/);
      
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : 'unknown'
      };
    } catch (error) {
      return {
        installed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  generateTempPath(prefix: string, extension: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(this.tempDir, `${prefix}_${timestamp}_${random}.${extension}`);
  }

  async cleanup(...paths: string[]): Promise<void> {
    await Promise.allSettled(
      paths.map(async (filePath) => {
        try {
          await unlink(filePath);
          logger.debug({ path: filePath }, 'Cleaned up temporary file');
        } catch (error) {
          // File may not exist, which is fine
        }
      })
    );
  }
}

// Default Whisper processor instance
export const whisperProcessor = new WhisperProcessor();