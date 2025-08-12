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

// Publishing load test configuration
export const options = {
  ...baseConfig,
  
  scenarios: {
    // Constant load test
    constant_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
      tags: { test_type: 'constant_load' },
    },
    
    // Ramp up test
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 5 },   // Ramp up to 5 users
        { duration: '5m', target: 20 },  // Ramp up to 20 users  
        { duration: '10m', target: 20 }, // Stay at 20 users
        { duration: '2m', target: 0 },   // Ramp down
      ],
      tags: { test_type: 'ramp_up' },
    },
    
    // Spike test
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },   // Normal load
        { duration: '30s', target: 50 }, // Spike to 50 users
        { duration: '1m', target: 5 },   // Back to normal
      ],
      tags: { test_type: 'spike' },
    },
    
    // Stress test - find breaking point
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '2m', target: 50 },
        { duration: '2m', target: 75 },
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 }, // Stay at peak
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'stress' },
    }
  },
  
  // Enhanced thresholds for publishing
  thresholds: {
    ...baseConfig.thresholds,
    
    // Publishing-specific thresholds
    'http_req_duration{endpoint:publish}': [
      'p(95) < 10000', // 95% under 10s
      'p(99) < 15000', // 99% under 15s
    ],
    
    'http_req_duration{endpoint:publish,platform:instagram}': [
      'p(95) < 8000', // Instagram should be faster
    ],
    
    'http_req_duration{endpoint:publish,platform:tiktok}': [
      'p(95) < 12000', // TikTok might be slower due to video processing
    ],
    
    // Success rate per platform
    'http_req_failed{endpoint:publish,platform:instagram}': ['rate < 0.005'],
    'http_req_failed{endpoint:publish,platform:tiktok}': ['rate < 0.01'],
    'http_req_failed{endpoint:publish,platform:reddit}': ['rate < 0.005'],
    
    // Custom metric thresholds
    'publish_latency': ['p(95) < 10000', 'p(99) < 15000'],
    
    // Rate limiting compliance
    'http_req_duration{endpoint:rate_limit_check}': ['p(95) < 100'],
  },
};

export default function publishLoadTest() {
  const baseUrl = config.baseUrl;
  
  group('Publishing Load Test', () => {
    
    // Test 1: Single platform publishing (Instagram)
    group('Single Platform - Instagram', () => {
      const postData = {
        ...testData.posts.instagram,
        creatorId: config.testCreatorId,
        // Add some randomization to avoid conflicts
        content: `${testData.posts.instagram.content} #test${Math.random().toString(36).substr(2, 9)}`,
      };
      
      const startTime = Date.now();
      const response = authenticatedRequest(
        'POST', 
        `${baseUrl}/api/posts/publish`,
        postData,
        { tags: { endpoint: 'publish', platform: 'instagram' } }
      );
      const endTime = Date.now();
      
      publishLatency.add(endTime - startTime);
      
      const isValid = validateResponse(response, 202, 'Instagram publish');
      
      if (isValid && response.status === 202) {
        const body = JSON.parse(response.body);
        
        // Verify response structure
        check(body, {
          'has job ID': (b) => b.jobId !== undefined,
          'has status': (b) => b.status === 'queued',
          'has platforms': (b) => Array.isArray(b.platforms) && b.platforms.includes('instagram'),
        });
        
        // Optional: Poll for job completion
        if (body.jobId) {
          sleep(sleepWithJitter(2000, 1000)); // Wait 2-3 seconds
          
          const statusResponse = authenticatedRequest(
            'GET',
            `${baseUrl}/api/posts/status/${body.jobId}`,
            null,
            { tags: { endpoint: 'status_check' } }
          );
          
          validateResponse(statusResponse, 200, 'Status check');
        }
      }
    });
    
    // Test 2: Multi-platform publishing
    group('Multi-Platform Publishing', () => {
      const postData = {
        ...testData.posts.multiPlatform,
        creatorId: config.testCreatorId,
        content: `${testData.posts.multiPlatform.content} #multitest${Math.random().toString(36).substr(2, 9)}`,
      };
      
      const startTime = Date.now();
      const response = authenticatedRequest(
        'POST',
        `${baseUrl}/api/posts/publish`,
        postData,
        { tags: { endpoint: 'publish', platform: 'multi' } }
      );
      const endTime = Date.now();
      
      publishLatency.add(endTime - startTime);
      
      const isValid = validateResponse(response, 202, 'Multi-platform publish');
      
      if (isValid) {
        const body = JSON.parse(response.body);
        
        check(body, {
          'handles multiple platforms': (b) => b.platforms && b.platforms.length >= 2,
          'returns job ID': (b) => b.jobId !== undefined,
        });
      }
    });
    
    // Test 3: Scheduled publishing
    group('Scheduled Publishing', () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const postData = {
        content: `Scheduled post test ${Math.random().toString(36).substr(2, 9)}`,
        platforms: ['instagram', 'reddit'],
        scheduledAt: futureTime,
        creatorId: config.testCreatorId,
        settings: {
          instagram: {
            caption: "This is a scheduled post",
            hashtags: ['scheduled', 'test']
          },
          reddit: {
            subreddit: 'test',
            title: 'Scheduled post from load test'
          }
        }
      };
      
      const response = authenticatedRequest(
        'POST',
        `${baseUrl}/api/posts/schedule`,
        postData,
        { tags: { endpoint: 'schedule' } }
      );
      
      const isValid = validateResponse(response, 201, 'Schedule post');
      
      if (isValid) {
        const body = JSON.parse(response.body);
        
        check(body, {
          'scheduled correctly': (b) => b.scheduledAt === futureTime,
          'has post ID': (b) => b.postId !== undefined,
          'status is scheduled': (b) => b.status === 'scheduled',
        });
      }
    });
    
    // Test 4: Publishing with media
    group('Publishing with Media', () => {
      // First, test media upload
      const uploadData = {
        filename: testData.media.image.filename,
        mimeType: testData.media.image.mimeType,
        size: testData.media.image.size,
        creatorId: config.testCreatorId,
      };
      
      const uploadResponse = authenticatedRequest(
        'POST',
        `${baseUrl}/api/media/upload`,
        uploadData,
        { tags: { endpoint: 'media_upload' } }
      );
      
      let mediaId = null;
      if (validateResponse(uploadResponse, 200, 'Media upload')) {
        const uploadBody = JSON.parse(uploadResponse.body);
        mediaId = uploadBody.mediaId;
        
        check(uploadBody, {
          'has media ID': (b) => b.mediaId !== undefined,
          'has upload URL': (b) => b.uploadUrl !== undefined,
        });
      }
      
      // Then publish with the media
      if (mediaId) {
        const postWithMedia = {
          content: `Post with media ${Math.random().toString(36).substr(2, 9)}`,
          platforms: ['instagram'],
          mediaIds: [mediaId],
          creatorId: config.testCreatorId,
          settings: {
            instagram: {
              caption: "Check out this image!",
              hashtags: ['image', 'test']
            }
          }
        };
        
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/posts/publish`,
          postWithMedia,
          { tags: { endpoint: 'publish_with_media' } }
        );
        
        validateResponse(response, 202, 'Publish with media');
      }
    });
    
    // Test 5: Rate limiting behavior
    group('Rate Limiting Test', () => {
      // Make multiple rapid requests to test rate limiting
      const rapidRequests = 5;
      let rateLimitedRequests = 0;
      
      for (let i = 0; i < rapidRequests; i++) {
        const postData = {
          content: `Rate limit test ${i} ${Math.random().toString(36).substr(2, 9)}`,
          platforms: ['instagram'],
          creatorId: config.testCreatorId,
        };
        
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/posts/publish`,
          postData,
          { tags: { endpoint: 'rate_limit_test' } }
        );
        
        if (response.status === 429) {
          rateLimitedRequests++;
        }
        
        // Small delay between requests
        sleep(0.1);
      }
      
      check({ rateLimitedRequests }, {
        'rate limiting is working': (data) => data.rateLimitedRequests > 0 || rapidRequests < 3,
      });
    });
    
    // Test 6: Error handling
    group('Error Handling', () => {
      // Test with invalid data
      const invalidData = {
        content: '', // Empty content should fail
        platforms: ['invalid_platform'],
        creatorId: 'invalid-creator-id',
      };
      
      const response = authenticatedRequest(
        'POST',
        `${baseUrl}/api/posts/publish`,
        invalidData,
        { tags: { endpoint: 'error_test' } }
      );
      
      check(response, {
        'rejects invalid data': (r) => r.status >= 400 && r.status < 500,
        'returns error message': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.error !== undefined;
          } catch (e) {
            return false;
          }
        },
      });
    });
    
    // Test 7: Feature flags integration
    if (config.enableCanaryTesting) {
      group('Canary Feature Testing', () => {
        const postData = {
          content: `Canary test ${Math.random().toString(36).substr(2, 9)}`,
          platforms: ['instagram'],
          creatorId: config.testCreatorId,
        };
        
        const response = authenticatedRequest(
          'POST',
          `${baseUrl}/api/posts/publish`,
          postData,
          { 
            tags: { endpoint: 'canary_test' },
            headers: { 'X-Canary': 'always' }
          }
        );
        
        validateResponse(response, 202, 'Canary publish');
        
        // Verify canary headers in response
        check(response, {
          'canary header present': (r) => r.headers['X-Version'] === 'canary' || r.headers['x-version'] === 'canary',
        });
      });
    }
  });
  
  // Realistic user behavior - wait between actions
  sleep(sleepWithJitter(3000, 2000)); // 3-5 seconds between iterations
}

// Teardown function to clean up test data
export function teardown(data) {
  // Optional: Clean up any test posts created during the load test
  console.log('Publishing load test completed');
}