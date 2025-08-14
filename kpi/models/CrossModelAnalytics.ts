import { db } from '../utils/db';
import { callLLM } from '../utils/llm';

export interface CrossModelInsight {
  sourceModel: string;
  targetModel: string;
  insight: string;
  confidence: number;
  impactScore: number;
  applicability: 'direct' | 'adapted' | 'experimental';
  metrics: string[];
}

export interface BenchmarkData {
  metricName: string;
  modelPerformance: Array<{
    modelName: string;
    avgValue: number;
    trendDirection: 'up' | 'down' | 'stable';
    sampleSize: number;
  }>;
  globalBenchmark: {
    mean: number;
    median: number;
    p95: number;
    bestPerformer: string;
  };
}

export interface LearningRecommendation {
  sourceModel: string;
  targetModel: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: number; // 0-100
  implementationComplexity: 'low' | 'medium' | 'high';
  evidenceStrength: number; // 0-1
}

export class CrossModelAnalytics {
  // Métriques standardisées communes à tous les modèles
  private readonly STANDARD_METRICS = {
    conversion: ['conversion_rate', 'trial_conversion_rate', 'signup_conversion'],
    cost: ['cpl', 'cac', 'cost_per_acquisition'],
    engagement: ['engagement_rate', 'click_through_rate', 'ctr'],
    retention: ['retention_rate', 'churn_rate', 'activation_rate'],
    revenue: ['revenue_per_user', 'arpu', 'ltv', 'mrr']
  };

  // Mapper les métriques spécifiques vers les métriques standardisées
  private normalizeMetricName(metricName: string): string | null {
    for (const [standard, variants] of Object.entries(this.STANDARD_METRICS)) {
      if (variants.includes(metricName)) {
        return standard;
      }
    }
    return null;
  }

  // Obtenir les benchmarks inter-modèles pour une métrique
  async getCrossModelBenchmarks(standardMetric: string): Promise<BenchmarkData | null> {
    const normalized = this.normalizeMetricName(standardMetric) || standardMetric;
    
    const variants = this.STANDARD_METRICS[normalized as keyof typeof this.STANDARD_METRICS] || [standardMetric];
    
    const query = `
      WITH model_stats AS (
        SELECT 
          model_name,
          AVG(value) as avg_value,
          COUNT(*) as sample_size,
          CASE 
            WHEN AVG(value) > LAG(AVG(value)) OVER (PARTITION BY model_name ORDER BY DATE_TRUNC('day', created_at)) THEN 'up'
            WHEN AVG(value) < LAG(AVG(value)) OVER (PARTITION BY model_name ORDER BY DATE_TRUNC('day', created_at)) THEN 'down'
            ELSE 'stable'
          END as trend_direction
        FROM kpi_metrics 
        WHERE metric_name = ANY($1)
          AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY model_name, DATE_TRUNC('day', created_at)
      ),
      aggregated AS (
        SELECT 
          model_name,
          AVG(avg_value) as model_avg,
          MAX(sample_size) as total_samples,
          MODE() WITHIN GROUP (ORDER BY trend_direction) as dominant_trend
        FROM model_stats
        GROUP BY model_name
      )
      SELECT 
        model_name,
        model_avg,
        total_samples,
        dominant_trend,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY model_avg) OVER () as global_median,
        AVG(model_avg) OVER () as global_mean,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY model_avg) OVER () as global_p95,
        FIRST_VALUE(model_name) OVER (ORDER BY model_avg DESC) as best_performer
      FROM aggregated
      ORDER BY model_avg DESC
    `;

    try {
      const result = await db.query(query, [variants]);
      
      if (result.rows.length === 0) return null;

      const firstRow = result.rows[0];
      
      return {
        metricName: normalized,
        modelPerformance: result.rows.map(row => ({
          modelName: row.model_name,
          avgValue: parseFloat(row.model_avg),
          trendDirection: row.dominant_trend as 'up' | 'down' | 'stable',
          sampleSize: parseInt(row.total_samples)
        })),
        globalBenchmark: {
          mean: parseFloat(firstRow.global_mean),
          median: parseFloat(firstRow.global_median),
          p95: parseFloat(firstRow.global_p95),
          bestPerformer: firstRow.best_performer
        }
      };
    } catch (error) {
      console.error('Error fetching cross-model benchmarks:', error);
      return null;
    }
  }

  // Identifier les opportunités d'apprentissage entre modèles
  async identifyLearningOpportunities(): Promise<CrossModelInsight[]> {
    const insights: CrossModelInsight[] = [];
    
    // Analyser chaque catégorie de métrique standardisée
    for (const [category, metrics] of Object.entries(this.STANDARD_METRICS)) {
      for (const metric of metrics) {
        const benchmark = await this.getCrossModelBenchmarks(metric);
        if (!benchmark) continue;

        // Identifier les modèles qui performent significativement mieux
        const bestPerformers = benchmark.modelPerformance
          .filter(model => 
            model.avgValue > benchmark.globalBenchmark.p95 &&
            model.sampleSize >= 10 // Assurer une taille d'échantillon suffisante
          )
          .sort((a, b) => b.avgValue - a.avgValue);

        const underperformers = benchmark.modelPerformance
          .filter(model => 
            model.avgValue < benchmark.globalBenchmark.median &&
            model.sampleSize >= 5
          );

        // Générer des insights pour chaque paire performant -> sous-performant
        for (const best of bestPerformers) {
          for (const under of underperformers) {
            if (best.modelName === under.modelName) continue;

            const impactScore = this.calculateImpactScore(best.avgValue, under.avgValue, benchmark);
            const confidence = this.calculateConfidence(best.sampleSize, under.sampleSize, benchmark);

            if (impactScore > 0.2 && confidence > 0.6) {
              const insight = await this.generateInsightDescription(
                best.modelName, 
                under.modelName, 
                metric, 
                best.avgValue, 
                under.avgValue
              );

              insights.push({
                sourceModel: best.modelName,
                targetModel: under.modelName,
                insight,
                confidence,
                impactScore,
                applicability: this.determineApplicability(best.modelName, under.modelName),
                metrics: [metric]
              });
            }
          }
        }
      }
    }

    return insights.sort((a, b) => (b.confidence * b.impactScore) - (a.confidence * a.impactScore));
  }

  // Générer des recommandations concrètes basées sur les insights
  async generateLearningRecommendations(insights: CrossModelInsight[]): Promise<LearningRecommendation[]> {
    const recommendations: LearningRecommendation[] = [];

    for (const insight of insights.slice(0, 10)) { // Top 10 insights
      try {
        const contextData = await this.getModelContext(insight.sourceModel, insight.targetModel);
        
        const prompt = `
Analyse cette opportunité d'apprentissage inter-modèles et génère une recommandation concrète :

Source Model: ${insight.sourceModel}
Target Model: ${insight.targetModel}
Insight: ${insight.insight}
Confidence: ${insight.confidence}
Impact Score: ${insight.impactScore}

Contexte des modèles:
${JSON.stringify(contextData, null, 2)}

Génère une recommandation spécifique et actionnelle en format JSON :
{
  "recommendation": "Description concrète de l'action à prendre",
  "priority": "high|medium|low",
  "expectedImpact": 0-100,
  "implementationComplexity": "low|medium|high",
  "evidenceStrength": 0-1,
  "steps": ["étape 1", "étape 2", "étape 3"]
}
        `;

        const response = await callLLM(prompt, {
          temperature: 0.3,
          maxTokens: 500
        });

        const parsed = JSON.parse(response);
        
        recommendations.push({
          sourceModel: insight.sourceModel,
          targetModel: insight.targetModel,
          recommendation: parsed.recommendation,
          priority: parsed.priority,
          expectedImpact: parsed.expectedImpact,
          implementationComplexity: parsed.implementationComplexity,
          evidenceStrength: parsed.evidenceStrength
        });
      } catch (error) {
        console.error('Error generating recommendation:', error);
        // Fallback recommendation
        recommendations.push({
          sourceModel: insight.sourceModel,
          targetModel: insight.targetModel,
          recommendation: `Analyser et adapter les stratégies de ${insight.sourceModel} pour améliorer les métriques de ${insight.targetModel}`,
          priority: insight.impactScore > 0.7 ? 'high' : 'medium',
          expectedImpact: Math.round(insight.impactScore * 100),
          implementationComplexity: insight.applicability === 'direct' ? 'low' : 'medium',
          evidenceStrength: insight.confidence
        });
      }
    }

    return recommendations;
  }

  // Appliquer automatiquement les recommandations de haute confiance
  async applyHighConfidenceRecommendations(recommendations: LearningRecommendation[]): Promise<void> {
    const autoApplicable = recommendations.filter(rec => 
      rec.priority === 'high' && 
      rec.evidenceStrength > 0.8 && 
      rec.implementationComplexity === 'low'
    );

    for (const rec of autoApplicable) {
      try {
        // Sauvegarder la recommandation comme applied
        await db.query(
          `INSERT INTO kpi_recommendations (model_name, recommendation, priority, status, metadata)
           VALUES ($1, $2, $3, 'applied', $4)`,
          [
            rec.targetModel,
            rec.recommendation,
            rec.priority,
            {
              sourceModel: rec.sourceModel,
              expectedImpact: rec.expectedImpact,
              autoApplied: true,
              appliedAt: new Date().toISOString()
            }
          ]
        );

        // Créer un insight de type learning
        await db.query(
          `INSERT INTO kpi_insights (model_name, insight, severity, metadata)
           VALUES ($1, $2, 'info', $3)`,
          [
            rec.targetModel,
            `Auto-apprentissage de ${rec.sourceModel}: ${rec.recommendation}`,
            {
              type: 'cross_learning',
              sourceModel: rec.sourceModel,
              evidenceStrength: rec.evidenceStrength
            }
          ]
        );

        console.log(`Auto-applied recommendation from ${rec.sourceModel} to ${rec.targetModel}`);
      } catch (error) {
        console.error('Error auto-applying recommendation:', error);
      }
    }
  }

  // Méthodes helper privées
  private calculateImpactScore(bestValue: number, currentValue: number, benchmark: BenchmarkData): number {
    const maxPossibleImprovement = benchmark.globalBenchmark.p95 - benchmark.globalBenchmark.mean;
    const actualGap = bestValue - currentValue;
    return Math.min(actualGap / maxPossibleImprovement, 1);
  }

  private calculateConfidence(bestSampleSize: number, targetSampleSize: number, benchmark: BenchmarkData): number {
    const minSampleSize = Math.min(bestSampleSize, targetSampleSize);
    const sampleConfidence = Math.min(minSampleSize / 100, 1); // Max confidence at 100+ samples
    const performanceGap = (benchmark.globalBenchmark.p95 - benchmark.globalBenchmark.mean) / benchmark.globalBenchmark.mean;
    const gapConfidence = Math.min(performanceGap, 1);
    
    return (sampleConfidence + gapConfidence) / 2;
  }

  private determineApplicability(sourceModel: string, targetModel: string): 'direct' | 'adapted' | 'experimental' {
    // Logique pour déterminer la facilité d'application entre modèles
    const modelSimilarity = {
      'marketing-onboarding': 'direct',
      'onboarding-marketing': 'direct',
      'marketing-payment': 'adapted',
      'payment-marketing': 'adapted',
      'onboarding-payment': 'adapted',
      'payment-onboarding': 'experimental'
    };

    const key = `${sourceModel}-${targetModel}`;
    return modelSimilarity[key as keyof typeof modelSimilarity] || 'experimental';
  }

  private async generateInsightDescription(
    sourceModel: string, 
    targetModel: string, 
    metric: string, 
    bestValue: number, 
    currentValue: number
  ): Promise<string> {
    const improvement = ((bestValue - currentValue) / currentValue * 100).toFixed(1);
    return `${sourceModel} performe ${improvement}% mieux sur ${metric} (${bestValue.toFixed(2)} vs ${currentValue.toFixed(2)})`;
  }

  private async getModelContext(sourceModel: string, targetModel: string): Promise<any> {
    // Récupérer le contexte des deux modèles pour enrichir les recommandations
    const query = `
      SELECT 
        model_name,
        metric_name,
        AVG(value) as avg_value,
        COUNT(*) as sample_count
      FROM kpi_metrics 
      WHERE model_name IN ($1, $2)
        AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY model_name, metric_name
      ORDER BY model_name, avg_value DESC
    `;

    const result = await db.query(query, [sourceModel, targetModel]);
    
    const context = {
      [sourceModel]: {},
      [targetModel]: {}
    };

    for (const row of result.rows) {
      context[row.model_name][row.metric_name] = {
        avgValue: parseFloat(row.avg_value),
        sampleCount: parseInt(row.sample_count)
      };
    }

    return context;
  }

  // Méthode principale pour exécuter tout le workflow d'apprentissage croisé
  async runCrossModelLearning(): Promise<{
    insights: CrossModelInsight[];
    recommendations: LearningRecommendation[];
    autoAppliedCount: number;
  }> {
    console.log('Starting cross-model learning analysis...');
    
    const insights = await this.identifyLearningOpportunities();
    console.log(`Found ${insights.length} learning opportunities`);
    
    const recommendations = await this.generateLearningRecommendations(insights);
    console.log(`Generated ${recommendations.length} recommendations`);
    
    const initialCount = recommendations.filter(r => r.priority === 'high' && r.evidenceStrength > 0.8).length;
    await this.applyHighConfidenceRecommendations(recommendations);
    
    return {
      insights,
      recommendations,
      autoAppliedCount: initialCount
    };
  }
}

// Singleton export
export const crossModelAnalytics = new CrossModelAnalytics();