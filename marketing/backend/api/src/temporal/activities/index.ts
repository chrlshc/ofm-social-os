// Temporal Activities for publish workflow
// Activities are pure functions that interact with external systems
// Ref: https://docs.temporal.io/activities

import { Context } from '@temporalio/activity';
import { db } from '../../lib/db';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import * as otel from '../../lib/otel';
import { InstagramPublisher } from '../../lib/platforms/instagram/publisher';
import { TikTokPublisher } from '../../lib/platforms/tiktok/publisher';
import { XPublisher } from '../../lib/platforms/x/publisher';
import { createHash } from 'crypto';
import axios from 'axios';
import { ActivityFailure } from '@temporalio/common';

interface PolicyCheckInput {
  platform: string;
  variantUrl?: string;
  caption: string;
  hashtags?: string[];
  accountId: string;
  creatorId: string;
}

interface PolicyCheckResult {
  passed: boolean;
  violations: Array<{
    field: string;
    reason: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    field: string;
    reason: string;
  }>;
}

export async function policyCheck(input: PolicyCheckInput): Promise<PolicyCheckResult> {
  return await otel.withSpan('activity.policy_check', {
    'activity.name': 'policyCheck',
    'social.platform': input.platform,
    'social.account_id': input.accountId
  }, async (span) => {
    const violations: any[] = [];
    const warnings: any[] = [];

    // NSFW detection
    if (input.variantUrl) {
      const asset = await db.query(`
        SELECT a.metadata->>'nsfw_score' as nsfw_score
        FROM variants v
        JOIN assets a ON v.asset_id = a.id
        WHERE v.s3_url = $1
      `, [input.variantUrl]);

      const nsfwScore = parseFloat(asset.rows[0]?.nsfw_score || '0');
      if (nsfwScore > 0.7) {
        violations.push({
          field: 'content',
          reason: 'NSFW content detected',
          severity: 'error'
        });
      }
    }

    // Platform-specific checks
    switch (input.platform) {
      case 'instagram':
        if (input.caption.length > 2200) {
          violations.push({
            field: 'caption',
            reason: 'Exceeds 2200 characters (Instagram limit)',
            severity: 'error'
          });
        }
        if (input.hashtags && input.hashtags.length > 30) {
          violations.push({
            field: 'hashtags',
            reason: 'Maximum 30 hashtags allowed on Instagram',
            severity: 'error'
          });
        }
        break;

      case 'tiktok':
        // TikTok limits: Video caption 2200 UTF-16, Photo description 4000 UTF-16
        const mediaType = (input as any).mediaType || 'VIDEO'; // Default to VIDEO if not specified
        const tiktokLimit = mediaType === 'PHOTO' ? 4000 : 2200;
        const mediaTypeLabel = mediaType === 'PHOTO' ? 'description' : 'caption';
        
        if (input.caption.length > tiktokLimit) {
          violations.push({
            field: 'caption',
            reason: `Exceeds ${tiktokLimit} characters (TikTok ${mediaTypeLabel} limit for ${mediaType})`,
            severity: 'error'
          });
        }
        break;

      case 'x':
        // Check premium status for character limits
        const isPremium = await checkXPremiumStatus(input.accountId);
        const limit = isPremium ? 25000 : 280;
        
        if (input.caption.length > limit) {
          violations.push({
            field: 'caption',
            reason: `Exceeds ${limit} character limit (${isPremium ? 'Premium' : 'Standard'} account)`,
            severity: 'error'
          });
        }
        break;

      case 'reddit':
        const title = input.caption.split('\n')[0];
        if (title.length > 300) {
          violations.push({
            field: 'title',
            reason: 'Title exceeds 300 characters (Reddit limit)',
            severity: 'error'
          });
        }
        break;
    }

    span.setAttributes({
      'policy.violations_count': violations.length,
      'policy.warnings_count': warnings.length,
      'policy.passed': violations.length === 0
    });

    return {
      passed: violations.length === 0,
      violations,
      warnings
    };
  });
}

interface RateBudgetInput {
  accountId: string;
  platform: string;
  estimatedCost: number;
}

interface RateBudgetResult {
  success: boolean;
  reservationId?: string;
  reason?: string;
  retryAfter?: number;
}

export async function reserveRateBudget(input: RateBudgetInput): Promise<RateBudgetResult> {
  return await otel.withSpan('activity.reserve_rate_budget', {
    'activity.name': 'reserveRateBudget',
    'social.platform': input.platform,
    'social.account_id': input.accountId
  }, async (span) => {
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check current usage
    const usage = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '1 hour') as hour_count,
        COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '1 day') as day_count
      FROM posts 
      WHERE account_id = $1 AND status = 'live'
    `, [input.accountId]);

    const limits = {
      instagram: { hour: 25, day: 100 },
      tiktok: { 
        // TikTok uses 1-minute sliding window, 6 req/min per access_token for most endpoints
        minute: 6, 
        hour: 300,  // Conservative estimate based on 6/min * 50 active minutes
        day: 5000   // Account for pending shares limit (5 per 24h) + regular posts
      },
      x: { hour: 50, day: 300 },
      reddit: { hour: 10, day: 100 }
    };

    const platformLimits = limits[input.platform as keyof typeof limits];
    const { hour_count, day_count } = usage.rows[0];
    
    // TikTok sliding window check (1 minute)
    if (input.platform === 'tiktok') {
      const minuteUsage = await db.query(`
        SELECT COUNT(*) as minute_count
        FROM posts 
        WHERE account_id = $1 
        AND status = 'live'
        AND created_at > NOW() - INTERVAL '1 minute'
      `, [input.accountId]);
      
      const { minute_count } = minuteUsage.rows[0];
      if (minute_count >= platformLimits.minute) {
        throw new ActivityFailure(
          'Rate budget exceeded',
          'RATE_LIMIT_EXCEEDED',
          false,
          { 
            platform: input.platform,
            window: 'minute',
            current: minute_count,
            limit: platformLimits.minute,
            resetTime: Date.now() + 60000 // 1 minute
          }
        );
      }
    }

    if (hour_count >= platformLimits.hour || day_count >= platformLimits.day) {
      const retryAfter = hour_count >= platformLimits.hour ? 3600 : 86400;
      
      span.setAttributes({
        'rate_budget.exceeded': true,
        'rate_budget.hour_count': hour_count,
        'rate_budget.day_count': day_count,
        'rate_budget.retry_after': retryAfter
      });

      return {
        success: false,
        reason: `Rate limit exceeded: ${hour_count}/${platformLimits.hour} hourly, ${day_count}/${platformLimits.day} daily`,
        retryAfter
      };
    }

    // Reserve budget in Redis with TTL
    await redis.setex(`rate_budget:${reservationId}`, 3600, JSON.stringify({
      accountId: input.accountId,
      platform: input.platform,
      cost: input.estimatedCost,
      reservedAt: Date.now()
    }));

    span.setAttributes({
      'rate_budget.reserved': true,
      'rate_budget.reservation_id': reservationId,
      'rate_budget.remaining_hour': platformLimits.hour - hour_count - 1,
      'rate_budget.remaining_day': platformLimits.day - day_count - 1
    });

    return {
      success: true,
      reservationId
    };
  });
}

export async function rollbackRateBudget(reservationId: string): Promise<void> {
  await redis.del(`rate_budget:${reservationId}`);
  logger.info('Rate budget reservation rolled back', { reservationId });
}

// Platform-specific publish activities
export async function publishToInstagram(input: any): Promise<any> {
  const context = Context.current();
  
  return await otel.withSpan('activity.publish_instagram', {
    'activity.name': 'publishToInstagram',
    'social.platform': 'instagram'
  }, async (span) => {
    context.heartbeat('Starting Instagram publish');
    
    const publisher = new InstagramPublisher(axios.create());
    
    const publishInput = {
      accountId: input.accountId,
      caption: formatCaption(input.caption, input.hashtags),
      variantUrl: input.variantUrl,
      mediaType: input.variantUrl?.endsWith('.mp4') ? 'VIDEO' : 'PHOTO'
    };

    context.heartbeat('Publishing to Instagram');
    const result = await publisher.publish(publishInput);

    span.setAttribute('instagram.remote_id', result.remoteId);

    return {
      remoteId: result.remoteId,
      publishedAt: result.publishedAt,
      containerRef: result.containerRef,
      platform: 'instagram'
    };
  });
}

export async function publishToTikTok(input: any): Promise<any> {
  const context = Context.current();
  
  return await otel.withSpan('activity.publish_tiktok', {
    'activity.name': 'publishToTikTok',
    'social.platform': 'tiktok'
  }, async (span) => {
    context.heartbeat('Starting TikTok publish');
    
    const publisher = new TikTokPublisher(axios.create());
    
    const publishInput = {
      accountId: input.accountId,
      caption: input.caption,
      variantUrl: input.variantUrl,
      mediaType: input.variantUrl?.endsWith('.mp4') ? 'VIDEO' : 'PHOTO'
    };

    context.heartbeat('Publishing to TikTok');
    const result = await publisher.publish(publishInput);

    span.setAttribute('tiktok.remote_id', result.remoteId);

    return {
      remoteId: result.remoteId,
      publishedAt: result.publishedAt,
      containerRef: result.containerRef,
      platform: 'tiktok'
    };
  });
}

export async function publishToX(input: any): Promise<any> {
  const context = Context.current();
  
  return await otel.withSpan('activity.publish_x', {
    'activity.name': 'publishToX',
    'social.platform': 'x'
  }, async (span) => {
    context.heartbeat('Starting X publish');
    
    const publisher = new XPublisher(axios.create());
    
    const publishInput = {
      accountId: input.accountId,
      caption: input.caption,
      variantUrl: input.variantUrl,
      mediaType: input.variantUrl?.endsWith('.mp4') ? 'VIDEO' : 'PHOTO'
    };

    context.heartbeat('Publishing to X');
    const result = await publisher.publish(publishInput);

    span.setAttribute('x.remote_id', result.remoteId);

    return {
      remoteId: result.remoteId,
      publishedAt: result.publishedAt,
      platform: 'x'
    };
  });
}

export async function publishToReddit(input: any): Promise<any> {
  const context = Context.current();
  
  return await otel.withSpan('activity.publish_reddit', {
    'activity.name': 'publishToReddit',
    'social.platform': 'reddit'
  }, async (span) => {
    context.heartbeat('Starting Reddit publish');
    
    const response = await fetch(`${process.env.REDDIT_SERVICE_URL}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.REDDIT_SERVICE_KEY!
      },
      body: JSON.stringify({
        accessToken: input.accessToken,
        subreddit: input.subreddit || 'test',
        title: input.title,
        url: input.url,
        text: input.text
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Reddit publish failed');
    }

    const result = await response.json();
    
    span.setAttributes({
      'reddit.submission_id': result.id,
      'reddit.subreddit': input.subreddit
    });

    return {
      remoteId: result.id,
      remoteUrl: result.url,
      platform: 'reddit'
    };
  });
}

interface MetricsWaitInput {
  platform: string;
  remoteId: string;
  postId: string;
  maxWaitMinutes: number;
}

export async function awaitAckOrPollMetrics(input: MetricsWaitInput): Promise<any> {
  const context = Context.current();
  
  return await otel.withSpan('activity.await_metrics', {
    'activity.name': 'awaitAckOrPollMetrics',
    'social.platform': input.platform,
    'social.remote_id': input.remoteId
  }, async (span) => {
    const startTime = Date.now();
    const maxWaitMs = input.maxWaitMinutes * 60 * 1000;
    let metrics = null;

    // Check for webhook acknowledgment first
    const webhookKey = `webhook:${input.platform}:${input.remoteId}`;
    
    while (Date.now() - startTime < maxWaitMs) {
      context.heartbeat(`Waiting for metrics - ${Math.round((Date.now() - startTime) / 1000)}s elapsed`);
      
      // Check webhook
      const webhook = await redis.get(webhookKey);
      if (webhook) {
        metrics = JSON.parse(webhook);
        span.setAttribute('metrics.source', 'webhook');
        break;
      }

      // Poll metrics from platform API
      try {
        metrics = await pollPlatformMetrics(input.platform, input.remoteId, input.postId);
        if (metrics) {
          span.setAttribute('metrics.source', 'polling');
          break;
        }
      } catch (error: any) {
        logger.warn('Failed to poll metrics', { error: error.message, platform: input.platform });
      }

      // Wait 30 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    if (!metrics) {
      // Timeout - create placeholder metrics
      metrics = {
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        polledAt: new Date().toISOString(),
        timeout: true
      };
      span.setAttribute('metrics.timeout', true);
    }

    // Store metrics in database
    await db.query(`
      INSERT INTO metrics (post_id, ts, impressions, likes, comments, shares, saves)
      VALUES ($1, NOW(), $2, $3, $4, $5, $6)
    `, [
      input.postId,
      metrics.impressions || 0,
      metrics.likes || 0,
      metrics.comments || 0,
      metrics.shares || 0,
      metrics.saves || 0
    ]);

    return { metrics };
  });
}

export async function updatePostStatus(
  postId: string, 
  status: string, 
  error?: string | null,
  metadata?: any
): Promise<void> {
  const updates: any[] = [status, postId];
  let query = 'UPDATE posts SET status = $1, updated_at = NOW()';
  let paramIndex = 2;

  if (error !== undefined) {
    query += `, error_message = $${++paramIndex}`;
    updates.splice(-1, 0, error);
  }

  if (metadata) {
    if (metadata.remoteId) {
      query += `, remote_id = $${++paramIndex}`;
      updates.splice(-1, 0, metadata.remoteId);
    }
    if (metadata.remoteUrl) {
      query += `, remote_url = $${++paramIndex}`;
      updates.splice(-1, 0, metadata.remoteUrl);
    }
    if (metadata.containerId) {
      query += `, container_ref = $${++paramIndex}`;
      updates.splice(-1, 0, metadata.containerId);
    }
    if (metadata.publishedAt) {
      query += `, published_at = $${++paramIndex}`;
      updates.splice(-1, 0, metadata.publishedAt);
    }
  }

  query += ' WHERE id = $' + (updates.length);
  
  await db.query(query, updates);
  
  logger.info('Post status updated', { postId, status, error });
}

export async function logWorkflowEvent(data: {
  workflowId: string;
  eventType: string;
  data: any;
}): Promise<void> {
  await db.query(`
    INSERT INTO workflow_events (workflow_id, event_type, data, created_at)
    VALUES ($1, $2, $3, NOW())
  `, [data.workflowId, data.eventType, JSON.stringify(data.data)]);
}

// Helper functions
async function checkXPremiumStatus(accountId: string): Promise<boolean> {
  const result = await db.query(`
    SELECT meta->>'is_premium' as is_premium FROM accounts WHERE id = $1
  `, [accountId]);
  return result.rows[0]?.is_premium === 'true';
}

function formatCaption(caption: string, hashtags?: string[]): string {
  if (!hashtags || hashtags.length === 0) {
    return caption;
  }
  return `${caption}\n\n${hashtags.map(h => `#${h}`).join(' ')}`;
}

async function pollPlatformMetrics(platform: string, remoteId: string, postId: string): Promise<any> {
  // Implementation would depend on platform
  // For now, return null to indicate no metrics available
  return null;
}

// Export webhook activities
export * from './webhook';

// TODO-1: Add activity-specific error types for better retry logic
// TODO-2: Implement platform-specific metrics polling
// TODO-3: Add compensation activities for complex rollback scenarios