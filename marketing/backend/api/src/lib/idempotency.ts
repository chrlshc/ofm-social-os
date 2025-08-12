import { createHash } from 'crypto';
import { db } from './db';
import { loggers } from './logger';
import { withSpan } from './otel';

const logger = loggers.publisher.child({ component: 'idempotency' });

export interface IdempotencyKey {
  keyHash: string;
  creatorId: string;
  operationType: string;
  requestPayloadHash: string;
  responseData?: any;
  status: 'processing' | 'completed' | 'failed';
  expiresAt: Date;
}

export interface IdempotencyResult {
  isNew: boolean;
  key: IdempotencyKey;
  existingResponse?: any;
}

export class IdempotencyManager {
  
  // Generate idempotency key for publish operations
  static generatePublishKey(
    platform: string, 
    accountId: string, 
    variantUrl: string, 
    caption: string
  ): string {
    const components = [platform, accountId, variantUrl, caption];
    const concatenated = components.join(':');
    
    return createHash('sha256')
      .update(concatenated, 'utf8')
      .digest('hex');
  }

  // Generate idempotency key hash (for database storage)
  static hashKey(key: string): string {
    return createHash('sha256')
      .update(key, 'utf8')
      .digest('hex');
  }

  // Hash request payload for verification
  static hashPayload(payload: any): string {
    const serialized = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256')
      .update(serialized, 'utf8')
      .digest('hex');
  }

  // Check if operation should be executed or return cached result
  static async checkIdempotency(
    key: string,
    creatorId: string,
    operationType: string,
    requestPayload: any,
    ttlHours: number = 24
  ): Promise<IdempotencyResult> {
    
    return withSpan('idempotency.check', {
      operation_type: operationType,
      creator_id: creatorId
    }, async () => {
      const keyHash = this.hashKey(key);
      const payloadHash = this.hashPayload(requestPayload);
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      try {
        // Check if key already exists
        const result = await db.query(`
          SELECT key_hash, creator_id, operation_type, request_payload_hash,
                 response_data, status, expires_at, created_at, completed_at
          FROM idempotency_keys 
          WHERE key_hash = $1 AND expires_at > NOW()
        `, [keyHash]);

        if (result.rows.length === 0) {
          // New operation - create pending key
          await db.query(`
            INSERT INTO idempotency_keys (
              key_hash, creator_id, operation_type, request_payload_hash,
              status, expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `, [keyHash, creatorId, operationType, payloadHash, 'processing', expiresAt]);

          logger.info({
            keyHash: keyHash.substring(0, 8),
            operationType,
            creatorId
          }, 'New idempotency key created');

          return {
            isNew: true,
            key: {
              keyHash,
              creatorId,
              operationType,
              requestPayloadHash: payloadHash,
              status: 'processing',
              expiresAt
            }
          };
        }

        const existingKey = result.rows[0];

        // Verify creator and operation match
        if (existingKey.creator_id !== creatorId) {
          throw new Error('Idempotency key creator mismatch');
        }

        if (existingKey.operation_type !== operationType) {
          throw new Error('Idempotency key operation type mismatch');
        }

        // Verify payload hasn't changed
        if (existingKey.request_payload_hash !== payloadHash) {
          logger.warn({
            keyHash: keyHash.substring(0, 8),
            expectedHash: existingKey.request_payload_hash.substring(0, 8),
            actualHash: payloadHash.substring(0, 8)
          }, 'Idempotency key payload mismatch - possible replay attack');
          
          throw new Error('Idempotency key payload mismatch');
        }

        // Return existing result based on status
        if (existingKey.status === 'completed') {
          logger.info({
            keyHash: keyHash.substring(0, 8),
            operationType,
            completedAt: existingKey.completed_at
          }, 'Returning cached idempotent response');

          return {
            isNew: false,
            key: {
              keyHash: existingKey.key_hash,
              creatorId: existingKey.creator_id,
              operationType: existingKey.operation_type,
              requestPayloadHash: existingKey.request_payload_hash,
              responseData: existingKey.response_data,
              status: existingKey.status,
              expiresAt: new Date(existingKey.expires_at)
            },
            existingResponse: existingKey.response_data
          };
        }

        if (existingKey.status === 'failed') {
          logger.info({
            keyHash: keyHash.substring(0, 8),
            operationType
          }, 'Previous operation failed, allowing retry');

          // Update status to processing for retry
          await db.query(`
            UPDATE idempotency_keys 
            SET status = 'processing', expires_at = $2
            WHERE key_hash = $1
          `, [keyHash, expiresAt]);

          return {
            isNew: true,
            key: {
              keyHash,
              creatorId,
              operationType,
              requestPayloadHash: payloadHash,
              status: 'processing',
              expiresAt
            }
          };
        }

        // Status is 'processing' - operation is in progress
        logger.warn({
          keyHash: keyHash.substring(0, 8),
          operationType,
          createdAt: existingKey.created_at
        }, 'Operation already in progress');

        throw new Error('Operation already in progress');

      } catch (error) {
        logger.error({ 
          err: error, 
          keyHash: keyHash.substring(0, 8),
          operationType 
        }, 'Idempotency check failed');
        throw error;
      }
    });
  }

  // Complete idempotent operation with result
  static async completeOperation(
    keyHash: string,
    responseData: any,
    success: boolean = true
  ): Promise<void> {
    
    return withSpan('idempotency.complete', {
      success,
      key_hash_prefix: keyHash.substring(0, 8)
    }, async () => {
      try {
        await db.query(`
          UPDATE idempotency_keys 
          SET status = $2, response_data = $3, completed_at = NOW()
          WHERE key_hash = $1
        `, [keyHash, success ? 'completed' : 'failed', JSON.stringify(responseData)]);

        logger.info({
          keyHash: keyHash.substring(0, 8),
          success,
          hasResponseData: !!responseData
        }, 'Idempotency operation completed');

      } catch (error) {
        logger.error({ 
          err: error, 
          keyHash: keyHash.substring(0, 8) 
        }, 'Failed to complete idempotent operation');
        throw error;
      }
    });
  }

  // Clean up expired idempotency keys
  static async cleanupExpiredKeys(): Promise<number> {
    try {
      const result = await db.query(`
        DELETE FROM idempotency_keys 
        WHERE expires_at < NOW()
      `);

      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'Cleaned up expired idempotency keys');
      }

      return deletedCount;

    } catch (error) {
      logger.error({ err: error }, 'Failed to cleanup expired idempotency keys');
      throw error;
    }
  }

  // Get operation statistics
  static async getOperationStats(
    creatorId: string,
    operationType?: string,
    hours: number = 24
  ): Promise<{
    total: number;
    completed: number;
    failed: number;
    processing: number;
  }> {
    
    const whereClause = operationType 
      ? 'WHERE creator_id = $1 AND operation_type = $2 AND created_at > NOW() - INTERVAL \'$3 hours\''
      : 'WHERE creator_id = $1 AND created_at > NOW() - INTERVAL \'$2 hours\'';
    
    const params = operationType 
      ? [creatorId, operationType, hours]
      : [creatorId, hours];

    const result = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'processing') as processing
      FROM idempotency_keys
      ${whereClause}
    `, params);

    return {
      total: parseInt(result.rows[0].total),
      completed: parseInt(result.rows[0].completed),
      failed: parseInt(result.rows[0].failed),
      processing: parseInt(result.rows[0].processing)
    };
  }
}

// Middleware function for Express routes
export async function withIdempotency<T>(
  key: string,
  creatorId: string,
  operationType: string,
  requestPayload: any,
  operation: () => Promise<T>
): Promise<T> {
  
  const result = await IdempotencyManager.checkIdempotency(
    key, 
    creatorId, 
    operationType, 
    requestPayload
  );

  if (!result.isNew) {
    // Return cached response
    return result.existingResponse as T;
  }

  try {
    // Execute the operation
    const operationResult = await operation();

    // Mark as completed
    await IdempotencyManager.completeOperation(
      result.key.keyHash,
      operationResult,
      true
    );

    return operationResult;

  } catch (error) {
    // Mark as failed
    await IdempotencyManager.completeOperation(
      result.key.keyHash,
      { error: error instanceof Error ? error.message : String(error) },
      false
    );

    throw error;
  }
}