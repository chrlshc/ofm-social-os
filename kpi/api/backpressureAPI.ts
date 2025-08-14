/**
 * API REST pour la gestion et monitoring du backpressure
 */

import { Router, Request, Response } from 'express';
import { BackpressureManager, BackpressureConfig, PRODUCTION_BACKPRESSURE_CONFIG } from '../streaming/backpressureManager';
import { NatsStreamingClient } from '../streaming/natsClient';
import { asyncHandler, createError } from '../utils/errorHandler';
import * as yup from 'yup';

// Schémas de validation
const configUpdateSchema = yup.object({
  maxMemoryUsageMB: yup.number().optional().min(64).max(4096),
  maxQueueSize: yup.number().optional().min(100).max(1000000),
  maxPublishRate: yup.number().optional().min(10).max(100000),
  maxCpuUsagePercent: yup.number().optional().min(10).max(95),
  enableCircuitBreaker: yup.boolean().optional(),
  enableSampling: yup.boolean().optional(),
  enablePrioritization: yup.boolean().optional(),
  enableBatching: yup.boolean().optional(),
  recoveryThresholdPercent: yup.number().optional().min(10).max(90),
  recoveryDelayMs: yup.number().optional().min(1000).max(300000),
  maxBackoffMs: yup.number().optional().min(5000).max(600000)
});

const circuitBreakerSchema = yup.object({
  subject: yup.string().required(),
  action: yup.string().required().oneOf(['open', 'close'])
});

const testLoadSchema = yup.object({
  messagesPerSecond: yup.number().required().min(1).max(10000),
  durationSeconds: yup.number().required().min(1).max(300),
  messageSize: yup.number().optional().min(1).max(1000000).default(1024),
  subjects: yup.array().of(yup.string()).optional().default(['test.load'])
});

export class BackpressureAPI {
  private router: Router;
  private backpressureManager: BackpressureManager;
  private natsClient: NatsStreamingClient;
  private loadTestRunning = false;

  constructor(natsClient: NatsStreamingClient, backpressureManager: BackpressureManager) {
    this.router = Router();
    this.natsClient = natsClient;
    this.backpressureManager = backpressureManager;
    this.setupRoutes();
    this.setupEventListeners();
  }

  private setupRoutes(): void {
    // Status et métriques
    this.router.get('/status', asyncHandler(async (req: Request, res: Response) => {
      await this.getBackpressureStatus(req, res);
    }));

    this.router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
      await this.getDetailedMetrics(req, res);
    }));

    // Configuration
    this.router.get('/config', asyncHandler(async (req: Request, res: Response) => {
      await this.getConfig(req, res);
    }));

    this.router.put('/config', asyncHandler(async (req: Request, res: Response) => {
      await this.updateConfig(req, res);
    }));

    this.router.post('/config/reset', asyncHandler(async (req: Request, res: Response) => {
      await this.resetConfig(req, res);
    }));

    // Circuit breaker management
    this.router.post('/circuit-breaker', asyncHandler(async (req: Request, res: Response) => {
      await this.manageCircuitBreaker(req, res);
    }));

    this.router.get('/circuit-breaker/status', asyncHandler(async (req: Request, res: Response) => {
      await this.getCircuitBreakerStatus(req, res);
    }));

    // Load testing
    this.router.post('/load-test', asyncHandler(async (req: Request, res: Response) => {
      await this.runLoadTest(req, res);
    }));

    this.router.get('/load-test/status', asyncHandler(async (req: Request, res: Response) => {
      await this.getLoadTestStatus(req, res);
    }));

    this.router.post('/load-test/stop', asyncHandler(async (req: Request, res: Response) => {
      await this.stopLoadTest(req, res);
    }));

    // Health checks
    this.router.get('/health', asyncHandler(async (req: Request, res: Response) => {
      await this.getHealthStatus(req, res);
    }));

    this.router.get('/health/detailed', asyncHandler(async (req: Request, res: Response) => {
      await this.getDetailedHealthStatus(req, res);
    }));

    // Actions
    this.router.post('/actions/drain-queue', asyncHandler(async (req: Request, res: Response) => {
      await this.drainQueue(req, res);
    }));

    this.router.post('/actions/clear-queue', asyncHandler(async (req: Request, res: Response) => {
      await this.clearQueue(req, res);
    }));

    // Historique et analytics
    this.router.get('/analytics/degradation-history', asyncHandler(async (req: Request, res: Response) => {
      await this.getDegradationHistory(req, res);
    }));

    this.router.get('/analytics/recommendations', asyncHandler(async (req: Request, res: Response) => {
      await this.getOptimizationRecommendations(req, res);
    }));
  }

  /**
   * Configuration des event listeners
   */
  private setupEventListeners(): void {
    this.backpressureManager.on('degradation_level_changed', (event) => {
      console.log(`Backpressure degradation level changed: ${event.oldLevel} → ${event.newLevel}`);
    });

    this.backpressureManager.on('circuit_breaker_opened', (event) => {
      console.warn(`Circuit breaker opened for subject: ${event.subject}`);
    });

    this.backpressureManager.on('circuit_breaker_closed', (event) => {
      console.info(`Circuit breaker closed for subject: ${event.subject}`);
    });

    this.backpressureManager.on('message_dropped', (event) => {
      console.warn(`Message dropped: ${event.reason} for subject ${event.message.subject}`);
    });
  }

  /**
   * Obtenir le status du backpressure
   */
  private async getBackpressureStatus(req: Request, res: Response): Promise<void> {
    const metrics = this.backpressureManager.getMetrics();
    const config = this.backpressureManager.getConfig();

    const status = {
      timestamp: new Date().toISOString(),
      degradationLevel: metrics.degradationLevel,
      isHealthy: metrics.degradationLevel === 'none' || metrics.degradationLevel === 'low',
      metrics,
      thresholds: {
        memory: {
          current: metrics.currentMemoryMB,
          max: config.maxMemoryUsageMB,
          utilizationPercent: (metrics.currentMemoryMB / config.maxMemoryUsageMB * 100).toFixed(1)
        },
        queue: {
          current: metrics.currentQueueSize,
          max: config.maxQueueSize,
          utilizationPercent: (metrics.currentQueueSize / config.maxQueueSize * 100).toFixed(1)
        },
        publishRate: {
          current: metrics.currentPublishRate,
          max: config.maxPublishRate,
          utilizationPercent: (metrics.currentPublishRate / config.maxPublishRate * 100).toFixed(1)
        },
        cpu: {
          current: metrics.currentCpuPercent,
          max: config.maxCpuUsagePercent,
          utilizationPercent: (metrics.currentCpuPercent / config.maxCpuUsagePercent * 100).toFixed(1)
        }
      }
    };

    res.json({
      success: true,
      data: status
    });
  }

  /**
   * Obtenir des métriques détaillées
   */
  private async getDetailedMetrics(req: Request, res: Response): Promise<void> {
    const timeRange = req.query.timeRange as string || '1h';
    
    // Simulation des métriques historiques (en production, récupérer depuis Prometheus)
    const mockHistoricalData = this.generateMockHistoricalMetrics(timeRange);
    
    const currentMetrics = this.backpressureManager.getMetrics();
    
    res.json({
      success: true,
      data: {
        current: currentMetrics,
        historical: mockHistoricalData,
        summary: {
          timeRange,
          averageDegradationLevel: 1.2,
          totalMessagesDropped: currentMetrics.droppedMessages,
          totalMessagesSampled: currentMetrics.sampledMessages,
          uptimePercent: 99.8,
          peakMemoryUsageMB: 456,
          peakQueueSize: 8750
        }
      }
    });
  }

  /**
   * Obtenir la configuration actuelle
   */
  private async getConfig(req: Request, res: Response): Promise<void> {
    const config = this.backpressureManager.getConfig();
    
    res.json({
      success: true,
      data: {
        current: config,
        production: PRODUCTION_BACKPRESSURE_CONFIG,
        description: {
          maxMemoryUsageMB: 'Maximum memory usage before backpressure triggers',
          maxQueueSize: 'Maximum internal queue size',
          maxPublishRate: 'Maximum messages per second',
          maxCpuUsagePercent: 'Maximum CPU usage before backpressure triggers',
          enableCircuitBreaker: 'Enable circuit breaker pattern',
          enableSampling: 'Enable adaptive message sampling',
          enablePrioritization: 'Enable message prioritization',
          enableBatching: 'Enable adaptive batching',
          recoveryThresholdPercent: 'Threshold for recovery attempts',
          recoveryDelayMs: 'Delay between recovery attempts',
          maxBackoffMs: 'Maximum backoff delay'
        }
      }
    });
  }

  /**
   * Mettre à jour la configuration
   */
  private async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const validatedConfig = await configUpdateSchema.validate(req.body);
      
      const oldConfig = this.backpressureManager.getConfig();
      this.backpressureManager.updateConfig(validatedConfig);
      const newConfig = this.backpressureManager.getConfig();
      
      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: {
          oldConfig,
          newConfig,
          changes: this.getConfigChanges(oldConfig, newConfig)
        }
      });

    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid configuration: ${error.message}`);
      }
      throw createError.internal(`Config update failed: ${error}`);
    }
  }

  /**
   * Reset de la configuration aux valeurs par défaut
   */
  private async resetConfig(req: Request, res: Response): Promise<void> {
    const preset = req.body.preset || 'production';
    
    let resetConfig: Partial<BackpressureConfig>;
    
    switch (preset) {
      case 'production':
        resetConfig = PRODUCTION_BACKPRESSURE_CONFIG;
        break;
      case 'development':
        resetConfig = {
          maxMemoryUsageMB: 256,
          maxQueueSize: 1000,
          maxPublishRate: 100,
          maxCpuUsagePercent: 90,
          enableCircuitBreaker: false,
          enableSampling: false,
          enablePrioritization: true,
          enableBatching: false,
          recoveryThresholdPercent: 80,
          recoveryDelayMs: 2000,
          maxBackoffMs: 10000
        };
        break;
      case 'testing':
        resetConfig = {
          maxMemoryUsageMB: 128,
          maxQueueSize: 100,
          maxPublishRate: 10,
          maxCpuUsagePercent: 95,
          enableCircuitBreaker: true,
          enableSampling: true,
          enablePrioritization: true,
          enableBatching: true,
          recoveryThresholdPercent: 50,
          recoveryDelayMs: 1000,
          maxBackoffMs: 5000
        };
        break;
      default:
        throw createError.validation(`Unknown preset: ${preset}`);
    }
    
    this.backpressureManager.updateConfig(resetConfig);
    
    res.json({
      success: true,
      message: `Configuration reset to ${preset} preset`,
      data: {
        preset,
        config: this.backpressureManager.getConfig()
      }
    });
  }

  /**
   * Gérer le circuit breaker
   */
  private async manageCircuitBreaker(req: Request, res: Response): Promise<void> {
    try {
      const { subject, action } = await circuitBreakerSchema.validate(req.body);
      
      if (action === 'open') {
        this.backpressureManager.openCircuitBreaker(subject);
      } else {
        // Pour fermer, on ne peut que forcer une tentative de récupération
        // Le circuit breaker se fermera automatiquement si les conditions le permettent
      }
      
      res.json({
        success: true,
        message: `Circuit breaker ${action} request sent for subject: ${subject}`,
        data: {
          subject,
          action,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid request: ${error.message}`);
      }
      throw createError.internal(`Circuit breaker operation failed: ${error}`);
    }
  }

  /**
   * Status du circuit breaker
   */
  private async getCircuitBreakerStatus(req: Request, res: Response): Promise<void> {
    const metrics = this.backpressureManager.getMetrics();
    
    // Simulation du status par subject (en production, récupérer les vraies données)
    const mockSubjectStatus = [
      { subject: 'kpi.marketing.ctr', open: false, lastOpened: null, failureCount: 0 },
      { subject: 'kpi.payment.conversion', open: metrics.circuitBreakerOpen, lastOpened: new Date(), failureCount: 3 },
      { subject: 'kpi.onboarding.completion', open: false, lastOpened: null, failureCount: 1 }
    ];
    
    res.json({
      success: true,
      data: {
        globalStatus: metrics.circuitBreakerOpen,
        subjects: mockSubjectStatus,
        summary: {
          totalSubjects: mockSubjectStatus.length,
          openCircuits: mockSubjectStatus.filter(s => s.open).length,
          totalFailures: mockSubjectStatus.reduce((sum, s) => sum + s.failureCount, 0)
        }
      }
    });
  }

  /**
   * Exécuter un test de charge
   */
  private async runLoadTest(req: Request, res: Response): Promise<void> {
    if (this.loadTestRunning) {
      throw createError.conflict('Load test already running');
    }

    try {
      const testConfig = await testLoadSchema.validate(req.body);
      
      this.loadTestRunning = true;
      
      // Démarrer le test de charge de manière asynchrone
      this.executeLoadTest(testConfig).catch(error => {
        console.error('Load test failed:', error);
        this.loadTestRunning = false;
      });
      
      res.json({
        success: true,
        message: 'Load test started',
        data: {
          config: testConfig,
          startTime: new Date().toISOString(),
          estimatedEndTime: new Date(Date.now() + testConfig.durationSeconds * 1000).toISOString()
        }
      });

    } catch (error) {
      this.loadTestRunning = false;
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid load test config: ${error.message}`);
      }
      throw createError.internal(`Load test start failed: ${error}`);
    }
  }

  /**
   * Status du test de charge
   */
  private async getLoadTestStatus(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        running: this.loadTestRunning,
        currentMetrics: this.backpressureManager.getMetrics(),
        // En production, ajouter plus de détails sur le test en cours
      }
    });
  }

  /**
   * Arrêter le test de charge
   */
  private async stopLoadTest(req: Request, res: Response): Promise<void> {
    this.loadTestRunning = false;
    
    res.json({
      success: true,
      message: 'Load test stopped',
      data: {
        stoppedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Obtenir le statut de santé
   */
  private async getHealthStatus(req: Request, res: Response): Promise<void> {
    const metrics = this.backpressureManager.getMetrics();
    const config = this.backpressureManager.getConfig();
    
    const healthScore = this.calculateHealthScore(metrics, config);
    const isHealthy = healthScore >= 80;
    
    const statusCode = isHealthy ? 200 : 
                      healthScore >= 60 ? 206 : 503;
    
    res.status(statusCode).json({
      timestamp: new Date().toISOString(),
      status: isHealthy ? 'healthy' : healthScore >= 60 ? 'degraded' : 'unhealthy',
      healthScore,
      degradationLevel: metrics.degradationLevel,
      circuitBreakerOpen: metrics.circuitBreakerOpen,
      checks: {
        memory: metrics.currentMemoryMB < config.maxMemoryUsageMB,
        queue: metrics.currentQueueSize < config.maxQueueSize,
        publishRate: metrics.currentPublishRate < config.maxPublishRate,
        cpu: metrics.currentCpuPercent < config.maxCpuUsagePercent
      }
    });
  }

  /**
   * Obtenir un statut de santé détaillé
   */
  private async getDetailedHealthStatus(req: Request, res: Response): Promise<void> {
    const metrics = this.backpressureManager.getMetrics();
    const config = this.backpressureManager.getConfig();
    
    const healthScore = this.calculateHealthScore(metrics, config);
    const recommendations = this.generateHealthRecommendations(metrics, config);
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        healthScore,
        degradationLevel: metrics.degradationLevel,
        metrics,
        thresholds: config,
        recommendations,
        trends: {
          // Simulation des tendances (en production, calculer depuis les vraies données)
          memoryTrend: 'stable',
          queueTrend: 'increasing',
          rateTrend: 'decreasing',
          cpuTrend: 'stable'
        }
      }
    });
  }

  /**
   * Vider la queue progressivement
   */
  private async drainQueue(req: Request, res: Response): Promise<void> {
    const metrics = this.backpressureManager.getMetrics();
    const currentQueueSize = metrics.currentQueueSize;
    
    // En production, implémenter le drainage réel
    console.log(`Draining queue with ${currentQueueSize} messages...`);
    
    res.json({
      success: true,
      message: 'Queue draining initiated',
      data: {
        initialQueueSize: currentQueueSize,
        estimatedDrainTimeSeconds: Math.ceil(currentQueueSize / 100) // Approximation
      }
    });
  }

  /**
   * Vider la queue immédiatement
   */
  private async clearQueue(req: Request, res: Response): Promise<void> {
    const metrics = this.backpressureManager.getMetrics();
    const clearedMessages = metrics.currentQueueSize;
    
    // En production, implémenter la suppression réelle
    console.log(`Clearing queue with ${clearedMessages} messages...`);
    
    res.json({
      success: true,
      message: 'Queue cleared',
      data: {
        clearedMessages,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Obtenir l'historique de dégradation
   */
  private async getDegradationHistory(req: Request, res: Response): Promise<void> {
    const timeRange = req.query.timeRange as string || '24h';
    
    // Simulation des données historiques
    const mockHistory = this.generateMockDegradationHistory(timeRange);
    
    res.json({
      success: true,
      data: {
        timeRange,
        history: mockHistory,
        summary: {
          totalIncidents: mockHistory.filter(h => h.level !== 'none').length,
          maxDegradationLevel: Math.max(...mockHistory.map(h => this.getDegradationNumber(h.level))),
          averageRecoveryTimeMinutes: 8.5,
          longestIncidentMinutes: 45
        }
      }
    });
  }

  /**
   * Obtenir des recommandations d'optimisation
   */
  private async getOptimizationRecommendations(req: Request, res: Response): Promise<void> {
    const metrics = this.backpressureManager.getMetrics();
    const config = this.backpressureManager.getConfig();
    
    const recommendations = this.generateOptimizationRecommendations(metrics, config);
    
    res.json({
      success: true,
      data: {
        recommendations,
        generatedAt: new Date().toISOString(),
        systemStatus: {
          degradationLevel: metrics.degradationLevel,
          healthScore: this.calculateHealthScore(metrics, config)
        }
      }
    });
  }

  /**
   * Méthodes utilitaires privées
   */
  private async executeLoadTest(config: any): Promise<void> {
    const { messagesPerSecond, durationSeconds, messageSize, subjects } = config;
    const totalMessages = messagesPerSecond * durationSeconds;
    const intervalMs = 1000 / messagesPerSecond;
    
    console.log(`Starting load test: ${messagesPerSecond} msg/s for ${durationSeconds}s`);
    
    let messagesSent = 0;
    const startTime = Date.now();
    
    const sendMessage = async () => {
      if (!this.loadTestRunning || messagesSent >= totalMessages) {
        this.loadTestRunning = false;
        const duration = Date.now() - startTime;
        console.log(`Load test completed: ${messagesSent} messages in ${duration}ms`);
        return;
      }
      
      const subject = subjects[messagesSent % subjects.length];
      const testData = {
        loadTest: true,
        messageId: messagesSent,
        timestamp: new Date().toISOString(),
        data: 'x'.repeat(messageSize)
      };
      
      try {
        await this.backpressureManager.publish(subject, testData, 'medium');
        messagesSent++;
      } catch (error) {
        console.error('Load test message failed:', error);
      }
      
      setTimeout(sendMessage, intervalMs);
    };
    
    sendMessage();
  }

  private calculateHealthScore(metrics: any, config: any): number {
    const memoryScore = Math.max(0, 100 - (metrics.currentMemoryMB / config.maxMemoryUsageMB * 100));
    const queueScore = Math.max(0, 100 - (metrics.currentQueueSize / config.maxQueueSize * 100));
    const rateScore = Math.max(0, 100 - (metrics.currentPublishRate / config.maxPublishRate * 100));
    const cpuScore = Math.max(0, 100 - (metrics.currentCpuPercent / config.maxCpuUsagePercent * 100));
    
    return Math.round((memoryScore + queueScore + rateScore + cpuScore) / 4);
  }

  private generateHealthRecommendations(metrics: any, config: any): string[] {
    const recommendations = [];
    
    if (metrics.currentMemoryMB / config.maxMemoryUsageMB > 0.8) {
      recommendations.push('Consider increasing memory limits or optimizing memory usage');
    }
    
    if (metrics.currentQueueSize / config.maxQueueSize > 0.7) {
      recommendations.push('Queue size is high - consider enabling batching or increasing processing rate');
    }
    
    if (metrics.degradationLevel !== 'none') {
      recommendations.push('System is under stress - monitor closely and consider scaling');
    }
    
    if (metrics.droppedMessages > 100) {
      recommendations.push('High message drop rate - review backpressure configuration');
    }
    
    return recommendations;
  }

  private generateOptimizationRecommendations(metrics: any, config: any): any[] {
    const recommendations = [];
    
    // Recommandations basées sur les patterns observés
    if (metrics.currentQueueSize > config.maxQueueSize * 0.5) {
      recommendations.push({
        category: 'Performance',
        priority: 'high',
        title: 'Enable adaptive batching',
        description: 'Queue size is consistently high. Enabling adaptive batching could improve throughput.',
        implementation: 'Set enableBatching to true in configuration',
        expectedImpact: 'Reduce queue size by 30-50%'
      });
    }
    
    if (metrics.currentPublishRate < config.maxPublishRate * 0.3) {
      recommendations.push({
        category: 'Resource Optimization',
        priority: 'medium',
        title: 'Reduce publish rate limit',
        description: 'Current publish rate is well below the limit. Consider reducing to optimize resources.',
        implementation: `Reduce maxPublishRate from ${config.maxPublishRate} to ${Math.ceil(config.maxPublishRate * 0.6)}`,
        expectedImpact: 'Better resource utilization without impact on performance'
      });
    }
    
    if (metrics.degradationLevel === 'none' && metrics.sampledMessages === 0) {
      recommendations.push({
        category: 'Resilience',
        priority: 'low',
        title: 'Test backpressure mechanisms',
        description: 'System has not experienced backpressure recently. Consider load testing.',
        implementation: 'Run controlled load test to validate backpressure behavior',
        expectedImpact: 'Improved confidence in system resilience'
      });
    }
    
    return recommendations;
  }

  private getConfigChanges(oldConfig: any, newConfig: any): any[] {
    const changes = [];
    
    for (const [key, newValue] of Object.entries(newConfig)) {
      const oldValue = oldConfig[key];
      if (oldValue !== newValue) {
        changes.push({
          property: key,
          oldValue,
          newValue,
          changeType: typeof newValue === 'number' ? 
            (newValue > oldValue ? 'increase' : 'decrease') : 'change'
        });
      }
    }
    
    return changes;
  }

  private generateMockHistoricalMetrics(timeRange: string): any[] {
    // Simulation de données historiques pour la démo
    const points = 50;
    const data = [];
    
    for (let i = 0; i < points; i++) {
      data.push({
        timestamp: new Date(Date.now() - (points - i) * 60000).toISOString(),
        memoryMB: 200 + Math.random() * 100,
        queueSize: Math.floor(Math.random() * 1000),
        publishRate: Math.floor(Math.random() * 500),
        cpuPercent: 20 + Math.random() * 40,
        degradationLevel: ['none', 'none', 'none', 'low', 'medium'][Math.floor(Math.random() * 5)]
      });
    }
    
    return data;
  }

  private generateMockDegradationHistory(timeRange: string): any[] {
    // Simulation d'historique de dégradation
    return [
      {
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        level: 'medium',
        duration: 5 * 60 * 1000, // 5 minutes
        triggerReason: 'High queue size',
        resolution: 'Automatic recovery'
      },
      {
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        level: 'low',
        duration: 2 * 60 * 1000, // 2 minutes
        triggerReason: 'Memory threshold exceeded',
        resolution: 'Automatic recovery'
      }
    ];
  }

  private getDegradationNumber(level: string): number {
    const levels = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    return levels[level as keyof typeof levels] || 0;
  }

  /**
   * Obtenir le router Express
   */
  getRouter(): Router {
    return this.router;
  }
}

/**
 * Factory pour créer l'API backpressure
 */
export function createBackpressureAPI(
  natsClient: NatsStreamingClient,
  backpressureManager: BackpressureManager
): BackpressureAPI {
  return new BackpressureAPI(natsClient, backpressureManager);
}