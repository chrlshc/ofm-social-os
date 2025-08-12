// KPI-driven auto-repurposing loop
// Runs periodically to analyze performance and trigger reposts

import { Queue } from 'bullmq';
import { db } from '../lib/db';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

interface PostMetrics {
  postId: string;
  creatorId: string;
  publishedAt: Date;
  hoursLive: number;
  impressions: number;
  engagement: number;
  velocity48h: number;
  ctrBio: number;
  sentimentScore: number;
}

interface RepurposeDecision {
  shouldRepost: boolean;
  shouldBoostFormat: boolean;
  reason: string;
  suggestedActions: string[];
}

// Thresholds (should be configurable per creator)
const THRESHOLDS = {
  MIN_VELOCITY_48H: 10, // (likes + comments + shares) per hour
  MIN_CTR_BIO: 0.02, // 2% profile visit rate
  MIN_ENGAGEMENT_RATE: 0.05, // 5% engagement rate
  POSITIVE_SENTIMENT_THRESHOLD: 0.7,
  NEGATIVE_SENTIMENT_THRESHOLD: -0.3,
  MIN_IMPRESSIONS_FOR_DECISION: 100
};

export class KPILoop {
  private variantsQueue: Queue;
  private publishQueue: Queue;

  constructor() {
    this.variantsQueue = new Queue('variants', { connection: redis });
    this.publishQueue = new Queue('publish', { connection: redis });
  }

  async runForCreator(creatorId: string) {
    logger.info(`Running KPI loop for creator ${creatorId}`);

    try {
      // Get posts from last 7 days
      const posts = await this.getRecentPosts(creatorId);
      
      for (const post of posts) {
        const metrics = await this.calculateMetrics(post);
        
        if (metrics.impressions < THRESHOLDS.MIN_IMPRESSIONS_FOR_DECISION) {
          continue; // Not enough data yet
        }

        const decision = this.makeRepurposeDecision(metrics);
        
        // Store KPI snapshot
        await this.storeKPISnapshot(metrics, decision);

        // Execute decisions
        if (decision.shouldRepost) {
          await this.triggerRepost(post, metrics, decision);
        }

        if (decision.shouldBoostFormat) {
          await this.updateAgentMemory(creatorId, post, metrics);
        }
      }

      // Update agent strategy based on overall performance
      await this.updateAgentStrategy(creatorId);

    } catch (error) {
      logger.error('KPI loop error', { creatorId, error });
    }
  }

  private async getRecentPosts(creatorId: string) {
    const result = await db.query(`
      SELECT p.*, a.platform, v.type as variant_type
      FROM posts p
      JOIN accounts a ON p.account_id = a.id
      LEFT JOIN variants v ON p.variant_id = v.id
      WHERE p.creator_id = $1 
        AND p.status = 'live'
        AND p.published_at > NOW() - INTERVAL '7 days'
      ORDER BY p.published_at DESC
    `, [creatorId]);

    return result.rows;
  }

  private async calculateMetrics(post: any): Promise<PostMetrics> {
    // Get latest metrics
    const metricsResult = await db.query(`
      SELECT * FROM metrics 
      WHERE post_id = $1 
      ORDER BY ts DESC 
      LIMIT 1
    `, [post.id]);

    const metrics = metricsResult.rows[0] || {
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      profile_visits: 0
    };

    const hoursLive = (Date.now() - new Date(post.published_at).getTime()) / (1000 * 60 * 60);
    const engagement = metrics.likes + metrics.comments + metrics.shares + metrics.saves;
    
    // Calculate velocity (engagement per hour in first 48h)
    const velocity48h = hoursLive <= 48 
      ? engagement / Math.min(hoursLive, 48)
      : engagement / 48;

    // CTR to bio/profile
    const ctrBio = metrics.impressions > 0 
      ? metrics.profile_visits / metrics.impressions 
      : 0;

    // Get sentiment from comments (simplified - should use NLP)
    const sentimentScore = await this.calculateSentiment(post.id);

    return {
      postId: post.id,
      creatorId: post.creator_id,
      publishedAt: post.published_at,
      hoursLive,
      impressions: metrics.impressions,
      engagement,
      velocity48h,
      ctrBio,
      sentimentScore
    };
  }

  private makeRepurposeDecision(metrics: PostMetrics): RepurposeDecision {
    const decision: RepurposeDecision = {
      shouldRepost: false,
      shouldBoostFormat: false,
      reason: '',
      suggestedActions: []
    };

    // Check velocity
    if (metrics.velocity48h < THRESHOLDS.MIN_VELOCITY_48H) {
      decision.shouldRepost = true;
      decision.reason = 'Low engagement velocity';
      decision.suggestedActions.push('Create micro-edit variants');
      decision.suggestedActions.push('Try different posting time');
    }

    // Check CTR to bio
    if (metrics.ctrBio < THRESHOLDS.MIN_CTR_BIO) {
      decision.shouldRepost = true;
      decision.reason += ' Low profile conversion';
      decision.suggestedActions.push('Improve caption CTA');
    }

    // Check sentiment
    if (metrics.sentimentScore > THRESHOLDS.POSITIVE_SENTIMENT_THRESHOLD) {
      decision.shouldBoostFormat = true;
      decision.reason += ' High positive sentiment';
      decision.suggestedActions.push('Create similar content');
    } else if (metrics.sentimentScore < THRESHOLDS.NEGATIVE_SENTIMENT_THRESHOLD) {
      decision.shouldRepost = false; // Don't repost negative content
      decision.reason = 'Negative sentiment - do not repost';
    }

    // High performing content
    if (metrics.velocity48h > THRESHOLDS.MIN_VELOCITY_48H * 3) {
      decision.shouldBoostFormat = true;
      decision.reason = 'High performing content format';
      decision.suggestedActions.push('Analyze and replicate format');
    }

    return decision;
  }

  private async triggerRepost(post: any, metrics: PostMetrics, decision: RepurposeDecision) {
    logger.info('Triggering repost', { postId: post.id, reason: decision.reason });

    // Create new variants if needed
    if (!post.variant_id) {
      // Queue variant creation
      await this.variantsQueue.add('create_variants', {
        assetId: post.asset_id,
        creatorId: post.creator_id,
        reason: 'kpi_repost'
      });
    }

    // Schedule repost with different parameters
    const repostData = {
      originalPostId: post.id,
      creatorId: post.creator_id,
      accountId: post.account_id,
      variantId: post.variant_id,
      caption: await this.generateImprovedCaption(post, metrics),
      scheduleAt: this.calculateOptimalRepostTime(post),
      isRepost: true
    };

    await this.publishQueue.add('publish_' + post.platform, repostData, {
      delay: 24 * 60 * 60 * 1000 // Wait 24h before reposting
    });
  }

  private async generateImprovedCaption(post: any, metrics: PostMetrics): Promise<string> {
    // This would call the AI agent to generate improved caption
    // For now, return a placeholder
    return post.caption + '\n\n' + '📈 Trending now!';
  }

  private calculateOptimalRepostTime(post: any): Date {
    // Analyze best performing times for this creator
    // For now, schedule 3 days from original post at peak time
    const repostDate = new Date(post.published_at);
    repostDate.setDate(repostDate.getDate() + 3);
    repostDate.setHours(19, 0, 0, 0); // 7 PM
    return repostDate;
  }

  private async calculateSentiment(postId: string): Promise<number> {
    // Simplified sentiment calculation
    // In production, use NLP service to analyze comments
    const result = await db.query(`
      SELECT 
        COUNT(CASE WHEN comment_text ILIKE '%love%' OR comment_text ILIKE '%amazing%' OR comment_text ILIKE '%great%' THEN 1 END) as positive,
        COUNT(CASE WHEN comment_text ILIKE '%hate%' OR comment_text ILIKE '%bad%' OR comment_text ILIKE '%terrible%' THEN 1 END) as negative,
        COUNT(*) as total
      FROM comments
      WHERE post_id = $1
    `, [postId]);

    if (result.rows[0].total === 0) return 0;

    const { positive, negative, total } = result.rows[0];
    return (positive - negative) / total;
  }

  private async storeKPISnapshot(metrics: PostMetrics, decision: RepurposeDecision) {
    await db.query(`
      INSERT INTO kpi_snapshots (
        creator_id, post_id, calculated_at,
        velocity_48h, engagement_rate, ctr_bio, sentiment_score,
        should_repost, should_boost_format
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8)
    `, [
      metrics.creatorId,
      metrics.postId,
      metrics.velocity48h,
      metrics.engagement / Math.max(metrics.impressions, 1),
      metrics.ctrBio,
      metrics.sentimentScore,
      decision.shouldRepost,
      decision.shouldBoostFormat
    ]);
  }

  private async updateAgentMemory(creatorId: string, post: any, metrics: PostMetrics) {
    // Update agent's learned patterns
    await db.query(`
      UPDATE agents
      SET memory = jsonb_set(
        memory,
        '{winning_formats}',
        COALESCE(memory->'winning_formats', '[]'::jsonb) || $1::jsonb
      )
      WHERE creator_id = $2 AND role = 'poster'
    `, [
      JSON.stringify({
        platform: post.platform,
        variantType: post.variant_type,
        timeOfDay: new Date(post.published_at).getHours(),
        dayOfWeek: new Date(post.published_at).getDay(),
        velocity48h: metrics.velocity48h,
        captionLength: post.caption.length,
        hashtagCount: post.hashtags?.length || 0
      }),
      creatorId
    ]);
  }

  private async updateAgentStrategy(creatorId: string) {
    // Analyze overall performance and update agent strategy
    const result = await db.query(`
      SELECT 
        AVG(velocity_48h) as avg_velocity,
        AVG(ctr_bio) as avg_ctr,
        AVG(sentiment_score) as avg_sentiment,
        COUNT(CASE WHEN should_repost THEN 1 END) as repost_count,
        COUNT(*) as total_posts
      FROM kpi_snapshots
      WHERE creator_id = $1 
        AND calculated_at > NOW() - INTERVAL '7 days'
    `, [creatorId]);

    const stats = result.rows[0];
    const repostRate = stats.repost_count / stats.total_posts;

    // Update agent config based on performance
    const newConfig = {
      aggressive_mode: repostRate > 0.3,
      focus_on_engagement: stats.avg_velocity < THRESHOLDS.MIN_VELOCITY_48H,
      optimize_for_conversions: stats.avg_ctr < THRESHOLDS.MIN_CTR_BIO
    };

    await db.query(`
      UPDATE agents
      SET config = config || $1::jsonb
      WHERE creator_id = $2
    `, [JSON.stringify(newConfig), creatorId]);
  }
}

// Worker that runs periodically
export async function runKPIWorker() {
  const kpiLoop = new KPILoop();
  
  // Get all active creators
  const result = await db.query(`
    SELECT DISTINCT c.id 
    FROM creators c
    JOIN agents a ON c.id = a.creator_id
    WHERE a.status = 'active'
  `);

  for (const creator of result.rows) {
    await kpiLoop.runForCreator(creator.id);
  }
}