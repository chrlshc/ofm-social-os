import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/server/db';
import { publishPost } from '@/server/social/publish';
import { logPostEvent } from '@/lib/observability';
import PgBoss from 'pg-boss';

// POST /api/social/publish - Publish immediately or schedule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      platform,
      caption,
      media_url,
      scheduled_at,
      platform_specific = {}
    } = body;
    
    // Validation
    if (!user_id || !platform || !caption) {
      return NextResponse.json(
        { error: 'user_id, platform, and caption are required' },
        { status: 400 }
      );
    }
    
    // Validate platform
    if (!['reddit', 'instagram', 'tiktok'].includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform. Must be reddit, instagram, or tiktok' },
        { status: 400 }
      );
    }
    
    // Validate media requirements
    if ((platform === 'instagram' || platform === 'tiktok') && !media_url) {
      return NextResponse.json(
        { error: `${platform} requires a media_url` },
        { status: 400 }
      );
    }
    
    const isScheduled = scheduled_at && new Date(scheduled_at) > new Date();
    
    // Create scheduled post record
    const insertResult = await pool.query(
      `INSERT INTO social_publisher.scheduled_posts 
       (owner_id, platform, caption, media_url, scheduled_at, meta_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        user_id,
        platform,
        caption,
        media_url || null,
        scheduled_at ? new Date(scheduled_at) : new Date(),
        JSON.stringify({ platform_specific }),
        isScheduled ? 'PENDING' : 'RUNNING'
      ]
    );
    
    const post = insertResult.rows[0];
    
    if (isScheduled) {
      // Schedule for later using pg-boss
      const databaseUrl = process.env.DATABASE_URL_OFM_PRODUCTION || 
                         process.env.DATABASE_URL_OFM_DEV || '';
      
      const boss = new PgBoss({
        connectionString: databaseUrl,
        schema: 'social_publisher'
      });
      
      await boss.start();
      
      try {
        const jobId = await boss.send('post:execute', 
          { scheduled_post_id: post.id }, 
          {
            startAfter: new Date(scheduled_at),
            singletonKey: `post-${post.id}`,
            retryLimit: 3,
            retryDelay: 30,
            retryBackoff: true
          }
        );
        
        await pool.query(
          'UPDATE social_publisher.scheduled_posts SET dedupe_key = $1 WHERE id = $2',
          [`job-${jobId}`, post.id]
        );
        
        return NextResponse.json({
          success: true,
          message: 'Post scheduled successfully',
          post_id: post.id,
          scheduled_at: scheduled_at,
          job_id: jobId
        });
        
      } finally {
        await boss.stop();
      }
      
    } else {
      // Publish immediately
      const result = await publishPost({
        scheduled_post_id: post.id,
        owner_id: user_id,
        platform: platform,
        caption: caption,
        media_url: media_url,
        meta: platform_specific
      });
      
      if (result.ok) {
        await pool.query(
          `UPDATE social_publisher.scheduled_posts 
           SET status = 'SUCCEEDED', 
               external_post_id = $2,
               external_post_url = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [post.id, result.externalId, result.externalUrl]
        );
        
        return NextResponse.json({
          success: true,
          message: 'Post published successfully',
          post_id: post.id,
          external_id: result.externalId,
          external_url: result.externalUrl
        });
        
      } else {
        await pool.query(
          `UPDATE social_publisher.scheduled_posts 
           SET status = 'FAILED', 
               error_message = $2,
               updated_at = NOW()
           WHERE id = $1`,
          [post.id, result.error]
        );
        
        return NextResponse.json(
          { 
            error: 'Failed to publish post',
            message: result.error,
            post_id: post.id
          },
          { status: 500 }
        );
      }
    }
    
  } catch (error: any) {
    console.error('Publish error:', error);
    
    // Log error
    await logPostEvent(pool, {
      level: 'error',
      message: 'publish_api_error',
      details: {
        error: error.message,
        stack: error.stack
      }
    });
    
    return NextResponse.json(
      { error: 'Failed to process request', message: error.message },
      { status: 500 }
    );
  }
}

// GET /api/social/publish - Get post history
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');
  const platform = searchParams.get('platform');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  
  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }
  
  try {
    let query = `
      SELECT 
        sp.*,
        pa.username as account_username,
        pa.platform as account_platform
      FROM social_publisher.scheduled_posts sp
      LEFT JOIN social_publisher.platform_accounts pa ON sp.platform_account_id = pa.id
      WHERE sp.owner_id = $1
    `;
    
    const params: any[] = [parseInt(userId)];
    let paramIdx = 1;
    
    if (platform) {
      paramIdx++;
      query += ` AND sp.platform = $${paramIdx}`;
      params.push(platform);
    }
    
    if (status) {
      paramIdx++;
      query += ` AND sp.status = $${paramIdx}`;
      params.push(status);
    }
    
    query += ` ORDER BY sp.scheduled_at DESC`;
    
    paramIdx++;
    query += ` LIMIT $${paramIdx}`;
    params.push(limit);
    
    paramIdx++;
    query += ` OFFSET $${paramIdx}`;
    params.push(offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `
      SELECT COUNT(*) 
      FROM social_publisher.scheduled_posts 
      WHERE owner_id = $1
    `;
    const countParams: any[] = [parseInt(userId)];
    let countIdx = 1;
    
    if (platform) {
      countIdx++;
      countQuery += ` AND platform = $${countIdx}`;
      countParams.push(platform);
    }
    
    if (status) {
      countIdx++;
      countQuery += ` AND status = $${countIdx}`;
      countParams.push(status);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    return NextResponse.json({
      success: true,
      posts: result.rows,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total
      }
    });
    
  } catch (error: any) {
    console.error('Failed to get posts:', error);
    return NextResponse.json(
      { error: 'Failed to get posts', message: error.message },
      { status: 500 }
    );
  }
}