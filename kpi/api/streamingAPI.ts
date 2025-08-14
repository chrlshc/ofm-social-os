/**
 * API REST pour l'ingestion streaming de métriques KPI via NATS
 */

import { Router, Request, Response } from 'express';
import { NatsStreamingClient, KpiMetricEvent } from '../streaming/natsClient';
import { StreamingETLProcessor } from '../streaming/streamingETL';
import { asyncHandler, createError } from '../utils/errorHandler';
import { SecurityInstrumentation } from '../monitoring/instrumentation';
import * as yup from 'yup';

// Schémas de validation pour l'API streaming
const metricEventSchema = yup.object({
  modelName: yup.string().required().oneOf(['marketing', 'onboarding', 'payment']),
  metricName: yup.string().required().matches(/^[a-zA-Z0-9_]+$/),
  value: yup.number().required().min(0),
  platform: yup.string().optional().oneOf(['instagram', 'tiktok', 'x', 'reddit', 'linkedin', 'youtube']),
  campaignId: yup.string().optional(),
  metadata: yup.object().optional(),
  timestamp: yup.string().optional().default(() => new Date().toISOString()),
  source: yup.string().optional().default('api')
});

const batchMetricsSchema = yup.object({
  metrics: yup.array().of(metricEventSchema).required().min(1).max(1000),
  batchId: yup.string().optional(),
  priority: yup.string().optional().oneOf(['low', 'normal', 'high']).default('normal')
});

export interface StreamingAPIConfig {
  maxBatchSize: number;
  rateLimitPerMinute: number;
  enableDeduplication: boolean;
  requireAuthentication: boolean;
}

export class StreamingAPI {
  private router: Router;
  private security = SecurityInstrumentation.instrumentSecurityMiddleware();

  constructor(
    private natsClient: NatsStreamingClient,
    private etlProcessor: StreamingETLProcessor | null,
    private config: StreamingAPIConfig
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Publier une métrique individuelle
    this.router.post('/metrics', asyncHandler(async (req: Request, res: Response) => {
      await this.publishSingleMetric(req, res);
    }));

    // Publier un batch de métriques
    this.router.post('/metrics/batch', asyncHandler(async (req: Request, res: Response) => {
      await this.publishBatchMetrics(req, res);
    }));

    // Webhook pour ingestion externe
    this.router.post('/webhook/:source', asyncHandler(async (req: Request, res: Response) => {
      await this.handleWebhook(req, res);
    }));

    // Statistiques en temps réel
    this.router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
      await this.getStreamingStats(req, res);
    }));

    // Health check de l'infrastructure streaming
    this.router.get('/health', asyncHandler(async (req: Request, res: Response) => {
      await this.getStreamingHealth(req, res);
    }));

    // Informations des streams NATS
    this.router.get('/streams', asyncHandler(async (req: Request, res: Response) => {
      await this.getStreamInfo(req, res);
    }));

    // Contrôle des consommateurs
    this.router.post('/consumers/:action', asyncHandler(async (req: Request, res: Response) => {
      await this.controlConsumers(req, res);
    }));

    // Dead letter queue management
    this.router.get('/deadletter', asyncHandler(async (req: Request, res: Response) => {
      await this.getDeadLetterQueue(req, res);
    }));

    this.router.post('/deadletter/reprocess', asyncHandler(async (req: Request, res: Response) => {
      await this.reprocessDeadLetters(req, res);
    }));
  }

  /**
   * Publier une métrique individuelle
   */
  private async publishSingleMetric(req: Request, res: Response): Promise<void> {
    const endTimer = this.security.timeRequest(req.method, '/metrics');

    try {
      // Validation
      const validatedData = await metricEventSchema.validate(req.body, { stripUnknown: true });
      
      // Créer l'événement
      const metricEvent: KpiMetricEvent = {
        id: `${validatedData.modelName}_${validatedData.metricName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...validatedData,
        timestamp: validatedData.timestamp || new Date().toISOString()
      };

      // Déterminer le sujet NATS
      const subject = this.getSubjectForMetric(metricEvent);

      // Publier
      await this.natsClient.publishMetric(subject, metricEvent);

      // Réponse
      res.status(202).json({
        success: true,
        message: 'Metric published successfully',
        data: {
          id: metricEvent.id,
          subject,
          timestamp: metricEvent.timestamp
        }
      });

      this.security.requestProcessed(req.method, 202, true);

    } catch (error) {
      this.security.requestProcessed(req.method, 400, false);
      
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid metric data: ${error.message}`);
      }
      
      throw createError.internal(`Failed to publish metric: ${error}`);
    } finally {
      endTimer();
    }
  }

  /**
   * Publier un batch de métriques
   */
  private async publishBatchMetrics(req: Request, res: Response): Promise<void> {
    const endTimer = this.security.timeRequest(req.method, '/metrics/batch');

    try {
      // Validation
      const validatedData = await batchMetricsSchema.validate(req.body, { stripUnknown: true });
      
      if (validatedData.metrics.length > this.config.maxBatchSize) {
        throw createError.validation(`Batch size too large: ${validatedData.metrics.length} > ${this.config.maxBatchSize}`);
      }

      // Créer les événements avec IDs uniques
      const batchId = validatedData.batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const metricEvents: KpiMetricEvent[] = validatedData.metrics.map((metric, index) => ({
        id: `${batchId}_${index}`,
        ...metric,
        timestamp: metric.timestamp || new Date().toISOString()
      }));

      // Grouper par sujet pour optimiser la publication
      const subjectGroups = new Map<string, KpiMetricEvent[]>();
      metricEvents.forEach(event => {
        const subject = this.getSubjectForMetric(event);
        if (!subjectGroups.has(subject)) {
          subjectGroups.set(subject, []);
        }
        subjectGroups.get(subject)!.push(event);
      });

      // Publier par groupe
      const publishResults = [];
      for (const [subject, events] of subjectGroups.entries()) {
        try {
          await this.natsClient.publishBatch(subject, events);
          publishResults.push({
            subject,
            count: events.length,
            status: 'success'
          });
        } catch (error) {
          publishResults.push({
            subject,
            count: events.length,
            status: 'error',
            error: error.message
          });
        }
      }

      // Réponse
      const totalPublished = publishResults
        .filter(r => r.status === 'success')
        .reduce((sum, r) => sum + r.count, 0);

      res.status(202).json({
        success: true,
        message: `Batch published: ${totalPublished}/${metricEvents.length} metrics`,
        data: {
          batchId,
          totalMetrics: metricEvents.length,
          publishedMetrics: totalPublished,
          results: publishResults,
          priority: validatedData.priority
        }
      });

      this.security.requestProcessed(req.method, 202, true);

    } catch (error) {
      this.security.requestProcessed(req.method, 400, false);
      
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid batch data: ${error.message}`);
      }
      
      throw createError.internal(`Failed to publish batch: ${error}`);
    } finally {
      endTimer();
    }
  }

  /**
   * Gérer les webhooks d'ingestion externe
   */
  private async handleWebhook(req: Request, res: Response): Promise<void> {
    const source = req.params.source;
    const endTimer = this.security.timeRequest(req.method, `/webhook/${source}`);

    try {
      // Transformer les données selon la source
      const metrics = await this.transformWebhookData(source, req.body);

      if (metrics.length === 0) {
        throw createError.validation('No valid metrics found in webhook payload');
      }

      // Publier les métriques transformées
      const subject = `kpi.webhook.${source}`;
      await this.natsClient.publishBatch(subject, metrics);

      res.status(202).json({
        success: true,
        message: `Webhook processed: ${metrics.length} metrics from ${source}`,
        data: {
          source,
          metricsCount: metrics.length,
          timestamp: new Date().toISOString()
        }
      });

      this.security.requestProcessed(req.method, 202, true);

    } catch (error) {
      this.security.requestProcessed(req.method, 400, false);
      throw createError.internal(`Webhook processing failed: ${error}`);
    } finally {
      endTimer();
    }
  }

  /**
   * Obtenir les statistiques streaming
   */
  private async getStreamingStats(req: Request, res: Response): Promise<void> {
    try {
      const natsMetrics = this.natsClient.getMetrics();
      const etlStats = this.etlProcessor?.getMetrics() || null;
      
      const stats = {
        nats: natsMetrics,
        etl: etlStats,
        api: {
          maxBatchSize: this.config.maxBatchSize,
          rateLimitPerMinute: this.config.rateLimitPerMinute
        },
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      throw createError.internal(`Failed to get stats: ${error}`);
    }
  }

  /**
   * Health check de l'infrastructure streaming
   */
  private async getStreamingHealth(req: Request, res: Response): Promise<void> {
    try {
      const natsHealth = await this.natsClient.healthCheck();
      const etlHealth = this.etlProcessor ? await this.etlProcessor.healthCheck() : null;
      
      const overall = (natsHealth.status === 'healthy' && 
                      (etlHealth?.status === 'healthy' || etlHealth?.status === 'degraded')) 
                     ? 'healthy' : 'unhealthy';

      const health = {
        status: overall,
        components: {
          nats: natsHealth,
          etl: etlHealth
        },
        timestamp: new Date().toISOString()
      };

      const statusCode = overall === 'healthy' ? 200 : 503;
      res.status(statusCode).json({
        success: overall === 'healthy',
        data: health
      });

    } catch (error) {
      res.status(503).json({
        success: false,
        error: 'Health check failed',
        details: error.message
      });
    }
  }

  /**
   * Obtenir les informations des streams
   */
  private async getStreamInfo(req: Request, res: Response): Promise<void> {
    try {
      const streamNames = ['KPI_METRICS', 'KPI_ALERTS', 'KPI_INSIGHTS'];
      const streamInfos = [];

      for (const streamName of streamNames) {
        try {
          const info = await this.natsClient.getStreamInfo(streamName);
          streamInfos.push(info);
        } catch (error) {
          streamInfos.push({
            name: streamName,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        data: {
          streams: streamInfos,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      throw createError.internal(`Failed to get stream info: ${error}`);
    }
  }

  /**
   * Contrôler les consommateurs (pause/resume)
   */
  private async controlConsumers(req: Request, res: Response): Promise<void> {
    const action = req.params.action;
    
    if (!['pause', 'resume', 'restart'].includes(action)) {
      throw createError.validation(`Invalid action: ${action}`);
    }

    try {
      // Cette fonctionnalité nécessiterait une extension du StreamingETLProcessor
      // Pour l'instant, on retourne les informations des consommateurs
      
      res.json({
        success: true,
        message: `Consumer ${action} initiated`,
        data: {
          action,
          timestamp: new Date().toISOString(),
          note: 'Consumer control implementation pending'
        }
      });

    } catch (error) {
      throw createError.internal(`Failed to ${action} consumers: ${error}`);
    }
  }

  /**
   * Obtenir les métriques en dead letter queue
   */
  private async getDeadLetterQueue(req: Request, res: Response): Promise<void> {
    try {
      // Récupérer les informations du stream dead letter
      const deadLetterInfo = await this.natsClient.getStreamInfo('KPI_DEADLETTER');
      
      res.json({
        success: true,
        data: {
          deadLetterQueue: deadLetterInfo,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      // Le stream dead letter n'existe peut-être pas encore
      res.json({
        success: true,
        data: {
          deadLetterQueue: { messages: 0, bytes: 0 },
          note: 'Dead letter stream not found or empty',
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Reprocesser les messages en dead letter
   */
  private async reprocessDeadLetters(req: Request, res: Response): Promise<void> {
    try {
      // Implementation pour republier les messages dead letter
      // Cette fonctionnalité nécessiterait un consommateur spécialisé
      
      res.json({
        success: true,
        message: 'Dead letter reprocessing initiated',
        data: {
          timestamp: new Date().toISOString(),
          note: 'Reprocessing implementation pending'
        }
      });

    } catch (error) {
      throw createError.internal(`Failed to reprocess dead letters: ${error}`);
    }
  }

  /**
   * Déterminer le sujet NATS pour une métrique
   */
  private getSubjectForMetric(metric: KpiMetricEvent): string {
    const priority = this.getMetricPriority(metric);
    return `kpi.metrics.${metric.modelName}.${priority}`;
  }

  /**
   * Déterminer la priorité d'une métrique
   */
  private getMetricPriority(metric: KpiMetricEvent): string {
    // Métriques critiques
    const criticalMetrics = ['conversion_rate', 'payment_success', 'churn_rate'];
    if (criticalMetrics.includes(metric.metricName)) {
      return 'critical';
    }

    // Métriques importantes
    const importantMetrics = ['ctr', 'cpl', 'engagement_rate'];
    if (importantMetrics.includes(metric.metricName)) {
      return 'important';
    }

    return 'normal';
  }

  /**
   * Transformer les données de webhook selon la source
   */
  private async transformWebhookData(source: string, payload: any): Promise<KpiMetricEvent[]> {
    const metrics: KpiMetricEvent[] = [];

    switch (source) {
      case 'facebook':
        // Transformer les données Facebook Ads
        if (payload.data && Array.isArray(payload.data)) {
          for (const item of payload.data) {
            if (item.insights) {
              metrics.push({
                id: `fb_${item.id}_${Date.now()}`,
                modelName: 'marketing',
                metricName: 'ctr',
                value: parseFloat(item.insights.ctr) || 0,
                platform: 'facebook',
                campaignId: item.campaign_id,
                timestamp: new Date().toISOString(),
                source: 'facebook_webhook',
                metadata: {
                  adset_id: item.adset_id,
                  ad_id: item.id
                }
              });
            }
          }
        }
        break;

      case 'google':
        // Transformer les données Google Ads
        // Implementation spécifique à Google
        break;

      case 'stripe':
        // Transformer les événements Stripe
        if (payload.type === 'payment_intent.succeeded') {
          metrics.push({
            id: `stripe_${payload.data.object.id}`,
            modelName: 'payment',
            metricName: 'payment_success',
            value: payload.data.object.amount / 100, // Convert cents to euros
            timestamp: new Date(payload.data.object.created * 1000).toISOString(),
            source: 'stripe_webhook',
            metadata: {
              payment_method: payload.data.object.payment_method_types[0],
              currency: payload.data.object.currency
            }
          });
        }
        break;

      default:
        // Format générique
        if (Array.isArray(payload.metrics)) {
          for (const metric of payload.metrics) {
            if (metric.modelName && metric.metricName && typeof metric.value === 'number') {
              metrics.push({
                id: `${source}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                ...metric,
                timestamp: metric.timestamp || new Date().toISOString(),
                source: `${source}_webhook`
              });
            }
          }
        }
        break;
    }

    return metrics;
  }

  /**
   * Obtenir le router Express
   */
  getRouter(): Router {
    return this.router;
  }
}

/**
 * Configuration par défaut de l'API streaming
 */
export const DEFAULT_STREAMING_API_CONFIG: StreamingAPIConfig = {
  maxBatchSize: 1000,
  rateLimitPerMinute: 10000,
  enableDeduplication: true,
  requireAuthentication: true
};

/**
 * Factory pour créer l'API streaming
 */
export function createStreamingAPI(
  natsClient: NatsStreamingClient,
  etlProcessor: StreamingETLProcessor | null,
  config?: Partial<StreamingAPIConfig>
): StreamingAPI {
  const finalConfig = { ...DEFAULT_STREAMING_API_CONFIG, ...config };
  return new StreamingAPI(natsClient, etlProcessor, finalConfig);
}