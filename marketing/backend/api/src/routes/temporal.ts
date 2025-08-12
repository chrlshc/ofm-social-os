// Express routes for Temporal workflow management
// Bridge between HTTP API and Temporal workflows

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { getPublishClient } from '../temporal/client';
import { PublishInput } from '../temporal/workflows/publish';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import * as otel from '../lib/otel';
import { createHash } from 'crypto';

export const temporalRouter = Router();

// Start a publish workflow (replaces BullMQ enqueue)
temporalRouter.post('/workflows/publish', authenticate, rateLimiter, async (req, res) => {
  const span = otel.tracer.startSpan('temporal.start_publish_workflow');
  
  try {
    const { platform, accountId, variantId, caption, hashtags, scheduleAt } = req.body;
    const creatorId = (req as any).user.creatorId;

    // Generate idempotency key
    const idempotencyKey = createHash('sha256')
      .update(`${platform}:${accountId}:${variantId || ''}:${caption}`)
      .digest('hex');

    // Create post record
    const postId = require('uuid').v4();
    await db.query(`
      INSERT INTO posts (
        id, creator_id, account_id, variant_id, platform, status,
        caption, hashtags, scheduled_at, workflow_status, migration_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      postId, creatorId, accountId, variantId, platform, 'queued',
      caption, hashtags, scheduleAt, 'pending', 'temporal'
    ]);

    // Get variant URL if specified
    let variantUrl: string | undefined;
    if (variantId) {
      const variant = await db.query('SELECT s3_url FROM variants WHERE id = $1', [variantId]);
      variantUrl = variant.rows[0]?.s3_url;
    }

    // Prepare workflow input
    const workflowInput: PublishInput = {
      platform,
      accountId,
      tokenId: req.body.tokenId, // Should come from account lookup
      variantUrl,
      caption,
      hashtags,
      scheduleAt,
      postId,
      creatorId,
      idempotencyKey
    };

    // Start Temporal workflow
    const client = await getPublishClient();
    const result = await client.startPublishWorkflow(workflowInput);

    // Update post with workflow info
    await db.query(`
      UPDATE posts 
      SET workflow_id = $1, workflow_run_id = $2, workflow_status = 'running'
      WHERE id = $3
    `, [result.workflowId, result.runId, postId]);

    span.setAttributes({
      'temporal.workflow_id': result.workflowId,
      'temporal.run_id': result.runId,
      'social.platform': platform,
      'social.post_id': postId
    });

    logger.info('Publish workflow started', {
      workflowId: result.workflowId,
      postId,
      platform,
      status: result.status
    });

    res.json({
      postId,
      workflowId: result.workflowId,
      runId: result.runId,
      status: result.status,
      scheduledAt: scheduleAt
    });

  } catch (error: any) {
    span.recordException(error);
    logger.error('Failed to start publish workflow', error);
    
    otel.errorRate.add(1, {
      platform: req.body.platform || 'unknown',
      error_type: 'workflow_start_failed'
    });
    
    res.status(500).json({ 
      error: 'Failed to start publish workflow',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    span.end();
  }
});

// Get workflow status
temporalRouter.get('/workflows/:workflowId', authenticate, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const creatorId = (req as any).user.creatorId;

    // Verify ownership
    const post = await db.query(`
      SELECT id, platform, status, workflow_status, created_at
      FROM posts 
      WHERE workflow_id = $1 AND creator_id = $2
    `, [workflowId, creatorId]);

    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const client = await getPublishClient();
    const status = await client.getWorkflowStatus(workflowId);

    res.json({
      ...status,
      post: post.rows[0]
    });

  } catch (error: any) {
    logger.error('Failed to get workflow status', { workflowId: req.params.workflowId, error });
    res.status(500).json({ error: 'Failed to get workflow status' });
  }
});

// Cancel workflow
temporalRouter.post('/workflows/:workflowId/cancel', authenticate, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { reason = 'Cancelled by user' } = req.body;
    const creatorId = (req as any).user.creatorId;

    // Verify ownership
    const post = await db.query(`
      SELECT id FROM posts 
      WHERE workflow_id = $1 AND creator_id = $2
    `, [workflowId, creatorId]);

    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const client = await getPublishClient();
    await client.cancelWorkflow(workflowId, reason);

    // Update post status
    await db.query(`
      UPDATE posts 
      SET status = 'cancelled', workflow_status = 'cancelled'
      WHERE workflow_id = $1
    `, [workflowId]);

    logger.info('Workflow cancelled', { workflowId, reason });

    res.json({ 
      success: true,
      workflowId,
      reason 
    });

  } catch (error: any) {
    logger.error('Failed to cancel workflow', { workflowId: req.params.workflowId, error });
    res.status(500).json({ error: 'Failed to cancel workflow' });
  }
});

// Retry workflow
temporalRouter.post('/workflows/:workflowId/retry', authenticate, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const creatorId = (req as any).user.creatorId;

    // Verify ownership
    const post = await db.query(`
      SELECT id FROM posts 
      WHERE workflow_id = $1 AND creator_id = $2
    `, [workflowId, creatorId]);

    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const client = await getPublishClient();
    await client.retryWorkflow(workflowId);

    logger.info('Workflow retry requested', { workflowId });

    res.json({ 
      success: true,
      workflowId 
    });

  } catch (error: any) {
    logger.error('Failed to retry workflow', { workflowId: req.params.workflowId, error });
    res.status(500).json({ error: 'Failed to retry workflow' });
  }
});

// List workflows for creator
temporalRouter.get('/workflows', authenticate, async (req, res) => {
  try {
    const creatorId = (req as any).user.creatorId;
    const { platform, status, limit = 50, offset = 0 } = req.query;

    // Get workflows from database first (faster than Temporal queries)
    let query = `
      SELECT 
        p.id,
        p.workflow_id,
        p.workflow_run_id,
        p.platform,
        p.status,
        p.workflow_status,
        p.caption,
        p.created_at,
        p.scheduled_at,
        p.published_at,
        a.handle as account_handle
      FROM posts p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.creator_id = $1 AND p.workflow_id IS NOT NULL
    `;
    
    const params: any[] = [creatorId];
    let paramIndex = 1;

    if (platform) {
      query += ` AND p.platform = $${++paramIndex}`;
      params.push(platform);
    }

    if (status) {
      query += ` AND p.workflow_status = $${++paramIndex}`;
      params.push(status);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${++paramIndex} OFFSET $${++paramIndex}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      workflows: result.rows,
      total: result.rowCount,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

  } catch (error: any) {
    logger.error('Failed to list workflows', error);
    res.status(500).json({ error: 'Failed to list workflows' });
  }
});

// Get workflow history/events
temporalRouter.get('/workflows/:workflowId/history', authenticate, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const creatorId = (req as any).user.creatorId;

    // Verify ownership
    const post = await db.query(`
      SELECT id FROM posts 
      WHERE workflow_id = $1 AND creator_id = $2
    `, [workflowId, creatorId]);

    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Get workflow events from database (faster than Temporal history)
    const events = await db.query(`
      SELECT event_type, data, created_at
      FROM workflow_events 
      WHERE workflow_id = $1
      ORDER BY created_at ASC
    `, [workflowId]);

    // Optionally get full history from Temporal
    if (req.query.full === 'true') {
      try {
        const client = await getPublishClient();
        const temporalHistory = await client.getWorkflowHistory(workflowId);
        
        res.json({
          events: events.rows,
          temporalHistory,
          source: 'combined'
        });
      } catch (error) {
        // Fall back to database events if Temporal is unavailable
        res.json({
          events: events.rows,
          source: 'database',
          note: 'Temporal history unavailable'
        });
      }
    } else {
      res.json({
        events: events.rows,
        source: 'database'
      });
    }

  } catch (error: any) {
    logger.error('Failed to get workflow history', { workflowId: req.params.workflowId, error });
    res.status(500).json({ error: 'Failed to get workflow history' });
  }
});

// Migration status endpoint
temporalRouter.get('/migration/status', authenticate, async (req, res) => {
  try {
    // Get migration status
    const migrationStatus = await db.query(`
      SELECT * FROM migration_status 
      WHERE migration_name = 'bullmq_to_temporal'
      ORDER BY started_at DESC LIMIT 1
    `);

    // Get current stats
    const stats = await db.query(`
      SELECT * FROM v_migration_stats
    `);

    res.json({
      migration: migrationStatus.rows[0] || null,
      currentStats: stats.rows
    });

  } catch (error: any) {
    logger.error('Failed to get migration status', error);
    res.status(500).json({ error: 'Failed to get migration status' });
  }
});

// Rate budget status
temporalRouter.get('/rate-budget/:accountId', authenticate, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { platform = 'instagram' } = req.query;
    const creatorId = (req as any).user.creatorId;

    // Verify account ownership
    const account = await db.query(`
      SELECT id FROM accounts 
      WHERE id = $1 AND creator_id = $2
    `, [accountId, creatorId]);

    if (account.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get rate budget using function
    const budget = await db.query(`
      SELECT * FROM get_rate_budget($1, $2, 1) as hour_budget,
                    get_rate_budget($1, $2, 24) as day_budget
    `, [accountId, platform]);

    res.json({
      accountId,
      platform,
      budget: budget.rows[0]
    });

  } catch (error: any) {
    logger.error('Failed to get rate budget', error);
    res.status(500).json({ error: 'Failed to get rate budget' });
  }
});

// TODO-1: Add bulk workflow operations (cancel multiple, retry multiple)
// TODO-2: Implement workflow search with advanced filters
// TODO-3: Add workflow performance analytics endpoint