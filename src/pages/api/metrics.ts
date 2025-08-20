import type { NextApiRequest, NextApiResponse } from 'next';
import { getPostMetrics } from '../../lib/observability';
import { pool } from '../../server/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { platform, start_date, end_date } = req.query;
    
    const startTime = start_date ? new Date(start_date as string) : undefined;
    const endTime = end_date ? new Date(end_date as string) : undefined;
    
    const metrics = await getPostMetrics(
      pool,
      startTime,
      endTime,
      platform as string | undefined
    );
    
    res.status(200).json({
      success: true,
      metrics: {
        success_rate: `${metrics.successRate.toFixed(2)}%`,
        average_latency_ms: metrics.averageLatency,
        p95_latency_ms: metrics.p95Latency,
        retry_rate: `${metrics.retryRate.toFixed(2)}%`,
        errors_by_code: metrics.errorsByCode,
        posts_by_platform: metrics.postsByPlatform
      },
      filters: {
        platform: platform || 'all',
        start_date: startTime?.toISOString() || 'none',
        end_date: endTime?.toISOString() || 'none'
      }
    });
    
  } catch (error: any) {
    console.error('Metrics error:', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
}