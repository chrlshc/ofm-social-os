import type { NextApiRequest, NextApiResponse } from 'next';
import { pool } from '../../../server/db';
import { z } from 'zod';

// Validation schema
const schedulePostSchema = z.object({
  owner_id: z.number(),
  platform: z.enum(['reddit', 'instagram', 'tiktok']),
  caption: z.string().min(1).max(10000),
  media_url: z.string().url().optional(),
  scheduled_at: z.string().datetime(),
  platform_account_id: z.number().optional(),
  platform_specific: z.record(z.string(), z.any()).optional()
}).refine(data => {
  // Validate media requirements per platform
  if ((data.platform === 'instagram' || data.platform === 'tiktok') && !data.media_url) {
    return false;
  }
  return true;
}, {
  message: "Instagram and TikTok require a media_url",
  path: ["media_url"]
}).refine(data => {
  // Ensure scheduled time is in the future
  const scheduledTime = new Date(data.scheduled_at);
  return scheduledTime > new Date();
}, {
  message: "Scheduled time must be in the future",
  path: ["scheduled_at"]
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
    const data = schedulePostSchema.parse(req.body);
    
    // Create dedupe key to prevent duplicates
    const dedupeKey = `${data.owner_id}-${data.platform}-${data.scheduled_at}-${data.caption.slice(0, 50)}`;
    
    // Create scheduled post record
    const insertResult = await pool.query(
      `INSERT INTO scheduled_posts 
       (owner_id, platform, caption, media_url, scheduled_at, platform_account_id, meta_json, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (dedupe_key) DO UPDATE 
       SET caption = EXCLUDED.caption,
           media_url = EXCLUDED.media_url,
           meta_json = EXCLUDED.meta_json,
           updated_at = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [
        data.owner_id,
        data.platform,
        data.caption,
        data.media_url || null,
        data.scheduled_at,
        data.platform_account_id || null,
        JSON.stringify({ platform_specific: data.platform_specific || {} }),
        dedupeKey
      ]
    );
    
    const post = insertResult.rows[0];
    const wasInserted = post.inserted;
    
    res.status(wasInserted ? 201 : 200).json({
      success: true,
      post_id: post.id,
      platform: post.platform,
      scheduled_at: post.scheduled_at,
      status: post.status,
      message: wasInserted ? 'Post scheduled successfully' : 'Post updated successfully',
      was_updated: !wasInserted
    });
    
  } catch (error: any) {
    console.error('Schedule post error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }
    
    res.status(500).json({
      error: 'Failed to schedule post',
      message: error.message
    });
  }
}