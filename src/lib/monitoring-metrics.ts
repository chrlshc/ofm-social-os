import { pool } from '@/server/db';

export interface SecurityMetrics {
  authSuccessRate: number;
  csrfBlockRate: number;
  kmsFailoverRate: number;
  avgSessionDuration: number;
  timestamp: Date;
}

export async function collectSecurityMetrics(): Promise<SecurityMetrics> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  try {
    // Auth success rate
    const authResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE level = 'INFO' AND message = 'auth_success') as success,
        COUNT(*) FILTER (WHERE level = 'ERROR' AND message LIKE 'auth_%') as failures
      FROM social_publisher.post_logs
      WHERE created_at > $1
    `, [oneDayAgo]);
    
    const authStats = authResult.rows[0];
    const authTotal = parseInt(authStats.success) + parseInt(authStats.failures);
    const authSuccessRate = authTotal > 0 ? (parseInt(authStats.success) / authTotal) * 100 : 100;
    
    // CSRF block rate
    const csrfResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE message = 'csrf_blocked') as blocked,
        COUNT(*) FILTER (WHERE message LIKE 'request_%') as total
      FROM social_publisher.post_logs
      WHERE created_at > $1
    `, [oneDayAgo]);
    
    const csrfStats = csrfResult.rows[0];
    const csrfBlockRate = parseInt(csrfStats.total) > 0 
      ? (parseInt(csrfStats.blocked) / parseInt(csrfStats.total)) * 100 
      : 0;
    
    // KMS failover rate
    const kmsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE message = 'kms_fallback') as fallbacks,
        COUNT(*) FILTER (WHERE message LIKE 'encrypt_%') as total
      FROM social_publisher.post_logs
      WHERE created_at > $1
    `, [oneDayAgo]);
    
    const kmsStats = kmsResult.rows[0];
    const kmsFailoverRate = parseInt(kmsStats.total) > 0
      ? (parseInt(kmsStats.fallbacks) / parseInt(kmsStats.total)) * 100
      : 0;
    
    // Average session duration
    const sessionResult = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (logout_at - login_at))) as avg_duration
      FROM user_sessions
      WHERE login_at > $1 AND logout_at IS NOT NULL
    `, [oneDayAgo]);
    
    const avgSessionDuration = parseFloat(sessionResult.rows[0]?.avg_duration || '0') / 60; // in minutes
    
    return {
      authSuccessRate,
      csrfBlockRate,
      kmsFailoverRate,
      avgSessionDuration,
      timestamp: now
    };
  } catch (error) {
    console.error('Failed to collect security metrics:', error);
    return {
      authSuccessRate: 0,
      csrfBlockRate: 0,
      kmsFailoverRate: 0,
      avgSessionDuration: 0,
      timestamp: now
    };
  }
}

// Alerts configuration
export const SECURITY_THRESHOLDS = {
  MIN_AUTH_SUCCESS_RATE: 99.5,
  MAX_CSRF_BLOCK_RATE: 0.1, // 0.1% max false positives
  MAX_KMS_FAILOVER_RATE: 1.0, // 1% max failovers
  ANOMALY_SESSION_DURATION: 480 // 8 hours max normal session
};

export async function checkSecurityAlerts(metrics: SecurityMetrics): Promise<string[]> {
  const alerts: string[] = [];
  
  if (metrics.authSuccessRate < SECURITY_THRESHOLDS.MIN_AUTH_SUCCESS_RATE) {
    alerts.push(`⚠️ Auth success rate low: ${metrics.authSuccessRate.toFixed(2)}%`);
  }
  
  if (metrics.csrfBlockRate > SECURITY_THRESHOLDS.MAX_CSRF_BLOCK_RATE) {
    alerts.push(`⚠️ High CSRF block rate: ${metrics.csrfBlockRate.toFixed(2)}%`);
  }
  
  if (metrics.kmsFailoverRate > SECURITY_THRESHOLDS.MAX_KMS_FAILOVER_RATE) {
    alerts.push(`⚠️ High KMS failover rate: ${metrics.kmsFailoverRate.toFixed(2)}%`);
  }
  
  if (metrics.avgSessionDuration > SECURITY_THRESHOLDS.ANOMALY_SESSION_DURATION) {
    alerts.push(`⚠️ Abnormal session duration: ${metrics.avgSessionDuration.toFixed(0)} minutes`);
  }
  
  return alerts;
}