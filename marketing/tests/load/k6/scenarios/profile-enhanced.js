import { sleep } from 'k6';
import { check, group } from 'k6';
import { 
  config, 
  authenticatedRequest, 
  validateResponse, 
  testData, 
  sleepWithJitter,
  publishLatency,
  baseConfig 
} from '../config/base.js';
import { 
  createProfileMonitor, 
  checkResourceThresholds 
} from '../monitoring/profile-monitor.js';

// Profile-enhanced test configuration
export const options = {
  ...baseConfig,
  
  scenarios: {
    // Profile-monitored publishing test
    profile_publish: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },  // Ramp up
        { duration: '5m', target: 10 },  // Steady state
        { duration: '2m', target: 0 },   // Ramp down
      ],
      tags: { test_type: 'profile_publish' },
    }
  },
  
  // Enhanced thresholds including resource usage
  thresholds: {
    ...baseConfig.thresholds,
    
    // Resource usage thresholds
    'system_cpu_usage_percent': ['avg < 85'],
    'system_memory_usage_percent': ['avg < 90'],
    'nodejs_heap_used_mb': ['avg < 500'],
    'nodejs_event_loop_lag_ms': ['p(95) < 100'],
    'db_connections_active': ['avg < 50'],
    'redis_memory_used_mb': ['avg < 256'],
    
    // Performance stability thresholds
    'http_req_duration': [
      'p(95) < 10000',
      'p(99) < 15000',
    ],
    
    'http_req_failed': ['rate < 0.01'],
  },
};

// Global profile monitor instance
let profileMonitor;

export function setup() {
  console.log('🔧 Setting up profile-enhanced test...');
  
  // Initialize profile monitor
  profileMonitor = createProfileMonitor({
    baseUrl: config.baseUrl,
    monitoringInterval: 30000, // 30 seconds
    enableProfiling: true
  });
  
  // Start profiling
  profileMonitor.startProfiling();
  
  // Collect baseline metrics
  profileMonitor.collectMetrics();
  
  console.log('✅ Profile monitoring started');
  
  return {
    profileMonitor: profileMonitor,
    startTime: Date.now()
  };
}

export default function profileEnhancedTest(data) {
  const baseUrl = config.baseUrl;
  const monitor = data.profileMonitor;
  
  group('Profile-Enhanced Load Test', () => {
    
    // Collect metrics every 10 iterations
    if (__ITER % 10 === 0) {
      monitor.collectMetrics();
      
      // Check resource thresholds
      const resourcesOk = checkResourceThresholds(monitor);
      
      if (!resourcesOk) {
        console.log('⚠️ Resource thresholds exceeded - consider reducing load');
      }
    }
    
    // Standard publishing test with profiling
    group('Publishing with Resource Monitoring', () => {
      const postData = {
        content: `Profile test ${__VU}-${__ITER} ${new Date().toISOString()}`,
        platforms: ['instagram'],
        creatorId: config.testCreatorId,
        settings: {
          instagram: {
            caption: `Performance monitoring test post`,
            hashtags: ['performance', 'monitoring', 'test']
          }
        }
      };
      
      const startTime = Date.now();
      const response = authenticatedRequest(
        'POST', 
        `${baseUrl}/api/posts/publish`,
        postData,
        { tags: { endpoint: 'publish', test_type: 'profile' } }
      );
      const endTime = Date.now();
      
      publishLatency.add(endTime - startTime);
      
      const isValid = validateResponse(response, 202, 'Profile publish');
      
      if (isValid && response.status === 202) {
        const body = JSON.parse(response.body);
        
        check(body, {
          'has job ID': (b) => b.jobId !== undefined,
          'has status': (b) => b.status === 'queued',
        });
        
        // Monitor system health during critical operations
        if (__ITER % 20 === 0) {
          const healthResponse = authenticatedRequest(
            'GET',
            `${baseUrl}/health`,
            null,
            { tags: { endpoint: 'health', test_type: 'profile' } }
          );
          
          check(healthResponse, {
            'system healthy during load': (r) => r.status === 200,
          });
        }
      }
    });
    
    // Memory-intensive operation simulation
    if (__ITER % 50 === 0) {
      group('Memory-Intensive Operations', () => {
        // Simulate file upload which uses more memory
        const uploadData = {
          filename: `profile-test-${__VU}-${__ITER}.jpg`,
          mimeType: 'image/jpeg',
          size: 5 * 1024 * 1024, // 5MB file
          creatorId: config.testCreatorId,
        };
        
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/media/upload`,
          uploadData,
          { tags: { endpoint: 'upload', test_type: 'profile_memory' } }
        );
        
        validateResponse(response, 200, 'Profile upload');
        
        // Force metric collection after memory-intensive operation
        monitor.collectMetrics();
      });
    }
    
    // CPU-intensive operation simulation
    if (__ITER % 30 === 0) {
      group('CPU-Intensive Operations', () => {
        // Simulate webhook processing which is CPU-intensive
        const payload = JSON.stringify({
          type: 'video.transcode.complete',
          timestamp: Math.floor(Date.now() / 1000),
          data: {
            video_id: `profile-video-${__VU}-${__ITER}`,
            creator_id: config.testCreatorId,
            transcoding: {
              formats: ['720p', '480p', '360p'],
              duration: 120,
              size_bytes: 50 * 1024 * 1024 // 50MB
            }
          }
        });
        
        const signature = `t=${Math.floor(Date.now() / 1000)},s=profile-signature`;
        
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/webhooks/tiktok`,
          null,
          {
            headers: {
              'X-TikTok-Signature': signature,
              'Content-Type': 'application/json',
            },
            body: payload,
            tags: { endpoint: 'webhook', test_type: 'profile_cpu' },
          }
        );
        
        check(response, {
          'webhook processes under load': (r) => r.status >= 200 && r.status < 300,
        });
      });
    }
    
    // Database connection stress test
    if (__ITER % 40 === 0) {
      group('Database Stress Operations', () => {
        // Simulate multiple database queries
        const queries = [
          `${baseUrl}/api/posts/status/job-${__VU}-${__ITER}`,
          `${baseUrl}/api/creators/${config.testCreatorId}/stats`,
          `${baseUrl}/api/media/list?creatorId=${config.testCreatorId}&limit=10`
        ];
        
        queries.forEach((url, index) => {
          const response = authenticatedRequest(
            'GET',
            url,
            null,
            { tags: { endpoint: 'database_stress', query_index: index } }
          );
          
          // Don't fail the test if these queries return 404
          if (response.status !== 404) {
            check(response, {
              [`DB query ${index} responds`]: (r) => r.status >= 200 && r.status < 500,
            });
          }
        });
        
        // Monitor database connections after stress
        monitor.collectMetrics();
      });
    }
  });
  
  // Adaptive sleep based on system load
  const currentSample = monitor.samples[monitor.samples.length - 1];
  let sleepDuration = 2000; // Default 2 seconds
  
  if (currentSample) {
    // Increase sleep time if system is under stress
    if (currentSample.cpu && currentSample.cpu > 80) {
      sleepDuration = 4000; // 4 seconds if CPU > 80%
    } else if (currentSample.memory && currentSample.memory.percent > 85) {
      sleepDuration = 3000; // 3 seconds if memory > 85%
    }
  }
  
  sleep(sleepWithJitter(sleepDuration, 1000));
}

export function teardown(data) {
  console.log('📊 Collecting final metrics and generating profile report...');
  
  const monitor = data.profileMonitor;
  
  // Final metric collection
  monitor.collectMetrics();
  
  // Generate comprehensive summary
  const summary = monitor.stopProfiling();
  
  console.log('');
  console.log('🔍 Profile-Enhanced Test Summary');
  console.log('================================');
  
  if (summary.performance_analysis && summary.performance_analysis.performance_issues) {
    const issues = summary.performance_analysis.performance_issues;
    
    if (issues.length > 0) {
      console.log('⚠️ Performance Issues Detected:');
      issues.forEach(issue => {
        const severity = issue.severity.toUpperCase();
        console.log(`   [${severity}] ${issue.type}: ${issue.message}`);
      });
    } else {
      console.log('✅ No significant performance degradation detected');
    }
  }
  
  console.log('');
  console.log('📋 Resource Usage Summary:');
  
  if (summary.baseline && summary.latest) {
    const baseline = summary.baseline;
    const latest = summary.latest;
    
    if (baseline.cpu !== undefined && latest.cpu !== undefined) {
      const cpuChange = latest.cpu - baseline.cpu;
      const cpuSymbol = cpuChange > 0 ? '📈' : cpuChange < 0 ? '📉' : '➡️';
      console.log(`   ${cpuSymbol} CPU: ${baseline.cpu.toFixed(1)}% → ${latest.cpu.toFixed(1)}% (${cpuChange > 0 ? '+' : ''}${cpuChange.toFixed(1)}%)`);
    }
    
    if (baseline.memory && latest.memory) {
      const memChange = latest.memory.percent - baseline.memory.percent;
      const memSymbol = memChange > 0 ? '📈' : memChange < 0 ? '📉' : '➡️';
      console.log(`   ${memSymbol} Memory: ${baseline.memory.percent.toFixed(1)}% → ${latest.memory.percent.toFixed(1)}% (${memChange > 0 ? '+' : ''}${memChange.toFixed(1)}%)`);
    }
    
    if (baseline.heap && latest.heap) {
      const heapChange = latest.heap.used_mb - baseline.heap.used_mb;
      const heapSymbol = heapChange > 0 ? '📈' : heapChange < 0 ? '📉' : '➡️';
      console.log(`   ${heapSymbol} Heap: ${baseline.heap.used_mb.toFixed(1)}MB → ${latest.heap.used_mb.toFixed(1)}MB (${heapChange > 0 ? '+' : ''}${heapChange.toFixed(1)}MB)`);
    }
    
    if (baseline.db_connections && latest.db_connections) {
      const connChange = latest.db_connections.total - baseline.db_connections.total;
      const connSymbol = connChange > 0 ? '📈' : connChange < 0 ? '📉' : '➡️';
      console.log(`   ${connSymbol} DB Connections: ${baseline.db_connections.total} → ${latest.db_connections.total} (${connChange > 0 ? '+' : ''}${connChange})`);
    }
  }
  
  console.log('');
  console.log('💡 Recommendations:');
  console.log('1. Review resource usage trends in Grafana');
  console.log('2. Check for memory leaks if heap usage increased significantly');
  console.log('3. Monitor database connection pooling efficiency');
  console.log('4. Analyze CPU spikes during peak load periods');
  console.log('5. Consider horizontal scaling if resource limits were approached');
  
  return summary;
}