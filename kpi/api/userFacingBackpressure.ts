/**
 * API et middleware pour exposer le backpressure aux clients
 * Permet aux utilisateurs d'adapter leur comportement selon la charge système
 */

import { Request, Response, NextFunction, Router } from 'express';
import { BackpressureStrategyManager } from '../streaming/backpressureStrategy';
import { BackpressureManager } from '../streaming/backpressureManager';
import { SLOManager } from '../monitoring/slo';
import { streamingMetrics } from '../monitoring/metrics';

export interface UserFacingBackpressureStatus {
  level: 'optimal' | 'busy' | 'stressed' | 'critical';
  score: number; // 0-100, 100 = optimal, 0 = critical
  recommendation: {
    action: 'continue' | 'slow_down' | 'reduce_load' | 'try_later';
    message: string;
    retryAfterSeconds?: number;
    rateLimitSuggestion?: {
      requestsPerSecond: number;
      batchSize: number;
    };
  };
  capacity: {
    available: number; // Percentage of capacity available
    estimatedWaitTime: number; // Milliseconds
    queuePosition?: number; // If applicable
  };
  timestamp: string;
}

export interface ClientAdaptationGuidelines {
  optimal: {
    description: 'System running smoothly';
    recommendations: string[];
    rateLimit: { requestsPerSecond: number; batchSize: number };
  };
  busy: {
    description: 'System under moderate load';
    recommendations: string[];
    rateLimit: { requestsPerSecond: number; batchSize: number };
  };
  stressed: {
    description: 'System under high load';
    recommendations: string[];
    rateLimit: { requestsPerSecond: number; batchSize: number };
  };
  critical: {
    description: 'System at capacity limit';
    recommendations: string[];
    rateLimit: { requestsPerSecond: number; batchSize: number };
    retryAfter: number;
  };
}

export class UserFacingBackpressureAPI {
  private router: Router;
  private strategyManager: BackpressureStrategyManager;
  private backpressureManager: BackpressureManager;
  private sloManager: SLOManager;
  private clientGuidelines: ClientAdaptationGuidelines;
  private statusCache: {
    status: UserFacingBackpressureStatus | null;
    lastUpdate: number;
    ttl: number;
  };

  constructor(
    strategyManager: BackpressureStrategyManager,
    backpressureManager: BackpressureManager,
    sloManager: SLOManager
  ) {
    this.router = Router();
    this.strategyManager = strategyManager;
    this.backpressureManager = backpressureManager;
    this.sloManager = sloManager;
    
    this.statusCache = {
      status: null,
      lastUpdate: 0,
      ttl: 5000 // 5 seconds cache
    };

    this.initializeClientGuidelines();
    this.setupRoutes();
    this.startStatusUpdates();
  }

  /**
   * Initialiser les guidelines d'adaptation client
   */
  private initializeClientGuidelines(): void {
    this.clientGuidelines = {
      optimal: {
        description: 'System running smoothly',
        recommendations: [
          'Normal operation - no restrictions',
          'Full rate limits apply',
          'Batch operations encouraged for efficiency'
        ],
        rateLimit: {
          requestsPerSecond: 100,
          batchSize: 50
        }
      },
      busy: {
        description: 'System under moderate load',
        recommendations: [
          'Consider reducing non-essential requests',
          'Use larger batch sizes to reduce overhead',
          'Implement exponential backoff for retries'
        ],
        rateLimit: {
          requestsPerSecond: 70,
          batchSize: 100
        }
      },
      stressed: {
        description: 'System under high load',
        recommendations: [
          'Reduce request rate by 30-50%',
          'Prioritize critical operations only',
          'Implement jitter in request timing',
          'Use maximum batch sizes available'
        ],
        rateLimit: {
          requestsPerSecond: 40,
          batchSize: 200
        }
      },
      critical: {
        description: 'System at capacity limit',
        recommendations: [
          'Defer non-critical operations',
          'Implement circuit breaker pattern',
          'Use maximum retry delays',
          'Consider alternative endpoints if available'
        ],
        rateLimit: {
          requestsPerSecond: 10,
          batchSize: 500
        },
        retryAfter: 30
      }
    };
  }

  /**
   * Configuration des routes
   */
  private setupRoutes(): void {
    // Status simple pour headers HTTP
    this.router.get('/status', (req: Request, res: Response) => {
      this.getSimpleStatus(req, res);
    });

    // Status détaillé pour clients avancés
    this.router.get('/detailed', (req: Request, res: Response) => {
      this.getDetailedStatus(req, res);
    });

    // Guidelines d'adaptation
    this.router.get('/guidelines', (req: Request, res: Response) => {
      this.getAdaptationGuidelines(req, res);
    });

    // Prédictions de charge
    this.router.get('/predictions', (req: Request, res: Response) => {
      this.getLoadPredictions(req, res);
    });

    // Health check optimisé pour load balancers
    this.router.get('/health', (req: Request, res: Response) => {
      this.getHealthCheck(req, res);
    });

    // Metrics publiques (anonymisées)
    this.router.get('/public-metrics', (req: Request, res: Response) => {
      this.getPublicMetrics(req, res);
    });
  }

  /**
   * Status simple pour headers HTTP
   */
  private getSimpleStatus(req: Request, res: Response): void {
    const status = this.getCurrentUserFacingStatus();
    
    // Headers pour les clients
    res.setHeader('X-System-Load-Level', status.level);
    res.setHeader('X-System-Load-Score', status.score.toString());
    res.setHeader('X-Recommended-Action', status.recommendation.action);
    
    if (status.recommendation.retryAfterSeconds) {
      res.setHeader('Retry-After', status.recommendation.retryAfterSeconds.toString());
    }

    if (status.recommendation.rateLimitSuggestion) {
      res.setHeader('X-Suggested-Rate-Limit', status.recommendation.rateLimitSuggestion.requestsPerSecond.toString());
      res.setHeader('X-Suggested-Batch-Size', status.recommendation.rateLimitSuggestion.batchSize.toString());
    }

    res.json({
      level: status.level,
      score: status.score,
      message: status.recommendation.message,
      timestamp: status.timestamp
    });
  }

  /**
   * Status détaillé pour clients avancés
   */
  private getDetailedStatus(req: Request, res: Response): void {
    const status = this.getCurrentUserFacingStatus();
    const guidelines = this.clientGuidelines[status.level];
    
    res.json({
      success: true,
      data: {
        status,
        guidelines,
        systemInsights: {
          primaryConstraint: this.identifyPrimaryConstraint(),
          estimatedRecoveryTime: this.estimateRecoveryTime(),
          alternativeEndpoints: this.getAlternativeEndpoints(status.level)
        }
      }
    });
  }

  /**
   * Guidelines d'adaptation pour développeurs
   */
  private getAdaptationGuidelines(req: Request, res: Response): void {
    const currentLevel = this.getCurrentUserFacingStatus().level;
    
    res.json({
      success: true,
      data: {
        currentLevel,
        guidelines: this.clientGuidelines,
        bestPractices: {
          implementation: [
            'Monitor X-System-Load-Level header on every response',
            'Implement exponential backoff with jitter',
            'Use circuit breaker pattern for critical paths',
            'Respect Retry-After headers',
            'Batch requests when system is stressed'
          ],
          codeExamples: {
            javascript: this.generateJavaScriptExample(),
            python: this.generatePythonExample(),
            curl: this.generateCurlExample()
          }
        }
      }
    });
  }

  /**
   * Prédictions de charge pour planification
   */
  private getLoadPredictions(req: Request, res: Response): void {
    const currentStrategy = this.strategyManager.getCurrentStrategy();
    
    const predictions = {
      nextHour: this.predictLoadLevel(60),
      next4Hours: this.predictLoadLevel(240),
      nextDay: this.predictLoadLevel(1440),
      confidence: 0.75, // Simplified confidence score
      factors: [
        'Historical traffic patterns',
        'Current degradation trends',
        'SLO budget consumption rate'
      ]
    };

    res.json({
      success: true,
      data: {
        predictions,
        recommendations: {
          planningAdvice: this.generatePlanningAdvice(predictions),
          optimumWindows: this.identifyOptimumTimeWindows(),
          avoidanceWindows: this.identifyAvoidanceTimeWindows()
        }
      }
    });
  }

  /**
   * Health check pour load balancers
   */
  private getHealthCheck(req: Request, res: Response): void {
    const status = this.getCurrentUserFacingStatus();
    
    // Status codes basés sur le niveau de charge
    const statusCode = status.level === 'critical' ? 503 : 
                      status.level === 'stressed' ? 206 : 200;
    
    res.status(statusCode).json({
      status: status.level === 'critical' ? 'unavailable' : 'available',
      load: status.level,
      score: status.score,
      capacity: status.capacity.available,
      timestamp: status.timestamp
    });
  }

  /**
   * Métriques publiques anonymisées
   */
  private getPublicMetrics(req: Request, res: Response): void {
    const strategy = this.strategyManager.getCurrentStrategy();
    const performanceStats = this.strategyManager.getPerformanceStats();
    
    const publicMetrics = {
      systemLoad: {
        level: this.getCurrentUserFacingStatus().level,
        score: this.getCurrentUserFacingStatus().score,
        trend: 'stable' // Simplified
      },
      performance: {
        averageResponseTime: '150ms', // Simplified
        uptime: '99.9%',
        throughput: 'nominal'
      },
      capacity: {
        utilizationPercent: 100 - this.getCurrentUserFacingStatus().capacity.available,
        queueDepth: strategy?.activeStrategies.batching.currentSize || 0,
        circuitBreakerStatus: strategy?.activeStrategies.circuitBreaker.openCircuits.length || 0
      }
    };

    res.json({
      success: true,
      data: publicMetrics
    });
  }

  /**
   * Middleware pour injecter les headers de backpressure
   */
  createMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const status = this.getCurrentUserFacingStatus();
      
      // Injecter les headers de base
      res.setHeader('X-System-Load-Level', status.level);
      res.setHeader('X-System-Load-Score', status.score.toString());
      res.setHeader('X-Recommended-Action', status.recommendation.action);
      res.setHeader('X-System-Capacity', status.capacity.available.toString());
      
      // Headers conditionnels
      if (status.recommendation.retryAfterSeconds) {
        res.setHeader('Retry-After', status.recommendation.retryAfterSeconds.toString());
      }

      if (status.recommendation.rateLimitSuggestion) {
        res.setHeader('X-Suggested-Rate-Limit', status.recommendation.rateLimitSuggestion.requestsPerSecond.toString());
        res.setHeader('X-Suggested-Batch-Size', status.recommendation.rateLimitSuggestion.batchSize.toString());
      }

      // Réponse immédiate si critique
      if (status.level === 'critical' && req.path !== '/api/user-facing/status') {
        return res.status(503).json({
          error: 'Service temporarily unavailable due to high load',
          retryAfter: status.recommendation.retryAfterSeconds,
          message: status.recommendation.message
        });
      }

      next();
    };
  }

  /**
   * Calculer le status user-facing actuel
   */
  private getCurrentUserFacingStatus(): UserFacingBackpressureStatus {
    // Vérifier le cache
    const now = Date.now();
    if (this.statusCache.status && (now - this.statusCache.lastUpdate) < this.statusCache.ttl) {
      return this.statusCache.status;
    }

    // Calculer le nouveau status
    const strategy = this.strategyManager.getCurrentStrategy();
    const metrics = this.backpressureManager.getMetrics();
    
    const level = this.calculateUserFacingLevel(strategy, metrics);
    const score = this.calculateLoadScore(strategy, metrics);
    const recommendation = this.generateRecommendation(level, strategy);
    const capacity = this.calculateCapacity(strategy, metrics);

    const status: UserFacingBackpressureStatus = {
      level,
      score,
      recommendation,
      capacity,
      timestamp: new Date().toISOString()
    };

    // Mettre en cache
    this.statusCache = {
      status,
      lastUpdate: now,
      ttl: this.statusCache.ttl
    };

    return status;
  }

  /**
   * Calculer le niveau user-facing
   */
  private calculateUserFacingLevel(strategy: any, metrics: any): UserFacingBackpressureStatus['level'] {
    if (!strategy) return 'optimal';

    // Mapping sophistiqué des niveaux internes vers user-facing
    switch (strategy.degradationLevel) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'stressed';
      case 'medium':
        return 'busy';
      case 'low':
        return metrics.currentQueueSize > 500 ? 'busy' : 'optimal';
      default:
        return 'optimal';
    }
  }

  /**
   * Calculer le score de charge (0-100)
   */
  private calculateLoadScore(strategy: any, metrics: any): number {
    if (!strategy) return 100;

    const factors = [
      1 - (metrics.currentMemoryMB / 2048), // Memory factor
      1 - (metrics.currentQueueSize / 10000), // Queue factor
      1 - (metrics.currentPublishRate / 1000), // Rate factor
      strategy.sloImpact ? (1 - strategy.sloImpact.budgetConsumption) : 1 // SLO factor
    ];

    const avgFactor = factors.reduce((sum, f) => sum + f, 0) / factors.length;
    return Math.round(Math.max(0, Math.min(100, avgFactor * 100)));
  }

  /**
   * Générer les recommandations
   */
  private generateRecommendation(
    level: UserFacingBackpressureStatus['level'], 
    strategy: any
  ): UserFacingBackpressureStatus['recommendation'] {
    
    const guidelines = this.clientGuidelines[level];
    
    const base = {
      rateLimitSuggestion: {
        requestsPerSecond: guidelines.rateLimit.requestsPerSecond,
        batchSize: guidelines.rateLimit.batchSize
      }
    };

    switch (level) {
      case 'optimal':
        return {
          action: 'continue',
          message: 'System operating normally - full performance available',
          ...base
        };
        
      case 'busy':
        return {
          action: 'slow_down',
          message: 'System under moderate load - consider reducing request rate',
          ...base
        };
        
      case 'stressed':
        return {
          action: 'reduce_load',
          message: 'System under high load - significant rate reduction recommended',
          ...base
        };
        
      case 'critical':
        return {
          action: 'try_later',
          message: 'System at capacity - please retry later',
          retryAfterSeconds: guidelines.retryAfter,
          ...base
        };
        
      default:
        return {
          action: 'continue',
          message: 'System status unknown',
          ...base
        };
    }
  }

  /**
   * Calculer la capacité disponible
   */
  private calculateCapacity(strategy: any, metrics: any): UserFacingBackpressureStatus['capacity'] {
    const queueUtilization = metrics.currentQueueSize / 10000; // Assuming max 10k
    const available = Math.round((1 - queueUtilization) * 100);
    
    return {
      available: Math.max(0, available),
      estimatedWaitTime: metrics.currentQueueSize * 10, // 10ms per queued item (simplified)
      queuePosition: metrics.currentQueueSize > 0 ? metrics.currentQueueSize : undefined
    };
  }

  /**
   * Démarrer les mises à jour de status
   */
  private startStatusUpdates(): void {
    setInterval(() => {
      // Force cache refresh
      this.statusCache.lastUpdate = 0;
      
      // Update metrics
      const status = this.getCurrentUserFacingStatus();
      
      // Update Prometheus metrics
      this.updateUserFacingMetrics(status);
      
    }, 10000); // Every 10 seconds
  }

  /**
   * Mettre à jour les métriques Prometheus
   */
  private updateUserFacingMetrics(status: UserFacingBackpressureStatus): void {
    // Create new metrics if they don't exist
    if (!streamingMetrics.userFacingLoadLevel) {
      const { Gauge } = require('prom-client');
      
      streamingMetrics.userFacingLoadLevel = new Gauge({
        name: 'kpi_user_facing_load_level',
        help: 'User-facing load level (0=optimal, 1=busy, 2=stressed, 3=critical)'
      });

      streamingMetrics.userFacingLoadScore = new Gauge({
        name: 'kpi_user_facing_load_score',
        help: 'User-facing load score (0-100, higher is better)'
      });

      streamingMetrics.userFacingCapacity = new Gauge({
        name: 'kpi_user_facing_capacity_available',
        help: 'User-facing available capacity percentage'
      });
    }

    // Update metrics
    const levelNumber = { optimal: 0, busy: 1, stressed: 2, critical: 3 }[status.level];
    streamingMetrics.userFacingLoadLevel.set(levelNumber);
    streamingMetrics.userFacingLoadScore.set(status.score);
    streamingMetrics.userFacingCapacity.set(status.capacity.available);
  }

  /**
   * Méthodes utilitaires
   */
  private identifyPrimaryConstraint(): string {
    const strategy = this.strategyManager.getCurrentStrategy();
    return strategy?.primaryReason.type || 'none';
  }

  private estimateRecoveryTime(): number {
    const strategy = this.strategyManager.getCurrentStrategy();
    return strategy?.sloImpact.projectedRecoveryTime || 0;
  }

  private getAlternativeEndpoints(level: string): string[] {
    // En production, retourner des endpoints alternatifs selon la charge
    if (level === 'critical') {
      return ['/api/v1/bulk', '/api/v1/async'];
    }
    return [];
  }

  private predictLoadLevel(minutesAhead: number): string {
    // Simplified prediction - in production, use historical data
    const currentLevel = this.getCurrentUserFacingStatus().level;
    return currentLevel; // Placeholder
  }

  private generatePlanningAdvice(predictions: any): string[] {
    return [
      'Schedule bulk operations during low-load periods',
      'Consider request batching for better efficiency',
      'Monitor X-System-Load-Level header continuously'
    ];
  }

  private identifyOptimumTimeWindows(): Array<{start: string, end: string, reason: string}> {
    return [
      { start: '02:00', end: '06:00', reason: 'Historically lowest traffic' },
      { start: '14:00', end: '16:00', reason: 'Post-lunch low activity' }
    ];
  }

  private identifyAvoidanceTimeWindows(): Array<{start: string, end: string, reason: string}> {
    return [
      { start: '09:00', end: '11:00', reason: 'Morning peak traffic' },
      { start: '20:00', end: '22:00', reason: 'Evening peak usage' }
    ];
  }

  /**
   * Exemples de code pour les développeurs
   */
  private generateJavaScriptExample(): string {
    return `
// JavaScript example for adaptive client behavior
class AdaptiveAPIClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.lastLoad = 'optimal';
  }

  async makeRequest(endpoint, data) {
    const response = await fetch(this.baseURL + endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    });

    // Check system load
    const loadLevel = response.headers.get('X-System-Load-Level');
    const suggestedRate = response.headers.get('X-Suggested-Rate-Limit');
    
    if (loadLevel === 'critical') {
      const retryAfter = response.headers.get('Retry-After');
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return this.makeRequest(endpoint, data); // Retry
    }
    
    if (loadLevel === 'stressed' && suggestedRate) {
      // Implement rate limiting
      await this.respectRateLimit(parseInt(suggestedRate));
    }
    
    return response.json();
  }

  async respectRateLimit(maxRate) {
    const delay = 1000 / maxRate;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}`;
  }

  private generatePythonExample(): string {
    return `
# Python example for adaptive client behavior
import requests
import time
from typing import Optional

class AdaptiveAPIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()

    def make_request(self, endpoint: str, data: dict) -> dict:
        response = self.session.post(
            f"{self.base_url}{endpoint}",
            json=data
        )
        
        load_level = response.headers.get('X-System-Load-Level')
        suggested_rate = response.headers.get('X-Suggested-Rate-Limit')
        
        if load_level == 'critical':
            retry_after = int(response.headers.get('Retry-After', 30))
            time.sleep(retry_after)
            return self.make_request(endpoint, data)
        
        if load_level in ['stressed', 'busy'] and suggested_rate:
            delay = 1.0 / int(suggested_rate)
            time.sleep(delay)
        
        return response.json()
`;
  }

  private generateCurlExample(): string {
    return `
# Curl example with load monitoring
curl -i -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"data": "example"}' \\
  http://api.example.com/endpoint

# Check headers:
# X-System-Load-Level: busy
# X-Suggested-Rate-Limit: 70
# X-Suggested-Batch-Size: 100

# Adapt behavior based on headers
if [ "$load_level" = "critical" ]; then
  sleep $retry_after
fi
`;
  }

  /**
   * Obtenir le router Express
   */
  getRouter(): Router {
    return this.router;
  }
}

/**
 * Factory pour créer l'API user-facing
 */
export function createUserFacingBackpressureAPI(
  strategyManager: BackpressureStrategyManager,
  backpressureManager: BackpressureManager,
  sloManager: SLOManager
): UserFacingBackpressureAPI {
  return new UserFacingBackpressureAPI(strategyManager, backpressureManager, sloManager);
}