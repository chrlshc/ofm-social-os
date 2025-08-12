import { Worker, NativeConnection } from '@temporalio/worker';
import { Connection } from '@temporalio/client';
import * as activities from '../activities';
import { env } from '../../lib/env';
import { loggers } from '../../lib/logger';
import { withSpan } from '../../lib/otel';
import { promises as metrics } from '../../lib/metrics';
import { rateLimiter } from '../../lib/rateLimit';
import { fairShareScheduler } from '../../lib/scheduler';
import { pool } from '../../lib/database';

const logger = loggers.temporal.child({ component: 'multi-account-worker' });

export interface MultiAccountWorkerConfig {
  platform: string;
  tokenId: string;
  maxConcurrentActivities?: number;
  maxTaskQueueActivitiesPerSecond?: number;
  enableRateLimiting?: boolean;
  enableCircuitBreaker?: boolean;
}

/**
 * Multi-account worker manager
 * Creates dedicated workers per token with rate limiting and circuit breaking
 */
export class MultiAccountWorkerManager {
  private workers: Map<string, Worker> = new Map();
  private connections: Map<string, NativeConnection> = new Map();
  private workerConfigs: Map<string, MultiAccountWorkerConfig> = new Map();
  private isShuttingDown = false;

  // =============================================
  // Worker Management
  // =============================================

  /**
   * Start worker for a specific token
   */
  async startWorkerForToken(config: MultiAccountWorkerConfig): Promise<void> {
    return withSpan('worker_manager.start_worker', {
      'worker.platform': config.platform,
      'worker.token_id': config.tokenId
    }, async (span) => {
      const workerId = this.getWorkerId(config.platform, config.tokenId);
      
      if (this.workers.has(workerId)) {
        logger.warn({
          workerId,
          platform: config.platform,
          tokenId: config.tokenId
        }, 'Worker already exists for token');
        return;
      }

      try {
        // Create dedicated connection for this worker
        const connection = await NativeConnection.connect({
          address: env.TEMPORAL_ADDRESS || 'localhost:7233',
          // Add connection options specific to this worker if needed
        });

        this.connections.set(workerId, connection);

        // Generate task queue name
        const taskQueue = `publish:${config.platform}:${config.tokenId}`;

        // Create worker with rate limiting configuration
        const worker = await Worker.create({
          connection,
          taskQueue,
          workflowsPath: require.resolve('../workflows'),
          activities: {
            ...activities,
            // Wrap activities with rate limiting and circuit breaking
            publishPost: this.wrapActivityWithRateLimit(
              activities.publishPost,
              config,
              'publish'
            ),
            uploadMedia: this.wrapActivityWithRateLimit(
              activities.uploadMedia,
              config,
              'upload'
            ),
            commentOnPost: this.wrapActivityWithRateLimit(
              activities.commentOnPost,
              config,
              'comment'
            )
          },
          
          // Rate limiting at task queue level
          maxTaskQueueActivitiesPerSecond: config.maxTaskQueueActivitiesPerSecond || 10,
          
          // Concurrency control
          maxConcurrentActivityTaskExecutions: config.maxConcurrentActivities || 50,
          maxConcurrentWorkflowTaskExecutions: 10,
          
          // Timeouts
          maxCachedWorkflows: 100,
          
          // Error handling
          debugMode: env.NODE_ENV === 'development',
          
          // Observability
          interceptors: {
            activity: [
              // Add activity interceptor for metrics and tracing
              {
                inbound: {
                  async execute(input, next) {
                    const startTime = Date.now();
                    const activityName = input.info.activityType;
                    
                    return withSpan(`activity.${activityName}`, {
                      'activity.name': activityName,
                      'activity.task_queue': taskQueue,
                      'activity.platform': config.platform,
                      'activity.token_id': config.tokenId
                    }, async (span) => {
                      try {
                        const result = await next(input);
                        
                        const duration = Date.now() - startTime;
                        
                        // Record success metrics
                        metrics.counter('temporal_activity_total', {
                          activity: activityName,
                          platform: config.platform,
                          status: 'success'
                        }).inc();
                        
                        metrics.histogram('temporal_activity_duration_ms', {
                          activity: activityName,
                          platform: config.platform
                        }).observe(duration);

                        // Update scheduler with success
                        await fairShareScheduler.recordJobSuccess(
                          config.tokenId,
                          config.platform,
                          duration
                        );

                        span.setAttributes({
                          'activity.success': true,
                          'activity.duration_ms': duration
                        });

                        return result;

                      } catch (error) {
                        const duration = Date.now() - startTime;
                        
                        // Record error metrics
                        metrics.counter('temporal_activity_total', {
                          activity: activityName,
                          platform: config.platform,
                          status: 'error'
                        }).inc();

                        // Update scheduler with failure
                        await fairShareScheduler.recordJobFailure(
                          config.tokenId,
                          config.platform,
                          error instanceof Error ? error.message : String(error)
                        );

                        span.recordException(error as Error);
                        span.setAttributes({
                          'activity.success': false,
                          'activity.duration_ms': duration
                        });

                        throw error;
                      }
                    });
                  }
                }
              }
            ]
          }
        });

        // Start the worker
        await worker.run();

        this.workers.set(workerId, worker);
        this.workerConfigs.set(workerId, config);

        // Update queue statistics
        await this.updateQueueStatistics(taskQueue, config.tokenId, config.platform);

        logger.info({
          workerId,
          taskQueue,
          platform: config.platform,
          tokenId: config.tokenId,
          maxConcurrentActivities: config.maxConcurrentActivities,
          maxTaskQueueActivitiesPerSecond: config.maxTaskQueueActivitiesPerSecond
        }, 'Worker started successfully');

        // Record metrics
        metrics.counter('temporal_workers_started_total', {
          platform: config.platform
        }).inc();

        metrics.gauge('temporal_workers_active', {
          platform: config.platform
        }).set(this.getActiveWorkerCount(config.platform));

        span.setAttributes({
          'worker.id': workerId,
          'worker.task_queue': taskQueue,
          'worker.started': true
        });

      } catch (error) {
        span.recordException(error as Error);
        
        // Cleanup on failure
        const connection = this.connections.get(workerId);
        if (connection) {
          await connection.close();
          this.connections.delete(workerId);
        }

        logger.error({
          err: error,
          workerId,
          platform: config.platform,
          tokenId: config.tokenId
        }, 'Failed to start worker');

        metrics.counter('temporal_worker_errors_total', {
          platform: config.platform,
          error_type: 'start_failure'
        }).inc();

        throw error;
      }
    });
  }

  /**
   * Stop worker for a specific token
   */
  async stopWorkerForToken(platform: string, tokenId: string): Promise<void> {
    const workerId = this.getWorkerId(platform, tokenId);
    const worker = this.workers.get(workerId);
    const connection = this.connections.get(workerId);

    if (!worker || !connection) {
      logger.warn({
        workerId,
        platform,
        tokenId
      }, 'Worker not found for token');
      return;
    }

    try {
      logger.info({
        workerId,
        platform,
        tokenId
      }, 'Stopping worker');

      // Graceful shutdown
      worker.shutdown();
      await connection.close();

      this.workers.delete(workerId);
      this.connections.delete(workerId);
      this.workerConfigs.delete(workerId);

      // Update metrics
      metrics.counter('temporal_workers_stopped_total', {
        platform
      }).inc();

      metrics.gauge('temporal_workers_active', {
        platform
      }).set(this.getActiveWorkerCount(platform));

      logger.info({
        workerId,
        platform,
        tokenId
      }, 'Worker stopped successfully');

    } catch (error) {
      logger.error({
        err: error,
        workerId,
        platform,
        tokenId
      }, 'Failed to stop worker');

      metrics.counter('temporal_worker_errors_total', {
        platform,
        error_type: 'stop_failure'
      }).inc();

      throw error;
    }
  }

  /**
   * Scale workers based on active tokens
   */
  async scaleWorkers(platform: string): Promise<void> {
    return withSpan('worker_manager.scale_workers', {
      'worker.platform': platform
    }, async (span) => {
      try {
        // Get active tokens for platform
        const result = await pool.query(`
          SELECT token_id, is_active, cooldown_until, circuit_breaker_state
          FROM token_scheduling
          WHERE platform = $1
        `, [platform]);

        const activeTokens = result.rows.filter(row => 
          row.is_active && 
          (!row.cooldown_until || new Date(row.cooldown_until) < new Date()) &&
          row.circuit_breaker_state !== 'open'
        );

        const currentWorkers = Array.from(this.workers.keys())
          .filter(workerId => workerId.startsWith(`${platform}:`));

        const requiredWorkers = activeTokens.map(row => row.token_id);
        const currentTokens = currentWorkers.map(workerId => 
          workerId.split(':')[1] // Extract token ID from worker ID
        );

        // Start workers for new tokens
        const tokensToStart = requiredWorkers.filter(tokenId => 
          !currentTokens.includes(tokenId)
        );

        // Stop workers for inactive tokens
        const tokensToStop = currentTokens.filter(tokenId => 
          !requiredWorkers.includes(tokenId)
        );

        // Start new workers
        for (const tokenId of tokensToStart) {
          try {
            await this.startWorkerForToken({
              platform,
              tokenId,
              maxConcurrentActivities: 50,
              maxTaskQueueActivitiesPerSecond: 10,
              enableRateLimiting: true,
              enableCircuitBreaker: true
            });
          } catch (error) {
            logger.error({
              err: error,
              platform,
              tokenId
            }, 'Failed to start worker during scaling');
          }
        }

        // Stop inactive workers
        for (const tokenId of tokensToStop) {
          try {
            await this.stopWorkerForToken(platform, tokenId);
          } catch (error) {
            logger.error({
              err: error,
              platform,
              tokenId
            }, 'Failed to stop worker during scaling');
          }
        }

        span.setAttributes({
          'worker.active_tokens': activeTokens.length,
          'worker.workers_started': tokensToStart.length,
          'worker.workers_stopped': tokensToStop.length
        });

        logger.info({
          platform,
          activeTokens: activeTokens.length,
          workersStarted: tokensToStart.length,
          workersStopped: tokensToStop.length
        }, 'Worker scaling completed');

      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          platform
        }, 'Failed to scale workers');

        metrics.counter('temporal_worker_errors_total', {
          platform,
          error_type: 'scaling_failure'
        }).inc();
      }
    });
  }

  // =============================================
  // Activity Wrapping with Rate Limiting
  // =============================================

  private wrapActivityWithRateLimit(
    originalActivity: any,
    config: MultiAccountWorkerConfig,
    endpoint: string
  ) {
    return async (input: any) => {
      // Skip rate limiting if disabled
      if (!config.enableRateLimiting) {
        return await originalActivity(input);
      }

      // Check rate limits before execution
      const rateLimitResult = await rateLimiter.checkRateLimit(
        config.tokenId,
        config.platform,
        endpoint
      );

      if (!rateLimitResult.allowed) {
        const error = new Error(
          `Rate limit exceeded for ${config.platform}:${endpoint}. ` +
          `Retry after ${rateLimitResult.retryAfterSeconds} seconds.`
        );
        
        logger.warn({
          tokenId: config.tokenId,
          platform: config.platform,
          endpoint,
          rateLimitResult
        }, 'Activity blocked by rate limit');

        // Schedule retry based on rate limit response
        throw error;
      }

      // Check circuit breaker if enabled
      if (config.enableCircuitBreaker) {
        const circuitBreaker = await fairShareScheduler.getCircuitBreakerStatus(
          config.tokenId,
          config.platform
        );

        if (circuitBreaker.state === 'open') {
          const error = new Error(
            `Circuit breaker open for ${config.platform}:${config.tokenId}. ` +
            `Cooldown until ${circuitBreaker.cooldownUntil}.`
          );

          logger.warn({
            tokenId: config.tokenId,
            platform: config.platform,
            circuitBreaker
          }, 'Activity blocked by circuit breaker');

          throw error;
        }
      }

      // Execute original activity
      return await originalActivity(input);
    };
  }

  // =============================================
  // Utility Methods
  // =============================================

  private getWorkerId(platform: string, tokenId: string): string {
    return `${platform}:${tokenId}`;
  }

  private getActiveWorkerCount(platform: string): number {
    return Array.from(this.workers.keys())
      .filter(workerId => workerId.startsWith(`${platform}:`))
      .length;
  }

  private async updateQueueStatistics(
    queueName: string,
    tokenId: string,
    platform: string
  ): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO queue_statistics (queue_name, token_id, platform, last_activity_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (token_id, platform)
        DO UPDATE SET 
          queue_name = $1,
          last_activity_at = now(),
          updated_at = now()
      `, [queueName, tokenId, platform]);

    } catch (error) {
      logger.error({
        err: error,
        queueName,
        tokenId,
        platform
      }, 'Failed to update queue statistics');
    }
  }

  // =============================================
  // Lifecycle Management
  // =============================================

  /**
   * Start worker manager with auto-scaling
   */
  async start(): Promise<void> {
    logger.info('Starting multi-account worker manager');

    // Load rate limiting configurations
    await rateLimiter.loadPlatformConfigs();

    // Start auto-scaling for each platform
    const platforms = ['tiktok', 'instagram', 'twitter', 'reddit'];
    
    for (const platform of platforms) {
      // Initial scaling
      await this.scaleWorkers(platform);

      // Set up periodic scaling (every 2 minutes)
      setInterval(async () => {
        if (!this.isShuttingDown) {
          try {
            await this.scaleWorkers(platform);
          } catch (error) {
            logger.error({
              err: error,
              platform
            }, 'Auto-scaling failed');
          }
        }
      }, 2 * 60 * 1000);
    }

    logger.info({
      activeWorkers: this.workers.size,
      platforms
    }, 'Multi-account worker manager started');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    logger.info({
      workersToStop: this.workers.size
    }, 'Shutting down multi-account worker manager');

    // Stop all workers
    const shutdownPromises = Array.from(this.workerConfigs.entries()).map(
      ([workerId, config]) => {
        const [platform, tokenId] = workerId.split(':');
        return this.stopWorkerForToken(platform, tokenId);
      }
    );

    await Promise.allSettled(shutdownPromises);

    logger.info('Multi-account worker manager shut down');
  }

  /**
   * Get worker status
   */
  getWorkerStatus(): {
    totalWorkers: number;
    workersByPlatform: Record<string, number>;
    activeConnections: number;
  } {
    const workersByPlatform: Record<string, number> = {};

    for (const workerId of this.workers.keys()) {
      const platform = workerId.split(':')[0];
      workersByPlatform[platform] = (workersByPlatform[platform] || 0) + 1;
    }

    return {
      totalWorkers: this.workers.size,
      workersByPlatform,
      activeConnections: this.connections.size
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    metrics: {
      totalWorkers: number;
      activeConnections: number;
      platformWorkers: Record<string, number>;
    };
  }> {
    const issues: string[] = [];

    // Check worker/connection consistency
    if (this.workers.size !== this.connections.size) {
      issues.push(`Worker/connection mismatch: ${this.workers.size} workers, ${this.connections.size} connections`);
    }

    // Check for stale workers
    const staleWorkers = Array.from(this.workerConfigs.keys()).filter(workerId => {
      return !this.workers.has(workerId) || !this.connections.has(workerId);
    });

    if (staleWorkers.length > 0) {
      issues.push(`${staleWorkers.length} stale worker configurations`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics: {
        totalWorkers: this.workers.size,
        activeConnections: this.connections.size,
        platformWorkers: this.getWorkerStatus().workersByPlatform
      }
    };
  }
}

// Default worker manager instance
export const multiAccountWorkerManager = new MultiAccountWorkerManager();