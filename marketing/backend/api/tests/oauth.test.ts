import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import nock from 'nock';
import { app } from '../src/app';
import { db } from '../src/lib/db';

describe('OAuth Flow Tests', () => {
  const testCreatorId = 'test-creator-123';
  
  beforeAll(async () => {
    // Setup test database
    await db.query(`
      INSERT INTO creators (id, display_name) 
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [testCreatorId, 'Test Creator']);
  });

  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM creators WHERE id = $1', [testCreatorId]);
  });

  describe('Instagram OAuth', () => {
    it('should start OAuth flow and return auth URL', async () => {
      const response = await request(app)
        .post('/oauth/instagram/start')
        .send({
          creatorId: testCreatorId,
          redirectUri: 'http://localhost:3000/callback'
        });

      expect(response.status).toBe(200);
      expect(response.body.authUrl).toMatch(/facebook\.com\/dialog\/oauth/);
      expect(response.body.authUrl).toContain('state=');
    });

    it('should handle OAuth callback with valid code', async () => {
      // Mock Instagram token exchange
      nock('https://graph.facebook.com')
        .post('/v18.0/oauth/access_token')
        .reply(200, {
          access_token: 'test-ig-token',
          token_type: 'bearer',
          expires_in: 5184000
        });

      // Mock user info request
      nock('https://graph.facebook.com')
        .get('/v18.0/me')
        .query(true)
        .reply(200, {
          id: '123456789',
          username: 'testuser'
        });

      const state = 'valid-state-123';
      // Simulate state storage (in real app this happens in /start endpoint)
      
      const response = await request(app)
        .get('/oauth/instagram/callback')
        .query({
          code: 'test-auth-code',
          state: state
        });

      expect(response.status).toBe(302); // Redirect
      expect(response.headers.location).toContain('/auth/success');
    });

    it('should handle OAuth errors gracefully', async () => {
      const response = await request(app)
        .get('/oauth/instagram/callback')
        .query({
          error: 'access_denied',
          error_description: 'User denied access'
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/auth/error');
      expect(response.headers.location).toContain('error=access_denied');
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits on token refresh', async () => {
      // Create a test token
      const tokenId = 'test-token-123';
      await db.query(`
        INSERT INTO tokens (id, platform, access_token, refresh_token, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        tokenId,
        'instagram',
        'old-access-token',
        'test-refresh-token',
        new Date(Date.now() - 1000) // Expired
      ]);

      // Mock token refresh with rate limit headers
      nock('https://graph.facebook.com')
        .post('/v18.0/oauth/access_token')
        .reply(200, {
          access_token: 'new-access-token',
          token_type: 'bearer',
          expires_in: 3600
        }, {
          'X-App-Usage': JSON.stringify({ call_count: 95, total_cputime: 20 })
        });

      const response = await request(app)
        .post('/oauth/instagram/refresh')
        .send({ tokenId });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify token was updated
      const result = await db.query(
        'SELECT access_token FROM tokens WHERE id = $1',
        [tokenId]
      );
      expect(result.rows[0].access_token).toBe('new-access-token');

      // Cleanup
      await db.query('DELETE FROM tokens WHERE id = $1', [tokenId]);
    });

    it('should handle 429 rate limit errors', async () => {
      const tokenId = 'test-token-429';
      await db.query(`
        INSERT INTO tokens (id, platform, access_token, refresh_token)
        VALUES ($1, $2, $3, $4)
      `, [tokenId, 'instagram', 'token', 'refresh']);

      // Mock 429 response
      nock('https://graph.facebook.com')
        .post('/v18.0/oauth/access_token')
        .reply(429, {
          error: {
            message: 'Too many requests',
            code: 429
          }
        }, {
          'Retry-After': '3600'
        });

      const response = await request(app)
        .post('/oauth/instagram/refresh')
        .send({ tokenId });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to refresh token');

      // Cleanup
      await db.query('DELETE FROM tokens WHERE id = $1', [tokenId]);
    });
  });

  describe('Multi-platform OAuth', () => {
    const platforms = ['instagram', 'tiktok', 'x', 'reddit'];

    platforms.forEach(platform => {
      it(`should start OAuth flow for ${platform}`, async () => {
        const response = await request(app)
          .post(`/oauth/${platform}/start`)
          .send({
            creatorId: testCreatorId,
            redirectUri: 'http://localhost:3000/callback'
          });

        expect(response.status).toBe(200);
        expect(response.body.authUrl).toBeTruthy();
        expect(response.body.authUrl).toContain('state=');
      });
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify TikTok webhook signature', async () => {
      const payload = { event: 'video.publish', video_id: '123' };
      const secret = 'webhook-secret';
      
      // Calculate valid signature
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const response = await request(app)
        .post('/webhooks/tiktok')
        .set('X-TikTok-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should reject invalid webhook signature', async () => {
      const response = await request(app)
        .post('/webhooks/tiktok')
        .set('X-TikTok-Signature', 'invalid-signature')
        .send({ event: 'video.publish' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid signature');
    });
  });
});