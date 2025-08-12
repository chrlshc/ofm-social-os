// Express routes for LLM Budget Management
// RESTful API for budget configuration, usage tracking, and reporting

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { budgetManager, PRICING_TABLES } from '../lib/llm-budget';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import * as otel from '../lib/otel';

export const llmBudgetRouter = Router();

// Get budget status for current month
llmBudgetRouter.get('/status', authenticate, async (req, res) => {
  try {
    const creatorId = (req as any).user.creatorId;
    const { month } = req.query;

    const status = await budgetManager.getBudgetStatus(creatorId, month as string);
    
    res.json(status);

  } catch (error: any) {
    logger.error('Failed to get budget status', error);
    res.status(500).json({ error: 'Failed to get budget status' });
  }
});

// Update budget configuration
llmBudgetRouter.put('/config', authenticate, async (req, res) => {
  try {
    const creatorId = (req as any).user.creatorId;
    const { month, usdLimit, softLimitPct, hardStop, modelCaps } = req.body;

    if (!month) {
      return res.status(400).json({ error: 'Month is required (YYYY-MM format)' });
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    // Validate limits
    if (usdLimit !== undefined && (usdLimit < 0 || usdLimit > 10000)) {
      return res.status(400).json({ 
        error: 'Invalid USD limit. Must be between 0 and 10000.' 
      });
    }

    if (softLimitPct !== undefined && (softLimitPct < 0 || softLimitPct > 100)) {
      return res.status(400).json({ 
        error: 'Invalid soft limit percentage. Must be between 0 and 100.' 
      });
    }

    await budgetManager.updateBudget(creatorId, month, {
      usdLimit,
      softLimitPct,
      hardStop,
      modelCaps
    });

    // Get updated status
    const status = await budgetManager.getBudgetStatus(creatorId, month);

    logger.info('Budget configuration updated', {
      creatorId,
      month,
      updates: { usdLimit, softLimitPct, hardStop, modelCaps }
    });

    res.json({
      success: true,
      status
    });

  } catch (error: any) {
    logger.error('Failed to update budget config', error);
    res.status(500).json({ error: 'Failed to update budget configuration' });
  }
});

// Get usage report
llmBudgetRouter.get('/usage/:month', authenticate, async (req, res) => {
  try {
    const creatorId = (req as any).user.creatorId;
    const { month } = req.params;

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
    }

    const report = await budgetManager.getUsageReport(creatorId, month);
    
    res.json({
      month,
      ...report
    });

  } catch (error: any) {
    logger.error('Failed to get usage report', error);
    res.status(500).json({ error: 'Failed to get usage report' });
  }
});

// Estimate cost for a potential request
llmBudgetRouter.post('/estimate', authenticate, async (req, res) => {
  try {
    const { provider, model, inputTokens, outputTokens = 0, cachedTokens = 0 } = req.body;

    if (!provider || !model || !inputTokens) {
      return res.status(400).json({ 
        error: 'Missing required fields: provider, model, inputTokens' 
      });
    }

    if (inputTokens < 0 || outputTokens < 0) {
      return res.status(400).json({ 
        error: 'Token counts must be non-negative' 
      });
    }

    const estimatedCost = await budgetManager.estimateCost(
      provider,
      model,
      inputTokens,
      outputTokens,
      cachedTokens
    );

    res.json({
      provider,
      model,
      inputTokens,
      outputTokens,
      cachedTokens,
      estimatedCost,
      breakdown: {
        inputCost: estimatedCost * (inputTokens / (inputTokens + outputTokens)),
        outputCost: estimatedCost * (outputTokens / (inputTokens + outputTokens))
      }
    });

  } catch (error: any) {
    logger.error('Failed to estimate cost', error);
    res.status(500).json({ error: 'Failed to estimate cost' });
  }
});

// Get pricing information
llmBudgetRouter.get('/pricing', authenticate, async (req, res) => {
  try {
    // Get latest pricing from database
    const dbPricing = await db.query(`
      SELECT DISTINCT ON (provider, model) 
        provider, model, 
        input_cost_per_1m_tokens,
        output_cost_per_1m_tokens,
        effective_date,
        source_url
      FROM llm_pricing
      ORDER BY provider, model, effective_date DESC
    `);

    // Combine with hardcoded pricing
    const combinedPricing = {
      database: dbPricing.rows,
      hardcoded: PRICING_TABLES,
      lastUpdated: new Date().toISOString()
    };

    res.json(combinedPricing);

  } catch (error: any) {
    logger.error('Failed to get pricing', error);
    res.status(500).json({ error: 'Failed to get pricing information' });
  }
});

// Get recent usage history
llmBudgetRouter.get('/history', authenticate, async (req, res) => {
  try {
    const creatorId = (req as any).user.creatorId;
    const { limit = 50, offset = 0, provider, model, operationType } = req.query;

    let query = `
      SELECT 
        u.id,
        u.provider,
        u.model,
        u.input_tokens,
        u.output_tokens,
        u.total_usd_cost,
        u.operation_type,
        u.response_cached,
        u.created_at,
        p.caption as post_caption
      FROM llm_usage u
      LEFT JOIN posts p ON u.post_id = p.id
      WHERE u.creator_id = $1
    `;

    const params: any[] = [creatorId];
    let paramIndex = 1;

    if (provider) {
      query += ` AND u.provider = $${++paramIndex}`;
      params.push(provider);
    }

    if (model) {
      query += ` AND u.model = $${++paramIndex}`;
      params.push(model);
    }

    if (operationType) {
      query += ` AND u.operation_type = $${++paramIndex}`;
      params.push(operationType);
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${++paramIndex} OFFSET $${++paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM llm_usage u
      WHERE u.creator_id = $1
    `;

    const countParams = [creatorId];
    let countParamIndex = 1;

    if (provider) {
      countQuery += ` AND u.provider = $${++countParamIndex}`;
      countParams.push(provider);
    }

    if (model) {
      countQuery += ` AND u.model = $${++countParamIndex}`;
      countParams.push(model);
    }

    if (operationType) {
      countQuery += ` AND u.operation_type = $${++countParamIndex}`;
      countParams.push(operationType);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      usage: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      filters: { provider, model, operationType }
    });

  } catch (error: any) {
    logger.error('Failed to get usage history', error);
    res.status(500).json({ error: 'Failed to get usage history' });
  }
});

// Get budget alerts
llmBudgetRouter.get('/alerts', authenticate, async (req, res) => {
  try {
    const creatorId = (req as any).user.creatorId;
    const { month, unreadOnly = false } = req.query;

    let query = `
      SELECT 
        id,
        alert_type,
        month_year,
        current_usage,
        budget_limit,
        threshold_pct,
        triggered_at,
        webhook_sent
      FROM llm_budget_alerts
      WHERE creator_id = $1
    `;

    const params: any[] = [creatorId];
    let paramIndex = 1;

    if (month) {
      query += ` AND month_year = $${++paramIndex}`;
      params.push(month);
    }

    if (unreadOnly === 'true') {
      query += ` AND NOT webhook_sent`;
    }

    query += ` ORDER BY triggered_at DESC`;

    const result = await db.query(query, params);

    res.json({
      alerts: result.rows
    });

  } catch (error: any) {
    logger.error('Failed to get budget alerts', error);
    res.status(500).json({ error: 'Failed to get budget alerts' });
  }
});

// Create test usage (development only)
if (process.env.NODE_ENV === 'development') {
  llmBudgetRouter.post('/test-usage', authenticate, async (req, res) => {
    try {
      const creatorId = (req as any).user.creatorId;
      const { 
        provider = 'openai', 
        model = 'gpt-4o-mini', 
        inputTokens = 100, 
        outputTokens = 50,
        operationType = 'test'
      } = req.body;

      const cost = await budgetManager.estimateCost(provider, model, inputTokens, outputTokens);

      await budgetManager.recordUsage({
        creatorId,
        provider,
        model,
        inputTokens,
        outputTokens,
        totalCost: cost,
        operationType,
        requestId: `test-${Date.now()}`,
        estimated: true
      });

      const status = await budgetManager.getBudgetStatus(creatorId);

      res.json({
        success: true,
        testUsage: {
          provider,
          model,
          inputTokens,
          outputTokens,
          cost
        },
        updatedStatus: status
      });

    } catch (error: any) {
      logger.error('Failed to create test usage', error);
      res.status(500).json({ error: 'Failed to create test usage' });
    }
  });
}

// Admin routes (require admin role)
llmBudgetRouter.get('/admin/stats', authenticate, async (req, res) => {
  try {
    // Check admin permission
    const isAdmin = (req as any).user.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get global stats
    const [totalStats, topUsers, recentAlerts] = await Promise.all([
      db.query(`
        SELECT 
          COUNT(DISTINCT creator_id) as total_creators_with_usage,
          COUNT(*) as total_requests,
          SUM(total_usd_cost) as total_cost,
          AVG(total_usd_cost) as avg_cost_per_request
        FROM llm_usage
        WHERE created_at > NOW() - INTERVAL '30 days'
      `),
      
      db.query(`
        SELECT 
          c.display_name,
          u.creator_id,
          COUNT(*) as requests,
          SUM(u.total_usd_cost) as total_cost
        FROM llm_usage u
        JOIN creators c ON u.creator_id = c.id
        WHERE u.created_at > NOW() - INTERVAL '30 days'
        GROUP BY u.creator_id, c.display_name
        ORDER BY total_cost DESC
        LIMIT 10
      `),
      
      db.query(`
        SELECT 
          a.*,
          c.display_name
        FROM llm_budget_alerts a
        JOIN creators c ON a.creator_id = c.id
        WHERE a.triggered_at > NOW() - INTERVAL '7 days'
        ORDER BY a.triggered_at DESC
        LIMIT 20
      `)
    ]);

    res.json({
      totalStats: totalStats.rows[0],
      topUsers: topUsers.rows,
      recentAlerts: recentAlerts.rows
    });

  } catch (error: any) {
    logger.error('Failed to get admin stats', error);
    res.status(500).json({ error: 'Failed to get admin statistics' });
  }
});

// Update pricing (admin only)
llmBudgetRouter.post('/admin/pricing', authenticate, async (req, res) => {
  try {
    const isAdmin = (req as any).user.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { provider, model, inputCostPer1M, outputCostPer1M, sourceUrl } = req.body;

    if (!provider || !model || !inputCostPer1M || !outputCostPer1M) {
      return res.status(400).json({ 
        error: 'Missing required fields: provider, model, inputCostPer1M, outputCostPer1M' 
      });
    }

    await db.query(`
      INSERT INTO llm_pricing (
        provider, model, input_cost_per_1m_tokens, output_cost_per_1m_tokens, source_url
      ) VALUES ($1, $2, $3, $4, $5)
    `, [provider, model, inputCostPer1M, outputCostPer1M, sourceUrl]);

    logger.info('Pricing updated by admin', {
      provider,
      model,
      inputCostPer1M,
      outputCostPer1M,
      admin: (req as any).user.id
    });

    res.json({
      success: true,
      message: 'Pricing updated successfully'
    });

  } catch (error: any) {
    logger.error('Failed to update pricing', error);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

// Cleanup expired reservations (admin/cron)
llmBudgetRouter.post('/admin/cleanup', authenticate, async (req, res) => {
  try {
    const isAdmin = (req as any).user.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const cleanedCount = await budgetManager.cleanupExpiredReservations();

    res.json({
      success: true,
      cleanedCount,
      message: `Cleaned up ${cleanedCount} expired reservations`
    });

  } catch (error: any) {
    logger.error('Failed to cleanup reservations', error);
    res.status(500).json({ error: 'Failed to cleanup expired reservations' });
  }
});

// TODO-1: Add budget forecasting endpoint based on usage trends
// TODO-2: Implement bulk budget operations for multiple creators
// TODO-3: Add cost optimization recommendations based on usage patterns