/**
 * Service Level Objectives et alerting pour le système KPI
 */

import { register, Gauge, Counter, Histogram } from 'prom-client';

// SLO/SLA Définitions
export interface ServiceLevelObjective {
  name: string;
  description: string;
  target: number; // pourcentage (ex: 99.9 pour 99.9%)
  window: string; // '1h', '24h', '7d'
  query: string; // PromQL query
  severity: 'critical' | 'warning' | 'info';
}

export const KPI_SLOS: ServiceLevelObjective[] = [
  // ETL Performance
  {
    name: 'etl_processing_latency',
    description: 'ETL processing latency p95 < 2s',
    target: 95, // 95% des requêtes sous 2s
    window: '5m',
    query: 'histogram_quantile(0.95, rate(kpi_etl_processing_duration_seconds_bucket[5m])) < 2',
    severity: 'critical'
  },
  {
    name: 'etl_success_rate',
    description: 'ETL success rate > 99%',
    target: 99,
    window: '1h',
    query: 'rate(kpi_etl_batches_processed_total{result="success"}[1h]) / rate(kpi_etl_batches_processed_total[1h]) * 100 > 99',
    severity: 'critical'
  },

  // Analytics Performance
  {
    name: 'analytics_completion_time',
    description: 'Analytics analysis completion < 30s',
    target: 95,
    window: '5m',
    query: 'histogram_quantile(0.95, rate(kpi_analytics_analysis_duration_seconds_bucket[5m])) < 30',
    severity: 'warning'
  },
  {
    name: 'anomaly_detection_accuracy',
    description: 'Anomaly detection confidence > 70%',
    target: 70,
    window: '1h',
    query: 'avg(kpi_analytics_anomaly_confidence[1h]) > 0.7',
    severity: 'info'
  },

  // Streaming Performance
  {
    name: 'nats_publish_latency',
    description: 'NATS publish latency p99 < 100ms',
    target: 99,
    window: '5m',
    query: 'histogram_quantile(0.99, rate(kpi_nats_publish_latency_seconds_bucket[5m])) < 0.1',
    severity: 'warning'
  },
  {
    name: 'streaming_consumer_lag',
    description: 'Consumer lag < 1000 messages',
    target: 95,
    window: '5m',
    query: 'kpi_nats_consumer_lag < 1000',
    severity: 'critical'
  },

  // WebSocket Performance
  {
    name: 'websocket_delivery_latency',
    description: 'WebSocket event delivery < 50ms',
    target: 95,
    window: '5m',
    query: 'histogram_quantile(0.95, rate(kpi_websocket_delivery_latency_seconds_bucket[5m])) < 0.05',
    severity: 'warning'
  },

  // Adaptive Windows Effectiveness
  {
    name: 'adaptive_windows_confidence',
    description: 'Adaptive windows average confidence > 80%',
    target: 80,
    window: '1h',
    query: 'avg(kpi_adaptive_window_confidence[1h]) > 0.8',
    severity: 'info'
  },

  // Security SLO
  {
    name: 'api_response_time',
    description: 'API response time p95 < 500ms',
    target: 95,
    window: '5m',
    query: 'histogram_quantile(0.95, rate(kpi_security_request_duration_seconds_bucket[5m])) < 0.5',
    severity: 'warning'
  },
  {
    name: 'rate_limit_effectiveness',
    description: 'Rate limit blocking malicious traffic > 95%',
    target: 95,
    window: '1h',
    query: 'rate(kpi_security_rate_limit_hits_total[1h]) / rate(kpi_security_intrusion_attempts_total[1h]) * 100 > 95',
    severity: 'critical'
  }
];

// Métriques pour tracker les SLO
export const sloMetrics = {
  sloCompliance: new Gauge({
    name: 'kpi_slo_compliance_ratio',
    help: 'SLO compliance ratio (0-1)',
    labelNames: ['slo_name', 'severity']
  }),

  sloViolations: new Counter({
    name: 'kpi_slo_violations_total',
    help: 'Total SLO violations',
    labelNames: ['slo_name', 'severity']
  }),

  sloErrorBudget: new Gauge({
    name: 'kpi_slo_error_budget_remaining',
    help: 'Remaining error budget for SLO (0-1)',
    labelNames: ['slo_name']
  }),

  systemHealthScore: new Gauge({
    name: 'kpi_system_health_score',
    help: 'Overall system health score (0-100)'
  })
};

/**
 * Gestionnaire des SLO et alerting
 */
export class SLOManager {
  private currentCompliance: Map<string, number> = new Map();
  private errorBudgets: Map<string, number> = new Map();

  constructor() {
    // Initialiser les error budgets (100% au démarrage)
    KPI_SLOS.forEach(slo => {
      this.errorBudgets.set(slo.name, 1.0);
    });
  }

  /**
   * Évaluer tous les SLO et mettre à jour les métriques
   */
  async evaluateAllSLOs(): Promise<{
    overallHealth: number;
    violations: Array<{ slo: ServiceLevelObjective; compliance: number }>;
    criticalAlerts: string[];
  }> {
    const violations = [];
    const criticalAlerts = [];
    let totalCompliance = 0;

    for (const slo of KPI_SLOS) {
      try {
        // Simuler l'évaluation du SLO (en production, interroger Prometheus)
        const compliance = await this.evaluateSLO(slo);
        this.currentCompliance.set(slo.name, compliance);

        // Mettre à jour les métriques
        sloMetrics.sloCompliance.set(
          { slo_name: slo.name, severity: slo.severity },
          compliance / 100
        );

        // Vérifier les violations
        if (compliance < slo.target) {
          violations.push({ slo, compliance });
          
          sloMetrics.sloViolations.inc({
            slo_name: slo.name,
            severity: slo.severity
          });

          if (slo.severity === 'critical') {
            criticalAlerts.push(`CRITICAL: ${slo.description} (${compliance.toFixed(1)}% < ${slo.target}%)`);
          }
        }

        // Calculer et mettre à jour l'error budget
        const errorBudget = this.calculateErrorBudget(slo, compliance);
        this.errorBudgets.set(slo.name, errorBudget);
        sloMetrics.sloErrorBudget.set({ slo_name: slo.name }, errorBudget);

        totalCompliance += compliance;

      } catch (error) {
        console.error(`Failed to evaluate SLO ${slo.name}:`, error);
        totalCompliance += 50; // Assume 50% si on ne peut pas évaluer
      }
    }

    // Calculer le score de santé global
    const overallHealth = totalCompliance / KPI_SLOS.length;
    sloMetrics.systemHealthScore.set(overallHealth);

    return { overallHealth, violations, criticalAlerts };
  }

  /**
   * Évaluer un SLO spécifique
   */
  private async evaluateSLO(slo: ServiceLevelObjective): Promise<number> {
    // En production, cette méthode interrogerait Prometheus avec slo.query
    // Pour la simulation, générer des valeurs basées sur des patterns réalistes
    
    switch (slo.name) {
      case 'etl_processing_latency':
        return Math.random() > 0.1 ? 96 + Math.random() * 3 : 88 + Math.random() * 7; // 90% du temps > 96%
      
      case 'etl_success_rate':
        return Math.random() > 0.05 ? 99 + Math.random() : 95 + Math.random() * 4; // Très stable
      
      case 'analytics_completion_time':
        return Math.random() > 0.2 ? 90 + Math.random() * 8 : 70 + Math.random() * 15; // Plus variable
      
      case 'nats_publish_latency':
        return Math.random() > 0.15 ? 95 + Math.random() * 4 : 80 + Math.random() * 10;
      
      case 'streaming_consumer_lag':
        return Math.random() > 0.1 ? 98 + Math.random() * 2 : 60 + Math.random() * 30; // Peut avoir des pics
      
      case 'adaptive_windows_confidence':
        return 75 + Math.random() * 20; // Généralement bon mais variable
      
      default:
        return 85 + Math.random() * 15; // Valeur par défaut raisonnable
    }
  }

  /**
   * Calculer l'error budget restant
   */
  private calculateErrorBudget(slo: ServiceLevelObjective, currentCompliance: number): number {
    // Error budget = (current - target) / (100 - target)
    // Si target = 99% et current = 99.5%, error budget = 50% restant
    
    if (currentCompliance >= slo.target) {
      return Math.min(1.0, (currentCompliance - slo.target) / (100 - slo.target));
    } else {
      return 0; // Budget épuisé
    }
  }

  /**
   * Obtenir le rapport de santé du système
   */
  getHealthReport(): {
    overallScore: number;
    sloSummary: Array<{
      name: string;
      description: string;
      compliance: number;
      target: number;
      status: 'healthy' | 'warning' | 'critical';
      errorBudget: number;
    }>;
    recommendations: string[];
  } {
    const sloSummary = KPI_SLOS.map(slo => {
      const compliance = this.currentCompliance.get(slo.name) || 0;
      const errorBudget = this.errorBudgets.get(slo.name) || 0;
      
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (compliance < slo.target) {
        status = slo.severity === 'critical' ? 'critical' : 'warning';
      } else if (errorBudget < 0.2) {
        status = 'warning'; // Error budget faible
      }

      return {
        name: slo.name,
        description: slo.description,
        compliance,
        target: slo.target,
        status,
        errorBudget
      };
    });

    const overallScore = Array.from(this.currentCompliance.values())
      .reduce((sum, val) => sum + val, 0) / this.currentCompliance.size;

    const recommendations = this.generateRecommendations(sloSummary);

    return { overallScore, sloSummary, recommendations };
  }

  /**
   * Générer des recommandations basées sur les SLO
   */
  private generateRecommendations(sloSummary: any[]): string[] {
    const recommendations = [];

    const criticalSLOs = sloSummary.filter(s => s.status === 'critical');
    const lowBudgetSLOs = sloSummary.filter(s => s.errorBudget < 0.1);

    if (criticalSLOs.length > 0) {
      recommendations.push(`Urgent: ${criticalSLOs.length} SLO(s) critiques en violation - intervention immédiate requise`);
    }

    if (lowBudgetSLOs.length > 0) {
      recommendations.push(`Attention: ${lowBudgetSLOs.length} SLO(s) avec error budget faible - surveiller de près`);
    }

    // Recommandations spécifiques
    const etlIssues = sloSummary.filter(s => s.name.includes('etl') && s.status !== 'healthy');
    if (etlIssues.length > 0) {
      recommendations.push('ETL Performance: considérer l\'augmentation des ressources ou l\'optimisation des batches');
    }

    const streamingIssues = sloSummary.filter(s => s.name.includes('streaming') && s.status !== 'healthy');
    if (streamingIssues.length > 0) {
      recommendations.push('Streaming: vérifier la configuration NATS et la taille des consumers');
    }

    const adaptiveIssues = sloSummary.filter(s => s.name.includes('adaptive') && s.compliance < 80);
    if (adaptiveIssues.length > 0) {
      recommendations.push('Fenêtres Adaptatives: améliorer la qualité des données pour des recommandations plus fiables');
    }

    if (recommendations.length === 0) {
      recommendations.push('Système en bonne santé - maintenir la surveillance et les bonnes pratiques');
    }

    return recommendations;
  }

  /**
   * Créer les règles d'alerte Prometheus
   */
  generatePrometheusRules(): string {
    let rules = `groups:
  - name: kpi_slo_alerts
    rules:
`;

    KPI_SLOS.forEach(slo => {
      rules += `      - alert: SLO_${slo.name.toUpperCase()}_Violation
        expr: ${slo.query}
        for: ${slo.window}
        labels:
          severity: ${slo.severity}
          slo_name: ${slo.name}
        annotations:
          summary: "SLO violation: ${slo.description}"
          description: "SLO ${slo.name} is not meeting target of ${slo.target}%"
          runbook: "https://docs.company.com/slo/${slo.name}"

`;
    });

    // Alerte globale sur la santé du système
    rules += `      - alert: SystemHealthDegraded
        expr: kpi_system_health_score < 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Overall system health degraded"
          description: "System health score is {{ $value }}% (< 80%)"

      - alert: SystemHealthCritical
        expr: kpi_system_health_score < 60
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "System health critical"
          description: "System health score is {{ $value }}% (< 60%)"
`;

    return rules;
  }
}

/**
 * Job périodique pour évaluer les SLO
 */
export async function runSLOEvaluation(): Promise<void> {
  const manager = new SLOManager();
  
  try {
    const evaluation = await manager.evaluateAllSLOs();
    
    console.log(`SLO Evaluation - Overall Health: ${evaluation.overallHealth.toFixed(1)}%`);
    
    if (evaluation.violations.length > 0) {
      console.warn(`SLO Violations: ${evaluation.violations.length}`);
      evaluation.violations.forEach(v => {
        console.warn(`- ${v.slo.name}: ${v.compliance.toFixed(1)}% (target: ${v.slo.target}%)`);
      });
    }

    if (evaluation.criticalAlerts.length > 0) {
      console.error('CRITICAL ALERTS:');
      evaluation.criticalAlerts.forEach(alert => console.error(`- ${alert}`));
    }

  } catch (error) {
    console.error('SLO evaluation failed:', error);
  }
}

/**
 * Middleware Express pour exposer les métriques SLO
 */
export function sloHealthEndpoint() {
  return async (req: any, res: any) => {
    try {
      const manager = new SLOManager();
      const report = manager.getHealthReport();
      
      const statusCode = report.overallScore > 80 ? 200 : 
                        report.overallScore > 60 ? 206 : 503;
      
      res.status(statusCode).json({
        timestamp: new Date().toISOString(),
        status: statusCode === 200 ? 'healthy' : statusCode === 206 ? 'degraded' : 'critical',
        ...report
      });
      
    } catch (error) {
      res.status(500).json({
        timestamp: new Date().toISOString(),
        status: 'error',
        error: 'Failed to generate health report'
      });
    }
  };
}