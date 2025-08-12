import { pool } from './database';
import { loggers } from './logger';
import { withSpan } from './otel';
import { promises as metrics } from './metrics';
import { redis } from './redis';

const logger = loggers.slo;

export interface SLOConfig {
  name: string;
  service: string;
  description: string;
  targetPercentage: number; // e.g., 99.9 for 99.9%
  timeWindowSeconds: number; // e.g., 300 for 5 minutes
  errorBudgetWindow: number; // e.g., 86400 for 24 hours
  thresholds: {
    warning: number; // percentage
    critical: number; // percentage
  };
  queries: {
    success: string; // PromQL query for successful requests
    total: string; // PromQL query for total requests
  };
}

export interface SLOMeasurement {
  metricName: string;
  serviceName: string;
  measuredAt: Date;
  timeWindowSeconds: number;
  targetPercentage: number;
  actualPercentage: number;
  errorBudgetRemaining: number;
  sampleCount: number;
  successCount: number;
  violationCount: number;
  breachDetected: boolean;
  breachSeverity?: 'warning' | 'critical';
}

export interface SLOStatus {
  name: string;
  service: string;
  healthy: boolean;
  currentPercentage: number;
  targetPercentage: number;
  errorBudgetRemaining: number;
  breachSeverity?: 'warning' | 'critical';
  lastMeasuredAt: Date;
  measurements24h: number;
  breaches24h: number;
}

/**
 * SLO (Service Level Objective) monitoring and alerting system
 * Based on Prometheus histograms and error budget tracking
 */
export class SLOManager {
  private sloConfigs: Map<string, SLOConfig> = new Map();

  constructor() {
    this.loadDefaultSLOs();
  }

  // =============================================
  // SLO Configuration
  // =============================================

  private loadDefaultSLOs(): void {
    const defaultSLOs: SLOConfig[] = [
      {
        name: 'publish_latency',
        service: 'publishing',
        description: 'Post publishing latency SLO',
        targetPercentage: 95.0, // 95% of requests under 10s
        timeWindowSeconds: 300, // 5 minutes
        errorBudgetWindow: 86400, // 24 hours
        thresholds: {
          warning: 90.0,
          critical: 85.0
        },
        queries: {
          success: 'histogram_quantile(0.95, sum by(le)(rate(publish_latency_ms_bucket{le="10000"}[5m])))',
          total: 'sum(rate(publish_latency_ms_count[5m]))'
        }
      },
      {
        name: 'publish_success_rate',
        service: 'publishing',
        description: 'Post publishing success rate SLO',
        targetPercentage: 99.0, // 99% success rate
        timeWindowSeconds: 300, // 5 minutes
        errorBudgetWindow: 86400, // 24 hours
        thresholds: {
          warning: 98.0,
          critical: 97.0
        },
        queries: {
          success: 'sum(rate(publish_requests_total{status!~"5.."}[5m]))',
          total: 'sum(rate(publish_requests_total[5m]))'
        }
      },
      {
        name: 'media_transcode_latency',
        service: 'media',
        description: 'Media transcoding latency SLO',
        targetPercentage: 90.0, // 90% of transcodes under 5 minutes
        timeWindowSeconds: 600, // 10 minutes
        errorBudgetWindow: 86400, // 24 hours
        thresholds: {
          warning: 85.0,
          critical: 80.0
        },
        queries: {
          success: 'histogram_quantile(0.90, sum by(le)(rate(media_transcode_duration_ms_bucket{le="300000"}[10m])))',
          total: 'sum(rate(media_transcode_duration_ms_count[10m]))'
        }
      },
      {
        name: 'webhook_signature_errors',
        service: 'webhooks',
        description: 'Webhook signature verification error rate',
        targetPercentage: 100.0, // 0% signature errors
        timeWindowSeconds: 60, // 1 minute
        errorBudgetWindow: 3600, // 1 hour
        thresholds: {
          warning: 99.9,
          critical: 99.0
        },
        queries: {
          success: 'sum(rate(webhook_signature_verified_total[1m]))',
          total: 'sum(rate(webhook_signature_total[1m]))'
        }
      },
      {
        name: 'api_availability',
        service: 'api',
        description: 'API availability SLO',
        targetPercentage: 99.9, // 99.9% availability
        timeWindowSeconds: 300, // 5 minutes
        errorBudgetWindow: 86400, // 24 hours
        thresholds: {
          warning: 99.5,
          critical: 99.0
        },
        queries: {
          success: 'sum(rate(http_requests_total{status!~"5.."}[5m]))',
          total: 'sum(rate(http_requests_total[5m]))'
        }
      }
    ];

    for (const slo of defaultSLOs) {
      this.sloConfigs.set(slo.name, slo);
    }

    logger.info({
      sloCount: this.sloConfigs.size
    }, 'Default SLO configurations loaded');
  }

  getSLOConfig(name: string): SLOConfig | undefined {
    return this.sloConfigs.get(name);
  }

  getAllSLOConfigs(): SLOConfig[] {
    return Array.from(this.sloConfigs.values());
  }

  addSLOConfig(config: SLOConfig): void {
    this.sloConfigs.set(config.name, config);
    logger.info({ sloName: config.name }, 'SLO configuration added');
  }

  // =============================================
  // SLO Measurement
  // =============================================

  /**
   * Record SLO measurement based on metric data
   */
  async recordSLOMeasurement(
    metricName: string,
    serviceName: string,
    successCount: number,
    totalCount: number,
    timeWindowSeconds: number = 300
  ): Promise<SLOMeasurement> {
    return withSpan('slo.record_measurement', {
      'slo.metric_name': metricName,
      'slo.service_name': serviceName,
      'slo.success_count': successCount,
      'slo.total_count': totalCount
    }, async (span) => {
      try {
        const config = this.sloConfigs.get(metricName);
        const targetPercentage = config?.targetPercentage || 99.0;

        // Calculate actual percentage
        const actualPercentage = totalCount > 0 ? (successCount / totalCount) * 100 : 100;
        
        // Calculate error budget
        const errorBudgetRemaining = Math.max(0, actualPercentage - (100 - targetPercentage));
        
        // Determine if breach occurred
        const breachDetected = actualPercentage < targetPercentage;
        let breachSeverity: 'warning' | 'critical' | undefined;
        
        if (config && breachDetected) {
          if (actualPercentage < config.thresholds.critical) {
            breachSeverity = 'critical';
          } else if (actualPercentage < config.thresholds.warning) {
            breachSeverity = 'warning';
          }
        }

        const violationCount = totalCount - successCount;

        // Store measurement in database
        const measurement: SLOMeasurement = {
          metricName,
          serviceName,
          measuredAt: new Date(),
          timeWindowSeconds,
          targetPercentage,
          actualPercentage,
          errorBudgetRemaining,
          sampleCount: totalCount,
          successCount,
          violationCount,
          breachDetected,
          breachSeverity
        };

        await pool.query(`
          INSERT INTO slo_metrics (
            metric_name, service_name, measured_at, time_window_seconds,
            target_percentage, actual_percentage, error_budget_remaining,
            sample_count, success_count, violation_count, breach_detected,
            breach_severity, alert_fired
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          metricName,
          serviceName,
          measurement.measuredAt,
          timeWindowSeconds,
          targetPercentage,
          actualPercentage,
          errorBudgetRemaining,
          totalCount,
          successCount,
          violationCount,
          breachDetected,
          breachSeverity || null,
          false // Will be updated when alert is fired
        ]);

        // Record Prometheus metrics
        metrics.gauge('slo_achievement_percentage', {
          metric_name: metricName,
          service_name: serviceName
        }).set(actualPercentage);

        metrics.gauge('slo_error_budget_remaining', {
          metric_name: metricName,
          service_name: serviceName
        }).set(errorBudgetRemaining);

        if (breachDetected) {
          metrics.counter('slo_breach_total', {
            metric_name: metricName,
            service_name: serviceName,
            severity: breachSeverity || 'unknown'
          }).inc();

          logger.warn({
            metricName,
            serviceName,
            actualPercentage,
            targetPercentage,
            breachSeverity
          }, 'SLO breach detected');
        }

        span.setAttributes({
          'slo.actual_percentage': actualPercentage,
          'slo.target_percentage': targetPercentage,
          'slo.breach_detected': breachDetected,
          'slo.breach_severity': breachSeverity || 'none'
        });

        logger.debug({
          metricName,
          serviceName,
          actualPercentage,
          targetPercentage,
          errorBudgetRemaining,
          breachDetected
        }, 'SLO measurement recorded');

        return measurement;

      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          metricName,
          serviceName
        }, 'Failed to record SLO measurement');
        throw error;
      }
    });
  }

  /**
   * Calculate SLO from histogram data
   */
  async calculateSLOFromHistogram(
    metricName: string,
    serviceName: string,
    histogramData: { bucket: number; count: number }[],
    threshold: number
  ): Promise<SLOMeasurement> {
    // Calculate success count (requests under threshold)
    let successCount = 0;
    let totalCount = 0;

    for (const { bucket, count } of histogramData) {
      totalCount += count;
      if (bucket <= threshold) {
        successCount += count;
      }
    }

    return this.recordSLOMeasurement(metricName, serviceName, successCount, totalCount);
  }

  // =============================================
  // SLO Status and Monitoring
  // =============================================

  /**
   * Get current SLO status for a service
   */
  async getSLOStatus(serviceName?: string): Promise<SLOStatus[]> {
    return withSpan('slo.get_status', {
      'slo.service_name': serviceName
    }, async () => {
      try {
        let whereClause = '';
        const params: any[] = [];

        if (serviceName) {
          whereClause = 'WHERE service_name = $1';
          params.push(serviceName);
        }

        const result = await pool.query(`
          WITH latest_measurements AS (
            SELECT DISTINCT ON (metric_name, service_name)
              metric_name,
              service_name,
              actual_percentage,
              target_percentage,
              error_budget_remaining,
              breach_detected,
              breach_severity,
              measured_at
            FROM slo_metrics
            ${whereClause}
            ORDER BY metric_name, service_name, measured_at DESC
          ),
          daily_stats AS (
            SELECT 
              metric_name,
              service_name,
              COUNT(*) as measurements_24h,
              COUNT(*) FILTER (WHERE breach_detected) as breaches_24h
            FROM slo_metrics
            WHERE measured_at > now() - INTERVAL '24 hours'
            ${whereClause}
            GROUP BY metric_name, service_name
          )
          SELECT 
            lm.*,
            COALESCE(ds.measurements_24h, 0) as measurements_24h,
            COALESCE(ds.breaches_24h, 0) as breaches_24h
          FROM latest_measurements lm
          LEFT JOIN daily_stats ds ON lm.metric_name = ds.metric_name 
            AND lm.service_name = ds.service_name
          ORDER BY lm.service_name, lm.metric_name
        `, params);

        return result.rows.map(row => ({
          name: row.metric_name,
          service: row.service_name,
          healthy: !row.breach_detected,
          currentPercentage: parseFloat(row.actual_percentage),
          targetPercentage: parseFloat(row.target_percentage),
          errorBudgetRemaining: parseFloat(row.error_budget_remaining),
          breachSeverity: row.breach_severity,
          lastMeasuredAt: new Date(row.measured_at),
          measurements24h: parseInt(row.measurements_24h),
          breaches24h: parseInt(row.breaches_24h)
        }));

      } catch (error) {
        logger.error({
          err: error,
          serviceName
        }, 'Failed to get SLO status');
        throw error;
      }
    });
  }

  /**
   * Get SLO breach history
   */
  async getSLOBreachHistory(
    metricName?: string,
    serviceName?: string,
    hoursBack: number = 24
  ): Promise<any[]> {
    try {
      let whereClause = 'WHERE breach_detected = true AND measured_at > now() - INTERVAL \'%s hours\'';
      const params: any[] = [hoursBack];
      let paramIndex = 2;

      if (metricName) {
        whereClause += ` AND metric_name = $${paramIndex++}`;
        params.push(metricName);
      }

      if (serviceName) {
        whereClause += ` AND service_name = $${paramIndex++}`;
        params.push(serviceName);
      }

      const result = await pool.query(`
        SELECT 
          metric_name,
          service_name,
          measured_at,
          actual_percentage,
          target_percentage,
          breach_severity,
          sample_count,
          violation_count
        FROM slo_metrics
        ${whereClause.replace('%s', hoursBack.toString())}
        ORDER BY measured_at DESC
        LIMIT 100
      `, params);

      return result.rows;

    } catch (error) {
      logger.error({
        err: error,
        metricName,
        serviceName,
        hoursBack
      }, 'Failed to get SLO breach history');
      throw error;
    }
  }

  /**
   * Calculate error budget burn rate
   */
  async calculateErrorBudgetBurnRate(
    metricName: string,
    serviceName: string,
    hoursBack: number = 1
  ): Promise<number> {
    try {
      const config = this.sloConfigs.get(metricName);
      if (!config) {
        throw new Error(`SLO config not found for metric: ${metricName}`);
      }

      const result = await pool.query(`
        SELECT 
          AVG(100 - actual_percentage) as avg_error_rate
        FROM slo_metrics
        WHERE metric_name = $1 
          AND service_name = $2
          AND measured_at > now() - INTERVAL '${hoursBack} hours'
      `, [metricName, serviceName]);

      const avgErrorRate = parseFloat(result.rows[0]?.avg_error_rate || '0');
      const allowedErrorRate = 100 - config.targetPercentage;
      
      // Burn rate: how fast we're consuming error budget
      // 1.0 = consuming at exactly the allowed rate
      // > 1.0 = consuming faster than allowed
      const burnRate = allowedErrorRate > 0 ? avgErrorRate / allowedErrorRate : 0;

      return burnRate;

    } catch (error) {
      logger.error({
        err: error,
        metricName,
        serviceName,
        hoursBack
      }, 'Failed to calculate error budget burn rate');
      throw error;
    }
  }

  // =============================================
  // Alerting Integration
  // =============================================

  /**
   * Check for SLO breaches and trigger alerts
   */
  async checkSLOBreaches(): Promise<void> {
    return withSpan('slo.check_breaches', {}, async () => {
      try {
        const allStatuses = await this.getSLOStatus();
        
        for (const status of allStatuses) {
          const config = this.sloConfigs.get(status.name);
          if (!config) continue;

          // Check if alert should be fired
          if (status.breachSeverity) {
            const alertKey = `slo_alert:${status.service}:${status.name}:${status.breachSeverity}`;
            
            // Check if alert was already fired recently (debouncing)
            const recentAlert = await redis.get(alertKey);
            if (recentAlert) {
              continue; // Skip if alert was fired recently
            }

            // Fire alert
            await this.fireAlert(status, config);
            
            // Set debounce period (5 minutes for warnings, 1 minute for critical)
            const debounceSeconds = status.breachSeverity === 'critical' ? 60 : 300;
            await redis.setex(alertKey, debounceSeconds, '1');

            // Update database to mark alert as fired
            await pool.query(`
              UPDATE slo_metrics 
              SET alert_fired = true
              WHERE metric_name = $1 
                AND service_name = $2
                AND measured_at = $3
            `, [status.name, status.service, status.lastMeasuredAt]);
          }
        }

      } catch (error) {
        logger.error({ err: error }, 'Failed to check SLO breaches');
        throw error;
      }
    });
  }

  private async fireAlert(status: SLOStatus, config: SLOConfig): Promise<void> {
    const alertData = {
      alert: 'SLOBreach',
      severity: status.breachSeverity,
      service: status.service,
      metric: status.name,
      description: config.description,
      currentPercentage: status.currentPercentage,
      targetPercentage: status.targetPercentage,
      errorBudgetRemaining: status.errorBudgetRemaining,
      breaches24h: status.breaches24h,
      timestamp: new Date().toISOString()
    };

    // Send to alerting system (webhook, PagerDuty, etc.)
    if (process.env.ALERT_WEBHOOK_URL) {
      try {
        const fetch = (await import('node-fetch')).default;
        await fetch(process.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertData)
        });
      } catch (error) {
        logger.error({ err: error }, 'Failed to send alert webhook');
      }
    }

    logger.error({
      ...alertData
    }, 'SLO breach alert fired');

    // Record alert metric
    metrics.counter('slo_alerts_fired_total', {
      service: status.service,
      metric: status.name,
      severity: status.breachSeverity || 'unknown'
    }).inc();
  }

  // =============================================
  // Utility Methods
  // =============================================

  /**
   * Health check for SLO system
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: {
      activeSLOs: number;
      measurements24h: number;
      breaches24h: number;
      unhealthySLOs: number;
    };
  }> {
    const issues: string[] = [];

    try {
      // Check database connectivity
      await pool.query('SELECT 1');

      // Get overall metrics
      const metricsResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT metric_name) as active_slos,
          COUNT(*) FILTER (WHERE measured_at > now() - INTERVAL '24 hours') as measurements_24h,
          COUNT(*) FILTER (WHERE breach_detected AND measured_at > now() - INTERVAL '24 hours') as breaches_24h
        FROM slo_metrics
        WHERE measured_at > now() - INTERVAL '7 days'
      `);

      const metricsRow = metricsResult.rows[0];
      const activeSLOs = parseInt(metricsRow.active_slos);
      const measurements24h = parseInt(metricsRow.measurements_24h);
      const breaches24h = parseInt(metricsRow.breaches_24h);

      // Check for unhealthy SLOs
      const unhealthyResult = await pool.query(`
        SELECT COUNT(*) as unhealthy_count
        FROM (
          SELECT DISTINCT ON (metric_name, service_name)
            metric_name, service_name, breach_detected
          FROM slo_metrics
          ORDER BY metric_name, service_name, measured_at DESC
        ) latest
        WHERE breach_detected = true
      `);

      const unhealthySLOs = parseInt(unhealthyResult.rows[0].unhealthy_count);

      // Check for stale measurements (no measurements in last hour)
      if (measurements24h === 0) {
        issues.push('No SLO measurements in last 24 hours');
      }

      // Check for high breach rate
      if (measurements24h > 0 && (breaches24h / measurements24h) > 0.1) {
        issues.push(`High breach rate: ${breaches24h}/${measurements24h} (${((breaches24h/measurements24h)*100).toFixed(1)}%)`);
      }

      return {
        healthy: issues.length === 0,
        issues,
        metrics: {
          activeSLOs,
          measurements24h,
          breaches24h,
          unhealthySLOs
        }
      };

    } catch (error) {
      issues.push(`Database connectivity error: ${error instanceof Error ? error.message : error}`);
      
      return {
        healthy: false,
        issues,
        metrics: {
          activeSLOs: 0,
          measurements24h: 0,
          breaches24h: 0,
          unhealthySLOs: 0
        }
      };
    }
  }

  /**
   * Cleanup old SLO measurements
   */
  async cleanup(): Promise<number> {
    try {
      const result = await pool.query(`
        DELETE FROM slo_metrics 
        WHERE measured_at < now() - INTERVAL '90 days'
      `);

      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'Cleaned up old SLO measurements');
      }

      return deletedCount;

    } catch (error) {
      logger.error({ err: error }, 'Failed to cleanup old SLO measurements');
      throw error;
    }
  }
}

// Default SLO manager instance
export const sloManager = new SLOManager();