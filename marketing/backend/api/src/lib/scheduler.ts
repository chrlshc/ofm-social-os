import { pool } from './database';
import { rateLimiter, RateLimitResult } from './rateLimit';
import { loggers } from './logger';
import { withSpan } from './otel';
import { promises as metrics } from './metrics';
import { redis } from './redis';

const logger = loggers.scheduler;

export interface SchedulingOptions {
  platform: string;
  priority?: number;
  weight?: number;
  jitterMinMs?: number;
  jitterMaxMs?: number;
  respectCircuitBreaker?: boolean;
}

export interface ScheduledJob {
  tokenId: string;
  platform: string;
  queueName: string;
  scheduledAt: Date;
  jitterApplied: number;
  estimatedExecutionAt: Date;
}

export interface CircuitBreakerStatus {
  state: 'closed' | 'open' | 'half_open';
  failures: number;
  lastFailure?: Date;
  cooldownUntil?: Date;
}

export interface FairShareState {
  platform: string;
  activeTokens: number;
  totalJobs: number;
  currentRoundIndex: number;
  lastScheduledAt: Date;
}

/**
 * Fair-share scheduler for multi-token publishing
 * Implements round-robin with priority weights and jitter
 */
export class FairShareScheduler {
  private roundRobinState: Map<string, number> = new Map(); // platform -> current index
  private lastSchedulingTime: Map<string, number> = new Map(); // platform -> timestamp

  // =============================================
  // Main Scheduling Methods
  // =============================================

  /**
   * Get the next token to schedule for a platform
   * Uses weighted round-robin with priority consideration
   */
  async getNextToken(
    platform: string,
    options: Partial<SchedulingOptions> = {}
  ): Promise<string | null> {
    return withSpan('scheduler.get_next_token', {
      'scheduler.platform': platform
    }, async (span) => {
      try {
        // Get next token using database function (handles round-robin)
        const result = await pool.query(
          'SELECT get_next_scheduled_token($1) as token_id',
          [platform]
        );

        const tokenId = result.rows[0]?.token_id;
        
        if (!tokenId) {
          span.setAttributes({
            'scheduler.tokens_available': 0
          });
          return null;
        }

        // Apply jitter if specified
        if (options.jitterMinMs || options.jitterMaxMs) {
          await this.applyJitter(tokenId, platform, options);
        }

        span.setAttributes({
          'scheduler.selected_token': tokenId,
          'scheduler.has_jitter': !!(options.jitterMinMs || options.jitterMaxMs)
        });

        // Record metrics
        metrics.counter('scheduler_tokens_selected_total', {
          platform
        }).inc();

        logger.debug({
          tokenId,
          platform,
          options
        }, 'Token selected for scheduling');

        return tokenId;

      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          platform,
          options
        }, 'Failed to get next token');
        
        metrics.counter('scheduler_errors_total', {
          platform,
          error_type: 'get_next_token'
        }).inc();

        throw error;
      }
    });
  }

  /**
   * Schedule a job for a specific token with rate limit checking
   */
  async scheduleJob(
    tokenId: string,
    platform: string,
    endpoint: string = 'publish',
    options: Partial<SchedulingOptions> = {}
  ): Promise<ScheduledJob | null> {
    return withSpan('scheduler.schedule_job', {
      'scheduler.token_id': tokenId,
      'scheduler.platform': platform,
      'scheduler.endpoint': endpoint
    }, async (span) => {
      try {
        // Check circuit breaker first
        if (options.respectCircuitBreaker !== false) {
          const circuitBreaker = await this.getCircuitBreakerStatus(tokenId, platform);
          if (circuitBreaker.state === 'open') {
            span.setAttributes({
              'scheduler.circuit_breaker_blocked': true
            });

            logger.warn({
              tokenId,
              platform,
              circuitBreaker
            }, 'Job blocked by circuit breaker');

            return null;
          }
        }

        // Check rate limits
        const rateLimitResult = await rateLimiter.checkRateLimit(
          tokenId,
          platform,
          endpoint
        );

        if (!rateLimitResult.allowed) {
          span.setAttributes({
            'scheduler.rate_limit_blocked': true,
            'scheduler.retry_after_seconds': rateLimitResult.retryAfterSeconds
          });

          // Update token scheduling with cooldown
          await this.setTokenCooldown(
            tokenId, 
            platform, 
            rateLimitResult.retryAfterSeconds || 60
          );

          logger.warn({
            tokenId,
            platform,
            endpoint,
            rateLimitResult
          }, 'Job blocked by rate limit');

          return null;
        }

        // Generate queue name
        const queueName = `publish:${platform}:${tokenId}`;

        // Apply jitter for human-like posting
        const jitter = this.calculateJitter(
          options.jitterMinMs || 30 * 60 * 1000, // 30 minutes default
          options.jitterMaxMs || 90 * 60 * 1000  // 90 minutes default
        );

        const scheduledAt = new Date();
        const estimatedExecutionAt = new Date(Date.now() + jitter);

        // Update scheduling statistics
        await this.updateSchedulingStats(tokenId, platform, jitter);

        const scheduledJob: ScheduledJob = {
          tokenId,
          platform,
          queueName,
          scheduledAt,
          jitterApplied: jitter,
          estimatedExecutionAt
        };

        span.setAttributes({
          'scheduler.queue_name': queueName,
          'scheduler.jitter_ms': jitter,
          'scheduler.estimated_execution_at': estimatedExecutionAt.toISOString()
        });

        // Record metrics
        metrics.counter('scheduler_jobs_scheduled_total', {
          platform,
          endpoint
        }).inc();

        metrics.histogram('scheduler_jitter_ms', {
          platform
        }).observe(jitter);

        logger.info({
          tokenId,
          platform,
          queueName,
          jitter,
          estimatedExecutionAt
        }, 'Job scheduled successfully');

        return scheduledJob;

      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          tokenId,
          platform,
          endpoint
        }, 'Failed to schedule job');

        metrics.counter('scheduler_errors_total', {
          platform,
          error_type: 'schedule_job'
        }).inc();

        throw error;
      }
    });
  }

  // =============================================
  // Circuit Breaker Management
  // =============================================

  async getCircuitBreakerStatus(
    tokenId: string,
    platform: string
  ): Promise<CircuitBreakerStatus> {
    try {
      const result = await pool.query(`
        SELECT circuit_breaker_state, circuit_breaker_failures,
               circuit_breaker_last_failure, cooldown_until
        FROM token_scheduling
        WHERE token_id = $1 AND platform = $2
      `, [tokenId, platform]);

      if (result.rows.length === 0) {
        return { state: 'closed', failures: 0 };
      }

      const row = result.rows[0];
      return {
        state: row.circuit_breaker_state || 'closed',
        failures: row.circuit_breaker_failures || 0,
        lastFailure: row.circuit_breaker_last_failure,
        cooldownUntil: row.cooldown_until
      };

    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform
      }, 'Failed to get circuit breaker status');
      
      // Fail safe - return closed state
      return { state: 'closed', failures: 0 };
    }
  }

  async recordJobFailure(
    tokenId: string,
    platform: string,
    error: string
  ): Promise<void> {
    return withSpan('scheduler.record_failure', {
      'scheduler.token_id': tokenId,
      'scheduler.platform': platform
    }, async () => {
      try {
        await pool.query(`
          UPDATE token_scheduling
          SET 
            total_jobs_failed = total_jobs_failed + 1,
            circuit_breaker_failures = circuit_breaker_failures + 1,
            circuit_breaker_last_failure = now(),
            circuit_breaker_state = CASE 
              WHEN circuit_breaker_failures + 1 >= 5 THEN 'open'
              ELSE circuit_breaker_state
            END,
            cooldown_until = CASE
              WHEN circuit_breaker_failures + 1 >= 5 THEN now() + INTERVAL '5 minutes'
              ELSE cooldown_until
            END,
            updated_at = now()
          WHERE token_id = $1 AND platform = $2
        `, [tokenId, platform]);

        metrics.counter('scheduler_job_failures_total', {
          platform
        }).inc();

        logger.warn({
          tokenId,
          platform,
          error
        }, 'Job failure recorded');

      } catch (dbError) {
        logger.error({
          err: dbError,
          tokenId,
          platform
        }, 'Failed to record job failure');
      }
    });
  }

  async recordJobSuccess(
    tokenId: string,
    platform: string,
    durationMs: number
  ): Promise<void> {
    return withSpan('scheduler.record_success', {
      'scheduler.token_id': tokenId,
      'scheduler.platform': platform,
      'scheduler.duration_ms': durationMs
    }, async () => {
      try {
        await pool.query(`
          UPDATE token_scheduling
          SET 
            total_jobs_completed = total_jobs_completed + 1,
            avg_job_duration_ms = (avg_job_duration_ms + $3) / 2,
            circuit_breaker_failures = GREATEST(circuit_breaker_failures - 1, 0),
            circuit_breaker_state = CASE 
              WHEN circuit_breaker_failures <= 1 THEN 'closed'
              WHEN circuit_breaker_state = 'open' THEN 'half_open'
              ELSE circuit_breaker_state
            END,
            cooldown_until = CASE
              WHEN circuit_breaker_failures <= 1 THEN NULL
              ELSE cooldown_until
            END,
            updated_at = now()
          WHERE token_id = $1 AND platform = $2
        `, [tokenId, platform, durationMs]);

        metrics.counter('scheduler_job_successes_total', {
          platform
        }).inc();

        metrics.histogram('scheduler_job_duration_ms', {
          platform
        }).observe(durationMs);

        logger.debug({
          tokenId,
          platform,
          durationMs
        }, 'Job success recorded');

      } catch (error) {
        logger.error({
          err: error,
          tokenId,
          platform
        }, 'Failed to record job success');
      }
    });
  }

  // =============================================
  // Fair Share Implementation
  // =============================================

  async getFairShareState(platform: string): Promise<FairShareState> {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
          SUM(total_jobs_scheduled) as total_jobs,
          MIN(last_scheduled_at) as earliest_scheduled
        FROM token_scheduling
        WHERE platform = $1
      `, [platform]);

      const row = result.rows[0];
      const currentIndex = this.roundRobinState.get(platform) || 0;
      const lastScheduled = this.lastSchedulingTime.get(platform) || 0;

      return {
        platform,
        activeTokens: parseInt(row.active_tokens) || 0,
        totalJobs: parseInt(row.total_jobs) || 0,
        currentRoundIndex: currentIndex,
        lastScheduledAt: new Date(lastScheduled)
      };

    } catch (error) {
      logger.error({
        err: error,
        platform
      }, 'Failed to get fair share state');

      return {
        platform,
        activeTokens: 0,
        totalJobs: 0,
        currentRoundIndex: 0,
        lastScheduledAt: new Date()
      };
    }
  }

  /**
   * Ensure fair distribution by checking if any tokens are starved
   */
  async checkFairness(platform: string): Promise<{
    isHealthy: boolean;
    starvedTokens: number;
    maxStarvationMinutes: number;
  }> {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (
            WHERE is_active = true 
            AND (last_scheduled_at IS NULL OR last_scheduled_at < now() - INTERVAL '2 hours')
          ) as starved_tokens,
          EXTRACT(EPOCH FROM (now() - MIN(last_scheduled_at)))/60 as max_starvation_minutes
        FROM token_scheduling
        WHERE platform = $1 AND is_active = true
      `, [platform]);

      const row = result.rows[0];
      const starvedTokens = parseInt(row.starved_tokens) || 0;
      const maxStarvationMinutes = parseFloat(row.max_starvation_minutes) || 0;

      const isHealthy = starvedTokens === 0 && maxStarvationMinutes < 120; // 2 hours max

      if (!isHealthy) {
        logger.warn({
          platform,
          starvedTokens,
          maxStarvationMinutes
        }, 'Fairness issue detected');
      }

      return {
        isHealthy,
        starvedTokens,
        maxStarvationMinutes
      };

    } catch (error) {
      logger.error({
        err: error,
        platform
      }, 'Failed to check fairness');

      return {
        isHealthy: false,
        starvedTokens: 0,
        maxStarvationMinutes: 0
      };
    }
  }

  // =============================================
  // Utility Methods
  // =============================================

  private async applyJitter(
    tokenId: string,
    platform: string,
    options: Partial<SchedulingOptions>
  ): Promise<void> {
    const jitter = this.calculateJitter(
      options.jitterMinMs || 30 * 60 * 1000,
      options.jitterMaxMs || 90 * 60 * 1000
    );

    try {
      await pool.query(`
        UPDATE token_scheduling
        SET jitter_offset_ms = $3, updated_at = now()
        WHERE token_id = $1 AND platform = $2
      `, [tokenId, platform, jitter]);

    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform,
        jitter
      }, 'Failed to apply jitter');
    }
  }

  private calculateJitter(minMs: number, maxMs: number): number {
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  }

  private async setTokenCooldown(
    tokenId: string,
    platform: string,
    cooldownSeconds: number
  ): Promise<void> {
    try {
      await pool.query(`
        UPDATE token_scheduling
        SET 
          cooldown_until = now() + INTERVAL '${cooldownSeconds} seconds',
          updated_at = now()
        WHERE token_id = $1 AND platform = $2
      `, [tokenId, platform]);

    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform,
        cooldownSeconds
      }, 'Failed to set token cooldown');
    }
  }

  private async updateSchedulingStats(
    tokenId: string,
    platform: string,
    jitterMs: number
  ): Promise<void> {
    try {
      // Update token scheduling record
      await pool.query(`
        INSERT INTO token_scheduling (token_id, platform, last_scheduled_at, jitter_offset_ms)
        VALUES ($1, $2, now(), $3)
        ON CONFLICT (token_id, platform)
        DO UPDATE SET 
          last_scheduled_at = now(),
          total_jobs_scheduled = token_scheduling.total_jobs_scheduled + 1,
          jitter_offset_ms = $3,
          updated_at = now()
      `, [tokenId, platform, jitterMs]);

      // Update round-robin state
      this.lastSchedulingTime.set(platform, Date.now());

    } catch (error) {
      logger.error({
        err: error,
        tokenId,
        platform
      }, 'Failed to update scheduling stats');
    }
  }

  // =============================================
  // Monitoring and Health
  // =============================================

  async getSchedulerMetrics(platform?: string): Promise<{
    activeTokens: number;
    totalJobsScheduled: number;
    avgJobDuration: number;
    circuitBreakerOpen: number;
    rateLimitHits24h: number;
  }> {
    try {
      const whereClause = platform ? 'WHERE platform = $1' : '';
      const params = platform ? [platform] : [];

      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
          SUM(total_jobs_scheduled) as total_jobs_scheduled,
          AVG(avg_job_duration_ms) as avg_job_duration,
          COUNT(*) FILTER (WHERE circuit_breaker_state = 'open') as circuit_breaker_open
        FROM token_scheduling
        ${whereClause}
      `, params);

      const rateLimitParams = platform ? [platform] : [];
      const rateLimitWhere = platform ? 'WHERE platform = $1 AND' : 'WHERE';
      
      const rateLimitResult = await pool.query(`
        SELECT COUNT(*) as rate_limit_hits
        FROM rate_limit_events
        ${rateLimitWhere} hit_at > now() - INTERVAL '24 hours'
      `, rateLimitParams);

      const row = result.rows[0];
      const rateLimitRow = rateLimitResult.rows[0];

      return {
        activeTokens: parseInt(row.active_tokens) || 0,
        totalJobsScheduled: parseInt(row.total_jobs_scheduled) || 0,
        avgJobDuration: parseFloat(row.avg_job_duration) || 0,
        circuitBreakerOpen: parseInt(row.circuit_breaker_open) || 0,
        rateLimitHits24h: parseInt(rateLimitRow.rate_limit_hits) || 0
      };

    } catch (error) {
      logger.error({
        err: error,
        platform
      }, 'Failed to get scheduler metrics');

      return {
        activeTokens: 0,
        totalJobsScheduled: 0,
        avgJobDuration: 0,
        circuitBreakerOpen: 0,
        rateLimitHits24h: 0
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check database connectivity
      await pool.query('SELECT 1');

      // Check for stuck tokens (not scheduled in 6+ hours)
      const stuckResult = await pool.query(`
        SELECT COUNT(*) as stuck_count
        FROM token_scheduling
        WHERE is_active = true 
        AND last_scheduled_at < now() - INTERVAL '6 hours'
      `);

      const stuckCount = parseInt(stuckResult.rows[0].stuck_count);
      if (stuckCount > 0) {
        issues.push(`${stuckCount} tokens not scheduled in 6+ hours`);
      }

      // Check for excessive circuit breaker failures
      const circuitBreakerResult = await pool.query(`
        SELECT COUNT(*) as open_breakers
        FROM token_scheduling
        WHERE circuit_breaker_state = 'open'
      `);

      const openBreakers = parseInt(circuitBreakerResult.rows[0].open_breakers);
      if (openBreakers > 5) {
        issues.push(`${openBreakers} tokens have open circuit breakers`);
      }

      return {
        healthy: issues.length === 0,
        issues
      };

    } catch (error) {
      issues.push(`Database connectivity error: ${error instanceof Error ? error.message : error}`);
      
      return {
        healthy: false,
        issues
      };
    }
  }
}

// Default scheduler instance
export const fairShareScheduler = new FairShareScheduler();