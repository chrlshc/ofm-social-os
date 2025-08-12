import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { InstagramPublisher } from '../lib/platforms/instagram/publisher';
import { TikTokPublisher } from '../lib/platforms/tiktok/publisher';
import { XPublisher } from '../lib/platforms/x/publisher';
import { RedditPublisher } from '../lib/platforms/reddit/publisher';

interface PublishJobData {
  postId: string;
  platform: string;
  accountId: string;
  tokenId: string;
  accessToken: string;
  accountMeta: any;
  variantUrl?: string;
  caption: string;
  hashtags?: string[];
  mentions?: string[];
  location?: { lat: number; lng: number; placeId?: string };
}

// Rate limiter instances per token
const rateLimiters = new Map<string, { remaining: number; reset: Date }>();

export const publishWorker = new Worker<PublishJobData>(
  'publish',
  async (job: Job<PublishJobData>) => {
    const { postId, platform, tokenId, accessToken } = job.data;
    
    logger.info(`Processing publish job for ${platform}`, { postId, jobId: job.id });

    try {
      // Check rate limits
      const rateLimit = rateLimiters.get(tokenId);
      if (rateLimit && rateLimit.remaining === 0 && new Date() < rateLimit.reset) {
        const delayMs = rateLimit.reset.getTime() - Date.now();
        throw new Error(`Rate limited. Retry after ${delayMs}ms`);
      }

      // Update post status
      await db.query(`
        UPDATE posts SET status = 'publishing' WHERE id = $1
      `, [postId]);

      let result: any;

      switch (platform) {
        case 'instagram':
          result = await publishInstagram(job.data);
          break;
        
        case 'tiktok':
          result = await publishTikTok(job.data);
          break;
        
        case 'x':
          result = await publishX(job.data);
          break;
        
        case 'reddit':
          result = await publishReddit(job.data);
          break;
        
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Update post with success
      await db.query(`
        UPDATE posts 
        SET status = 'live', 
            remote_id = $1, 
            remote_url = $2,
            published_at = NOW(),
            container_ref = $3
        WHERE id = $4
      `, [result.remoteId, result.remoteUrl, result.containerId, postId]);

      // Update rate limit info if provided
      if (result.rateLimit) {
        rateLimiters.set(tokenId, {
          remaining: result.rateLimit.remaining,
          reset: new Date(result.rateLimit.reset * 1000)
        });

        await db.query(`
          UPDATE tokens 
          SET rate_limit_remaining = $1, rate_limit_reset = $2
          WHERE id = $3
        `, [result.rateLimit.remaining, new Date(result.rateLimit.reset * 1000), tokenId]);
      }

      logger.info(`Successfully published to ${platform}`, { postId, remoteId: result.remoteId });

      return result;

    } catch (error: any) {
      logger.error(`Failed to publish to ${platform}`, { postId, error: error.message });

      // Update post with failure
      await db.query(`
        UPDATE posts 
        SET status = 'failed', 
            error_message = $1,
            error_code = $2,
            retry_count = retry_count + 1
        WHERE id = $3
      `, [error.message, error.code || 'UNKNOWN', postId]);

      // Check if it's a rate limit error
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] || 3600;
        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
      }

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 jobs concurrently
    limiter: {
      max: 100,
      duration: 60000, // 100 jobs per minute max
    }
  }
);

async function publishInstagram(data: PublishJobData) {
  // Instagram Graph API two-step publish
  // Step 1: Create media container
  // Step 2: Publish container
  // Docs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
  
  const publisher = new InstagramPublisher(data.accessToken, data.accountMeta);
  
  // Create container
  const container = await publisher.createMediaContainer({
    mediaType: data.variantUrl?.endsWith('.mp4') ? 'VIDEO' : 'IMAGE',
    mediaUrl: data.variantUrl!,
    caption: formatCaption(data.caption, data.hashtags, data.mentions),
    locationId: data.location?.placeId
  });

  // Wait for processing (poll status)
  await publisher.waitForContainer(container.id);

  // Publish
  const result = await publisher.publishContainer(container.id);

  return {
    remoteId: result.id,
    remoteUrl: `https://www.instagram.com/p/${result.shortcode}/`,
    containerId: container.id,
    rateLimit: result.rateLimit
  };
}

async function publishTikTok(data: PublishJobData) {
  // TikTok Content Posting API
  // Direct post or chunk upload based on file size
  // Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
  
  const publisher = new TikTokPublisher(data.accessToken, data.accountMeta);
  
  // Initialize upload
  const upload = await publisher.initializeUpload({
    postInfo: {
      title: data.caption,
      privacyLevel: 'PUBLIC',
      duetDisabled: false,
      stitchDisabled: false,
      commentDisabled: false
    },
    sourceInfo: {
      source: 'FILE_UPLOAD',
      videoSize: 0 // Will be calculated
    }
  });

  // Upload video (chunk if > 64MB)
  await publisher.uploadVideo(upload.uploadId, data.variantUrl!);

  // Publish
  const result = await publisher.publish(upload.uploadId);

  return {
    remoteId: result.videoId,
    remoteUrl: result.shareUrl,
    containerId: upload.uploadId,
    rateLimit: result.rateLimit
  };
}

async function publishX(data: PublishJobData) {
  // X API v2 - Requires paid tier
  // Docs: https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
  
  const publisher = new XPublisher(data.accessToken);
  
  let mediaIds: string[] = [];
  
  // Upload media if present
  if (data.variantUrl) {
    const mediaId = await publisher.uploadMedia(data.variantUrl);
    mediaIds = [mediaId];
  }

  // Create tweet
  const tweet = await publisher.createTweet({
    text: formatCaption(data.caption, data.hashtags, data.mentions),
    media: mediaIds.length > 0 ? { media_ids: mediaIds } : undefined
  });

  return {
    remoteId: tweet.data.id,
    remoteUrl: `https://x.com/${data.accountMeta.username}/status/${tweet.data.id}`,
    rateLimit: tweet.rateLimit
  };
}

async function publishReddit(data: PublishJobData) {
  // Call Python microservice for Reddit
  // PRAW handles OAuth and rate limiting
  // Docs: https://praw.readthedocs.io/en/stable/
  
  const response = await fetch(`${process.env.REDDIT_SERVICE_URL}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': process.env.REDDIT_SERVICE_KEY!
    },
    body: JSON.stringify({
      accessToken: data.accessToken,
      subreddit: data.accountMeta.targetSubreddit || 'u_' + data.accountMeta.username,
      title: data.caption.slice(0, 300), // Reddit title limit
      url: data.variantUrl,
      text: data.caption
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Reddit publish failed');
  }

  const result = await response.json();

  return {
    remoteId: result.id,
    remoteUrl: result.url,
    rateLimit: {
      remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '100'),
      reset: parseInt(response.headers.get('X-RateLimit-Reset') || '0')
    }
  };
}

function formatCaption(caption: string, hashtags?: string[], mentions?: string[]): string {
  let formatted = caption;
  
  if (mentions && mentions.length > 0) {
    formatted = mentions.map(m => `@${m}`).join(' ') + ' ' + formatted;
  }
  
  if (hashtags && hashtags.length > 0) {
    formatted = formatted + '\n\n' + hashtags.map(h => `#${h}`).join(' ');
  }
  
  return formatted;
}

// Handle graceful shutdown
publishWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});

publishWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});