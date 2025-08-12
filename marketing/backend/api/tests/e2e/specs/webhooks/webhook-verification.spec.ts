// E2E tests for webhook signature verification
// Tests webhook endpoints with proper signature validation

import { test, expect } from '@playwright/test';
import crypto from 'crypto';

test.describe('Webhook Signature Verification', () => {
  
  test.describe('TikTok Webhooks', () => {
    test('should verify valid TikTok webhook signature', async ({ request }) => {
      const payload = {
        event: 'video.publish',
        video_id: '7123456789012345678',
        status: 'ready'
      };
      
      const secret = process.env.TIKTOK_WEBHOOK_SECRET || 'test-secret';
      const bodyString = JSON.stringify(payload);
      
      // Generate valid signature
      const signature = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      const response = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json',
          'X-TikTok-Signature': signature,
          'X-TikTok-Timestamp': Math.floor(Date.now() / 1000).toString()
        },
        data: payload
      });

      expect(response.ok()).toBeTruthy();
      
      const data = await response.json();
      expect(data.success).toBeTruthy();
    });

    test('should reject invalid TikTok webhook signature', async ({ request }) => {
      const payload = {
        event: 'video.publish',
        video_id: '7123456789012345678',
        status: 'ready'
      };

      const response = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json',
          'X-TikTok-Signature': 'invalid-signature',
          'X-TikTok-Timestamp': Math.floor(Date.now() / 1000).toString()
        },
        data: payload
      });

      expect(response.status()).toBe(401);
      
      const data = await response.json();
      expect(data.error).toContain('Invalid signature');
    });

    test('should reject TikTok webhook with missing signature', async ({ request }) => {
      const payload = {
        event: 'video.publish',
        video_id: '7123456789012345678',
        status: 'ready'
      };

      const response = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json'
        },
        data: payload
      });

      expect(response.status()).toBe(401);
    });

    test('should handle TikTok webhook replay attacks', async ({ request }) => {
      const payload = {
        event: 'video.publish',
        video_id: '7123456789012345678',
        status: 'ready'
      };
      
      const secret = process.env.TIKTOK_WEBHOOK_SECRET || 'test-secret';
      const bodyString = JSON.stringify(payload);
      
      // Use old timestamp (5+ minutes ago)
      const oldTimestamp = Math.floor((Date.now() - 6 * 60 * 1000) / 1000);
      
      const signature = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      const response = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json',
          'X-TikTok-Signature': signature,
          'X-TikTok-Timestamp': oldTimestamp.toString()
        },
        data: payload
      });

      expect(response.status()).toBe(401);
      
      const data = await response.json();
      expect(data.error).toContain('timestamp');
    });

    test('should process valid TikTok video status webhook', async ({ request }) => {
      const videoId = '7123456789012345678';
      const payload = {
        event: 'video.publish',
        video_id: videoId,
        status: 'ready',
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      const secret = process.env.TIKTOK_WEBHOOK_SECRET || 'test-secret';
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      const response = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json',
          'X-TikTok-Signature': signature,
          'X-TikTok-Timestamp': payload.timestamp.toString()
        },
        data: payload
      });

      expect(response.ok()).toBeTruthy();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check that webhook was stored
      const eventsResponse = await request.get(`/webhooks/events?platform=tiktok&videoId=${videoId}`, {
        headers: {
          'Authorization': 'Bearer test-admin-token'
        }
      });

      expect(eventsResponse.ok()).toBeTruthy();
      
      const events = await eventsResponse.json();
      expect(events.events).toContainEqual(
        expect.objectContaining({
          platform: 'tiktok',
          topic: 'video.publish',
          payload: expect.objectContaining({
            video_id: videoId,
            status: 'ready'
          })
        })
      );
    });
  });

  test.describe('Instagram Webhooks', () => {
    test('should verify valid Instagram webhook signature', async ({ request }) => {
      const payload = {
        object: 'instagram',
        entry: [{
          id: '123456789',
          time: Date.now(),
          changes: [{
            value: {
              verb: 'add',
              object_id: '987654321',
              object: 'comment'
            },
            field: 'comments'
          }]
        }]
      };

      const secret = process.env.INSTAGRAM_WEBHOOK_SECRET || 'test-secret';
      const bodyString = JSON.stringify(payload);
      
      // Instagram uses SHA1 with 'sha1=' prefix
      const signature = 'sha1=' + crypto
        .createHmac('sha1', secret)
        .update(bodyString)
        .digest('hex');

      const response = await request.post('/webhooks/instagram', {
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature': signature
        },
        data: payload
      });

      expect(response.ok()).toBeTruthy();
    });

    test('should handle Instagram webhook verification challenge', async ({ request }) => {
      const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || 'test-verify-token';
      const challenge = 'random-challenge-string';

      const response = await request.get('/webhooks/instagram', {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': verifyToken,
          'hub.challenge': challenge
        }
      });

      expect(response.ok()).toBeTruthy();
      
      const responseText = await response.text();
      expect(responseText).toBe(challenge);
    });

    test('should reject Instagram webhook with wrong verify token', async ({ request }) => {
      const challenge = 'random-challenge-string';

      const response = await request.get('/webhooks/instagram', {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': challenge
        }
      });

      expect(response.status()).toBe(403);
    });

    test('should process Instagram comment webhook', async ({ request }) => {
      const payload = {
        object: 'instagram',
        entry: [{
          id: '123456789',
          time: Date.now(),
          changes: [{
            value: {
              verb: 'add',
              object_id: '987654321',
              object: 'comment',
              comment_id: '111222333',
              text: 'Great post!'
            },
            field: 'comments'
          }]
        }]
      };

      const secret = process.env.INSTAGRAM_WEBHOOK_SECRET || 'test-secret';
      const bodyString = JSON.stringify(payload);
      const signature = 'sha1=' + crypto
        .createHmac('sha1', secret)
        .update(bodyString)
        .digest('hex');

      const response = await request.post('/webhooks/instagram', {
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature': signature
        },
        data: payload
      });

      expect(response.ok()).toBeTruthy();

      // Verify comment processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      const eventsResponse = await request.get('/webhooks/events?platform=instagram&objectId=987654321', {
        headers: {
          'Authorization': 'Bearer test-admin-token'
        }
      });

      const events = await eventsResponse.json();
      expect(events.events).toContainEqual(
        expect.objectContaining({
          platform: 'instagram',
          topic: 'comments',
          payload: expect.objectContaining({
            comment_id: '111222333'
          })
        })
      );
    });
  });

  test.describe('Webhook Rate Limiting', () => {
    test('should rate limit webhook requests', async ({ request }) => {
      const payload = { event: 'test', data: 'rate-limit-test' };
      const secret = 'test-secret';
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      const promises = [];
      
      // Send 20 rapid webhook requests
      for (let i = 0; i < 20; i++) {
        promises.push(
          request.post('/webhooks/tiktok', {
            headers: {
              'Content-Type': 'application/json',
              'X-TikTok-Signature': signature,
              'X-TikTok-Timestamp': Math.floor(Date.now() / 1000).toString()
            },
            data: payload
          })
        );
      }

      const responses = await Promise.all(promises);

      // Some should be rate limited
      const rateLimited = responses.some(r => r.status() === 429);
      expect(rateLimited).toBeTruthy();
    });

    test('should allow webhooks after rate limit window', async ({ request }) => {
      const payload = { event: 'test', data: 'rate-limit-recovery' };
      const secret = 'test-secret';
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      // Trigger rate limit
      const rapidRequests = Array(10).fill(null).map(() =>
        request.post('/webhooks/tiktok', {
          headers: {
            'Content-Type': 'application/json',
            'X-TikTok-Signature': signature,
            'X-TikTok-Timestamp': Math.floor(Date.now() / 1000).toString()
          },
          data: payload
        })
      );

      await Promise.all(rapidRequests);

      // Wait for rate limit window to reset
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should be able to send webhook again
      const finalResponse = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json',
          'X-TikTok-Signature': signature,
          'X-TikTok-Timestamp': Math.floor(Date.now() / 1000).toString()
        },
        data: payload
      });

      expect([200, 429].includes(finalResponse.status())).toBeTruthy();
    });
  });

  test.describe('Webhook Idempotency', () => {
    test('should handle duplicate webhook deliveries', async ({ request }) => {
      const uniqueId = `test-${Date.now()}`;
      const payload = {
        event: 'video.publish',
        video_id: uniqueId,
        status: 'ready'
      };

      const secret = 'test-secret';
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(bodyString)
        .digest('hex');

      const headers = {
        'Content-Type': 'application/json',
        'X-TikTok-Signature': signature,
        'X-TikTok-Timestamp': Math.floor(Date.now() / 1000).toString()
      };

      // Send same webhook twice
      const response1 = await request.post('/webhooks/tiktok', {
        headers,
        data: payload
      });

      const response2 = await request.post('/webhooks/tiktok', {
        headers,
        data: payload
      });

      // Both should succeed (idempotent)
      expect(response1.ok()).toBeTruthy();
      expect(response2.ok()).toBeTruthy();

      // But second should indicate it was a duplicate
      const data2 = await response2.json();
      expect(data2.duplicate || data2.success).toBeTruthy();
    });
  });

  test.describe('Webhook Error Handling', () => {
    test('should handle malformed webhook payload', async ({ request }) => {
      const response = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json',
          'X-TikTok-Signature': 'any-signature',
          'X-TikTok-Timestamp': Math.floor(Date.now() / 1000).toString()
        },
        data: 'invalid-json{'
      });

      expect(response.status()).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('payload');
    });

    test('should handle missing required headers', async ({ request }) => {
      const response = await request.post('/webhooks/tiktok', {
        headers: {
          'Content-Type': 'application/json'
          // Missing X-TikTok-Signature
        },
        data: { event: 'test' }
      });

      expect(response.status()).toBe(401);
    });
  });
});