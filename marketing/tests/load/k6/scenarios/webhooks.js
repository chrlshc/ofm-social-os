import { sleep } from 'k6';
import { check, group } from 'k6';
import crypto from 'k6/crypto';
import { 
  config, 
  authenticatedRequest, 
  validateResponse, 
  testData, 
  sleepWithJitter,
  webhookLatency,
  baseConfig 
} from '../config/base.js';

// Webhook load test configuration
export const options = {
  ...baseConfig,
  
  scenarios: {
    // Constant webhook load
    webhook_constant: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 webhooks per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 5,
      maxVUs: 20,
      tags: { test_type: 'webhook_constant' },
    },
    
    // TikTok webhook burst (simulating video processing completion)
    tiktok_burst: {
      executor: 'constant-arrival-rate',
      rate: 25, // Burst of 25/sec for 1 minute
      timeUnit: '1s', 
      duration: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      tags: { test_type: 'tiktok_burst' },
    },
    
    // Meta webhook processing
    meta_processing: {
      executor: 'constant-arrival-rate',
      rate: 5, // Steady 5/sec for longer duration
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 3,
      maxVUs: 10,
      tags: { test_type: 'meta_processing' },
    },
    
    // Webhook spike test
    webhook_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 5,
      maxVUs: 50,
      stages: [
        { duration: '30s', target: 10 }, // Normal load
        { duration: '15s', target: 100 }, // Spike
        { duration: '30s', target: 10 }, // Back to normal
      ],
      tags: { test_type: 'webhook_spike' },
    },
  },
  
  // Webhook-specific thresholds
  thresholds: {
    ...baseConfig.thresholds,
    
    // Webhook processing time - must be < 1s for ACK
    'http_req_duration{endpoint:webhook}': [
      'p(95) < 1000', // 95% under 1s for ACK compliance
      'p(99) < 2000', // 99% under 2s
      'max < 5000',   // Max 5s (timeout protection)
    ],
    
    // Platform-specific webhook thresholds
    'http_req_duration{endpoint:webhook,platform:tiktok}': ['p(95) < 800'],
    'http_req_duration{endpoint:webhook,platform:meta}': ['p(95) < 1000'],
    
    // Signature verification must be fast
    'http_req_duration{endpoint:webhook,operation:verify}': ['p(95) < 100'],
    
    // Idempotency checks
    'http_req_duration{endpoint:webhook,operation:idempotency}': ['p(95) < 200'],
    
    // Success rates - webhooks must be highly reliable
    'http_req_failed{endpoint:webhook}': ['rate < 0.001'], // 0.1% failure rate
    'http_req_failed{endpoint:webhook,platform:tiktok}': ['rate < 0.001'],
    'http_req_failed{endpoint:webhook,platform:meta}': ['rate < 0.001'],
    
    // Custom webhook metrics
    'webhook_latency': ['p(95) < 1000', 'p(99) < 2000'],
  },
};

// Generate HMAC signature for webhook verification
function generateHMACSignature(payload, secret, algorithm = 'sha256') {
  const hmac = crypto.createHMAC(algorithm, secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

// Generate TikTok-style signature
function generateTikTokSignature(payload, timestamp, secret) {
  const stringToSign = timestamp + payload;
  return generateHMACSignature(stringToSign, secret, 'sha256');
}

// Generate Meta-style signature  
function generateMetaSignature(payload, secret) {
  return 'sha256=' + generateHMACSignature(payload, secret, 'sha256');
}

export default function webhookLoadTest() {
  const baseUrl = config.baseUrl;
  const webhookSecret = __ENV.K6_WEBHOOK_SECRET || 'test-webhook-secret-key';
  
  group('Webhook Load Test', () => {
    
    // Test 1: TikTok webhook processing
    group('TikTok Webhook Processing', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({
        type: 'video.publish.success',
        timestamp: timestamp,
        data: {
          video_id: `test-video-${Math.random().toString(36).substr(2, 9)}`,
          creator_id: config.testCreatorId,
          status: 'published',
          platform_video_id: `tiktok-${Math.random().toString(36).substr(2, 12)}`,
          views: Math.floor(Math.random() * 10000),
          likes: Math.floor(Math.random() * 1000),
        }
      });
      
      const signature = generateTikTokSignature(payload, timestamp, webhookSecret);
      
      const startTime = Date.now();
      const response = authenticatedRequest(
        'POST',
        `${baseUrl}/api/webhooks/tiktok`,
        null,
        {
          headers: {
            'X-TikTok-Signature': `t=${timestamp},s=${signature}`,
            'Content-Type': 'application/json',
          },
          body: payload,
          tags: { endpoint: 'webhook', platform: 'tiktok', operation: 'process' },
        }
      );
      const endTime = Date.now();
      
      webhookLatency.add(endTime - startTime);
      
      const isValid = validateResponse(response, 200, 'TikTok webhook');
      
      if (isValid) {
        check(response, {
          'TikTok webhook ACK < 1s': (r) => r.timings.duration < 1000,
          'returns success status': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.status === 'success' || body.acknowledged === true;
            } catch (e) {
              return r.body === 'OK' || r.status === 200;
            }
          },
          'has proper headers': (r) => r.headers['Content-Type'] && r.headers['X-Request-ID'],
        });
        
        // Test idempotency by sending the same webhook again
        sleep(0.1); // Small delay
        
        const duplicateResponse = authenticatedRequest(
          'POST',
          `${baseUrl}/api/webhooks/tiktok`,
          null,
          {
            headers: {
              'X-TikTok-Signature': `t=${timestamp},s=${signature}`,
              'Content-Type': 'application/json',
            },
            body: payload,
            tags: { endpoint: 'webhook', platform: 'tiktok', operation: 'idempotency' },
          }
        );
        
        check(duplicateResponse, {
          'handles duplicate webhook': (r) => r.status === 200,
          'idempotency fast processing': (r) => r.timings.duration < 500,
        });
      }
    });
    
    // Test 2: Meta (Instagram/Facebook) webhook processing
    group('Meta Webhook Processing', () => {
      const payload = JSON.stringify({
        object: 'instagram',
        entry: [{
          id: `instagram-page-${Math.random().toString(36).substr(2, 9)}`,
          time: Math.floor(Date.now() / 1000),
          changes: [{
            value: {
              media_id: `media-${Math.random().toString(36).substr(2, 12)}`,
              status: 'published',
              creator_id: config.testCreatorId,
            },
            field: 'feed'
          }]
        }]
      });
      
      const signature = generateMetaSignature(payload, webhookSecret);
      
      const startTime = Date.now();
      const response = authenticatedRequest(
        'POST',
        `${baseUrl}/api/webhooks/meta`,
        null,
        {
          headers: {
            'X-Hub-Signature-256': signature,
            'Content-Type': 'application/json',
          },
          body: payload,
          tags: { endpoint: 'webhook', platform: 'meta', operation: 'process' },
        }
      );
      const endTime = Date.now();
      
      webhookLatency.add(endTime - startTime);
      
      const isValid = validateResponse(response, 200, 'Meta webhook');
      
      if (isValid) {
        check(response, {
          'Meta webhook ACK < 1s': (r) => r.timings.duration < 1000,
          'processes Instagram webhook': (r) => r.status === 200,
        });
      }
    });
    
    // Test 3: Webhook verification endpoint
    group('Meta Webhook Verification', () => {
      const verifyToken = 'test-verify-token';
      const challenge = Math.random().toString(36).substr(2, 20);
      
      const response = authenticatedRequest(
        'GET',
        `${baseUrl}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`,
        null,
        { tags: { endpoint: 'webhook', platform: 'meta', operation: 'verify' } }
      );
      
      check(response, {
        'webhook verification responds correctly': (r) => r.status === 200,
        'returns challenge': (r) => r.body === challenge,
        'verification is fast': (r) => r.timings.duration < 100,
      });
    });
    
    // Test 4: Malformed webhook handling
    group('Malformed Webhook Handling', () => {
      // Test invalid signature
      const invalidPayload = JSON.stringify({ invalid: 'data' });
      const invalidSignature = 'invalid-signature';
      
      const invalidSigResponse = authenticatedRequest(
        'POST',
        `${baseUrl}/api/webhooks/tiktok`,
        null,
        {
          headers: {
            'X-TikTok-Signature': invalidSignature,
            'Content-Type': 'application/json',
          },
          body: invalidPayload,
          tags: { endpoint: 'webhook', operation: 'security_test' },
        }
      );
      
      check(invalidSigResponse, {
        'rejects invalid signature': (r) => r.status === 401 || r.status === 403,
        'fast rejection': (r) => r.timings.duration < 200,
      });
      
      // Test malformed JSON
      const malformedResponse = authenticatedRequest(
        'POST',
        `${baseUrl}/api/webhooks/tiktok`,
        null,
        {
          headers: {
            'X-TikTok-Signature': 't=123,s=invalid',
            'Content-Type': 'application/json',
          },
          body: '{"invalid": json}', // Malformed JSON
          tags: { endpoint: 'webhook', operation: 'error_test' },
        }
      );
      
      check(malformedResponse, {
        'handles malformed JSON': (r) => r.status === 400,
      });
    });
    
    // Test 5: High-frequency webhook burst
    group('Webhook Burst Processing', () => {
      const burstSize = 10;
      const timestamps = [];
      
      for (let i = 0; i < burstSize; i++) {
        const timestamp = Math.floor(Date.now() / 1000) + i; // Slight time variation
        const payload = JSON.stringify({
          type: 'video.status.update',
          timestamp: timestamp,
          data: {
            video_id: `burst-video-${i}`,
            creator_id: config.testCreatorId,
            status: 'processing',
            progress: Math.floor((i / burstSize) * 100),
          }
        });
        
        const signature = generateTikTokSignature(payload, timestamp, webhookSecret);
        
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/webhooks/tiktok`,
          null,
          {
            headers: {
              'X-TikTok-Signature': `t=${timestamp},s=${signature}`,
              'Content-Type': 'application/json',
            },
            body: payload,
            tags: { endpoint: 'webhook', platform: 'tiktok', operation: 'burst' },
          }
        );
        
        timestamps.push({
          sent: Date.now(),
          response: response,
        });
        
        // Minimal delay between burst requests
        sleep(0.05); // 50ms
      }
      
      // Analyze burst processing
      const successfulBurst = timestamps.filter(t => t.response.status === 200).length;
      
      check({ successfulBurst, burstSize }, {
        'processes burst webhooks': (data) => data.successfulBurst >= data.burstSize * 0.95, // 95% success
        'all responses under 2s': (data) => 
          timestamps.every(t => t.response.timings.duration < 2000),
      });
    });
    
    // Test 6: Concurrent platform webhooks
    group('Multi-Platform Webhook Processing', () => {
      // Simulate concurrent webhooks from different platforms
      const platforms = [
        {
          name: 'tiktok',
          payload: JSON.stringify({
            type: 'video.publish.success',
            timestamp: Math.floor(Date.now() / 1000),
            data: { video_id: 'concurrent-tiktok', creator_id: config.testCreatorId }
          }),
          endpoint: '/api/webhooks/tiktok',
          headers: {}
        },
        {
          name: 'meta', 
          payload: JSON.stringify({
            object: 'instagram',
            entry: [{
              id: 'concurrent-meta',
              time: Math.floor(Date.now() / 1000),
              changes: [{ value: { media_id: 'concurrent-instagram', creator_id: config.testCreatorId }, field: 'feed' }]
            }]
          }),
          endpoint: '/api/webhooks/meta',
          headers: {}
        }
      ];
      
      // Add signatures
      platforms[0].headers['X-TikTok-Signature'] = `t=${Math.floor(Date.now() / 1000)},s=${generateTikTokSignature(platforms[0].payload, Math.floor(Date.now() / 1000), webhookSecret)}`;
      platforms[1].headers['X-Hub-Signature-256'] = generateMetaSignature(platforms[1].payload, webhookSecret);
      
      const concurrentResponses = [];
      
      // Send webhooks concurrently
      platforms.forEach((platform, index) => {
        setTimeout(() => {
          const response = authenticatedRequest(
            'POST',
            `${baseUrl}${platform.endpoint}`,
            null,
            {
              headers: {
                ...platform.headers,
                'Content-Type': 'application/json',
              },
              body: platform.payload,
              tags: { endpoint: 'webhook', platform: platform.name, operation: 'concurrent' },
            }
          );
          
          concurrentResponses.push({ platform: platform.name, response });
        }, index * 10); // 10ms stagger
      });
      
      // Wait for all responses
      sleep(2);
      
      check({ responses: concurrentResponses }, {
        'handles concurrent webhooks': (data) => data.responses.length >= platforms.length * 0.8,
      });
    });
    
    // Test 7: Webhook retry simulation
    group('Webhook Retry Handling', () => {
      // Simulate a webhook that might be retried by the platform
      const retryPayload = JSON.stringify({
        type: 'video.retry.test',
        timestamp: Math.floor(Date.now() / 1000),
        data: {
          video_id: 'retry-test-video',
          creator_id: config.testCreatorId,
          attempt: 1,
        }
      });
      
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateTikTokSignature(retryPayload, timestamp, webhookSecret);
      
      // First attempt
      const firstAttempt = authenticatedRequest(
        'POST',
        `${baseUrl}/api/webhooks/tiktok`,
        null,
        {
          headers: {
            'X-TikTok-Signature': `t=${timestamp},s=${signature}`,
            'Content-Type': 'application/json',
          },
          body: retryPayload,
          tags: { endpoint: 'webhook', operation: 'retry_first' },
        }
      );
      
      // Simulate retry after delay (same payload, same signature)
      sleep(1);
      
      const retryAttempt = authenticatedRequest(
        'POST',
        `${baseUrl}/api/webhooks/tiktok`,
        null,
        {
          headers: {
            'X-TikTok-Signature': `t=${timestamp},s=${signature}`,
            'Content-Type': 'application/json',
          },
          body: retryPayload,
          tags: { endpoint: 'webhook', operation: 'retry_second' },
        }
      );
      
      check({ first: firstAttempt, retry: retryAttempt }, {
        'both attempts succeed': (data) => data.first.status === 200 && data.retry.status === 200,
        'retry is faster (cached)': (data) => data.retry.timings.duration <= data.first.timings.duration,
      });
    });
  });
  
  // Minimal delay between webhook test cycles
  sleep(sleepWithJitter(1000, 500)); // 1-1.5 seconds
}

export function teardown() {
  console.log('Webhook load test completed');
}