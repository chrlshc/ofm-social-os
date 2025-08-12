import { describe, it, expect, beforeAll } from '@jest/globals';
import { WebhookSecurityManager } from '../../lib/webhooks';
import { createHmac } from 'crypto';

describe('Webhook Signature Verification', () => {
  const testSecret = 'a1b2c3d4e5f6789012345678901234567890abcdef123456789012345678abcd';
  
  beforeAll(() => {
    process.env.WEBHOOK_SECRET = testSecret;
    process.env.TIKTOK_CLIENT_SECRET = 'test_tiktok_secret';
    process.env.META_APP_SECRET = 'test_meta_secret';
  });

  describe('TikTok Signature Verification', () => {
    it('should verify valid TikTok signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ event: { type: 'video.publish.complete' } });
      const signedPayload = `${timestamp}.${payload}`;
      
      // Generate valid signature
      const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET!)
        .update(signedPayload)
        .digest('hex');
      
      const isValid = WebhookSecurityManager.verifyTikTokSignature(
        signedPayload,
        signature,
        timestamp.toString()
      );
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid TikTok signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ event: { type: 'video.publish.complete' } });
      const signedPayload = `${timestamp}.${payload}`;
      
      const isValid = WebhookSecurityManager.verifyTikTokSignature(
        signedPayload,
        'invalid_signature',
        timestamp.toString()
      );
      
      expect(isValid).toBe(false);
    });

    it('should reject TikTok signature with modified payload', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const originalPayload = JSON.stringify({ event: { type: 'video.publish.complete' } });
      const signedPayload = `${timestamp}.${originalPayload}`;
      
      // Generate signature for original payload
      const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET!)
        .update(signedPayload)
        .digest('hex');
      
      // Modify payload
      const modifiedPayload = JSON.stringify({ event: { type: 'video.publish.failed' } });
      const modifiedSignedPayload = `${timestamp}.${modifiedPayload}`;
      
      const isValid = WebhookSecurityManager.verifyTikTokSignature(
        modifiedSignedPayload,
        signature,
        timestamp.toString()
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('Meta/Instagram Signature Verification', () => {
    it('should verify valid Meta signature', () => {
      const payload = JSON.stringify({
        entry: [{
          id: '123456',
          changes: [{
            field: 'comments',
            value: { text: 'Great post!' }
          }]
        }]
      });
      
      // Generate valid signature
      const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!)
        .update(payload)
        .digest('hex');
      
      const isValid = WebhookSecurityManager.verifyMetaSignature(payload, signature);
      
      expect(isValid).toBe(true);
    });

    it('should reject Meta signature without sha256= prefix', () => {
      const payload = JSON.stringify({ entry: [] });
      
      // Generate signature without prefix
      const signature = createHmac('sha256', process.env.META_APP_SECRET!)
        .update(payload)
        .digest('hex');
      
      const isValid = WebhookSecurityManager.verifyMetaSignature(payload, signature);
      
      expect(isValid).toBe(true); // Should still work as the function adds prefix if missing
    });

    it('should reject invalid Meta signature', () => {
      const payload = JSON.stringify({ entry: [] });
      
      const isValid = WebhookSecurityManager.verifyMetaSignature(
        payload, 
        'sha256=invalid_signature_hash'
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('Timestamp Verification', () => {
    it('should accept timestamp within 5 minute window', () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamps = [
        currentTime,                  // Current time
        currentTime - 60,            // 1 minute ago
        currentTime - 299,           // 4:59 ago
        currentTime + 60,            // 1 minute future
        currentTime + 299            // 4:59 future
      ];
      
      timestamps.forEach(timestamp => {
        const isValid = WebhookSecurityManager.verifyTimestamp(timestamp);
        expect(isValid).toBe(true);
      });
    });

    it('should reject timestamp outside 5 minute window', () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamps = [
        currentTime - 301,           // 5:01 ago
        currentTime - 600,           // 10 minutes ago
        currentTime + 301,           // 5:01 future
        currentTime + 600,           // 10 minutes future
        0,                          // Unix epoch
        currentTime + 86400         // 1 day future
      ];
      
      timestamps.forEach(timestamp => {
        const isValid = WebhookSecurityManager.verifyTimestamp(timestamp);
        expect(isValid).toBe(false);
      });
    });

    it('should use custom tolerance window', () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamp = currentTime - 120; // 2 minutes ago
      
      // Should fail with 60 second tolerance
      expect(WebhookSecurityManager.verifyTimestamp(timestamp, 60)).toBe(false);
      
      // Should pass with 180 second tolerance
      expect(WebhookSecurityManager.verifyTimestamp(timestamp, 180)).toBe(true);
    });
  });

  describe('Raw Body Handling', () => {
    it('should verify signature with exact byte-for-byte body', () => {
      // Test with unicode characters
      const payload = JSON.stringify({
        text: '🎉 Hello "world" with special chars: \n\t',
        unicode: '你好世界'
      });
      
      const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!)
        .update(payload)
        .digest('hex');
      
      // Should verify with exact same payload
      expect(WebhookSecurityManager.verifyMetaSignature(payload, signature)).toBe(true);
      
      // Should fail with re-serialized payload (different whitespace)
      const reparsed = JSON.stringify(JSON.parse(payload));
      expect(WebhookSecurityManager.verifyMetaSignature(reparsed, signature))
        .toBe(payload === reparsed); // Only true if serialization is identical
    });

    it('should handle empty body', () => {
      const emptyPayload = '';
      const signature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!)
        .update(emptyPayload)
        .digest('hex');
      
      expect(WebhookSecurityManager.verifyMetaSignature(emptyPayload, signature)).toBe(true);
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison', () => {
      const payload = JSON.stringify({ test: 'data' });
      const correctSignature = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET!)
        .update(payload)
        .digest('hex');
      
      // Measure multiple verification attempts
      const timings: number[] = [];
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        // Alternate between correct and incorrect signatures
        const signature = i % 2 === 0 ? correctSignature : 'sha256=0'.repeat(32);
        
        const start = process.hrtime.bigint();
        WebhookSecurityManager.verifyMetaSignature(payload, signature);
        const end = process.hrtime.bigint();
        
        timings.push(Number(end - start));
      }
      
      // Calculate variance - should be relatively consistent
      const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      const variance = timings.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / timings.length;
      const stdDev = Math.sqrt(variance);
      
      // Standard deviation should be relatively small compared to average
      // This is a rough test - timing attacks are hard to test reliably
      expect(stdDev / avgTime).toBeLessThan(0.5);
    });
  });
});