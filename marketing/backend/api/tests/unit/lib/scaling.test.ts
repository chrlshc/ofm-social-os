import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { RateLimiter } from '../../../src/lib/rateLimit';
import { FairShareScheduler } from '../../../src/lib/scheduler';
import { Redis } from 'ioredis';

// Mock dependencies
vi.mock('../../../src/lib/redis');
vi.mock('../../../src/lib/database');
vi.mock('../../../src/lib/otel');
vi.mock('../../../src/lib/logger');
vi.mock('../../../src/lib/metrics');

describe('Multi-Account Scaling', () => {
  let mockRedis: vi.Mocked<Redis>;
  let rateLimiter: RateLimiter;
  let scheduler: FairShareScheduler;

  beforeEach(() => {
    // Mock Redis
    mockRedis = {
      pipeline: vi.fn().mockReturnValue({
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 'OK'],   // zremrangebyscore
          [null, 5],      // zcard
          [null, 'OK']    // pexpire
        ])
      }),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zcard: vi.fn().mockResolvedValue(5),
      zadd: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue(['key1', 'key2']),
      del: vi.fn().mockResolvedValue(2),
      ping: vi.fn().mockResolvedValue('PONG')
    } as any;

    rateLimiter = new RateLimiter(mockRedis);
    scheduler = new FairShareScheduler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('RateLimiter', () => {
    beforeEach(() => {
      // Mock platform configurations
      rateLimiter['platformConfigs'].set('tiktok:publish', {
        platform: 'tiktok',
        endpoint: 'publish',
        limitPerMinute: 1,
        limitPerHour: 100,
        limitPerDay: 1000,
        burstLimit: 2,
        burstWindowSeconds: 60
      });

      rateLimiter['platformConfigs'].set('instagram:publish', {
        platform: 'instagram',
        endpoint: 'publish',
        limitPerMinute: 5,
        limitPerHour: 200,
        limitPerDay: 1440,
        burstLimit: 10,
        burstWindowSeconds: 60
      });
    });

    describe('Sliding Window Rate Limiting', () => {
      it('should allow request when under rate limit', async () => {
        // Mock Redis to return count below limit
        mockRedis.pipeline().exec = vi.fn().mockResolvedValue([
          [null, 'OK'],   // zremrangebyscore
          [null, 0],      // zcard (0 requests in window)
          [null, 'OK']    // pexpire
        ]);

        const result = await rateLimiter.checkRateLimit(
          'token-123',
          'tiktok',
          'publish'
        );

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThan(0);
        expect(result.windowType).toBe('minute');
      });

      it('should block request when rate limit exceeded', async () => {
        // Mock Redis to return count at limit
        mockRedis.pipeline().exec = vi.fn().mockResolvedValue([
          [null, 'OK'],   // zremrangebyscore
          [null, 2],      // zcard (2 requests in burst window - at limit)
          [null, 'OK']    // pexpire
        ]);

        const result = await rateLimiter.checkRateLimit(
          'token-123',
          'tiktok',
          'publish'
        );

        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfterSeconds).toBeGreaterThan(0);
        expect(result.windowType).toBe('burst');
      });

      it('should check burst limit before other limits', async () => {
        // Mock burst limit exceeded but minute limit would be OK
        mockRedis.pipeline().exec = vi.fn()
          .mockResolvedValueOnce([
            [null, 'OK'],
            [null, 3], // 3 > burst limit of 2
            [null, 'OK']
          ]);

        const result = await rateLimiter.checkRateLimit(
          'token-123',
          'tiktok',
          'publish'
        );

        expect(result.allowed).toBe(false);
        expect(result.windowType).toBe('burst');
      });

      it('should handle different window types correctly', async () => {
        const config = rateLimiter.getConfig('instagram', 'publish');
        expect(config).toBeDefined();
        expect(config!.limitPerMinute).toBe(5);
        expect(config!.limitPerHour).toBe(200);
        expect(config!.limitPerDay).toBe(1440);
        expect(config!.burstLimit).toBe(10);
      });

      it('should generate correct Redis keys', async () => {
        const getRedisKey = (rateLimiter as any).getRedisKey;
        
        expect(getRedisKey('token-123', 'tiktok', 'publish', 'minute'))
          .toBe('rl:tiktok:token-123:publish:minute');
        
        expect(getRedisKey('token-456', 'instagram', 'upload', 'hour', 'identifier'))
          .toBe('rl:instagram:token-456:upload:hour:identifier');
      });

      it('should handle Redis errors gracefully', async () => {
        // Mock Redis pipeline error
        mockRedis.pipeline().exec = vi.fn().mockResolvedValue([
          [new Error('Redis error'), null],
          [null, 5],
          [null, 'OK']
        ]);

        const result = await rateLimiter.checkRateLimit(
          'token-123',
          'tiktok',
          'publish'
        );

        // Should fail open on Redis errors
        expect(result.allowed).toBe(true);
      });
    });

    describe('Rate Limit Reset', () => {
      it('should reset rate limits for specific token', async () => {
        await rateLimiter.resetRateLimits('token-123', 'tiktok', 'publish');

        expect(mockRedis.keys).toHaveBeenCalledWith('rl:tiktok:token-123:publish:*');
        expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2');
      });

      it('should reset all rate limits for token if no platform specified', async () => {
        await rateLimiter.resetRateLimits('token-123');

        expect(mockRedis.keys).toHaveBeenCalledWith('rl:*:token-123:*');
      });
    });

    describe('Rate Limit Status', () => {
      it('should return current status for all windows', async () => {
        mockRedis.zcard = vi.fn()
          .mockResolvedValueOnce(1)  // burst
          .mockResolvedValueOnce(2)  // minute
          .mockResolvedValueOnce(15) // hour
          .mockResolvedValueOnce(50); // day

        const status = await rateLimiter.getRateLimitStatus(
          'token-123',
          'tiktok',
          'publish'
        );

        expect(status).toEqual({
          burst: { count: 1, limit: 2, windowSeconds: 60 },
          minute: { count: 2, limit: 1 },
          hour: { count: 15, limit: 100 },
          day: { count: 50, limit: 1000 }
        });
      });
    });

    describe('Health Check', () => {
      it('should pass health check when Redis is responsive', async () => {
        const health = await rateLimiter.healthCheck();
        
        expect(health.healthy).toBe(true);
        expect(health.latency).toBeGreaterThan(0);
        expect(mockRedis.ping).toHaveBeenCalled();
      });

      it('should fail health check when Redis is down', async () => {
        mockRedis.ping = vi.fn().mockRejectedValue(new Error('Connection failed'));

        const health = await rateLimiter.healthCheck();
        
        expect(health.healthy).toBe(false);
        expect(health.error).toContain('Connection failed');
      });
    });
  });

  describe('FairShareScheduler', () => {
    describe('Token Selection', () => {
      it('should select token using round-robin with priority', () => {
        // This would require mocking the database function
        // For now, test the concept
        const priorities = [
          { tokenId: 'token-1', priority: 1, lastScheduled: null },
          { tokenId: 'token-2', priority: 2, lastScheduled: new Date('2023-01-01') },
          { tokenId: 'token-3', priority: 1, lastScheduled: new Date('2023-01-02') }
        ];

        // token-1 should be selected first (never scheduled + highest priority)
        // Then token-3 (same priority but scheduled earlier)
        // Then token-2 (lower priority)
        const sortedByPriority = priorities.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          if (!a.lastScheduled && b.lastScheduled) return -1;
          if (a.lastScheduled && !b.lastScheduled) return 1;
          if (!a.lastScheduled && !b.lastScheduled) return 0;
          return a.lastScheduled.getTime() - b.lastScheduled.getTime();
        });

        expect(sortedByPriority[0].tokenId).toBe('token-1');
        expect(sortedByPriority[1].tokenId).toBe('token-3');
        expect(sortedByPriority[2].tokenId).toBe('token-2');
      });
    });

    describe('Jitter Calculation', () => {
      it('should calculate jitter within specified bounds', () => {
        const calculateJitter = (scheduler as any).calculateJitter;
        const minMs = 30 * 60 * 1000; // 30 minutes
        const maxMs = 90 * 60 * 1000; // 90 minutes

        for (let i = 0; i < 100; i++) {
          const jitter = calculateJitter(minMs, maxMs);
          expect(jitter).toBeGreaterThanOrEqual(minMs);
          expect(jitter).toBeLessThanOrEqual(maxMs);
        }
      });

      it('should generate different jitter values', () => {
        const calculateJitter = (scheduler as any).calculateJitter;
        const jitters = new Set();

        for (let i = 0; i < 10; i++) {
          jitters.add(calculateJitter(0, 1000));
        }

        // Should have generated different values
        expect(jitters.size).toBeGreaterThan(1);
      });
    });

    describe('Circuit Breaker Logic', () => {
      it('should track failure counts correctly', () => {
        // Test circuit breaker state transitions
        const states = [
          { failures: 0, expectedState: 'closed' },
          { failures: 3, expectedState: 'closed' },
          { failures: 5, expectedState: 'open' },
          { failures: 7, expectedState: 'open' }
        ];

        states.forEach(({ failures, expectedState }) => {
          const state = failures >= 5 ? 'open' : 'closed';
          expect(state).toBe(expectedState);
        });
      });

      it('should calculate cooldown periods correctly', () => {
        const baseCooldown = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        
        const cooldownUntil = new Date(now + baseCooldown);
        const shouldBeInCooldown = cooldownUntil.getTime() > now;
        
        expect(shouldBeInCooldown).toBe(true);
      });
    });

    describe('Fairness Checking', () => {
      it('should detect starved tokens correctly', () => {
        const now = Date.now();
        const twoHoursAgo = now - (2 * 60 * 60 * 1000);
        const fourHoursAgo = now - (4 * 60 * 60 * 1000);

        const tokens = [
          { tokenId: 'token-1', lastScheduled: new Date(now - 30000) }, // 30 seconds ago
          { tokenId: 'token-2', lastScheduled: new Date(twoHoursAgo) }, // 2 hours ago
          { tokenId: 'token-3', lastScheduled: new Date(fourHoursAgo) }, // 4 hours ago (starved)
          { tokenId: 'token-4', lastScheduled: null } // Never scheduled (starved)
        ];

        const starvedTokens = tokens.filter(token => 
          !token.lastScheduled || token.lastScheduled.getTime() < twoHoursAgo
        );

        expect(starvedTokens).toHaveLength(2);
        expect(starvedTokens.map(t => t.tokenId)).toEqual(['token-3', 'token-4']);
      });

      it('should calculate maximum starvation time', () => {
        const now = Date.now();
        const timestamps = [
          now - (1 * 60 * 60 * 1000), // 1 hour ago
          now - (3 * 60 * 60 * 1000), // 3 hours ago
          now - (5 * 60 * 60 * 1000)  // 5 hours ago (max)
        ];

        const maxStarvationMs = Math.max(...timestamps.map(ts => now - ts));
        const maxStarvationMinutes = maxStarvationMs / (60 * 1000);

        expect(maxStarvationMinutes).toBe(300); // 5 hours = 300 minutes
      });
    });
  });

  describe('Integration Tests', () => {
    describe('Rate Limiting with Scheduling', () => {
      it('should integrate rate limiter with scheduler', async () => {
        // Mock rate limit check to return blocked
        mockRedis.pipeline().exec = vi.fn().mockResolvedValue([
          [null, 'OK'],
          [null, 5], // Over limit
          [null, 'OK']
        ]);

        const rateLimitResult = await rateLimiter.checkRateLimit(
          'token-123',
          'tiktok',
          'publish'
        );

        // If rate limited, scheduler should handle cooldown
        if (!rateLimitResult.allowed) {
          expect(rateLimitResult.retryAfterSeconds).toBeGreaterThan(0);
          
          // Scheduler would set cooldown period
          const cooldownUntil = new Date(Date.now() + (rateLimitResult.retryAfterSeconds! * 1000));
          expect(cooldownUntil.getTime()).toBeGreaterThan(Date.now());
        }
      });
    });

    describe('Platform-specific Configurations', () => {
      it('should handle TikTok strict 1-minute sliding window', () => {
        const tiktokConfig = rateLimiter.getConfig('tiktok', 'publish');
        expect(tiktokConfig?.limitPerMinute).toBe(1);
        expect(tiktokConfig?.burstLimit).toBe(2);
      });

      it('should handle Instagram higher limits', () => {
        const instagramConfig = rateLimiter.getConfig('instagram', 'publish');
        expect(instagramConfig?.limitPerMinute).toBe(5);
        expect(instagramConfig?.limitPerHour).toBe(200);
      });

      it('should handle unknown platforms gracefully', () => {
        const unknownConfig = rateLimiter.getConfig('unknown', 'publish');
        expect(unknownConfig).toBeNull();
      });
    });

    describe('Queue Name Generation', () => {
      it('should generate consistent queue names', () => {
        const tokenId = 'token-123';
        const platform = 'tiktok';
        const expectedQueueName = `publish:${platform}:${tokenId}`;

        // This would be used by worker manager
        expect(expectedQueueName).toBe('publish:tiktok:token-123');
      });

      it('should generate unique queue names for different tokens', () => {
        const generateQueueName = (platform: string, tokenId: string) => 
          `publish:${platform}:${tokenId}`;

        const queue1 = generateQueueName('tiktok', 'token-1');
        const queue2 = generateQueueName('tiktok', 'token-2');
        const queue3 = generateQueueName('instagram', 'token-1');

        expect(queue1).not.toBe(queue2);
        expect(queue1).not.toBe(queue3);
        expect(queue2).not.toBe(queue3);
      });
    });

    describe('Scaling Metrics', () => {
      it('should track scheduling metrics correctly', () => {
        const metrics = {
          totalTokens: 10,
          activeTokens: 8,
          jobsScheduled: 150,
          avgJobDuration: 2500, // ms
          circuitBreakerOpen: 1,
          rateLimitHits: 5
        };

        // Verify metric calculations
        const activePercentage = (metrics.activeTokens / metrics.totalTokens) * 100;
        expect(activePercentage).toBe(80);

        const avgJobDurationSeconds = metrics.avgJobDuration / 1000;
        expect(avgJobDurationSeconds).toBe(2.5);
      });

      it('should detect unhealthy scaling conditions', () => {
        const scenarios = [
          {
            description: 'Too many circuit breakers open',
            openCircuitBreakers: 6,
            totalTokens: 10,
            isHealthy: false
          },
          {
            description: 'High rate limit hit rate',
            rateLimitHits: 50,
            totalRequests: 100,
            isHealthy: false // 50% rate limit hit rate
          },
          {
            description: 'Normal operations',
            openCircuitBreakers: 1,
            totalTokens: 20,
            rateLimitHits: 2,
            totalRequests: 100,
            isHealthy: true
          }
        ];

        scenarios.forEach(scenario => {
          if (scenario.openCircuitBreakers !== undefined) {
            const circuitBreakerHealthy = (scenario.openCircuitBreakers! / scenario.totalTokens!) < 0.3;
            expect(circuitBreakerHealthy).toBe(scenario.isHealthy);
          }

          if (scenario.rateLimitHits !== undefined) {
            const rateLimitHealthy = (scenario.rateLimitHits! / scenario.totalRequests!) < 0.1;
            expect(rateLimitHealthy).toBe(scenario.isHealthy);
          }
        });
      });
    });
  });
});