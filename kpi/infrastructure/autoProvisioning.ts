/**
 * Système d'auto-provisionnement intelligent basé sur le backpressure
 * Intégration Kubernetes/Cloud pour scaling automatique
 */

import { EventEmitter } from 'events';
import { BackpressureStrategyManager, ActiveStrategy } from '../streaming/backpressureStrategy';
import { BackpressureManager } from '../streaming/backpressureManager';
import { SLOManager } from '../monitoring/slo';
import { streamingMetrics } from '../monitoring/metrics';
import * as k8s from '@kubernetes/client-node';

export interface ScalingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  trigger: {
    degradationLevel: ('low' | 'medium' | 'high' | 'critical')[];
    durationSeconds: number;        // Durée minimum avant déclenchement
    sloViolations: number;          // Nombre de violations SLO
    budgetThreshold: number;        // Seuil de budget SLO (0-1)
    customMetrics?: {
      [metricName: string]: {
        threshold: number;
        operator: 'gt' | 'lt' | 'eq';
      };
    };
  };
  scaling: {
    service: string;                // Service à scaler
    namespace: string;              // Namespace Kubernetes
    targetType: 'deployment' | 'statefulset' | 'replicaset';
    minReplicas: number;
    maxReplicas: number;
    scalingFactor: number;          // Multiplicateur (ex: 1.5 = +50%)
    strategy: 'immediate' | 'gradual' | 'predictive';
  };
  conditions: {
    timeWindows?: Array<{          // Fenêtres temporelles autorisées
      start: string;               // HH:MM
      end: string;                 // HH:MM
      timezone: string;
    }>;
    environmentRestrictions?: string[]; // dev, staging, prod
    resourceLimits?: {
      maxCpuCores: number;
      maxMemoryGB: number;
      maxCost: number;             // Budget maximum
    };
    dependencyChecks?: string[];    // Services dépendants à vérifier
  };
  rollback: {
    enabled: boolean;
    conditions: {
      recoveryDurationMinutes: number;  // Durée de récupération avant rollback
      loadThreshold: number;            // Seuil de charge pour rollback
      costThreshold: number;            // Seuil de coût pour rollback
    };
    strategy: 'gradual' | 'immediate';
  };
  metadata: {
    description: string;
    businessJustification: string;
    estimatedCost: number;
    lastTriggered?: Date;
    triggerCount: number;
    effectiveness: number;
    averageRecoveryTime: number;
  };
}

export interface ProvisioningMetrics {
  activeRules: number;
  totalScalingEvents: number;
  successfulScalings: number;
  failedScalings: number;
  costSavings: number;
  performanceImprovement: number;
  lastScalingAction: Date | null;
  currentExtraReplicas: number;
}

export interface CloudProvider {
  name: 'kubernetes' | 'aws' | 'gcp' | 'azure';
  client: any;
  config: any;
}

export class AutoProvisioningManager extends EventEmitter {
  private strategyManager: BackpressureStrategyManager;
  private backpressureManager: BackpressureManager;
  private sloManager: SLOManager;
  private scalingRules: Map<string, ScalingRule> = new Map();
  private cloudProviders: Map<string, CloudProvider> = new Map();
  private provisioningMetrics: ProvisioningMetrics;
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private scalingHistory: Array<{
    timestamp: Date;
    rule: string;
    action: 'scale_up' | 'scale_down';
    fromReplicas: number;
    toReplicas: number;
    reason: string;
    success: boolean;
    duration: number;
    cost: number;
  }> = [];

  constructor(
    strategyManager: BackpressureStrategyManager,
    backpressureManager: BackpressureManager,
    sloManager: SLOManager
  ) {
    super();
    
    this.strategyManager = strategyManager;
    this.backpressureManager = backpressureManager;
    this.sloManager = sloManager;
    
    this.provisioningMetrics = {
      activeRules: 0,
      totalScalingEvents: 0,
      successfulScalings: 0,
      failedScalings: 0,
      costSavings: 0,
      performanceImprovement: 0,
      lastScalingAction: null,
      currentExtraReplicas: 0
    };

    this.initializeDefaultRules();
    this.setupCloudProviders();
    this.setupEventHandlers();
  }

  /**
   * Initialiser les règles de scaling par défaut
   */
  private initializeDefaultRules(): void {
    // Règle critique: Scaling d'urgence
    this.addScalingRule({
      id: 'emergency_scaling',
      name: 'Emergency Scaling for Critical Load',
      enabled: true,
      priority: 'critical',
      trigger: {
        degradationLevel: ['critical'],
        durationSeconds: 30,
        sloViolations: 3,
        budgetThreshold: 0.1
      },
      scaling: {
        service: 'kpi-analytics-api',
        namespace: 'production',
        targetType: 'deployment',
        minReplicas: 3,
        maxReplicas: 20,
        scalingFactor: 2.0,
        strategy: 'immediate'
      },
      conditions: {
        environmentRestrictions: ['production'],
        resourceLimits: {
          maxCpuCores: 100,
          maxMemoryGB: 200,
          maxCost: 1000
        }
      },
      rollback: {
        enabled: true,
        conditions: {
          recoveryDurationMinutes: 10,
          loadThreshold: 0.6,
          costThreshold: 500
        },
        strategy: 'gradual'
      },
      metadata: {
        description: 'Emergency scaling when system reaches critical state',
        businessJustification: 'Prevent service degradation and SLO violations',
        estimatedCost: 200,
        triggerCount: 0,
        effectiveness: 0.9,
        averageRecoveryTime: 180
      }
    });

    // Règle proactive: Scaling prédictif
    this.addScalingRule({
      id: 'predictive_scaling',
      name: 'Predictive Scaling for High Load',
      enabled: true,
      priority: 'high',
      trigger: {
        degradationLevel: ['high'],
        durationSeconds: 120,
        sloViolations: 1,
        budgetThreshold: 0.3
      },
      scaling: {
        service: 'kpi-analytics-api',
        namespace: 'production',
        targetType: 'deployment',
        minReplicas: 3,
        maxReplicas: 15,
        scalingFactor: 1.5,
        strategy: 'gradual'
      },
      conditions: {
        timeWindows: [{
          start: '08:00',
          end: '20:00',
          timezone: 'UTC'
        }],
        resourceLimits: {
          maxCpuCores: 60,
          maxMemoryGB: 120,
          maxCost: 500
        }
      },
      rollback: {
        enabled: true,
        conditions: {
          recoveryDurationMinutes: 15,
          loadThreshold: 0.5,
          costThreshold: 300
        },
        strategy: 'gradual'
      },
      metadata: {
        description: 'Proactive scaling before reaching critical state',
        businessJustification: 'Maintain performance and prevent user impact',
        estimatedCost: 100,
        triggerCount: 0,
        effectiveness: 0.8,
        averageRecoveryTime: 300
      }
    });

    // Règle streaming: Scaling pour NATS
    this.addScalingRule({
      id: 'streaming_scaling',
      name: 'NATS Consumer Scaling',
      enabled: true,
      priority: 'medium',
      trigger: {
        degradationLevel: ['medium', 'high'],
        durationSeconds: 180,
        sloViolations: 0,
        budgetThreshold: 0.5,
        customMetrics: {
          'kpi_nats_consumer_lag': {
            threshold: 1000,
            operator: 'gt'
          }
        }
      },
      scaling: {
        service: 'kpi-nats-consumers',
        namespace: 'production',
        targetType: 'deployment',
        minReplicas: 2,
        maxReplicas: 10,
        scalingFactor: 1.3,
        strategy: 'gradual'
      },
      conditions: {
        dependencyChecks: ['nats-server', 'postgresql']
      },
      rollback: {
        enabled: true,
        conditions: {
          recoveryDurationMinutes: 20,
          loadThreshold: 0.4,
          costThreshold: 200
        },
        strategy: 'gradual'
      },
      metadata: {
        description: 'Scale NATS consumers based on queue lag',
        businessJustification: 'Maintain real-time data processing',
        estimatedCost: 50,
        triggerCount: 0,
        effectiveness: 0.75,
        averageRecoveryTime: 240
      }
    });
  }

  /**
   * Configuration des cloud providers
   */
  private setupCloudProviders(): void {
    // Kubernetes
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      
      const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
      const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
      
      this.cloudProviders.set('kubernetes', {
        name: 'kubernetes',
        client: { apps: k8sApi, core: k8sCoreApi },
        config: kc
      });
      
      console.log('✅ Kubernetes client initialized');
    } catch (error) {
      console.warn('⚠️ Kubernetes client not available:', error.message);
    }

    // AWS (placeholder pour intégration future)
    if (process.env.AWS_ACCESS_KEY_ID) {
      this.cloudProviders.set('aws', {
        name: 'aws',
        client: null, // AWS SDK client
        config: {
          region: process.env.AWS_REGION || 'us-east-1'
        }
      });
    }
  }

  /**
   * Configuration des event handlers
   */
  private setupEventHandlers(): void {
    this.strategyManager.on('strategy_changed', (event) => {
      this.evaluateScalingRules(event.current);
    });

    this.backpressureManager.on('degradation_level_changed', (event) => {
      if (event.newLevel === 'critical') {
        this.triggerEmergencyScaling(event);
      }
    });

    this.sloManager.on('slo_violation', (violation) => {
      this.handleSLOViolation(violation);
    });
  }

  /**
   * Démarrer le monitoring auto-provisioning
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    
    this.monitoringInterval = setInterval(async () => {
      await this.periodicEvaluation();
    }, 30000); // Toutes les 30 secondes

    this.emit('monitoring_started');
    console.log('🚀 Auto-provisioning monitoring started');
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
    console.log('🛑 Auto-provisioning monitoring stopped');
  }

  /**
   * Évaluation périodique des règles
   */
  private async periodicEvaluation(): Promise<void> {
    try {
      const currentStrategy = this.strategyManager.getCurrentStrategy();
      if (!currentStrategy) return;

      for (const rule of this.scalingRules.values()) {
        if (rule.enabled) {
          await this.evaluateScalingRule(rule, currentStrategy);
        }
      }

      // Évaluer les rollbacks
      await this.evaluateRollbacks();

      // Mettre à jour les métriques
      this.updateProvisioningMetrics();

    } catch (error) {
      console.error('❌ Auto-provisioning evaluation failed:', error);
      this.emit('evaluation_error', error);
    }
  }

  /**
   * Évaluer une règle de scaling spécifique
   */
  private async evaluateScalingRule(rule: ScalingRule, strategy: ActiveStrategy): Promise<void> {
    const shouldTrigger = await this.shouldTriggerScaling(rule, strategy);
    
    if (shouldTrigger) {
      await this.executeScaling(rule, strategy);
    }
  }

  /**
   * Vérifier si le scaling doit être déclenché
   */
  private async shouldTriggerScaling(rule: ScalingRule, strategy: ActiveStrategy): Promise<boolean> {
    // Vérifier le niveau de dégradation
    if (!rule.trigger.degradationLevel.includes(strategy.degradationLevel)) {
      return false;
    }

    // Vérifier la durée
    const durationThreshold = rule.trigger.durationSeconds * 1000;
    const timeSinceChange = Date.now() - strategy.timestamp.getTime();
    if (timeSinceChange < durationThreshold) {
      return false;
    }

    // Vérifier les violations SLO
    if (strategy.sloImpact.violatedSLOs.length < rule.trigger.sloViolations) {
      return false;
    }

    // Vérifier le budget SLO
    if (strategy.sloImpact.budgetConsumption > (1 - rule.trigger.budgetThreshold)) {
      return false;
    }

    // Vérifier les fenêtres temporelles
    if (!this.isWithinTimeWindow(rule.conditions.timeWindows)) {
      return false;
    }

    // Vérifier les limites de ressources
    if (!await this.checkResourceLimits(rule)) {
      return false;
    }

    // Vérifier les métriques custom
    if (rule.trigger.customMetrics) {
      const customMetricsMatch = await this.checkCustomMetrics(rule.trigger.customMetrics);
      if (!customMetricsMatch) return false;
    }

    // Vérifier les dépendances
    if (rule.conditions.dependencyChecks) {
      const dependenciesHealthy = await this.checkDependencies(rule.conditions.dependencyChecks);
      if (!dependenciesHealthy) return false;
    }

    return true;
  }

  /**
   * Exécuter le scaling
   */
  private async executeScaling(rule: ScalingRule, strategy: ActiveStrategy): Promise<void> {
    console.log(`🚀 Executing scaling rule: ${rule.name}`);
    
    const startTime = Date.now();
    let success = false;
    let fromReplicas = 0;
    let toReplicas = 0;

    try {
      // Obtenir le nombre actuel de replicas
      fromReplicas = await this.getCurrentReplicas(rule.scaling);
      
      // Calculer le nouveau nombre de replicas
      toReplicas = this.calculateNewReplicas(rule, fromReplicas);
      
      // Valider les limites
      toReplicas = Math.max(rule.scaling.minReplicas, 
                           Math.min(rule.scaling.maxReplicas, toReplicas));

      if (toReplicas === fromReplicas) {
        console.log(`⚡ No scaling needed for ${rule.scaling.service}: already at ${fromReplicas} replicas`);
        return;
      }

      // Exécuter le scaling selon la stratégie
      switch (rule.scaling.strategy) {
        case 'immediate':
          await this.scaleImmediate(rule.scaling, toReplicas);
          break;
        case 'gradual':
          await this.scaleGradual(rule.scaling, fromReplicas, toReplicas);
          break;
        case 'predictive':
          await this.scalePredictive(rule.scaling, fromReplicas, toReplicas, strategy);
          break;
      }

      success = true;
      
      // Mettre à jour les métriques
      rule.metadata.lastTriggered = new Date();
      rule.metadata.triggerCount++;
      this.provisioningMetrics.successfulScalings++;
      this.provisioningMetrics.currentExtraReplicas += (toReplicas - fromReplicas);

      console.log(`✅ Scaling completed: ${rule.scaling.service} scaled from ${fromReplicas} to ${toReplicas} replicas`);

    } catch (error) {
      console.error(`❌ Scaling failed for ${rule.name}:`, error);
      this.provisioningMetrics.failedScalings++;
      success = false;
    }

    // Enregistrer dans l'historique
    const duration = Date.now() - startTime;
    const estimatedCost = this.calculateScalingCost(rule, fromReplicas, toReplicas);
    
    this.scalingHistory.unshift({
      timestamp: new Date(),
      rule: rule.id,
      action: toReplicas > fromReplicas ? 'scale_up' : 'scale_down',
      fromReplicas,
      toReplicas,
      reason: strategy.primaryReason.type,
      success,
      duration,
      cost: estimatedCost
    });

    // Limiter l'historique
    if (this.scalingHistory.length > 100) {
      this.scalingHistory = this.scalingHistory.slice(0, 100);
    }

    // Émettre événement
    this.emit('scaling_executed', {
      rule,
      strategy,
      fromReplicas,
      toReplicas,
      success,
      duration,
      cost: estimatedCost
    });

    this.provisioningMetrics.totalScalingEvents++;
    this.provisioningMetrics.lastScalingAction = new Date();
  }

  /**
   * Scaling immédiat
   */
  private async scaleImmediate(scalingConfig: ScalingRule['scaling'], targetReplicas: number): Promise<void> {
    const k8sProvider = this.cloudProviders.get('kubernetes');
    if (!k8sProvider) {
      throw new Error('Kubernetes provider not available');
    }

    const patch = {
      spec: {
        replicas: targetReplicas
      }
    };

    await k8sProvider.client.apps.patchNamespacedDeployment(
      scalingConfig.service,
      scalingConfig.namespace,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { 'Content-Type': 'application/merge-patch+json' } }
    );

    console.log(`📈 Immediate scaling: ${scalingConfig.service} to ${targetReplicas} replicas`);
  }

  /**
   * Scaling graduel
   */
  private async scaleGradual(
    scalingConfig: ScalingRule['scaling'], 
    fromReplicas: number, 
    toReplicas: number
  ): Promise<void> {
    const steps = Math.abs(toReplicas - fromReplicas);
    const stepSize = steps > 3 ? Math.ceil(steps / 3) : 1;
    const direction = toReplicas > fromReplicas ? 1 : -1;

    let currentReplicas = fromReplicas;
    
    while (currentReplicas !== toReplicas) {
      const nextReplicas = Math.min(Math.max(
        currentReplicas + (stepSize * direction),
        scalingConfig.minReplicas
      ), scalingConfig.maxReplicas);

      if (nextReplicas === currentReplicas) break;

      await this.scaleImmediate(scalingConfig, nextReplicas);
      
      console.log(`📊 Gradual scaling step: ${scalingConfig.service} to ${nextReplicas} replicas`);
      
      // Attendre entre les étapes
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 secondes
      
      currentReplicas = nextReplicas;
    }
  }

  /**
   * Scaling prédictif
   */
  private async scalePredictive(
    scalingConfig: ScalingRule['scaling'],
    fromReplicas: number,
    toReplicas: number,
    strategy: ActiveStrategy
  ): Promise<void> {
    // Analyser les prédictions de charge
    const predictedLoad = this.predictFutureLoad(strategy);
    
    // Ajuster le target selon les prédictions
    const adjustedTarget = this.adjustTargetBasedOnPrediction(toReplicas, predictedLoad);
    
    console.log(`🔮 Predictive scaling: adjusted target from ${toReplicas} to ${adjustedTarget} based on predictions`);
    
    // Exécuter le scaling graduel vers le target ajusté
    await this.scaleGradual(scalingConfig, fromReplicas, adjustedTarget);
  }

  /**
   * Évaluer les rollbacks
   */
  private async evaluateRollbacks(): Promise<void> {
    for (const rule of this.scalingRules.values()) {
      if (rule.rollback.enabled && rule.metadata.lastTriggered) {
        const shouldRollback = await this.shouldRollback(rule);
        if (shouldRollback) {
          await this.executeRollback(rule);
        }
      }
    }
  }

  /**
   * Vérifier si un rollback doit être effectué
   */
  private async shouldRollback(rule: ScalingRule): Promise<boolean> {
    if (!rule.metadata.lastTriggered) return false;

    const timeSinceScaling = Date.now() - rule.metadata.lastTriggered.getTime();
    const recoveryThreshold = rule.rollback.conditions.recoveryDurationMinutes * 60 * 1000;
    
    if (timeSinceScaling < recoveryThreshold) return false;

    // Vérifier le seuil de charge
    const currentStrategy = this.strategyManager.getCurrentStrategy();
    if (!currentStrategy) return false;

    const currentLoad = this.calculateLoadLevel(currentStrategy);
    if (currentLoad > rule.rollback.conditions.loadThreshold) return false;

    // Vérifier le coût
    const currentCost = await this.getCurrentScalingCost(rule);
    if (currentCost > rule.rollback.conditions.costThreshold) return true;

    return true;
  }

  /**
   * Exécuter un rollback
   */
  private async executeRollback(rule: ScalingRule): Promise<void> {
    console.log(`↩️ Executing rollback for rule: ${rule.name}`);
    
    try {
      const currentReplicas = await this.getCurrentReplicas(rule.scaling);
      const targetReplicas = rule.scaling.minReplicas;

      if (rule.rollback.strategy === 'immediate') {
        await this.scaleImmediate(rule.scaling, targetReplicas);
      } else {
        await this.scaleGradual(rule.scaling, currentReplicas, targetReplicas);
      }

      this.provisioningMetrics.currentExtraReplicas -= (currentReplicas - targetReplicas);
      
      this.emit('rollback_executed', { rule, fromReplicas: currentReplicas, toReplicas: targetReplicas });

    } catch (error) {
      console.error(`❌ Rollback failed for ${rule.name}:`, error);
    }
  }

  /**
   * Ajouter une règle de scaling
   */
  addScalingRule(rule: ScalingRule): void {
    this.scalingRules.set(rule.id, rule);
    this.provisioningMetrics.activeRules = this.scalingRules.size;
    this.emit('rule_added', rule);
  }

  /**
   * Supprimer une règle de scaling
   */
  removeScalingRule(ruleId: string): boolean {
    const removed = this.scalingRules.delete(ruleId);
    if (removed) {
      this.provisioningMetrics.activeRules = this.scalingRules.size;
      this.emit('rule_removed', ruleId);
    }
    return removed;
  }

  /**
   * Obtenir les métriques de provisioning
   */
  getProvisioningMetrics(): ProvisioningMetrics {
    return { ...this.provisioningMetrics };
  }

  /**
   * Obtenir toutes les règles
   */
  getScalingRules(): ScalingRule[] {
    return Array.from(this.scalingRules.values());
  }

  /**
   * Obtenir l'historique de scaling
   */
  getScalingHistory(limit: number = 50): any[] {
    return this.scalingHistory.slice(0, limit);
  }

  /**
   * Méthodes utilitaires privées
   */
  private async getCurrentReplicas(scalingConfig: ScalingRule['scaling']): Promise<number> {
    const k8sProvider = this.cloudProviders.get('kubernetes');
    if (!k8sProvider) return 3; // Default fallback

    try {
      const response = await k8sProvider.client.apps.readNamespacedDeployment(
        scalingConfig.service,
        scalingConfig.namespace
      );
      return response.body.spec?.replicas || 3;
    } catch (error) {
      console.warn(`⚠️ Could not get current replicas for ${scalingConfig.service}:`, error.message);
      return 3; // Fallback
    }
  }

  private calculateNewReplicas(rule: ScalingRule, currentReplicas: number): number {
    return Math.ceil(currentReplicas * rule.scaling.scalingFactor);
  }

  private calculateLoadLevel(strategy: ActiveStrategy): number {
    const levelMap = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    return levelMap[strategy.degradationLevel] || 0;
  }

  private isWithinTimeWindow(timeWindows?: ScalingRule['conditions']['timeWindows']): boolean {
    if (!timeWindows || timeWindows.length === 0) return true;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    return timeWindows.some(window => {
      const [startHour, startMin] = window.start.split(':').map(Number);
      const [endHour, endMin] = window.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      return currentTime >= startTime && currentTime <= endTime;
    });
  }

  private async checkResourceLimits(rule: ScalingRule): Promise<boolean> {
    if (!rule.conditions.resourceLimits) return true;

    // Vérifications simplifiées - en production, interroger les APIs cloud
    const currentCost = await this.getCurrentScalingCost(rule);
    return currentCost <= rule.conditions.resourceLimits.maxCost;
  }

  private async checkCustomMetrics(customMetrics: NonNullable<ScalingRule['trigger']['customMetrics']>): Promise<boolean> {
    // Simplified check - en production, interroger Prometheus
    return true;
  }

  private async checkDependencies(dependencies: string[]): Promise<boolean> {
    // Simplified check - en production, vérifier la santé des services
    return true;
  }

  private predictFutureLoad(strategy: ActiveStrategy): number {
    // Simplified prediction - en production, utiliser ML/historique
    return strategy.predictedActions.recoveryProbability;
  }

  private adjustTargetBasedOnPrediction(originalTarget: number, predictedLoad: number): number {
    return Math.ceil(originalTarget * (1 + predictedLoad * 0.5));
  }

  private calculateScalingCost(rule: ScalingRule, fromReplicas: number, toReplicas: number): number {
    const extraReplicas = Math.abs(toReplicas - fromReplicas);
    return extraReplicas * 10; // $10 per replica per hour (simplified)
  }

  private async getCurrentScalingCost(rule: ScalingRule): Promise<number> {
    const currentReplicas = await this.getCurrentReplicas(rule.scaling);
    const extraReplicas = Math.max(0, currentReplicas - rule.scaling.minReplicas);
    return extraReplicas * 10; // Simplified cost calculation
  }

  private updateProvisioningMetrics(): void {
    // Calculate cost savings and performance improvements
    const recentHistory = this.scalingHistory.slice(0, 10);
    if (recentHistory.length > 0) {
      this.provisioningMetrics.costSavings = recentHistory
        .filter(h => h.action === 'scale_down')
        .reduce((sum, h) => sum + h.cost, 0);
      
      this.provisioningMetrics.performanceImprovement = recentHistory
        .filter(h => h.action === 'scale_up' && h.success)
        .length / recentHistory.length;
    }
  }

  private async triggerEmergencyScaling(event: any): Promise<void> {
    console.log('🚨 Triggering emergency scaling due to critical degradation');
    // Implementation spécifique pour scaling d'urgence
  }

  private async evaluateScalingRules(strategy: ActiveStrategy): Promise<void> {
    // Évaluer toutes les règles quand la stratégie change
    for (const rule of this.scalingRules.values()) {
      if (rule.enabled) {
        await this.evaluateScalingRule(rule, strategy);
      }
    }
  }

  private handleSLOViolation(violation: any): void {
    console.log('🎯 Handling SLO violation for auto-provisioning:', violation);
  }
}

/**
 * Factory pour créer le gestionnaire d'auto-provisioning
 */
export function createAutoProvisioningManager(
  strategyManager: BackpressureStrategyManager,
  backpressureManager: BackpressureManager,
  sloManager: SLOManager
): AutoProvisioningManager {
  return new AutoProvisioningManager(strategyManager, backpressureManager, sloManager);
}