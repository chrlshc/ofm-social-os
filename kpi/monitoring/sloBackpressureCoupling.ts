/**
 * Couplage intelligent entre les SLO et le système de backpressure
 * Gestion unifiée de la qualité de service
 */

import { EventEmitter } from 'events';
import { SLOManager, ServiceLevelObjective } from './slo';
import { BackpressureManager, BackpressureConfig } from '../streaming/backpressureManager';
import { BackpressureStrategyManager, ActiveStrategy } from '../streaming/backpressureStrategy';
import { streamingMetrics } from './metrics';

export interface SLOBackpressureRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  trigger: {
    sloNames: string[];
    budgetThreshold: number;        // 0-1 (0.2 = 20% budget remaining)
    violationCount: number;         // Number of simultaneous violations
    timeWindow: string;             // Time window for evaluation
  };
  action: {
    type: 'adjust_config' | 'force_degradation' | 'enable_circuit_breaker' | 'emergency_mode';
    parameters: {
      degradationLevel?: 'low' | 'medium' | 'high' | 'critical';
      configAdjustments?: Partial<BackpressureConfig>;
      circuitBreakerSubjects?: string[];
      emergencyConfig?: Partial<BackpressureConfig>;
    };
    autoRevert: boolean;
    revertConditions: {
      budgetRecovery: number;       // Budget level for auto-revert
      timeDelay: number;            // Minimum time before revert (ms)
      manualApproval: boolean;      // Require manual approval for revert
    };
  };
  metadata: {
    description: string;
    businessImpact: string;
    lastTriggered?: Date;
    triggerCount: number;
    effectiveness: number;          // 0-1 based on historical performance
  };
}

export interface CouplingMetrics {
  activeRules: number;
  triggeredRules: number;
  preventedViolations: number;
  budgetPreserved: number;
  adjustmentEffectiveness: number;
  lastCouplingAction: Date | null;
}

export interface AdaptiveThreshold {
  sloName: string;
  originalTarget: number;
  adaptiveTarget: number;
  reason: string;
  adjustmentFactor: number;
  validUntil: Date;
  confidence: number;
}

export class SLOBackpressureCoupling extends EventEmitter {
  private sloManager: SLOManager;
  private backpressureManager: BackpressureManager;
  private strategyManager: BackpressureStrategyManager;
  private rules: Map<string, SLOBackpressureRule> = new Map();
  private adaptiveThresholds: Map<string, AdaptiveThreshold> = new Map();
  private couplingMetrics: CouplingMetrics;
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private actionHistory: Array<{
    timestamp: Date;
    rule: string;
    action: string;
    trigger: any;
    result: any;
  }> = [];

  constructor(
    sloManager: SLOManager,
    backpressureManager: BackpressureManager,
    strategyManager: BackpressureStrategyManager
  ) {
    super();
    
    this.sloManager = sloManager;
    this.backpressureManager = backpressureManager;
    this.strategyManager = strategyManager;
    
    this.couplingMetrics = {
      activeRules: 0,
      triggeredRules: 0,
      preventedViolations: 0,
      budgetPreserved: 0,
      adjustmentEffectiveness: 0,
      lastCouplingAction: null
    };

    this.initializeDefaultRules();
    this.setupEventHandlers();
  }

  /**
   * Initialiser les règles de couplage par défaut
   */
  private initializeDefaultRules(): void {
    // Règle critique: Budget SLO épuisé
    this.addRule({
      id: 'critical_budget_exhaustion',
      name: 'Critical SLO Budget Exhaustion',
      enabled: true,
      priority: 'critical',
      trigger: {
        sloNames: ['etl_success_rate', 'api_response_time'],
        budgetThreshold: 0.1, // 10% budget remaining
        violationCount: 2,
        timeWindow: '5m'
      },
      action: {
        type: 'emergency_mode',
        parameters: {
          emergencyConfig: {
            maxQueueSize: 5000,          // Reduce queue size drastically
            enableSampling: true,         // Force sampling
            enableCircuitBreaker: true,   // Enable circuit breaker
            recoveryThresholdPercent: 40  // Lower recovery threshold
          }
        },
        autoRevert: true,
        revertConditions: {
          budgetRecovery: 0.3,  // 30% budget recovery
          timeDelay: 300000,    // 5 minutes minimum
          manualApproval: false
        }
      },
      metadata: {
        description: 'Emergency response when SLO budget is critically low',
        businessImpact: 'Prevents complete SLO failure and service degradation',
        triggerCount: 0,
        effectiveness: 0.9
      }
    });

    // Règle haute priorité: Détection précoce de dégradation
    this.addRule({
      id: 'early_degradation_detection',
      name: 'Early SLO Degradation Detection',
      enabled: true,
      priority: 'high',
      trigger: {
        sloNames: ['etl_processing_latency', 'analytics_completion_time'],
        budgetThreshold: 0.3, // 30% budget remaining
        violationCount: 1,
        timeWindow: '10m'
      },
      action: {
        type: 'adjust_config',
        parameters: {
          configAdjustments: {
            maxPublishRate: 800,          // Reduce publish rate by 20%
            enableBatching: true,         // Enable batching
            recoveryDelayMs: 30000        // Increase recovery delay
          }
        },
        autoRevert: true,
        revertConditions: {
          budgetRecovery: 0.5,
          timeDelay: 600000,    // 10 minutes
          manualApproval: false
        }
      },
      metadata: {
        description: 'Proactive adjustment when SLO budget starts depleting',
        businessImpact: 'Prevents escalation to critical state',
        triggerCount: 0,
        effectiveness: 0.75
      }
    });

    // Règle de protection streaming
    this.addRule({
      id: 'streaming_protection',
      name: 'Streaming SLO Protection',
      enabled: true,
      priority: 'medium',
      trigger: {
        sloNames: ['nats_publish_latency', 'streaming_consumer_lag'],
        budgetThreshold: 0.4, // 40% budget remaining
        violationCount: 1,
        timeWindow: '15m'
      },
      action: {
        type: 'enable_circuit_breaker',
        parameters: {
          circuitBreakerSubjects: ['kpi.marketing.*', 'kpi.analytics.*']
        },
        autoRevert: true,
        revertConditions: {
          budgetRecovery: 0.6,
          timeDelay: 180000,    // 3 minutes
          manualApproval: false
        }
      },
      metadata: {
        description: 'Protect streaming infrastructure from overload',
        businessImpact: 'Maintains streaming reliability during high load',
        triggerCount: 0,
        effectiveness: 0.8
      }
    });

    // Règle adaptative des seuils
    this.addRule({
      id: 'adaptive_threshold_adjustment',
      name: 'Adaptive SLO Threshold Management',
      enabled: true,
      priority: 'medium',
      trigger: {
        sloNames: ['*'], // All SLOs
        budgetThreshold: 0.2, // 20% budget remaining
        violationCount: 3,    // Multiple violations
        timeWindow: '1h'
      },
      action: {
        type: 'adjust_config',
        parameters: {
          configAdjustments: {
            maxMemoryUsageMB: 1536,       // Increase memory threshold
            maxQueueSize: 75000,          // Increase queue capacity
            enablePrioritization: true    // Enable prioritization
          }
        },
        autoRevert: true,
        revertConditions: {
          budgetRecovery: 0.4,
          timeDelay: 1800000,   // 30 minutes
          manualApproval: true  // Require manual approval for revert
        }
      },
      metadata: {
        description: 'Dynamically adjust thresholds based on SLO performance',
        businessImpact: 'Optimizes system performance vs. SLO compliance',
        triggerCount: 0,
        effectiveness: 0.7
      }
    });
  }

  /**
   * Configuration des event handlers
   */
  private setupEventHandlers(): void {
    // Écouter les changements de stratégie
    this.strategyManager.on('strategy_changed', (event) => {
      this.evaluateRules(event.current);
    });

    // Écouter les violations SLO
    this.sloManager.on('slo_violation', (violation) => {
      this.handleSLOViolation(violation);
    });

    // Écouter les changements de budget
    this.sloManager.on('budget_depleted', (budget) => {
      this.handleBudgetDepletion(budget);
    });
  }

  /**
   * Démarrer le monitoring du couplage
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    
    // Évaluation périodique des règles
    this.monitoringInterval = setInterval(async () => {
      await this.periodicEvaluation();
    }, 60000); // Toutes les minutes

    this.emit('monitoring_started');
    console.log('SLO-Backpressure coupling monitoring started');
  }

  /**
   * Arrêter le monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoring_stopped');
    console.log('SLO-Backpressure coupling monitoring stopped');
  }

  /**
   * Évaluation périodique des règles
   */
  private async periodicEvaluation(): Promise<void> {
    try {
      // Obtenir l'état actuel des SLO
      const sloEvaluation = await this.sloManager.evaluateAllSLOs();
      
      // Obtenir la stratégie actuelle
      const currentStrategy = this.strategyManager.getCurrentStrategy();
      
      if (!currentStrategy) return;

      // Évaluer toutes les règles actives
      for (const rule of this.rules.values()) {
        if (rule.enabled) {
          await this.evaluateRule(rule, sloEvaluation, currentStrategy);
        }
      }

      // Mettre à jour les métriques
      this.updateCouplingMetrics();

    } catch (error) {
      console.error('Periodic SLO-Backpressure evaluation failed:', error);
      this.emit('evaluation_error', error);
    }
  }

  /**
   * Évaluer une règle spécifique
   */
  private async evaluateRule(
    rule: SLOBackpressureRule,
    sloEvaluation: any,
    currentStrategy: ActiveStrategy
  ): Promise<void> {
    
    // Vérifier les conditions de déclenchement
    const shouldTrigger = await this.shouldTriggerRule(rule, sloEvaluation, currentStrategy);
    
    if (shouldTrigger) {
      await this.triggerRule(rule, sloEvaluation, currentStrategy);
    }

    // Vérifier les conditions de revert
    if (rule.action.autoRevert) {
      const shouldRevert = await this.shouldRevertRule(rule, sloEvaluation);
      if (shouldRevert) {
        await this.revertRule(rule, sloEvaluation);
      }
    }
  }

  /**
   * Vérifier si une règle doit être déclenchée
   */
  private async shouldTriggerRule(
    rule: SLOBackpressureRule,
    sloEvaluation: any,
    currentStrategy: ActiveStrategy
  ): Promise<boolean> {
    
    // Filtrer les SLO concernés
    const relevantSLOs = sloEvaluation.violations.filter((violation: any) => {
      if (rule.trigger.sloNames.includes('*')) return true;
      return rule.trigger.sloNames.includes(violation.slo.name);
    });

    // Vérifier le nombre de violations
    if (relevantSLOs.length < rule.trigger.violationCount) {
      return false;
    }

    // Vérifier le budget restant
    const budgetConsumption = currentStrategy.sloImpact.budgetConsumption;
    const budgetRemaining = 1 - budgetConsumption;
    
    if (budgetRemaining > rule.trigger.budgetThreshold) {
      return false;
    }

    // Vérifier si la règle n'a pas été déclenchée récemment
    const cooldownPeriod = this.calculateCooldownPeriod(rule);
    if (rule.metadata.lastTriggered) {
      const timeSinceLastTrigger = Date.now() - rule.metadata.lastTriggered.getTime();
      if (timeSinceLastTrigger < cooldownPeriod) {
        return false;
      }
    }

    return true;
  }

  /**
   * Déclencher une règle
   */
  private async triggerRule(
    rule: SLOBackpressureRule,
    sloEvaluation: any,
    currentStrategy: ActiveStrategy
  ): Promise<void> {
    
    console.log(`Triggering SLO-Backpressure rule: ${rule.name}`);
    
    try {
      let result: any = null;

      switch (rule.action.type) {
        case 'adjust_config':
          result = await this.adjustBackpressureConfig(rule.action.parameters.configAdjustments);
          break;
          
        case 'force_degradation':
          result = await this.forceDegradation(rule.action.parameters.degradationLevel);
          break;
          
        case 'enable_circuit_breaker':
          result = await this.enableCircuitBreakers(rule.action.parameters.circuitBreakerSubjects);
          break;
          
        case 'emergency_mode':
          result = await this.activateEmergencyMode(rule.action.parameters.emergencyConfig);
          break;
      }

      // Enregistrer l'action
      this.recordAction(rule, sloEvaluation, result);
      
      // Mettre à jour les métadonnées de la règle
      rule.metadata.lastTriggered = new Date();
      rule.metadata.triggerCount++;
      
      // Émettre un événement
      this.emit('rule_triggered', {
        rule,
        sloEvaluation,
        currentStrategy,
        result
      });

      // Mettre à jour les métriques
      this.couplingMetrics.triggeredRules++;
      this.couplingMetrics.lastCouplingAction = new Date();

    } catch (error) {
      console.error(`Failed to trigger rule ${rule.name}:`, error);
      this.emit('rule_trigger_failed', { rule, error });
    }
  }

  /**
   * Vérifier si une règle doit être annulée
   */
  private async shouldRevertRule(
    rule: SLOBackpressureRule,
    sloEvaluation: any
  ): Promise<boolean> {
    
    if (!rule.metadata.lastTriggered) return false;

    // Vérifier le délai minimum
    const timeSinceTriggered = Date.now() - rule.metadata.lastTriggered.getTime();
    if (timeSinceTriggered < rule.action.revertConditions.timeDelay) {
      return false;
    }

    // Vérifier la récupération du budget
    const currentBudget = await this.calculateCurrentBudget(rule.trigger.sloNames);
    if (currentBudget < rule.action.revertConditions.budgetRecovery) {
      return false;
    }

    // Si approbation manuelle requise, vérifier
    if (rule.action.revertConditions.manualApproval) {
      return await this.checkManualApproval(rule);
    }

    return true;
  }

  /**
   * Annuler les effets d'une règle
   */
  private async revertRule(
    rule: SLOBackpressureRule,
    sloEvaluation: any
  ): Promise<void> {
    
    console.log(`Reverting SLO-Backpressure rule: ${rule.name}`);
    
    try {
      // Logique de revert selon le type d'action
      switch (rule.action.type) {
        case 'adjust_config':
        case 'emergency_mode':
          await this.revertConfigChanges(rule);
          break;
          
        case 'enable_circuit_breaker':
          await this.closeCircuitBreakers(rule.action.parameters.circuitBreakerSubjects);
          break;
      }

      this.emit('rule_reverted', { rule, sloEvaluation });

    } catch (error) {
      console.error(`Failed to revert rule ${rule.name}:`, error);
      this.emit('rule_revert_failed', { rule, error });
    }
  }

  /**
   * Actions spécifiques
   */
  private async adjustBackpressureConfig(adjustments?: Partial<BackpressureConfig>): Promise<any> {
    if (!adjustments) return { status: 'no_adjustments' };
    
    this.backpressureManager.updateConfig(adjustments);
    
    return {
      status: 'config_adjusted',
      adjustments,
      timestamp: new Date()
    };
  }

  private async forceDegradation(level?: string): Promise<any> {
    // Cette méthode nécessiterait une extension du BackpressureManager
    // pour permettre le forçage manuel du niveau de dégradation
    console.log(`Force degradation to level: ${level}`);
    
    return {
      status: 'degradation_forced',
      level,
      timestamp: new Date()
    };
  }

  private async enableCircuitBreakers(subjects?: string[]): Promise<any> {
    if (!subjects) return { status: 'no_subjects' };
    
    subjects.forEach(subject => {
      this.backpressureManager.openCircuitBreaker(subject);
    });
    
    return {
      status: 'circuit_breakers_enabled',
      subjects,
      timestamp: new Date()
    };
  }

  private async activateEmergencyMode(config?: Partial<BackpressureConfig>): Promise<any> {
    if (!config) return { status: 'no_config' };
    
    // Sauvegarder la config actuelle pour revert
    const currentConfig = this.backpressureManager.getConfig();
    
    // Appliquer la config d'urgence
    this.backpressureManager.updateConfig(config);
    
    return {
      status: 'emergency_mode_activated',
      emergencyConfig: config,
      previousConfig: currentConfig,
      timestamp: new Date()
    };
  }

  /**
   * Gestion des seuils adaptatifs
   */
  async createAdaptiveThreshold(
    sloName: string,
    adjustmentFactor: number,
    reason: string,
    validityHours: number = 24
  ): Promise<AdaptiveThreshold> {
    
    // Trouver le SLO original
    const originalSLO = await this.findSLOByName(sloName);
    if (!originalSLO) {
      throw new Error(`SLO not found: ${sloName}`);
    }

    const adaptiveThreshold: AdaptiveThreshold = {
      sloName,
      originalTarget: originalSLO.target,
      adaptiveTarget: originalSLO.target * adjustmentFactor,
      reason,
      adjustmentFactor,
      validUntil: new Date(Date.now() + validityHours * 60 * 60 * 1000),
      confidence: this.calculateAdaptiveConfidence(sloName, adjustmentFactor)
    };

    this.adaptiveThresholds.set(sloName, adaptiveThreshold);
    
    this.emit('adaptive_threshold_created', adaptiveThreshold);
    
    return adaptiveThreshold;
  }

  /**
   * Ajouter une nouvelle règle
   */
  addRule(rule: SLOBackpressureRule): void {
    this.rules.set(rule.id, rule);
    this.couplingMetrics.activeRules = this.rules.size;
    
    this.emit('rule_added', rule);
  }

  /**
   * Supprimer une règle
   */
  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.couplingMetrics.activeRules = this.rules.size;
      this.emit('rule_removed', ruleId);
    }
    return removed;
  }

  /**
   * Obtenir les métriques de couplage
   */
  getCouplingMetrics(): CouplingMetrics {
    return { ...this.couplingMetrics };
  }

  /**
   * Obtenir toutes les règles
   */
  getRules(): SLOBackpressureRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Obtenir les seuils adaptatifs actifs
   */
  getAdaptiveThresholds(): AdaptiveThreshold[] {
    return Array.from(this.adaptiveThresholds.values())
      .filter(threshold => threshold.validUntil > new Date());
  }

  /**
   * Obtenir l'historique des actions
   */
  getActionHistory(limit: number = 100): any[] {
    return this.actionHistory.slice(0, limit);
  }

  /**
   * Méthodes utilitaires privées
   */
  private calculateCooldownPeriod(rule: SLOBackpressureRule): number {
    // Cooldown basé sur la priorité et l'efficacité
    const baseCooldown = 300000; // 5 minutes
    const priorityMultiplier = { low: 2, medium: 1.5, high: 1, critical: 0.5 };
    const effectivenessMultiplier = 2 - rule.metadata.effectiveness;
    
    return baseCooldown * 
           priorityMultiplier[rule.priority] * 
           effectivenessMultiplier;
  }

  private recordAction(rule: SLOBackpressureRule, trigger: any, result: any): void {
    this.actionHistory.unshift({
      timestamp: new Date(),
      rule: rule.id,
      action: rule.action.type,
      trigger,
      result
    });

    // Maintenir la taille de l'historique
    if (this.actionHistory.length > 1000) {
      this.actionHistory = this.actionHistory.slice(0, 1000);
    }
  }

  private async calculateCurrentBudget(sloNames: string[]): Promise<number> {
    // Simplification: retourner un budget moyen
    return 0.7; // 70% de budget restant
  }

  private async checkManualApproval(rule: SLOBackpressureRule): Promise<boolean> {
    // Dans un vrai système, ceci vérifierait une queue d'approbation
    return false;
  }

  private async revertConfigChanges(rule: SLOBackpressureRule): Promise<void> {
    // Logique pour restaurer la configuration précédente
    // Nécessiterait de sauvegarder les configs précédentes
    console.log(`Reverting config changes for rule: ${rule.id}`);
  }

  private async closeCircuitBreakers(subjects?: string[]): Promise<void> {
    // Fermer les circuit breakers (nécessiterait une méthode dans BackpressureManager)
    console.log(`Closing circuit breakers for subjects:`, subjects);
  }

  private async findSLOByName(sloName: string): Promise<ServiceLevelObjective | null> {
    // Trouver un SLO par nom (nécessiterait une méthode dans SLOManager)
    return null;
  }

  private calculateAdaptiveConfidence(sloName: string, adjustmentFactor: number): number {
    // Calculer la confiance dans l'ajustement adaptatif
    return Math.max(0.1, Math.min(1.0, 1 - Math.abs(adjustmentFactor - 1)));
  }

  private updateCouplingMetrics(): void {
    const activeRules = Array.from(this.rules.values()).filter(r => r.enabled);
    this.couplingMetrics.activeRules = activeRules.length;
    
    // Calculer l'efficacité moyenne
    if (activeRules.length > 0) {
      this.couplingMetrics.adjustmentEffectiveness = 
        activeRules.reduce((sum, rule) => sum + rule.metadata.effectiveness, 0) / activeRules.length;
    }
  }

  private async evaluateRules(currentStrategy: ActiveStrategy): Promise<void> {
    // Méthode appelée quand la stratégie change
    console.log(`Evaluating rules due to strategy change: ${currentStrategy.degradationLevel}`);
  }

  private async handleSLOViolation(violation: any): Promise<void> {
    console.log('Handling SLO violation:', violation);
  }

  private async handleBudgetDepletion(budget: any): Promise<void> {
    console.log('Handling budget depletion:', budget);
  }
}

/**
 * Factory pour créer le couplage SLO-Backpressure
 */
export function createSLOBackpressureCoupling(
  sloManager: SLOManager,
  backpressureManager: BackpressureManager,
  strategyManager: BackpressureStrategyManager
): SLOBackpressureCoupling {
  return new SLOBackpressureCoupling(sloManager, backpressureManager, strategyManager);
}