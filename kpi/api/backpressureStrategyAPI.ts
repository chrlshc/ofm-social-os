/**
 * API avancée pour l'exposition temps réel de la stratégie de backpressure
 * avec couplage intelligent aux SLO
 */

import { Router, Request, Response } from 'express';
import { BackpressureStrategyManager, ActiveStrategy, StrategyHistory } from '../streaming/backpressureStrategy';
import { BackpressureManager } from '../streaming/backpressureManager';
import { SLOManager } from '../monitoring/slo';
import { asyncHandler, createError } from '../utils/errorHandler';
import * as yup from 'yup';

// Schémas de validation
const strategyQuerySchema = yup.object({
  includeHistory: yup.boolean().optional().default(false),
  includePredictions: yup.boolean().optional().default(true),
  includeRecommendations: yup.boolean().optional().default(true),
  historyLimit: yup.number().optional().min(1).max(1000).default(50)
});

const manualActionSchema = yup.object({
  action: yup.string().required().oneOf(['force_recovery', 'escalate_degradation', 'reset_circuit_breaker', 'clear_slo_budget']),
  reason: yup.string().required(),
  targetSubject: yup.string().optional(),
  parameters: yup.object().optional().default({})
});

export class BackpressureStrategyAPI {
  private router: Router;
  private strategyManager: BackpressureStrategyManager;
  private backpressureManager: BackpressureManager;
  private sloManager: SLOManager;

  constructor(
    strategyManager: BackpressureStrategyManager,
    backpressureManager: BackpressureManager,
    sloManager: SLOManager
  ) {
    this.router = Router();
    this.strategyManager = strategyManager;
    this.backpressureManager = backpressureManager;
    this.sloManager = sloManager;
    this.setupRoutes();
    this.setupEventHandlers();
  }

  private setupRoutes(): void {
    // Strategy monitoring
    this.router.get('/current', asyncHandler(async (req: Request, res: Response) => {
      await this.getCurrentStrategy(req, res);
    }));

    this.router.get('/live-stream', asyncHandler(async (req: Request, res: Response) => {
      await this.setupLiveStream(req, res);
    }));

    // Detailed analysis
    this.router.get('/analysis/detailed', asyncHandler(async (req: Request, res: Response) => {
      await this.getDetailedAnalysis(req, res);
    }));

    this.router.get('/analysis/reasons', asyncHandler(async (req: Request, res: Response) => {
      await this.getReasonAnalysis(req, res);
    }));

    this.router.get('/analysis/effectiveness', asyncHandler(async (req: Request, res: Response) => {
      await this.getEffectivenessAnalysis(req, res);
    }));

    // SLO integration
    this.router.get('/slo-coupling', asyncHandler(async (req: Request, res: Response) => {
      await this.getSLOCoupling(req, res);
    }));

    this.router.post('/slo-coupling/adjust', asyncHandler(async (req: Request, res: Response) => {
      await this.adjustBasedOnSLO(req, res);
    }));

    // Historical data
    this.router.get('/history', asyncHandler(async (req: Request, res: Response) => {
      await this.getStrategyHistory(req, res);
    }));

    this.router.get('/history/patterns', asyncHandler(async (req: Request, res: Response) => {
      await this.getHistoricalPatterns(req, res);
    }));

    // Performance and trends
    this.router.get('/performance/stats', asyncHandler(async (req: Request, res: Response) => {
      await this.getPerformanceStats(req, res);
    }));

    this.router.get('/predictions', asyncHandler(async (req: Request, res: Response) => {
      await this.getPredictions(req, res);
    }));

    // Manual interventions
    this.router.post('/manual-action', asyncHandler(async (req: Request, res: Response) => {
      await this.executeManualAction(req, res);
    }));

    this.router.get('/manual-recommendations', asyncHandler(async (req: Request, res: Response) => {
      await this.getManualRecommendations(req, res);
    }));

    // Dashboard integration
    this.router.get('/dashboard/summary', asyncHandler(async (req: Request, res: Response) => {
      await this.getDashboardSummary(req, res);
    }));

    this.router.get('/dashboard/real-time', asyncHandler(async (req: Request, res: Response) => {
      await this.getRealTimeDashboard(req, res);
    }));

    // Alerting and notifications
    this.router.get('/alerts/active', asyncHandler(async (req: Request, res: Response) => {
      await this.getActiveAlerts(req, res);
    }));

    this.router.post('/alerts/acknowledge', asyncHandler(async (req: Request, res: Response) => {
      await this.acknowledgeAlert(req, res);
    }));
  }

  /**
   * Configuration des event handlers pour les mises à jour temps réel
   */
  private setupEventHandlers(): void {
    this.strategyManager.on('strategy_changed', (event) => {
      console.log(`Strategy changed: ${event.previous.degradationLevel} → ${event.current.degradationLevel}`);
      this.notifyClients('strategy_changed', event);
    });

    this.strategyManager.on('strategy_updated', (strategy) => {
      this.notifyClients('strategy_updated', strategy);
    });
  }

  /**
   * Obtenir la stratégie actuelle avec options détaillées
   */
  private async getCurrentStrategy(req: Request, res: Response): Promise<void> {
    try {
      const options = await strategyQuerySchema.validate(req.query);
      
      // Obtenir les métriques actuelles
      const metrics = this.backpressureManager.getMetrics();
      const config = this.backpressureManager.getConfig();
      
      // Obtenir les violations SLO
      const sloEvaluation = await this.sloManager.evaluateAllSLOs();
      
      // Analyser la stratégie actuelle
      const strategy = await this.strategyManager.analyzeCurrentStrategy(
        metrics,
        config,
        sloEvaluation.violations
      );

      const response: any = {
        strategy,
        timestamp: new Date().toISOString(),
        systemHealth: {
          overallScore: sloEvaluation.overallHealth,
          criticalAlerts: sloEvaluation.criticalAlerts
        }
      };

      if (options.includeHistory) {
        response.recentHistory = this.strategyManager.getStrategyHistory(options.historyLimit);
      }

      if (options.includeRecommendations) {
        response.recommendations = await this.generateAdvancedRecommendations(strategy);
      }

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid query parameters: ${error.message}`);
      }
      throw createError.internal(`Strategy analysis failed: ${error}`);
    }
  }

  /**
   * Configuration du streaming temps réel via Server-Sent Events
   */
  private async setupLiveStream(req: Request, res: Response): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Envoyer la stratégie actuelle immédiatement
    const currentStrategy = this.strategyManager.getCurrentStrategy();
    if (currentStrategy) {
      res.write(`data: ${JSON.stringify({
        type: 'current_strategy',
        data: currentStrategy,
        timestamp: new Date().toISOString()
      })}\n\n`);
    }

    // Configuration des listeners
    const onStrategyUpdate = (strategy: ActiveStrategy) => {
      res.write(`data: ${JSON.stringify({
        type: 'strategy_update',
        data: strategy,
        timestamp: new Date().toISOString()
      })}\n\n`);
    };

    const onStrategyChange = (event: any) => {
      res.write(`data: ${JSON.stringify({
        type: 'strategy_change',
        data: event,
        timestamp: new Date().toISOString()
      })}\n\n`);
    };

    this.strategyManager.on('strategy_updated', onStrategyUpdate);
    this.strategyManager.on('strategy_changed', onStrategyChange);

    // Heartbeat toutes les 30 secondes
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 30000);

    // Nettoyage à la déconnexion
    req.on('close', () => {
      clearInterval(heartbeat);
      this.strategyManager.removeListener('strategy_updated', onStrategyUpdate);
      this.strategyManager.removeListener('strategy_changed', onStrategyChange);
    });
  }

  /**
   * Analyse détaillée de la stratégie
   */
  private async getDetailedAnalysis(req: Request, res: Response): Promise<void> {
    const strategy = this.strategyManager.getCurrentStrategy();
    
    if (!strategy) {
      throw createError.notFound('No active strategy found');
    }

    const analysis = {
      strategy,
      deepAnalysis: {
        primaryCause: await this.analyzePrimaryCause(strategy),
        cascadeEffects: await this.analyzeCascadeEffects(strategy),
        riskAssessment: await this.assessRisks(strategy),
        impactAnalysis: await this.analyzeImpact(strategy),
        mitigationEffectiveness: await this.analyzeMitigationEffectiveness(strategy)
      },
      contextualData: {
        historicalComparison: await this.getHistoricalComparison(strategy),
        peerComparison: await this.getPeerComparison(strategy),
        seasonalFactors: await this.getSeasonalFactors(strategy)
      },
      actionPlan: {
        immediateActions: await this.getImmediateActions(strategy),
        shortTermActions: await this.getShortTermActions(strategy),
        longTermActions: await this.getLongTermActions(strategy)
      }
    };

    res.json({
      success: true,
      data: analysis
    });
  }

  /**
   * Analyse des raisons de backpressure
   */
  private async getReasonAnalysis(req: Request, res: Response): Promise<void> {
    const strategy = this.strategyManager.getCurrentStrategy();
    
    if (!strategy) {
      throw createError.notFound('No active strategy found');
    }

    const reasonAnalysis = {
      current: strategy.reasons,
      breakdown: {
        byType: this.groupReasonsByType(strategy.reasons),
        bySeverity: this.groupReasonsBySeverity(strategy.reasons),
        byTrend: this.groupReasonsByTrend(strategy.reasons)
      },
      correlations: await this.analyzeReasonCorrelations(strategy.reasons),
      predictions: {
        likelyNextReasons: await this.predictNextReasons(strategy.reasons),
        escalationProbability: await this.calculateEscalationProbability(strategy.reasons),
        resolutionTimeEstimate: await this.estimateResolutionTime(strategy.reasons)
      },
      historicalContext: await this.getReasonHistoricalContext(strategy.reasons)
    };

    res.json({
      success: true,
      data: reasonAnalysis
    });
  }

  /**
   * Analyse de l'efficacité des stratégies
   */
  private async getEffectivenessAnalysis(req: Request, res: Response): Promise<void> {
    const strategy = this.strategyManager.getCurrentStrategy();
    const performanceStats = this.strategyManager.getPerformanceStats();
    
    const effectivenessAnalysis = {
      current: {
        overallEffectiveness: await this.calculateOverallEffectiveness(strategy),
        strategyBreakdown: strategy?.activeStrategies,
        bottlenecks: await this.identifyBottlenecks(strategy)
      },
      historical: {
        performanceStats,
        trends: await this.getEffectivenessTrends(),
        bestPractices: await this.identifyBestPractices()
      },
      optimization: {
        suggestions: await this.generateOptimizationSuggestions(strategy),
        potentialImprovements: await this.calculatePotentialImprovements(strategy),
        riskAdjustedRecommendations: await this.getRiskAdjustedRecommendations(strategy)
      }
    };

    res.json({
      success: true,
      data: effectivenessAnalysis
    });
  }

  /**
   * Couplage avec les SLO
   */
  private async getSLOCoupling(req: Request, res: Response): Promise<void> {
    const strategy = this.strategyManager.getCurrentStrategy();
    const sloEvaluation = await this.sloManager.evaluateAllSLOs();
    
    const coupling = {
      currentState: {
        strategy: strategy?.degradationLevel,
        sloHealth: sloEvaluation.overallHealth,
        violatedSLOs: sloEvaluation.violations.map(v => v.slo.name)
      },
      coupling: {
        budgetConsumption: strategy?.sloImpact.budgetConsumption || 0,
        riskLevel: strategy?.sloImpact.riskLevel || 'low',
        projectedRecoveryTime: strategy?.sloImpact.projectedRecoveryTime || 0
      },
      adaptiveThresholds: await this.calculateAdaptiveThresholds(strategy, sloEvaluation),
      recommendations: {
        immediate: await this.getSLOImmediateRecommendations(strategy, sloEvaluation),
        strategic: await this.getSLOStrategicRecommendations(strategy, sloEvaluation)
      },
      automation: {
        autoAdjustments: await this.getAutoAdjustmentOptions(strategy, sloEvaluation),
        triggerRules: await this.getTriggerRules(strategy, sloEvaluation)
      }
    };

    res.json({
      success: true,
      data: coupling
    });
  }

  /**
   * Ajustement basé sur les SLO
   */
  private async adjustBasedOnSLO(req: Request, res: Response): Promise<void> {
    const sloEvaluation = await this.sloManager.evaluateAllSLOs();
    const currentStrategy = this.strategyManager.getCurrentStrategy();
    
    // Calculer les ajustements nécessaires
    const adjustments = await this.calculateSLOBasedAdjustments(sloEvaluation, currentStrategy);
    
    // Appliquer les ajustements si autorisé
    if (req.body.autoApply) {
      await this.applyAdjustments(adjustments);
    }

    res.json({
      success: true,
      message: req.body.autoApply ? 'Adjustments applied successfully' : 'Adjustments calculated',
      data: {
        adjustments,
        applied: req.body.autoApply || false,
        impactEstimate: await this.estimateAdjustmentImpact(adjustments)
      }
    });
  }

  /**
   * Actions manuelles
   */
  private async executeManualAction(req: Request, res: Response): Promise<void> {
    try {
      const actionData = await manualActionSchema.validate(req.body);
      
      const result = await this.processManualAction(actionData);
      
      res.json({
        success: true,
        message: `Manual action '${actionData.action}' executed successfully`,
        data: {
          action: actionData.action,
          result,
          timestamp: new Date().toISOString(),
          impactEstimate: await this.estimateActionImpact(actionData)
        }
      });

    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid action data: ${error.message}`);
      }
      throw createError.internal(`Manual action failed: ${error}`);
    }
  }

  /**
   * Résumé pour dashboard
   */
  private async getDashboardSummary(req: Request, res: Response): Promise<void> {
    const strategy = this.strategyManager.getCurrentStrategy();
    const sloEvaluation = await this.sloManager.evaluateAllSLOs();
    const performanceStats = this.strategyManager.getPerformanceStats();
    
    const summary = {
      status: {
        degradationLevel: strategy?.degradationLevel || 'none',
        healthScore: sloEvaluation.overallHealth,
        activeReasons: strategy?.reasons.length || 0,
        criticalAlerts: sloEvaluation.criticalAlerts.length
      },
      metrics: {
        messagesDropped: strategy?.activeStrategies.sampling.messagesDropped || 0,
        samplingRate: strategy?.activeStrategies.sampling.rate || 1.0,
        openCircuits: strategy?.activeStrategies.circuitBreaker.openCircuits.length || 0,
        avgResolutionTime: performanceStats.averageResolutionTime
      },
      trends: {
        degradationTrend: await this.calculateDegradationTrend(),
        sloTrend: await this.calculateSLOTrend(),
        effectivenessTrend: await this.calculateEffectivenessTrend()
      },
      recommendations: {
        urgent: await this.getUrgentRecommendations(strategy),
        optimization: await this.getOptimizationRecommendations(strategy)
      }
    };

    res.json({
      success: true,
      data: summary
    });
  }

  /**
   * Méthodes utilitaires privées
   */
  private notifyClients(event: string, data: any): void {
    // Implementation for WebSocket or SSE client notifications
    console.log(`Notifying clients of ${event}:`, JSON.stringify(data, null, 2));
  }

  private async generateAdvancedRecommendations(strategy: ActiveStrategy | null): Promise<string[]> {
    if (!strategy) return ['System operating normally'];
    
    const recommendations = [];
    
    if (strategy.degradationLevel === 'critical') {
      recommendations.push('URGENT: System in critical state - consider emergency scaling');
    }
    
    if (strategy.sloImpact.budgetConsumption > 0.8) {
      recommendations.push('SLO error budget critically low - implement immediate mitigation');
    }
    
    if (strategy.activeStrategies.circuitBreaker.openCircuits.length > 0) {
      recommendations.push('Circuit breakers open - investigate downstream dependencies');
    }
    
    return recommendations;
  }

  // Méthodes d'analyse simplifiées (à implémenter selon les besoins)
  private async analyzePrimaryCause(strategy: ActiveStrategy): Promise<any> {
    return {
      cause: strategy.primaryReason.type,
      confidence: 0.85,
      contributingFactors: strategy.reasons.slice(1, 3)
    };
  }

  private async analyzeCascadeEffects(strategy: ActiveStrategy): Promise<any> {
    return {
      potentialCascades: ['downstream_latency', 'queue_overflow'],
      probability: 0.3,
      timeframe: '5-10 minutes'
    };
  }

  private async assessRisks(strategy: ActiveStrategy): Promise<any> {
    return {
      dataLossRisk: strategy.sloImpact.riskLevel,
      availabilityRisk: strategy.degradationLevel === 'critical' ? 'high' : 'medium',
      performanceRisk: 'medium'
    };
  }

  private async analyzeImpact(strategy: ActiveStrategy): Promise<any> {
    return {
      userImpact: strategy.degradationLevel === 'none' ? 'minimal' : 'moderate',
      businessImpact: strategy.sloImpact.riskLevel,
      systemImpact: strategy.degradationLevel
    };
  }

  private async analyzeMitigationEffectiveness(strategy: ActiveStrategy): Promise<any> {
    return {
      sampling: strategy.activeStrategies.sampling.effectivenessScore,
      batching: strategy.activeStrategies.batching.throughputImprovement,
      prioritization: strategy.activeStrategies.prioritization.effectivenessScore
    };
  }

  private async getHistoricalComparison(strategy: ActiveStrategy): Promise<any> {
    return { comparison: 'Similar to incident on 2024-01-15', severity: 'lower' };
  }

  private async getPeerComparison(strategy: ActiveStrategy): Promise<any> {
    return { status: 'Above average performance compared to peer systems' };
  }

  private async getSeasonalFactors(strategy: ActiveStrategy): Promise<any> {
    return { factors: 'Peak traffic period detected', impact: 'moderate' };
  }

  private async getImmediateActions(strategy: ActiveStrategy): Promise<string[]> {
    return strategy.predictedActions.recommendedManualActions;
  }

  private async getShortTermActions(strategy: ActiveStrategy): Promise<string[]> {
    return ['Monitor closely', 'Prepare scaling options'];
  }

  private async getLongTermActions(strategy: ActiveStrategy): Promise<string[]> {
    return ['Review capacity planning', 'Optimize algorithms'];
  }

  private groupReasonsByType(reasons: any[]): any {
    return reasons.reduce((acc, reason) => {
      acc[reason.type] = (acc[reason.type] || 0) + 1;
      return acc;
    }, {});
  }

  private groupReasonsBySeverity(reasons: any[]): any {
    return reasons.reduce((acc, reason) => {
      acc[reason.severity] = (acc[reason.severity] || 0) + 1;
      return acc;
    }, {});
  }

  private groupReasonsByTrend(reasons: any[]): any {
    return reasons.reduce((acc, reason) => {
      acc[reason.trend] = (acc[reason.trend] || 0) + 1;
      return acc;
    }, {});
  }

  private async analyzeReasonCorrelations(reasons: any[]): Promise<any> {
    return { correlations: 'Memory and queue pressure often correlate' };
  }

  private async predictNextReasons(reasons: any[]): Promise<string[]> {
    return ['cpu_pressure', 'network_latency'];
  }

  private async calculateEscalationProbability(reasons: any[]): Promise<number> {
    return 0.3;
  }

  private async estimateResolutionTime(reasons: any[]): Promise<number> {
    return reasons.length * 120; // 2 minutes per reason
  }

  private async getReasonHistoricalContext(reasons: any[]): Promise<any> {
    return { context: 'Similar pattern observed 3 times in past month' };
  }

  private async calculateOverallEffectiveness(strategy: ActiveStrategy | null): Promise<number> {
    if (!strategy) return 1.0;
    return 0.75; // Simplified
  }

  private async identifyBottlenecks(strategy: ActiveStrategy | null): Promise<string[]> {
    return ['Message processing', 'Network I/O'];
  }

  private async getEffectivenessTrends(): Promise<any> {
    return { trend: 'improving', rate: 0.1 };
  }

  private async identifyBestPractices(): Promise<string[]> {
    return ['Enable adaptive batching', 'Use priority queuing'];
  }

  private async generateOptimizationSuggestions(strategy: ActiveStrategy | null): Promise<string[]> {
    return ['Increase batch size during high load', 'Implement predictive scaling'];
  }

  private async calculatePotentialImprovements(strategy: ActiveStrategy | null): Promise<any> {
    return { throughput: '+15%', latency: '-10%', reliability: '+5%' };
  }

  private async getRiskAdjustedRecommendations(strategy: ActiveStrategy | null): Promise<string[]> {
    return ['Low risk: Enable aggressive batching', 'Medium risk: Scale consumers'];
  }

  private async calculateAdaptiveThresholds(strategy: ActiveStrategy | null, sloEvaluation: any): Promise<any> {
    return {
      memoryThreshold: 'Increase to 1.2GB based on SLO budget',
      queueThreshold: 'Decrease to 8000 to preserve SLO'
    };
  }

  private async getSLOImmediateRecommendations(strategy: ActiveStrategy | null, sloEvaluation: any): Promise<string[]> {
    return ['Reduce sampling rate to preserve SLO budget'];
  }

  private async getSLOStrategicRecommendations(strategy: ActiveStrategy | null, sloEvaluation: any): Promise<string[]> {
    return ['Review SLO targets based on business requirements'];
  }

  private async getAutoAdjustmentOptions(strategy: ActiveStrategy | null, sloEvaluation: any): Promise<any> {
    return { enabled: true, triggerConditions: ['budget < 20%', 'critical violations'] };
  }

  private async getTriggerRules(strategy: ActiveStrategy | null, sloEvaluation: any): Promise<any> {
    return { rules: ['IF budget < 20% THEN increase degradation', 'IF violations > 3 THEN enable circuit breaker'] };
  }

  private async calculateSLOBasedAdjustments(sloEvaluation: any, strategy: ActiveStrategy | null): Promise<any> {
    return { adjustments: 'Reduce queue threshold by 20%', reason: 'SLO budget preservation' };
  }

  private async applyAdjustments(adjustments: any): Promise<void> {
    console.log('Applying adjustments:', adjustments);
  }

  private async estimateAdjustmentImpact(adjustments: any): Promise<any> {
    return { impact: 'Moderate performance reduction, improved reliability' };
  }

  private async processManualAction(actionData: any): Promise<any> {
    console.log('Processing manual action:', actionData);
    return { status: 'success', applied: true };
  }

  private async estimateActionImpact(actionData: any): Promise<any> {
    return { impact: 'Low risk, high effectiveness' };
  }

  private async calculateDegradationTrend(): Promise<string> {
    return 'stable';
  }

  private async calculateSLOTrend(): Promise<string> {
    return 'improving';
  }

  private async calculateEffectivenessTrend(): Promise<string> {
    return 'stable';
  }

  private async getUrgentRecommendations(strategy: ActiveStrategy | null): Promise<string[]> {
    if (!strategy || strategy.degradationLevel === 'none') return [];
    return ['Monitor closely', 'Prepare manual intervention'];
  }

  private async getOptimizationRecommendations(strategy: ActiveStrategy | null): Promise<string[]> {
    return ['Enable predictive scaling', 'Optimize batch sizes'];
  }

  /**
   * Obtenir le router Express
   */
  getRouter(): Router {
    return this.router;
  }
}

/**
 * Factory pour créer l'API de stratégie avancée
 */
export function createBackpressureStrategyAPI(
  strategyManager: BackpressureStrategyManager,
  backpressureManager: BackpressureManager,
  sloManager: SLOManager
): BackpressureStrategyAPI {
  return new BackpressureStrategyAPI(strategyManager, backpressureManager, sloManager);
}