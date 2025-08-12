import { check } from 'k6';
import http from 'k6/http';
import { Counter, Gauge, Trend } from 'k6/metrics';

// Custom metrics for system profiling
export const cpuUsage = new Gauge('system_cpu_usage_percent');
export const memoryUsage = new Gauge('system_memory_usage_mb');
export const memoryUsagePercent = new Gauge('system_memory_usage_percent');
export const diskIORead = new Counter('system_disk_io_read_bytes');
export const diskIOWrite = new Counter('system_disk_io_write_bytes');
export const networkBytesIn = new Counter('system_network_bytes_in');
export const networkBytesOut = new Counter('system_network_bytes_out');

// Database connection metrics
export const dbConnectionsActive = new Gauge('db_connections_active');
export const dbConnectionsIdle = new Gauge('db_connections_idle');
export const dbQueryDuration = new Trend('db_query_duration_ms');

// Redis metrics
export const redisMemoryUsed = new Gauge('redis_memory_used_mb');
export const redisConnectedClients = new Gauge('redis_connected_clients');
export const redisCommandsProcessed = new Counter('redis_commands_processed_total');

// Application-specific metrics
export const heapUsed = new Gauge('nodejs_heap_used_mb');
export const heapTotal = new Gauge('nodejs_heap_total_mb');
export const eventLoopLag = new Trend('nodejs_event_loop_lag_ms');
export const gcDuration = new Trend('nodejs_gc_duration_ms');

// Temporal workflow metrics
export const temporalWorkflowsRunning = new Gauge('temporal_workflows_running');
export const temporalTaskQueueBacklog = new Gauge('temporal_task_queue_backlog');

/**
 * Profile Monitor Class
 * Collects system and application metrics during load tests
 */
export class ProfileMonitor {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.monitoringInterval = config.monitoringInterval || 30000; // 30 seconds
    this.enabled = config.enabled !== false;
    this.startTime = Date.now();
    this.samples = [];
  }

  /**
   * Start profiling - collect metrics at regular intervals
   */
  startProfiling() {
    if (!this.enabled) return;
    
    console.log('🔍 Starting system profiling...');
    
    // Collect initial baseline
    this.collectMetrics();
    
    // Set up periodic collection (simulated with k6 iterations)
    this.profilingActive = true;
  }

  /**
   * Collect comprehensive system metrics
   */
  collectMetrics() {
    if (!this.enabled) return;

    const timestamp = Date.now();
    const sample = {
      timestamp,
      elapsed: timestamp - this.startTime,
    };

    // Collect system metrics from monitoring endpoints
    this.collectSystemMetrics(sample);
    this.collectApplicationMetrics(sample);
    this.collectDatabaseMetrics(sample);
    this.collectRedisMetrics(sample);
    this.collectTemporalMetrics(sample);

    this.samples.push(sample);
    
    // Keep only last 100 samples to avoid memory bloat
    if (this.samples.length > 100) {
      this.samples.shift();
    }
  }

  /**
   * Collect system-level metrics
   */
  collectSystemMetrics(sample) {
    try {
      const response = http.get(`${this.baseUrl}/admin/metrics/system`, {
        timeout: '5s',
        tags: { endpoint: 'system_metrics' }
      });

      if (response.status === 200) {
        const metrics = JSON.parse(response.body);
        
        // CPU metrics
        if (metrics.cpu) {
          const cpuPercent = metrics.cpu.usage_percent || 0;
          cpuUsage.add(cpuPercent);
          sample.cpu = cpuPercent;
        }

        // Memory metrics
        if (metrics.memory) {
          const memUsedMB = (metrics.memory.used_bytes || 0) / (1024 * 1024);
          const memTotalMB = (metrics.memory.total_bytes || 1) / (1024 * 1024);
          const memPercent = (memUsedMB / memTotalMB) * 100;
          
          memoryUsage.add(memUsedMB);
          memoryUsagePercent.add(memPercent);
          
          sample.memory = {
            used_mb: memUsedMB,
            total_mb: memTotalMB,
            percent: memPercent
          };
        }

        // Disk I/O metrics
        if (metrics.disk) {
          const readBytes = metrics.disk.read_bytes || 0;
          const writeBytes = metrics.disk.write_bytes || 0;
          
          diskIORead.add(readBytes);
          diskIOWrite.add(writeBytes);
          
          sample.disk = { read_bytes: readBytes, write_bytes: writeBytes };
        }

        // Network metrics
        if (metrics.network) {
          const bytesIn = metrics.network.bytes_in || 0;
          const bytesOut = metrics.network.bytes_out || 0;
          
          networkBytesIn.add(bytesIn);
          networkBytesOut.add(bytesOut);
          
          sample.network = { bytes_in: bytesIn, bytes_out: bytesOut };
        }
      }
    } catch (error) {
      console.log(`⚠️ Failed to collect system metrics: ${error.message}`);
    }
  }

  /**
   * Collect Node.js application metrics
   */
  collectApplicationMetrics(sample) {
    try {
      const response = http.get(`${this.baseUrl}/admin/metrics/nodejs`, {
        timeout: '5s',
        tags: { endpoint: 'nodejs_metrics' }
      });

      if (response.status === 200) {
        const metrics = JSON.parse(response.body);
        
        // Heap metrics
        if (metrics.heap) {
          const heapUsedMB = (metrics.heap.used_bytes || 0) / (1024 * 1024);
          const heapTotalMB = (metrics.heap.total_bytes || 0) / (1024 * 1024);
          
          heapUsed.add(heapUsedMB);
          heapTotal.add(heapTotalMB);
          
          sample.heap = {
            used_mb: heapUsedMB,
            total_mb: heapTotalMB
          };
        }

        // Event loop lag
        if (metrics.event_loop) {
          const lagMs = metrics.event_loop.lag_ms || 0;
          eventLoopLag.add(lagMs);
          sample.event_loop_lag_ms = lagMs;
        }

        // Garbage collection
        if (metrics.gc) {
          const gcDurationMs = metrics.gc.duration_ms || 0;
          gcDuration.add(gcDurationMs);
          sample.gc_duration_ms = gcDurationMs;
        }
      }
    } catch (error) {
      console.log(`⚠️ Failed to collect Node.js metrics: ${error.message}`);
    }
  }

  /**
   * Collect database connection metrics
   */
  collectDatabaseMetrics(sample) {
    try {
      const response = http.get(`${this.baseUrl}/admin/metrics/database`, {
        timeout: '5s',
        tags: { endpoint: 'database_metrics' }
      });

      if (response.status === 200) {
        const metrics = JSON.parse(response.body);
        
        if (metrics.connections) {
          const activeConns = metrics.connections.active || 0;
          const idleConns = metrics.connections.idle || 0;
          
          dbConnectionsActive.add(activeConns);
          dbConnectionsIdle.add(idleConns);
          
          sample.db_connections = {
            active: activeConns,
            idle: idleConns,
            total: activeConns + idleConns
          };
        }

        if (metrics.query_stats) {
          const avgQueryTime = metrics.query_stats.avg_duration_ms || 0;
          dbQueryDuration.add(avgQueryTime);
          sample.db_query_duration_ms = avgQueryTime;
        }
      }
    } catch (error) {
      console.log(`⚠️ Failed to collect database metrics: ${error.message}`);
    }
  }

  /**
   * Collect Redis metrics
   */
  collectRedisMetrics(sample) {
    try {
      const response = http.get(`${this.baseUrl}/admin/metrics/redis`, {
        timeout: '5s',
        tags: { endpoint: 'redis_metrics' }
      });

      if (response.status === 200) {
        const metrics = JSON.parse(response.body);
        
        if (metrics.memory) {
          const memUsedMB = (metrics.memory.used_bytes || 0) / (1024 * 1024);
          redisMemoryUsed.add(memUsedMB);
          sample.redis_memory_mb = memUsedMB;
        }

        if (metrics.clients) {
          const connectedClients = metrics.clients.connected || 0;
          redisConnectedClients.add(connectedClients);
          sample.redis_connected_clients = connectedClients;
        }

        if (metrics.stats) {
          const commandsProcessed = metrics.stats.total_commands_processed || 0;
          redisCommandsProcessed.add(commandsProcessed);
          sample.redis_commands_processed = commandsProcessed;
        }
      }
    } catch (error) {
      console.log(`⚠️ Failed to collect Redis metrics: ${error.message}`);
    }
  }

  /**
   * Collect Temporal workflow metrics
   */
  collectTemporalMetrics(sample) {
    try {
      const response = http.get(`${this.baseUrl}/admin/metrics/temporal`, {
        timeout: '5s',
        tags: { endpoint: 'temporal_metrics' }
      });

      if (response.status === 200) {
        const metrics = JSON.parse(response.body);
        
        if (metrics.workflows) {
          const runningWorkflows = metrics.workflows.running || 0;
          temporalWorkflowsRunning.add(runningWorkflows);
          sample.temporal_workflows_running = runningWorkflows;
        }

        if (metrics.task_queue) {
          const backlog = metrics.task_queue.backlog || 0;
          temporalTaskQueueBacklog.add(backlog);
          sample.temporal_task_queue_backlog = backlog;
        }
      }
    } catch (error) {
      console.log(`⚠️ Failed to collect Temporal metrics: ${error.message}`);
    }
  }

  /**
   * Check for performance degradation patterns
   */
  analyzePerformance() {
    if (this.samples.length < 2) return;

    const latest = this.samples[this.samples.length - 1];
    const baseline = this.samples[0];
    
    const analysis = {
      timestamp: latest.timestamp,
      performance_issues: []
    };

    // Check CPU usage trend
    if (latest.cpu && baseline.cpu) {
      const cpuIncrease = latest.cpu - baseline.cpu;
      if (cpuIncrease > 30) { // 30% increase
        analysis.performance_issues.push({
          type: 'cpu_degradation',
          severity: 'high',
          message: `CPU usage increased by ${cpuIncrease.toFixed(1)}%`,
          current: latest.cpu,
          baseline: baseline.cpu
        });
      }
    }

    // Check memory usage trend
    if (latest.memory && baseline.memory) {
      const memIncrease = latest.memory.percent - baseline.memory.percent;
      if (memIncrease > 20) { // 20% increase
        analysis.performance_issues.push({
          type: 'memory_leak',
          severity: memIncrease > 40 ? 'critical' : 'high',
          message: `Memory usage increased by ${memIncrease.toFixed(1)}%`,
          current: latest.memory.percent,
          baseline: baseline.memory.percent
        });
      }
    }

    // Check heap memory growth
    if (latest.heap && baseline.heap) {
      const heapGrowthMB = latest.heap.used_mb - baseline.heap.used_mb;
      if (heapGrowthMB > 100) { // 100MB growth
        analysis.performance_issues.push({
          type: 'heap_growth',
          severity: heapGrowthMB > 500 ? 'critical' : 'medium',
          message: `Heap usage grew by ${heapGrowthMB.toFixed(1)}MB`,
          current: latest.heap.used_mb,
          baseline: baseline.heap.used_mb
        });
      }
    }

    // Check database connections
    if (latest.db_connections && baseline.db_connections) {
      const connIncrease = latest.db_connections.total - baseline.db_connections.total;
      if (connIncrease > 10) { // 10 more connections
        analysis.performance_issues.push({
          type: 'connection_leak',
          severity: 'medium',
          message: `Database connections increased by ${connIncrease}`,
          current: latest.db_connections.total,
          baseline: baseline.db_connections.total
        });
      }
    }

    // Report issues
    if (analysis.performance_issues.length > 0) {
      console.log(`⚠️ Performance degradation detected:`);
      analysis.performance_issues.forEach(issue => {
        const severity = issue.severity.toUpperCase();
        console.log(`   [${severity}] ${issue.type}: ${issue.message}`);
      });
    }

    return analysis;
  }

  /**
   * Generate profiling summary
   */
  generateSummary() {
    if (this.samples.length === 0) {
      return { message: 'No profiling data collected' };
    }

    const latest = this.samples[this.samples.length - 1];
    const baseline = this.samples[0];
    const duration = (latest.timestamp - baseline.timestamp) / 1000; // seconds

    const summary = {
      duration_seconds: duration,
      samples_collected: this.samples.length,
      baseline: baseline,
      latest: latest,
      performance_analysis: this.analyzePerformance()
    };

    console.log(`📊 Profiling Summary (${duration.toFixed(0)}s):`);
    console.log(`   Samples collected: ${this.samples.length}`);
    
    if (latest.cpu !== undefined) {
      console.log(`   CPU: ${baseline.cpu?.toFixed(1) || 'N/A'}% → ${latest.cpu?.toFixed(1) || 'N/A'}%`);
    }
    
    if (latest.memory) {
      console.log(`   Memory: ${baseline.memory?.percent?.toFixed(1) || 'N/A'}% → ${latest.memory?.percent?.toFixed(1) || 'N/A'}%`);
    }
    
    if (latest.heap) {
      console.log(`   Heap: ${baseline.heap?.used_mb?.toFixed(1) || 'N/A'}MB → ${latest.heap?.used_mb?.toFixed(1) || 'N/A'}MB`);
    }

    return summary;
  }

  /**
   * Stop profiling and cleanup
   */
  stopProfiling() {
    if (!this.enabled) return;
    
    this.profilingActive = false;
    console.log('🏁 Stopping system profiling...');
    
    return this.generateSummary();
  }
}

/**
 * Create and configure profile monitor
 */
export function createProfileMonitor(config) {
  return new ProfileMonitor({
    baseUrl: config.baseUrl,
    monitoringInterval: config.monitoringInterval || 30000,
    enabled: config.enableProfiling !== false
  });
}

/**
 * Helper function to check resource thresholds during test
 */
export function checkResourceThresholds(monitor) {
  if (!monitor || !monitor.enabled || monitor.samples.length === 0) {
    return true;
  }

  const latest = monitor.samples[monitor.samples.length - 1];
  const checks = [];

  // CPU threshold check
  if (latest.cpu !== undefined) {
    checks.push(check(latest, {
      'CPU usage below 85%': (sample) => (sample.cpu || 0) < 85,
    }));
  }

  // Memory threshold check
  if (latest.memory) {
    checks.push(check(latest, {
      'Memory usage below 90%': (sample) => (sample.memory?.percent || 0) < 90,
    }));
  }

  // Heap growth check
  if (latest.heap && monitor.samples.length > 1) {
    const baseline = monitor.samples[0];
    if (baseline.heap) {
      const heapGrowth = latest.heap.used_mb - baseline.heap.used_mb;
      checks.push(check({ heapGrowth }, {
        'Heap growth under 500MB': (data) => data.heapGrowth < 500,
      }));
    }
  }

  return checks.every(result => result);
}