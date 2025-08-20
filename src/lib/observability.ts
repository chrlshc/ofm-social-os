import { Pool } from 'pg';

// Liste des clés sensibles à masquer
const SENSITIVE_KEYS = [
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'key',
  'authorization',
  'cookie',
  'api_key',
  'client_secret',
  'private_key'
];

// Masque les secrets connus dans les payloads loggués
function sanitize(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key contains sensitive data
      if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  return obj;
}

export interface LogEventArgs {
  scheduled_post_id?: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: any;
}

export async function logPostEvent(pool: Pool, args: LogEventArgs) {
  try {
    const sanitizedDetails = sanitize(args.details || {});
    
    // Add metadata
    const enrichedDetails = {
      ...sanitizedDetails,
      timestamp: new Date().toISOString(),
      sanitized: true,
      correlation_id: sanitizedDetails.correlation_id || generateCorrelationId(),
    };
    
    await pool.query(
      `INSERT INTO social_publisher.post_logs 
       (scheduled_post_id, level, message, details)
       VALUES ($1, $2, $3, $4)`,
      [
        args.scheduled_post_id ?? null,
        args.level.toUpperCase(),
        args.message,
        JSON.stringify(enrichedDetails)
      ]
    );
  } catch (error) {
    console.error('Failed to log event:', error);
    // Don't throw - logging should not break the main flow
  }
}

// Generate correlation ID for tracing
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Structured metrics extraction
export interface PostMetrics {
  successRate: number;
  averageLatency: number;
  p95Latency: number;
  errorsByCode: Record<string, number>;
  postsByPlatform: Record<string, number>;
  retryRate: number;
}

export async function getPostMetrics(
  pool: Pool,
  startDate?: Date,
  endDate?: Date,
  platform?: string
): Promise<PostMetrics> {
  let query = `
    WITH metrics AS (
      SELECT 
        scheduled_post_id,
        level,
        message,
        details->>'platform' as platform,
        details->>'latency_ms' as latency_ms,
        details->>'error' as error,
        details->>'retryable' as retryable,
        created_at
      FROM social_publisher.post_logs
      WHERE 1=1
  `;
  
  const params: any[] = [];
  let paramIdx = 0;
  
  if (startDate) {
    paramIdx++;
    query += ` AND created_at >= $${paramIdx}`;
    params.push(startDate);
  }
  
  if (endDate) {
    paramIdx++;
    query += ` AND created_at <= $${paramIdx}`;
    params.push(endDate);
  }
  
  if (platform) {
    paramIdx++;
    query += ` AND details->>'platform' = $${paramIdx}`;
    params.push(platform);
  }
  
  query += `
    )
    SELECT 
      COUNT(*) FILTER (WHERE message = 'publish_succeeded') as success_count,
      COUNT(*) FILTER (WHERE message IN ('publish_succeeded', 'publish_failed')) as total_count,
      AVG((latency_ms)::numeric) FILTER (WHERE latency_ms IS NOT NULL) as avg_latency,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (latency_ms)::numeric) FILTER (WHERE latency_ms IS NOT NULL) as p95_latency,
      COUNT(*) FILTER (WHERE retryable = 'true') as retry_count,
      platform,
      error,
      COUNT(*) as count
    FROM metrics
    GROUP BY platform, error
  `;
  
  const result = await pool.query(query, params);
  
  // Aggregate results
  let totalSuccess = 0;
  let totalCount = 0;
  let totalRetries = 0;
  let latencies: number[] = [];
  const errorsByCode: Record<string, number> = {};
  const postsByPlatform: Record<string, number> = {};
  
  for (const row of result.rows) {
    if (row.platform) {
      postsByPlatform[row.platform] = (postsByPlatform[row.platform] || 0) + parseInt(row.count);
    }
    
    totalSuccess += parseInt(row.success_count || 0);
    totalCount += parseInt(row.total_count || 0);
    totalRetries += parseInt(row.retry_count || 0);
    
    if (row.avg_latency) {
      latencies.push(parseFloat(row.avg_latency));
    }
    
    if (row.error && row.error !== 'null') {
      const errorKey = row.error.split(':')[0].trim(); // Extract error type
      errorsByCode[errorKey] = (errorsByCode[errorKey] || 0) + parseInt(row.count);
    }
  }
  
  const avgLatency = latencies.length > 0 
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
    : 0;
    
  const p95Latency = result.rows[0]?.p95_latency 
    ? parseFloat(result.rows[0].p95_latency) 
    : 0;
  
  return {
    successRate: totalCount > 0 ? (totalSuccess / totalCount) * 100 : 0,
    averageLatency: Math.round(avgLatency),
    p95Latency: Math.round(p95Latency),
    errorsByCode,
    postsByPlatform,
    retryRate: totalCount > 0 ? (totalRetries / totalCount) * 100 : 0
  };
}