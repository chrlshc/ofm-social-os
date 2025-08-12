import { proxyActivities, sleep, defineSignal, setHandler } from '@temporaljs/workflow';
import type * as activities from '../activities';

// Import activity types
const { 
  handleTikTokWebhook,
  handleMetaWebhook,
  updateWebhookStatus,
  mapWebhookToPost
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '5 seconds',
    backoffCoefficient: 2,
    maximumInterval: '2 minutes',
    maximumAttempts: 5,
    nonRetryableErrorTypes: ['ValidationError', 'SignatureError']
  }
});

export interface WebhookPayload {
  provider: 'tiktok' | 'meta';
  eventId: string;
  eventType: string;
  payload: any;
}

// Signal for manual retry
export const retrySignal = defineSignal('retry');

export async function handleWebhookWorkflow(webhook: WebhookPayload): Promise<void> {
  let shouldRetry = false;
  
  // Set up retry signal handler
  setHandler(retrySignal, () => {
    shouldRetry = true;
  });

  try {
    // Update status to processing
    await updateWebhookStatus({
      eventId: webhook.eventId,
      status: 'processing'
    });

    // Route to appropriate handler based on provider
    switch (webhook.provider) {
      case 'tiktok':
        await handleTikTokWebhookEvent(webhook);
        break;
        
      case 'meta':
        await handleMetaWebhookEvent(webhook);
        break;
        
      default:
        throw new Error(`Unknown webhook provider: ${webhook.provider}`);
    }

    // Mark as completed
    await updateWebhookStatus({
      eventId: webhook.eventId,
      status: 'completed',
      processedAt: new Date()
    });

  } catch (error) {
    // Check if we should retry manually
    if (shouldRetry) {
      shouldRetry = false;
      await sleep('10 seconds');
      return handleWebhookWorkflow(webhook); // Recursive retry
    }

    // Update status to failed
    await updateWebhookStatus({
      eventId: webhook.eventId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    });

    throw error;
  }
}

async function handleTikTokWebhookEvent(webhook: WebhookPayload): Promise<void> {
  const { eventType, payload } = webhook;

  switch (eventType) {
    case 'video.publish.complete':
      // Video published successfully
      await handleTikTokVideoPublished(payload);
      break;
      
    case 'video.publish.failed':
      // Video publishing failed
      await handleTikTokVideoFailed(payload);
      break;
      
    case 'video.moderation.update':
      // Video moderation status changed
      await handleTikTokModerationUpdate(payload);
      break;
      
    default:
      console.log(`Unhandled TikTok event type: ${eventType}`);
  }
}

async function handleMetaWebhookEvent(webhook: WebhookPayload): Promise<void> {
  const { eventType, payload } = webhook;

  switch (eventType) {
    case 'comments':
      // New comment on post
      await handleInstagramComment(payload);
      break;
      
    case 'mentions':
      // Account mentioned in post/comment
      await handleInstagramMention(payload);
      break;
      
    case 'messages':
      // New direct message (if permissions granted)
      await handleInstagramMessage(payload);
      break;
      
    default:
      console.log(`Unhandled Meta event type: ${eventType}`);
  }
}

async function handleTikTokVideoPublished(payload: any): Promise<void> {
  const videoId = payload.video?.id;
  const accountUsername = payload.account?.username;
  
  if (!videoId) {
    throw new Error('Missing video ID in TikTok webhook payload');
  }

  // Map webhook to internal post
  const mapping = await mapWebhookToPost({
    provider: 'tiktok',
    platformId: videoId,
    mappingType: 'post_status'
  });

  if (mapping?.postId) {
    // Update post status
    await handleTikTokWebhook({
      postId: mapping.postId,
      status: 'published',
      platformId: videoId,
      metrics: {
        views: payload.metrics?.view_count || 0,
        likes: payload.metrics?.like_count || 0,
        comments: payload.metrics?.comment_count || 0,
        shares: payload.metrics?.share_count || 0
      }
    });
  }
}

async function handleTikTokVideoFailed(payload: any): Promise<void> {
  const videoId = payload.video?.id;
  const errorCode = payload.error?.code;
  const errorMessage = payload.error?.message;
  
  if (!videoId) {
    throw new Error('Missing video ID in TikTok webhook payload');
  }

  // Map webhook to internal post
  const mapping = await mapWebhookToPost({
    provider: 'tiktok',
    platformId: videoId,
    mappingType: 'post_status'
  });

  if (mapping?.postId) {
    // Update post status
    await handleTikTokWebhook({
      postId: mapping.postId,
      status: 'failed',
      platformId: videoId,
      error: {
        code: errorCode,
        message: errorMessage,
        timestamp: new Date().toISOString()
      }
    });
  }
}

async function handleTikTokModerationUpdate(payload: any): Promise<void> {
  const videoId = payload.video?.id;
  const moderationStatus = payload.moderation?.status;
  const violations = payload.moderation?.violations || [];
  
  if (!videoId) {
    throw new Error('Missing video ID in TikTok webhook payload');
  }

  // Map webhook to internal post
  const mapping = await mapWebhookToPost({
    provider: 'tiktok',
    platformId: videoId,
    mappingType: 'post_status'
  });

  if (mapping?.postId) {
    // Update post with moderation info
    await handleTikTokWebhook({
      postId: mapping.postId,
      status: moderationStatus === 'approved' ? 'published' : 'moderation_failed',
      platformId: videoId,
      moderation: {
        status: moderationStatus,
        violations,
        reviewedAt: new Date().toISOString()
      }
    });
  }
}

async function handleInstagramComment(payload: any): Promise<void> {
  const mediaId = payload.media_id;
  const commentId = payload.id;
  const commentText = payload.text;
  const fromUsername = payload.from?.username;
  
  if (!mediaId || !commentId) {
    throw new Error('Missing media ID or comment ID in Instagram webhook');
  }

  // Check if we have a private reply rule for this account
  await handleMetaWebhook({
    type: 'comment',
    mediaId,
    commentId,
    text: commentText,
    from: {
      username: fromUsername,
      id: payload.from?.id
    },
    timestamp: payload.created_time
  });
}

async function handleInstagramMention(payload: any): Promise<void> {
  const mediaId = payload.media_id;
  const mentionId = payload.id;
  const caption = payload.caption;
  const fromUsername = payload.from?.username;
  
  if (!mediaId || !mentionId) {
    throw new Error('Missing media ID or mention ID in Instagram webhook');
  }

  // Process mention for potential response
  await handleMetaWebhook({
    type: 'mention',
    mediaId,
    mentionId,
    caption,
    from: {
      username: fromUsername,
      id: payload.from?.id
    },
    timestamp: payload.created_time
  });
}

async function handleInstagramMessage(payload: any): Promise<void> {
  const threadId = payload.thread_id;
  const messageId = payload.id;
  const messageText = payload.text;
  const fromUsername = payload.from?.username;
  
  if (!threadId || !messageId) {
    throw new Error('Missing thread ID or message ID in Instagram webhook');
  }

  // Process direct message
  await handleMetaWebhook({
    type: 'message',
    threadId,
    messageId,
    text: messageText,
    from: {
      username: fromUsername,
      id: payload.from?.id
    },
    timestamp: payload.created_time
  });
}

// Child workflow for processing webhook with retries
export async function processWebhookWithRetry(
  webhook: WebhookPayload,
  maxRetries: number = 5
): Promise<void> {
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt < maxRetries) {
    try {
      await handleWebhookWorkflow(webhook);
      return; // Success
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;
      
      if (attempt < maxRetries) {
        // Exponential backoff: 5s, 10s, 20s, 40s
        const backoffSeconds = 5 * Math.pow(2, attempt - 1);
        await sleep(`${backoffSeconds} seconds`);
      }
    }
  }

  // All retries exhausted
  if (lastError) {
    throw lastError;
  }
}