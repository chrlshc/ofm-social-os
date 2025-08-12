import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { validatePublishRequest } from '../validators/publish';

export const publishRouter = Router();

// Create queues with rate limiting per token
const publishQueue = new Queue('publish', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
    removeOnComplete: true,
    removeOnFail: false,
  }
});

// POST /publish
publishRouter.post('/', async (req: Request, res: Response) => {
  try {
    const validation = validatePublishRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { platform, accountId, assetId, variantId, caption, scheduleAt, hashtags, mentions, location } = req.body;
    const creatorId = (req as any).user.creatorId;

    // Verify account ownership
    const accountResult = await db.query(`
      SELECT a.*, t.id as token_id, t.access_token 
      FROM accounts a
      JOIN tokens t ON a.token_id = t.id
      WHERE a.id = $1 AND a.creator_id = $2
    `, [accountId, creatorId]);

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accountResult.rows[0];
    if (account.platform !== platform) {
      return res.status(400).json({ error: 'Platform mismatch' });
    }

    // Get variant details
    let variant;
    if (variantId) {
      const variantResult = await db.query(`
        SELECT v.*, a.creator_id 
        FROM variants v
        JOIN assets a ON v.asset_id = a.id
        WHERE v.id = $1 AND a.creator_id = $2
      `, [variantId, creatorId]);

      if (variantResult.rows.length === 0) {
        return res.status(404).json({ error: 'Variant not found' });
      }
      variant = variantResult.rows[0];
    }

    // Create post record
    const postId = uuidv4();
    await db.query(`
      INSERT INTO posts (
        id, creator_id, account_id, variant_id, platform, status,
        caption, hashtags, mentions, location, scheduled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      postId,
      creatorId,
      accountId,
      variantId,
      platform,
      scheduleAt ? 'queued' : 'publishing',
      caption,
      hashtags || [],
      mentions || [],
      location ? JSON.stringify(location) : null,
      scheduleAt
    ]);

    // Queue the job
    const jobData = {
      postId,
      platform,
      accountId: account.id,
      tokenId: account.token_id,
      accessToken: account.access_token,
      accountMeta: account.meta,
      variantUrl: variant?.s3_url,
      caption,
      hashtags,
      mentions,
      location
    };

    const job = await publishQueue.add(
      `publish_${platform}`,
      jobData,
      {
        delay: scheduleAt ? new Date(scheduleAt).getTime() - Date.now() : 0,
        priority: scheduleAt ? 5 : 1, // Higher priority for immediate posts
        // Rate limit per token
        jobId: `${postId}_${Date.now()}`,
      }
    );

    logger.info(`Queued publish job for ${platform}`, { postId, jobId: job.id });

    res.json({
      postId,
      status: scheduleAt ? 'queued' : 'publishing',
      scheduledAt: scheduleAt,
      jobId: job.id
    });

  } catch (error) {
    logger.error('Publish error', error);
    res.status(500).json({ error: 'Failed to queue post' });
  }
});

// GET /publish/:postId - Get post status
publishRouter.get('/:postId', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const creatorId = (req as any).user.creatorId;

    const result = await db.query(`
      SELECT p.*, a.platform, a.handle,
        v.s3_url as variant_url, v.type as variant_type
      FROM posts p
      JOIN accounts a ON p.account_id = a.id
      LEFT JOIN variants v ON p.variant_id = v.id
      WHERE p.id = $1 AND p.creator_id = $2
    `, [postId, creatorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = result.rows[0];

    // Get latest metrics if published
    let metrics;
    if (post.status === 'live' && post.remote_id) {
      const metricsResult = await db.query(`
        SELECT * FROM metrics 
        WHERE post_id = $1 
        ORDER BY ts DESC 
        LIMIT 1
      `, [postId]);
      
      if (metricsResult.rows.length > 0) {
        metrics = metricsResult.rows[0];
      }
    }

    res.json({
      ...post,
      metrics
    });

  } catch (error) {
    logger.error('Get post error', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// DELETE /publish/:postId - Cancel scheduled post
publishRouter.delete('/:postId', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const creatorId = (req as any).user.creatorId;

    const result = await db.query(`
      UPDATE posts 
      SET status = 'cancelled'
      WHERE id = $1 AND creator_id = $2 AND status = 'queued'
      RETURNING id
    `, [postId, creatorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found or cannot be cancelled' });
    }

    // TODO: Remove from queue

    res.json({ success: true });

  } catch (error) {
    logger.error('Cancel post error', error);
    res.status(500).json({ error: 'Failed to cancel post' });
  }
});