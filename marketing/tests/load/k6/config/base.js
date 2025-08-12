import { check } from 'k6';
import http from 'k6/http';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics for detailed monitoring
export const errorRate = new Rate('errors');
export const publishLatency = new Trend('publish_latency');
export const uploadLatency = new Trend('upload_latency');
export const webhookLatency = new Trend('webhook_latency');
export const apiCalls = new Counter('api_calls_total');
export const successfulRequests = new Counter('successful_requests_total');
export const failedRequests = new Counter('failed_requests_total');

// Base configuration for all tests
export const baseConfig = {
  // HTTP configuration
  http: {
    timeout: '30s',
    responseTimeout: '30s',
  },
  
  // Test thresholds - FAIL the test if these are not met
  thresholds: {
    // HTTP request duration
    'http_req_duration': [
      'p(95) < 10000', // 95% of requests under 10s
      'p(99) < 15000', // 99% of requests under 15s
    ],
    
    // HTTP request failed rate
    'http_req_failed': [
      'rate < 0.01', // Less than 1% failures
    ],
    
    // Custom metrics thresholds
    'publish_latency': [
      'p(95) < 10000', // Publish p95 < 10s
      'p(99) < 15000', // Publish p99 < 15s
      'avg < 5000',    // Average < 5s
    ],
    
    'upload_latency': [
      'p(95) < 30000', // Upload p95 < 30s
      'p(99) < 45000', // Upload p99 < 45s
    ],
    
    'webhook_latency': [
      'p(95) < 5000',  // Webhook p95 < 5s
      'p(99) < 8000',  // Webhook p99 < 8s
    ],
    
    'errors': [
      'rate < 0.01', // Less than 1% error rate
    ],
  },
  
  // Test stages - will be overridden by specific tests
  stages: [
    { duration: '2m', target: 10 },   // Ramp up
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
};

// Environment configuration
export const config = {
  // Default to staging, can be overridden by K6_ENV
  baseUrl: __ENV.K6_BASE_URL || 'https://api-staging.ofm.social',
  
  // Authentication
  apiKey: __ENV.K6_API_KEY || '',
  
  // Test data
  testCreatorId: __ENV.K6_TEST_CREATOR_ID || 'test-creator-001',
  
  // Feature flags
  enableCanaryTesting: __ENV.K6_CANARY_TESTING === 'true',
  
  // Platform configuration
  platforms: {
    instagram: __ENV.K6_INSTAGRAM_ENABLED === 'true',
    tiktok: __ENV.K6_TIKTOK_ENABLED === 'true',
    reddit: __ENV.K6_REDDIT_ENABLED === 'true',
    x: __ENV.K6_X_ENABLED === 'true',
  },
  
  // Load test configuration
  maxVUs: parseInt(__ENV.K6_MAX_VUS) || 100,
  testDuration: __ENV.K6_TEST_DURATION || '10m',
  rampUpDuration: __ENV.K6_RAMP_UP || '2m',
  
  // Performance targets
  targets: {
    rps: parseInt(__ENV.K6_TARGET_RPS) || 50, // Requests per second
    concurrentUsers: parseInt(__ENV.K6_CONCURRENT_USERS) || 25,
    
    // Latency targets (milliseconds)
    p95Latency: parseInt(__ENV.K6_P95_TARGET) || 10000,
    p99Latency: parseInt(__ENV.K6_P99_TARGET) || 15000,
    
    // Error rate target (percentage)
    errorRateTarget: parseFloat(__ENV.K6_ERROR_RATE_TARGET) || 1.0,
  },
};

// Common headers for API requests
export const defaultHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'k6-load-test/1.0',
  'Authorization': config.apiKey ? `Bearer ${config.apiKey}` : '',
};

// Add canary header if canary testing is enabled
if (config.enableCanaryTesting) {
  defaultHeaders['X-Canary'] = 'always';
}

// Utility function to make authenticated requests
export function authenticatedRequest(method, url, payload = null, params = {}) {
  const options = {
    headers: {
      ...defaultHeaders,
      ...params.headers,
    },
    timeout: '30s',
    ...params,
  };
  
  apiCalls.add(1);
  
  let response;
  if (method === 'GET') {
    response = http.get(url, options);
  } else if (method === 'POST') {
    response = http.post(url, payload ? JSON.stringify(payload) : null, options);
  } else if (method === 'PUT') {
    response = http.put(url, payload ? JSON.stringify(payload) : null, options);
  } else if (method === 'DELETE') {
    response = http.del(url, null, options);
  }
  
  // Track success/failure
  if (response.status >= 200 && response.status < 300) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }
  
  return response;
}

// Utility function for common response validation
export function validateResponse(response, expectedStatus = 200, description = '') {
  return check(response, {
    [`${description} status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${description} response time < 30s`]: (r) => r.timings.duration < 30000,
    [`${description} has valid JSON body`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        return false;
      }
    },
  });
}

// Generate realistic test data
export const testData = {
  // Sample post content for different platforms
  posts: {
    instagram: {
      content: "Check out this amazing view! 🌅 #travel #nature #photography",
      platforms: ['instagram'],
      scheduledAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      settings: {
        instagram: {
          caption: "Beautiful sunrise this morning ☀️",
          hashtags: ['travel', 'nature', 'photography'],
          location: 'Santorini, Greece'
        }
      }
    },
    
    tiktok: {
      content: "New dance trend! Try it out 💃",
      platforms: ['tiktok'],
      scheduledAt: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
      settings: {
        tiktok: {
          description: "Dancing to the latest trend",
          hashtags: ['dance', 'trend', 'viral'],
          allowComments: true,
          allowDuet: true
        }
      }
    },
    
    reddit: {
      content: "What's your favorite productivity hack?",
      platforms: ['reddit'],
      scheduledAt: new Date(Date.now() + 10800000).toISOString(), // 3 hours from now
      settings: {
        reddit: {
          subreddit: 'productivity',
          title: "Share your best productivity tips",
          flair: 'Discussion'
        }
      }
    },
    
    multiPlatform: {
      content: "Excited to share our latest product update! 🚀",
      platforms: ['instagram', 'tiktok', 'reddit'],
      scheduledAt: new Date(Date.now() + 14400000).toISOString(), // 4 hours from now
      settings: {
        instagram: {
          caption: "Big announcement coming! Stay tuned 🚀",
          hashtags: ['update', 'announcement', 'excited']
        },
        tiktok: {
          description: "Something big is coming...",
          hashtags: ['update', 'announcement', 'teaser']
        },
        reddit: {
          subreddit: 'startups',
          title: "Exciting product update announcement",
          flair: 'News'
        }
      }
    }
  },
  
  // Sample media files for upload testing
  media: {
    image: {
      filename: 'test-image.jpg',
      mimeType: 'image/jpeg',
      size: 2048576, // 2MB
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' // 1x1 base64 image
    },
    
    video: {
      filename: 'test-video.mp4',
      mimeType: 'video/mp4',
      size: 10485760, // 10MB
      data: 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=' // Sample video header
    },
    
    large: {
      filename: 'large-video.mp4',
      mimeType: 'video/mp4',
      size: 104857600, // 100MB
      data: 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=' // Sample video header
    }
  },
  
  // Sample webhook payloads
  webhooks: {
    tiktok: {
      signature: 'sha256=test-signature',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'video.publish.success',
      data: {
        video_id: 'test-video-123',
        status: 'published',
        creator_id: config.testCreatorId
      }
    },
    
    meta: {
      signature: 'sha256=test-signature',
      event: 'page.feed.publish',
      data: {
        post_id: 'test-post-456',
        status: 'published',
        platform: 'instagram'
      }
    }
  },
  
  // Sample user data for authentication testing
  users: Array.from({ length: 100 }, (_, i) => ({
    id: `test-user-${String(i).padStart(3, '0')}`,
    email: `test.user.${i}@k6test.local`,
    name: `Test User ${i}`,
    platforms: ['instagram', 'tiktok', 'reddit'].slice(0, Math.floor(Math.random() * 3) + 1)
  }))
};

// Sleep utility with jitter to simulate realistic user behavior
export function sleepWithJitter(baseMs, jitterMs = 1000) {
  const jitter = Math.random() * jitterMs;
  const totalSleep = baseMs + jitter;
  return totalSleep / 1000; // k6 sleep expects seconds
}