import type { NextApiRequest, NextApiResponse } from 'next';
import { pool } from '../../../../server/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  try {
    const postId = parseInt(id);
    
    // Get post details
    const postResult = await pool.query(
      'SELECT * FROM scheduled_posts WHERE id = $1',
      [postId]
    );
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const post = postResult.rows[0];
    
    // Get logs
    const logsResult = await pool.query(
      'SELECT * FROM post_logs WHERE scheduled_post_id = $1 ORDER BY created_at DESC',
      [postId]
    );
    
    res.status(200).json({
      post: {
        id: post.id,
        platform: post.platform,
        status: post.status,
        scheduled_at: post.scheduled_at,
        created_at: post.created_at,
        external_post_id: post.external_post_id,
        external_post_url: post.external_post_url,
        error_message: post.error_message,
        attempts: post.attempts
      },
      logs: logsResult.rows
    });
    
  } catch (error: any) {
    console.error('Get logs error:', error);
    res.status(500).json({
      error: 'Failed to retrieve logs',
      message: error.message
    });
  }
}