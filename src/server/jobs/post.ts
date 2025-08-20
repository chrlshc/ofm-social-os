import PgBoss from 'pg-boss';
import { pool } from '../db';
import { publishPost } from '../social/publish';
import { logPostEvent } from '../../lib/observability';

export interface PostJobPayload {
  scheduled_post_id: number;
}

export async function setupPostJobs(boss: PgBoss) {
  // Register the post execution job
  await boss.work<PostJobPayload>('post:execute', async (job) => {
    const id = job.data.scheduled_post_id;
    const jobId = job.id;
    
    console.log(`[Job ${jobId}] Processing scheduled post ${id}`);
    
    try {
      // Get scheduled post details
      const { rows } = await pool.query(
        `SELECT * FROM social_publisher.scheduled_posts WHERE id = $1`,
        [id]
      );
      
      const scheduledPost = rows[0];
      if (!scheduledPost) {
        throw new Error(`Scheduled post ${id} not found`);
      }
      
      // Check if already processed
      if (scheduledPost.status === 'SUCCEEDED') {
        console.log(`[Job ${jobId}] Post ${id} already succeeded, skipping`);
        return;
      }
      
      // Update status to RUNNING
      await pool.query(
        `UPDATE social_publisher.scheduled_posts 
         SET status = 'RUNNING', 
             attempts = attempts + 1,
             updated_at = NOW() 
         WHERE id = $1`,
        [id]
      );
      
      // Log job start
      await logPostEvent(pool, {
        scheduled_post_id: id,
        level: 'info',
        message: 'job_started',
        details: {
          job_id: jobId,
          attempt: scheduledPost.attempts + 1,
          platform: scheduledPost.platform
        }
      });
      
      // Execute the publish through unified API
      const { ok, externalId, externalUrl, error } = await publishPost({
        scheduled_post_id: id,
        owner_id: scheduledPost.owner_id,
        platform: scheduledPost.platform,
        caption: scheduledPost.caption || undefined,
        media_url: scheduledPost.media_url || undefined,
        meta: scheduledPost.meta_json?.platform_specific || {}
      });
      
      if (ok) {
        // Update post with success
        await pool.query(
          `UPDATE social_publisher.scheduled_posts 
           SET status = 'SUCCEEDED', 
               external_post_id = $2, 
               external_post_url = $3,
               updated_at = NOW() 
           WHERE id = $1`,
          [id, externalId || null, externalUrl || null]
        );
        
        await logPostEvent(pool, {
          scheduled_post_id: id,
          level: 'info',
          message: 'job_completed',
          details: {
            job_id: jobId,
            external_id: externalId,
            external_url: externalUrl
          }
        });
        
        console.log(`[Job ${jobId}] Successfully published post ${id}`);
        
      } else {
        // Update with failure
        await pool.query(
          `UPDATE social_publisher.scheduled_posts 
           SET status = 'FAILED', 
               error_message = $2,
               updated_at = NOW() 
           WHERE id = $1`,
          [id, String(error || 'Unknown error')]
        );
        
        await logPostEvent(pool, {
          scheduled_post_id: id,
          level: 'error',
          message: 'job_failed',
          details: {
            job_id: jobId,
            error: error,
            will_retry: job.data.retryCount < job.data.retryLimit
          }
        });
        
        // Throw to trigger pg-boss retry
        throw new Error(String(error || 'Post publishing failed'));
      }
      
    } catch (error: any) {
      console.error(`[Job ${jobId}] Error processing post ${id}:`, error);
      
      // Log the error
      await logPostEvent(pool, {
        scheduled_post_id: id,
        level: 'error',
        message: 'job_error',
        details: {
          job_id: jobId,
          error: error.message,
          stack: error.stack
        }
      });
      
      // Re-throw for pg-boss retry mechanism
      throw error;
    }
  });
  
  console.log('Post job handlers registered');
}

// Helper to schedule a post job
export async function schedulePostJob(
  boss: PgBoss,
  scheduledPostId: number,
  scheduledAt?: Date
) {
  const jobOptions: PgBoss.SendOptions = {
    singletonKey: `post-${scheduledPostId}`,
    singletonHours: 24,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true
  };
  
  if (scheduledAt && scheduledAt > new Date()) {
    jobOptions.startAfter = scheduledAt;
  }
  
  const jobId = await boss.send('post:execute', 
    { scheduled_post_id: scheduledPostId }, 
    jobOptions
  );
  
  console.log(`Scheduled job ${jobId} for post ${scheduledPostId}`);
  
  return jobId;
}