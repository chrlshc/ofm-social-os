import { Redis } from 'ioredis';
import { redis } from './redis';
import { pool } from './database';
import { loggers } from './logger';
import { withSpan } from './otel';
import { promises as metrics } from './metrics';

const logger = loggers.rateLimit;

export interface RateLimitConfig {
  platform: string;
  endpoint: string;
  limitPerMinute?: number;
  limitPerHour?: number;
  limitPerDay?: number;
  burstLimit?: number;
  burstWindowSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
  limit: number;
  windowType: 'minute' | 'hour' | 'day' | 'burst';
}

export interface SlidingWindowResult {
  count: number;
  allowed: boolean;
  windowStart: number;
  windowEnd: number;
}

/**
 * Redis-based rate limiter with sliding windows
 * Supports per-minute, per-hour, per-day, and burst limits
 */
export class RateLimiter {
  private redis: Redis;
  private platformConfigs: Map<string, RateLimitConfig> = new Map();

  constructor(redisClient: Redis = redis) {
    this.redis = redisClient;
  }

  // =============================================
  // Configuration Management
  // =============================================

  async loadPlatformConfigs(): Promise<void> {
    return withSpan('rate_limiter.load_configs', {}, async () => {
      try {
        const result = await pool.query(`
          SELECT platform, endpoint, limit_per_minute, limit_per_hour, 
                 limit_per_day, burst_limit, burst_window_seconds
          FROM platform_rate_limits
          WHERE is_active = true
        `);

        this.platformConfigs.clear();
        
        for (const row of result.rows) {
          const key = `${row.platform}:${row.endpoint}`;
          this.platformConfigs.set(key, {
            platform: row.platform,
            endpoint: row.endpoint,
            limitPerMinute: row.limit_per_minute,
            limitPerHour: row.limit_per_hour,
            limitPerDay: row.limit_per_day,
            burstLimit: row.burst_limit,
            burstWindowSeconds: row.burst_window_seconds || 60
          });
        }

        logger.info({
          configsLoaded: this.platformConfigs.size
        }, 'Platform rate limit configurations loaded');

      } catch (error) {
        logger.error({ err: error }, 'Failed to load platform rate limit configs');
        throw error;
      }
    });
  }

  getConfig(platform: string, endpoint: string): RateLimitConfig | null {
    return this.platformConfigs.get(`${platform}:${endpoint}`) || null;
  }

  // =============================================
  // Rate Limiting Core
  // =============================================

  /**
   * Check if request is allowed under rate limits
   * Uses sliding windows for accurate rate limiting
   */
  async checkRateLimit(
    tokenId: string,
    platform: string,
    endpoint: string,
    identifier?: string
  ): Promise<RateLimitResult> {
    return withSpan('rate_limiter.check', {
      'rate_limit.platform': platform,
      'rate_limit.endpoint': endpoint,
      'rate_limit.token_id': tokenId
    }, async (span) => {
      const config = this.getConfig(platform, endpoint);
      if (!config) {
        // No rate limiting configured - allow request
        return {
          allowed: true,
          remaining: 999999,
          resetAt: new Date(Date.now() + 60000),
          limit: 999999,
          windowType: 'minute'
        };
      }

      // Check burst limit first (shortest window)
      if (config.burstLimit) {
        const burstResult = await this.checkSlidingWindow(
          tokenId,
          platform,
          endpoint,
          'burst',
          config.burstLimit,
          config.burstWindowSeconds!,
          identifier
        );

        if (!burstResult.allowed) {
          span.setAttributes({
            'rate_limit.blocked_by': 'burst',
            'rate_limit.count': burstResult.count,
            'rate_limit.limit': config.burstLimit
          });

          await this.recordRateLimitHit(tokenId, platform, endpoint, 'burst');
          
          return {
            allowed: false,
            remaining: 0,
            resetAt: new Date(burstResult.windowEnd),
            retryAfterSeconds: Math.ceil((burstResult.windowEnd - Date.now()) / 1000),
            limit: config.burstLimit,
            windowType: 'burst'
          };
        }
      }

      // Check per-minute limit
      if (config.limitPerMinute) {
        const minuteResult = await this.checkSlidingWindow(
          tokenId,
          platform,
          endpoint,
          'minute',
          config.limitPerMinute,
          60,
          identifier
        );

        if (!minuteResult.allowed) {
          span.setAttributes({
            'rate_limit.blocked_by': 'minute',
            'rate_limit.count': minuteResult.count,
            'rate_limit.limit': config.limitPerMinute
          });

          await this.recordRateLimitHit(tokenId, platform, endpoint, 'minute');
          
          return {
            allowed: false,
            remaining: 0,
            resetAt: new Date(minuteResult.windowEnd),
            retryAfterSeconds: Math.ceil((minuteResult.windowEnd - Date.now()) / 1000),
            limit: config.limitPerMinute,
            windowType: 'minute'
          };
        }
      }

      // Check per-hour limit
      if (config.limitPerHour) {
        const hourResult = await this.checkSlidingWindow(
          tokenId,
          platform,
          endpoint,
          'hour',
          config.limitPerHour,
          3600,
          identifier
        );

        if (!hourResult.allowed) {
          span.setAttributes({
            'rate_limit.blocked_by': 'hour',
            'rate_limit.count': hourResult.count,
            'rate_limit.limit': config.limitPerHour
          });

          await this.recordRateLimitHit(tokenId, platform, endpoint, 'hour');
          
          const resetAt = new Date(hourResult.windowEnd);
          return {
            allowed: false,
            remaining: 0,
            resetAt,
            retryAfterSeconds: Math.ceil((resetAt.getTime() - Date.now()) / 1000),
            limit: config.limitPerHour,
            windowType: 'hour'
          };
        }
      }

      // Check per-day limit
      if (config.limitPerDay) {
        const dayResult = await this.checkSlidingWindow(
          tokenId,
          platform,
          endpoint,
          'day',
          config.limitPerDay,
          86400,
          identifier
        );

        if (!dayResult.allowed) {
          span.setAttributes({
            'rate_limit.blocked_by': 'day',
            'rate_limit.count': dayResult.count,
            'rate_limit.limit': config.limitPerDay
          });

          await this.recordRateLimitHit(tokenId, platform, endpoint, 'day');
          
          const resetAt = new Date(dayResult.windowEnd);
          return {
            allowed: false,
            remaining: 0,
            resetAt,
            retryAfterSeconds: Math.ceil((resetAt.getTime() - Date.now()) / 1000),
            limit: config.limitPerDay,
            windowType: 'day'
          };
        }
      }

      // All checks passed - allow request and record it
      await this.recordRequest(tokenId, platform, endpoint, identifier);

      // Return most restrictive remaining count
      const remaining = Math.min(
        config.burstLimit ? config.burstLimit - (await this.getCurrentCount(tokenId, platform, endpoint, 'burst', config.burstWindowSeconds!)) : 999999,
        config.limitPerMinute ? config.limitPerMinute - (await this.getCurrentCount(tokenId, platform, endpoint, 'minute', 60)) : 999999,
        config.limitPerHour ? config.limitPerHour - (await this.getCurrentCount(tokenId, platform, endpoint, 'hour', 3600)) : 999999,
        config.limitPerDay ? config.limitPerDay - (await this.getCurrentCount(tokenId, platform, endpoint, 'day', 86400)) : 999999
      );

      span.setAttributes({
        'rate_limit.allowed': true,
        'rate_limit.remaining': remaining
      });

      return {
        allowed: true,
        remaining: Math.max(remaining - 1, 0), // Account for current request
        resetAt: new Date(Date.now() + 60000), // Next minute
        limit: config.limitPerMinute || config.limitPerHour || config.limitPerDay || config.burstLimit || 999999,
        windowType: 'minute'
      };
    });
  }

  // =============================================
  // Sliding Window Implementation
  // =============================================

  /**
   * Check sliding window rate limit using Redis sorted sets
   * More accurate than fixed windows, handles traffic spikes better
   */
  private async checkSlidingWindow(
    tokenId: string,
    platform: string,
    endpoint: string,
    windowType: string,
    limit: number,
    windowSeconds: number,
    identifier?: string
  ): Promise<SlidingWindowResult> {
    const key = this.getRedisKey(tokenId, platform, endpoint, windowType, identifier);
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    const windowEnd = now + (windowSeconds * 1000);

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    
    // Remove expired entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Count current entries in window
    pipeline.zcard(key);
    
    // Set expiration for cleanup
    pipeline.pexpire(key, windowSeconds * 1000 * 2); // 2x window for safety
    
    const results = await pipeline.exec();
    
    if (!results || results.some(([err]) => err)) {
      logger.error({
        tokenId,
        platform,
        endpoint,
        windowType,
        error: results?.find(([err]) => err)?.[0]
      }, 'Redis pipeline error in sliding window check');
      
      // Fail open on Redis errors
      return {
        count: 0,
        allowed: true,
        windowStart,
        windowEnd
      };
    }

    const count = results[1][1] as number;
    const allowed = count < limit;

    // Record metrics
    metrics.histogram('rate_limit_window_count', {
      platform,
      endpoint,
      window_type: windowType
    }).observe(count);

    if (!allowed) {
      metrics.counter('rate_limit_exceeded_total', {
        platform,
        endpoint,
        window_type: windowType
      }).inc();
    }

    return {
      count,
      allowed,
      windowStart,
      windowEnd
    };
  }

  /**
   * Record a successful request in all relevant windows
   */
  private async recordRequest(
    tokenId: string,
    platform: string,
    endpoint: string,
    identifier?: string
  ): Promise<void> {
    const now = Date.now();
    const requestId = `${now}.${Math.random()}`;

    const config = this.getConfig(platform, endpoint);
    if (!config) return;

    const pipeline = this.redis.pipeline();

    // Record in all configured windows
    if (config.burstLimit) {
      const key = this.getRedisKey(tokenId, platform, endpoint, 'burst', identifier);
      pipeline.zadd(key, now, requestId);
      pipeline.pexpire(key, config.burstWindowSeconds! * 1000 * 2);
    }

    if (config.limitPerMinute) {
      const key = this.getRedisKey(tokenId, platform, endpoint, 'minute', identifier);
      pipeline.zadd(key, now, requestId);
      pipeline.pexpire(key, 120000); // 2 minutes
    }

    if (config.limitPerHour) {
      const key = this.getRedisKey(tokenId, platform, endpoint, 'hour', identifier);
      pipeline.zadd(key, now, requestId);
      pipeline.pexpire(key, 7200000); // 2 hours
    }

    if (config.limitPerDay) {
      const key = this.getRedisKey(tokenId, platform, endpoint, 'day', identifier);
      pipeline.zadd(key, now, requestId);
      pipeline.pexpire(key, 172800000); // 2 days
    }

    try {
      await pipeline.exec();
      
      metrics.counter('rate_limit_requests_total', {
        platform,
        endpoint
      }).inc();

    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform,
        endpoint
      }, 'Failed to record request in rate limit windows');
    }
  }

  /**
   * Get current count for a specific window
   */
  private async getCurrentCount(
    tokenId: string,
    platform: string,
    endpoint: string,
    windowType: string,
    windowSeconds: number,
    identifier?: string
  ): Promise<number> {
    const key = this.getRedisKey(tokenId, platform, endpoint, windowType, identifier);
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);

    try {
      // Clean expired entries and count current
      await this.redis.zremrangebyscore(key, 0, windowStart);
      return await this.redis.zcard(key);
    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform,
        endpoint,
        windowType
      }, 'Failed to get current count');
      return 0;
    }
  }

  // =============================================
  // Database Integration
  // =============================================

  private async recordRateLimitHit(
    tokenId: string,
    platform: string,
    endpoint: string,
    windowType: string
  ): Promise<void> {
    try {
      await pool.query(`
        SELECT record_rate_limit_hit($1, $2, $3, NULL, 429, NULL, NULL)
      `, [tokenId, platform, endpoint]);

      logger.warn({
        tokenId,
        platform,
        endpoint,
        windowType
      }, 'Rate limit exceeded');

    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform,
        endpoint
      }, 'Failed to record rate limit hit in database');
    }
  }

  // =============================================
  // Utility Methods
  // =============================================

  private getRedisKey(
    tokenId: string,
    platform: string,
    endpoint: string,
    windowType: string,
    identifier?: string
  ): string {
    const base = `rl:${platform}:${tokenId}:${endpoint}:${windowType}`;
    return identifier ? `${base}:${identifier}` : base;
  }

  /**
   * Reset rate limits for a token (admin function)
   */
  async resetRateLimits(
    tokenId: string,
    platform?: string,
    endpoint?: string
  ): Promise<void> {
    const pattern = platform && endpoint
      ? `rl:${platform}:${tokenId}:${endpoint}:*`
      : platform
      ? `rl:${platform}:${tokenId}:*`
      : `rl:*:${tokenId}:*`;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        
        logger.info({
          tokenId,
          platform,
          endpoint,
          keysDeleted: keys.length
        }, 'Rate limits reset');
      }
    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform,
        endpoint
      }, 'Failed to reset rate limits');
      throw error;
    }
  }

  /**
   * Get rate limit status for debugging
   */
  async getRateLimitStatus(
    tokenId: string,
    platform: string,
    endpoint: string
  ): Promise<{
    burst?: { count: number; limit: number; windowSeconds: number };
    minute?: { count: number; limit: number };
    hour?: { count: number; limit: number };
    day?: { count: number; limit: number };
  }> {
    const config = this.getConfig(platform, endpoint);
    if (!config) return {};

    const status: any = {};

    if (config.burstLimit) {
      status.burst = {
        count: await this.getCurrentCount(tokenId, platform, endpoint, 'burst', config.burstWindowSeconds!),
        limit: config.burstLimit,
        windowSeconds: config.burstWindowSeconds!
      };
    }

    if (config.limitPerMinute) {
      status.minute = {
        count: await this.getCurrentCount(tokenId, platform, endpoint, 'minute', 60),
        limit: config.limitPerMinute
      };
    }

    if (config.limitPerHour) {
      status.hour = {
        count: await this.getCurrentCount(tokenId, platform, endpoint, 'hour', 3600),
        limit: config.limitPerHour
      };
    }

    if (config.limitPerDay) {
      status.day = {
        count: await this.getCurrentCount(tokenId, platform, endpoint, 'day', 86400),
        limit: config.limitPerDay
      };
    }

    return status;
  }

  /**
   * Health check for rate limiter
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Test Redis connectivity
      await this.redis.ping();
      
      // Test a simple rate limit check
      const testResult = await this.checkRateLimit(
        'health-check',
        'test',
        'health',
        'health-check'
      );

      return {
        healthy: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Default rate limiter instance
export const rateLimiter = new RateLimiter();