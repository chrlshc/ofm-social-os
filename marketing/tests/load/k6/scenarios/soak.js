import { sleep } from 'k6';
import { check, group } from 'k6';
import { 
  config, 
  authenticatedRequest, 
  validateResponse, 
  testData, 
  sleepWithJitter,
  publishLatency,
  uploadLatency,
  webhookLatency,
  baseConfig 
} from '../config/base.js';

// Soak test configuration - 2 hours with progressive load
export const options = {
  ...baseConfig,
  
  scenarios: {
    // Main soak test - 2 hours progressive load
    soak_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Phase 1: Gradual ramp-up (20 minutes)
        { duration: '5m', target: 5 },    // Start with 5 users
        { duration: '5m', target: 10 },   // Ramp to 10 users
        { duration: '5m', target: 15 },   // Ramp to 15 users
        { duration: '5m', target: 20 },   // Reach steady state
        
        // Phase 2: Steady state load (1 hour 20 minutes)
        { duration: '80m', target: 20 },  // Maintain 20 users for 80 minutes
        
        // Phase 3: Gradual ramp-down (20 minutes)
        { duration: '5m', target: 15 },   // Start ramp down
        { duration: '5m', target: 10 },   // Continue ramp down
        { duration: '5m', target: 5 },    // Near end
        { duration: '5m', target: 0 },    // Complete shutdown
      ],
      tags: { test_type: 'soak' },
    },
    
    // Background webhook processing during soak
    webhook_background: {
      executor: 'constant-arrival-rate',
      rate: 2, // 2 webhooks per second consistently
      timeUnit: '1s',
      duration: '2h', // Full 2 hours
      preAllocatedVUs: 2,
      maxVUs: 5,
      tags: { test_type: 'webhook_soak' },
    },
    
    // Periodic upload bursts during soak
    upload_bursts: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1m',
      preAllocatedVUs: 2,
      maxVUs: 8,
      stages: [
        // Upload bursts every 30 minutes
        { duration: '25m', target: 0 },   // No uploads
        { duration: '5m', target: 5 },    // Burst: 5 uploads/min
        { duration: '25m', target: 0 },   // Quiet period
        { duration: '5m', target: 5 },    // Burst: 5 uploads/min
        { duration: '25m', target: 0 },   // Quiet period
        { duration: '5m', target: 5 },    // Burst: 5 uploads/min
        { duration: '20m', target: 0 },   // Final quiet period
      ],
      tags: { test_type: 'upload_soak' },
    },
  },
  
  // Soak test thresholds - More relaxed but still strict
  thresholds: {
    ...baseConfig.thresholds,
    
    // Overall performance must remain stable throughout
    'http_req_duration': [
      'p(95) < 12000', // Slightly higher threshold for soak test
      'p(99) < 18000', // Allow for occasional slowness over 2h
      'avg < 6000',    // Average should stay reasonable
    ],
    
    // Error rate must stay very low during 2h test
    'http_req_failed': [
      'rate < 0.02', // Allow 2% failure rate for soak test
    ],
    
    // Custom metrics for long-duration test
    'publish_latency': [
      'p(95) < 12000', // Publish should stay performant
      'p(99) < 18000',
      'avg < 6000',
    ],
    
    'upload_latency': [
      'p(95) < 35000', // Uploads can be slightly slower
      'p(99) < 50000',
    ],
    
    'webhook_latency': [
      'p(95) < 6000',  // Webhooks must stay fast
      'p(99) < 10000',
    ],
    
    // Memory leak detection - should not grow continuously
    'http_req_duration{test_type:soak}': [
      'p(95) < 12000',
    ],
    
    // Specific endpoint thresholds for soak
    'http_req_duration{endpoint:publish}': ['p(95) < 12000'],
    'http_req_duration{endpoint:upload}': ['p(95) < 35000'],
    'http_req_duration{endpoint:webhook}': ['p(95) < 6000'],
    
    // Success rate should remain high throughout
    'http_req_failed{endpoint:publish}': ['rate < 0.015'],
    'http_req_failed{endpoint:upload}': ['rate < 0.03'],
    'http_req_failed{endpoint:webhook}': ['rate < 0.005'],
    
    // Check for request rate consistency
    'data_sent': ['rate > 500000'], // At least 500KB/s aggregate
    'data_received': ['rate > 200000'], // At least 200KB/s aggregate
  },
};

export default function soakTest() {
  const baseUrl = config.baseUrl;
  const testId = Math.random().toString(36).substr(2, 9);
  
  // Determine test behavior based on VU ID and iteration
  const vuId = __VU;
  const iteration = __ITER;
  
  group('Soak Test - Mixed Workload', () => {
    
    // Publishing workload (80% of operations)
    if (Math.random() < 0.8) {
      group('Publishing Operations', () => {
        
        // Vary between single and multi-platform posts
        const isMultiPlatform = Math.random() < 0.3; // 30% multi-platform
        
        const postData = {
          content: `Soak test post ${testId}-${vuId}-${iteration} ${new Date().toISOString()}`,
          creatorId: config.testCreatorId,
          platforms: isMultiPlatform 
            ? ['instagram', 'tiktok'] 
            : [['instagram', 'tiktok', 'reddit'][Math.floor(Math.random() * 3)]],
          settings: isMultiPlatform ? {
            instagram: {
              caption: `Multi-platform soak test post`,
              hashtags: ['soak', 'test', 'load']
            },
            tiktok: {
              description: `Testing platform stability`,
              hashtags: ['soak', 'stability']
            }
          } : {
            [isMultiPlatform ? 'instagram' : postData.platforms[0]]: {
              caption: `Single platform soak test`,
              hashtags: ['soak', 'test']
            }
          }
        };
        
        const startTime = Date.now();
        const response = authenticatedRequest(
          'POST', 
          `${baseUrl}/api/posts/publish`,
          postData,
          { 
            tags: { 
              endpoint: 'publish', 
              platform: isMultiPlatform ? 'multi' : postData.platforms[0],
              test_type: 'soak'
            } 
          }
        );
        const endTime = Date.now();
        
        publishLatency.add(endTime - startTime);
        
        validateResponse(response, 202, 'Soak publish');
        
        if (response.status === 202) {
          const body = JSON.parse(response.body);
          
          check(body, {
            'soak publish has job ID': (b) => b.jobId !== undefined,
            'soak publish queued': (b) => b.status === 'queued',
          });
          
          // Occasionally check status (10% of the time)
          if (Math.random() < 0.1 && body.jobId) {
            sleep(sleepWithJitter(3000, 1000)); // Wait 3-4 seconds
            
            const statusResponse = authenticatedRequest(
              'GET',
              `${baseUrl}/api/posts/status/${body.jobId}`,
              null,
              { tags: { endpoint: 'status_check', test_type: 'soak' } }
            );
            
            validateResponse(statusResponse, 200, 'Soak status check');
          }
        }
      });
      
    // Upload workload (15% of operations)
    } else if (Math.random() < 0.15) {
      group('Upload Operations', () => {
        
        // Vary file sizes for realistic load
        const fileSize = Math.random() < 0.7 
          ? 1024 * 1024 * 2      // 2MB - 70% small files
          : 1024 * 1024 * 10;    // 10MB - 30% larger files
          
        const mimeType = Math.random() < 0.6 ? 'image/jpeg' : 'video/mp4';
        const mediaType = mimeType.startsWith('image') ? 'image' : 'video';
        
        const uploadData = {
          filename: `soak-${mediaType}-${testId}-${vuId}-${iteration}.${mimeType.split('/')[1]}`,
          mimeType: mimeType,
          size: fileSize,
          creatorId: config.testCreatorId,
        };
        
        const startTime = Date.now();
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/media/upload`,
          uploadData,
          { tags: { endpoint: 'upload', media_type: mediaType, test_type: 'soak' } }
        );
        const endTime = Date.now();
        
        uploadLatency.add(endTime - startTime);
        
        validateResponse(response, 200, 'Soak upload');
        
        if (response.status === 200) {
          const body = JSON.parse(response.body);
          
          check(body, {
            'soak upload has media ID': (b) => b.mediaId !== undefined,
            'soak upload size correct': (b) => b.size === fileSize,
          });
        }
      });
      
    // Webhook simulation (5% of operations)
    } else {
      group('Webhook Processing', () => {
        
        const platform = Math.random() < 0.6 ? 'tiktok' : 'meta';
        const timestamp = Math.floor(Date.now() / 1000);
        
        let payload, signature, headers;
        
        if (platform === 'tiktok') {
          payload = JSON.stringify({
            type: 'video.status.update',
            timestamp: timestamp,
            data: {
              video_id: `soak-video-${testId}-${vuId}-${iteration}`,
              creator_id: config.testCreatorId,
              status: ['published', 'processing', 'failed'][Math.floor(Math.random() * 3)],
              views: Math.floor(Math.random() * 10000),
            }
          });
          
          // Simulate TikTok signature
          const secretKey = __ENV.K6_WEBHOOK_SECRET || 'test-webhook-secret-key';
          signature = `t=${timestamp},s=simulated-signature-${testId}`;
          headers = { 'X-TikTok-Signature': signature };
          
        } else {
          payload = JSON.stringify({
            object: 'instagram',
            entry: [{
              id: `soak-page-${testId}-${vuId}-${iteration}`,
              time: timestamp,
              changes: [{
                value: {
                  media_id: `soak-media-${testId}`,
                  status: 'published',
                  creator_id: config.testCreatorId,
                },
                field: 'feed'
              }]
            }]
          });
          
          signature = `sha256=simulated-meta-signature-${testId}`;
          headers = { 'X-Hub-Signature-256': signature };
        }
        
        const startTime = Date.now();
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/webhooks/${platform}`,
          null,
          {
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            body: payload,
            tags: { endpoint: 'webhook', platform: platform, test_type: 'soak' },
          }
        );
        const endTime = Date.now();
        
        webhookLatency.add(endTime - startTime);
        
        // Webhooks should always respond quickly
        check(response, {
          'soak webhook responds quickly': (r) => r.timings.duration < 5000,
          'soak webhook success': (r) => r.status >= 200 && r.status < 300,
        });
      });
    }
    
    // Health check every 50th iteration to detect system degradation
    if (iteration % 50 === 0) {
      group('System Health Check', () => {
        const healthResponse = authenticatedRequest(
          'GET',
          `${baseUrl}/health`,
          null,
          { tags: { endpoint: 'health', test_type: 'soak' } }
        );
        
        check(healthResponse, {
          'system health OK during soak': (r) => r.status === 200,
          'health check fast': (r) => r.timings.duration < 1000,
        });
      });
    }
  });
  
  // Progressive sleep patterns - start fast, slow down as system might get loaded
  const baseDelay = Math.min(2000 + (iteration * 10), 5000); // Increase delay up to 5s max
  const jitter = Math.min(1000 + (iteration * 5), 3000);      // Increase jitter up to 3s max
  
  sleep(sleepWithJitter(baseDelay, jitter));
}

// Setup function to initialize soak test
export function setup() {
  const baseUrl = config.baseUrl;
  
  console.log('🚀 Starting 2-hour soak test...');
  console.log(`📊 Base URL: ${baseUrl}`);
  console.log(`👥 Max VUs: ${config.maxVUs}`);
  console.log(`⏱️  Duration: 2 hours with progressive load`);
  console.log(`🎯 Target: 20 steady users for 80 minutes`);
  
  // Verify system is ready for soak test
  const healthCheck = authenticatedRequest('GET', `${baseUrl}/health`);
  
  if (healthCheck.status !== 200) {
    throw new Error(`❌ System not ready for soak test. Health check failed: ${healthCheck.status}`);
  }
  
  console.log('✅ System health verified - beginning soak test');
  
  return {
    startTime: new Date().toISOString(),
    baseUrl: baseUrl,
  };
}

// Teardown function with comprehensive reporting
export function teardown(data) {
  console.log('📋 Soak Test Completed - Summary');
  console.log('================================');
  console.log(`🕐 Started: ${data.startTime}`);
  console.log(`🕐 Ended: ${new Date().toISOString()}`);
  console.log(`⏱️  Total Duration: ~2 hours`);
  
  // Additional system check after soak test
  const baseUrl = data.baseUrl;
  const finalHealthCheck = authenticatedRequest('GET', `${baseUrl}/health`);
  
  console.log(`🏥 Final System Health: ${finalHealthCheck.status === 200 ? '✅ HEALTHY' : '❌ DEGRADED'}`);
  
  if (finalHealthCheck.status !== 200) {
    console.log('⚠️  System may need attention after soak test');
  }
  
  console.log('');
  console.log('📊 Key Metrics to Review:');
  console.log('- HTTP request duration trends over time');
  console.log('- Memory usage patterns (check for leaks)');
  console.log('- CPU utilization stability');
  console.log('- Error rate consistency');
  console.log('- Database connection pool status');
  console.log('- Redis memory usage');
  console.log('- Platform API rate limit consumption');
  
  console.log('');
  console.log('🔍 Post-Soak Recommendations:');
  console.log('1. Check Grafana dashboards for resource trends');
  console.log('2. Review application logs for memory/connection issues');
  console.log('3. Verify database performance remained stable');
  console.log('4. Check platform API quotas and rate limits');
  console.log('5. Monitor system for 30 minutes post-test');
}