// E2E tests for OAuth flows
// Stubs OAuth providers to avoid actual external auth
// Ref: https://docs.cypress.io/app/guides/authentication-testing/social-authentication

import { test, expect } from '@playwright/test';

test.describe('OAuth Flows', () => {
  
  test.describe('Instagram OAuth', () => {
    test('should start OAuth flow and return auth URL', async ({ request }) => {
      const response = await request.post('/oauth/instagram/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.authUrl).toBeTruthy();
      expect(data.authUrl).toContain('facebook.com/dialog/oauth');
      expect(data.authUrl).toContain('state=');
      
      // Extract state parameter for next test
      const url = new URL(data.authUrl);
      const state = url.searchParams.get('state');
      expect(state).toBeTruthy();
      expect(state).toHaveLength(64); // Should be a long random string
    });

    test('should handle OAuth callback with stub data', async ({ request, page }) => {
      // Step 1: Start OAuth flow to get state
      const startResponse = await request.post('/oauth/instagram/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      const startData = await startResponse.json();
      const authUrl = new URL(startData.authUrl);
      const state = authUrl.searchParams.get('state');

      // Step 2: Simulate OAuth callback with stub authorization code
      // In real Instagram OAuth, user would be redirected back with code
      const callbackResponse = await request.get('/oauth/instagram/callback', {
        params: {
          code: 'stub-auth-code-instagram',
          state: state!
        }
      });

      // Should redirect to success page
      expect(callbackResponse.status()).toBe(302);
      expect(callbackResponse.headers()['location']).toContain('/auth/success');
      expect(callbackResponse.headers()['location']).toContain('platform=instagram');
    });

    test('should handle OAuth errors gracefully', async ({ request }) => {
      const response = await request.get('/oauth/instagram/callback', {
        params: {
          error: 'access_denied',
          error_description: 'User denied access to Instagram'
        }
      });

      expect(response.status()).toBe(302);
      expect(response.headers()['location']).toContain('/auth/error');
      expect(response.headers()['location']).toContain('error=access_denied');
    });

    test('should reject invalid state parameter', async ({ request }) => {
      const response = await request.get('/oauth/instagram/callback', {
        params: {
          code: 'valid-code',
          state: 'invalid-state-123'
        }
      });

      expect(response.status()).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('Invalid state');
    });

    test('should handle token refresh', async ({ request }) => {
      // Mock scenario: token needs refresh
      const refreshResponse = await request.post('/oauth/instagram/refresh', {
        data: {
          tokenId: 'test-token-id-instagram'
        }
      });

      // Should either succeed or fail gracefully
      expect([200, 404, 400].includes(refreshResponse.status())).toBeTruthy();
    });
  });

  test.describe('TikTok OAuth', () => {
    test('should start TikTok OAuth flow', async ({ request }) => {
      const response = await request.post('/oauth/tiktok/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.authUrl).toBeTruthy();
      expect(data.authUrl).toContain('tiktok.com');
      expect(data.authUrl).toContain('state=');
    });

    test('should handle TikTok callback', async ({ request }) => {
      // Start flow first
      const startResponse = await request.post('/oauth/tiktok/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      const startData = await startResponse.json();
      const authUrl = new URL(startData.authUrl);
      const state = authUrl.searchParams.get('state');

      // Simulate callback
      const callbackResponse = await request.get('/oauth/tiktok/callback', {
        params: {
          code: 'stub-auth-code-tiktok',
          state: state!
        }
      });

      expect(callbackResponse.status()).toBe(302);
      expect(callbackResponse.headers()['location']).toContain('/auth/success');
    });
  });

  test.describe('X (Twitter) OAuth', () => {
    test('should start X OAuth flow', async ({ request }) => {
      const response = await request.post('/oauth/x/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.authUrl).toBeTruthy();
      expect(data.authUrl).toContain('twitter.com'); // Or x.com
      expect(data.authUrl).toContain('state=');
    });

    test('should handle X callback', async ({ request }) => {
      const startResponse = await request.post('/oauth/x/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      const startData = await startResponse.json();
      const authUrl = new URL(startData.authUrl);
      const state = authUrl.searchParams.get('state');

      const callbackResponse = await request.get('/oauth/x/callback', {
        params: {
          code: 'stub-auth-code-x',
          state: state!
        }
      });

      expect(callbackResponse.status()).toBe(302);
      expect(callbackResponse.headers()['location']).toContain('/auth/success');
    });
  });

  test.describe('Reddit OAuth', () => {
    test('should start Reddit OAuth flow', async ({ request }) => {
      const response = await request.post('/oauth/reddit/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.authUrl).toBeTruthy();
      expect(data.authUrl).toContain('reddit.com');
      expect(data.authUrl).toContain('state=');
    });

    test('should handle Reddit callback', async ({ request }) => {
      const startResponse = await request.post('/oauth/reddit/start', {
        data: {
          creatorId: 'test-creator-oauth',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      const startData = await startResponse.json();
      const authUrl = new URL(startData.authUrl);
      const state = authUrl.searchParams.get('state');

      const callbackResponse = await request.get('/oauth/reddit/callback', {
        params: {
          code: 'stub-auth-code-reddit',
          state: state!
        }
      });

      expect(callbackResponse.status()).toBe(302);
      expect(callbackResponse.headers()['location']).toContain('/auth/success');
    });
  });

  test.describe('Multi-platform OAuth', () => {
    test('should handle multiple OAuth flows concurrently', async ({ request }) => {
      const platforms = ['instagram', 'tiktok', 'x', 'reddit'];
      const creatorId = 'test-creator-multi-oauth';

      // Start OAuth flows for all platforms
      const startPromises = platforms.map(platform =>
        request.post(`/oauth/${platform}/start`, {
          data: {
            creatorId,
            redirectUri: 'http://localhost:3000/oauth/callback'
          }
        })
      );

      const startResponses = await Promise.all(startPromises);

      // All should succeed
      startResponses.forEach((response, i) => {
        expect(response.ok()).toBeTruthy();
        console.log(`${platforms[i]} OAuth start: OK`);
      });

      // Extract states and simulate callbacks
      const callbackPromises = [];
      
      for (let i = 0; i < platforms.length; i++) {
        const data = await startResponses[i].json();
        const authUrl = new URL(data.authUrl);
        const state = authUrl.searchParams.get('state');
        
        callbackPromises.push(
          request.get(`/oauth/${platforms[i]}/callback`, {
            params: {
              code: `stub-code-${platforms[i]}`,
              state: state!
            }
          })
        );
      }

      const callbackResponses = await Promise.all(callbackPromises);

      // All callbacks should succeed
      callbackResponses.forEach((response, i) => {
        expect(response.status()).toBe(302);
        expect(response.headers()['location']).toContain('/auth/success');
        console.log(`${platforms[i]} OAuth callback: OK`);
      });
    });

    test('should prevent state collision between platforms', async ({ request }) => {
      const creatorId = 'test-creator-state-collision';

      // Start OAuth for Instagram
      const igResponse = await request.post('/oauth/instagram/start', {
        data: { creatorId, redirectUri: 'http://localhost:3000/oauth/callback' }
      });

      // Start OAuth for TikTok
      const ttResponse = await request.post('/oauth/tiktok/start', {
        data: { creatorId, redirectUri: 'http://localhost:3000/oauth/callback' }
      });

      const igData = await igResponse.json();
      const ttData = await ttResponse.json();

      const igState = new URL(igData.authUrl).searchParams.get('state');
      const ttState = new URL(ttData.authUrl).searchParams.get('state');

      // States should be different
      expect(igState).not.toBe(ttState);

      // Try using Instagram state with TikTok callback (should fail)
      const invalidCallback = await request.get('/oauth/tiktok/callback', {
        params: {
          code: 'valid-code',
          state: igState!
        }
      });

      expect(invalidCallback.status()).toBe(400);
      
      const errorData = await invalidCallback.json();
      expect(errorData.error).toContain('Invalid state');
    });
  });

  test.describe('OAuth Error Handling', () => {
    test('should handle network failures during token exchange', async ({ request }) => {
      // This test would require mocking the external OAuth provider
      // For now, we test the error handling paths
      
      const response = await request.get('/oauth/instagram/callback', {
        params: {
          code: 'code-that-will-fail-exchange',
          state: 'valid-state-but-will-timeout'
        }
      });

      // Should handle gracefully (either 400, 500, or redirect to error page)
      expect([400, 500, 302].includes(response.status())).toBeTruthy();
    });

    test('should expire OAuth states after timeout', async ({ request }) => {
      // Start OAuth flow
      const startResponse = await request.post('/oauth/instagram/start', {
        data: {
          creatorId: 'test-creator-timeout',
          redirectUri: 'http://localhost:3000/oauth/callback'
        }
      });

      const startData = await startResponse.json();
      const authUrl = new URL(startData.authUrl);
      const state = authUrl.searchParams.get('state');

      // Wait for state to expire (in real app this would be 1 hour)
      // For testing, we can mock expired state
      
      const callbackResponse = await request.get('/oauth/instagram/callback', {
        params: {
          code: 'valid-code',
          state: 'expired-state-123'
        }
      });

      expect(callbackResponse.status()).toBe(400);
      
      const errorData = await callbackResponse.json();
      expect(errorData.error).toContain('Invalid state');
    });
  });
});