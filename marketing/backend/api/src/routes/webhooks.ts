import express, { Router } from 'express';
import { env } from '../lib/env';
import { WebhookSecurityManager, webhookUtils } from '../lib/webhooks';
import { db } from '../lib/db';
import { loggers } from '../lib/logger';
import { withSpan } from '../lib/otel';
import { metrics } from '../lib/metrics';
import { temporalClient } from '../temporal/client';
import { handleWebhookWorkflow } from '../temporal/workflows/webhook';
import { IdempotencyManager } from '../lib/idempotency';
import rateLimit from 'express-rate-limit';

const router = Router();
const logger = loggers.webhook;

// Middleware to capture raw body for signature verification
const captureRawBody = express.raw({ 
  type: ['application/json', 'text/plain'], 
  limit: '1mb' 
});

// Rate limiting for webhook endpoints (50 RPS with burst)
const webhookRateLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 50, // 50 requests per second
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.increment('webhook_rate_limited', { provider: req.params.provider });
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Timeout handler middleware
const timeoutHandler = (timeout: number = 5000) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        metrics.increment('webhook_timeout', { provider: req.params.provider });
        res.status(504).json({ error: 'Gateway timeout' });
      }
    }, timeout);

    res.on('finish', () => clearTimeout(timer));
    next();
  };
};

// =============================================
// TikTok Content Posting Webhooks
// =============================================

router.post('/webhooks/tiktok', 
  webhookRateLimiter,
  timeoutHandler(5000),
  captureRawBody,
  async (req, res) => {
    return withSpan('webhook.receive.tiktok', {}, async () => {
      const startTime = Date.now();
      
      try {
        // Immediate ACK < 1s
        res.status(200).send('OK');
        metrics.histogram('webhook_ack_time_ms', Date.now() - startTime, { provider: 'tiktok' });

        // Verify content type
        if (!req.is('application/json')) {
          metrics.increment('webhook_invalid_content_type', { provider: 'tiktok' });
          logger.warn({ contentType: req.get('content-type') }, 'Invalid content type for TikTok webhook');
          return;
        }

        // Get raw body for signature verification
        const rawBody = req.body.toString('utf8');
        const signature = req.get('TikTok-Signature');

        if (!signature) {
          metrics.increment('webhook_missing_signature', { provider: 'tiktok' });
          logger.warn('TikTok webhook missing signature');
          return;
        }

        // Parse signature header: "t=timestamp,s=signature"
        const sigParts = Object.fromEntries(
          signature.split(',').map(part => {
            const [key, value] = part.split('=');
            return [key, value];
          })
        );

        const timestamp = parseInt(sigParts.t);
        const expectedSig = sigParts.s;

        // Verify timestamp is within 5 minute window
        if (!WebhookSecurityManager.verifyTimestamp(timestamp)) {
          metrics.increment('webhook_timestamp_invalid', { provider: 'tiktok' });
          logger.warn({ timestamp }, 'TikTok webhook timestamp outside tolerance window');
          return;
        }

        // Verify signature
        const signedPayload = `${timestamp}.${rawBody}`;
        const isValid = WebhookSecurityManager.verifyTikTokSignature(
          signedPayload, 
          expectedSig, 
          timestamp.toString()
        );

        if (!isValid && env.NODE_ENV === 'production') {
          metrics.increment('webhook_signature_invalid', { provider: 'tiktok' });
          logger.warn('TikTok webhook signature verification failed');
          return;
        }

        // Parse payload
        const payload = JSON.parse(rawBody);
        const eventId = payload.event?.event_id || `tiktok_${timestamp}_${Date.now()}`;
        
        // Check idempotency
        const isProcessed = await WebhookSecurityManager.isEventProcessed(eventId);
        if (isProcessed) {
          metrics.increment('webhook_duplicate', { provider: 'tiktok' });
          logger.info({ eventId }, 'Duplicate TikTok webhook ignored');
          return;
        }

        // Store webhook event
        await WebhookSecurityManager.storeEvent({
          id: eventId,
          platform: 'tiktok',
          type: payload.event?.type || 'unknown',
          payload,
          signature,
          timestamp,
          processed: false
        });

        // Queue for processing via Temporal
        await temporalClient.start(handleWebhookWorkflow, {
          args: [{
            provider: 'tiktok',
            eventId,
            eventType: payload.event?.type,
            payload
          }],
          taskQueue: 'webhooks',
          workflowId: `webhook-tiktok-${eventId}`,
          workflowIdReusePolicy: 'WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE'
        });

        metrics.increment('webhook_received', { 
          provider: 'tiktok', 
          event_type: payload.event?.type 
        });

        logger.info({
          eventId,
          eventType: payload.event?.type,
          accountRef: payload.account?.username
        }, 'TikTok webhook queued for processing');

      } catch (error) {
        logger.error({ err: error }, 'Failed to process TikTok webhook');
        metrics.increment('webhook_processing_error', { provider: 'tiktok' });
      }
    });
  }
);

// =============================================
// Meta/Instagram Graph API Webhooks
// =============================================

// GET endpoint for webhook verification
router.get('/webhooks/meta', async (req, res) => {
  return withSpan('webhook.verify.meta', {}, async () => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Verify the webhook subscription
    if (mode === 'subscribe' && token === env.META_VERIFY_TOKEN) {
      logger.info('Meta webhook verification successful');
      res.status(200).type('text/plain').send(challenge);
    } else {
      logger.warn({ mode, tokenMatch: token === env.META_VERIFY_TOKEN }, 
        'Meta webhook verification failed');
      res.sendStatus(403);
    }
  });
});

// POST endpoint for webhook events
router.post('/webhooks/meta',
  webhookRateLimiter,
  timeoutHandler(5000),
  captureRawBody,
  async (req, res) => {
    return withSpan('webhook.receive.meta', {}, async () => {
      const startTime = Date.now();
      
      try {
        // Immediate ACK < 1s
        res.status(200).send('OK');
        metrics.histogram('webhook_ack_time_ms', Date.now() - startTime, { provider: 'meta' });

        // Get raw body and signature
        const rawBody = req.body.toString('utf8');
        const signature = req.get('x-hub-signature-256');

        if (!signature) {
          metrics.increment('webhook_missing_signature', { provider: 'meta' });
          logger.warn('Meta webhook missing signature');
          return;
        }

        // Verify signature
        const isValid = WebhookSecurityManager.verifyMetaSignature(rawBody, signature);
        
        if (!isValid && env.NODE_ENV === 'production') {
          metrics.increment('webhook_signature_invalid', { provider: 'meta' });
          logger.warn('Meta webhook signature verification failed');
          return;
        }

        // Parse payload
        const payload = JSON.parse(rawBody);
        
        // Extract webhook events
        const events = webhookUtils.parseInstagramWebhook(payload);
        
        for (const event of events) {
          // Check idempotency
          const isProcessed = await WebhookSecurityManager.isEventProcessed(event.id);
          if (isProcessed) {
            metrics.increment('webhook_duplicate', { provider: 'meta' });
            continue;
          }

          // Store webhook event
          await WebhookSecurityManager.storeEvent({
            ...event,
            platform: 'meta',
            signature,
            processed: false
          });

          // Queue for processing
          await temporalClient.start(handleWebhookWorkflow, {
            args: [{
              provider: 'meta',
              eventId: event.id,
              eventType: event.type,
              payload: event.payload
            }],
            taskQueue: 'webhooks',
            workflowId: `webhook-meta-${event.id}`,
            workflowIdReusePolicy: 'WORKFLOW_ID_REUSE_POLICY_REJECT_DUPLICATE'
          });

          metrics.increment('webhook_received', { 
            provider: 'meta', 
            event_type: event.type 
          });

          logger.info({
            eventId: event.id,
            eventType: event.type,
            accountRef: payload.entry?.[0]?.id
          }, 'Meta webhook queued for processing');
        }

      } catch (error) {
        logger.error({ err: error }, 'Failed to process Meta webhook');
        metrics.increment('webhook_processing_error', { provider: 'meta' });
      }
    });
  }
);

// =============================================
// Webhook Management Endpoints
// =============================================

// Get webhook processing stats
router.get('/webhooks/stats', async (req, res) => {
  return withSpan('webhook.stats', {}, async () => {
    try {
      const stats = await db.query(`
        SELECT * FROM webhook_processing_stats
        ORDER BY provider, status
      `);

      res.json({
        stats: stats.rows,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get webhook stats');
      res.status(500).json({ error: 'Failed to get webhook stats' });
    }
  });
});

// Get DLQ items
router.get('/webhooks/dlq', async (req, res) => {
  return withSpan('webhook.dlq.list', {}, async () => {
    try {
      const dlqItems = await db.query(`
        SELECT id, provider, event_id, event_type, received_at, 
               processing_error, retry_count
        FROM webhook_events
        WHERE status = 'dlq'
        ORDER BY received_at DESC
        LIMIT 100
      `);

      res.json({
        items: dlqItems.rows,
        count: dlqItems.rowCount
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get DLQ items');
      res.status(500).json({ error: 'Failed to get DLQ items' });
    }
  });
});

// Retry DLQ item
router.post('/webhooks/dlq/:eventId/retry', async (req, res) => {
  return withSpan('webhook.dlq.retry', { event_id: req.params.eventId }, async () => {
    try {
      const { eventId } = req.params;

      // Reset webhook status to queued
      const result = await db.query(`
        UPDATE webhook_events
        SET status = 'queued', 
            retry_count = 0,
            processing_error = NULL,
            updated_at = now()
        WHERE event_id = $1 AND status = 'dlq'
        RETURNING *
      `, [eventId]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Webhook event not found in DLQ' });
      }

      const event = result.rows[0];

      // Re-queue for processing
      await temporalClient.start(handleWebhookWorkflow, {
        args: [{
          provider: event.provider,
          eventId: event.event_id,
          eventType: event.event_type,
          payload: event.payload
        }],
        taskQueue: 'webhooks',
        workflowId: `webhook-retry-${event.event_id}-${Date.now()}`,
        workflowIdReusePolicy: 'WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE'
      });

      metrics.increment('webhook_dlq_retry', { provider: event.provider });

      res.json({
        message: 'Webhook event re-queued for processing',
        eventId: event.event_id
      });

    } catch (error) {
      logger.error({ err: error, eventId: req.params.eventId }, 'Failed to retry DLQ item');
      res.status(500).json({ error: 'Failed to retry webhook' });
    }
  });
});

export { router as webhookRoutes };