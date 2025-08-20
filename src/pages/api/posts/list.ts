import type { NextApiRequest, NextApiResponse } from 'next';
import { pool } from '../../../server/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      owner_id, 
      platform, 
      status, 
      limit = '50', 
      offset = '0' 
    } = req.query;
    
    // Build query
    let query = 'SELECT * FROM scheduled_posts WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;
    
    if (owner_id) {
      paramCount++;
      query += ` AND owner_id = $${paramCount}`;
      params.push(parseInt(owner_id as string));
    }
    
    if (platform) {
      paramCount++;
      query += ` AND platform = $${paramCount}`;
      params.push(platform);
    }
    
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    
    query += ' ORDER BY scheduled_at DESC';
    
    // Add pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit as string));
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset as string));
    
    // Execute query
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM scheduled_posts WHERE 1=1';
    const countParams: any[] = [];
    let countParamCount = 0;
    
    if (owner_id) {
      countParamCount++;
      countQuery += ` AND owner_id = $${countParamCount}`;
      countParams.push(parseInt(owner_id as string));
    }
    
    if (platform) {
      countParamCount++;
      countQuery += ` AND platform = $${countParamCount}`;
      countParams.push(platform);
    }
    
    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.status(200).json({
      posts: result.rows,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        has_more: parseInt(offset as string) + parseInt(limit as string) < total
      }
    });
    
  } catch (error: any) {
    console.error('List posts error:', error);
    res.status(500).json({
      error: 'Failed to list posts',
      message: error.message
    });
  }
}