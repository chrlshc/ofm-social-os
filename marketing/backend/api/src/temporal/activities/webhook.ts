import { Context } from '@temporaljs/activity';
import { db } from '../../lib/db';
import { loggers } from '../../lib/logger';
import { metrics } from '../../lib/metrics';
import { redisUtils } from '../../lib/redis';
import { instagramPrivateReply } from '../../lib/platforms/instagram/private-reply';

const logger = loggers.webhook.child({ component: 'webhook-activities' });

// Update webhook event status in database
export async function updateWebhookStatus(params: {
  eventId: string;
  status: string;
  processedAt?: Date;
  error?: string;
}): Promise<void> {
  const { eventId, status, processedAt, error } = params;

  try {
    await db.query(`
      UPDATE webhook_events
      SET status = $2,
          processed_at = $3,
          processing_error = $4,
          retry_count = CASE 
            WHEN $2 = 'failed' THEN retry_count + 1 
            ELSE retry_count 
          END,
          updated_at = now()
      WHERE event_id = $1
    `, [eventId, status, processedAt || null, error || null]);

    metrics.increment('webhook_status_updated', { status });
    
  } catch (err) {
    logger.error({ err, eventId, status }, 'Failed to update webhook status');
    throw err;
  }
}

// Map webhook event to internal post
export async function mapWebhookToPost(params: {
  provider: string;
  platformId: string;
  mappingType: string;
}): Promise<{ postId: string; accountId: string } | null> {
  const { provider, platformId, mappingType } = params;

  try {
    const result = await db.query(`
      SELECT post_id, account_id
      FROM webhook_mappings
      WHERE provider = $1 
        AND platform_id = $2 
        AND mapping_type = $3
      LIMIT 1
    `, [provider, platformId, mappingType]);

    if (result.rows.length === 0) {
      logger.debug({ provider, platformId, mappingType }, 'No webhook mapping found');
      return null;
    }

    return {
      postId: result.rows[0].post_id,
      accountId: result.rows[0].account_id
    };

  } catch (err) {
    logger.error({ err, provider, platformId }, 'Failed to map webhook to post');
    throw err;
  }
}

// Handle TikTok webhook events
export async function handleTikTokWebhook(params: {
  postId: string;
  status: string;
  platformId: string;
  metrics?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  error?: {
    code: string;
    message: string;
    timestamp: string;
  };
  moderation?: {
    status: string;
    violations: string[];
    reviewedAt: string;
  };
}): Promise<void> {
  const { postId, status, platformId, metrics: postMetrics, error, moderation } = params;

  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');

    // Update post status
    await client.query(`
      UPDATE posts
      SET status = $2,
          remote_id = $3,
          updated_at = now(),
          metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
      WHERE id = $1
    `, [
      postId, 
      status, 
      platformId,
      JSON.stringify({
        ...(postMetrics && { metrics: postMetrics }),
        ...(error && { error }),
        ...(moderation && { moderation }),
        lastWebhookUpdate: new Date().toISOString()
      })
    ]);

    // Log webhook processing
    await client.query(`
      INSERT INTO audit_logs (
        actor_type, actor_id, action, resource_type, resource_id, details
      ) VALUES (
        'webhook', $1, $2, 'post', $3, $4
      )
    `, [
      'tiktok',
      `webhook.tiktok.${status}`,
      postId,
      JSON.stringify({ platformId, status, metrics: postMetrics, error, moderation })
    ]);

    await client.query('COMMIT');

    // Update metrics
    metrics.increment('tiktok_webhook_processed', { status });

    // Send notification if failed
    if (status === 'failed' && error) {
      await notifyPostFailure(postId, 'tiktok', error.message);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, postId, status }, 'Failed to handle TikTok webhook');
    throw err;
  } finally {
    client.release();
  }
}

// Handle Meta/Instagram webhook events
export async function handleMetaWebhook(params: {
  type: 'comment' | 'mention' | 'message';
  mediaId?: string;
  commentId?: string;
  mentionId?: string;
  messageId?: string;
  threadId?: string;
  text?: string;
  caption?: string;
  from: {
    username: string;
    id: string;
  };
  timestamp: string;
}): Promise<void> {
  const { type, from } = params;

  try {
    // Get account by platform ID
    const accountResult = await db.query(`
      SELECT a.id, a.creator_id, a.access_token, c.metadata->>'private_reply_enabled' as private_reply_enabled
      FROM accounts a
      JOIN creators c ON a.creator_id = c.id
      WHERE a.platform = 'instagram' 
        AND a.status = 'active'
        AND (a.metadata->>'instagram_user_id' = $1 OR a.platform_account_id = $1)
      LIMIT 1
    `, [from.id]);

    if (accountResult.rows.length === 0) {
      logger.debug({ fromId: from.id }, 'No active Instagram account found for webhook');
      return;
    }

    const account = accountResult.rows[0];
    
    // Check if private reply is enabled
    if (account.private_reply_enabled !== 'true') {
      logger.debug({ accountId: account.id }, 'Private reply not enabled for account');
      return;
    }

    // Handle based on type
    switch (type) {
      case 'comment':
        await handleCommentReply(params, account);
        break;
        
      case 'mention':
        await handleMentionReply(params, account);
        break;
        
      case 'message':
        // DMs handled separately if enabled
        logger.info({ accountId: account.id }, 'Direct message webhook received');
        break;
    }

    metrics.increment('meta_webhook_processed', { type });

  } catch (err) {
    logger.error({ err, type }, 'Failed to handle Meta webhook');
    throw err;
  }
}

async function handleCommentReply(
  params: any, 
  account: any
): Promise<void> {
  const { commentId, text, from, mediaId } = params;

  // Check if we should auto-reply
  const shouldReply = await checkAutoReplyRules(account.creator_id, text, 'comment');
  
  if (!shouldReply) {
    return;
  }

  // Get reply message
  const replyMessage = await getAutoReplyMessage(account.creator_id, 'comment');
  
  if (!replyMessage) {
    return;
  }

  // Send private reply
  try {
    await instagramPrivateReply.sendPrivateReply(
      account.access_token,
      commentId,
      replyMessage
    );

    // Log the reply
    await db.query(`
      INSERT INTO dm_history (
        account_id, recipient_username, message_content, 
        sent_at, status, metadata
      ) VALUES ($1, $2, $3, now(), 'sent', $4)
    `, [
      account.id,
      from.username,
      replyMessage,
      JSON.stringify({
        type: 'private_reply',
        trigger: 'comment',
        commentId,
        mediaId
      })
    ]);

    metrics.increment('instagram_private_reply_sent', { trigger: 'comment' });

  } catch (err) {
    logger.error({ err, commentId }, 'Failed to send private reply');
    metrics.increment('instagram_private_reply_failed', { trigger: 'comment' });
  }
}

async function handleMentionReply(
  params: any,
  account: any
): Promise<void> {
  const { mentionId, caption, from, mediaId } = params;

  // Check if we should auto-reply to mentions
  const shouldReply = await checkAutoReplyRules(account.creator_id, caption, 'mention');
  
  if (!shouldReply) {
    return;
  }

  // Get reply message
  const replyMessage = await getAutoReplyMessage(account.creator_id, 'mention');
  
  if (!replyMessage) {
    return;
  }

  // For mentions, we might comment on the post instead of private reply
  // This depends on business rules
  logger.info({ 
    mentionId, 
    from: from.username 
  }, 'Mention received, private reply not implemented for mentions');
}

async function checkAutoReplyRules(
  creatorId: string,
  text: string,
  triggerType: string
): Promise<boolean> {
  // Check Redis cache for rules
  const cacheKey = `auto_reply:${creatorId}:${triggerType}`;
  const cachedRules = await redisUtils.get(cacheKey);
  
  if (cachedRules) {
    return evaluateRules(JSON.parse(cachedRules), text);
  }

  // Get rules from database
  const result = await db.query(`
    SELECT rules
    FROM auto_reply_config
    WHERE creator_id = $1 
      AND trigger_type = $2 
      AND enabled = true
    LIMIT 1
  `, [creatorId, triggerType]);

  if (result.rows.length === 0) {
    return false;
  }

  const rules = result.rows[0].rules;
  
  // Cache for 5 minutes
  await redisUtils.set(cacheKey, JSON.stringify(rules), 300);
  
  return evaluateRules(rules, text);
}

function evaluateRules(rules: any, text: string): boolean {
  // Simple keyword matching for now
  if (rules.keywords && Array.isArray(rules.keywords)) {
    const lowerText = text.toLowerCase();
    return rules.keywords.some((keyword: string) => 
      lowerText.includes(keyword.toLowerCase())
    );
  }
  
  // Default to true if no specific rules
  return true;
}

async function getAutoReplyMessage(
  creatorId: string,
  triggerType: string
): Promise<string | null> {
  const result = await db.query(`
    SELECT message_template
    FROM auto_reply_config
    WHERE creator_id = $1 
      AND trigger_type = $2 
      AND enabled = true
    LIMIT 1
  `, [creatorId, triggerType]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].message_template;
}

async function notifyPostFailure(
  postId: string,
  platform: string,
  errorMessage: string
): Promise<void> {
  // This would integrate with your notification system
  // For now, just log it
  logger.error({
    postId,
    platform,
    error: errorMessage
  }, 'Post publishing failed via webhook');
  
  // Could send email, Slack notification, etc.
  metrics.increment('post_failure_notification', { platform });
}