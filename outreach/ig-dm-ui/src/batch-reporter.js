/**
 * Batch Reporter - JSON agrégé pour métriques DM
 * Analyse les logs de dm-clean.js et génère des statistiques
 */

import { readFileSync, writeFileSync } from 'fs';
import { existsSync } from 'fs';

export class BatchReporter {
  constructor(options = {}) {
    this.options = {
      outputFile: './dm-metrics.json',
      logRetentionHours: 24,
      ...options
    };
    
    this.metrics = [];
  }

  /**
   * Add metric from dm-clean result
   */
  addMetric(dmResult) {
    const metric = {
      timestamp: dmResult.timestamp || new Date().toISOString(),
      user: dmResult.user,
      dm_time_ms: dmResult.dm_time_ms,
      dm_network_status: dmResult.dm_network_status,
      dm_network_2xx_rate: dmResult.dm_network_2xx_rate,
      success: dmResult.ok,
      tokens_remaining: dmResult.tokens_remaining,
      error: dmResult.error || null,
      pre_engagement_likes: dmResult.pre_engagement_likes || 0
    };

    this.metrics.push(metric);
    this.cleanOldMetrics();
  }

  /**
   * Load metrics from file if exists
   */
  loadMetrics() {
    if (existsSync(this.options.outputFile)) {
      try {
        const data = readFileSync(this.options.outputFile, 'utf8');
        const parsed = JSON.parse(data);
        this.metrics = parsed.metrics || [];
        this.cleanOldMetrics();
        console.log(`[Reporter] Loaded ${this.metrics.length} existing metrics`);
      } catch (error) {
        console.warn('[Reporter] Could not load existing metrics:', error.message);
        this.metrics = [];
      }
    }
  }

  /**
   * Clean metrics older than retention period
   */
  cleanOldMetrics() {
    const cutoff = new Date(Date.now() - this.options.logRetentionHours * 60 * 60 * 1000);
    const before = this.metrics.length;
    
    this.metrics = this.metrics.filter(m => new Date(m.timestamp) > cutoff);
    
    const removed = before - this.metrics.length;
    if (removed > 0) {
      console.log(`[Reporter] Cleaned ${removed} old metrics (>${this.options.logRetentionHours}h)`);
    }
  }

  /**
   * Calculate aggregated statistics
   */
  calculateStats() {
    if (this.metrics.length === 0) {
      return {
        total_samples: 0,
        time_window_hours: 0,
        median_dm_time_ms: 0,
        avg_dm_time_ms: 0,
        network_2xx_rate: 0,
        network_429_rate: 0,
        success_rate: 0,
        error_rate: 0
      };
    }

    // Sort by time for median calculation
    const sortedTimes = this.metrics
      .map(m => m.dm_time_ms)
      .sort((a, b) => a - b);

    const median_dm_time_ms = sortedTimes.length % 2 === 0
      ? Math.round((sortedTimes[sortedTimes.length / 2 - 1] + sortedTimes[sortedTimes.length / 2]) / 2)
      : sortedTimes[Math.floor(sortedTimes.length / 2)];

    const avg_dm_time_ms = Math.round(
      this.metrics.reduce((sum, m) => sum + m.dm_time_ms, 0) / this.metrics.length
    );

    // Network statistics
    const total = this.metrics.length;
    const successful2xx = this.metrics.filter(m => m.dm_network_2xx_rate === 1).length;
    const rate429 = this.metrics.filter(m => m.dm_network_status === 429).length;
    const successfulDMs = this.metrics.filter(m => m.success === true).length;
    const errors = this.metrics.filter(m => m.error !== null).length;

    // Time window
    const timestamps = this.metrics.map(m => new Date(m.timestamp).getTime());
    const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
    const time_window_hours = Math.round((timeSpan / (1000 * 60 * 60)) * 100) / 100;

    return {
      total_samples: total,
      time_window_hours,
      median_dm_time_ms,
      avg_dm_time_ms,
      network_2xx_rate: Math.round((successful2xx / total) * 100),
      network_429_rate: Math.round((rate429 / total) * 100),
      success_rate: Math.round((successfulDMs / total) * 100),
      error_rate: Math.round((errors / total) * 100)
    };
  }

  /**
   * Generate performance insights
   */
  generateInsights(stats) {
    const insights = [];

    // Performance insights
    if (stats.median_dm_time_ms > 12000) {
      insights.push({
        type: 'performance',
        level: 'warning',
        message: `Median DM time ${stats.median_dm_time_ms}ms exceeds 12s target`,
        recommendation: 'Consider optimizing selectors or network conditions'
      });
    } else if (stats.median_dm_time_ms < 8000) {
      insights.push({
        type: 'performance',
        level: 'success',
        message: `Excellent median DM time: ${stats.median_dm_time_ms}ms`,
        recommendation: 'Performance within optimal range'
      });
    }

    // Rate limiting insights
    if (stats.network_429_rate > 5) {
      insights.push({
        type: 'rate_limiting',
        level: 'error',
        message: `High 429 rate: ${stats.network_429_rate}%`,
        recommendation: 'Reduce DM frequency or increase delays between requests'
      });
    }

    // Success rate insights
    if (stats.success_rate < 85) {
      insights.push({
        type: 'reliability',
        level: 'warning',
        message: `Low success rate: ${stats.success_rate}%`,
        recommendation: 'Check selectors, network stability, or Instagram changes'
      });
    } else if (stats.success_rate >= 95) {
      insights.push({
        type: 'reliability',
        level: 'success',
        message: `Excellent success rate: ${stats.success_rate}%`,
        recommendation: 'System performing optimally'
      });
    }

    // Network insights
    if (stats.network_2xx_rate < 90) {
      insights.push({
        type: 'network',
        level: 'warning',
        message: `Low 2xx rate: ${stats.network_2xx_rate}%`,
        recommendation: 'Check network conditions or Instagram API changes'
      });
    }

    return insights;
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    const stats = this.calculateStats();
    const insights = this.generateInsights(stats);

    const report = {
      generated_at: new Date().toISOString(),
      period: {
        hours: stats.time_window_hours,
        samples: stats.total_samples,
        retention_policy: `${this.options.logRetentionHours}h`
      },
      
      // Core metrics
      performance: {
        median_dm_time_ms: stats.median_dm_time_ms,
        avg_dm_time_ms: stats.avg_dm_time_ms,
        target: '< 8000ms optimal, < 12000ms acceptable'
      },
      
      network: {
        success_2xx_rate: `${stats.network_2xx_rate}%`,
        rate_limit_429_rate: `${stats.network_429_rate}%`,
        overall_success_rate: `${stats.success_rate}%`,
        error_rate: `${stats.error_rate}%`
      },

      // Insights and recommendations  
      insights,

      // Health score (0-100)
      health_score: this.calculateHealthScore(stats),

      // Raw stats for further analysis
      raw_statistics: stats,
      
      // Sample data (last 5 metrics for debugging)
      recent_samples: this.metrics
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5)
        .map(m => ({
          timestamp: m.timestamp,
          user: m.user,
          dm_time_ms: m.dm_time_ms,
          status: m.dm_network_status,
          success: m.success
        }))
    };

    return report;
  }

  /**
   * Calculate overall health score
   */
  calculateHealthScore(stats) {
    let score = 100;

    // Performance penalty
    if (stats.median_dm_time_ms > 12000) score -= 20;
    else if (stats.median_dm_time_ms > 8000) score -= 10;

    // Success rate penalty
    if (stats.success_rate < 85) score -= 30;
    else if (stats.success_rate < 95) score -= 15;

    // Rate limiting penalty
    if (stats.network_429_rate > 5) score -= 25;
    else if (stats.network_429_rate > 2) score -= 10;

    // Network issues penalty
    if (stats.network_2xx_rate < 90) score -= 15;

    return Math.max(0, score);
  }

  /**
   * Save report to file
   */
  saveReport() {
    this.loadMetrics(); // Ensure we have latest data
    const report = this.generateReport();

    const output = {
      report,
      metrics: this.metrics // Include raw metrics for analysis
    };

    writeFileSync(this.options.outputFile, JSON.stringify(output, null, 2));
    
    console.log(`[Reporter] Report saved to ${this.options.outputFile}`);
    console.log(`[Reporter] Health Score: ${report.health_score}/100`);
    console.log(`[Reporter] Success Rate: ${report.network.overall_success_rate}`);
    console.log(`[Reporter] Median DM Time: ${report.performance.median_dm_time_ms}ms`);

    if (report.insights.length > 0) {
      console.log(`[Reporter] ${report.insights.length} insights generated`);
      report.insights.forEach(insight => {
        const icon = insight.level === 'error' ? '❌' : insight.level === 'warning' ? '⚠️' : '✅';
        console.log(`[Reporter] ${icon} ${insight.message}`);
      });
    }

    return report;
  }

  /**
   * Process batch of results from dm-clean
   */
  processBatch(dmResults) {
    console.log(`[Reporter] Processing batch of ${dmResults.length} DM results`);
    
    dmResults.forEach(result => this.addMetric(result));
    return this.saveReport();
  }
}

/**
 * Convenience function for one-off reporting
 */
export function generateDMReport(dmResults, options = {}) {
  const reporter = new BatchReporter(options);
  reporter.loadMetrics();
  
  if (dmResults && dmResults.length > 0) {
    return reporter.processBatch(dmResults);
  } else {
    return reporter.saveReport();
  }
}

/**
 * CLI usage
 */
if (process.argv[2] === '--generate') {
  const reporter = new BatchReporter();
  reporter.saveReport();
}

console.log('📊 Batch Reporter loaded - ready for DM metrics aggregation');