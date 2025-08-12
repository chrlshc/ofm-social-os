#!/usr/bin/env npx ts-node

/**
 * SLO Verification Script for Canary Deployments
 * 
 * This script monitors SLO metrics in real-time and triggers rollbacks
 * when thresholds are exceeded during canary deployments.
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

interface SLOConfig {
  name: string;
  query: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  description: string;
  severity: 'critical' | 'high' | 'medium';
  consecutiveFailures: number;
}

interface SLOResult {
  name: string;
  value: number;
  threshold: number;
  passed: boolean;
  timestamp: Date;
  query: string;
}

interface MonitoringConfig {
  prometheusUrl: string;
  serviceName: string;
  namespace: string;
  environment: string;
  canaryVersion: string;
  checkInterval: number; // seconds
  maxFailures: number;
  rollbackCommand?: string;
}

class SLOMonitor {
  private prometheus: AxiosInstance;
  private config: MonitoringConfig;
  private slos: SLOConfig[];
  private failureCounters: Map<string, number> = new Map();
  private results: SLOResult[] = [];
  private isMonitoring: boolean = false;

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.prometheus = axios.create({
      baseURL: config.prometheusUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      }
    });

    // Define SLO checks with critical thresholds
    this.slos = [
      {
        name: 'p95_latency',
        query: `histogram_quantile(0.95, sum by(le)(rate(http_request_duration_seconds_bucket{service="${config.serviceName}", version="${config.canaryVersion}"}[5m]))) * 1000`,
        threshold: 10000, // 10 seconds in milliseconds
        operator: 'lte',
        description: 'P95 response time must be under 10 seconds',
        severity: 'critical',
        consecutiveFailures: 3
      },
      {
        name: 'p99_latency',
        query: `histogram_quantile(0.99, sum by(le)(rate(http_request_duration_seconds_bucket{service="${config.serviceName}", version="${config.canaryVersion}"}[5m]))) * 1000`,
        threshold: 15000, // 15 seconds in milliseconds
        operator: 'lte',
        description: 'P99 response time must be under 15 seconds',
        severity: 'high',
        consecutiveFailures: 3
      },
      {
        name: 'success_rate',
        query: `sum(rate(http_requests_total{service="${config.serviceName}", version="${config.canaryVersion}", status!~"5.."}[5m])) / sum(rate(http_requests_total{service="${config.serviceName}", version="${config.canaryVersion}"}[5m]))`,
        threshold: 0.95, // 95% success rate
        operator: 'gte',
        description: 'Success rate must be at least 95%',
        severity: 'critical',
        consecutiveFailures: 2
      },
      {
        name: 'webhook_signature_verification',
        query: `sum(rate(webhook_signature_verified_total{service="${config.serviceName}", version="${config.canaryVersion}"}[5m])) / sum(rate(webhook_signature_total{service="${config.serviceName}", version="${config.canaryVersion}"}[5m]))`,
        threshold: 1.0, // 100% signature verification
        operator: 'gte',
        description: 'Webhook signature verification must be 100%',
        severity: 'critical',
        consecutiveFailures: 1 // Zero tolerance
      },
      {
        name: 'error_rate',
        query: `sum(rate(http_requests_total{service="${config.serviceName}", version="${config.canaryVersion}", status=~"5.."}[5m])) / sum(rate(http_requests_total{service="${config.serviceName}", version="${config.canaryVersion}"}[5m]))`,
        threshold: 0.01, // 1% error rate
        operator: 'lte',
        description: 'Error rate must be under 1%',
        severity: 'critical',
        consecutiveFailures: 2
      },
      {
        name: 'database_connections',
        query: `sum(database_connections_active{service="${config.serviceName}", version="${config.canaryVersion}"})`,
        threshold: 1, // At least 1 active connection
        operator: 'gte',
        description: 'Must have active database connections',
        severity: 'critical',
        consecutiveFailures: 2
      },
      {
        name: 'temporal_queue_backlog',
        query: `sum(temporal_task_queue_backlog{service="${config.serviceName}", version="${config.canaryVersion}"})`,
        threshold: 1000, // Max 1000 queued tasks
        operator: 'lte',
        description: 'Temporal queue backlog must be reasonable',
        severity: 'medium',
        consecutiveFailures: 5
      },
      {
        name: 'memory_usage',
        query: `avg(nodejs_heap_used_mb{service="${config.serviceName}", version="${config.canaryVersion}"})`,
        threshold: 512, // 512MB heap usage
        operator: 'lte',
        description: 'Memory usage must be under control',
        severity: 'medium',
        consecutiveFailures: 5
      }
    ];
  }

  /**
   * Query Prometheus for a specific metric
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
      console.error(`❌ Failed to query Prometheus: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a value passes the SLO threshold
   */
  private checkThreshold(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  /**
   * Evaluate a single SLO
   */
  private async evaluateSLO(slo: SLOConfig): Promise<SLOResult> {
    const value = await this.queryPrometheus(slo.query);
    
    if (value === null) {
      console.warn(`⚠️  Could not retrieve metric for ${slo.name}`);
      return {
        name: slo.name,
        value: NaN,
        threshold: slo.threshold,
        passed: false, // Treat missing metrics as failures
        timestamp: new Date(),
        query: slo.query
      };
    }

    const passed = this.checkThreshold(value, slo.threshold, slo.operator);
    
    return {
      name: slo.name,
      value,
      threshold: slo.threshold,
      passed,
      timestamp: new Date(),
      query: slo.query
    };
  }

  /**
   * Run all SLO checks
   */
  private async runSLOChecks(): Promise<SLOResult[]> {
    console.log(`🔍 Running SLO checks at ${new Date().toISOString()}`);
    
    const results: SLOResult[] = [];
    
    for (const slo of this.slos) {
      const result = await this.evaluateSLO(slo);
      results.push(result);
      
      // Update failure counters
      if (!result.passed) {
        const currentFailures = this.failureCounters.get(slo.name) || 0;
        this.failureCounters.set(slo.name, currentFailures + 1);
        
        const severity = slo.severity === 'critical' ? '🔴' : 
                        slo.severity === 'high' ? '🟠' : '🟡';
        
        console.log(`${severity} SLO BREACH: ${slo.name}`);
        console.log(`   Value: ${result.value} (threshold: ${slo.threshold} ${slo.operator})`);
        console.log(`   Consecutive failures: ${this.failureCounters.get(slo.name)}/${slo.consecutiveFailures}`);
      } else {
        // Reset failure counter on success
        this.failureCounters.set(slo.name, 0);
        console.log(`✅ ${slo.name}: ${result.value} (threshold: ${slo.threshold} ${slo.operator})`);
      }
    }
    
    this.results = [...this.results, ...results];
    
    // Keep only last 100 results to prevent memory bloat
    if (this.results.length > 1000) {
      this.results = this.results.slice(-1000);
    }
    
    return results;
  }

  /**
   * Check if any SLO has exceeded its consecutive failure threshold
   */
  private shouldTriggerRollback(): { should: boolean; reasons: string[] } {
    const reasons: string[] = [];
    
    for (const slo of this.slos) {
      const failures = this.failureCounters.get(slo.name) || 0;
      if (failures >= slo.consecutiveFailures) {
        reasons.push(`${slo.name}: ${failures}/${slo.consecutiveFailures} consecutive failures`);
      }
    }
    
    return {
      should: reasons.length > 0,
      reasons
    };
  }

  /**
   * Trigger automatic rollback
   */
  private async triggerRollback(reasons: string[]): Promise<void> {
    console.log('🚨 TRIGGERING AUTOMATIC ROLLBACK');
    console.log('================================');
    console.log('Reasons:');
    reasons.forEach(reason => console.log(`  - ${reason}`));
    console.log('');
    
    if (this.config.rollbackCommand) {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        console.log(`🔄 Executing rollback command: ${this.config.rollbackCommand}`);
        const { stdout, stderr } = await execAsync(this.config.rollbackCommand);
        
        if (stdout) console.log('Rollback stdout:', stdout);
        if (stderr) console.warn('Rollback stderr:', stderr);
        
        console.log('✅ Rollback command completed');
      } catch (error) {
        console.error(`❌ Rollback command failed: ${error.message}`);
        throw error;
      }
    } else {
      console.log('⚠️  No rollback command configured - manual intervention required');
    }
    
    // Generate rollback report
    await this.generateRollbackReport(reasons);
  }

  /**
   * Generate a detailed rollback report
   */
  private async generateRollbackReport(reasons: string[]): Promise<void> {
    const reportDir = path.join(process.cwd(), 'reports');
    const reportFile = path.join(reportDir, `rollback-${Date.now()}.json`);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const report = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      serviceName: this.config.serviceName,
      canaryVersion: this.config.canaryVersion,
      rollbackReasons: reasons,
      sloResults: this.results.slice(-50), // Last 50 results
      failureCounters: Object.fromEntries(this.failureCounters),
      configuration: {
        checkInterval: this.config.checkInterval,
        maxFailures: this.config.maxFailures,
        sloThresholds: this.slos.map(slo => ({
          name: slo.name,
          threshold: slo.threshold,
          operator: slo.operator,
          consecutiveFailures: slo.consecutiveFailures,
          severity: slo.severity
        }))
      }
    };
    
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`📋 Rollback report saved to: ${reportFile}`);
  }

  /**
   * Start continuous SLO monitoring
   */
  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️  Monitoring is already running');
      return;
    }
    
    this.isMonitoring = true;
    console.log('🚀 Starting SLO monitoring...');
    console.log(`📊 Service: ${this.config.serviceName} (${this.config.canaryVersion})`);
    console.log(`⏱️  Check interval: ${this.config.checkInterval} seconds`);
    console.log(`🎯 SLO Gates: ${this.slos.length} configured`);
    console.log('');
    
    let checkCount = 0;
    
    const monitoringLoop = async () => {
      if (!this.isMonitoring) return;
      
      try {
        checkCount++;
        console.log(`\n📋 SLO Check #${checkCount}`);
        console.log('==================');
        
        await this.runSLOChecks();
        
        const rollbackCheck = this.shouldTriggerRollback();
        if (rollbackCheck.should) {
          await this.triggerRollback(rollbackCheck.reasons);
          this.stopMonitoring();
          return;
        }
        
        console.log(`✅ All SLO gates passed (check #${checkCount})`);
        
        // Schedule next check
        setTimeout(monitoringLoop, this.config.checkInterval * 1000);
        
      } catch (error) {
        console.error(`❌ SLO monitoring error: ${error.message}`);
        
        // Continue monitoring on errors, but log them
        setTimeout(monitoringLoop, this.config.checkInterval * 1000);
      }
    };
    
    // Start the monitoring loop
    await monitoringLoop();
  }

  /**
   * Stop SLO monitoring
   */
  public stopMonitoring(): void {
    this.isMonitoring = false;
    console.log('🛑 SLO monitoring stopped');
  }

  /**
   * Generate monitoring summary
   */
  public generateSummary(): object {
    const totalChecks = this.results.length;
    const failedChecks = this.results.filter(r => !r.passed).length;
    
    const sloSummary = this.slos.map(slo => {
      const sloResults = this.results.filter(r => r.name === slo.name);
      const failures = sloResults.filter(r => !r.passed).length;
      
      return {
        name: slo.name,
        threshold: slo.threshold,
        consecutiveFailures: this.failureCounters.get(slo.name) || 0,
        totalChecks: sloResults.length,
        failures,
        successRate: sloResults.length > 0 ? ((sloResults.length - failures) / sloResults.length) : 0
      };
    });
    
    return {
      monitoring: {
        totalChecks,
        failedChecks,
        successRate: totalChecks > 0 ? ((totalChecks - failedChecks) / totalChecks) : 0
      },
      slos: sloSummary,
      configuration: this.config
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
🎯 SLO Verification Script for Canary Deployments

Usage:
  npx ts-node verify-slo.ts [options]

Options:
  --prometheus-url <url>     Prometheus server URL (default: http://localhost:9090)
  --service-name <name>      Service name to monitor (required)
  --namespace <ns>           Kubernetes namespace (default: default)
  --environment <env>        Environment (staging/production) (default: staging)
  --canary-version <version> Canary version tag (default: canary)
  --check-interval <seconds> Check interval (default: 60)
  --max-failures <count>     Max consecutive failures (default: 5)
  --rollback-command <cmd>   Command to execute for rollback
  --duration <minutes>       Monitoring duration in minutes (default: unlimited)
  --help                     Show this help

Examples:
  # Monitor canary deployment
  npx ts-node verify-slo.ts \\
    --service-name ofm-social-os-api-canary \\
    --environment production \\
    --rollback-command "kubectl argo rollouts abort ofm-social-os-api-rollout -n ofm-production"

  # Short monitoring session
  npx ts-node verify-slo.ts \\
    --service-name ofm-social-os-api-canary \\
    --duration 30 \\
    --check-interval 30
`);
    process.exit(0);
  }
  
  // Parse command line arguments
  const config: MonitoringConfig = {
    prometheusUrl: getArg('--prometheus-url') || 'http://localhost:9090',
    serviceName: getArg('--service-name') || '',
    namespace: getArg('--namespace') || 'default',
    environment: getArg('--environment') || 'staging',
    canaryVersion: getArg('--canary-version') || 'canary',
    checkInterval: parseInt(getArg('--check-interval') || '60'),
    maxFailures: parseInt(getArg('--max-failures') || '5'),
    rollbackCommand: getArg('--rollback-command')
  };
  
  const duration = parseInt(getArg('--duration') || '0'); // 0 = unlimited
  
  if (!config.serviceName) {
    console.error('❌ --service-name is required');
    process.exit(1);
  }
  
  function getArg(name: string): string | undefined {
    const index = args.indexOf(name);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
  }
  
  // Create and start monitor
  const monitor = new SLOMonitor(config);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, stopping monitoring...');
    monitor.stopMonitoring();
    
    const summary = monitor.generateSummary();
    console.log('\n📊 Final Summary:');
    console.log(JSON.stringify(summary, null, 2));
    
    process.exit(0);
  });
  
  // Set duration limit if specified
  if (duration > 0) {
    setTimeout(() => {
      console.log(`\n⏰ Monitoring duration (${duration} minutes) completed`);
      monitor.stopMonitoring();
      
      const summary = monitor.generateSummary();
      console.log('\n📊 Final Summary:');
      console.log(JSON.stringify(summary, null, 2));
      
      process.exit(0);
    }, duration * 60 * 1000);
  }
  
  // Start monitoring
  try {
    await monitor.startMonitoring();
  } catch (error) {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`💥 Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

export { SLOMonitor, MonitoringConfig, SLOConfig, SLOResult };