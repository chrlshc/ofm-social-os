import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/server/db';
import { publishToSocial } from '@/server/social/publish-simple';
import { log } from '@/lib/observability';
import { requireHuntazeStripeOnboarding, requireHuntazeAuth } from '@/lib/huntaze-auth';
import { validateRequest, publishPostSchema, getPostsSchema } from '@/lib/validation';
import PgBoss from 'pg-boss';
import { env } from '@/lib/env';

// POST /api/social/publish - Create immediate or scheduled post
export async function POST(request: NextRequest) {
  const authResult = await requireHuntazeStripeOnboarding();
  if (authResult instanceof NextResponse) return authResult;
  
  const userId = authResult.id;
  
  try {
    const body = await request.json();
    const validation = await validateRequest(publishPostSchema, body);
    if ('error' in validation) return validation.error;
    
    const { platform, caption, media_url, scheduled_at, platform_specific } = validation.data;
    
    // Validate platform-specific requirements
    if (platform === 'reddit' && !platform_specific?.title) {
      return NextResponse.json(
        { error: 'Reddit posts require a title' },
        { status: 400 }
      );
    }
    
    if ((platform === 'instagram' || platform === 'tiktok') && !media_url) {
      return NextResponse.json(
        { error: `${platform} posts require media_url` },
        { status: 400 }
      );
    }
    
    // Check if user has connected account for this platform
    const accountResult = await pool.query(
      `SELECT id FROM social_publisher.platform_accounts 
       WHERE user_id = $1 AND platform = $2 
       AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [userId, platform]
    );
    
    if (accountResult.rows.length === 0) {
      return NextResponse.json(
        { error: `No active ${platform} account found. Please connect your account first.` },
        { status: 400 }
      );
    }
    
    const isScheduled = !!scheduled_at;
    const scheduledDate = scheduled_at ? new Date(scheduled_at) : new Date();
    
    // Insert post record
    const postResult = await pool.query(
      `INSERT INTO social_publisher.scheduled_posts 
       (owner_id, platform, caption, media_url, scheduled_at, status, platform_specific)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        userId,
        platform,
        caption,
        media_url,
        scheduledDate,
        isScheduled ? 'PENDING' : 'RUNNING',
        JSON.stringify(platform_specific)
      ]
    );
    
    const postId = postResult.rows[0].id;
    
    if (isScheduled) {
      // Schedule with pg-boss
      const boss = new PgBoss(env.DATABASE_URL_OFM_PRODUCTION);
      await boss.start();
      
      const jobId = await boss.send(
        'post:execute',
        { scheduled_post_id: postId },
        {
          startAfter: scheduledDate,
          retryLimit: 3,
          retryDelay: 30,
          retryBackoff: true,
          singletonKey: `post-${postId}`
        }
      );
      
      await boss.stop();
      
      log('info', 'Post scheduled', {
        post_id: postId,
        job_id: jobId,
        scheduled_at: scheduledDate,
        platform
      });
      
      return NextResponse.json({
        success: true,
        message: 'Post scheduled successfully',
        post_id: postId,
        scheduled_at: scheduledDate,
        job_id: jobId
      });
    } else {
      // Publish immediately
      try {
        const result = await publishToSocial({
          user_id: userId,
          platform,
          caption,
          media_url,
          platform_specific
        });
        
        // Update post status
        await pool.query(
          `UPDATE social_publisher.scheduled_posts 
           SET status = 'SUCCEEDED', 
               completed_at = NOW(),
               external_post_id = $2,
               external_post_url = $3
           WHERE id = $1`,
          [postId, result.external_id, result.external_url]
        );
        
        return NextResponse.json({
          success: true,
          message: 'Post published successfully',
          post_id: postId,
          external_url: result.external_url,
          external_id: result.external_id
        });
      } catch (error: any) {
        // Update post status to failed
        await pool.query(
          `UPDATE social_publisher.scheduled_posts 
           SET status = 'FAILED', 
               completed_at = NOW(),
               error_message = $2
           WHERE id = $1`,
          [postId, error.message]
        );
        
        throw error;
      }
    }
  } catch (error: any) {
    log('error', 'Publish error', { error: error.message, user_id: userId });
    return NextResponse.json(
      { 
        error: 'Failed to publish post', 
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      },
      { status: 500 }
    );
  }
}

// GET /api/social/publish - Get posts history
export async function GET(request: NextRequest) {
  const authResult = await requireHuntazeAuth();
  if (authResult instanceof NextResponse) return authResult;
  
  const userId = authResult.id;
  const searchParams = request.nextUrl.searchParams;
  
  const validation = await validateRequest(getPostsSchema, {
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
    status: searchParams.get('status'),
    platform: searchParams.get('platform'),
  });
  
  if ('error' in validation) return validation.error;
  
  const { limit, offset, status, platform } = validation.data;
  
  try {
    let query = `
      SELECT 
        id,
        platform,
        caption,
        media_url,
        scheduled_at,
        status,
        completed_at,
        external_post_id,
        external_post_url,
        error_message,
        created_at
      FROM social_publisher.scheduled_posts
      WHERE owner_id = $1
    `;
    
    const params: any[] = [userId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (platform) {
      query += ` AND platform = $${paramIndex}`;
      params.push(platform);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return NextResponse.json({
      success: true,
      posts: result.rows,
      pagination: {
        limit,
        offset,
        total: result.rowCount
      }
    });
    
  } catch (error: any) {
    log('error', 'Failed to fetch posts', { error: error.message, user_id: userId });
    return NextResponse.json(
      { error: 'Failed to fetch posts', message: error.message },
      { status: 500 }
    );
  }
}