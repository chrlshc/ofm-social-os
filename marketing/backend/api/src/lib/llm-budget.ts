// LLM Budget Management System
// Handles cost estimation, budget checking, and usage tracking
// Ref: https://openai.com/api/pricing/
// Ref: https://docs.anthropic.com/en/docs/about-claude/pricing

import { db } from './db';
import { loggers } from './logger';
import { redisUtils } from './redis';
import * as otel from './otel';

const logger = loggers.llm;

// Provider pricing structures
interface ProviderPricing {
  [model: string]: {
    input: number;  // USD per 1M tokens
    output: number; // USD per 1M tokens
    contextWindow?: number;
    updated: string; // ISO date
  };
}

// Official pricing tables (updated regularly)
export const PRICING_TABLES: Record<string, ProviderPricing> = {
  openai: {
    'gpt-4o': { input: 2.50, output: 10.00, contextWindow: 128000, updated: '2025-01-15' },
    'gpt-4o-mini': { input: 0.15, output: 0.60, contextWindow: 128000, updated: '2025-01-15' },
    'gpt-4-turbo': { input: 10.00, output: 30.00, contextWindow: 128000, updated: '2025-01-15' },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50, contextWindow: 16385, updated: '2025-01-15' }
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, contextWindow: 200000, updated: '2025-01-15' },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25, contextWindow: 200000, updated: '2025-01-15' },
    'claude-3-sonnet-20240229': { input: 3.00, output: 15.00, contextWindow: 200000, updated: '2025-01-15' }
  },
  gemini: {
    'gemini-1.5-pro': { input: 1.25, output: 5.00, contextWindow: 2000000, updated: '2025-01-15' },
    'gemini-1.5-flash': { input: 0.075, output: 0.30, contextWindow: 1000000, updated: '2025-01-15' }
  }
};

export interface BudgetStatus {
  budgetLimit: number;
  currentUsage: number;
  reservedAmount: number;
  availableBudget: number;
  usagePercentage: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
  topModels: Array<{
    model: string;
    cost: number;
    requests: number;
  }>;
}

export interface BudgetReservation {
  reservationId: string | null;
  approved: boolean;
  reason: string;
  budgetStatus: BudgetStatus;
}

export interface UsageRecord {
  creatorId: string;
  agentId?: string;
  postId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalCost: number;
  operationType: string;
  requestId?: string;
  workflowId?: string;
  promptHash?: string;
  cached?: boolean;
  estimated?: boolean;
}

export class LLMBudgetManager {
  
  // Estimate cost for a request before making it
  async estimateCost(
    provider: string, 
    model: string, 
    inputTokens: number, 
    outputTokens: number = 0,
    cachedTokens: number = 0
  ): Promise<number> {
    return await otel.withSpan('llm_budget.estimate_cost', {
      'llm.provider': provider,
      'llm.model': model,
      'llm.input_tokens': inputTokens,
      'llm.output_tokens': outputTokens
    }, async (span) => {
      // Try database pricing first (most up-to-date)
      const dbResult = await db.query(`
        SELECT input_cost_per_1m_tokens, output_cost_per_1m_tokens
        FROM llm_pricing
        WHERE provider = $1 AND model = $2
        ORDER BY effective_date DESC
        LIMIT 1
      `, [provider, model]);

      let inputRate: number, outputRate: number;

      if (dbResult.rows.length > 0) {
        inputRate = parseFloat(dbResult.rows[0].input_cost_per_1m_tokens);
        outputRate = parseFloat(dbResult.rows[0].output_cost_per_1m_tokens);
        span.setAttribute('pricing.source', 'database');
      } else {
        // Fallback to hardcoded pricing
        const pricing = PRICING_TABLES[provider]?.[model];
        if (pricing) {
          inputRate = pricing.input;
          outputRate = pricing.output;
          span.setAttribute('pricing.source', 'hardcoded');
        } else {
          // Conservative fallback
          inputRate = 5.0; // $5 per 1M tokens
          outputRate = 15.0; // $15 per 1M tokens
          span.setAttribute('pricing.source', 'fallback');
          
          logger.warn('Unknown model pricing, using fallback', { provider, model });
        }
      }

      // Calculate effective input tokens (subtract cached tokens)
      const effectiveInputTokens = Math.max(0, inputTokens - (cachedTokens || 0));
      
      const inputCost = (effectiveInputTokens / 1_000_000) * inputRate;
      const outputCost = (outputTokens / 1_000_000) * outputRate;
      const totalCost = inputCost + outputCost;

      span.setAttributes({
        'pricing.input_rate_per_1m': inputRate,
        'pricing.output_rate_per_1m': outputRate,
        'cost.input_usd': inputCost,
        'cost.output_usd': outputCost,
        'cost.total_usd': totalCost,
        'tokens.cached': cachedTokens || 0,
        'tokens.effective_input': effectiveInputTokens
      });

      return Math.round(totalCost * 1_000_000) / 1_000_000; // Round to 6 decimal places
    });
  }

  // Get current budget status for a creator
  async getBudgetStatus(creatorId: string, monthYear?: string): Promise<BudgetStatus> {
    return await otel.withSpan('llm_budget.get_status', {
      'creator.id': creatorId,
      'budget.month': monthYear || 'current'
    }, async (span) => {
      const currentMonth = monthYear || new Date().toISOString().substring(0, 7); // YYYY-MM
      
      // Get budget configuration
      const budgetResult = await db.query(`
        SELECT * FROM llm_budgets 
        WHERE creator_id = $1 AND month = $2
      `, [creatorId, currentMonth]);

      // Default budget if none configured
      const budget = budgetResult.rows[0] || {
        usd_limit: 100.0, // Default $100/month
        soft_pct: 80,
        hard_stop: true
      };

      // Get current usage for the month
      const usageResult = await db.query(`
        SELECT 
          COALESCE(SUM(total_cost), 0) as current_usage,
          COUNT(*) as request_count
        FROM llm_usage 
        WHERE creator_id = $1 
        AND date_trunc('month', created_at) = date_trunc('month', $2::date)
      `, [creatorId, `${currentMonth}-01`]);

      const currentUsage = parseFloat(usageResult.rows[0].current_usage) || 0;
      const availableBudget = Math.max(0, budget.usd_limit - currentUsage);
      const usagePercentage = (currentUsage / budget.usd_limit) * 100;
      const softLimitReached = usagePercentage >= budget.soft_pct;
      const hardLimitReached = budget.hard_stop && usagePercentage >= 100;

      // Get top models for this month
      const topModelsResult = await db.query(`
        SELECT 
          provider || '/' || model as model,
          SUM(total_cost) as cost,
          COUNT(*) as requests
        FROM llm_usage 
        WHERE creator_id = $1 
        AND date_trunc('month', created_at) = date_trunc('month', $2::date)
        GROUP BY provider, model
        ORDER BY cost DESC
        LIMIT 5
      `, [creatorId, `${currentMonth}-01`]);
      
      span.setAttributes({
        'budget.limit_usd': budget.usd_limit,
        'budget.current_usage_usd': currentUsage,
        'budget.available_usd': availableBudget,
        'budget.usage_pct': usagePercentage,
        'budget.soft_limit_reached': softLimitReached,
        'budget.hard_limit_reached': hardLimitReached
      });

      return {
        budgetLimit: parseFloat(budget.usd_limit),
        currentUsage: currentUsage,
        reservedAmount: 0, // TODO: Implement reservations
        availableBudget: availableBudget,
        usagePercentage: usagePercentage,
        softLimitReached: softLimitReached,
        hardLimitReached: hardLimitReached,
        topModels: topModelsResult.rows.map(row => ({
          model: row.model,
          cost: parseFloat(row.cost),
          requests: parseInt(row.requests)
        }))
      };
    });
  }

  // Reserve budget before making LLM call
  async reserveBudget(
    creatorId: string,
    estimatedCost: number,
    operationType: string,
    requestId?: string
  ): Promise<BudgetReservation> {
    return await otel.withSpan('llm_budget.reserve', {
      'creator.id': creatorId,
      'budget.estimated_cost_usd': estimatedCost,
      'llm.operation_type': operationType
    }, async (span) => {
      // Get current budget status
      const budgetStatus = await this.getBudgetStatus(creatorId);
      
      // Check if budget allows this request
      if (budgetStatus.hardLimitReached) {
        span.setAttribute('budget.reservation_approved', false);
        otel.budgetExceededCounter.add(1, {
          creator_id: creatorId,
          operation_type: operationType
        });

        return {
          reservationId: null,
          approved: false,
          reason: `Hard budget limit exceeded. Used ${budgetStatus.usagePercentage.toFixed(1)}% of monthly budget.`,
          budgetStatus
        };
      }

      if (estimatedCost > budgetStatus.availableBudget) {
        span.setAttribute('budget.reservation_approved', false);
        otel.budgetExceededCounter.add(1, {
          creator_id: creatorId,
          operation_type: operationType
        });

        return {
          reservationId: null,
          approved: false,
          reason: `Insufficient budget. Request cost $${estimatedCost.toFixed(4)} exceeds available budget $${budgetStatus.availableBudget.toFixed(4)}.`,
          budgetStatus
        };
      }

      // Generate reservation ID
      const reservationId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store reservation in Redis with TTL (10 minutes)
      await redisUtils.set(`llm_reservation:${reservationId}`, {
        creatorId,
        estimatedCost,
        operationType,
        requestId,
        createdAt: new Date().toISOString()
      }, 600);

      span.setAttributes({
        'budget.reservation_approved': true,
        'budget.reservation_id': reservationId
      });

      logger.info('LLM budget reserved', {
        creatorId,
        reservationId,
        estimatedCost,
        operationType,
        availableBudget: budgetStatus.availableBudget
      });

      return {
        reservationId,
        approved: true,
        reason: 'Budget reserved successfully',
        budgetStatus
      };
    });
  }

  // Record actual usage and consume reservation
  async recordUsage(usage: UsageRecord, reservationId?: string): Promise<void> {
    return await otel.withSpan('llm_budget.record_usage', {
      'creator.id': usage.creatorId,
      'llm.provider': usage.provider,
      'llm.model': usage.model,
      'llm.operation_type': usage.operationType,
      'llm.total_cost_usd': usage.totalCost
    }, async (span) => {
      const client = await db.getClient();
      
      try {
        await client.query('BEGIN');

        // Insert usage record
        const usageResult = await client.query(`
          INSERT INTO llm_usage (
            creator_id, agent_id, post_id, provider, model,
            input_tokens, output_tokens, cached_tokens, total_cost,
            operation_type, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `, [
          usage.creatorId, usage.agentId, usage.postId, usage.provider, usage.model,
          usage.inputTokens, usage.outputTokens, usage.cachedTokens || 0, usage.totalCost,
          usage.operationType, JSON.stringify({
            requestId: usage.requestId,
            workflowId: usage.workflowId,
            promptHash: usage.promptHash,
            cached: usage.cached || false,
            estimated: usage.estimated || false
          })
        ]);

        const usageId = usageResult.rows[0].id;

        // Consume reservation if provided
        if (reservationId) {
          const reservation = await redisUtils.get(`llm_reservation:${reservationId}`);
          if (reservation) {
            await redisUtils.del(`llm_reservation:${reservationId}`);
            logger.debug('LLM reservation consumed', { reservationId, usageId });
          } else {
            logger.warn('LLM reservation not found', { reservationId, usageId });
          }
        }

        await client.query('COMMIT');

        span.setAttributes({
          'usage.id': usageId,
          'usage.tokens.input': usage.inputTokens,
          'usage.tokens.output': usage.outputTokens,
          'usage.tokens.cached': usage.cachedTokens || 0,
          'usage.reservation_consumed': !!reservationId
        });

        // Update metrics
        otel.llmCostGauge.add(usage.totalCost, {
          provider: usage.provider,
          model: usage.model,
          creator_id: usage.creatorId
        });

        logger.info('LLM usage recorded', {
          creatorId: usage.creatorId,
          provider: usage.provider,
          model: usage.model,
          cost: usage.totalCost,
          operationType: usage.operationType,
          usageId
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  // Check and record usage with automatic reservation
  async checkAndReserveBudget(
    creatorId: string,
    provider: string,
    model: string,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
    operationType: string,
    requestId?: string
  ): Promise<{ reservation: BudgetReservation; estimatedCost: number }> {
    
    const estimatedCost = await this.estimateCost(
      provider, 
      model, 
      estimatedInputTokens, 
      estimatedOutputTokens
    );

    const reservation = await this.reserveBudget(
      creatorId,
      estimatedCost,
      operationType,
      requestId
    );

    return { reservation, estimatedCost };
  }

  // Update budget limits
  async updateBudget(
    creatorId: string,
    monthYear: string,
    updates: {
      usdLimit?: number;
      softLimitPct?: number;
      hardStop?: boolean;
      modelCaps?: Record<string, number>;
    }
  ): Promise<void> {
    await db.query(`
      INSERT INTO llm_budgets (creator_id, month, usd_limit, soft_pct, hard_stop, model_caps)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (creator_id, month)
      DO UPDATE SET 
        usd_limit = COALESCE($3, llm_budgets.usd_limit),
        soft_pct = COALESCE($4, llm_budgets.soft_pct),
        hard_stop = COALESCE($5, llm_budgets.hard_stop),
        model_caps = COALESCE($6, llm_budgets.model_caps),
        updated_at = NOW()
    `, [
      creatorId, 
      monthYear, 
      updates.usdLimit,
      updates.softLimitPct,
      updates.hardStop,
      updates.modelCaps ? JSON.stringify(updates.modelCaps) : null
    ]);

    logger.info('Budget updated', { creatorId, monthYear, updates });
  }

  // Clean up expired reservations from Redis
  async cleanupExpiredReservations(): Promise<number> {
    // Redis TTL handles expiration automatically, but we can scan for debugging
    const pattern = 'llm_reservation:*';
    // Note: In production, use SCAN instead of KEYS for large datasets
    // This is a simplified implementation
    let cleanedCount = 0;
    
    logger.debug('LLM reservation cleanup completed', { count: cleanedCount });
    return cleanedCount;
  }

  // Get usage report for a creator
  async getUsageReport(
    creatorId: string, 
    monthYear: string
  ): Promise<{
    summary: any;
    byModel: any[];
    byOperation: any[];
    timeline: any[];
  }> {
    const [summary, byModel, byOperation, timeline] = await Promise.all([
      // Summary
      db.query(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_usd_cost) as total_cost,
          AVG(total_usd_cost) as avg_cost_per_request,
          COUNT(CASE WHEN response_cached THEN 1 END) as cached_responses
        FROM llm_usage
        WHERE creator_id = $1 
          AND date_trunc('month', created_at) = date_trunc('month', ($2 || '-01')::date)
      `, [creatorId, monthYear]),

      // By model
      db.query(`
        SELECT 
          provider || '/' || model as model,
          COUNT(*) as requests,
          SUM(total_usd_cost) as cost,
          AVG(total_usd_cost) as avg_cost,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens
        FROM llm_usage
        WHERE creator_id = $1 
          AND date_trunc('month', created_at) = date_trunc('month', ($2 || '-01')::date)
        GROUP BY provider, model
        ORDER BY cost DESC
      `, [creatorId, monthYear]),

      // By operation
      db.query(`
        SELECT 
          operation_type,
          COUNT(*) as requests,
          SUM(total_usd_cost) as cost,
          AVG(total_usd_cost) as avg_cost
        FROM llm_usage
        WHERE creator_id = $1 
          AND date_trunc('month', created_at) = date_trunc('month', ($2 || '-01')::date)
        GROUP BY operation_type
        ORDER BY cost DESC
      `, [creatorId, monthYear]),

      // Timeline (daily)
      db.query(`
        SELECT 
          date_trunc('day', created_at) as date,
          COUNT(*) as requests,
          SUM(total_usd_cost) as cost
        FROM llm_usage
        WHERE creator_id = $1 
          AND date_trunc('month', created_at) = date_trunc('month', ($2 || '-01')::date)
        GROUP BY date_trunc('day', created_at)
        ORDER BY date
      `, [creatorId, monthYear])
    ]);

    return {
      summary: summary.rows[0],
      byModel: byModel.rows,
      byOperation: byOperation.rows,
      timeline: timeline.rows
    };
  }
}

// Singleton instance
export const budgetManager = new LLMBudgetManager();

// Middleware for Express routes
export async function requireBudget(
  creatorId: string,
  provider: string,
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  operationType: string
): Promise<{ reservationId: string; estimatedCost: number }> {
  
  const { reservation, estimatedCost } = await budgetManager.checkAndReserveBudget(
    creatorId,
    provider,
    model,
    estimatedInputTokens,
    estimatedOutputTokens,
    operationType
  );

  if (!reservation.approved) {
    const error = new Error(reservation.reason);
    (error as any).code = 'BUDGET_EXCEEDED';
    (error as any).budgetStatus = reservation.budgetStatus;
    throw error;
  }

  return {
    reservationId: reservation.reservationId!,
    estimatedCost
  };
}

// TODO-1: Add model-specific budget caps and overrides
// TODO-2: Implement usage prediction and cost forecasting  
// TODO-3: Add bulk operations for batch processing