import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { s3Manager } from '../lib/s3';
import { validateRequest } from '../middleware/validateRequest';
import { requireAuth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimit';
import { loggers } from '../lib/logger';
import { withSpan } from '../lib/otel';
import { pool } from '../lib/database';
import { promises as metrics } from '../lib/metrics';
import path from 'path';
import { createHash } from 'crypto';

const router = Router();
const logger = loggers.media;

// Configure multer for in-memory upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Allowed MIME types for media upload
    const allowedTypes = [
      'video/mp4',
      'video/quicktime',
      'video/avi',
      'video/webm',
      'video/x-msvideo',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'audio/mpeg',
      'audio/wav',
      'audio/m4a'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

// =============================================
// Validation Schemas
// =============================================

const initMultipartUploadSchema = z.object({
  body: z.object({
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1),
    fileSize: z.number().positive(),
    metadata: z.record(z.string()).optional()
  })
});

const completeMultipartUploadSchema = z.object({
  body: z.object({
    parts: z.array(z.object({
      partNumber: z.number().positive(),
      etag: z.string().min(1),
      size: z.number().positive()
    }))
  })
});

const processMediaSchema = z.object({
  body: z.object({
    profiles: z.array(z.enum(['9x16', '1x1', '16x9', 'thumbnail'])).optional(),
    generateSubtitles: z.boolean().optional().default(false),
    subtitleLanguages: z.array(z.string()).optional().default(['en']),
    priority: z.number().min(1).max(10).optional().default(5)
  })
});

// =============================================
// Direct Upload Routes
// =============================================

/**
 * Direct single-file upload for small files (< 100MB)
 */
router.post('/upload',
  requireAuth,
  rateLimiter({ windowMs: 60000, max: 10 }), // 10 uploads per minute
  upload.single('file'),
  async (req, res) => {
    return withSpan('media.direct_upload', {
      'user.id': req.user!.id,
      'media.filename': req.file?.originalname || 'unknown'
    }, async (span) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file provided' });
        }

        const { originalname, mimetype, buffer, size } = req.file;
        const creatorId = req.user!.id;

        // Calculate content hash for deduplication
        const contentHash = createHash('sha256').update(buffer).digest('hex');

        // Check if we already have this content
        const existingAsset = await pool.query(
          'SELECT id, s3_url FROM assets WHERE content_hash = $1 AND creator_id = $2',
          [contentHash, creatorId]
        );

        if (existingAsset.rows.length > 0) {
          logger.info({
            contentHash,
            existingAssetId: existingAsset.rows[0].id,
            filename: originalname
          }, 'File already exists, returning existing asset');

          return res.json({
            asset: {
              id: existingAsset.rows[0].id,
              url: existingAsset.rows[0].s3_url,
              duplicate: true
            }
          });
        }

        // Generate S3 key
        const s3Key = s3Manager.generateObjectKey(creatorId, originalname, contentHash);
        
        // Upload to S3
        const uploadResult = await s3Manager.putObject(
          s3Key,
          buffer,
          mimetype,
          {
            'creator-id': creatorId,
            'original-filename': originalname,
            'content-hash': contentHash
          }
        );

        // Determine media kind
        const kind = mimetype.startsWith('video/') ? 'video' : 
                    mimetype.startsWith('image/') ? 'image' : 'audio';

        // Store asset in database
        const assetResult = await pool.query(`
          INSERT INTO assets (
            creator_id, kind, original_filename, mime_type,
            s3_url, s3_bucket, s3_key, file_size_bytes, content_hash,
            upload_metadata, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, s3_url, created_at
        `, [
          creatorId,
          kind,
          originalname,
          mimetype,
          uploadResult.location,
          s3Manager.config.bucket,
          s3Key,
          size,
          contentHash,
          JSON.stringify({ uploadMethod: 'direct' }),
          'uploaded'
        ]);

        const asset = assetResult.rows[0];

        span.setAttributes({
          'media.asset_id': asset.id,
          'media.kind': kind,
          'media.size_bytes': size,
          'media.content_hash': contentHash
        });

        // Record metrics
        metrics.counter('media_upload_total', { method: 'direct', kind }).inc();
        metrics.histogram('media_upload_size_bytes', { method: 'direct' }).observe(size);

        logger.info({
          assetId: asset.id,
          filename: originalname,
          kind,
          size,
          s3Key
        }, 'Direct upload completed');

        res.json({
          asset: {
            id: asset.id,
            url: asset.s3_url,
            kind,
            filename: originalname,
            size,
            uploadedAt: asset.created_at
          }
        });

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ err: error }, 'Direct upload failed');
        
        res.status(500).json({
          error: 'Upload failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
);

// =============================================
// Multipart Upload Routes
// =============================================

/**
 * Initialize multipart upload for large files
 */
router.post('/multipart/init',
  requireAuth,
  validateRequest(initMultipartUploadSchema),
  async (req, res) => {
    return withSpan('media.init_multipart_upload', {
      'user.id': req.user!.id,
      'media.filename': req.body.filename
    }, async (span) => {
      try {
        const { filename, contentType, fileSize, metadata = {} } = req.body;
        const creatorId = req.user!.id;

        // Generate S3 key
        const s3Key = s3Manager.generateObjectKey(creatorId, filename);

        // Initialize multipart upload in S3
        const uploadSession = await s3Manager.initiateMultipartUpload(
          s3Key,
          contentType,
          {
            'creator-id': creatorId,
            'original-filename': filename,
            ...metadata
          }
        );

        // Store session in database
        const sessionResult = await pool.query(`
          INSERT INTO upload_sessions (
            creator_id, upload_id, s3_bucket, s3_key, filename,
            mime_type, total_size_bytes, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, upload_id, expires_at
        `, [
          creatorId,
          uploadSession.uploadId,
          uploadSession.bucket,
          uploadSession.key,
          filename,
          contentType,
          fileSize,
          'active'
        ]);

        const session = sessionResult.rows[0];

        span.setAttributes({
          'upload.session_id': session.id,
          'upload.upload_id': uploadSession.uploadId,
          'media.size_bytes': fileSize
        });

        logger.info({
          sessionId: session.id,
          uploadId: uploadSession.uploadId,
          filename,
          fileSize,
          s3Key
        }, 'Multipart upload initiated');

        res.json({
          sessionId: session.id,
          uploadId: uploadSession.uploadId,
          expiresAt: session.expires_at
        });

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ err: error }, 'Failed to initialize multipart upload');
        
        res.status(500).json({
          error: 'Failed to initialize upload',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
);

/**
 * Generate presigned URL for uploading a part
 */
router.post('/multipart/:sessionId/part/:partNumber',
  requireAuth,
  async (req, res) => {
    return withSpan('media.get_upload_part_url', {
      'user.id': req.user!.id,
      'upload.session_id': req.params.sessionId,
      'upload.part_number': req.params.partNumber
    }, async () => {
      try {
        const sessionId = req.params.sessionId;
        const partNumber = parseInt(req.params.partNumber);
        const creatorId = req.user!.id;

        if (!partNumber || partNumber < 1 || partNumber > 10000) {
          return res.status(400).json({ error: 'Invalid part number' });
        }

        // Get upload session
        const sessionResult = await pool.query(`
          SELECT upload_id, s3_bucket, s3_key, status, expires_at
          FROM upload_sessions
          WHERE id = $1 AND creator_id = $2 AND status = 'active'
        `, [sessionId, creatorId]);

        if (sessionResult.rows.length === 0) {
          return res.status(404).json({ error: 'Upload session not found or expired' });
        }

        const session = sessionResult.rows[0];

        // Check expiration
        if (new Date(session.expires_at) < new Date()) {
          await pool.query(
            'UPDATE upload_sessions SET status = $1 WHERE id = $2',
            ['expired', sessionId]
          );
          return res.status(410).json({ error: 'Upload session expired' });
        }

        // Generate presigned URL for this part
        const presignedUrl = await s3Manager.generatePresignedUploadPartUrl(
          {
            uploadId: session.upload_id,
            key: session.s3_key,
            bucket: session.s3_bucket
          },
          partNumber,
          3600 // 1 hour expiration
        );

        res.json({
          presignedUrl,
          partNumber,
          expiresIn: 3600
        });

      } catch (error) {
        logger.error({ err: error }, 'Failed to generate part upload URL');
        
        res.status(500).json({
          error: 'Failed to generate upload URL',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
);

/**
 * Complete multipart upload
 */
router.post('/multipart/:sessionId/complete',
  requireAuth,
  validateRequest(completeMultipartUploadSchema),
  async (req, res) => {
    return withSpan('media.complete_multipart_upload', {
      'user.id': req.user!.id,
      'upload.session_id': req.params.sessionId
    }, async (span) => {
      try {
        const sessionId = req.params.sessionId;
        const { parts } = req.body;
        const creatorId = req.user!.id;

        // Get upload session
        const sessionResult = await pool.query(`
          SELECT upload_id, s3_bucket, s3_key, filename, mime_type, 
                 total_size_bytes, status
          FROM upload_sessions
          WHERE id = $1 AND creator_id = $2 AND status = 'active'
        `, [sessionId, creatorId]);

        if (sessionResult.rows.length === 0) {
          return res.status(404).json({ error: 'Upload session not found' });
        }

        const session = sessionResult.rows[0];

        // Complete multipart upload in S3
        const uploadResult = await s3Manager.completeMultipartUpload(
          {
            uploadId: session.upload_id,
            key: session.s3_key,
            bucket: session.s3_bucket
          },
          parts.map(part => ({
            partNumber: part.partNumber,
            etag: part.etag,
            size: part.size
          }))
        );

        // Calculate total size and content hash (approximate)
        const totalSize = parts.reduce((sum, part) => sum + part.size, 0);
        const contentHash = createHash('sha256')
          .update(`${session.s3_key}-${totalSize}-${uploadResult.etag}`)
          .digest('hex');

        // Determine media kind
        const kind = session.mime_type.startsWith('video/') ? 'video' : 
                    session.mime_type.startsWith('image/') ? 'image' : 'audio';

        // Create asset record
        const assetResult = await pool.query(`
          INSERT INTO assets (
            creator_id, kind, original_filename, mime_type,
            s3_url, s3_bucket, s3_key, file_size_bytes, content_hash,
            upload_metadata, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, s3_url, created_at
        `, [
          creatorId,
          kind,
          session.filename,
          session.mime_type,
          uploadResult.location,
          uploadResult.bucket,
          uploadResult.key,
          totalSize,
          contentHash,
          JSON.stringify({ 
            uploadMethod: 'multipart',
            parts: parts.length,
            sessionId 
          }),
          'uploaded'
        ]);

        const asset = assetResult.rows[0];

        // Mark session as completed
        await pool.query(
          'UPDATE upload_sessions SET status = $1, updated_at = now() WHERE id = $2',
          ['completed', sessionId]
        );

        span.setAttributes({
          'media.asset_id': asset.id,
          'media.kind': kind,
          'media.size_bytes': totalSize,
          'upload.parts_count': parts.length
        });

        // Record metrics
        metrics.counter('media_upload_total', { method: 'multipart', kind }).inc();
        metrics.histogram('media_upload_size_bytes', { method: 'multipart' }).observe(totalSize);
        metrics.histogram('media_upload_parts', {}).observe(parts.length);

        logger.info({
          assetId: asset.id,
          sessionId,
          filename: session.filename,
          kind,
          totalSize,
          partsCount: parts.length
        }, 'Multipart upload completed');

        res.json({
          asset: {
            id: asset.id,
            url: asset.s3_url,
            kind,
            filename: session.filename,
            size: totalSize,
            uploadedAt: asset.created_at
          }
        });

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ err: error }, 'Failed to complete multipart upload');
        
        res.status(500).json({
          error: 'Failed to complete upload',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
);

/**
 * Abort multipart upload
 */
router.delete('/multipart/:sessionId',
  requireAuth,
  async (req, res) => {
    try {
      const sessionId = req.params.sessionId;
      const creatorId = req.user!.id;

      // Get upload session
      const sessionResult = await pool.query(`
        SELECT upload_id, s3_bucket, s3_key, status
        FROM upload_sessions
        WHERE id = $1 AND creator_id = $2
      `, [sessionId, creatorId]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Upload session not found' });
      }

      const session = sessionResult.rows[0];

      // Abort multipart upload in S3 if still active
      if (session.status === 'active') {
        await s3Manager.abortMultipartUpload({
          uploadId: session.upload_id,
          key: session.s3_key,
          bucket: session.s3_bucket
        });
      }

      // Mark session as aborted
      await pool.query(
        'UPDATE upload_sessions SET status = $1, updated_at = now() WHERE id = $2',
        ['aborted', sessionId]
      );

      logger.info({ sessionId }, 'Multipart upload aborted');

      res.json({ message: 'Upload aborted successfully' });

    } catch (error) {
      logger.error({ err: error }, 'Failed to abort multipart upload');
      
      res.status(500).json({
        error: 'Failed to abort upload',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// =============================================
// Media Processing Routes
// =============================================

/**
 * Process uploaded media (transcode, generate subtitles, etc.)
 */
router.post('/:assetId/process',
  requireAuth,
  validateRequest(processMediaSchema),
  async (req, res) => {
    return withSpan('media.process', {
      'user.id': req.user!.id,
      'media.asset_id': req.params.assetId
    }, async (span) => {
      try {
        const assetId = req.params.assetId;
        const { profiles = ['9x16'], generateSubtitles = false, subtitleLanguages = ['en'], priority = 5 } = req.body;
        const creatorId = req.user!.id;

        // Get asset
        const assetResult = await pool.query(`
          SELECT id, creator_id, kind, s3_url, status
          FROM assets
          WHERE id = $1 AND creator_id = $2
        `, [assetId, creatorId]);

        if (assetResult.rows.length === 0) {
          return res.status(404).json({ error: 'Asset not found' });
        }

        const asset = assetResult.rows[0];

        if (asset.status !== 'uploaded') {
          return res.status(400).json({ error: 'Asset not ready for processing' });
        }

        // Create processing jobs
        const jobs = [];

        // Video transcoding jobs
        if (asset.kind === 'video') {
          for (const profile of profiles) {
            const jobResult = await pool.query(`
              INSERT INTO media_processing_queue (
                asset_id, operation_type, priority, profiles, parameters
              ) VALUES ($1, $2, $3, $4, $5)
              RETURNING id
            `, [
              assetId,
              'transcode',
              priority,
              [profile],
              JSON.stringify({ profile })
            ]);
            jobs.push({ id: jobResult.rows[0].id, type: 'transcode', profile });
          }

          // Subtitle generation job
          if (generateSubtitles) {
            const jobResult = await pool.query(`
              INSERT INTO media_processing_queue (
                asset_id, operation_type, priority, parameters
              ) VALUES ($1, $2, $3, $4)
              RETURNING id
            `, [
              assetId,
              'subtitle',
              priority,
              JSON.stringify({ languages: subtitleLanguages })
            ]);
            jobs.push({ id: jobResult.rows[0].id, type: 'subtitle' });
          }
        }

        // Thumbnail generation for videos
        if (asset.kind === 'video') {
          const jobResult = await pool.query(`
            INSERT INTO media_processing_queue (
              asset_id, operation_type, priority, parameters
            ) VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [
            assetId,
            'thumbnail',
            priority,
            JSON.stringify({ count: 3, timestamps: [0.1, 0.5, 0.9] })
          ]);
          jobs.push({ id: jobResult.rows[0].id, type: 'thumbnail' });
        }

        // Update asset status
        await pool.query(
          'UPDATE assets SET status = $1, updated_at = now() WHERE id = $2',
          ['processing', assetId]
        );

        span.setAttributes({
          'media.jobs_created': jobs.length,
          'media.profiles': profiles.join(','),
          'media.generate_subtitles': generateSubtitles
        });

        logger.info({
          assetId,
          jobsCreated: jobs.length,
          profiles,
          generateSubtitles
        }, 'Media processing jobs created');

        res.json({
          message: 'Processing started',
          jobs: jobs.map(job => ({
            id: job.id,
            type: job.type,
            profile: job.profile || undefined
          }))
        });

      } catch (error) {
        span.recordException(error as Error);
        logger.error({ err: error }, 'Failed to start media processing');
        
        res.status(500).json({
          error: 'Failed to start processing',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }
);

// =============================================
// Asset Management Routes
// =============================================

/**
 * Get asset details with variants
 */
router.get('/:assetId',
  requireAuth,
  async (req, res) => {
    try {
      const assetId = req.params.assetId;
      const creatorId = req.user!.id;

      // Get asset with variants
      const result = await pool.query(`
        SELECT 
          a.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', v.id,
                'profile', v.profile,
                'url', v.s3_url,
                'width', v.width,
                'height', v.height,
                'fileSize', v.file_size_bytes,
                'status', v.status,
                'processingTime', v.processing_time_ms
              ) ORDER BY v.created_at
            ) FILTER (WHERE v.id IS NOT NULL), '[]'
          ) as variants
        FROM assets a
        LEFT JOIN variants v ON a.id = v.asset_id
        WHERE a.id = $1 AND a.creator_id = $2
        GROUP BY a.id
      `, [assetId, creatorId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      res.json({ asset: result.rows[0] });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get asset');
      res.status(500).json({ error: 'Failed to get asset' });
    }
  }
);

/**
 * List creator's assets
 */
router.get('/',
  requireAuth,
  async (req, res) => {
    try {
      const creatorId = req.user!.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;
      const kind = req.query.kind as string;

      let whereClause = 'WHERE creator_id = $1';
      const params: any[] = [creatorId];

      if (kind && ['video', 'image', 'audio'].includes(kind)) {
        whereClause += ' AND kind = $2';
        params.push(kind);
      }

      const result = await pool.query(`
        SELECT * FROM assets_with_variants
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);

      const countResult = await pool.query(`
        SELECT COUNT(*) as total FROM assets ${whereClause}
      `, params);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / limit);

      res.json({
        assets: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to list assets');
      res.status(500).json({ error: 'Failed to list assets' });
    }
  }
);

/**
 * Delete asset and all variants
 */
router.delete('/:assetId',
  requireAuth,
  async (req, res) => {
    try {
      const assetId = req.params.assetId;
      const creatorId = req.user!.id;

      // Get asset and variants for S3 cleanup
      const result = await pool.query(`
        SELECT 
          a.s3_key as asset_key,
          COALESCE(array_agg(v.s3_key) FILTER (WHERE v.s3_key IS NOT NULL), ARRAY[]::text[]) as variant_keys
        FROM assets a
        LEFT JOIN variants v ON a.id = v.asset_id
        WHERE a.id = $1 AND a.creator_id = $2
        GROUP BY a.id, a.s3_key
      `, [assetId, creatorId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      const { asset_key, variant_keys } = result.rows[0];

      // Delete from database (CASCADE will handle variants)
      await pool.query('DELETE FROM assets WHERE id = $1 AND creator_id = $2', [assetId, creatorId]);

      // Delete from S3 (async - don't wait)
      const s3Keys = [asset_key, ...variant_keys].filter(Boolean);
      Promise.all(
        s3Keys.map(key => s3Manager.deleteObject(key).catch(err => 
          logger.warn({ err, key }, 'Failed to delete S3 object')
        ))
      );

      logger.info({ assetId, s3KeysDeleted: s3Keys.length }, 'Asset deleted');

      res.json({ message: 'Asset deleted successfully' });

    } catch (error) {
      logger.error({ err: error }, 'Failed to delete asset');
      res.status(500).json({ error: 'Failed to delete asset' });
    }
  }
);

export default router;