import axios from 'axios';

const KPI_API_URL = process.env.KPI_API_URL || 'http://localhost:3000/api/kpi';

interface KpiMetric {
  modelName: string;
  metricName: string;
  value: number;
  platform?: string;
  campaignId?: string;
  metadata?: Record<string, any>;
}

class KpiIngestionService {
  private queue: KpiMetric[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_DELAY = 5000; // 5 secondes
  
  async ingest(metric: KpiMetric) {
    this.queue.push(metric);
    
    if (this.queue.length >= this.BATCH_SIZE) {
      await this.flush();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flush(), this.BATCH_DELAY);
    }
  }
  
  async flush() {
    if (this.queue.length === 0) return;
    
    const batch = [...this.queue];
    this.queue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    try {
      await axios.post(`${KPI_API_URL}/ingest/batch`, batch);
      console.log(`Ingested ${batch.length} KPI metrics`);
    } catch (error) {
      console.error('Failed to ingest KPI batch:', error);
      // Remettre dans la queue en cas d'échec
      this.queue.unshift(...batch);
    }
  }
}

export const kpiService = new KpiIngestionService();

// Hooks pour les opérations marketing
export async function trackPublishMetrics(data: {
  platform: string;
  campaignId?: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}) {
  await kpiService.ingest({
    modelName: 'marketing',
    metricName: 'publish_latency_ms',
    value: data.latencyMs,
    platform: data.platform,
    campaignId: data.campaignId,
    metadata: { success: data.success, error: data.error }
  });
  
  if (!data.success) {
    await kpiService.ingest({
      modelName: 'marketing',
      metricName: 'publish_errors_total',
      value: 1,
      platform: data.platform,
      campaignId: data.campaignId,
      metadata: { error: data.error }
    });
  }
}

export async function trackContentPerformance(data: {
  platform: string;
  campaignId: string;
  contentId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
}) {
  const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
  const conversionRate = data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0;
  const cpl = data.conversions > 0 ? data.cost / data.conversions : 0;
  
  await Promise.all([
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'impressions',
      value: data.impressions,
      platform: data.platform,
      campaignId: data.campaignId,
      metadata: { contentId: data.contentId }
    }),
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'clicks',
      value: data.clicks,
      platform: data.platform,
      campaignId: data.campaignId,
      metadata: { contentId: data.contentId }
    }),
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'ctr',
      value: ctr,
      platform: data.platform,
      campaignId: data.campaignId,
      metadata: { contentId: data.contentId }
    }),
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'conversion_rate',
      value: conversionRate,
      platform: data.platform,
      campaignId: data.campaignId,
      metadata: { contentId: data.contentId }
    }),
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'cpl',
      value: cpl,
      platform: data.platform,
      campaignId: data.campaignId,
      metadata: { contentId: data.contentId }
    })
  ]);
}

export async function trackLLMUsage(data: {
  operation: string;
  tokensUsed: number;
  cost: number;
  duration: number;
  success: boolean;
}) {
  await Promise.all([
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'llm_tokens_used',
      value: data.tokensUsed,
      metadata: { operation: data.operation }
    }),
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'llm_cost_total',
      value: data.cost,
      metadata: { operation: data.operation }
    }),
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'llm_duration_ms',
      value: data.duration,
      metadata: { operation: data.operation, success: data.success }
    })
  ]);
}

export async function trackEngagement(data: {
  platform: string;
  contentId: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  watchTime?: number;
}) {
  const engagementRate = data.views > 0 
    ? ((data.likes + data.comments + data.shares) / data.views) * 100 
    : 0;
  
  await Promise.all([
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'engagement_rate',
      value: engagementRate,
      platform: data.platform,
      metadata: { 
        contentId: data.contentId,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares
      }
    }),
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'views',
      value: data.views,
      platform: data.platform,
      metadata: { contentId: data.contentId }
    })
  ]);
  
  if (data.watchTime !== undefined) {
    await kpiService.ingest({
      modelName: 'marketing',
      metricName: 'avg_watch_time',
      value: data.watchTime,
      platform: data.platform,
      metadata: { contentId: data.contentId }
    });
  }
}

// Middleware Express pour tracker automatiquement les métriques API
export function kpiTrackingMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path;
    
    kpiService.ingest({
      modelName: 'marketing',
      metricName: 'api_request_duration',
      value: duration,
      metadata: {
        method: req.method,
        route,
        statusCode: res.statusCode,
        success: res.statusCode < 400
      }
    });
  });
  
  next();
}

// Nettoyer à la fermeture
process.on('SIGINT', async () => {
  await kpiService.flush();
  process.exit();
});