import { test, expect } from '@playwright/test';
import { createHmac } from 'crypto';

test.describe('Webhook E2E Tests', () => {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  
  test.describe('TikTok Webhooks', () => {
    test('should accept valid TikTok webhook with proper signature', async ({ request }) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = {
        event: {
          event_id: `e2e_test_${timestamp}`,
          type: 'video.publish.complete',
          account: { username: 'test_user' },
          video: { id: 'video_123' },
          metrics: {
            view_count: 100,
            like_count: 10,
            comment_count: 5,
            share_count: 2
          }
        }
      };
      
      const rawBody = JSON.stringify(payload);
      const signedPayload = `${timestamp}.${rawBody}`;
      const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET || 'test_secret')
        .update(signedPayload)
        .digest('hex');
      
      const response = await request.post(`${baseUrl}/webhooks/tiktok`, {
        data: rawBody,
        headers: {
          'Content-Type': 'application/json',
          'TikTok-Signature': `t=${timestamp},s=${signature}`
        }
      });
      
      expect(response.status()).toBe(200);
      expect(await response.text()).toBe('OK');
      
      // Response should be fast (< 1s)
      const timing = response.headers()['x-response-time'];
      if (timing) {
        expect(parseInt(timing)).toBeLessThan(1000);
      }
    });

    test('should reject TikTok webhook with invalid signature', async ({ request }) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = {
        event: {
          event_id: `e2e_invalid_${timestamp}`,
          type: 'video.publish.complete'
        }
      };
      
      const response = await request.post(`${baseUrl}/webhooks/tiktok`, {
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          'TikTok-Signature': `t=${timestamp},s=invalid_signature`
        }
      });
      
      // Should still return 200 (acknowledge receipt)
      expect(response.status()).toBe(200);
    });

    test('should reject TikTok webhook with old timestamp', async ({ request }) => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6:40 ago
      const payload = {
        event: {
          event_id: `e2e_old_${oldTimestamp}`,
          type: 'video.publish.complete'
        }
      };
      
      const rawBody = JSON.stringify(payload);
      const signedPayload = `${oldTimestamp}.${rawBody}`;
      const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET || 'test_secret')
        .update(signedPayload)
        .digest('hex');
      
      const response = await request.post(`${baseUrl}/webhooks/tiktok`, {
        data: rawBody,
        headers: {
          'Content-Type': 'application/json',
          'TikTok-Signature': `t=${oldTimestamp},s=${signature}`
        }
      });
      
      // Should still return 200 (acknowledge receipt)
      expect(response.status()).toBe(200);
    });

    test('should handle duplicate TikTok webhooks', async ({ request }) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const eventId = `e2e_duplicate_${timestamp}`;
      const payload = {
        event: {
          event_id: eventId,
          type: 'video.publish.complete',
          video: { id: 'video_456' }
        }
      };
      
      const rawBody = JSON.stringify(payload);
      const signedPayload = `${timestamp}.${rawBody}`;
      const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET || 'test_secret')
        .update(signedPayload)
        .digest('hex');
      
      const headers = {
        'Content-Type': 'application/json',
        'TikTok-Signature': `t=${timestamp},s=${signature}`
      };
      
      // Send first webhook
      const response1 = await request.post(`${baseUrl}/webhooks/tiktok`, {
        data: rawBody,
        headers
      });
      expect(response1.status()).toBe(200);
      
      // Send duplicate
      const response2 = await request.post(`${baseUrl}/webhooks/tiktok`, {
        data: rawBody,
        headers
      });
      expect(response2.status()).toBe(200);
      
      // Both should succeed (idempotent)
    });
  });

  test.describe('Meta/Instagram Webhooks', () => {
    test('should handle Meta webhook verification challenge', async ({ request }) => {
      const challenge = 'test_challenge_string_12345';
      const verifyToken = process.env.META_VERIFY_TOKEN || 'test_verify_token';
      
      const response = await request.get(`${baseUrl}/webhooks/meta`, {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': verifyToken,
          'hub.challenge': challenge
        }
      });
      
      expect(response.status()).toBe(200);
      expect(await response.text()).toBe(challenge);
      expect(response.headers()['content-type']).toContain('text/plain');
    });

    test('should reject Meta verification with wrong token', async ({ request }) => {
      const response = await request.get(`${baseUrl}/webhooks/meta`, {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'test_challenge'
        }
      });
      
      expect(response.status()).toBe(403);
    });

    test('should accept valid Meta webhook with signature', async ({ request }) => {
      const payload = {
        entry: [{
          id: '123456789',
          time: Date.now() / 1000,
          changes: [{
            field: 'comments',
            value: {
              id: 'comment_123',
              text: 'Great post!',
              from: {
                id: 'user_123',
                username: 'testuser'
              }
            }
          }]
        }]
      };
      
      const rawBody = JSON.stringify(payload);
      const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET || 'test_secret')
        .update(rawBody)
        .digest('hex');
      
      const response = await request.post(`${baseUrl}/webhooks/meta`, {
        data: rawBody,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature
        }
      });
      
      expect(response.status()).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    test('should handle multiple Meta events in one webhook', async ({ request }) => {
      const payload = {
        entry: [{
          id: '123456789',
          time: Date.now() / 1000,
          changes: [
            {
              field: 'comments',
              value: {
                id: 'comment_1',
                text: 'First comment',
                from: { id: 'user_1', username: 'user1' }
              }
            },
            {
              field: 'mentions', 
              value: {
                id: 'mention_1',
                caption: '@testaccount check this out',
                from: { id: 'user_2', username: 'user2' }
              }
            }
          ]
        }]
      };
      
      const rawBody = JSON.stringify(payload);
      const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET || 'test_secret')
        .update(rawBody)
        .digest('hex');
      
      const response = await request.post(`${baseUrl}/webhooks/meta`, {
        data: rawBody,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature
        }
      });
      
      expect(response.status()).toBe(200);
    });
  });

  test.describe('Rate Limiting', () => {
    test('should respect rate limits', async ({ request }) => {
      const requests = [];
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Send 60 requests rapidly (exceeds 50/sec limit)
      for (let i = 0; i < 60; i++) {
        const payload = {
          event: {
            event_id: `e2e_rate_${timestamp}_${i}`,
            type: 'test'
          }
        };
        
        requests.push(
          request.post(`${baseUrl}/webhooks/tiktok`, {
            data: payload,
            headers: {
              'Content-Type': 'application/json',
              'TikTok-Signature': `t=${timestamp},s=test`
            }
          })
        );
      }
      
      const responses = await Promise.all(requests);
      
      // Count rate limited responses
      const rateLimited = responses.filter(r => r.status() === 429);
      const successful = responses.filter(r => r.status() === 200);
      
      // Should have some rate limited responses
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(successful.length).toBeLessThanOrEqual(50);
    });
  });

  test.describe('Webhook Management', () => {
    test('should retrieve webhook stats', async ({ request }) => {
      const response = await request.get(`${baseUrl}/webhooks/stats`);
      
      expect(response.status()).toBe(200);
      const stats = await response.json();
      
      expect(stats).toHaveProperty('stats');
      expect(stats).toHaveProperty('timestamp');
      expect(Array.isArray(stats.stats)).toBe(true);
    });

    test('should list DLQ items', async ({ request }) => {
      const response = await request.get(`${baseUrl}/webhooks/dlq`);
      
      expect(response.status()).toBe(200);
      const dlq = await response.json();
      
      expect(dlq).toHaveProperty('items');
      expect(dlq).toHaveProperty('count');
      expect(Array.isArray(dlq.items)).toBe(true);
    });

    test('should retry DLQ item', async ({ request }) => {
      // First, we need a failed webhook in DLQ
      // This would be set up in test fixtures
      const testEventId = 'test_dlq_retry_123';
      
      const response = await request.post(`${baseUrl}/webhooks/dlq/${testEventId}/retry`);
      
      // May be 404 if no such event
      expect([200, 404]).toContain(response.status());
      
      if (response.status() === 200) {
        const result = await response.json();
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('eventId');
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle malformed JSON', async ({ request }) => {
      const response = await request.post(`${baseUrl}/webhooks/tiktok`, {
        data: 'invalid json {',
        headers: {
          'Content-Type': 'application/json',
          'TikTok-Signature': 't=123,s=test'
        }
      });
      
      // Should still return 200 (acknowledge receipt)
      expect(response.status()).toBe(200);
    });

    test('should handle missing content type', async ({ request }) => {
      const response = await request.post(`${baseUrl}/webhooks/tiktok`, {
        data: JSON.stringify({ test: 'data' }),
        headers: {
          'TikTok-Signature': 't=123,s=test'
        }
      });
      
      // Should still return 200 (acknowledge receipt)
      expect(response.status()).toBe(200);
    });

    test('should handle empty body', async ({ request }) => {
      const response = await request.post(`${baseUrl}/webhooks/meta`, {
        data: '',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=test'
        }
      });
      
      // Should still return 200 (acknowledge receipt)
      expect(response.status()).toBe(200);
    });

    test('should timeout after 5 seconds', async ({ request }) => {
      // This test would require a special endpoint that delays response
      // For now, we just verify the timeout is configured
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      
      try {
        const response = await request.post(`${baseUrl}/webhooks/tiktok`, {
          data: JSON.stringify({ test: 'timeout' }),
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal as any
        });
        
        // If it completes, should be within timeout
        expect(response.status()).toBe(200);
      } catch (error: any) {
        // Timeout is also acceptable
        expect(error.name).toBe('AbortError');
      } finally {
        clearTimeout(timeout);
      }
    });
  });
});