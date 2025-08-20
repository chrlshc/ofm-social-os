import type { NextApiRequest, NextApiResponse } from 'next';
import { pool } from '../../../server/db';
import PgBoss from 'pg-boss';
import { PublishPostJobData } from '../../../server/types';
import { z } from 'zod';

// Validation schema
const publishNowSchema = z.object({
  owner_id: z.number(),
  platform: z.enum(['reddit', 'instagram', 'tiktok']),
  caption: z.string().min(1).max(10000),
  media_url: z.string().url().optional(),
  platform_account_id: z.number().optional(),
  platform_specific: z.record(z.string(), z.any()).optional()
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request body
    const data = publishNowSchema.parse(req.body);
    
    // Create scheduled post record
    const insertResult = await pool.query(
      `INSERT INTO scheduled_posts 
       (owner_id, platform, caption, media_url, scheduled_at, platform_account_id, meta_json)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)
       RETURNING *`,
      [
        data.owner_id,
        data.platform,
        data.caption,
        data.media_url || null,
        data.platform_account_id || null,
        JSON.stringify({ platform_specific: data.platform_specific || {} })
      ]
    );
    
    const post = insertResult.rows[0];
    
    // Initialize pg-boss
    const databaseUrl = process.env.DATABASE_URL_OFM_PRODUCTION || 
                       process.env.DATABASE_URL_OFM_DEV || '';
    
    const boss = new PgBoss({
      connectionString: databaseUrl,
      schema: 'social_publisher'
    });
    
    await boss.start();
    
    try {
      // Queue the job with retry settings
      const jobId = await boss.send('post:execute', 
        { scheduled_post_id: post.id }, 
        {
          singletonKey: `post-${post.id}-immediate`,
          singletonHours: 24,
          retryLimit: 3,
          retryDelay: 30,
          retryBackoff: true
        }
      );
      
      // Update dedupe key
      await pool.query(
        'UPDATE scheduled_posts SET dedupe_key = $1 WHERE id = $2',
        [`post-${post.id}-immediate`, post.id]
      );
      
      res.status(200).json({
        success: true,
        post_id: post.id,
        job_id: jobId,
        status: 'queued',
        message: 'Post queued for immediate publishing'
      });
      
    } finally {
      await boss.stop();
    }
    
  } catch (error: any) {
    console.error('Publish now error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }
    
    res.status(500).json({
      error: 'Failed to publish post',
      message: error.message
    });
  }
}