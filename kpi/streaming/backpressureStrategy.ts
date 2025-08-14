/**
 * Système avancé de stratégie de backpressure avec exposition temps réel
 * et couplage intelligent avec les SLO
 */

import { EventEmitter } from 'events';
import { BackpressureMetrics } from './backpressureManager';
import { SLOManager } from '../monitoring/slo';
import { streamingMetrics } from '../monitoring/metrics';

export interface BackpressureReason {
  type: 'memory' | 'cpu' | 'queue' | 'rate' | 'slo_budget' | 'network' | 'external';
  severity: 'low' | 'medium' | 'high' | 'critical';
  threshold: number;
  current: number;
  utilizationPercent: number;
  description: string;
  recommendation: string;
  timeDetected: Date;
  trend: 'stable' | 'increasing' | 'decreasing';
}

export interface ActiveStrategy {
  degradationLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  reasons: BackpressureReason[];
  primaryReason: BackpressureReason;
  activeStrategies: {
    sampling: {
      enabled: boolean;
      rate: number;
      messagesDropped: number;
      effectivenessScore: number;
    };
    batching: {
      enabled: boolean;
      currentSize: number;
      optimalSize: number;
      throughputImprovement: number;
    };
    prioritization: {
      enabled: boolean;
      lowPriorityDropped: number;
      highPriorityPreserved: number;
      effectivenessScore: number;
    };
    circuitBreaker: {
      enabled: boolean;
      openCircuits: string[];
      protectedSubjects: number;
      recoveryAttempts: number;
    };
  };
  sloImpact: {
    violatedSLOs: string[];
    budgetConsumption: number;
    projectedRecoveryTime: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  predictedActions: {
    nextLevelThreshold: number;
    timeToNextLevel: number | null;
    recoveryProbability: number;
    recommendedManualActions: string[];
  };
}

export interface StrategyHistory {
  timestamp: Date;
  degradationLevel: string;
  duration: number;
  triggers: BackpressureReason[];
  resolutionMethod: 'automatic' | 'manual' | 'timeout';
  effectiveness: number; // 0-1 score
}

export class BackpressureStrategyManager extends EventEmitter {
  private currentStrategy: ActiveStrategy | null = null;
  private strategyHistory: StrategyHistory[] = [];
  private reasonHistory: Map<string, BackpressureReason[]> = new Map();
  private sloManager: SLOManager;
  private lastMetrics: BackpressureMetrics | null = null;
  private trendWindow: number[] = [];
  private readonly MAX_HISTORY = 1000;
  private readonly TREND_WINDOW_SIZE = 10;

  constructor(sloManager: SLOManager) {
    super();
    this.sloManager = sloManager;
    this.startTrendAnalysis();
  }

  /**
   * Analyser la situation actuelle et générer la stratégie active
   */
  async analyzeCurrentStrategy(
    metrics: BackpressureMetrics,
    thresholds: any,
    sloViolations?: any[]
  ): Promise<ActiveStrategy> {
    
    // Analyser les raisons du backpressure
    const reasons = await this.analyzeBackpressureReasons(metrics, thresholds, sloViolations);
    const primaryReason = this.identifyPrimaryReason(reasons);
    
    // Calculer les stratégies actives
    const activeStrategies = this.calculateActiveStrategies(metrics, reasons);
    
    // Analyser l'impact SLO
    const sloImpact = await this.analyzeSLOImpact(reasons, sloViolations);
    
    // Prédire les actions futures
    const predictedActions = this.predictFutureActions(metrics, reasons, thresholds);
    
    const strategy: ActiveStrategy = {
      degradationLevel: metrics.degradationLevel,
      timestamp: new Date(),
      reasons,
      primaryReason,
      activeStrategies,
      sloImpact,
      predictedActions
    };

    // Sauvegarder la stratégie actuelle
    this.updateCurrentStrategy(strategy);
    
    // Mettre à jour les métriques
    this.updateStrategyMetrics(strategy);
    
    return strategy;
  }

  /**
   * Analyser les raisons du backpressure
   */
  private async analyzeBackpressureReasons(
    metrics: BackpressureMetrics,
    thresholds: any,
    sloViolations?: any[]
  ): Promise<BackpressureReason[]> {
    const reasons: BackpressureReason[] = [];

    // Analyser la mémoire
    if (metrics.currentMemoryMB > thresholds.maxMemoryUsageMB * 0.8) {
      const utilization = (metrics.currentMemoryMB / thresholds.maxMemoryUsageMB) * 100;
      const trend = this.calculateTrend('memory', metrics.currentMemoryMB);
      
      reasons.push({
        type: 'memory',
        severity: this.calculateSeverity(utilization),
        threshold: thresholds.maxMemoryUsageMB,
        current: metrics.currentMemoryMB,
        utilizationPercent: utilization,
        description: `Memory usage at ${utilization.toFixed(1)}% of threshold`,
        recommendation: utilization > 95 ? 
          'Immediate memory cleanup required' : 
          'Consider increasing memory allocation or optimizing usage',
        timeDetected: new Date(),
        trend
      });
    }

    // Analyser la queue
    if (metrics.currentQueueSize > thresholds.maxQueueSize * 0.7) {
      const utilization = (metrics.currentQueueSize / thresholds.maxQueueSize) * 100;
      const trend = this.calculateTrend('queue', metrics.currentQueueSize);
      
      reasons.push({
        type: 'queue',
        severity: this.calculateSeverity(utilization),
        threshold: thresholds.maxQueueSize,
        current: metrics.currentQueueSize,
        utilizationPercent: utilization,
        description: `Queue size at ${utilization.toFixed(1)}% of capacity`,
        recommendation: utilization > 90 ? 
          'Enable aggressive batching and increase processing rate' : 
          'Monitor queue growth and consider scaling consumers',
        timeDetected: new Date(),
        trend
      });
    }

    // Analyser le taux de publication
    if (metrics.currentPublishRate > thresholds.maxPublishRate * 0.8) {
      const utilization = (metrics.currentPublishRate / thresholds.maxPublishRate) * 100;
      const trend = this.calculateTrend('rate', metrics.currentPublishRate);
      
      reasons.push({
        type: 'rate',
        severity: this.calculateSeverity(utilization),
        threshold: thresholds.maxPublishRate,
        current: metrics.currentPublishRate,
        utilizationPercent: utilization,
        description: `Publish rate at ${utilization.toFixed(1)}% of limit`,
        recommendation: utilization > 95 ? 
          'Immediate rate limiting required' : 
          'Consider load balancing or horizontal scaling',
        timeDetected: new Date(),
        trend
      });
    }

    // Analyser les violations SLO
    if (sloViolations && sloViolations.length > 0) {
      const budgetConsumption = this.calculateBudgetConsumption(sloViolations);
      
      reasons.push({
        type: 'slo_budget',
        severity: budgetConsumption > 0.8 ? 'critical' : budgetConsumption > 0.6 ? 'high' : 'medium',
        threshold: 100,
        current: budgetConsumption * 100,
        utilizationPercent: budgetConsumption * 100,
        description: `SLO error budget ${(budgetConsumption * 100).toFixed(1)}% consumed`,
        recommendation: budgetConsumption > 0.8 ? 
          'Critical: Implement immediate mitigation to preserve SLO' : 
          'Monitor SLO closely and prepare mitigation strategies',
        timeDetected: new Date(),
        trend: 'increasing' // SLO violations typically increase during issues
      });
    }

    // Analyser les circuit breakers
    if (metrics.circuitBreakerOpen) {
      reasons.push({
        type: 'network',
        severity: 'high',
        threshold: 1,
        current: 1,
        utilizationPercent: 100,
        description: 'Circuit breaker(s) are open, indicating connectivity issues',
        recommendation: 'Investigate network connectivity and downstream service health',
        timeDetected: new Date(),
        trend: 'stable'
      });
    }

    return reasons.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }

  /**
   * Identifier la raison principale
   */
  private identifyPrimaryReason(reasons: BackpressureReason[]): BackpressureReason {
    if (reasons.length === 0) {
      return {
        type: 'external',
        severity: 'low',
        threshold: 0,
        current: 0,
        utilizationPercent: 0,
        description: 'System operating normally',
        recommendation: 'Continue monitoring',
        timeDetected: new Date(),
        trend: 'stable'
      };
    }

    // Prioriser par sévérité, puis par utilisation
    return reasons.reduce((primary, current) => {
      const primaryWeight = this.getSeverityWeight(primary.severity) * primary.utilizationPercent;
      const currentWeight = this.getSeverityWeight(current.severity) * current.utilizationPercent;
      return currentWeight > primaryWeight ? current : primary;
    });
  }

  /**
   * Calculer les stratégies actives
   */
  private calculateActiveStrategies(
    metrics: BackpressureMetrics,
    reasons: BackpressureReason[]
  ): ActiveStrategy['activeStrategies'] {
    
    // Sampling effectiveness
    const samplingEffectiveness = this.calculateSamplingEffectiveness(metrics);
    
    // Batching analysis
    const batchingAnalysis = this.calculateBatchingAnalysis(metrics);
    
    // Prioritization effectiveness
    const prioritizationEffectiveness = this.calculatePrioritizationEffectiveness(metrics);
    
    // Circuit breaker status
    const circuitBreakerStatus = this.calculateCircuitBreakerStatus(metrics);

    return {
      sampling: {
        enabled: metrics.degradationLevel !== 'none',
        rate: this.getSamplingRate(metrics.degradationLevel),
        messagesDropped: metrics.sampledMessages,
        effectivenessScore: samplingEffectiveness
      },
      batching: {
        enabled: metrics.degradationLevel !== 'none',
        currentSize: this.getBatchSize(metrics.degradationLevel),
        optimalSize: this.calculateOptimalBatchSize(reasons),
        throughputImprovement: batchingAnalysis.improvement
      },
      prioritization: {
        enabled: true,
        lowPriorityDropped: this.estimateLowPriorityDropped(metrics),
        highPriorityPreserved: this.estimateHighPriorityPreserved(metrics),
        effectivenessScore: prioritizationEffectiveness
      },
      circuitBreaker: {
        enabled: true,
        openCircuits: circuitBreakerStatus.openCircuits,
        protectedSubjects: circuitBreakerStatus.protectedSubjects,
        recoveryAttempts: circuitBreakerStatus.recoveryAttempts
      }
    };
  }

  /**
   * Analyser l'impact SLO
   */
  private async analyzeSLOImpact(
    reasons: BackpressureReason[],
    sloViolations?: any[]
  ): Promise<ActiveStrategy['sloImpact']> {
    
    const sloResults = await this.sloManager.evaluateAllSLOs();
    
    const budgetConsumption = this.calculateOverallBudgetConsumption(sloResults.violations);
    const recoveryTime = this.estimateRecoveryTime(reasons, sloResults.violations);
    const riskLevel = this.calculateRiskLevel(budgetConsumption, reasons);

    return {
      violatedSLOs: sloResults.violations.map(v => v.slo.name),
      budgetConsumption,
      projectedRecoveryTime: recoveryTime,
      riskLevel
    };
  }

  /**
   * Prédire les actions futures
   */
  private predictFutureActions(
    metrics: BackpressureMetrics,
    reasons: BackpressureReason[],
    thresholds: any
  ): ActiveStrategy['predictedActions'] {
    
    const nextLevelThreshold = this.calculateNextLevelThreshold(metrics, thresholds);
    const timeToNextLevel = this.estimateTimeToNextLevel(reasons);
    const recoveryProbability = this.calculateRecoveryProbability(reasons);
    const manualActions = this.generateManualRecommendations(reasons, metrics);

    return {
      nextLevelThreshold,
      timeToNextLevel,
      recoveryProbability,
      recommendedManualActions: manualActions
    };
  }

  /**
   * Mettre à jour la stratégie actuelle
   */
  private updateCurrentStrategy(strategy: ActiveStrategy): void {
    const previousStrategy = this.currentStrategy;
    this.currentStrategy = strategy;

    // Détecter les changements significatifs
    if (previousStrategy && previousStrategy.degradationLevel !== strategy.degradationLevel) {
      this.emit('strategy_changed', {
        previous: previousStrategy,
        current: strategy,
        trigger: strategy.primaryReason
      });

      // Ajouter à l'historique
      this.addToHistory(previousStrategy, strategy);
    }

    // Émettre la stratégie mise à jour
    this.emit('strategy_updated', strategy);
  }

  /**
   * Ajouter à l'historique
   */
  private addToHistory(previous: ActiveStrategy, current: ActiveStrategy): void {
    const duration = current.timestamp.getTime() - previous.timestamp.getTime();
    
    const historyEntry: StrategyHistory = {
      timestamp: previous.timestamp,
      degradationLevel: previous.degradationLevel,
      duration,
      triggers: previous.reasons,
      resolutionMethod: 'automatic', // TODO: detect manual interventions
      effectiveness: this.calculateStrategyEffectiveness(previous, current)
    };

    this.strategyHistory.unshift(historyEntry);
    
    // Maintenir la taille de l'historique
    if (this.strategyHistory.length > this.MAX_HISTORY) {
      this.strategyHistory = this.strategyHistory.slice(0, this.MAX_HISTORY);
    }
  }

  /**
   * Mettre à jour les métriques Prometheus
   */
  private updateStrategyMetrics(strategy: ActiveStrategy): void {
    // Niveau de dégradation
    const levelNumber = this.getDegradationLevelNumber(strategy.degradationLevel);
    streamingMetrics.backpressureLevel.set(levelNumber);

    // Taux d'échantillonnage
    streamingMetrics.samplingRate.set(strategy.activeStrategies.sampling.rate);

    // Circuits ouverts
    strategy.activeStrategies.circuitBreaker.openCircuits.forEach(subject => {
      streamingMetrics.circuitBreakerOpen.set({ subject }, 1);
    });

    // Métriques personnalisées pour la stratégie
    streamingMetrics.backpressureStrategyEffectiveness = streamingMetrics.backpressureStrategyEffectiveness || 
      new (require('prom-client')).Gauge({
        name: 'kpi_backpressure_strategy_effectiveness',
        help: 'Effectiveness score of current backpressure strategy (0-1)',
        labelNames: ['strategy_type']
      });

    streamingMetrics.backpressureStrategyEffectiveness.set(
      { strategy_type: 'sampling' },
      strategy.activeStrategies.sampling.effectivenessScore
    );
  }

  /**
   * Démarrer l'analyse des tendances
   */
  private startTrendAnalysis(): void {
    setInterval(() => {
      this.analyzeTrends();
    }, 10000); // Analyse toutes les 10 secondes
  }

  /**
   * Analyser les tendances
   */
  private analyzeTrends(): void {
    if (!this.currentStrategy) return;

    // Analyser les tendances des métriques clés
    const reasons = this.currentStrategy.reasons;
    reasons.forEach(reason => {
      const key = `${reason.type}_${reason.threshold}`;
      if (!this.reasonHistory.has(key)) {
        this.reasonHistory.set(key, []);
      }
      
      const history = this.reasonHistory.get(key)!;
      history.unshift(reason);
      
      // Maintenir une fenêtre glissante
      if (history.length > 50) {
        history.splice(50);
      }
    });
  }

  /**
   * Obtenir la stratégie actuelle
   */
  getCurrentStrategy(): ActiveStrategy | null {
    return this.currentStrategy;
  }

  /**
   * Obtenir l'historique des stratégies
   */
  getStrategyHistory(limit: number = 100): StrategyHistory[] {
    return this.strategyHistory.slice(0, limit);
  }

  /**
   * Obtenir les statistiques de performance
   */
  getPerformanceStats(): {
    averageResolutionTime: number;
    automaticResolutionRate: number;
    strategyEffectiveness: number;
    mostCommonTriggers: Array<{ type: string; count: number }>;
  } {
    const recentHistory = this.strategyHistory.slice(0, 50);
    
    const averageResolutionTime = recentHistory.reduce((sum, h) => sum + h.duration, 0) / recentHistory.length || 0;
    const automaticResolutions = recentHistory.filter(h => h.resolutionMethod === 'automatic').length;
    const automaticResolutionRate = automaticResolutions / recentHistory.length || 0;
    const strategyEffectiveness = recentHistory.reduce((sum, h) => sum + h.effectiveness, 0) / recentHistory.length || 0;
    
    // Compter les triggers les plus fréquents
    const triggerCounts = new Map<string, number>();
    recentHistory.forEach(h => {
      h.triggers.forEach(t => {
        const count = triggerCounts.get(t.type) || 0;
        triggerCounts.set(t.type, count + 1);
      });
    });
    
    const mostCommonTriggers = Array.from(triggerCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      averageResolutionTime,
      automaticResolutionRate,
      strategyEffectiveness,
      mostCommonTriggers
    };
  }

  /**
   * Méthodes utilitaires privées
   */
  private calculateTrend(type: string, currentValue: number): 'stable' | 'increasing' | 'decreasing' {
    const key = `trend_${type}`;
    if (!this.trendWindow) this.trendWindow = [];
    
    this.trendWindow.push(currentValue);
    if (this.trendWindow.length > this.TREND_WINDOW_SIZE) {
      this.trendWindow.shift();
    }
    
    if (this.trendWindow.length < 3) return 'stable';
    
    const first = this.trendWindow[0];
    const last = this.trendWindow[this.trendWindow.length - 1];
    const threshold = first * 0.1; // 10% change threshold
    
    if (last > first + threshold) return 'increasing';
    if (last < first - threshold) return 'decreasing';
    return 'stable';
  }

  private calculateSeverity(utilization: number): 'low' | 'medium' | 'high' | 'critical' {
    if (utilization > 95) return 'critical';
    if (utilization > 85) return 'high';
    if (utilization > 70) return 'medium';
    return 'low';
  }

  private getSeverityWeight(severity: string): number {
    const weights = { low: 1, medium: 2, high: 3, critical: 4 };
    return weights[severity as keyof typeof weights] || 0;
  }

  private getSamplingRate(level: string): number {
    const rates = { none: 1.0, low: 0.9, medium: 0.7, high: 0.5, critical: 0.2 };
    return rates[level as keyof typeof rates] || 1.0;
  }

  private getBatchSize(level: string): number {
    const sizes = { none: 1, low: 5, medium: 10, high: 20, critical: 50 };
    return sizes[level as keyof typeof sizes] || 1;
  }

  private getDegradationLevelNumber(level: string): number {
    const levels = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    return levels[level as keyof typeof levels] || 0;
  }

  // Méthodes de calcul complexes (simplifiées pour l'exemple)
  private calculateSamplingEffectiveness(metrics: BackpressureMetrics): number {
    return Math.max(0, Math.min(1, 1 - (metrics.sampledMessages / (metrics.sampledMessages + 1000))));
  }

  private calculateBatchingAnalysis(metrics: BackpressureMetrics): { improvement: number } {
    return { improvement: metrics.degradationLevel === 'none' ? 0 : 0.2 };
  }

  private calculatePrioritizationEffectiveness(metrics: BackpressureMetrics): number {
    return 0.8; // Simplified
  }

  private calculateCircuitBreakerStatus(metrics: BackpressureMetrics): {
    openCircuits: string[];
    protectedSubjects: number;
    recoveryAttempts: number;
  } {
    return {
      openCircuits: metrics.circuitBreakerOpen ? ['test.subject'] : [],
      protectedSubjects: metrics.circuitBreakerOpen ? 1 : 0,
      recoveryAttempts: 0
    };
  }

  private estimateLowPriorityDropped(metrics: BackpressureMetrics): number {
    return Math.floor(metrics.droppedMessages * 0.7);
  }

  private estimateHighPriorityPreserved(metrics: BackpressureMetrics): number {
    return Math.floor(metrics.droppedMessages * 0.3);
  }

  private calculateBudgetConsumption(violations: any[]): number {
    return violations.length > 0 ? 0.6 : 0.1;
  }

  private calculateOverallBudgetConsumption(violations: any[]): number {
    return violations.length * 0.2;
  }

  private estimateRecoveryTime(reasons: BackpressureReason[], violations: any[]): number {
    const baseTime = reasons.length * 30; // 30 seconds per reason
    const sloMultiplier = violations.length > 0 ? 2 : 1;
    return baseTime * sloMultiplier;
  }

  private calculateRiskLevel(budgetConsumption: number, reasons: BackpressureReason[]): 'low' | 'medium' | 'high' | 'critical' {
    if (budgetConsumption > 0.8 || reasons.some(r => r.severity === 'critical')) return 'critical';
    if (budgetConsumption > 0.6 || reasons.some(r => r.severity === 'high')) return 'high';
    if (budgetConsumption > 0.3 || reasons.some(r => r.severity === 'medium')) return 'medium';
    return 'low';
  }

  private calculateNextLevelThreshold(metrics: BackpressureMetrics, thresholds: any): number {
    return thresholds.maxMemoryUsageMB * 1.2; // Next threshold at 120%
  }

  private estimateTimeToNextLevel(reasons: BackpressureReason[]): number | null {
    const increasingReasons = reasons.filter(r => r.trend === 'increasing');
    if (increasingReasons.length === 0) return null;
    
    // Estimation simplifiée basée sur la tendance
    return 300; // 5 minutes
  }

  private calculateRecoveryProbability(reasons: BackpressureReason[]): number {
    const decreasingReasons = reasons.filter(r => r.trend === 'decreasing').length;
    const totalReasons = reasons.length || 1;
    return decreasingReasons / totalReasons;
  }

  private generateManualRecommendations(reasons: BackpressureReason[], metrics: BackpressureMetrics): string[] {
    const recommendations = [];
    
    if (reasons.some(r => r.type === 'memory' && r.severity === 'critical')) {
      recommendations.push('Scale up memory allocation immediately');
    }
    
    if (reasons.some(r => r.type === 'queue' && r.severity === 'high')) {
      recommendations.push('Increase consumer instances or enable aggressive batching');
    }
    
    if (metrics.circuitBreakerOpen) {
      recommendations.push('Investigate downstream service health and network connectivity');
    }
    
    return recommendations;
  }

  private calculateOptimalBatchSize(reasons: BackpressureReason[]): number {
    const queueReason = reasons.find(r => r.type === 'queue');
    if (queueReason && queueReason.utilizationPercent > 90) {
      return 50;
    }
    return 10;
  }

  private calculateStrategyEffectiveness(previous: ActiveStrategy, current: ActiveStrategy): number {
    // Simplified effectiveness calculation
    const levelImprovement = this.getDegradationLevelNumber(previous.degradationLevel) - 
                            this.getDegradationLevelNumber(current.degradationLevel);
    return Math.max(0, Math.min(1, 0.5 + levelImprovement * 0.2));
  }
}