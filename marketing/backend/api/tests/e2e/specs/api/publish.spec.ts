// E2E tests for publish API endpoints
// Tests the complete publish workflow without external OAuth

import { test, expect } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';

// Test data
const TEST_CREATOR = {
  id: 'test-creator-e2e',
  email: 'test@example.com',
  displayName: 'E2E Test Creator'
};

const TEST_ACCOUNT = {
  id: 'test-account-e2e',
  platform: 'instagram',
  handle: 'testuser'
};

test.describe('Publish API', () => {
  let authToken: string;
  
  test.beforeAll(async ({ playwright }) => {
    // Setup test data and get auth token
    const request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000'
    });
    
    // Create test creator
    await request.post('/test/setup/creator', {
      data: TEST_CREATOR
    });
    
    // Create test account
    await request.post('/test/setup/account', {
      data: {
        ...TEST_ACCOUNT,
        creatorId: TEST_CREATOR.id
      }
    });
    
    // Get auth token
    const authResponse = await request.post('/test/auth', {
      data: { creatorId: TEST_CREATOR.id }
    });
    
    const authData = await authResponse.json();
    authToken = authData.token;
  });

  test.afterAll(async ({ playwright }) => {
    // Cleanup test data
    const request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000'
    });
    
    await request.delete(`/test/cleanup/creator/${TEST_CREATOR.id}`);
  });

  test('should publish to Instagram successfully', async ({ request }) => {
    const publishResponse = await request.post('/publish', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        platform: 'instagram',
        accountId: TEST_ACCOUNT.id,
        caption: 'Test post from E2E tests',
        hashtags: ['test', 'e2e', 'automation']
      }
    });

    expect(publishResponse.ok()).toBeTruthy();
    
    const publishData = await publishResponse.json();
    expect(publishData).toHaveProperty('postId');
    expect(publishData).toHaveProperty('workflowId');
    expect(publishData.status).toBe('started');
    
    // Wait for workflow to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check post status
    const statusResponse = await request.get(`/temporal/workflows/${publishData.workflowId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    expect(statusResponse.ok()).toBeTruthy();
    const statusData = await statusResponse.json();
    expect(statusData.status).toBeOneOf(['RUNNING', 'COMPLETED', 'FAILED']);
  });

  test('should handle policy violations correctly', async ({ request }) => {
    // Test NSFW content rejection
    const publishResponse = await request.post('/publish', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        platform: 'instagram',
        accountId: TEST_ACCOUNT.id,
        caption: 'x'.repeat(2201), // Exceeds Instagram limit
        hashtags: ['test']
      }
    });

    expect(publishResponse.status()).toBe(422);
    
    const errorData = await publishResponse.json();
    expect(errorData.error).toBe('Content policy violations');
    expect(errorData.violations).toHaveLength(1);
    expect(errorData.violations[0].field).toBe('caption');
    expect(errorData.violations[0].reason).toContain('2200 characters');
  });

  test('should enforce rate limits', async ({ request }) => {
    // Exhaust rate limit by creating multiple posts rapidly
    const promises = [];
    
    for (let i = 0; i < 26; i++) {
      promises.push(
        request.post('/publish', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          data: {
            platform: 'instagram',
            accountId: TEST_ACCOUNT.id,
            caption: `Rate limit test post ${i}`
          }
        })
      );
    }
    
    const responses = await Promise.all(promises);
    
    // At least one should be rate limited
    const rateLimited = responses.some(response => response.status() === 422);
    expect(rateLimited).toBeTruthy();
    
    // Check for rate limit error
    const failedResponse = responses.find(r => r.status() === 422);
    if (failedResponse) {
      const errorData = await failedResponse.json();
      expect(errorData.violations).toContainEqual(
        expect.objectContaining({
          field: 'rate_limit',
          reason: expect.stringContaining('Rate budget exceeded')
        })
      );
    }
  });

  test('should support scheduled posts', async ({ request }) => {
    const scheduleTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    const publishResponse = await request.post('/publish', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        platform: 'instagram',
        accountId: TEST_ACCOUNT.id,
        caption: 'Scheduled test post',
        scheduleAt: scheduleTime.toISOString()
      }
    });

    expect(publishResponse.ok()).toBeTruthy();
    
    const publishData = await publishResponse.json();
    expect(publishData.scheduledAt).toBe(scheduleTime.toISOString());
    
    // Verify post is in queued state
    const statusResponse = await request.get(`/temporal/workflows/${publishData.workflowId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const statusData = await statusResponse.json();
    expect(statusData.post.status).toBe('queued');
  });

  test('should handle multiple platforms', async ({ request }) => {
    const platforms = ['instagram', 'tiktok', 'x', 'reddit'];
    
    for (const platform of platforms) {
      const publishResponse = await request.post('/publish', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        data: {
          platform,
          accountId: TEST_ACCOUNT.id,
          caption: `Test post for ${platform}`,
          hashtags: platform === 'reddit' ? undefined : ['test']
        }
      });

      // Should either succeed or fail with proper validation
      expect([200, 201, 422].includes(publishResponse.status())).toBeTruthy();
      
      if (publishResponse.ok()) {
        const data = await publishResponse.json();
        expect(data.postId).toBeTruthy();
      } else {
        const errorData = await publishResponse.json();
        expect(errorData.error).toBeTruthy();
      }
    }
  });

  test('should validate media variants', async ({ request }) => {
    // Test with invalid variant ID
    const publishResponse = await request.post('/publish', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        platform: 'instagram',
        accountId: TEST_ACCOUNT.id,
        variantId: 'invalid-variant-id',
        caption: 'Test with invalid variant'
      }
    });

    expect(publishResponse.status()).toBe(422);
    
    const errorData = await publishResponse.json();
    expect(errorData.violations).toContainEqual(
      expect.objectContaining({
        field: 'variant',
        reason: expect.stringContaining('not found')
      })
    );
  });

  test('should track workflow progress', async ({ request }) => {
    const publishResponse = await request.post('/publish', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        platform: 'instagram',
        accountId: TEST_ACCOUNT.id,
        caption: 'Progress tracking test'
      }
    });

    expect(publishResponse.ok()).toBeTruthy();
    const publishData = await publishResponse.json();
    
    // Poll for progress updates
    let attempts = 0;
    let finalStatus = null;
    
    while (attempts < 10) {
      const progressResponse = await request.get(`/temporal/workflows/${publishData.workflowId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      expect(progressResponse.ok()).toBeTruthy();
      const progressData = await progressResponse.json();
      
      expect(progressData.progress).toHaveProperty('step');
      expect(progressData.progress).toHaveProperty('progress');
      expect(progressData.progress.progress).toBeGreaterThanOrEqual(0);
      expect(progressData.progress.progress).toBeLessThanOrEqual(100);
      
      if (progressData.status === 'COMPLETED' || progressData.status === 'FAILED') {
        finalStatus = progressData.status;
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    // Should have reached a final state
    expect(finalStatus).toBeOneOf(['COMPLETED', 'FAILED']);
  });

  test('should handle workflow cancellation', async ({ request }) => {
    // Create a scheduled post that can be cancelled
    const scheduleTime = new Date(Date.now() + 60000); // 1 minute from now
    
    const publishResponse = await request.post('/publish', {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        platform: 'instagram',
        accountId: TEST_ACCOUNT.id,
        caption: 'Cancellation test',
        scheduleAt: scheduleTime.toISOString()
      }
    });

    expect(publishResponse.ok()).toBeTruthy();
    const publishData = await publishResponse.json();
    
    // Cancel the workflow
    const cancelResponse = await request.post(`/temporal/workflows/${publishData.workflowId}/cancel`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: {
        reason: 'E2E test cancellation'
      }
    });
    
    expect(cancelResponse.ok()).toBeTruthy();
    const cancelData = await cancelResponse.json();
    expect(cancelData.success).toBeTruthy();
    
    // Verify cancellation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const statusResponse = await request.get(`/temporal/workflows/${publishData.workflowId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const statusData = await statusResponse.json();
    expect(statusData.post.status).toBe('cancelled');
  });
});

// Custom Playwright matchers
expect.extend({
  toBeOneOf(received, expected) {
    const pass = expected.includes(received);
    return {
      message: () => `expected ${received} to be one of ${expected.join(', ')}`,
      pass,
    };
  },
});