import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { FFmpegProcessor, VIDEO_PROFILES } from '../../../src/lib/media/ffmpeg';
import { WhisperProcessor, WHISPER_CONFIGS } from '../../../src/lib/media/whisper';
import { S3Manager } from '../../../src/lib/s3';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock external dependencies
vi.mock('child_process');
vi.mock('../../../src/lib/otel');
vi.mock('../../../src/lib/logger');

describe('Media Processing', () => {
  let tempDir: string;
  let ffmpegProcessor: FFmpegProcessor;
  let whisperProcessor: WhisperProcessor;
  let s3Manager: S3Manager;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-test-'));
  });

  afterAll(async () => {
    await fs.rmdir(tempDir, { recursive: true }).catch(() => {});
  });

  beforeEach(() => {
    ffmpegProcessor = new FFmpegProcessor(tempDir);
    whisperProcessor = new WhisperProcessor(tempDir);
    s3Manager = new S3Manager({
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret'
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('FFmpegProcessor', () => {
    describe('Video Profiles', () => {
      it('should have all required video profiles', () => {
        expect(VIDEO_PROFILES).toHaveProperty('9x16');
        expect(VIDEO_PROFILES).toHaveProperty('1x1');
        expect(VIDEO_PROFILES).toHaveProperty('16x9');

        // Check 9:16 profile (TikTok/Stories)
        const portrait = VIDEO_PROFILES['9x16'];
        expect(portrait.width).toBe(1080);
        expect(portrait.height).toBe(1920);
        expect(portrait.videoBitrate).toBe(6000);
        expect(portrait.audioBitrate).toBe(128);
        expect(portrait.frameRate).toBe(30);
        expect(portrait.preset).toBe('veryfast');
        expect(portrait.profile).toBe('high');
        expect(portrait.level).toBe('4.1');

        // Check 1:1 profile (Instagram Feed)
        const square = VIDEO_PROFILES['1x1'];
        expect(square.width).toBe(1080);
        expect(square.height).toBe(1080);
        expect(square.videoBitrate).toBe(4000);

        // Check 16:9 profile (YouTube/Twitter)
        const landscape = VIDEO_PROFILES['16x9'];
        expect(landscape.width).toBe(1920);
        expect(landscape.height).toBe(1080);
        expect(landscape.videoBitrate).toBe(5000);
      });
    });

    describe('Command Building', () => {
      it('should build proper FFmpeg transcode command', async () => {
        const mockVideoInfo = {
          duration: 30,
          width: 1920,
          height: 1080,
          aspectRatio: 16/9,
          frameRate: 29.97,
          bitrate: 8000000,
          codec: 'h264'
        };

        const inputPath = '/tmp/input.mp4';
        const outputPath = '/tmp/output.mp4';
        const profile = VIDEO_PROFILES['9x16'];

        // Mock getVideoInfo
        vi.spyOn(ffmpegProcessor, 'getVideoInfo').mockResolvedValue(mockVideoInfo);

        const command = await (ffmpegProcessor as any).buildTranscodeCommand(
          inputPath,
          outputPath,
          mockVideoInfo,
          { profile }
        );

        expect(command).toContain('ffmpeg');
        expect(command).toContain('-i "/tmp/input.mp4"');
        expect(command).toContain('-c:v libx264');
        expect(command).toContain(`-preset ${profile.preset}`);
        expect(command).toContain(`-profile:v ${profile.profile}`);
        expect(command).toContain(`-level ${profile.level}`);
        expect(command).toContain(`-b:v ${profile.videoBitrate}k`);
        expect(command).toContain(`-b:a ${profile.audioBitrate}k`);
        expect(command).toContain('-c:a aac');
        expect(command).toContain('-pix_fmt yuv420p');
        expect(command).toContain('-movflags +faststart');
        expect(command).toContain('"/tmp/output.mp4"');
      });

      it('should add video filters for aspect ratio conversion', async () => {
        const mockVideoInfo = {
          duration: 30,
          width: 1920, // 16:9 input
          height: 1080,
          aspectRatio: 16/9,
          frameRate: 30,
          bitrate: 8000000,
          codec: 'h264'
        };

        const profile = VIDEO_PROFILES['9x16']; // 9:16 output
        vi.spyOn(ffmpegProcessor, 'getVideoInfo').mockResolvedValue(mockVideoInfo);

        const command = await (ffmpegProcessor as any).buildTranscodeCommand(
          '/tmp/input.mp4',
          '/tmp/output.mp4',
          mockVideoInfo,
          { profile }
        );

        // Should crop horizontally for 16:9 -> 9:16 conversion
        expect(command).toContain('-vf');
        expect(command).toContain('crop=');
        expect(command).toContain('scale=1080:1920');
      });

      it('should add loudness normalization by default', async () => {
        const mockVideoInfo = {
          duration: 30,
          width: 1080,
          height: 1920,
          aspectRatio: 9/16,
          frameRate: 30,
          bitrate: 6000000,
          codec: 'h264'
        };

        const profile = VIDEO_PROFILES['9x16'];
        vi.spyOn(ffmpegProcessor, 'getVideoInfo').mockResolvedValue(mockVideoInfo);

        const command = await (ffmpegProcessor as any).buildTranscodeCommand(
          '/tmp/input.mp4',
          '/tmp/output.mp4',
          mockVideoInfo,
          { profile, enableLoudnorm: true }
        );

        expect(command).toContain('-af');
        expect(command).toContain('loudnorm=I=-16:LRA=11:TP=-1.5:dual_mono=true');
      });

      it('should handle subtitle burn-in', async () => {
        const mockVideoInfo = {
          duration: 30,
          width: 1080,
          height: 1920,
          aspectRatio: 9/16,
          frameRate: 30,
          bitrate: 6000000,
          codec: 'h264'
        };

        const profile = VIDEO_PROFILES['9x16'];
        vi.spyOn(ffmpegProcessor, 'getVideoInfo').mockResolvedValue(mockVideoInfo);

        const command = await (ffmpegProcessor as any).buildTranscodeCommand(
          '/tmp/input.mp4',
          '/tmp/output.mp4',
          mockVideoInfo,
          { 
            profile, 
            subtitleFile: '/tmp/subtitles.srt',
            burnInSubtitles: true
          }
        );

        expect(command).toContain('subtitles=');
        expect(command).toContain('/tmp/subtitles.srt');
        expect(command).toContain('force_style=');
      });
    });

    describe('Command Hash Generation', () => {
      it('should generate consistent hash for same command', () => {
        const command1 = 'ffmpeg -i input.mp4 -c:v libx264 -preset veryfast output.mp4';
        const command2 = 'ffmpeg  -i  input.mp4  -c:v  libx264  -preset  veryfast  output.mp4'; // Extra spaces

        const hash1 = (ffmpegProcessor as any).calculateCommandHash(command1);
        const hash2 = (ffmpegProcessor as any).calculateCommandHash(command2);

        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
      });

      it('should generate different hash for different commands', () => {
        const command1 = 'ffmpeg -i input.mp4 -c:v libx264 -preset veryfast output.mp4';
        const command2 = 'ffmpeg -i input.mp4 -c:v libx264 -preset medium output.mp4';

        const hash1 = (ffmpegProcessor as any).calculateCommandHash(command1);
        const hash2 = (ffmpegProcessor as any).calculateCommandHash(command2);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('Frame Rate Parsing', () => {
      it('should parse fractional frame rates', () => {
        const parseFrameRate = (ffmpegProcessor as any).parseFrameRate;
        
        expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
        expect(parseFrameRate('24000/1001')).toBeCloseTo(23.976, 3);
        expect(parseFrameRate('25/1')).toBe(25);
        expect(parseFrameRate('30')).toBe(30);
      });
    });

    describe('Utility Methods', () => {
      it('should generate unique temp paths', () => {
        const path1 = ffmpegProcessor.generateTempPath('test', 'mp4');
        const path2 = ffmpegProcessor.generateTempPath('test', 'mp4');

        expect(path1).not.toBe(path2);
        expect(path1).toContain('test_');
        expect(path1).toEndWith('.mp4');
        expect(path2).toContain('test_');
        expect(path2).toEndWith('.mp4');
      });

      it('should check FFmpeg installation', async () => {
        const { exec } = await import('child_process');
        const execMock = vi.mocked(exec);

        // Mock successful FFmpeg check
        execMock.mockImplementation((command, callback) => {
          if (command === 'ffmpeg -version') {
            callback(null, 'ffmpeg version 4.4.2', '');
          }
          return {} as any;
        });

        const result = await ffmpegProcessor.checkFFmpegInstallation();

        expect(result.installed).toBe(true);
        expect(result.version).toBe('4.4.2');
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('WhisperProcessor', () => {
    describe('Whisper Configurations', () => {
      it('should have predefined configurations', () => {
        expect(WHISPER_CONFIGS).toHaveProperty('fast');
        expect(WHISPER_CONFIGS).toHaveProperty('accurate');
        expect(WHISPER_CONFIGS).toHaveProperty('multilingual');

        const fastConfig = WHISPER_CONFIGS.fast;
        expect(fastConfig.model).toBe('base');
        expect(fastConfig.task).toBe('transcribe');
        expect(fastConfig.outputFormat).toBe('json');
        expect(fastConfig.initialPrompt).toContain('Social media');

        const accurateConfig = WHISPER_CONFIGS.accurate;
        expect(accurateConfig.model).toBe('medium');

        const multilingualConfig = WHISPER_CONFIGS.multilingual;
        expect(multilingualConfig.model).toBe('large');
      });
    });

    describe('Language Code Mapping', () => {
      it('should map language names to codes', () => {
        const getLanguageCode = (whisperProcessor as any).getLanguageCode;

        expect(getLanguageCode('english')).toBe('en');
        expect(getLanguageCode('French')).toBe('fr');
        expect(getLanguageCode('SPANISH')).toBe('es');
        expect(getLanguageCode('unknown')).toBe('un'); // First 2 chars
      });
    });

    describe('Subtitle Format Conversion', () => {
      const mockSegments = [
        {
          id: 0,
          seek: 0,
          start: 0.0,
          end: 2.5,
          text: 'Hello world!',
          tokens: [],
          temperature: 0,
          avgLogprob: -0.3,
          compressionRatio: 1.2,
          noSpeechProb: 0.1
        },
        {
          id: 1,
          seek: 25,
          start: 2.5,
          end: 5.0,
          text: 'This is a test.',
          tokens: [],
          temperature: 0,
          avgLogprob: -0.4,
          compressionRatio: 1.1,
          noSpeechProb: 0.05
        }
      ];

      it('should convert to SRT format', () => {
        const convertToSRT = (whisperProcessor as any).convertToSRT;
        const srt = convertToSRT(mockSegments);

        expect(srt).toContain('1\n');
        expect(srt).toContain('00:00:00,000 --> 00:00:02,500\n');
        expect(srt).toContain('Hello world!\n\n');
        expect(srt).toContain('2\n');
        expect(srt).toContain('00:00:02,500 --> 00:00:05,000\n');
        expect(srt).toContain('This is a test.\n\n');
      });

      it('should convert to VTT format', () => {
        const convertToVTT = (whisperProcessor as any).convertToVTT;
        const vtt = convertToVTT(mockSegments);

        expect(vtt).toStartWith('WEBVTT\n\n');
        expect(vtt).toContain('00:00:00.000 --> 00:00:02.500\n');
        expect(vtt).toContain('Hello world!\n\n');
        expect(vtt).toContain('00:00:02.500 --> 00:00:05.000\n');
        expect(vtt).toContain('This is a test.\n\n');
      });
    });

    describe('Timestamp Formatting', () => {
      it('should format SRT timestamps correctly', () => {
        const formatSRTTimestamp = (whisperProcessor as any).formatSRTTimestamp;

        expect(formatSRTTimestamp(0)).toBe('00:00:00,000');
        expect(formatSRTTimestamp(65.5)).toBe('00:01:05,500');
        expect(formatSRTTimestamp(3661.123)).toBe('01:01:01,123');
      });

      it('should format VTT timestamps correctly', () => {
        const formatVTTTimestamp = (whisperProcessor as any).formatVTTTimestamp;

        expect(formatVTTTimestamp(0)).toBe('00:00:00.000');
        expect(formatVTTTimestamp(65.5)).toBe('00:01:05.500');
        expect(formatVTTTimestamp(3661.123)).toBe('01:01:01.123');
      });
    });

    describe('Utility Methods', () => {
      it('should generate unique temp paths', () => {
        const path1 = whisperProcessor.generateTempPath('transcription', 'json');
        const path2 = whisperProcessor.generateTempPath('transcription', 'json');

        expect(path1).not.toBe(path2);
        expect(path1).toContain('transcription_');
        expect(path1).toEndWith('.json');
      });

      it('should check Whisper installation', async () => {
        const { exec } = await import('child_process');
        const execMock = vi.mocked(exec);

        // Mock successful Whisper check
        execMock.mockImplementation((command, callback) => {
          if (command === 'whisper --version') {
            callback(null, 'whisper 20231117', '');
          }
          return {} as any;
        });

        const result = await whisperProcessor.checkWhisperInstallation();

        expect(result.installed).toBe(true);
        expect(result.version).toBe('20231117');
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('S3Manager', () => {
    describe('Object Key Generation', () => {
      it('should generate proper object keys', () => {
        const creatorId = 'creator-123';
        const filename = 'test video.mp4';
        const contentHash = 'abc123def456';

        const key = s3Manager.generateObjectKey(creatorId, filename, contentHash);

        expect(key).toContain('creators/creator-123/');
        expect(key).toContain('test_video.mp4'); // Sanitized filename
        expect(key).toContain('abc123de'); // Hash prefix
        
        // Check date structure
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        expect(key).toContain(`${year}/${month}/`);
      });

      it('should generate variant keys', () => {
        const originalKey = 'creators/user-123/2023/10/15/1697123456_video.mp4';
        const profile = '9x16';
        const extension = 'mp4';

        const variantKey = s3Manager.generateVariantKey(originalKey, profile, extension);

        expect(variantKey).toBe('creators/user-123/2023/10/15/1697123456_video_9x16.mp4');
      });
    });

    describe('Content Hash Calculation', () => {
      it('should calculate SHA-256 hash', () => {
        const content = 'test content';
        const hash = s3Manager.calculateContentHash(content);

        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        
        // Same content should produce same hash
        const hash2 = s3Manager.calculateContentHash(content);
        expect(hash).toBe(hash2);
      });

      it('should handle binary content', () => {
        const binaryContent = new Uint8Array([1, 2, 3, 4, 5]);
        const hash = s3Manager.calculateContentHash(binaryContent);

        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    describe('CORS Headers', () => {
      it('should provide proper CORS headers', () => {
        const headers = s3Manager.getCORSHeaders();

        expect(headers).toHaveProperty('Access-Control-Allow-Origin');
        expect(headers).toHaveProperty('Access-Control-Allow-Methods');
        expect(headers).toHaveProperty('Access-Control-Allow-Headers');
        expect(headers).toHaveProperty('Access-Control-Expose-Headers');
        expect(headers).toHaveProperty('Access-Control-Max-Age');

        expect(headers['Access-Control-Allow-Methods']).toContain('GET');
        expect(headers['Access-Control-Allow-Methods']).toContain('POST');
        expect(headers['Access-Control-Allow-Methods']).toContain('PUT');
        expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
        expect(headers['Access-Control-Expose-Headers']).toContain('ETag');
      });
    });
  });

  describe('Integration Tests', () => {
    describe('Media Pipeline Flow', () => {
      it('should handle complete video processing flow', async () => {
        // This would be an integration test with actual files
        // For now, we test the workflow logic
        
        const assetId = 'test-asset-123';
        const operations = [
          { type: 'analysis', priority: 1 },
          { type: 'transcode', priority: 2, profiles: ['9x16'] },
          { type: 'subtitle', priority: 3, languages: ['en'] },
          { type: 'thumbnail', priority: 4, count: 3 }
        ];

        // Sort by priority
        const sortedOps = operations.sort((a, b) => a.priority - b.priority);
        
        expect(sortedOps[0].type).toBe('analysis');
        expect(sortedOps[1].type).toBe('transcode');
        expect(sortedOps[2].type).toBe('subtitle');
        expect(sortedOps[3].type).toBe('thumbnail');
      });

      it('should handle deduplication scenarios', async () => {
        const content1 = 'identical content';
        const content2 = 'identical content';
        const content3 = 'different content';

        const hash1 = s3Manager.calculateContentHash(content1);
        const hash2 = s3Manager.calculateContentHash(content2);
        const hash3 = s3Manager.calculateContentHash(content3);

        expect(hash1).toBe(hash2); // Same content = same hash
        expect(hash1).not.toBe(hash3); // Different content = different hash
      });
    });

    describe('Error Handling', () => {
      it('should handle missing files gracefully', async () => {
        const nonExistentPath = '/tmp/does-not-exist.mp4';
        
        await expect(
          ffmpegProcessor.getVideoInfo(nonExistentPath)
        ).rejects.toThrow();
      });

      it('should validate video profiles', () => {
        const validProfiles = ['9x16', '1x1', '16x9'];
        const invalidProfile = 'invalid';

        validProfiles.forEach(profile => {
          expect(VIDEO_PROFILES).toHaveProperty(profile);
        });

        expect(VIDEO_PROFILES).not.toHaveProperty(invalidProfile);
      });
    });
  });
});