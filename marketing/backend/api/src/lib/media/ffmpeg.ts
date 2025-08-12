import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, access } from 'fs/promises';
import { createHash } from 'crypto';
import { withSpan } from '../otel';
import { loggers } from '../logger';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const logger = loggers.media.child({ component: 'ffmpeg' });

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  aspectRatio: number;
  frameRate: number;
  bitrate: number;
  codec: string;
  audioCodec?: string;
  audioBitrate?: number;
  audioChannels?: number;
  audioSampleRate?: number;
}

export interface TranscodeProfile {
  name: string;
  width: number;
  height: number;
  videoBitrate: number; // kbps
  audioBitrate: number; // kbps
  frameRate?: number;
  preset: string;
  profile: string;
  level: string;
}

export interface TranscodeOptions {
  profile: TranscodeProfile;
  enableSubtitles?: boolean;
  subtitleFile?: string;
  burnInSubtitles?: boolean;
  enableLoudnorm?: boolean;
  outputFormat?: string;
}

export interface TranscodeResult {
  outputPath: string;
  ffmpegCommand: string;
  processingTimeMs: number;
  outputInfo: VideoInfo;
  commandHash: string;
}

// Predefined profiles for consistent output
export const VIDEO_PROFILES: Record<string, TranscodeProfile> = {
  '9x16': {
    name: '9x16',
    width: 1080,
    height: 1920,
    videoBitrate: 6000,
    audioBitrate: 128,
    frameRate: 30,
    preset: 'veryfast',
    profile: 'high',
    level: '4.1'
  },
  '1x1': {
    name: '1x1',
    width: 1080,
    height: 1080,
    videoBitrate: 4000,
    audioBitrate: 128,
    frameRate: 30,
    preset: 'veryfast',
    profile: 'high',
    level: '4.0'
  },
  '16x9': {
    name: '16x9',
    width: 1920,
    height: 1080,
    videoBitrate: 5000,
    audioBitrate: 128,
    frameRate: 30,
    preset: 'veryfast',
    profile: 'high',
    level: '4.0'
  }
};

export class FFmpegProcessor {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || os.tmpdir();
  }

  // =============================================
  // Video Information & Analysis
  // =============================================

  async getVideoInfo(inputPath: string): Promise<VideoInfo> {
    return withSpan('ffmpeg.get_video_info', {
      'media.input_path': path.basename(inputPath)
    }, async (span) => {
      try {
        const command = [
          'ffprobe',
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          `"${inputPath}"`
        ].join(' ');

        const { stdout } = await execAsync(command);
        const probeData = JSON.parse(stdout);

        const videoStream = probeData.streams.find((s: any) => s.codec_type === 'video');
        const audioStream = probeData.streams.find((s: any) => s.codec_type === 'audio');

        if (!videoStream) {
          throw new Error('No video stream found in input file');
        }

        const info: VideoInfo = {
          duration: parseFloat(probeData.format.duration || '0'),
          width: parseInt(videoStream.width || '0'),
          height: parseInt(videoStream.height || '0'),
          aspectRatio: parseFloat(videoStream.display_aspect_ratio?.split(':').reduce((a: string, b: string) => (+a / +b).toString()) || '0'),
          frameRate: this.parseFrameRate(videoStream.r_frame_rate || '0/1'),
          bitrate: parseInt(probeData.format.bit_rate || '0'),
          codec: videoStream.codec_name || 'unknown',
          audioCodec: audioStream?.codec_name,
          audioBitrate: audioStream ? parseInt(audioStream.bit_rate || '0') : undefined,
          audioChannels: audioStream ? parseInt(audioStream.channels || '0') : undefined,
          audioSampleRate: audioStream ? parseInt(audioStream.sample_rate || '0') : undefined
        };

        // Calculate aspect ratio from dimensions if not provided
        if (!info.aspectRatio && info.width && info.height) {
          info.aspectRatio = info.width / info.height;
        }

        span.setAttributes({
          'media.duration': info.duration,
          'media.width': info.width,
          'media.height': info.height,
          'media.aspect_ratio': info.aspectRatio,
          'media.bitrate': info.bitrate,
          'media.codec': info.codec
        });

        logger.info({
          inputPath: path.basename(inputPath),
          ...info
        }, 'Analyzed video information');

        return info;

      } catch (error) {
        logger.error({ err: error, inputPath }, 'Failed to get video info');
        throw new Error(`Failed to analyze video: ${error instanceof Error ? error.message : error}`);
      }
    });
  }

  // =============================================
  // Video Transcoding
  // =============================================

  async transcodeVideo(
    inputPath: string,
    outputPath: string,
    options: TranscodeOptions
  ): Promise<TranscodeResult> {
    return withSpan('ffmpeg.transcode_video', {
      'media.input_path': path.basename(inputPath),
      'media.output_path': path.basename(outputPath),
      'media.profile': options.profile.name
    }, async (span) => {
      const startTime = Date.now();
      
      try {
        // Get input video information
        const inputInfo = await this.getVideoInfo(inputPath);
        
        // Build FFmpeg command
        const ffmpegCommand = await this.buildTranscodeCommand(
          inputPath,
          outputPath,
          inputInfo,
          options
        );

        // Calculate command hash for deduplication
        const commandHash = this.calculateCommandHash(ffmpegCommand);

        logger.info({
          inputPath: path.basename(inputPath),
          outputPath: path.basename(outputPath),
          profile: options.profile.name,
          command: ffmpegCommand,
          commandHash
        }, 'Starting video transcode');

        // Execute FFmpeg command
        await this.executeCommand(ffmpegCommand);

        const processingTimeMs = Date.now() - startTime;

        // Get output video information
        const outputInfo = await this.getVideoInfo(outputPath);

        span.setAttributes({
          'media.processing_time_ms': processingTimeMs,
          'media.command_hash': commandHash,
          'media.output_width': outputInfo.width,
          'media.output_height': outputInfo.height,
          'media.output_bitrate': outputInfo.bitrate
        });

        logger.info({
          inputPath: path.basename(inputPath),
          outputPath: path.basename(outputPath),
          profile: options.profile.name,
          processingTimeMs,
          outputInfo
        }, 'Video transcode completed');

        return {
          outputPath,
          ffmpegCommand,
          processingTimeMs,
          outputInfo,
          commandHash
        };

      } catch (error) {
        const processingTimeMs = Date.now() - startTime;
        span.recordException(error as Error);
        span.setAttributes({
          'media.processing_time_ms': processingTimeMs,
          'media.error': true
        });
        
        logger.error({
          err: error,
          inputPath: path.basename(inputPath),
          outputPath: path.basename(outputPath),
          processingTimeMs
        }, 'Video transcode failed');

        throw error;
      }
    });
  }

  // =============================================
  // Subtitle Processing
  // =============================================

  async addSubtitlesToVideo(
    inputVideoPath: string,
    subtitlePath: string,
    outputPath: string,
    burnIn: boolean = false
  ): Promise<TranscodeResult> {
    return withSpan('ffmpeg.add_subtitles', {
      'media.input_path': path.basename(inputVideoPath),
      'media.subtitle_path': path.basename(subtitlePath),
      'media.burn_in': burnIn
    }, async (span) => {
      const startTime = Date.now();
      
      try {
        let command: string;

        if (burnIn) {
          // Burn subtitles into video
          command = [
            'ffmpeg', '-y',
            `-i "${inputVideoPath}"`,
            `-vf "subtitles='${subtitlePath}':force_style='Fontsize=24,PrimaryColour=&Hffffff,OutlineColour=&H80000000,Outline=2'"`,
            '-c:a copy',
            '-preset veryfast',
            '-crf 18',
            `-movflags +faststart`,
            `"${outputPath}"`
          ].join(' ');
        } else {
          // Add subtitles as separate track (mov_text)
          command = [
            'ffmpeg', '-y',
            `-i "${inputVideoPath}"`,
            `-i "${subtitlePath}"`,
            '-c:v copy',
            '-c:a copy',
            '-c:s mov_text',
            '-metadata:s:s:0 language=eng',
            `-movflags +faststart`,
            `"${outputPath}"`
          ].join(' ');
        }

        const commandHash = this.calculateCommandHash(command);

        logger.info({
          inputVideoPath: path.basename(inputVideoPath),
          subtitlePath: path.basename(subtitlePath),
          outputPath: path.basename(outputPath),
          burnIn,
          command
        }, 'Adding subtitles to video');

        await this.executeCommand(command);

        const processingTimeMs = Date.now() - startTime;
        const outputInfo = await this.getVideoInfo(outputPath);

        span.setAttributes({
          'media.processing_time_ms': processingTimeMs,
          'media.command_hash': commandHash,
          'media.burn_in': burnIn
        });

        return {
          outputPath,
          ffmpegCommand: command,
          processingTimeMs,
          outputInfo,
          commandHash
        };

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ err: error }, 'Failed to add subtitles');
        throw error;
      }
    });
  }

  // =============================================
  // Audio Processing
  // =============================================

  async extractAudio(inputPath: string, outputPath: string): Promise<string> {
    return withSpan('ffmpeg.extract_audio', {
      'media.input_path': path.basename(inputPath),
      'media.output_path': path.basename(outputPath)
    }, async () => {
      const command = [
        'ffmpeg', '-y',
        `-i "${inputPath}"`,
        '-vn', // No video
        '-acodec pcm_s16le', // Uncompressed audio for Whisper
        '-ar 16000', // 16kHz sample rate
        '-ac 1', // Mono
        `"${outputPath}"`
      ].join(' ');

      logger.info({
        inputPath: path.basename(inputPath),
        outputPath: path.basename(outputPath),
        command
      }, 'Extracting audio for transcription');

      await this.executeCommand(command);
      return outputPath;
    });
  }

  // =============================================
  // Private Helper Methods
  // =============================================

  private async buildTranscodeCommand(
    inputPath: string,
    outputPath: string,
    inputInfo: VideoInfo,
    options: TranscodeOptions
  ): Promise<string> {
    const { profile } = options;
    const videoFilters: string[] = [];
    const audioFilters: string[] = [];

    // Calculate video filters based on aspect ratio
    const inputAR = inputInfo.aspectRatio;
    const targetAR = profile.width / profile.height;

    if (Math.abs(inputAR - targetAR) > 0.01) {
      // Need to adjust aspect ratio
      if (inputAR > targetAR) {
        // Input is wider - crop sides
        const cropWidth = Math.round(inputInfo.height * targetAR);
        videoFilters.push(`crop=${cropWidth}:${inputInfo.height}`);
        videoFilters.push(`scale=${profile.width}:${profile.height}:flags=lanczos`);
      } else {
        // Input is taller - pad top/bottom or crop
        videoFilters.push(`scale=${profile.width}:${profile.height}:flags=lanczos`);
        videoFilters.push(`pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black`);
      }
    } else {
      // Just scale
      videoFilters.push(`scale=${profile.width}:${profile.height}:flags=lanczos`);
    }

    // Audio normalization with EBU R128 loudness
    if (options.enableLoudnorm !== false) {
      audioFilters.push('loudnorm=I=-16:LRA=11:TP=-1.5:dual_mono=true');
    }

    // Build command parts
    const commandParts = [
      'ffmpeg', '-y', // Overwrite output
      `-i "${inputPath}"`,
    ];

    // Add subtitle input if provided and not burning in
    if (options.subtitleFile && !options.burnInSubtitles) {
      commandParts.push(`-i "${options.subtitleFile}"`);
    }

    // Video filters
    if (videoFilters.length > 0) {
      let vfString = videoFilters.join(',');
      
      // Add subtitle burn-in if requested
      if (options.subtitleFile && options.burnInSubtitles) {
        vfString += `,subtitles='${options.subtitleFile}':force_style='Fontsize=24,PrimaryColour=&Hffffff,OutlineColour=&H80000000,Outline=2'`;
      }
      
      commandParts.push(`-vf "${vfString}"`);
    }

    // Audio filters
    if (audioFilters.length > 0) {
      commandParts.push(`-af "${audioFilters.join(',')}"`);
    }

    // Video codec settings
    commandParts.push(
      '-c:v libx264',
      `-preset ${profile.preset}`,
      `-profile:v ${profile.profile}`,
      `-level ${profile.level}`,
      `-b:v ${profile.videoBitrate}k`,
      `-g 60`, // Fixed keyframe interval
      '-pix_fmt yuv420p'
    );

    // Audio codec settings
    commandParts.push(
      '-c:a aac',
      `-b:a ${profile.audioBitrate}k`
    );

    // Subtitle codec (if separate subtitle file provided)
    if (options.subtitleFile && !options.burnInSubtitles) {
      commandParts.push(
        '-c:s mov_text',
        '-metadata:s:s:0 language=eng'
      );
    }

    // Output options
    commandParts.push(
      '-movflags +faststart', // Enable fast start for web playback
      `"${outputPath}"`
    );

    return commandParts.join(' ');
  }

  private parseFrameRate(rFrameRate: string): number {
    const parts = rFrameRate.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(rFrameRate);
  }

  private calculateCommandHash(command: string): string {
    // Normalize command for consistent hashing
    const normalizedCommand = command
      .replace(/"/g, '') // Remove quotes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toLowerCase();

    return createHash('sha256').update(normalizedCommand).digest('hex');
  }

  private async executeCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        // Log progress information
        const progressMatch = stderr.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
        if (progressMatch) {
          logger.debug({ progress: progressMatch[1] }, 'FFmpeg progress');
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          logger.error({
            command,
            exitCode: code,
            stdout,
            stderr
          }, 'FFmpeg command failed');
          
          reject(new Error(`FFmpeg failed with exit code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        logger.error({ err: error, command }, 'FFmpeg process error');
        reject(error);
      });

      // Set timeout (30 minutes for long videos)
      setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('FFmpeg command timed out'));
      }, 30 * 60 * 1000);
    });
  }

  // =============================================
  // Utility Methods
  // =============================================

  async checkFFmpegInstallation(): Promise<{ installed: boolean; version?: string; error?: string }> {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
      
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
          await access(filePath);
          await unlink(filePath);
          logger.debug({ path: filePath }, 'Cleaned up temporary file');
        } catch (error) {
          // File may not exist, which is fine
        }
      })
    );
  }
}

// Default FFmpeg processor instance
export const ffmpegProcessor = new FFmpegProcessor();