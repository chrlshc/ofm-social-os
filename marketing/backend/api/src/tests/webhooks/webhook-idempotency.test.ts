import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WebhookSecurityManager } from '../../lib/webhooks';
import { db } from '../../lib/db';
import { redisUtils } from '../../lib/redis';

describe('Webhook Idempotency', () => {
  beforeEach(async () => {
    // Clean up test data
    await db.query('DELETE FROM webhook_events WHERE event_id LIKE $1', ['test_%']);
    await redisUtils.del('webhook_event:test_event_1');
    await redisUtils.del('webhook_event:test_event_2');
  });

  afterEach(async () => {
    // Clean up after tests
    await db.query('DELETE FROM webhook_events WHERE event_id LIKE $1', ['test_%']);
    await redisUtils.del('webhook_event:test_event_1');
    await redisUtils.del('webhook_event:test_event_2');
  });

  describe('Event Processing Check', () => {
    it('should correctly identify new events', async () => {
      const eventId = 'test_event_1';
      
      // First check should return false (not processed)
      const isProcessed = await WebhookSecurityManager.isEventProcessed(eventId);
      expect(isProcessed).toBe(false);
    });

    it('should correctly identify processed events in Redis', async () => {
      const eventId = 'test_event_1';
      
      // Mark as processed in Redis
      await redisUtils.set(`webhook_event:${eventId}`, 'processed', 86400);
      
      // Should return true
      const isProcessed = await WebhookSecurityManager.isEventProcessed(eventId);
      expect(isProcessed).toBe(true);
    });

    it('should correctly identify processed events in database', async () => {
      const eventId = 'test_event_1';
      
      // Store event in database
      await db.query(`
        INSERT INTO webhook_events (
          provider, event_id, event_type, payload, status
        ) VALUES ($1, $2, $3, $4, $5)
      `, ['tiktok', eventId, 'test', '{}', 'completed']);
      
      // Should return true and cache in Redis
      const isProcessed = await WebhookSecurityManager.isEventProcessed(eventId);
      expect(isProcessed).toBe(true);
      
      // Verify it was cached
      const cached = await redisUtils.exists(`webhook_event:${eventId}`);
      expect(cached).toBe(1);
    });

    it('should handle concurrent checks gracefully', async () => {
      const eventId = 'test_event_2';
      
      // Run multiple checks concurrently
      const results = await Promise.all([
        WebhookSecurityManager.isEventProcessed(eventId),
        WebhookSecurityManager.isEventProcessed(eventId),
        WebhookSecurityManager.isEventProcessed(eventId),
        WebhookSecurityManager.isEventProcessed(eventId),
        WebhookSecurityManager.isEventProcessed(eventId)
      ]);
      
      // All should return false
      results.forEach(result => {
        expect(result).toBe(false);
      });
    });
  });

  describe('Event Storage', () => {
    it('should store webhook event successfully', async () => {
      const event = {
        id: 'test_event_store_1',
        platform: 'tiktok' as const,
        type: 'video.publish.complete',
        payload: { video: { id: '123' } },
        signature: 'test_signature',
        timestamp: Date.now() / 1000,
        processed: false
      };
      
      const dbId = await WebhookSecurityManager.storeEvent(event);
      expect(dbId).toBeDefined();
      expect(typeof dbId).toBe('string');
      
      // Verify event was stored
      const result = await db.query(
        'SELECT * FROM webhook_events WHERE event_id = $1',
        [event.id]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].provider).toBe('tiktok');
      expect(result.rows[0].event_type).toBe('video.publish.complete');
      expect(result.rows[0].signature).toBe('test_signature');
      expect(result.rows[0].signature_verified).toBe(true); // Set when signature provided
      expect(result.rows[0].status).toBe('queued');
    });

    it('should reject duplicate event IDs', async () => {
      const event = {
        id: 'test_duplicate_1',
        platform: 'meta' as const,
        type: 'comment',
        payload: { text: 'Hello' },
        timestamp: Date.now() / 1000,
        processed: false
      };
      
      // Store first event
      await WebhookSecurityManager.storeEvent(event);
      
      // Attempt to store duplicate
      await expect(WebhookSecurityManager.storeEvent(event))
        .rejects.toThrow();
    });

    it('should set Redis cache when storing event', async () => {
      const event = {
        id: 'test_cache_1',
        platform: 'tiktok' as const,
        type: 'test',
        payload: {},
        timestamp: Date.now() / 1000,
        processed: false
      };
      
      await WebhookSecurityManager.storeEvent(event);
      
      // Check Redis cache
      const cached = await redisUtils.get(`webhook_event:${event.id}`);
      expect(cached).toBe('received');
    });
  });

  describe('Event Processing Status', () => {
    it('should mark event as processed', async () => {
      const eventId = 'test_process_1';
      
      // Store event first
      await db.query(`
        INSERT INTO webhook_events (
          provider, event_id, event_type, payload, status
        ) VALUES ($1, $2, $3, $4, $5)
      `, ['tiktok', eventId, 'test', '{}', 'queued']);
      
      // Mark as processed
      await WebhookSecurityManager.markEventProcessed(eventId, true);
      
      // Verify in database
      const result = await db.query(
        'SELECT status, processed_at FROM webhook_events WHERE event_id = $1',
        [eventId]
      );
      
      expect(result.rows[0].status).toBe('completed');
      expect(result.rows[0].processed_at).toBeDefined();
      
      // Verify in Redis
      const cached = await redisUtils.get(`webhook_event:${eventId}`);
      expect(cached).toBe('processed');
    });

    it('should mark event as failed with error', async () => {
      const eventId = 'test_fail_1';
      const errorMessage = 'Processing failed: Invalid payload';
      
      // Store event first
      await db.query(`
        INSERT INTO webhook_events (
          provider, event_id, event_type, payload, status
        ) VALUES ($1, $2, $3, $4, $5)
      `, ['meta', eventId, 'test', '{}', 'queued']);
      
      // Mark as failed
      await WebhookSecurityManager.markEventProcessed(eventId, false, errorMessage);
      
      // Verify in database
      const result = await db.query(
        'SELECT status, processing_error FROM webhook_events WHERE event_id = $1',
        [eventId]
      );
      
      expect(result.rows[0].status).toBe('failed');
      expect(result.rows[0].processing_error).toBe(errorMessage);
      
      // Verify in Redis
      const cached = await redisUtils.get(`webhook_event:${eventId}`);
      expect(cached).toBe('failed');
    });
  });

  describe('Replayed Events', () => {
    it('should handle replayed events correctly', async () => {
      const event = {
        id: 'test_replay_1',
        platform: 'tiktok' as const,
        type: 'video.publish.complete',
        payload: { video: { id: '789' } },
        timestamp: Date.now() / 1000,
        processed: false
      };
      
      // Store and process event
      await WebhookSecurityManager.storeEvent(event);
      await WebhookSecurityManager.markEventProcessed(event.id, true);
      
      // Check if processed
      const isProcessed = await WebhookSecurityManager.isEventProcessed(event.id);
      expect(isProcessed).toBe(true);
      
      // Attempt to store again should fail
      await expect(WebhookSecurityManager.storeEvent(event))
        .rejects.toThrow();
    });

    it('should handle out-of-order delivery', async () => {
      const events = [
        {
          id: 'test_order_3',
          platform: 'meta' as const,
          type: 'comment',
          payload: { id: '3', timestamp: 3 },
          timestamp: Date.now() / 1000 + 2,
          processed: false
        },
        {
          id: 'test_order_1',
          platform: 'meta' as const,
          type: 'comment',
          payload: { id: '1', timestamp: 1 },
          timestamp: Date.now() / 1000,
          processed: false
        },
        {
          id: 'test_order_2',
          platform: 'meta' as const,
          type: 'comment',
          payload: { id: '2', timestamp: 2 },
          timestamp: Date.now() / 1000 + 1,
          processed: false
        }
      ];
      
      // Store events out of order
      for (const event of events) {
        await WebhookSecurityManager.storeEvent(event);
      }
      
      // All should be stored successfully
      const result = await db.query(
        'SELECT event_id FROM webhook_events WHERE event_id LIKE $1 ORDER BY event_id',
        ['test_order_%']
      );
      
      expect(result.rows).toHaveLength(3);
      expect(result.rows.map(r => r.event_id)).toEqual([
        'test_order_1',
        'test_order_2',
        'test_order_3'
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle corrupted payloads', async () => {
      const event = {
        id: 'test_corrupt_1',
        platform: 'tiktok' as const,
        type: 'unknown',
        payload: { corrupt: '\x00\x01\x02', invalid: undefined },
        timestamp: Date.now() / 1000,
        processed: false
      };
      
      // Should store successfully (payload is JSONB)
      const dbId = await WebhookSecurityManager.storeEvent(event);
      expect(dbId).toBeDefined();
    });

    it('should handle very large payloads', async () => {
      // Create a large payload (but under typical limits)
      const largeArray = new Array(1000).fill({ 
        data: 'x'.repeat(100),
        metadata: { timestamp: Date.now(), id: Math.random() }
      });
      
      const event = {
        id: 'test_large_1',
        platform: 'meta' as const,
        type: 'bulk_update',
        payload: { items: largeArray },
        timestamp: Date.now() / 1000,
        processed: false
      };
      
      const dbId = await WebhookSecurityManager.storeEvent(event);
      expect(dbId).toBeDefined();
    });

    it('should handle missing optional fields', async () => {
      const minimalEvent = {
        id: 'test_minimal_1',
        platform: 'tiktok' as const,
        type: 'test',
        payload: {},
        timestamp: Date.now() / 1000,
        processed: false
      };
      
      // No signature provided
      const dbId = await WebhookSecurityManager.storeEvent(minimalEvent);
      expect(dbId).toBeDefined();
      
      // Verify default values
      const result = await db.query(
        'SELECT signature_verified, signature FROM webhook_events WHERE event_id = $1',
        [minimalEvent.id]
      );
      
      expect(result.rows[0].signature_verified).toBe(false);
      expect(result.rows[0].signature).toBeNull();
    });
  });
});