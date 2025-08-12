import { ApplicationFailure } from '@temporalio/activity';
import { pool } from '../../lib/database';
import { s3Manager } from '../../lib/s3';
import { ffmpegProcessor, VIDEO_PROFILES, TranscodeResult } from '../../lib/media/ffmpeg';
import { whisperProcessor, WHISPER_CONFIGS, TranscriptionResult, SubtitleTrack } from '../../lib/media/whisper';
import { loggers } from '../../lib/logger';
import { withSpan } from '../../lib/otel';
import { promises as metrics } from '../../lib/metrics';
import { createHash } from 'crypto';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { unlink, access } from 'fs/promises';
import path from 'path';
import os from 'os';

const logger = loggers.media.child({ component: 'temporal-activities' });

// =============================================
// Media Processing Activities
// =============================================

export interface ProcessAssetParams {
  assetId: string;
  operation: 'transcode' | 'subtitle' | 'thumbnail' | 'analysis';
  parameters: Record<string, any>;
}

export interface TranscodeParams {
  assetId: string;
  profiles: string[];
  enableSubtitles?: boolean;
  subtitleLanguages?: string[];
}

export interface SubtitleParams {
  assetId: string;
  languages: string[];
  model?: string;
  burnIn?: boolean;
}

export interface ThumbnailParams {
  assetId: string;
  count: number;
  timestamps?: number[]; // Relative timestamps (0.0-1.0)
}

/**
 * Main media processing activity - orchestrates different operations
 */
export async function processAsset(params: ProcessAssetParams): Promise<{ success: boolean; results: any }> {
  return withSpan('activity.process_asset', {
    'media.asset_id': params.assetId,
    'media.operation': params.operation
  }, async (span) => {
    try {
      logger.info({ assetId: params.assetId, operation: params.operation }, 'Starting asset processing');

      let results: any;

      switch (params.operation) {
        case 'transcode':
          results = await transcodeVideo({
            assetId: params.assetId,
            profiles: params.parameters.profiles || ['9x16'],
            enableSubtitles: params.parameters.enableSubtitles,
            subtitleLanguages: params.parameters.subtitleLanguages
          });
          break;

        case 'subtitle':
          results = await generateSubtitles({
            assetId: params.assetId,
            languages: params.parameters.languages || ['en'],
            model: params.parameters.model,
            burnIn: params.parameters.burnIn
          });
          break;

        case 'thumbnail':
          results = await generateThumbnails({
            assetId: params.assetId,
            count: params.parameters.count || 3,
            timestamps: params.parameters.timestamps
          });
          break;

        case 'analysis':
          results = await analyzeMedia(params.assetId);
          break;

        default:
          throw new ApplicationFailure(`Unknown operation: ${params.operation}`, 'InvalidOperation');
      }

      span.setAttributes({
        'media.processing_success': true,
        'media.results_count': Array.isArray(results) ? results.length : 1
      });

      logger.info({
        assetId: params.assetId,
        operation: params.operation,
        results: Array.isArray(results) ? results.length : 1
      }, 'Asset processing completed');

      return { success: true, results };

    } catch (error) {
      span.recordException(error as Error);
      span.setAttributes({ 'media.processing_success': false });

      logger.error({
        err: error,
        assetId: params.assetId,
        operation: params.operation
      }, 'Asset processing failed');

      // Update processing queue with error
      await pool.query(`
        UPDATE media_processing_queue 
        SET status = 'failed', error_message = $1, updated_at = now()
        WHERE asset_id = $2 AND operation_type = $3 AND status = 'processing'
      `, [
        error instanceof Error ? error.message : String(error),
        params.assetId,
        params.operation
      ]);

      throw new ApplicationFailure(
        `Processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'ProcessingError',
        false, // non-retryable
        error
      );
    }
  });
}

/**
 * Transcode video to multiple profiles
 */
export async function transcodeVideo(params: TranscodeParams): Promise<any[]> {
  return withSpan('activity.transcode_video', {
    'media.asset_id': params.assetId,
    'media.profiles': params.profiles.join(',')
  }, async (span) => {
    let downloadedFile: string | null = null;
    const tempFiles: string[] = [];

    try {
      // Get asset details
      const assetResult = await pool.query(`
        SELECT id, s3_url, s3_key, kind, mime_type, file_size_bytes, content_hash
        FROM assets WHERE id = $1
      `, [params.assetId]);

      if (assetResult.rows.length === 0) {
        throw new ApplicationFailure('Asset not found', 'AssetNotFound');
      }

      const asset = assetResult.rows[0];

      if (asset.kind !== 'video') {
        throw new ApplicationFailure('Asset is not a video', 'InvalidAssetType');
      }

      // Download original video from S3
      const tempVideoPath = path.join(os.tmpdir(), `transcode_${params.assetId}_${Date.now()}.${path.extname(asset.s3_key)}`);
      downloadedFile = tempVideoPath;
      
      await downloadFromS3(asset.s3_key, tempVideoPath);
      tempFiles.push(tempVideoPath);

      const results = [];

      // Process each profile
      for (const profileName of params.profiles) {
        const profile = VIDEO_PROFILES[profileName];
        if (!profile) {
          logger.warn({ profileName }, 'Unknown video profile, skipping');
          continue;
        }

        // Check if variant already exists
        const existingVariant = await pool.query(`
          SELECT id FROM variants 
          WHERE asset_id = $1 AND profile = $2 AND status = 'ready'
        `, [params.assetId, profileName]);

        if (existingVariant.rows.length > 0) {
          logger.info({ assetId: params.assetId, profile: profileName }, 'Variant already exists, skipping');
          continue;
        }

        try {
          // Generate output path
          const outputPath = path.join(os.tmpdir(), `variant_${params.assetId}_${profileName}_${Date.now()}.mp4`);
          tempFiles.push(outputPath);

          // Transcode
          const transcodeResult: TranscodeResult = await ffmpegProcessor.transcodeVideo(
            tempVideoPath,
            outputPath,
            {
              profile,
              enableLoudnorm: true,
              outputFormat: 'mp4'
            }
          );

          // Generate S3 key for variant
          const variantKey = s3Manager.generateVariantKey(asset.s3_key, profileName, 'mp4');

          // Upload variant to S3
          const variantBuffer = await readFileToBuffer(outputPath);
          const uploadResult = await s3Manager.putObject(
            variantKey,
            variantBuffer,
            'video/mp4',
            {
              'asset-id': params.assetId,
              'profile': profileName,
              'original-hash': asset.content_hash
            }
          );

          // Calculate variant hash for deduplication
          const variantHash = createHash('sha256')
            .update(`${asset.content_hash}|${profileName}|${transcodeResult.ffmpegCommand}`)
            .digest('hex');

          // Store variant in database
          const variantResult = await pool.query(`
            INSERT INTO variants (
              asset_id, profile, s3_url, s3_bucket, s3_key,
              width, height, bitrate_kbps, duration, file_size_bytes,
              variant_hash, ffmpeg_cmd, processing_time_ms, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id, s3_url
          `, [
            params.assetId,
            profileName,
            uploadResult.location,
            s3Manager.config.bucket,
            variantKey,
            transcodeResult.outputInfo.width,
            transcodeResult.outputInfo.height,
            profile.videoBitrate,
            transcodeResult.outputInfo.duration,
            variantBuffer.length,
            variantHash,
            transcodeResult.ffmpegCommand,
            transcodeResult.processingTimeMs,
            'ready'
          ]);

          results.push({
            variantId: variantResult.rows[0].id,
            profile: profileName,
            url: variantResult.rows[0].s3_url,
            processingTime: transcodeResult.processingTimeMs
          });

          // Record metrics
          metrics.counter('media_transcode_total', { profile: profileName, status: 'success' }).inc();
          metrics.histogram('media_transcode_duration_ms', { profile: profileName }).observe(transcodeResult.processingTimeMs);

          logger.info({
            assetId: params.assetId,
            variantId: variantResult.rows[0].id,
            profile: profileName,
            processingTime: transcodeResult.processingTimeMs
          }, 'Video variant created');

        } catch (error) {
          logger.error({
            err: error,
            assetId: params.assetId,
            profile: profileName
          }, 'Failed to create video variant');

          // Record failed variant
          metrics.counter('media_transcode_total', { profile: profileName, status: 'error' }).inc();

          // Store failed variant record
          await pool.query(`
            INSERT INTO variants (
              asset_id, profile, status, processing_error
            ) VALUES ($1, $2, $3, $4)
          `, [
            params.assetId,
            profileName,
            'failed',
            error instanceof Error ? error.message : String(error)
          ]);
        }
      }

      span.setAttributes({
        'media.variants_created': results.length,
        'media.profiles_requested': params.profiles.length
      });

      return results;

    } finally {
      // Clean up temporary files
      await Promise.allSettled(
        tempFiles.map(file => unlink(file).catch(() => {}))
      );
    }
  });
}

/**
 * Generate subtitles using Whisper
 */
export async function generateSubtitles(params: SubtitleParams): Promise<any[]> {
  return withSpan('activity.generate_subtitles', {
    'media.asset_id': params.assetId,
    'whisper.languages': params.languages.join(',')
  }, async (span) => {
    let downloadedFile: string | null = null;
    const tempFiles: string[] = [];

    try {
      // Get asset details
      const assetResult = await pool.query(`
        SELECT id, s3_url, s3_key, kind, content_hash
        FROM assets WHERE id = $1
      `, [params.assetId]);

      if (assetResult.rows.length === 0) {
        throw new ApplicationFailure('Asset not found', 'AssetNotFound');
      }

      const asset = assetResult.rows[0];

      if (asset.kind !== 'video' && asset.kind !== 'audio') {
        throw new ApplicationFailure('Asset must be video or audio', 'InvalidAssetType');
      }

      // Download original file from S3
      const tempFilePath = path.join(os.tmpdir(), `subtitle_${params.assetId}_${Date.now()}.${path.extname(asset.s3_key)}`);
      downloadedFile = tempFilePath;

      await downloadFromS3(asset.s3_key, tempFilePath);
      tempFiles.push(tempFilePath);

      const results = [];

      // Generate transcription for each language
      for (const language of params.languages) {
        try {
          // Configure Whisper for the language
          const whisperConfig = {
            ...WHISPER_CONFIGS[params.model || 'fast'],
            language: language === 'auto' ? undefined : language
          };

          // Transcribe
          const transcriptionResult: TranscriptionResult = await whisperProcessor.transcribeVideo(
            tempFilePath,
            whisperConfig
          );

          // Generate subtitle tracks
          const subtitleTracks: SubtitleTrack[] = await whisperProcessor.generateSubtitles(
            transcriptionResult,
            ['srt', 'vtt']
          );

          // Process each subtitle format
          for (const track of subtitleTracks) {
            // Upload subtitle file to S3
            const subtitleKey = `${asset.s3_key.replace(/\.[^/.]+$/, '')}_${track.languageCode}.${track.format}`;
            
            const uploadResult = await s3Manager.putObject(
              subtitleKey,
              track.content,
              track.format === 'srt' ? 'text/srt' : 'text/vtt',
              {
                'asset-id': params.assetId,
                'language': track.languageCode,
                'auto-generated': 'true'
              }
            );

            // Find or create variant to attach subtitle to
            const variantResult = await pool.query(`
              SELECT id FROM variants 
              WHERE asset_id = $1 AND profile = 'original'
              LIMIT 1
            `, [params.assetId]);

            let variantId: string;
            
            if (variantResult.rows.length === 0) {
              // Create original variant if it doesn't exist
              const newVariantResult = await pool.query(`
                INSERT INTO variants (
                  asset_id, profile, s3_url, s3_bucket, s3_key, status
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
              `, [
                params.assetId,
                'original',
                asset.s3_url,
                s3Manager.config.bucket,
                asset.s3_key,
                'ready'
              ]);
              variantId = newVariantResult.rows[0].id;
            } else {
              variantId = variantResult.rows[0].id;
            }

            // Store subtitle track
            const subtitleResult = await pool.query(`
              INSERT INTO subtitle_tracks (
                variant_id, language_code, language_name, format,
                s3_url, embedded, auto_generated, confidence_score,
                word_count, character_count, transcription_metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              RETURNING id
            `, [
              variantId,
              track.languageCode,
              track.language,
              track.format,
              uploadResult.location,
              false, // External subtitle file
              true, // Auto-generated by Whisper
              track.confidence,
              track.wordCount,
              track.characterCount,
              JSON.stringify({
                whisperModel: whisperConfig.model,
                processingTime: transcriptionResult.metadata.processingTimeMs,
                segmentsCount: transcriptionResult.segments.length
              })
            ]);

            results.push({
              subtitleId: subtitleResult.rows[0].id,
              language: track.language,
              languageCode: track.languageCode,
              format: track.format,
              url: uploadResult.location,
              confidence: track.confidence,
              wordCount: track.wordCount
            });

            // Clean up temporary subtitle file
            tempFiles.push(track.path);

            logger.info({
              assetId: params.assetId,
              subtitleId: subtitleResult.rows[0].id,
              language: track.language,
              format: track.format,
              confidence: track.confidence
            }, 'Subtitle track created');
          }

          // Record metrics
          metrics.counter('media_subtitle_total', { 
            language: transcriptionResult.language, 
            status: 'success' 
          }).inc();
          metrics.histogram('media_subtitle_duration_ms', {}).observe(transcriptionResult.metadata.processingTimeMs);
          metrics.histogram('media_subtitle_confidence', {}).observe(transcriptionResult.languageConfidence);

        } catch (error) {
          logger.error({
            err: error,
            assetId: params.assetId,
            language
          }, 'Failed to generate subtitles for language');

          metrics.counter('media_subtitle_total', { 
            language: language, 
            status: 'error' 
          }).inc();
        }
      }

      span.setAttributes({
        'whisper.subtitles_created': results.length,
        'whisper.languages_requested': params.languages.length
      });

      return results;

    } finally {
      // Clean up temporary files
      await Promise.allSettled(
        tempFiles.map(file => unlink(file).catch(() => {}))
      );
    }
  });
}

/**
 * Generate video thumbnails
 */
export async function generateThumbnails(params: ThumbnailParams): Promise<any[]> {
  return withSpan('activity.generate_thumbnails', {
    'media.asset_id': params.assetId,
    'media.thumbnail_count': params.count
  }, async () => {
    let downloadedFile: string | null = null;
    const tempFiles: string[] = [];

    try {
      // Get asset details
      const assetResult = await pool.query(`
        SELECT id, s3_url, s3_key, kind, processing_metadata
        FROM assets WHERE id = $1
      `, [params.assetId]);

      if (assetResult.rows.length === 0) {
        throw new ApplicationFailure('Asset not found', 'AssetNotFound');
      }

      const asset = assetResult.rows[0];

      if (asset.kind !== 'video') {
        throw new ApplicationFailure('Asset must be video', 'InvalidAssetType');
      }

      // Download original video from S3
      const tempVideoPath = path.join(os.tmpdir(), `thumbnail_${params.assetId}_${Date.now()}.${path.extname(asset.s3_key)}`);
      downloadedFile = tempVideoPath;

      await downloadFromS3(asset.s3_key, tempVideoPath);
      tempFiles.push(tempVideoPath);

      // Get video info
      const videoInfo = await ffmpegProcessor.getVideoInfo(tempVideoPath);
      const duration = videoInfo.duration;

      // Generate timestamps if not provided
      const timestamps = params.timestamps || 
        Array.from({ length: params.count }, (_, i) => (i + 1) / (params.count + 1));

      const results = [];

      // Generate thumbnails
      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = Math.min(timestamps[i] * duration, duration - 1);
        const thumbnailPath = path.join(os.tmpdir(), `thumbnail_${params.assetId}_${i}_${Date.now()}.jpg`);
        tempFiles.push(thumbnailPath);

        // Extract frame at timestamp
        const command = [
          'ffmpeg', '-y',
          `-i "${tempVideoPath}"`,
          `-ss ${timestamp}`,
          '-vframes 1',
          '-q:v 2', // High quality JPEG
          '-vf scale=320:240', // Standard thumbnail size
          `"${thumbnailPath}"`
        ].join(' ');

        await ffmpegProcessor.executeCommand(command);

        // Upload thumbnail to S3
        const thumbnailBuffer = await readFileToBuffer(thumbnailPath);
        const thumbnailKey = `${asset.s3_key.replace(/\.[^/.]+$/, '')}_thumb_${i}.jpg`;

        const uploadResult = await s3Manager.putObject(
          thumbnailKey,
          thumbnailBuffer,
          'image/jpeg',
          {
            'asset-id': params.assetId,
            'thumbnail-index': i.toString(),
            'timestamp': timestamp.toString()
          }
        );

        results.push({
          index: i,
          timestamp,
          url: uploadResult.location,
          size: thumbnailBuffer.length
        });

        logger.debug({
          assetId: params.assetId,
          index: i,
          timestamp,
          url: uploadResult.location
        }, 'Thumbnail generated');
      }

      // Update asset metadata with thumbnail info
      const currentMetadata = asset.processing_metadata || {};
      await pool.query(`
        UPDATE assets 
        SET processing_metadata = $1, updated_at = now()
        WHERE id = $2
      `, [
        JSON.stringify({
          ...currentMetadata,
          thumbnails: results
        }),
        params.assetId
      ]);

      logger.info({
        assetId: params.assetId,
        thumbnailsGenerated: results.length
      }, 'Thumbnails generated');

      return results;

    } finally {
      // Clean up temporary files
      await Promise.allSettled(
        tempFiles.map(file => unlink(file).catch(() => {}))
      );
    }
  });
}

/**
 * Analyze media file (extract metadata, technical info)
 */
export async function analyzeMedia(assetId: string): Promise<any> {
  return withSpan('activity.analyze_media', {
    'media.asset_id': assetId
  }, async () => {
    let downloadedFile: string | null = null;

    try {
      // Get asset details
      const assetResult = await pool.query(`
        SELECT id, s3_url, s3_key, kind
        FROM assets WHERE id = $1
      `, [assetId]);

      if (assetResult.rows.length === 0) {
        throw new ApplicationFailure('Asset not found', 'AssetNotFound');
      }

      const asset = assetResult.rows[0];

      // Download file for analysis
      const tempFilePath = path.join(os.tmpdir(), `analyze_${assetId}_${Date.now()}.${path.extname(asset.s3_key)}`);
      downloadedFile = tempFilePath;

      await downloadFromS3(asset.s3_key, tempFilePath);

      let analysisResult: any = {};

      if (asset.kind === 'video') {
        // Analyze video
        const videoInfo = await ffmpegProcessor.getVideoInfo(tempFilePath);
        analysisResult = {
          ...videoInfo,
          type: 'video'
        };
      } else if (asset.kind === 'image') {
        // Analyze image with ffprobe
        const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempFilePath}"`;
        const { execAsync } = require('util').promisify(require('child_process').exec);
        const { stdout } = await execAsync(command);
        const probe = JSON.parse(stdout);
        
        const videoStream = probe.streams.find((s: any) => s.codec_type === 'video');
        analysisResult = {
          width: parseInt(videoStream?.width || '0'),
          height: parseInt(videoStream?.height || '0'),
          format: probe.format.format_name,
          type: 'image'
        };
      }

      // Update asset with analysis results
      await pool.query(`
        UPDATE assets 
        SET processing_metadata = $1, 
            width = $2, 
            height = $3, 
            duration = $4,
            updated_at = now()
        WHERE id = $5
      `, [
        JSON.stringify(analysisResult),
        analysisResult.width || null,
        analysisResult.height || null,
        analysisResult.duration || null,
        assetId
      ]);

      logger.info({
        assetId,
        analysis: analysisResult
      }, 'Media analysis completed');

      return analysisResult;

    } finally {
      // Clean up temporary file
      if (downloadedFile) {
        await unlink(downloadedFile).catch(() => {});
      }
    }
  });
}

// =============================================
// Helper Functions
// =============================================

async function downloadFromS3(s3Key: string, localPath: string): Promise<void> {
  const stream = await s3Manager.getObject(s3Key);
  if (!stream) {
    throw new Error('Failed to get object from S3');
  }

  const writeStream = createWriteStream(localPath);
  await pipeline(stream, writeStream);
}

async function readFileToBuffer(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const readStream = createReadStream(filePath);
    
    readStream.on('data', chunk => chunks.push(chunk));
    readStream.on('end', () => resolve(Buffer.concat(chunks)));
    readStream.on('error', reject);
  });
}