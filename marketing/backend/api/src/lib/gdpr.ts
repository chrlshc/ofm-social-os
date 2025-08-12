import { pool } from './database';
import { loggers } from './logger';
import { withSpan } from './otel';
import { promises as metrics } from './metrics';
import { redis } from './redis';
import { s3Client } from './s3';
import { GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const logger = loggers.gdpr;

export interface GDPRRequest {
  id: string;
  creatorId: string;
  requestType: 'erasure' | 'export';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  requestorEmail: string;
  verificationToken?: string;
  dataExported?: {
    bucketKey: string;
    downloadUrl: string;
    expiresAt: Date;
  };
  notes?: string;
}

export interface GDPRDataExport {
  creatorProfile: any;
  posts: any[];
  media: any[];
  llmUsage: any[];
  temporalWorkflows: any[];
  auditLogs: any[];
  exportedAt: Date;
  totalRecords: number;
}

/**
 * GDPR compliance manager for Article 17 (Right to Erasure) and data portability
 */
export class GDPRManager {
  private readonly VERIFICATION_EXPIRY_HOURS = 24;
  private readonly EXPORT_URL_EXPIRY_HOURS = 72;

  // =============================================
  // Request Management
  // =============================================

  /**
   * Create a new GDPR request
   */
  async createGDPRRequest(
    creatorId: string,
    requestType: 'erasure' | 'export',
    requestorEmail: string,
    verifyIdentity: boolean = true
  ): Promise<GDPRRequest> {
    return withSpan('gdpr.create_request', {
      'gdpr.creator_id': creatorId,
      'gdpr.request_type': requestType,
      'gdpr.verify_identity': verifyIdentity
    }, async (span) => {
      try {
        // Generate request ID and verification token
        const requestId = `gdpr_${requestType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const verificationToken = verifyIdentity ? 
          Math.random().toString(36).substr(2, 32) : null;

        // Check if creator exists and email matches
        const creatorResult = await pool.query(`
          SELECT id, email, username 
          FROM creators 
          WHERE id = $1 AND (email = $2 OR $3 = false)
        `, [creatorId, requestorEmail, verifyIdentity]);

        if (creatorResult.rows.length === 0) {
          throw new Error('Creator not found or email mismatch');
        }

        // Check for existing pending requests
        const existingResult = await pool.query(`
          SELECT id 
          FROM gdpr_requests 
          WHERE creator_id = $1 
            AND request_type = $2 
            AND status IN ('pending', 'processing')
        `, [creatorId, requestType]);

        if (existingResult.rows.length > 0) {
          throw new Error(`Existing ${requestType} request already pending`);
        }

        // Create the request
        const result = await pool.query(`
          INSERT INTO gdpr_requests (
            request_id, creator_id, request_type, status,
            requestor_email, verification_token, verification_expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          requestId,
          creatorId,
          requestType,
          verifyIdentity ? 'pending' : 'processing',
          requestorEmail,
          verificationToken,
          verifyIdentity ? new Date(Date.now() + this.VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000) : null
        ]);

        const request = this.mapDatabaseRowToGDPRRequest(result.rows[0]);

        // Record metrics
        metrics.counter('gdpr_requests_total', {
          request_type: requestType,
          verification_required: verifyIdentity.toString()
        }).inc();

        // Send verification email if required
        if (verifyIdentity && verificationToken) {
          await this.sendVerificationEmail(requestorEmail, requestId, verificationToken, requestType);
        }

        logger.info({
          requestId,
          creatorId,
          requestType,
          verifyIdentity
        }, 'GDPR request created');

        span.setAttributes({
          'gdpr.request_id': requestId,
          'gdpr.verification_required': verifyIdentity
        });

        return request;

      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          creatorId,
          requestType
        }, 'Failed to create GDPR request');
        throw error;
      }
    });
  }

  /**
   * Verify GDPR request using verification token
   */
  async verifyGDPRRequest(requestId: string, verificationToken: string): Promise<GDPRRequest> {
    return withSpan('gdpr.verify_request', {
      'gdpr.request_id': requestId
    }, async (span) => {
      try {
        const result = await pool.query(`
          UPDATE gdpr_requests 
          SET status = 'processing',
              verified_at = now(),
              updated_at = now()
          WHERE request_id = $1 
            AND verification_token = $2 
            AND verification_expires_at > now()
            AND status = 'pending'
          RETURNING *
        `, [requestId, verificationToken]);

        if (result.rows.length === 0) {
          throw new Error('Invalid verification token or request expired');
        }

        const request = this.mapDatabaseRowToGDPRRequest(result.rows[0]);

        // Start processing the request
        await this.processGDPRRequest(request);

        logger.info({ requestId }, 'GDPR request verified and processing started');

        return request;

      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          requestId
        }, 'Failed to verify GDPR request');
        throw error;
      }
    });
  }

  // =============================================
  // Data Processing
  // =============================================

  /**
   * Process a GDPR request (erasure or export)
   */
  private async processGDPRRequest(request: GDPRRequest): Promise<void> {
    return withSpan('gdpr.process_request', {
      'gdpr.request_id': request.id,
      'gdpr.request_type': request.requestType
    }, async (span) => {
      try {
        const startTime = Date.now();

        if (request.requestType === 'erasure') {
          await this.performDataErasure(request.creatorId, request.id);
        } else if (request.requestType === 'export') {
          await this.performDataExport(request.creatorId, request.id);
        }

        // Update request status
        await pool.query(`
          UPDATE gdpr_requests 
          SET status = 'completed',
              completed_at = now(),
              processing_duration_ms = $2,
              updated_at = now()
          WHERE request_id = $1
        `, [request.id, Date.now() - startTime]);

        // Record metrics
        metrics.histogram('gdpr_processing_duration_ms', {
          request_type: request.requestType
        }).observe(Date.now() - startTime);

        metrics.counter('gdpr_requests_completed_total', {
          request_type: request.requestType
        }).inc();

        logger.info({
          requestId: request.id,
          requestType: request.requestType,
          creatorId: request.creatorId,
          durationMs: Date.now() - startTime
        }, 'GDPR request processing completed');

      } catch (error) {
        // Update request status to failed
        await pool.query(`
          UPDATE gdpr_requests 
          SET status = 'failed',
              error_message = $2,
              updated_at = now()
          WHERE request_id = $1
        `, [request.id, error instanceof Error ? error.message : 'Unknown error']);

        // Record failure metrics
        metrics.counter('gdpr_processing_failures_total', {
          request_type: request.requestType
        }).inc();

        span.recordException(error as Error);
        logger.error({
          err: error,
          requestId: request.id,
          requestType: request.requestType
        }, 'GDPR request processing failed');
        throw error;
      }
    });
  }

  /**
   * Perform data erasure according to Article 17
   */
  private async performDataErasure(creatorId: string, requestId: string): Promise<void> {
    return withSpan('gdpr.perform_erasure', {
      'gdpr.creator_id': creatorId
    }, async (span) => {
      try {
        logger.info({ creatorId, requestId }, 'Starting data erasure process');

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // 1. Create tombstone record to prevent data resurrection
          await client.query(`
            INSERT INTO data_erasure_tombstones (
              creator_id, erased_at, gdpr_request_id
            ) VALUES ($1, now(), $2)
            ON CONFLICT (creator_id) DO UPDATE SET
              erased_at = now(),
              gdpr_request_id = $2
          `, [creatorId, requestId]);

          // 2. Delete or anonymize personal data from each table
          const erasureOperations = [
            // Posts and content
            { table: 'posts', condition: 'creator_id = $1' },
            { table: 'post_media', condition: 'creator_id = $1' },
            { table: 'post_schedules', condition: 'creator_id = $1' },
            
            // Media files
            { table: 'media_files', condition: 'creator_id = $1' },
            { table: 'media_transcodes', condition: 'creator_id = $1' },
            
            // LLM usage and costs
            { table: 'llm_budgets', condition: 'creator_id = $1' },
            { table: 'llm_usage_logs', condition: 'creator_id = $1' },
            
            // Platform tokens and connections
            { table: 'creator_tokens', condition: 'creator_id = $1' },
            { table: 'platform_accounts', condition: 'creator_id = $1' },
            
            // Rate limiting data
            { table: 'rate_limit_buckets', condition: 'creator_id = $1' },
            
            // Temporal workflows
            { table: 'temporal_workflows', condition: 'creator_id = $1' },
            
            // Webhook deliveries
            { table: 'webhook_deliveries', condition: 'creator_id = $1' },
            
            // Audit logs (anonymize rather than delete for compliance)
            {
              table: 'audit_logs',
              condition: 'creator_id = $1',
              anonymize: true,
              anonymizeQuery: `
                UPDATE audit_logs 
                SET creator_id = NULL,
                    anonymized_at = now(),
                    event_data = jsonb_set(
                      event_data - 'email' - 'name' - 'username', 
                      '{anonymized}', 
                      'true'
                    )
                WHERE creator_id = $1
              `
            }
          ];

          let totalRecordsErased = 0;

          for (const operation of erasureOperations) {
            if (operation.anonymize) {
              // Anonymize sensitive audit data
              const result = await client.query(operation.anonymizeQuery!, [creatorId]);
              totalRecordsErased += result.rowCount || 0;
              logger.debug({ 
                table: operation.table, 
                anonymized: result.rowCount 
              }, 'Records anonymized');
            } else {
              // Delete personal data
              const result = await client.query(
                `DELETE FROM ${operation.table} WHERE ${operation.condition}`,
                [creatorId]
              );
              totalRecordsErased += result.rowCount || 0;
              logger.debug({ 
                table: operation.table, 
                deleted: result.rowCount 
              }, 'Records deleted');
            }
          }

          // 3. Delete S3 media files
          const mediaCount = await this.deleteCreatorMediaFromS3(creatorId);
          
          // 4. Clear Redis cache data
          const cacheKeys = [
            `creator:${creatorId}:*`,
            `tokens:${creatorId}:*`,
            `rate_limit:${creatorId}:*`,
            `circuit_breaker:${creatorId}:*`
          ];

          for (const pattern of cacheKeys) {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
              await redis.del(...keys);
            }
          }

          // 5. Finally, anonymize the creator record (keep ID for referential integrity)
          await client.query(`
            UPDATE creators 
            SET email = 'erased-' || id || '@gdpr.local',
                username = 'erased-' || id,
                display_name = '[Erased]',
                bio = NULL,
                avatar_url = NULL,
                settings = '{}',
                erased_at = now(),
                updated_at = now()
            WHERE id = $1
          `, [creatorId]);

          await client.query('COMMIT');

          // Record erasure metrics
          metrics.counter('gdpr_erasure_total', {
            status: 'success'
          }).inc();

          metrics.gauge('gdpr_records_erased', {
            creator_id: creatorId
          }).set(totalRecordsErased);

          span.setAttributes({
            'gdpr.records_erased': totalRecordsErased,
            'gdpr.media_files_deleted': mediaCount
          });

          logger.info({
            creatorId,
            requestId,
            recordsErased: totalRecordsErased,
            mediaFilesDeleted: mediaCount
          }, 'Data erasure completed successfully');

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }

      } catch (error) {
        metrics.counter('gdpr_erasure_total', {
          status: 'failed'
        }).inc();

        span.recordException(error as Error);
        logger.error({
          err: error,
          creatorId,
          requestId
        }, 'Data erasure failed');
        throw error;
      }
    });
  }

  /**
   * Delete creator's media files from S3
   */
  private async deleteCreatorMediaFromS3(creatorId: string): Promise<number> {
    try {
      const bucketName = process.env.S3_MEDIA_BUCKET!;
      const prefix = `creators/${creatorId}/`;
      
      let deletedCount = 0;
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken
        });

        const listResponse = await s3Client.send(listCommand);
        
        if (listResponse.Contents && listResponse.Contents.length > 0) {
          for (const object of listResponse.Contents) {
            if (object.Key) {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: bucketName,
                Key: object.Key
              });
              
              await s3Client.send(deleteCommand);
              deletedCount++;
            }
          }
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      return deletedCount;
    } catch (error) {
      logger.error({
        err: error,
        creatorId
      }, 'Failed to delete media files from S3');
      throw error;
    }
  }

  /**
   * Perform data export for portability
   */
  private async performDataExport(creatorId: string, requestId: string): Promise<void> {
    return withSpan('gdpr.perform_export', {
      'gdpr.creator_id': creatorId
    }, async (span) => {
      try {
        logger.info({ creatorId, requestId }, 'Starting data export process');

        // 1. Collect all creator data
        const exportData = await this.collectCreatorData(creatorId);

        // 2. Generate export file
        const exportKey = `gdpr-exports/${creatorId}/${requestId}/data-export.json`;
        const exportContent = JSON.stringify(exportData, null, 2);

        // 3. Upload to S3
        const bucketName = process.env.S3_EXPORTS_BUCKET || process.env.S3_MEDIA_BUCKET!;
        
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: exportKey,
          Body: exportContent,
          ContentType: 'application/json',
          ServerSideEncryption: 'AES256',
          Metadata: {
            'creator-id': creatorId,
            'request-id': requestId,
            'export-date': new Date().toISOString()
          }
        }));

        // 4. Generate signed download URL
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const downloadUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: bucketName,
            Key: exportKey
          }),
          { expiresIn: this.EXPORT_URL_EXPIRY_HOURS * 3600 }
        );

        // 5. Update request with download information
        await pool.query(`
          UPDATE gdpr_requests 
          SET export_bucket_key = $2,
              export_download_url = $3,
              export_expires_at = $4,
              export_size_bytes = $5,
              updated_at = now()
          WHERE request_id = $1
        `, [
          requestId,
          exportKey,
          downloadUrl,
          new Date(Date.now() + this.EXPORT_URL_EXPIRY_HOURS * 60 * 60 * 1000),
          Buffer.byteLength(exportContent, 'utf8')
        ]);

        // Record export metrics
        metrics.counter('gdpr_export_total', {
          status: 'success'
        }).inc();

        metrics.gauge('gdpr_export_size_bytes', {
          creator_id: creatorId
        }).set(Buffer.byteLength(exportContent, 'utf8'));

        span.setAttributes({
          'gdpr.export_size_bytes': Buffer.byteLength(exportContent, 'utf8'),
          'gdpr.export_records': exportData.totalRecords
        });

        logger.info({
          creatorId,
          requestId,
          exportSizeBytes: Buffer.byteLength(exportContent, 'utf8'),
          totalRecords: exportData.totalRecords,
          downloadUrl: downloadUrl.split('?')[0] // Log without query params
        }, 'Data export completed successfully');

      } catch (error) {
        metrics.counter('gdpr_export_total', {
          status: 'failed'
        }).inc();

        span.recordException(error as Error);
        logger.error({
          err: error,
          creatorId,
          requestId
        }, 'Data export failed');
        throw error;
      }
    });
  }

  /**
   * Collect all data for a creator
   */
  private async collectCreatorData(creatorId: string): Promise<GDPRDataExport> {
    const [
      creatorProfile,
      posts,
      media,
      llmUsage,
      workflows,
      auditLogs
    ] = await Promise.all([
      this.getCreatorProfile(creatorId),
      this.getCreatorPosts(creatorId),
      this.getCreatorMedia(creatorId),
      this.getCreatorLLMUsage(creatorId),
      this.getCreatorWorkflows(creatorId),
      this.getCreatorAuditLogs(creatorId)
    ]);

    const totalRecords = posts.length + media.length + llmUsage.length + 
                        workflows.length + auditLogs.length + 1; // +1 for profile

    return {
      creatorProfile,
      posts,
      media,
      llmUsage,
      temporalWorkflows: workflows,
      auditLogs,
      exportedAt: new Date(),
      totalRecords
    };
  }

  private async getCreatorProfile(creatorId: string): Promise<any> {
    const result = await pool.query(`
      SELECT id, email, username, display_name, bio, avatar_url, 
             created_at, updated_at, settings
      FROM creators 
      WHERE id = $1
    `, [creatorId]);
    return result.rows[0];
  }

  private async getCreatorPosts(creatorId: string): Promise<any[]> {
    const result = await pool.query(`
      SELECT id, content, platforms, status, scheduled_at, 
             published_at, created_at, updated_at, settings
      FROM posts 
      WHERE creator_id = $1
      ORDER BY created_at DESC
    `, [creatorId]);
    return result.rows;
  }

  private async getCreatorMedia(creatorId: string): Promise<any[]> {
    const result = await pool.query(`
      SELECT id, filename, mime_type, size_bytes, s3_key, 
             duration_ms, transcoded_at, created_at
      FROM media_files 
      WHERE creator_id = $1
      ORDER BY created_at DESC
    `, [creatorId]);
    return result.rows;
  }

  private async getCreatorLLMUsage(creatorId: string): Promise<any[]> {
    const result = await pool.query(`
      SELECT id, provider, model, prompt_tokens, completion_tokens,
             cost_usd, created_at, purpose
      FROM llm_usage_logs 
      WHERE creator_id = $1
      ORDER BY created_at DESC
    `, [creatorId]);
    return result.rows;
  }

  private async getCreatorWorkflows(creatorId: string): Promise<any[]> {
    const result = await pool.query(`
      SELECT workflow_id, workflow_type, status, started_at,
             completed_at, input_data, result_data
      FROM temporal_workflows 
      WHERE creator_id = $1
      ORDER BY started_at DESC
    `, [creatorId]);
    return result.rows;
  }

  private async getCreatorAuditLogs(creatorId: string): Promise<any[]> {
    const result = await pool.query(`
      SELECT id, event_type, event_data, ip_address, user_agent,
             created_at
      FROM audit_logs 
      WHERE creator_id = $1
      ORDER BY created_at DESC
      LIMIT 1000
    `, [creatorId]);
    return result.rows;
  }

  // =============================================
  // Utility Methods
  // =============================================

  /**
   * Send verification email to requestor
   */
  private async sendVerificationEmail(
    email: string, 
    requestId: string, 
    token: string, 
    requestType: string
  ): Promise<void> {
    // In a real implementation, this would send an email
    // For now, we'll just log the verification URL
    const verificationUrl = `${process.env.BASE_URL}/gdpr/verify?request=${requestId}&token=${token}`;
    
    logger.info({
      email,
      requestId,
      requestType,
      verificationUrl
    }, 'GDPR verification email would be sent');

    // Store verification info in Redis for debugging
    await redis.setex(
      `gdpr_verification:${requestId}`,
      this.VERIFICATION_EXPIRY_HOURS * 3600,
      JSON.stringify({ email, token, requestType, verificationUrl })
    );
  }

  /**
   * Get GDPR request status
   */
  async getGDPRRequestStatus(requestId: string): Promise<GDPRRequest | null> {
    try {
      const result = await pool.query(`
        SELECT * FROM gdpr_requests WHERE request_id = $1
      `, [requestId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToGDPRRequest(result.rows[0]);
    } catch (error) {
      logger.error({
        err: error,
        requestId
      }, 'Failed to get GDPR request status');
      throw error;
    }
  }

  /**
   * List GDPR requests for a creator
   */
  async listGDPRRequests(creatorId: string, limit: number = 50): Promise<GDPRRequest[]> {
    try {
      const result = await pool.query(`
        SELECT * FROM gdpr_requests 
        WHERE creator_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [creatorId, limit]);

      return result.rows.map(row => this.mapDatabaseRowToGDPRRequest(row));
    } catch (error) {
      logger.error({
        err: error,
        creatorId
      }, 'Failed to list GDPR requests');
      throw error;
    }
  }

  /**
   * Map database row to GDPRRequest interface
   */
  private mapDatabaseRowToGDPRRequest(row: any): GDPRRequest {
    return {
      id: row.request_id,
      creatorId: row.creator_id,
      requestType: row.request_type,
      status: row.status,
      requestedAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      requestorEmail: row.requestor_email,
      verificationToken: row.verification_token,
      dataExported: row.export_download_url ? {
        bucketKey: row.export_bucket_key,
        downloadUrl: row.export_download_url,
        expiresAt: new Date(row.export_expires_at)
      } : undefined,
      notes: row.notes
    };
  }

  /**
   * Health check for GDPR system
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    pendingRequests: number;
    oldestPendingHours: number;
    completionRate24h: number;
  }> {
    try {
      const [pendingResult, completionResult] = await Promise.all([
        pool.query(`
          SELECT COUNT(*) as pending_count,
                 EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 3600 as oldest_pending_hours
          FROM gdpr_requests 
          WHERE status IN ('pending', 'processing')
        `),
        pool.query(`
          SELECT 
            COUNT(*) FILTER (WHERE status = 'completed') as completed,
            COUNT(*) as total
          FROM gdpr_requests 
          WHERE created_at > now() - INTERVAL '24 hours'
        `)
      ]);

      const pendingCount = parseInt(pendingResult.rows[0].pending_count);
      const oldestPendingHours = parseFloat(pendingResult.rows[0].oldest_pending_hours || '0');
      const completed = parseInt(completionResult.rows[0].completed || '0');
      const total = parseInt(completionResult.rows[0].total || '0');
      const completionRate = total > 0 ? (completed / total) * 100 : 100;

      return {
        healthy: pendingCount < 100 && oldestPendingHours < 24, // Less than 100 pending and none older than 24h
        pendingRequests: pendingCount,
        oldestPendingHours,
        completionRate24h: completionRate
      };

    } catch (error) {
      logger.error({ err: error }, 'GDPR health check failed');
      return {
        healthy: false,
        pendingRequests: -1,
        oldestPendingHours: -1,
        completionRate24h: -1
      };
    }
  }
}

// Default GDPR manager instance
export const gdprManager = new GDPRManager();