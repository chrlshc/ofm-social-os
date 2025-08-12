import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validateRequest';
import { requireAuth, requireRole } from '../../middleware/auth';
import { rateLimiter } from '../../lib/rateLimit';
import { fairShareScheduler } from '../../lib/scheduler';
import { multiAccountWorkerManager } from '../../temporal/workers/multiAccount';
import { pool } from '../../lib/database';
import { loggers } from '../../lib/logger';
import { withSpan } from '../../lib/otel';

const router = Router();
const logger = loggers.admin;

// =============================================
// Validation Schemas
// =============================================

const resetRateLimitsSchema = z.object({
  body: z.object({
    tokenId: z.string().uuid(),
    platform: z.string().optional(),
    endpoint: z.string().optional()
  })
});

const updatePlatformLimitsSchema = z.object({
  body: z.object({
    platform: z.string(),
    endpoint: z.string(),
    limitPerMinute: z.number().positive().optional(),
    limitPerHour: z.number().positive().optional(),
    limitPerDay: z.number().positive().optional(),
    burstLimit: z.number().positive().optional()
  })
});

const manageTokenSchema = z.object({
  body: z.object({
    tokenId: z.string().uuid(),
    platform: z.string(),
    isActive: z.boolean().optional(),
    priority: z.number().min(1).max(10).optional(),
    weight: z.number().positive().optional()
  })
});

const scaleWorkersSchema = z.object({
  body: z.object({
    platform: z.string().optional(),
    action: z.enum(['scale_up', 'scale_down', 'restart'])
  })
});

// =============================================
// Rate Limiting Management
// =============================================

/**
 * Get rate limit status for all tokens or specific token
 */
router.get('/rate-limits', 
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    return withSpan('admin.get_rate_limits', {}, async () => {
      try {
        const { platform, tokenId, timeframe = '1h' } = req.query;

        let whereClause = '';
        const params: any[] = [];

        if (platform) {
          whereClause += 'WHERE platform = $1';
          params.push(platform);
        }

        if (tokenId) {
          whereClause += whereClause ? ' AND token_id = $2' : 'WHERE token_id = $1';
          params.push(tokenId);
        }

        // Add time filter
        const timeFilter = timeframe === '24h' ? '24 hours' : timeframe === '1d' ? '1 day' : '1 hour';
        const timeClause = whereClause 
          ? ` AND hit_at > now() - INTERVAL '${timeFilter}'`
          : ` WHERE hit_at > now() - INTERVAL '${timeFilter}'`;

        const result = await pool.query(`
          SELECT 
            token_id,
            platform,
            endpoint,
            COUNT(*) as total_hits,
            COUNT(*) FILTER (WHERE response_code = 429) as rate_limit_hits,
            AVG(retry_after_seconds) as avg_retry_after,
            MAX(hit_at) as last_hit_at
          FROM rate_limit_events
          ${whereClause}${timeClause}
          GROUP BY token_id, platform, endpoint
          ORDER BY total_hits DESC
          LIMIT 100
        `, params);

        res.json({
          rateLimits: result.rows,
          timeframe,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error({ err: error }, 'Failed to get rate limits');
        res.status(500).json({ error: 'Failed to get rate limits' });
      }
    });
  }
);

/**
 * Reset rate limits for a token
 */
router.post('/rate-limits/reset',
  requireAuth,
  requireRole('admin'),
  validateRequest(resetRateLimitsSchema),
  async (req, res) => {
    return withSpan('admin.reset_rate_limits', {
      'admin.token_id': req.body.tokenId,
      'admin.platform': req.body.platform
    }, async () => {
      try {
        const { tokenId, platform, endpoint } = req.body;

        await rateLimiter.resetRateLimits(tokenId, platform, endpoint);

        logger.info({
          tokenId,
          platform,
          endpoint,
          adminUserId: req.user!.id
        }, 'Rate limits reset by admin');

        res.json({
          message: 'Rate limits reset successfully',
          tokenId,
          platform,
          endpoint
        });

      } catch (error) {
        logger.error({ err: error }, 'Failed to reset rate limits');
        res.status(500).json({ error: 'Failed to reset rate limits' });
      }
    });
  }
);

/**
 * Get detailed rate limit status for specific token
 */
router.get('/rate-limits/:tokenId/:platform/:endpoint',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { tokenId, platform, endpoint } = req.params;

      const status = await rateLimiter.getRateLimitStatus(tokenId, platform, endpoint);

      res.json({
        tokenId,
        platform,
        endpoint,
        status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get rate limit status');
      res.status(500).json({ error: 'Failed to get rate limit status' });
    }
  }
);

// =============================================
// Platform Configuration Management
// =============================================

/**
 * Get platform rate limit configurations
 */
router.get('/platform-limits',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT platform, endpoint, limit_per_minute, limit_per_hour, 
               limit_per_day, burst_limit, burst_window_seconds,
               jitter_min_ms, jitter_max_ms, is_active, metadata
        FROM platform_rate_limits
        ORDER BY platform, endpoint
      `);

      res.json({
        platformLimits: result.rows,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get platform limits');
      res.status(500).json({ error: 'Failed to get platform limits' });
    }
  }
);

/**
 * Update platform rate limit configuration
 */
router.put('/platform-limits',
  requireAuth,
  requireRole('admin'),
  validateRequest(updatePlatformLimitsSchema),
  async (req, res) => {
    return withSpan('admin.update_platform_limits', {
      'admin.platform': req.body.platform,
      'admin.endpoint': req.body.endpoint
    }, async () => {
      try {
        const { platform, endpoint, limitPerMinute, limitPerHour, limitPerDay, burstLimit } = req.body;

        const updateFields: string[] = [];
        const params: any[] = [platform, endpoint];
        let paramIndex = 3;

        if (limitPerMinute !== undefined) {
          updateFields.push(`limit_per_minute = $${paramIndex++}`);
          params.push(limitPerMinute);
        }

        if (limitPerHour !== undefined) {
          updateFields.push(`limit_per_hour = $${paramIndex++}`);
          params.push(limitPerHour);
        }

        if (limitPerDay !== undefined) {
          updateFields.push(`limit_per_day = $${paramIndex++}`);
          params.push(limitPerDay);
        }

        if (burstLimit !== undefined) {
          updateFields.push(`burst_limit = $${paramIndex++}`);
          params.push(burstLimit);
        }

        updateFields.push('updated_at = now()');

        const result = await pool.query(`
          UPDATE platform_rate_limits
          SET ${updateFields.join(', ')}
          WHERE platform = $1 AND endpoint = $2
          RETURNING *
        `, params);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Platform limit configuration not found' });
        }

        // Reload configurations in rate limiter
        await rateLimiter.loadPlatformConfigs();

        logger.info({
          platform,
          endpoint,
          updates: req.body,
          adminUserId: req.user!.id
        }, 'Platform limits updated by admin');

        res.json({
          message: 'Platform limits updated successfully',
          configuration: result.rows[0]
        });

      } catch (error) {
        logger.error({ err: error }, 'Failed to update platform limits');
        res.status(500).json({ error: 'Failed to update platform limits' });
      }
    });
  }
);

// =============================================
// Scheduler Management
// =============================================

/**
 * Get scheduling metrics and fairness status
 */
router.get('/scheduler/metrics',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { platform } = req.query;
      const platformStr = platform as string;

      const metrics = await fairShareScheduler.getSchedulerMetrics(platformStr);
      
      let fairnessStatus = null;
      if (platformStr) {
        fairnessStatus = await fairShareScheduler.checkFairness(platformStr);
      }

      res.json({
        metrics,
        fairnessStatus,
        platform: platformStr,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get scheduler metrics');
      res.status(500).json({ error: 'Failed to get scheduler metrics' });
    }
  }
);

/**
 * Get fair share state for platform
 */
router.get('/scheduler/fairness/:platform',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { platform } = req.params;

      const fairShareState = await fairShareScheduler.getFairShareState(platform);
      const fairnessCheck = await fairShareScheduler.checkFairness(platform);

      res.json({
        fairShareState,
        fairnessCheck,
        platform,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get fairness status');
      res.status(500).json({ error: 'Failed to get fairness status' });
    }
  }
);

/**
 * Manage token scheduling configuration
 */
router.put('/scheduler/tokens',
  requireAuth,
  requireRole('admin'),
  validateRequest(manageTokenSchema),
  async (req, res) => {
    return withSpan('admin.manage_token', {
      'admin.token_id': req.body.tokenId,
      'admin.platform': req.body.platform
    }, async () => {
      try {
        const { tokenId, platform, isActive, priority, weight } = req.body;

        const updateFields: string[] = [];
        const params: any[] = [tokenId, platform];
        let paramIndex = 3;

        if (isActive !== undefined) {
          updateFields.push(`is_active = $${paramIndex++}`);
          params.push(isActive);
        }

        if (priority !== undefined) {
          updateFields.push(`priority = $${paramIndex++}`);
          params.push(priority);
        }

        if (weight !== undefined) {
          updateFields.push(`weight = $${paramIndex++}`);
          params.push(weight);
        }

        updateFields.push('updated_at = now()');

        const result = await pool.query(`
          INSERT INTO token_scheduling (token_id, platform, is_active, priority, weight)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (token_id, platform)
          DO UPDATE SET ${updateFields.join(', ')}
          RETURNING *
        `, [tokenId, platform, isActive || true, priority || 5, weight || 1.0]);

        logger.info({
          tokenId,
          platform,
          updates: req.body,
          adminUserId: req.user!.id
        }, 'Token scheduling updated by admin');

        res.json({
          message: 'Token scheduling updated successfully',
          tokenScheduling: result.rows[0]
        });

      } catch (error) {
        logger.error({ err: error }, 'Failed to manage token');
        res.status(500).json({ error: 'Failed to manage token' });
      }
    });
  }
);

// =============================================
// Worker Management
// =============================================

/**
 * Get worker status and metrics
 */
router.get('/workers/status',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const workerStatus = multiAccountWorkerManager.getWorkerStatus();
      const healthCheck = await multiAccountWorkerManager.healthCheck();

      res.json({
        workerStatus,
        healthCheck,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get worker status');
      res.status(500).json({ error: 'Failed to get worker status' });
    }
  }
);

/**
 * Scale workers manually
 */
router.post('/workers/scale',
  requireAuth,
  requireRole('admin'),
  validateRequest(scaleWorkersSchema),
  async (req, res) => {
    return withSpan('admin.scale_workers', {
      'admin.platform': req.body.platform,
      'admin.action': req.body.action
    }, async () => {
      try {
        const { platform, action } = req.body;

        switch (action) {
          case 'scale_up':
          case 'scale_down':
          case 'restart':
            if (platform) {
              await multiAccountWorkerManager.scaleWorkers(platform);
            } else {
              // Scale all platforms
              const platforms = ['tiktok', 'instagram', 'twitter', 'reddit'];
              for (const p of platforms) {
                await multiAccountWorkerManager.scaleWorkers(p);
              }
            }
            break;

          default:
            return res.status(400).json({ error: 'Invalid action' });
        }

        logger.info({
          platform,
          action,
          adminUserId: req.user!.id
        }, 'Worker scaling triggered by admin');

        res.json({
          message: `Worker scaling ${action} completed`,
          platform: platform || 'all',
          action
        });

      } catch (error) {
        logger.error({ err: error }, 'Failed to scale workers');
        res.status(500).json({ error: 'Failed to scale workers' });
      }
    });
  }
);

// =============================================
// Queue Management
// =============================================

/**
 * Get queue statistics
 */
router.get('/queues/statistics',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { platform } = req.query;
      
      let whereClause = '';
      const params: any[] = [];

      if (platform) {
        whereClause = 'WHERE platform = $1';
        params.push(platform);
      }

      const result = await pool.query(`
        SELECT 
          q.*,
          EXTRACT(EPOCH FROM (now() - q.last_activity_at))/60 as minutes_since_activity
        FROM queue_statistics q
        ${whereClause}
        ORDER BY q.last_activity_at DESC
      `, params);

      res.json({
        queues: result.rows,
        platform: platform || 'all',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get queue statistics');
      res.status(500).json({ error: 'Failed to get queue statistics' });
    }
  }
);

/**
 * Get queue health overview
 */
router.get('/queues/health',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM queue_health_overview
        ORDER BY platform
      `);

      res.json({
        queueHealth: result.rows,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get queue health');
      res.status(500).json({ error: 'Failed to get queue health' });
    }
  }
);

// =============================================
// System Health and Monitoring
// =============================================

/**
 * Overall scaling system health check
 */
router.get('/health',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const rateLimiterHealth = await rateLimiter.healthCheck();
      const schedulerHealth = await fairShareScheduler.healthCheck();
      const workerHealth = await multiAccountWorkerManager.healthCheck();

      const overallHealthy = rateLimiterHealth.healthy && 
                           schedulerHealth.healthy && 
                           workerHealth.healthy;

      res.json({
        healthy: overallHealthy,
        components: {
          rateLimiter: rateLimiterHealth,
          scheduler: schedulerHealth,
          workers: workerHealth
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get system health');
      res.status(500).json({ 
        healthy: false,
        error: 'Failed to get system health',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * Get comprehensive metrics dashboard data
 */
router.get('/dashboard',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { timeframe = '1h' } = req.query;

      // Get rate limit hits
      const rateLimitHits = await pool.query(`
        SELECT * FROM rate_limit_hits_hourly
        WHERE hour > now() - INTERVAL '${timeframe === '24h' ? '24 hours' : '6 hours'}'
        ORDER BY hour DESC
      `);

      // Get token performance
      const tokenPerformance = await pool.query(`
        SELECT * FROM token_performance_metrics
        ORDER BY completion_rate_percent DESC
        LIMIT 20
      `);

      // Get queue health
      const queueHealth = await pool.query(`
        SELECT * FROM queue_health_overview
      `);

      res.json({
        rateLimitHits: rateLimitHits.rows,
        tokenPerformance: tokenPerformance.rows,
        queueHealth: queueHealth.rows,
        timeframe,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Failed to get dashboard data');
      res.status(500).json({ error: 'Failed to get dashboard data' });
    }
  }
);

export default router;