#!/usr/bin/env npx ts-node

/**
 * Canary Publishing Status Monitor
 * 
 * Real-time monitoring and reporting of canary deployment status
 * with SLO compliance checking and automatic decision making.
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface CanaryStatus {
  timestamp: Date;
  version: string;
  weight: number;
  phase: 'starting' | 'ramping' | 'stable' | 'promoting' | 'complete' | 'rolling-back' | 'failed';
  slos: SLOStatus[];
  metrics: CanaryMetrics;
  recommendations: string[];
}

interface SLOStatus {
  name: string;
  current: number;
  target: number;
  status: 'pass' | 'fail' | 'unknown';
  trend: 'improving' | 'degrading' | 'stable';
  consecutiveFailures: number;
  lastCheck: Date;
}

interface CanaryMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    rps: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  errors: {
    rate: number;
    count: number;
    types: { [key: string]: number };
  };
  webhooks: {
    total: number;
    signatureVerified: number;
    signatureRate: number;
  };
  infrastructure: {
    pods: number;
    cpuUsage: number;
    memoryUsage: number;
  };
}

interface MonitorConfig {
  prometheusUrl: string;
  argoRolloutsUrl: string;
  serviceName: string;
  namespace: string;
  canaryVersion: string;
  environment: string;
  refreshInterval: number; // seconds
  outputFormat: 'console' | 'json' | 'both';
  outputFile?: string;
}

class CanaryStatusMonitor {
  private prometheus: AxiosInstance;
  private argoRollouts: AxiosInstance;
  private config: MonitorConfig;
  private statusHistory: CanaryStatus[] = [];
  private isRunning: boolean = false;

  constructor(config: MonitorConfig) {
    this.config = config;
    
    this.prometheus = axios.create({
      baseURL: config.prometheusUrl,
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    this.argoRollouts = axios.create({
      baseURL: config.argoRolloutsUrl,
      timeout: 5000,
      headers: { 'Accept': 'application/json' }
    });
  }

  /**
   * Query Prometheus for a metric
   */
  private async queryPrometheus(query: string): Promise<number | null> {
    try {
      const response = await this.prometheus.get('/api/v1/query', {
        params: { query }
      });

      if (response.data.status === 'success' && 
          response.data.data.result.length > 0) {
        const value = parseFloat(response.data.data.result[0].value[1]);
        return isNaN(value) ? null : value;
      }
      return null;
    } catch (error) {
      console.error(`Failed to query Prometheus: ${error.message}`);
      return null;
    }
  }

  /**
   * Get Argo Rollout status
   */
  private async getArgoRolloutStatus(): Promise<any> {
    try {
      const response = await this.argoRollouts.get(`/api/v1/rollouts/${this.config.namespace}/${this.config.serviceName}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get Argo Rollout status: ${error.message}`);
      return null;
    }
  }

  /**
   * Collect current metrics from Prometheus
   */
  private async collectMetrics(): Promise<CanaryMetrics> {
    const serviceName = this.config.serviceName;
    const canaryVersion = this.config.canaryVersion;
    
    // Request metrics
    const totalRequests = await this.queryPrometheus(
      `sum(rate(http_requests_total{service="${serviceName}", version="${canaryVersion}"}[5m])) * 300`
    ) || 0;
    
    const failedRequests = await this.queryPrometheus(
      `sum(rate(http_requests_total{service="${serviceName}", version="${canaryVersion}", status=~"5.."}[5m])) * 300`
    ) || 0;
    
    const rps = await this.queryPrometheus(
      `sum(rate(http_requests_total{service="${serviceName}", version="${canaryVersion}"}[1m]))`
    ) || 0;

    // Latency metrics
    const p50 = await this.queryPrometheus(
      `histogram_quantile(0.50, sum by(le)(rate(http_request_duration_seconds_bucket{service="${serviceName}", version="${canaryVersion}"}[5m]))) * 1000`
    ) || 0;
    
    const p95 = await this.queryPrometheus(
      `histogram_quantile(0.95, sum by(le)(rate(http_request_duration_seconds_bucket{service="${serviceName}", version="${canaryVersion}"}[5m]))) * 1000`
    ) || 0;
    
    const p99 = await this.queryPrometheus(
      `histogram_quantile(0.99, sum by(le)(rate(http_request_duration_seconds_bucket{service="${serviceName}", version="${canaryVersion}"}[5m]))) * 1000`
    ) || 0;
    
    const avgLatency = await this.queryPrometheus(
      `avg(rate(http_request_duration_seconds_sum{service="${serviceName}", version="${canaryVersion}"}[5m]) / rate(http_request_duration_seconds_count{service="${serviceName}", version="${canaryVersion}"}[5m])) * 1000`
    ) || 0;

    // Error metrics
    const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) : 0;

    // Webhook metrics
    const totalWebhooks = await this.queryPrometheus(
      `sum(rate(webhook_signature_total{service="${serviceName}", version="${canaryVersion}"}[5m])) * 300`
    ) || 0;
    
    const verifiedWebhooks = await this.queryPrometheus(
      `sum(rate(webhook_signature_verified_total{service="${serviceName}", version="${canaryVersion}"}[5m])) * 300`
    ) || 0;
    
    const signatureRate = totalWebhooks > 0 ? (verifiedWebhooks / totalWebhooks) : 1;

    // Infrastructure metrics
    const pods = await this.queryPrometheus(
      `count(up{service="${serviceName}", version="${canaryVersion}"} == 1)`
    ) || 0;
    
    const cpuUsage = await this.queryPrometheus(
      `avg(rate(container_cpu_usage_seconds_total{pod=~".*${canaryVersion}.*"}[5m])) * 100`
    ) || 0;
    
    const memoryUsage = await this.queryPrometheus(
      `avg(container_memory_usage_bytes{pod=~".*${canaryVersion}.*"}) / 1024 / 1024`
    ) || 0;

    return {
      requests: {
        total: Math.round(totalRequests),
        successful: Math.round(totalRequests - failedRequests),
        failed: Math.round(failedRequests),
        rps: Math.round(rps * 100) / 100
      },
      latency: {
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
        avg: Math.round(avgLatency)
      },
      errors: {
        rate: Math.round(errorRate * 10000) / 100, // Percentage with 2 decimal places
        count: Math.round(failedRequests),
        types: {} // Could be expanded to categorize error types
      },
      webhooks: {
        total: Math.round(totalWebhooks),
        signatureVerified: Math.round(verifiedWebhooks),
        signatureRate: Math.round(signatureRate * 10000) / 100
      },
      infrastructure: {
        pods: Math.round(pods),
        cpuUsage: Math.round(cpuUsage * 100) / 100,
        memoryUsage: Math.round(memoryUsage)
      }
    };
  }

  /**
   * Evaluate SLO compliance
   */
  private evaluateSLOs(metrics: CanaryMetrics, previousStatus?: CanaryStatus): SLOStatus[] {
    const slos: SLOStatus[] = [];
    
    // P95 Latency SLO: < 10 seconds
    const p95Status = metrics.latency.p95 <= 10000;
    slos.push({
      name: 'p95_latency',
      current: metrics.latency.p95,
      target: 10000,
      status: p95Status ? 'pass' : 'fail',
      trend: this.calculateTrend('p95_latency', metrics.latency.p95, previousStatus),
      consecutiveFailures: this.updateConsecutiveFailures('p95_latency', p95Status, previousStatus),
      lastCheck: new Date()
    });

    // Success Rate SLO: >= 95%
    const successRate = metrics.requests.total > 0 ? 
      ((metrics.requests.successful / metrics.requests.total) * 100) : 100;
    const successStatus = successRate >= 95;
    
    slos.push({
      name: 'success_rate',
      current: Math.round(successRate * 100) / 100,
      target: 95,
      status: successStatus ? 'pass' : 'fail',
      trend: this.calculateTrend('success_rate', successRate, previousStatus),
      consecutiveFailures: this.updateConsecutiveFailures('success_rate', successStatus, previousStatus),
      lastCheck: new Date()
    });

    // Webhook Signature Verification SLO: 100%
    const signatureStatus = metrics.webhooks.signatureRate >= 99.9; // Allow 0.1% tolerance for measurement
    
    slos.push({
      name: 'webhook_signatures',
      current: metrics.webhooks.signatureRate,
      target: 100,
      status: signatureStatus ? 'pass' : 'fail',
      trend: this.calculateTrend('webhook_signatures', metrics.webhooks.signatureRate, previousStatus),
      consecutiveFailures: this.updateConsecutiveFailures('webhook_signatures', signatureStatus, previousStatus),
      lastCheck: new Date()
    });

    // P99 Latency SLO: < 15 seconds (secondary)
    const p99Status = metrics.latency.p99 <= 15000;
    slos.push({
      name: 'p99_latency',
      current: metrics.latency.p99,
      target: 15000,
      status: p99Status ? 'pass' : 'fail',
      trend: this.calculateTrend('p99_latency', metrics.latency.p99, previousStatus),
      consecutiveFailures: this.updateConsecutiveFailures('p99_latency', p99Status, previousStatus),
      lastCheck: new Date()
    });

    // Error Rate SLO: < 1%
    const errorStatus = metrics.errors.rate <= 1;
    slos.push({
      name: 'error_rate',
      current: metrics.errors.rate,
      target: 1,
      status: errorStatus ? 'pass' : 'fail',
      trend: this.calculateTrend('error_rate', metrics.errors.rate, previousStatus),
      consecutiveFailures: this.updateConsecutiveFailures('error_rate', errorStatus, previousStatus),
      lastCheck: new Date()
    });

    return slos;
  }

  /**
   * Calculate trend for a metric
   */
  private calculateTrend(sloName: string, currentValue: number, previousStatus?: CanaryStatus): 'improving' | 'degrading' | 'stable' {
    if (!previousStatus) return 'stable';
    
    const previousSLO = previousStatus.slos.find(s => s.name === sloName);
    if (!previousSLO) return 'stable';

    const threshold = 0.05; // 5% change threshold
    const change = (currentValue - previousSLO.current) / previousSLO.current;

    // For latency and error rate, lower is better
    if (sloName.includes('latency') || sloName.includes('error_rate')) {
      if (change < -threshold) return 'improving';
      if (change > threshold) return 'degrading';
      return 'stable';
    }

    // For success rate and signature rate, higher is better
    if (change > threshold) return 'improving';
    if (change < -threshold) return 'degrading';
    return 'stable';
  }

  /**
   * Update consecutive failure count
   */
  private updateConsecutiveFailures(sloName: string, passed: boolean, previousStatus?: CanaryStatus): number {
    if (passed) return 0;
    
    if (!previousStatus) return 1;
    
    const previousSLO = previousStatus.slos.find(s => s.name === sloName);
    return previousSLO ? previousSLO.consecutiveFailures + 1 : 1;
  }

  /**
   * Generate recommendations based on current status
   */
  private generateRecommendations(status: CanaryStatus): string[] {
    const recommendations: string[] = [];
    
    // Check for critical SLO failures
    const criticalFailures = status.slos.filter(s => 
      s.status === 'fail' && 
      (s.name === 'p95_latency' || s.name === 'success_rate' || s.name === 'webhook_signatures')
    );

    if (criticalFailures.length > 0) {
      recommendations.push('🚨 Critical SLO failures detected - consider immediate rollback');
      
      criticalFailures.forEach(failure => {
        if (failure.name === 'p95_latency') {
          recommendations.push(`📈 P95 latency is ${failure.current}ms (target: ${failure.target}ms) - check for performance bottlenecks`);
        } else if (failure.name === 'success_rate') {
          recommendations.push(`💥 Success rate is ${failure.current}% (target: ${failure.target}%) - investigate error patterns`);
        } else if (failure.name === 'webhook_signatures') {
          recommendations.push(`🔐 Webhook signature verification is ${failure.current}% (target: ${failure.target}%) - security issue!`);
        }
      });
    }

    // Check for consecutive failures
    const consecutiveFailures = status.slos.filter(s => s.consecutiveFailures >= 3);
    if (consecutiveFailures.length > 0) {
      recommendations.push(`⚠️ ${consecutiveFailures.length} SLO(s) have 3+ consecutive failures - rollback threshold approaching`);
    }

    // Check for degrading trends
    const degradingMetrics = status.slos.filter(s => s.trend === 'degrading');
    if (degradingMetrics.length > 0) {
      recommendations.push(`📉 ${degradingMetrics.length} metric(s) showing degrading trend - monitor closely`);
    }

    // Resource recommendations
    if (status.metrics.infrastructure.cpuUsage > 80) {
      recommendations.push('🔥 CPU usage > 80% - consider scaling up canary pods');
    }
    
    if (status.metrics.infrastructure.memoryUsage > 1000) {
      recommendations.push('💾 Memory usage > 1GB per pod - monitor for memory leaks');
    }

    // Traffic recommendations
    if (status.metrics.requests.rps < 1) {
      recommendations.push('📡 Low request rate detected - verify traffic routing to canary');
    }

    // Positive recommendations
    if (recommendations.length === 0) {
      const allPassing = status.slos.every(s => s.status === 'pass');
      if (allPassing) {
        recommendations.push('✅ All SLOs passing - canary performing well');
        
        if (status.weight < 50) {
          recommendations.push('🚀 Consider increasing canary traffic weight');
        } else if (status.weight >= 50) {
          recommendations.push('🎯 Ready for full promotion if trends continue');
        }
      }
    }

    return recommendations;
  }

  /**
   * Determine canary phase from Argo Rollout status
   */
  private determinePhase(argoStatus: any, weight: number): CanaryStatus['phase'] {
    if (!argoStatus) return 'unknown' as any;

    const status = argoStatus.status?.phase?.toLowerCase() || '';
    const healthy = argoStatus.status?.health?.status === 'Healthy';

    if (status.includes('progressing')) {
      if (weight === 0) return 'starting';
      if (weight < 50) return 'ramping';
      if (weight >= 50 && weight < 100) return 'promoting';
      return 'stable';
    }

    if (status.includes('healthy') || healthy) {
      if (weight === 100) return 'complete';
      return 'stable';
    }

    if (status.includes('degraded') || status.includes('error')) {
      return 'failed';
    }

    if (status.includes('abort')) {
      return 'rolling-back';
    }

    return 'stable';
  }

  /**
   * Collect complete canary status
   */
  private async collectStatus(): Promise<CanaryStatus> {
    const metrics = await this.collectMetrics();
    const argoStatus = await this.getArgoRolloutStatus();
    const previousStatus = this.statusHistory[this.statusHistory.length - 1];

    // Extract weight from Argo Rollout status
    const weight = argoStatus?.status?.canary?.weights?.canary || 0;
    const version = argoStatus?.status?.currentPodHash || this.config.canaryVersion;
    
    const slos = this.evaluateSLOs(metrics, previousStatus);
    const phase = this.determinePhase(argoStatus, weight);

    const status: CanaryStatus = {
      timestamp: new Date(),
      version,
      weight,
      phase,
      slos,
      metrics,
      recommendations: []
    };

    status.recommendations = this.generateRecommendations(status);

    return status;
  }

  /**
   * Display status in console
   */
  private displayConsoleStatus(status: CanaryStatus): void {
    console.clear();
    
    // Header
    console.log('🚀 CANARY DEPLOYMENT STATUS');
    console.log('═'.repeat(60));
    console.log(`Time: ${status.timestamp.toLocaleString()}`);
    console.log(`Version: ${status.version}`);
    console.log(`Phase: ${this.getPhaseIcon(status.phase)} ${status.phase.toUpperCase()}`);
    console.log(`Traffic Weight: ${status.weight}%`);
    console.log('');

    // SLO Status
    console.log('📊 SLO COMPLIANCE');
    console.log('─'.repeat(60));
    
    status.slos.forEach(slo => {
      const icon = slo.status === 'pass' ? '✅' : '❌';
      const trendIcon = slo.trend === 'improving' ? '📈' : 
                       slo.trend === 'degrading' ? '📉' : '➡️';
      
      let displayValue = slo.current.toString();
      if (slo.name.includes('latency')) {
        displayValue = `${slo.current}ms`;
      } else if (slo.name.includes('rate')) {
        displayValue = `${slo.current}%`;
      }
      
      console.log(`${icon} ${slo.name}: ${displayValue} (target: ${slo.target}${slo.name.includes('latency') ? 'ms' : slo.name.includes('rate') ? '%' : ''}) ${trendIcon}`);
      
      if (slo.consecutiveFailures > 0) {
        console.log(`    ⚠️  ${slo.consecutiveFailures} consecutive failures`);
      }
    });
    
    console.log('');

    // Metrics Summary
    console.log('📈 METRICS SUMMARY');
    console.log('─'.repeat(60));
    console.log(`Requests: ${status.metrics.requests.total} total (${status.metrics.requests.rps} RPS)`);
    console.log(`Success Rate: ${((status.metrics.requests.successful / status.metrics.requests.total) * 100).toFixed(1)}%`);
    console.log(`Error Rate: ${status.metrics.errors.rate}%`);
    console.log(`Latency: P50=${status.metrics.latency.p50}ms, P95=${status.metrics.latency.p95}ms, P99=${status.metrics.latency.p99}ms`);
    console.log(`Webhooks: ${status.metrics.webhooks.total} total (${status.metrics.webhooks.signatureRate}% verified)`);
    console.log(`Infrastructure: ${status.metrics.infrastructure.pods} pods, CPU=${status.metrics.infrastructure.cpuUsage}%, Memory=${status.metrics.infrastructure.memoryUsage}MB`);
    console.log('');

    // Recommendations
    if (status.recommendations.length > 0) {
      console.log('💡 RECOMMENDATIONS');
      console.log('─'.repeat(60));
      status.recommendations.forEach(rec => console.log(`${rec}`));
      console.log('');
    }

    // Go/No-Go Decision
    const criticalFailures = status.slos.filter(s => 
      s.status === 'fail' && s.consecutiveFailures >= 5 &&
      (s.name === 'p95_latency' || s.name === 'success_rate' || s.name === 'webhook_signatures')
    );

    if (criticalFailures.length > 0) {
      console.log('🛑 GO/NO-GO DECISION: NO-GO');
      console.log('   Automatic rollback recommended');
    } else {
      const allCriticalPassing = status.slos
        .filter(s => s.name === 'p95_latency' || s.name === 'success_rate' || s.name === 'webhook_signatures')
        .every(s => s.status === 'pass');
      
      if (allCriticalPassing) {
        console.log('✅ GO/NO-GO DECISION: GO');
        console.log('   Canary deployment proceeding safely');
      } else {
        console.log('⚠️ GO/NO-GO DECISION: MONITOR');
        console.log('   Some SLOs failing but within tolerance');
      }
    }

    console.log('');
    console.log(`Next update in ${this.config.refreshInterval} seconds...`);
  }

  /**
   * Get phase icon
   */
  private getPhaseIcon(phase: string): string {
    const icons = {
      'starting': '🟡',
      'ramping': '🟠', 
      'stable': '🟢',
      'promoting': '🔵',
      'complete': '✅',
      'rolling-back': '🔴',
      'failed': '💥'
    };
    return icons[phase] || '⚪';
  }

  /**
   * Save status to JSON file
   */
  private saveStatusToFile(status: CanaryStatus): void {
    if (!this.config.outputFile) return;

    try {
      const outputDir = path.dirname(this.config.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(this.config.outputFile, JSON.stringify(status, null, 2));
    } catch (error) {
      console.error(`Failed to write status file: ${error.message}`);
    }
  }

  /**
   * Start monitoring
   */
  public async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Monitoring is already running');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Starting canary status monitoring...`);
    console.log(`📊 Service: ${this.config.serviceName}`);
    console.log(`🔄 Refresh interval: ${this.config.refreshInterval}s`);
    console.log('');

    const monitoringLoop = async () => {
      if (!this.isRunning) return;

      try {
        const status = await this.collectStatus();
        this.statusHistory.push(status);

        // Keep only last 100 status entries
        if (this.statusHistory.length > 100) {
          this.statusHistory.shift();
        }

        // Display status
        if (this.config.outputFormat === 'console' || this.config.outputFormat === 'both') {
          this.displayConsoleStatus(status);
        }

        if (this.config.outputFormat === 'json' || this.config.outputFormat === 'both') {
          console.log(JSON.stringify(status, null, 2));
        }

        // Save to file
        this.saveStatusToFile(status);

        // Schedule next update
        setTimeout(monitoringLoop, this.config.refreshInterval * 1000);

      } catch (error) {
        console.error(`❌ Monitoring error: ${error.message}`);
        setTimeout(monitoringLoop, this.config.refreshInterval * 1000);
      }
    };

    await monitoringLoop();
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    this.isRunning = false;
    console.log('🛑 Canary monitoring stopped');
  }

  /**
   * Get current status
   */
  public getCurrentStatus(): CanaryStatus | null {
    return this.statusHistory[this.statusHistory.length - 1] || null;
  }

  /**
   * Get status history
   */
  public getStatusHistory(): CanaryStatus[] {
    return [...this.statusHistory];
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 Canary Publishing Status Monitor

Usage:
  npx ts-node publish-status.ts [options]

Options:
  --prometheus-url <url>      Prometheus server URL
  --argo-url <url>           Argo Rollouts API URL  
  --service-name <name>      Service name to monitor
  --namespace <namespace>    Kubernetes namespace
  --canary-version <version> Canary version tag
  --environment <env>        Environment (staging/production)
  --refresh-interval <sec>   Refresh interval in seconds (default: 30)
  --output-format <format>   Output format: console|json|both (default: console)
  --output-file <file>       JSON output file path
  --help                     Show this help

Environment Variables:
  PROMETHEUS_URL            Prometheus server URL
  ARGO_ROLLOUTS_URL        Argo Rollouts API URL
  CANARY_SERVICE_NAME      Service name
  CANARY_NAMESPACE         Kubernetes namespace
  CANARY_VERSION           Canary version
  ENVIRONMENT              Environment name

Examples:
  # Monitor production canary
  npx ts-node publish-status.ts \\
    --service-name ofm-social-os-api \\
    --namespace ofm-production \\
    --environment production

  # JSON output with file logging
  npx ts-node publish-status.ts \\
    --output-format both \\
    --output-file ./canary-status.json \\
    --refresh-interval 15
`);
    process.exit(0);
  }

  function getArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
  }

  const config: MonitorConfig = {
    prometheusUrl: getArg('--prometheus-url') || process.env.PROMETHEUS_URL || 'http://localhost:9090',
    argoRolloutsUrl: getArg('--argo-url') || process.env.ARGO_ROLLOUTS_URL || 'http://localhost:8080',
    serviceName: getArg('--service-name') || process.env.CANARY_SERVICE_NAME || 'ofm-social-os-api',
    namespace: getArg('--namespace') || process.env.CANARY_NAMESPACE || 'ofm-production',
    canaryVersion: getArg('--canary-version') || process.env.CANARY_VERSION || 'canary',
    environment: getArg('--environment') || process.env.ENVIRONMENT || 'production',
    refreshInterval: parseInt(getArg('--refresh-interval') || '30'),
    outputFormat: (getArg('--output-format') as any) || 'console',
    outputFile: getArg('--output-file')
  };

  const monitor = new CanaryStatusMonitor(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, stopping monitoring...');
    monitor.stopMonitoring();
    process.exit(0);
  });

  try {
    await monitor.startMonitoring();
  } catch (error) {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`💥 Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

export { CanaryStatusMonitor, CanaryStatus, SLOStatus, CanaryMetrics, MonitorConfig };