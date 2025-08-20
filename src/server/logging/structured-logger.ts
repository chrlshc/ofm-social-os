import { pool } from '../db';

export interface CanonicalLogEntry {
  platform: string;
  http_status?: number;
  code?: string;
  message: string;
  retryable?: boolean;
  attempt?: number;
  latency_ms?: number;
  correlation_id?: string;
  request_id?: string;
  sanitized: boolean;
  // Additional context
  [key: string]: any;
}

/**
 * Sanitize sensitive data from log entries
 */
function sanitizeLogData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sanitized = { ...data };
  const sensitiveKeys = [
    'access_token',
    'refresh_token',
    'password',
    'secret',
    'key',
    'authorization',
    'cookie'
  ];
  
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key contains sensitive data
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }
  
  return sanitized;
}

/**
 * Create a canonical log entry
 */
export function createLogEntry(
  platform: string,
  message: string,
  context: Partial<CanonicalLogEntry> = {}
): CanonicalLogEntry {
  const entry: CanonicalLogEntry = {
    platform,
    message,
    sanitized: true,
    ...context
  };
  
  // Ensure sanitization
  return sanitizeLogData(entry) as CanonicalLogEntry;
}

/**
 * Log to database with canonical format
 */
export async function logCanonical(
  scheduledPostId: number,
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  entry: CanonicalLogEntry
): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO social_publisher.post_logs (scheduled_post_id, level, message, details) VALUES ($1, $2, $3, $4)',
      [
        scheduledPostId,
        level,
        entry.message,
        JSON.stringify(entry)
      ]
    );
  } catch (error) {
    console.error('Failed to write canonical log:', error);
  }
}

/**
 * Create error log entry from Error object
 */
export function createErrorLogEntry(
  platform: string,
  error: any,
  context: Partial<CanonicalLogEntry> = {}
): CanonicalLogEntry {
  const entry: CanonicalLogEntry = {
    platform,
    message: error.message || 'Unknown error',
    code: error.code || 'UNKNOWN_ERROR',
    retryable: isRetryableError(error),
    sanitized: true,
    ...context
  };
  
  // Add HTTP status if available
  if (error.response?.status) {
    entry.http_status = error.response.status;
  }
  
  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    entry.stack = error.stack;
  }
  
  return sanitizeLogData(entry) as CanonicalLogEntry;
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ENOTFOUND') {
    return true;
  }
  
  // HTTP status codes
  const status = error.response?.status || error.status;
  if (status) {
    // 5xx errors are generally retryable
    if (status >= 500) return true;
    
    // 429 Too Many Requests is retryable after delay
    if (status === 429) return true;
    
    // 408 Request Timeout
    if (status === 408) return true;
  }
  
  // Platform-specific retryable errors
  const retryableCodes = [
    'RATE_LIMIT',
    'TIMEOUT',
    'PROCESSING',
    'TEMPORARY_ERROR'
  ];
  
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }
  
  return false;
}

/**
 * Log metrics from canonical logs
 */
export async function getLogMetrics(
  platform?: string,
  startTime?: Date,
  endTime?: Date
): Promise<{
  successRate: number;
  latencyP95: number;
  errorsByCode: Record<string, number>;
  retryRate: number;
}> {
  let query = `
    SELECT 
      COUNT(*) FILTER (WHERE details->>'code' IS NULL OR details->>'code' = 'SUCCESS') as success_count,
      COUNT(*) as total_count,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (details->>'latency_ms')::numeric) as latency_p95,
      COUNT(*) FILTER (WHERE (details->>'attempt')::int > 1) as retry_count,
      details->>'code' as error_code,
      COUNT(*) as code_count
    FROM social_publisher.post_logs
    WHERE level IN ('INFO', 'ERROR')
  `;
  
  const params: any[] = [];
  let paramCount = 0;
  
  if (platform) {
    paramCount++;
    query += ` AND details->>'platform' = $${paramCount}`;
    params.push(platform);
  }
  
  if (startTime) {
    paramCount++;
    query += ` AND created_at >= $${paramCount}`;
    params.push(startTime);
  }
  
  if (endTime) {
    paramCount++;
    query += ` AND created_at <= $${paramCount}`;
    params.push(endTime);
  }
  
  query += ` GROUP BY details->>'code'`;
  
  const result = await pool.query(query, params);
  
  // Aggregate metrics
  let totalCount = 0;
  let successCount = 0;
  let retryCount = 0;
  let latencies: number[] = [];
  const errorsByCode: Record<string, number> = {};
  
  for (const row of result.rows) {
    totalCount += parseInt(row.total_count);
    if (row.error_code === null || row.error_code === 'SUCCESS') {
      successCount += parseInt(row.success_count);
    } else {
      errorsByCode[row.error_code] = parseInt(row.code_count);
    }
    if (row.retry_count) {
      retryCount += parseInt(row.retry_count);
    }
    if (row.latency_p95) {
      latencies.push(parseFloat(row.latency_p95));
    }
  }
  
  return {
    successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 0,
    latencyP95: latencies.length > 0 ? Math.max(...latencies) : 0,
    errorsByCode,
    retryRate: totalCount > 0 ? (retryCount / totalCount) * 100 : 0
  };
}