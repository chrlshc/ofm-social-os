import { Counter, Histogram, Gauge, register } from 'prom-client';
import { loggers } from './logger';

const logger = loggers.metrics;

// Webhook metrics
export const webhookReceivedTotal = new Counter({
  name: 'webhook_received_total',
  help: 'Total number of webhooks received',
  labelNames: ['provider', 'event_type']
});

export const webhookSignatureErrors = new Counter({
  name: 'webhook_sig_errors_total',
  help: 'Total number of webhook signature verification errors',
  labelNames: ['provider']
});

export const webhookProcessingTime = new Histogram({
  name: 'webhook_lag_ms',
  help: 'Webhook processing time in milliseconds',
  labelNames: ['provider', 'event_type'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 30000]
});

export const webhookDLQDepth = new Gauge({
  name: 'webhook_dlq_depth',
  help: 'Number of webhooks in dead letter queue',
  labelNames: ['provider']
});

export const webhookAckTime = new Histogram({
  name: 'webhook_ack_time_ms',
  help: 'Time to acknowledge webhook in milliseconds',
  labelNames: ['provider'],
  buckets: [10, 50, 100, 200, 500, 1000]
});

// Rate limiting metrics
export const rateLimitHits = new Counter({
  name: 'webhook_rate_limited',
  help: 'Number of rate limited webhook requests',
  labelNames: ['provider']
});

// Webhook event metrics
export const webhookInvalidContentType = new Counter({
  name: 'webhook_invalid_content_type',
  help: 'Number of webhooks with invalid content type',
  labelNames: ['provider']
});

export const webhookMissingSignature = new Counter({
  name: 'webhook_missing_signature',
  help: 'Number of webhooks missing required signature',
  labelNames: ['provider']
});

export const webhookTimestampInvalid = new Counter({
  name: 'webhook_timestamp_invalid',
  help: 'Number of webhooks with timestamp outside tolerance',
  labelNames: ['provider']
});

export const webhookSignatureInvalid = new Counter({
  name: 'webhook_signature_invalid',
  help: 'Number of webhooks with invalid signature',
  labelNames: ['provider']
});

export const webhookDuplicate = new Counter({
  name: 'webhook_duplicate',
  help: 'Number of duplicate webhooks received',
  labelNames: ['provider']
});

export const webhookProcessingError = new Counter({
  name: 'webhook_processing_error',
  help: 'Number of webhook processing errors',
  labelNames: ['provider']
});

export const webhookTimeout = new Counter({
  name: 'webhook_timeout',
  help: 'Number of webhook processing timeouts',
  labelNames: ['provider']
});

// Platform-specific webhook metrics
export const tiktokWebhookProcessed = new Counter({
  name: 'tiktok_webhook_processed',
  help: 'Number of TikTok webhooks processed',
  labelNames: ['status']
});

export const metaWebhookProcessed = new Counter({
  name: 'meta_webhook_processed',
  help: 'Number of Meta/Instagram webhooks processed',
  labelNames: ['type']
});

export const instagramPrivateReplySent = new Counter({
  name: 'instagram_private_reply_sent',
  help: 'Number of Instagram private replies sent',
  labelNames: ['trigger']
});

export const instagramPrivateReplyFailed = new Counter({
  name: 'instagram_private_reply_failed',
  help: 'Number of Instagram private replies failed',
  labelNames: ['trigger']
});

export const webhookDLQRetry = new Counter({
  name: 'webhook_dlq_retry',
  help: 'Number of DLQ webhook retries',
  labelNames: ['provider']
});

export const postFailureNotification = new Counter({
  name: 'post_failure_notification',
  help: 'Number of post failure notifications sent',
  labelNames: ['platform']
});

export const webhookStatusUpdated = new Counter({
  name: 'webhook_status_updated',
  help: 'Number of webhook status updates',
  labelNames: ['status']
});

// Register all metrics
[
  webhookReceivedTotal,
  webhookSignatureErrors,
  webhookProcessingTime,
  webhookDLQDepth,
  webhookAckTime,
  rateLimitHits,
  webhookInvalidContentType,
  webhookMissingSignature,
  webhookTimestampInvalid,
  webhookSignatureInvalid,
  webhookDuplicate,
  webhookProcessingError,
  webhookTimeout,
  tiktokWebhookProcessed,
  metaWebhookProcessed,
  instagramPrivateReplySent,
  instagramPrivateReplyFailed,
  webhookDLQRetry,
  postFailureNotification,
  webhookStatusUpdated
].forEach(metric => register.registerMetric(metric));

// Metrics wrapper for easier usage
export const metrics = {
  increment: (name: string, labels?: Record<string, string>) => {
    try {
      const metric = register.getSingleMetric(name) as Counter<string>;
      if (metric) {
        metric.inc(labels || {});
      } else {
        logger.warn({ name }, 'Metric not found');
      }
    } catch (error) {
      logger.error({ err: error, name, labels }, 'Failed to increment metric');
    }
  },

  histogram: (name: string, value: number, labels?: Record<string, string>) => {
    try {
      const metric = register.getSingleMetric(name) as Histogram<string>;
      if (metric) {
        metric.observe(labels || {}, value);
      } else {
        logger.warn({ name }, 'Histogram not found');
      }
    } catch (error) {
      logger.error({ err: error, name, value, labels }, 'Failed to record histogram');
    }
  },

  gauge: (name: string, value: number, labels?: Record<string, string>) => {
    try {
      const metric = register.getSingleMetric(name) as Gauge<string>;
      if (metric) {
        metric.set(labels || {}, value);
      } else {
        logger.warn({ name }, 'Gauge not found');
      }
    } catch (error) {
      logger.error({ err: error, name, value, labels }, 'Failed to set gauge');
    }
  }
};

// Periodic DLQ depth update
export async function updateDLQMetrics(db: any): Promise<void> {
  try {
    const result = await db.query(`
      SELECT provider, COUNT(*) as count
      FROM webhook_events
      WHERE status = 'dlq'
      GROUP BY provider
    `);

    for (const row of result.rows) {
      webhookDLQDepth.set({ provider: row.provider }, parseInt(row.count));
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to update DLQ metrics');
  }
}