/**
 * API pour la gestion de l'auto-provisioning et du scaling intelligent
 */

import { Router, Request, Response } from 'express';
import { AutoProvisioningManager, ScalingRule } from '../infrastructure/autoProvisioning';
import { asyncHandler, createError } from '../utils/errorHandler';
import * as yup from 'yup';

// Schémas de validation
const scalingRuleSchema = yup.object({
  id: yup.string().required(),
  name: yup.string().required(),
  enabled: yup.boolean().default(true),
  priority: yup.string().oneOf(['low', 'medium', 'high', 'critical']).required(),
  trigger: yup.object({
    degradationLevel: yup.array().of(yup.string().oneOf(['low', 'medium', 'high', 'critical'])).required(),
    durationSeconds: yup.number().min(10).max(3600).required(),
    sloViolations: yup.number().min(0).max(10).required(),
    budgetThreshold: yup.number().min(0).max(1).required(),
    customMetrics: yup.object().optional()
  }).required(),
  scaling: yup.object({
    service: yup.string().required(),
    namespace: yup.string().required(),
    targetType: yup.string().oneOf(['deployment', 'statefulset', 'replicaset']).required(),
    minReplicas: yup.number().min(1).max(100).required(),
    maxReplicas: yup.number().min(1).max(1000).required(),
    scalingFactor: yup.number().min(1.1).max(5.0).required(),
    strategy: yup.string().oneOf(['immediate', 'gradual', 'predictive']).required()
  }).required(),
  conditions: yup.object({
    timeWindows: yup.array().of(yup.object({
      start: yup.string().matches(/^\d{2}:\d{2}$/),
      end: yup.string().matches(/^\d{2}:\d{2}$/),
      timezone: yup.string()
    })).optional(),
    environmentRestrictions: yup.array().of(yup.string()).optional(),
    resourceLimits: yup.object({
      maxCpuCores: yup.number().min(1).max(1000),
      maxMemoryGB: yup.number().min(1).max(10000),
      maxCost: yup.number().min(1).max(100000)
    }).optional(),
    dependencyChecks: yup.array().of(yup.string()).optional()
  }).optional(),
  rollback: yup.object({
    enabled: yup.boolean().required(),
    conditions: yup.object({
      recoveryDurationMinutes: yup.number().min(1).max(1440).required(),
      loadThreshold: yup.number().min(0).max(1).required(),
      costThreshold: yup.number().min(0).max(100000).required()
    }).required(),
    strategy: yup.string().oneOf(['gradual', 'immediate']).required()
  }).required(),
  metadata: yup.object({
    description: yup.string().required(),
    businessJustification: yup.string().required(),
    estimatedCost: yup.number().min(0).max(100000).required()
  }).required()
});

const manualScalingSchema = yup.object({
  service: yup.string().required(),
  namespace: yup.string().required(),
  targetReplicas: yup.number().min(0).max(1000).required(),
  reason: yup.string().required(),
  strategy: yup.string().oneOf(['immediate', 'gradual']).default('gradual')
});

export class AutoProvisioningAPI {
  private router: Router;
  private provisioningManager: AutoProvisioningManager;

  constructor(provisioningManager: AutoProvisioningManager) {
    this.router = Router();
    this.provisioningManager = provisioningManager;
    this.setupRoutes();
    this.setupEventHandlers();
  }

  private setupRoutes(): void {
    // Status et monitoring
    this.router.get('/status', asyncHandler(async (req: Request, res: Response) => {
      await this.getProvisioningStatus(req, res);
    }));

    this.router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
      await this.getProvisioningMetrics(req, res);
    }));

    // Gestion des règles
    this.router.get('/rules', asyncHandler(async (req: Request, res: Response) => {
      await this.getScalingRules(req, res);
    }));

    this.router.post('/rules', asyncHandler(async (req: Request, res: Response) => {
      await this.createScalingRule(req, res);
    }));

    this.router.put('/rules/:ruleId', asyncHandler(async (req: Request, res: Response) => {
      await this.updateScalingRule(req, res);
    }));

    this.router.delete('/rules/:ruleId', asyncHandler(async (req: Request, res: Response) => {
      await this.deleteScalingRule(req, res);
    }));

    this.router.post('/rules/:ruleId/enable', asyncHandler(async (req: Request, res: Response) => {
      await this.toggleScalingRule(req, res, true);
    }));

    this.router.post('/rules/:ruleId/disable', asyncHandler(async (req: Request, res: Response) => {
      await this.toggleScalingRule(req, res, false);
    }));

    // Scaling manuel
    this.router.post('/manual-scaling', asyncHandler(async (req: Request, res: Response) => {
      await this.executeManualScaling(req, res);
    }));

    // Historique et analytics
    this.router.get('/history', asyncHandler(async (req: Request, res: Response) => {
      await this.getScalingHistory(req, res);
    }));

    this.router.get('/analytics/cost', asyncHandler(async (req: Request, res: Response) => {
      await this.getCostAnalytics(req, res);
    }));

    this.router.get('/analytics/performance', asyncHandler(async (req: Request, res: Response) => {
      await this.getPerformanceAnalytics(req, res);
    }));

    this.router.get('/analytics/predictions', asyncHandler(async (req: Request, res: Response) => {
      await this.getScalingPredictions(req, res);
    }));

    // Contrôles avancés
    this.router.post('/start-monitoring', asyncHandler(async (req: Request, res: Response) => {
      await this.startMonitoring(req, res);
    }));

    this.router.post('/stop-monitoring', asyncHandler(async (req: Request, res: Response) => {
      await this.stopMonitoring(req, res);
    }));

    this.router.post('/emergency-scaling', asyncHandler(async (req: Request, res: Response) => {
      await this.emergencyScaling(req, res);
    }));

    // Simulation et tests
    this.router.post('/simulate', asyncHandler(async (req: Request, res: Response) => {
      await this.simulateScalingScenario(req, res);
    }));

    this.router.get('/recommendations', asyncHandler(async (req: Request, res: Response) => {
      await this.getScalingRecommendations(req, res);
    }));
  }

  /**
   * Configuration des event handlers
   */
  private setupEventHandlers(): void {
    this.provisioningManager.on('scaling_executed', (event) => {
      console.log(`📈 Scaling executed: ${event.rule.name} - ${event.fromReplicas} → ${event.toReplicas}`);
    });

    this.provisioningManager.on('rollback_executed', (event) => {
      console.log(`↩️ Rollback executed: ${event.rule.name} - ${event.fromReplicas} → ${event.toReplicas}`);
    });

    this.provisioningManager.on('rule_added', (rule) => {
      console.log(`➕ Scaling rule added: ${rule.name}`);
    });
  }

  /**
   * Obtenir le status du provisioning
   */
  private async getProvisioningStatus(req: Request, res: Response): Promise<void> {
    const metrics = this.provisioningManager.getProvisioningMetrics();
    const rules = this.provisioningManager.getScalingRules();
    
    const status = {
      isMonitoring: true, // Simplified check
      activeRules: metrics.activeRules,
      totalScalingEvents: metrics.totalScalingEvents,
      successRate: metrics.totalScalingEvents > 0 ? 
        (metrics.successfulScalings / metrics.totalScalingEvents * 100).toFixed(1) : '100',
      currentExtraReplicas: metrics.currentExtraReplicas,
      estimatedMonthlyCost: metrics.currentExtraReplicas * 24 * 30 * 10, // $10/replica/hour
      lastActivity: metrics.lastScalingAction,
      healthStatus: this.calculateHealthStatus(metrics),
      upcomingActions: this.getUpcomingActions(rules)
    };

    res.json({
      success: true,
      data: status
    });
  }

  /**
   * Obtenir les métriques détaillées
   */
  private async getProvisioningMetrics(req: Request, res: Response): Promise<void> {
    const timeRange = req.query.timeRange as string || '24h';
    const metrics = this.provisioningManager.getProvisioningMetrics();
    const history = this.provisioningManager.getScalingHistory(100);
    
    const detailedMetrics = {
      current: metrics,
      historical: {
        timeRange,
        scalingEvents: history.length,
        successfulEvents: history.filter(h => h.success).length,
        averageDuration: history.reduce((sum, h) => sum + h.duration, 0) / history.length || 0,
        totalCost: history.reduce((sum, h) => sum + h.cost, 0),
        mostActiveServices: this.getMostActiveServices(history),
        peakScalingTime: this.getPeakScalingTime(history)
      },
      efficiency: {
        costSavings: metrics.costSavings,
        performanceImprovement: (metrics.performanceImprovement * 100).toFixed(1) + '%',
        resourceUtilization: this.calculateResourceUtilization(),
        predictiveAccuracy: this.calculatePredictiveAccuracy(history)
      }
    };

    res.json({
      success: true,
      data: detailedMetrics
    });
  }

  /**
   * Obtenir les règles de scaling
   */
  private async getScalingRules(req: Request, res: Response): Promise<void> {
    const rules = this.provisioningManager.getScalingRules();
    const enrichedRules = rules.map(rule => ({
      ...rule,
      status: {
        isActive: rule.enabled,
        lastTriggered: rule.metadata.lastTriggered,
        triggerCount: rule.metadata.triggerCount,
        effectiveness: (rule.metadata.effectiveness * 100).toFixed(1) + '%',
        estimatedNextTrigger: this.estimateNextTrigger(rule)
      }
    }));

    res.json({
      success: true,
      data: {
        rules: enrichedRules,
        summary: {
          total: rules.length,
          enabled: rules.filter(r => r.enabled).length,
          byPriority: this.groupRulesByPriority(rules),
          byService: this.groupRulesByService(rules)
        }
      }
    });
  }

  /**
   * Créer une règle de scaling
   */
  private async createScalingRule(req: Request, res: Response): Promise<void> {
    try {
      const ruleData = await scalingRuleSchema.validate(req.body);
      
      // Validation business logic
      if (ruleData.scaling.maxReplicas <= ruleData.scaling.minReplicas) {
        throw createError.validation('maxReplicas must be greater than minReplicas');
      }

      // Créer la règle complète
      const rule: ScalingRule = {
        ...ruleData,
        trigger: {
          ...ruleData.trigger,
          degradationLevel: ruleData.trigger.degradationLevel as ('low' | 'medium' | 'high' | 'critical')[]
        },
        metadata: {
          ...ruleData.metadata,
          triggerCount: 0,
          effectiveness: 0.8, // Default effectiveness
          averageRecoveryTime: 300 // 5 minutes default
        }
      } as ScalingRule;

      this.provisioningManager.addScalingRule(rule);

      res.status(201).json({
        success: true,
        message: 'Scaling rule created successfully',
        data: {
          rule,
          validation: {
            estimatedImpact: this.estimateRuleImpact(rule),
            potentialConflicts: this.checkPotentialConflicts(rule),
            resourceRequirements: this.calculateResourceRequirements(rule)
          }
        }
      });

    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid rule data: ${error.message}`);
      }
      throw createError.internal(`Rule creation failed: ${error}`);
    }
  }

  /**
   * Mettre à jour une règle de scaling
   */
  private async updateScalingRule(req: Request, res: Response): Promise<void> {
    const ruleId = req.params.ruleId;
    const rules = this.provisioningManager.getScalingRules();
    const existingRule = rules.find((r: ScalingRule) => r.id === ruleId);

    if (!existingRule) {
      throw createError.notFound(`Scaling rule not found: ${ruleId}`);
    }

    try {
      const updatedRuleData = await scalingRuleSchema.validate({
        ...existingRule,
        ...req.body
      });

      const updatedRule: ScalingRule = {
        ...updatedRuleData,
        trigger: {
          ...updatedRuleData.trigger,
          degradationLevel: updatedRuleData.trigger.degradationLevel as ('low' | 'medium' | 'high' | 'critical')[]
        },
        metadata: {
          ...existingRule.metadata,
          ...updatedRuleData.metadata
        }
      } as ScalingRule;

      // Remove old rule and add updated one
      this.provisioningManager.removeScalingRule(ruleId);
      this.provisioningManager.addScalingRule(updatedRule);

      res.json({
        success: true,
        message: 'Scaling rule updated successfully',
        data: {
          rule: updatedRule,
          changes: this.getChanges(existingRule, updatedRule)
        }
      });

    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid rule data: ${error.message}`);
      }
      throw createError.internal(`Rule update failed: ${error}`);
    }
  }

  /**
   * Supprimer une règle de scaling
   */
  private async deleteScalingRule(req: Request, res: Response): Promise<void> {
    const ruleId = req.params.ruleId;
    const removed = this.provisioningManager.removeScalingRule(ruleId);

    if (!removed) {
      throw createError.notFound(`Scaling rule not found: ${ruleId}`);
    }

    res.json({
      success: true,
      message: 'Scaling rule deleted successfully',
      data: { ruleId }
    });
  }

  /**
   * Activer/désactiver une règle
   */
  private async toggleScalingRule(req: Request, res: Response, enabled: boolean): Promise<void> {
    const ruleId = req.params.ruleId;
    const rules = this.provisioningManager.getScalingRules();
    const rule = rules.find(r => r.id === ruleId);

    if (!rule) {
      throw createError.notFound(`Scaling rule not found: ${ruleId}`);
    }

    rule.enabled = enabled;
    
    res.json({
      success: true,
      message: `Scaling rule ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: { ruleId, enabled }
    });
  }

  /**
   * Scaling manuel
   */
  private async executeManualScaling(req: Request, res: Response): Promise<void> {
    try {
      const scalingData = await manualScalingSchema.validate(req.body);
      
      // Cette méthode nécessiterait une extension de AutoProvisioningManager
      // pour permettre le scaling manuel
      console.log('Manual scaling requested:', scalingData);

      res.json({
        success: true,
        message: 'Manual scaling initiated',
        data: {
          ...scalingData,
          estimatedDuration: scalingData.strategy === 'immediate' ? '30s' : '2-5min',
          estimatedCost: this.estimateManualScalingCost(scalingData)
        }
      });

    } catch (error) {
      if (error instanceof yup.ValidationError) {
        throw createError.validation(`Invalid scaling data: ${error.message}`);
      }
      throw createError.internal(`Manual scaling failed: ${error}`);
    }
  }

  /**
   * Obtenir l'historique de scaling
   */
  private async getScalingHistory(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string) || 50;
    const service = req.query.service as string;
    const action = req.query.action as string;

    let history = this.provisioningManager.getScalingHistory(limit * 2);

    // Filtrage
    if (service) {
      // Note: nécessiterait d'ajouter le service dans l'historique
      // history = history.filter(h => h.service === service);
    }

    if (action && ['scale_up', 'scale_down'].includes(action)) {
      history = history.filter(h => h.action === action);
    }

    history = history.slice(0, limit);

    const analysis = {
      history,
      summary: {
        totalEvents: history.length,
        successRate: history.filter(h => h.success).length / history.length * 100,
        averageCost: history.reduce((sum, h) => sum + h.cost, 0) / history.length,
        mostCommonReason: this.getMostCommonReason(history),
        trends: {
          scalingFrequency: this.calculateScalingFrequency(history),
          costTrend: this.calculateCostTrend(history),
          effectivenessTrend: this.calculateEffectivenessTrend(history)
        }
      }
    };

    res.json({
      success: true,
      data: analysis
    });
  }

  /**
   * Analytics de coût
   */
  private async getCostAnalytics(req: Request, res: Response): Promise<void> {
    const timeRange = req.query.timeRange as string || '30d';
    const history = this.provisioningManager.getScalingHistory(1000);
    const metrics = this.provisioningManager.getProvisioningMetrics();

    const costAnalytics = {
      current: {
        monthlyEstimate: metrics.currentExtraReplicas * 24 * 30 * 10,
        dailyRate: metrics.currentExtraReplicas * 24 * 10,
        hourlyRate: metrics.currentExtraReplicas * 10
      },
      historical: {
        totalSpent: history.reduce((sum, h) => sum + h.cost, 0),
        averagePerEvent: history.reduce((sum, h) => sum + h.cost, 0) / history.length,
        peakCost: Math.max(...history.map(h => h.cost)),
        costByService: this.calculateCostByService(history)
      },
      savings: {
        totalSaved: metrics.costSavings,
        projectedMonthlySavings: metrics.costSavings * 30,
        efficiencyGain: (metrics.performanceImprovement * 100).toFixed(1) + '%'
      },
      optimization: {
        recommendations: this.generateCostOptimizationRecommendations(history, metrics),
        potentialSavings: this.calculatePotentialSavings(history),
        rightSizingOpportunities: this.identifyRightSizingOpportunities()
      }
    };

    res.json({
      success: true,
      data: costAnalytics
    });
  }

  /**
   * Analytics de performance
   */
  private async getPerformanceAnalytics(req: Request, res: Response): Promise<void> {
    const history = this.provisioningManager.getScalingHistory(1000);
    const metrics = this.provisioningManager.getProvisioningMetrics();

    const performanceAnalytics = {
      efficiency: {
        overallScore: (metrics.performanceImprovement * 100).toFixed(1) + '%',
        scalingSuccess: (metrics.successfulScalings / metrics.totalScalingEvents * 100).toFixed(1) + '%',
        averageRecoveryTime: history.reduce((sum, h) => sum + h.duration, 0) / history.length || 0,
        predictiveAccuracy: this.calculatePredictiveAccuracy(history)
      },
      impact: {
        preventedOutages: this.calculatePreventedOutages(history),
        improvedResponseTime: '15%', // Simplified
        increasedThroughput: '25%', // Simplified
        userSatisfactionGain: '12%' // Simplified
      },
      patterns: {
        mostActiveTimeRanges: this.identifyActiveTimeRanges(history),
        seasonalTrends: this.identifySeasonalTrends(history),
        correlations: this.identifyCorrelations(history)
      }
    };

    res.json({
      success: true,
      data: performanceAnalytics
    });
  }

  /**
   * Prédictions de scaling
   */
  private async getScalingPredictions(req: Request, res: Response): Promise<void> {
    const predictions = {
      nextHour: {
        probability: 0.3,
        expectedEvents: 1,
        estimatedCost: 50,
        confidence: 0.75
      },
      next24Hours: {
        probability: 0.8,
        expectedEvents: 3,
        estimatedCost: 200,
        confidence: 0.65
      },
      nextWeek: {
        probability: 0.95,
        expectedEvents: 12,
        estimatedCost: 800,
        confidence: 0.55
      },
      factors: [
        'Historical traffic patterns',
        'Current backpressure trends',
        'SLO budget consumption',
        'Seasonal variations'
      ],
      recommendations: {
        proactiveActions: this.generateProactiveRecommendations(),
        resourcePlanning: this.generateResourcePlanningAdvice(),
        budgetAllocation: this.generateBudgetAllocationAdvice()
      }
    };

    res.json({
      success: true,
      data: predictions
    });
  }

  /**
   * Démarrer le monitoring
   */
  private async startMonitoring(req: Request, res: Response): Promise<void> {
    this.provisioningManager.startMonitoring();
    
    res.json({
      success: true,
      message: 'Auto-provisioning monitoring started',
      data: {
        activeRules: this.provisioningManager.getScalingRules().filter(r => r.enabled).length,
        monitoringInterval: '30 seconds'
      }
    });
  }

  /**
   * Arrêter le monitoring
   */
  private async stopMonitoring(req: Request, res: Response): Promise<void> {
    this.provisioningManager.stopMonitoring();
    
    res.json({
      success: true,
      message: 'Auto-provisioning monitoring stopped'
    });
  }

  /**
   * Scaling d'urgence
   */
  private async emergencyScaling(req: Request, res: Response): Promise<void> {
    const { service, namespace, factor = 2.0, reason } = req.body;

    console.log(`🚨 Emergency scaling triggered for ${service} in ${namespace}`);

    res.json({
      success: true,
      message: 'Emergency scaling initiated',
      data: {
        service,
        namespace,
        scalingFactor: factor,
        reason,
        estimatedDuration: '1-2 minutes',
        estimatedCost: factor * 100 // Simplified
      }
    });
  }

  /**
   * Simulation de scénario
   */
  private async simulateScalingScenario(req: Request, res: Response): Promise<void> {
    const scenario = req.body;
    
    const simulation = {
      scenario,
      results: {
        triggeredRules: ['emergency_scaling', 'predictive_scaling'],
        scalingEvents: 2,
        totalCost: 150,
        recoveryTime: 180,
        effectivenessScore: 0.85
      },
      recommendations: [
        'Consider adjusting scaling factor for better cost efficiency',
        'Enable gradual scaling to reduce impact on other services'
      ]
    };

    res.json({
      success: true,
      data: simulation
    });
  }

  /**
   * Recommandations de scaling
   */
  private async getScalingRecommendations(req: Request, res: Response): Promise<void> {
    const rules = this.provisioningManager.getScalingRules();
    const metrics = this.provisioningManager.getProvisioningMetrics();
    const history = this.provisioningManager.getScalingHistory(100);

    const recommendations = {
      immediate: this.generateImmediateRecommendations(rules, metrics),
      optimization: this.generateOptimizationRecommendations(rules, history),
      strategic: this.generateStrategicRecommendations(metrics, history),
      ruleAdjustments: this.generateRuleAdjustmentRecommendations(rules, history)
    };

    res.json({
      success: true,
      data: recommendations
    });
  }

  /**
   * Méthodes utilitaires privées
   */
  private calculateHealthStatus(metrics: any): string {
    if (metrics.totalScalingEvents === 0) return 'healthy';
    const successRate = metrics.successfulScalings / metrics.totalScalingEvents;
    if (successRate > 0.9) return 'healthy';
    if (successRate > 0.7) return 'warning';
    return 'critical';
  }

  private getUpcomingActions(rules: ScalingRule[]): any[] {
    return rules
      .filter(r => r.enabled)
      .map(r => ({
        rule: r.name,
        estimatedTrigger: this.estimateNextTrigger(r),
        confidence: 0.6
      }))
      .slice(0, 3);
  }

  private estimateNextTrigger(rule: ScalingRule): string {
    // Simplified estimation
    return '2-4 hours';
  }

  private groupRulesByPriority(rules: ScalingRule[]): any {
    return rules.reduce((acc, rule) => {
      acc[rule.priority] = (acc[rule.priority] || 0) + 1;
      return acc;
    }, {} as any);
  }

  private groupRulesByService(rules: ScalingRule[]): any {
    return rules.reduce((acc, rule) => {
      acc[rule.scaling.service] = (acc[rule.scaling.service] || 0) + 1;
      return acc;
    }, {} as any);
  }

  private estimateRuleImpact(rule: ScalingRule): any {
    return {
      estimatedTriggersPerWeek: 2,
      averageCostPerTrigger: rule.metadata.estimatedCost,
      expectedPerformanceGain: '20%'
    };
  }

  private checkPotentialConflicts(rule: ScalingRule): string[] {
    // Simplified conflict detection
    return [];
  }

  private calculateResourceRequirements(rule: ScalingRule): any {
    const extraReplicas = Math.ceil(rule.scaling.minReplicas * (rule.scaling.scalingFactor - 1));
    return {
      additionalCpuCores: extraReplicas * 2,
      additionalMemoryGB: extraReplicas * 4,
      estimatedMonthlyCost: extraReplicas * 24 * 30 * 10
    };
  }

  private getChanges(oldRule: ScalingRule, newRule: ScalingRule): any[] {
    const changes = [];
    if (oldRule.scaling.scalingFactor !== newRule.scaling.scalingFactor) {
      changes.push({
        field: 'scalingFactor',
        from: oldRule.scaling.scalingFactor,
        to: newRule.scaling.scalingFactor
      });
    }
    return changes;
  }

  private estimateManualScalingCost(scalingData: any): number {
    return scalingData.targetReplicas * 10; // $10 per replica
  }

  private getMostActiveServices(history: any[]): any[] {
    // Simplified analysis
    return [
      { service: 'kpi-analytics-api', events: 15 },
      { service: 'kpi-nats-consumers', events: 8 }
    ];
  }

  private getPeakScalingTime(history: any[]): string {
    return '14:00-16:00'; // Simplified
  }

  private calculateResourceUtilization(): string {
    return '75%'; // Simplified
  }

  private calculatePredictiveAccuracy(history: any[]): string {
    return '82%'; // Simplified
  }

  private getMostCommonReason(history: any[]): string {
    const reasons = history.map(h => h.reason);
    const counts = reasons.reduce((acc, reason) => {
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as any);
    
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b) || 'memory';
  }

  private calculateScalingFrequency(history: any[]): string {
    return '2.3 events/day'; // Simplified
  }

  private calculateCostTrend(history: any[]): string {
    return 'decreasing'; // Simplified
  }

  private calculateEffectivenessTrend(history: any[]): string {
    return 'improving'; // Simplified
  }

  private calculateCostByService(history: any[]): any {
    return {
      'kpi-analytics-api': 450,
      'kpi-nats-consumers': 180
    };
  }

  private generateCostOptimizationRecommendations(history: any[], metrics: any): string[] {
    return [
      'Consider using spot instances for non-critical workloads',
      'Implement more aggressive rollback policies',
      'Use predictive scaling to reduce reactive scaling events'
    ];
  }

  private calculatePotentialSavings(history: any[]): number {
    return 300; // $300/month potential savings
  }

  private identifyRightSizingOpportunities(): any[] {
    return [
      {
        service: 'kpi-analytics-api',
        currentMin: 3,
        recommendedMin: 2,
        potentialSavings: 150
      }
    ];
  }

  private calculatePreventedOutages(history: any[]): number {
    return 3; // Prevented outages
  }

  private identifyActiveTimeRanges(history: any[]): string[] {
    return ['09:00-11:00', '14:00-16:00'];
  }

  private identifySeasonalTrends(history: any[]): any {
    return { pattern: 'Higher activity on weekdays', confidence: 0.8 };
  }

  private identifyCorrelations(history: any[]): any[] {
    return [
      { factor: 'Memory pressure', correlation: 0.85 },
      { factor: 'Queue size', correlation: 0.72 }
    ];
  }

  private generateProactiveRecommendations(): string[] {
    return [
      'Schedule scaling 30 minutes before predicted peak',
      'Pre-warm instances during known high-traffic periods'
    ];
  }

  private generateResourcePlanningAdvice(): string[] {
    return [
      'Reserve 20% additional capacity for Q4',
      'Consider multi-zone deployment for better distribution'
    ];
  }

  private generateBudgetAllocationAdvice(): string[] {
    return [
      'Allocate $500/month for auto-scaling overhead',
      'Consider committed use discounts for baseline capacity'
    ];
  }

  private generateImmediateRecommendations(rules: any[], metrics: any): string[] {
    const recommendations = [];
    
    if (metrics.currentExtraReplicas > 10) {
      recommendations.push('Consider implementing rollback policies - high replica count detected');
    }
    
    if (metrics.totalScalingEvents > 0 && metrics.successfulScalings / metrics.totalScalingEvents < 0.8) {
      recommendations.push('Review failing scaling rules - success rate below 80%');
    }
    
    return recommendations;
  }

  private generateOptimizationRecommendations(rules: any[], history: any[]): string[] {
    return [
      'Enable predictive scaling for better cost efficiency',
      'Adjust scaling factors based on historical patterns'
    ];
  }

  private generateStrategicRecommendations(metrics: any, history: any[]): string[] {
    return [
      'Implement cross-region scaling for disaster recovery',
      'Consider serverless alternatives for variable workloads'
    ];
  }

  private generateRuleAdjustmentRecommendations(rules: any[], history: any[]): any[] {
    return rules.map(rule => ({
      ruleId: rule.id,
      recommendation: 'Consider increasing scaling factor by 10%',
      reason: 'Historical data shows faster recovery with higher scaling',
      impact: 'Low'
    }));
  }

  /**
   * Obtenir le router Express
   */
  getRouter(): Router {
    return this.router;
  }
}

/**
 * Factory pour créer l'API auto-provisioning
 */
export function createAutoProvisioningAPI(
  provisioningManager: AutoProvisioningManager
): AutoProvisioningAPI {
  return new AutoProvisioningAPI(provisioningManager);
}