import PgBoss from 'pg-boss';
import * as dotenv from 'dotenv';
import { pool } from './db';
import { setupPostJobs, schedulePostJob } from './jobs/post';
import { logPostEvent } from '../lib/observability';

dotenv.config();

// Get database URL
const databaseUrl = process.env.DATABASE_URL_OFM_PRODUCTION || 
                   process.env.DATABASE_URL_OFM_DEV || '';

if (!databaseUrl) {
  console.error('No database URL configured for worker');
  process.exit(1);
}


// Initialize pg-boss
async function startWorker() {
  console.log('Starting social media worker...');
  
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: 'social_publisher',
    // Worker settings
    deleteAfterDays: 30,
    maintenanceIntervalMinutes: 15,
    // Enhanced retry settings
    retryLimit: 3,
    retryDelay: 30, // 30 seconds initial delay
    retryBackoff: true, // Exponential backoff
    expireInHours: 24,
    // Connection pool for better performance
    max: 10,
  });

  // Handle shutdown gracefully
  const gracefulShutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    await boss.stop();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  try {
    await boss.start();
    console.log('pg-boss started successfully');

    // Setup post job handlers
    await setupPostJobs(boss);

    // Check for scheduled posts every minute
    setInterval(async () => {
      await checkAndQueueScheduledPosts(boss);
    }, 60000); // 1 minute

    // Run immediately on startup
    await checkAndQueueScheduledPosts(boss);

    console.log('Worker is running and listening for jobs...');
    
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Simplified job processing - moved to jobs/post.ts
async function checkAndQueueScheduledPosts(boss: PgBoss) {
  const { scheduled_post_id, platform, owner_id, caption, media_url, platform_account_id } = data;
  
  // Log job start with canonical format
  const startTime = Date.now();
  await logCanonical(
    scheduled_post_id, 
    'INFO', 
    createLogEntry(platform, `Starting publish job`, {
      correlation_id: `job-${jobId}`,
      request_id: `post-${scheduled_post_id}`,
      attempt: 1
    })
  );

  try {
    // Update post status to RUNNING
    await pool.query(
      'UPDATE scheduled_posts SET status = $1, attempts = attempts + 1 WHERE id = $2',
      ['RUNNING', scheduled_post_id]
    );

    // Get platform account with auto-refresh
    const account = await getAccountWithFreshToken(owner_id, platform, platform_account_id);
    
    // Decrypt access token
    const accessToken = decrypt(account.access_token_encrypted);
    
    // Get platform adapter
    const adapter = platformAdapters[platform];
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platform}`);
    }

    // Log before publish
    await logCanonical(
      scheduled_post_id,
      'INFO',
      createLogEntry(platform, 'Publishing to platform', {
        username: account.username,
        hasMedia: !!media_url,
        correlation_id: `job-${jobId}`,
        request_id: `post-${scheduled_post_id}`
      })
    );

    // Publish the post
    const result = await adapter.publishPost({
      accessToken,
      caption,
      mediaUrl: media_url,
      platformSpecific: data.platform_specific
    });

    if (result.success) {
      // Update post with success
      await pool.query(
        `UPDATE scheduled_posts 
         SET status = 'SUCCEEDED', 
             external_post_id = $1, 
             external_post_url = $2,
             meta_json = meta_json || $3::jsonb
         WHERE id = $4`,
        [
          result.externalId,
          result.externalUrl,
          JSON.stringify(result.metadata || {}),
          scheduled_post_id
        ]
      );

      const latency = Date.now() - startTime;
      await logCanonical(
        scheduled_post_id,
        'INFO',
        createLogEntry(platform, 'Post published successfully', {
          code: 'SUCCESS',
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          latency_ms: latency,
          correlation_id: `job-${jobId}`,
          request_id: `post-${scheduled_post_id}`
        })
      );

      console.log(`Successfully published post ${scheduled_post_id} to ${platform}`);
      
    } else {
      throw new Error(result.error || 'Unknown publishing error');
    }

  } catch (error: any) {
    console.error(`Failed to publish post ${scheduled_post_id}:`, error);
    
    // Log error with canonical format
    const latency = Date.now() - startTime;
    await logCanonical(
      scheduled_post_id,
      'ERROR',
      createErrorLogEntry(platform, error, {
        latency_ms: latency,
        correlation_id: `job-${jobId}`,
        request_id: `post-${scheduled_post_id}`,
        attempt: 1
      })
    );

    // Update post with failure
    await pool.query(
      `UPDATE scheduled_posts 
       SET status = 'FAILED', 
           error_message = $1
       WHERE id = $2`,
      [error.message, scheduled_post_id]
    );

    // Re-throw to trigger pg-boss retry
    throw error;
  }
}

async function _checkAndQueueScheduledPosts(boss: PgBoss) {
  try {
    // Find posts that should be published
    const result = await pool.query(
      `SELECT * FROM scheduled_posts 
       WHERE status = 'PENDING' 
       AND scheduled_at <= NOW() 
       ORDER BY scheduled_at ASC 
       LIMIT 100`
    );

    if (result.rows.length === 0) {
      return;
    }

    console.log(`Found ${result.rows.length} posts to publish`);

    for (const post of result.rows) {
      try {
        // Create job data
        const jobData: PublishPostJobData = {
          scheduled_post_id: post.id,
          platform: post.platform,
          owner_id: post.owner_id,
          caption: post.caption,
          media_url: post.media_url,
          platform_account_id: post.platform_account_id,
          platform_specific: post.meta_json?.platform_specific || {}
        };

        // Create dedupe key
        const dedupeKey = `post-${post.id}-${post.updated_at}`;

        // Queue the job with deduplication and retry settings
        const jobId = await boss.send('publish-post', jobData, {
          singletonKey: dedupeKey,
          singletonHours: 24,
          retryLimit: 3,
          retryDelay: 30,
          retryBackoff: true
        });

        console.log(`Queued job ${jobId} for post ${post.id}`);
        
        // Update dedupe key
        await pool.query(
          'UPDATE scheduled_posts SET dedupe_key = $1 WHERE id = $2',
          [dedupeKey, post.id]
        );

      } catch (error) {
        console.error(`Failed to queue post ${post.id}:`, error);
      }
    }

  } catch (error) {
    console.error('Failed to check scheduled posts:', error);
  }
}

// Helper to log to database
async function logToDb(
  scheduledPostId: number,
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  message: string,
  details?: any
) {
  try {
    await pool.query(
      'INSERT INTO post_logs (scheduled_post_id, level, message, details) VALUES ($1, $2, $3, $4)',
      [scheduledPostId, level, message, JSON.stringify(details || {})]
    );
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

// Start the worker
startWorker().catch(console.error);