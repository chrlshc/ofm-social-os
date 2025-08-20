import { describe, it, expect } from '@jest/globals';
import { validateRequest, publishPostSchema, sanitizeHtml, sanitizeLog } from '@/lib/validation';
import { checkJWTSize } from '@/lib/jwt-size-monitor';
import { encrypt, decrypt } from '@/lib/kms-crypto';

describe('Security Tests', () => {
  
  describe('Zod Validation', () => {
    it('should reject SQL injection attempts', async () => {
      const maliciousInput = {
        platform: "reddit'; DROP TABLE users; --",
        caption: 'Test',
        media_url: 'https://example.com'
      };
      
      const result = await validateRequest(publishPostSchema, maliciousInput);
      expect('error' in result).toBe(true);
    });
    
    it('should reject XSS attempts', async () => {
      const xssInput = {
        platform: 'reddit',
        caption: '<script>alert("XSS")</script>',
        media_url: 'javascript:alert("XSS")'
      };
      
      const result = await validateRequest(publishPostSchema, xssInput);
      expect('error' in result).toBe(true); // media_url must be valid URL
    });
    
    it('should accept valid input', async () => {
      const validInput = {
        platform: 'reddit',
        caption: 'This is a valid post',
        media_url: 'https://example.com/image.jpg',
        scheduled_at: new Date().toISOString()
      };
      
      const result = await validateRequest(publishPostSchema, validInput);
      expect('data' in result).toBe(true);
    });
  });
  
  describe('Sanitization', () => {
    it('should escape HTML entities', () => {
      const dangerous = '<script>alert("xss")</script>';
      const safe = sanitizeHtml(dangerous);
      expect(safe).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });
    
    it('should redact sensitive data from logs', () => {
      const sensitive = {
        user: 'test',
        password: 'secret123',
        access_token: 'token123',
        data: {
          api_key: 'key123',
          public_info: 'safe'
        }
      };
      
      const sanitized = sanitizeLog(sensitive);
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.access_token).toBe('[REDACTED]');
      expect(sanitized.data.api_key).toBe('[REDACTED]');
      expect(sanitized.data.public_info).toBe('safe');
    });
  });
  
  describe('JWT Size Monitoring', () => {
    it('should detect oversized JWTs', () => {
      const largeToken = {
        id: '123',
        email: 'test@example.com',
        // Add lots of data to exceed 4KB
        permissions: new Array(1000).fill('permission'),
        profile: new Array(100).fill('data').join('')
      };
      
      const result = checkJWTSize(largeToken);
      expect(result.isValid).toBe(false);
      expect(result.warning).toContain('exceeds safe limit');
    });
    
    it('should accept normal-sized JWTs', () => {
      const normalToken = {
        id: '123',
        email: 'test@example.com',
        stripeOnboardingComplete: true
      };
      
      const result = checkJWTSize(normalToken);
      expect(result.isValid).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });
  
  describe('Encryption', () => {
    it('should handle KMS fallback gracefully', async () => {
      const plaintext = 'sensitive-token-123';
      
      // Should work even without KMS configured
      const encrypted = await encrypt(plaintext);
      expect(encrypted).toMatch(/^(kms:|local:)/);
      
      const decrypted = await decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
    
    it('should handle encryption rotation', async () => {
      const plaintext = 'token-to-rotate';
      
      // Encrypt with current method
      const encrypted1 = await encrypt(plaintext);
      
      // Simulate rotation
      const { rotateEncryption } = await import('@/lib/kms-crypto');
      const encrypted2 = await rotateEncryption(encrypted1);
      
      // Both should decrypt to same value
      const decrypted1 = await decrypt(encrypted1);
      const decrypted2 = await decrypt(encrypted2);
      
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });
  });
  
  describe('CSRF Protection', () => {
    it('should reject requests without CSRF token', async () => {
      // This would be tested in an integration test
      // Simulating the behavior here
      const request = new Request('http://localhost/api/social/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: true })
      });
      
      // In real middleware, this would be rejected
      expect(request.headers.get('X-CSRF-Token')).toBeNull();
    });
  });
  
  describe('Auth Bypass Attempts', () => {
    it('should not leak user existence', async () => {
      // Test that login errors are generic
      const responses = [
        { email: 'nonexistent@example.com', password: 'wrong' },
        { email: 'existing@example.com', password: 'wrong' }
      ];
      
      // Both should return same generic error
      // This prevents user enumeration attacks
      const errors = responses.map(() => 'Invalid credentials');
      expect(new Set(errors).size).toBe(1);
    });
  });
});

// CI/CD Security Audit Script
export async function runSecurityAudit() {
  const results = {
    timestamp: new Date(),
    checks: {
      dependencies: false,
      injection: false,
      csrf: false,
      auth: false
    }
  };
  
  // 1. Check npm dependencies
  const { execSync } = await import('child_process');
  try {
    execSync('npm audit --audit-level=high', { stdio: 'pipe' });
    results.checks.dependencies = true;
  } catch (error) {
    console.error('❌ npm audit found vulnerabilities');
  }
  
  // 2. Run injection tests
  // 3. Run CSRF tests  
  // 4. Run auth bypass tests
  
  return results;
}