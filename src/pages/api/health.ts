import type { NextApiRequest, NextApiResponse } from 'next';
import { pool } from '../../server/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW() as time, version() as version');
    const dbInfo = dbResult.rows[0];
    
    // Count posts
    const postsResult = await pool.query(
      'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'PENDING\') as pending FROM scheduled_posts'
    );
    const postStats = postsResult.rows[0];
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        time: dbInfo.time,
        version: dbInfo.version
      },
      posts: {
        total: parseInt(postStats.total),
        pending: parseInt(postStats.pending)
      },
      version: '1.0.0'
    });
    
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
}