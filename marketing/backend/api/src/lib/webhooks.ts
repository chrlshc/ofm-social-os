import { createHmac, timingSafeEqual } from 'crypto';
import { env } from './env';
import { loggers } from './logger';
import { db } from './db';
import { redisUtils } from './redis';
import { withSpan } from './otel';

const logger = loggers.webhook;

export interface WebhookEvent {
  id: string;
  platform: string;
  type: string;
  payload: any;
  signature?: string;
  timestamp: number;
  processed: boolean;
}

export class WebhookSecurityManager {
  
  // Verify Meta (Instagram/Facebook) webhook signature
  static verifyMetaSignature(payload: string, signature: string): boolean {
    if (!env.WEBHOOK_SECRET) {
      logger.warn('WEBHOOK_SECRET not configured, skipping signature verification');
      return true; // Allow in development
    }

    try {
      // Meta uses sha256=<hash> format
      const expectedSignature = signature.startsWith('sha256=') 
        ? signature 
        : `sha256=${signature}`;

      const computedHash = createHmac('sha256', env.WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
      
      const computedSignature = `sha256=${computedHash}`;
      
      // Use timing-safe comparison
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const computedBuffer = Buffer.from(computedSignature, 'utf8');
      
      if (expectedBuffer.length !== computedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(expectedBuffer, computedBuffer);
    } catch (error) {
      logger.error({ err: error }, 'Meta signature verification failed');
      return false;
    }
  }

  // Verify TikTok webhook signature
  static verifyTikTokSignature(payload: string, signature: string, timestamp: string): boolean {
    if (!env.WEBHOOK_SECRET) {
      logger.warn('WEBHOOK_SECRET not configured, skipping signature verification');
      return true;
    }

    try {
      // TikTok signature format: timestamp + payload
      const message = timestamp + payload;
      
      const computedHash = createHmac('sha256', env.WEBHOOK_SECRET)
        .update(message)
        .digest('hex');
      
      const expectedBuffer = Buffer.from(signature, 'hex');
      const computedBuffer = Buffer.from(computedHash, 'hex');
      
      if (expectedBuffer.length !== computedBuffer.length) {
        return false;
      }
      
      return timingSafeEqual(expectedBuffer, computedBuffer);
    } catch (error) {
      logger.error({ err: error }, 'TikTok signature verification failed');
      return false;
    }
  }

  // Verify timestamp is within acceptable window (±5 minutes)
  static verifyTimestamp(timestamp: number, toleranceMs: number = 300000): boolean {
    const now = Date.now();
    const diff = Math.abs(now - timestamp * 1000); // Convert to milliseconds
    
    if (diff > toleranceMs) {
      logger.warn({ timestamp, now, diff }, 'Webhook timestamp outside tolerance window');
      return false;
    }
    
    return true;
  }

  // Check if event has already been processed (idempotency)
  static async isEventProcessed(eventId: string): Promise<boolean> {
    return withSpan('webhook.check_idempotency', { event_id: eventId }, async () => {
      try {
        // Check Redis cache first (fast lookup)
        const cached = await redisUtils.exists(`webhook_event:${eventId}`);
        if (cached) {
          return true;
        }

        // Check database for persistence
        const result = await db.query(
          'SELECT id FROM webhook_events WHERE event_id = $1 LIMIT 1',
          [eventId]
        );

        const processed = result.rows.length > 0;
        
        // Cache the result for 24 hours
        if (processed) {
          await redisUtils.set(`webhook_event:${eventId}`, 'processed', 86400);
        }
        
        return processed;
      } catch (error) {
        logger.error({ err: error, eventId }, 'Failed to check event idempotency');
        // Fail open to avoid blocking legitimate events
        return false;
      }
    });
  }

  // Store webhook event for processing
  static async storeEvent(event: WebhookEvent): Promise<string> {
    return withSpan('webhook.store_event', {
      platform: event.platform,
      event_type: event.type,
      event_id: event.id
    }, async () => {
      const client = await db.getClient();
      
      try {
        await client.query('BEGIN');

        // Insert event
        const result = await client.query(`
          INSERT INTO webhook_events (
            event_id, platform, event_type, payload, signature,
            verified, processed, received_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          RETURNING id
        `, [
          event.id,
          event.platform,
          event.type,
          JSON.stringify(event.payload),
          event.signature || null,
          !!event.signature, // Mark as verified if signature present
          false
        ]);

        const dbId = result.rows[0].id;

        // Mark as received in Redis for fast idempotency checks
        await redisUtils.set(`webhook_event:${event.id}`, 'received', 86400);

        await client.query('COMMIT');
        
        logger.info({
          eventId: event.id,
          platform: event.platform,
          type: event.type,
          dbId
        }, 'Webhook event stored');

        return dbId;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  // Mark event as processed
  static async markEventProcessed(
    eventId: string, 
    success: boolean, 
    error?: string
  ): Promise<void> {
    await db.query(`
      UPDATE webhook_events 
      SET processed = true, 
          processed_at = NOW(),
          processing_error = $2
      WHERE event_id = $1
    `, [eventId, error || null]);

    // Update Redis cache
    await redisUtils.set(
      `webhook_event:${eventId}`, 
      success ? 'processed' : 'failed', 
      86400
    );

    logger.info({ eventId, success, error }, 'Webhook event processing completed');
  }

  // Get pending events for processing
  static async getPendingEvents(limit: number = 100): Promise<WebhookEvent[]> {
    const result = await db.query(`
      SELECT event_id, platform, event_type, payload, signature, 
             EXTRACT(EPOCH FROM received_at) as timestamp
      FROM webhook_events 
      WHERE NOT processed 
        AND received_at > NOW() - INTERVAL '24 hours'
      ORDER BY received_at ASC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      id: row.event_id,
      platform: row.platform,
      type: row.event_type,
      payload: row.payload,
      signature: row.signature,
      timestamp: parseInt(row.timestamp),
      processed: false
    }));
  }

  // Clean up old webhook events (TTL cleanup)
  static async cleanupOldEvents(olderThanDays: number = 30): Promise<number> {
    const result = await db.query(`
      DELETE FROM webhook_events 
      WHERE received_at < NOW() - INTERVAL '${olderThanDays} days'
    `);

    const deletedCount = result.rowCount || 0;
    
    if (deletedCount > 0) {
      logger.info({ deletedCount, olderThanDays }, 'Cleaned up old webhook events');
    }

    return deletedCount;
  }
}

// Utility functions for common webhook patterns
export const webhookUtils = {
  
  // Extract Instagram webhook event details
  parseInstagramWebhook: (payload: any): WebhookEvent[] => {
    const events: WebhookEvent[] = [];
    
    if (payload.entry) {
      for (const entry of payload.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            events.push({
              id: `ig_${entry.id}_${change.field}_${Date.now()}`,
              platform: 'instagram',
              type: change.field,
              payload: change.value,
              timestamp: Date.now() / 1000,
              processed: false
            });
          }
        }
      }
    }
    
    return events;
  },

  // Extract TikTok webhook event details
  parseTikTokWebhook: (payload: any, headers: any): WebhookEvent[] => {
    const events: WebhookEvent[] = [];
    
    if (payload.event) {
      events.push({
        id: payload.event.event_id || `tt_${Date.now()}`,
        platform: 'tiktok',
        type: payload.event.event_type || 'unknown',
        payload: payload.event,
        signature: headers['x-tiktok-signature'],
        timestamp: parseInt(headers['x-tiktok-timestamp']) || Math.floor(Date.now() / 1000),
        processed: false
      });
    }
    
    return events;
  },

  // Generate replay-proof event ID
  generateEventId: (platform: string, payload: any, timestamp: number): string => {
    const hash = createHmac('sha256', env.WEBHOOK_SECRET || 'fallback')
      .update(`${platform}:${JSON.stringify(payload)}:${timestamp}`)
      .digest('hex')
      .substring(0, 16);
    
    return `${platform}_${timestamp}_${hash}`;
  }
};

export { WebhookSecurityManager as WebhookSecurity };