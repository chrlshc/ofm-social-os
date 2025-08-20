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

// Initialize pg-boss and start worker
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

// Check for scheduled posts and queue them
async function checkAndQueueScheduledPosts(boss: PgBoss) {
  try {
    // Find posts that should be published
    const result = await pool.query(
      `SELECT * FROM social_publisher.scheduled_posts 
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
        // Schedule the job
        const jobId = await schedulePostJob(boss, post.id);
        
        // Update dedupe key
        await pool.query(
          'UPDATE social_publisher.scheduled_posts SET dedupe_key = $1 WHERE id = $2',
          [`job-${jobId}`, post.id]
        );
        
        console.log(`Queued job ${jobId} for post ${post.id}`);

      } catch (error) {
        console.error(`Failed to queue post ${post.id}:`, error);
        
        // Log the error
        await logPostEvent(pool, {
          scheduled_post_id: post.id,
          level: 'error',
          message: 'queue_failed',
          details: {
            error: String(error)
          }
        });
      }
    }

  } catch (error) {
    console.error('Failed to check scheduled posts:', error);
  }
}

// Start the worker
startWorker().catch(console.error);