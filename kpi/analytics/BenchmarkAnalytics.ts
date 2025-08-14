import { db } from '../utils/db';

export interface Benchmark {
  modelName: string;
  metricName: string;
  average: number;
  score: number; // z-score de performance par rapport à la moyenne globale
  rank: number; // rang (1 = meilleur)
  sampleSize: number;
}

export interface LearningOpportunity {
  targetModel: string;
  sourceModel: string;
  metricName: string;
  suggestion: string;
  potentialGain: number; // gain potentiel en %
  confidence: number; // 0-1
}

export interface CrossModelInsight {
  metricName: string;
  benchmarks: Benchmark[];
  opportunities: LearningOpportunity[];
  globalStats: {
    mean: number;
    stddev: number;
    min: number;
    max: number;
    models: number;
  };
}

/**
 * Calcule les moyennes par modèle pour une métrique donnée,
 * puis attribue un score relatif (z-score).
 */
export async function computeBenchmarks(metricName: string, timeWindow: string = '7 days'): Promise<Benchmark[]> {
  const query = `
    SELECT 
      model_name,
      AVG(value) as avg_value,
      COUNT(*) as sample_size,
      STDDEV(value) as model_stddev
    FROM kpi_metrics 
    WHERE metric_name = $1 
      AND created_at > NOW() - INTERVAL '${timeWindow}'
    GROUP BY model_name
    HAVING COUNT(*) >= 5
    ORDER BY avg_value DESC
  `;
  
  const res = await db.query(query, [metricName]);
  
  if (res.rows.length === 0) {
    return [];
  }
  
  const values = res.rows.map(r => Number(r.avg_value));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);

  return res.rows.map((r, index) => ({
    modelName: r.model_name,
    metricName,
    average: Number(r.avg_value),
    score: stddev > 0 ? (Number(r.avg_value) - mean) / stddev : 0,
    rank: index + 1,
    sampleSize: Number(r.sample_size)
  }));
}

/**
 * Détecte des opportunités d'apprentissage entre modèles en fonction du score.
 */
export function detectLearningOpportunities(benchmarks: Benchmark[]): LearningOpportunity[] {
  const opportunities: LearningOpportunity[] = [];
  
  // Identifier le meilleur performer et les sous-performants
  const bestPerformer = benchmarks.find(b => b.rank === 1);
  const underperformers = benchmarks.filter(b => b.score < -0.5); // Plus de 0.5 écart-type sous la moyenne
  
  if (!bestPerformer || underperformers.length === 0) {
    return opportunities;
  }
  
  for (const underperformer of underperformers) {
    const potentialGain = ((bestPerformer.average - underperformer.average) / underperformer.average) * 100;
    
    // Calculer la confiance basée sur la taille d'échantillon et l'écart de performance
    const confidenceFromSample = Math.min(
      (underperformer.sampleSize + bestPerformer.sampleSize) / 200, // Plus d'échantillons = plus de confiance
      1
    );
    const confidenceFromGap = Math.min(Math.abs(bestPerformer.score - underperformer.score) / 2, 1);
    const confidence = (confidenceFromSample + confidenceFromGap) / 2;
    
    if (potentialGain > 5 && confidence > 0.6) { // Seuil minimal de gain et confiance
      opportunities.push({
        targetModel: underperformer.modelName,
        sourceModel: bestPerformer.modelName,
        metricName: benchmarks[0].metricName,
        suggestion: generateSuggestion(underperformer.modelName, bestPerformer.modelName, benchmarks[0].metricName, potentialGain),
        potentialGain,
        confidence
      });
    }
  }
  
  return opportunities.sort((a, b) => (b.potentialGain * b.confidence) - (a.potentialGain * a.confidence));
}

/**
 * Génère une suggestion contextuelle basée sur les modèles et métriques.
 */
function generateSuggestion(targetModel: string, sourceModel: string, metricName: string, gain: number): string {
  const suggestions = {
    ctr: `Analyser les créatifs et formats publicitaires de ${sourceModel} pour améliorer le CTR de ${targetModel} (gain potentiel: +${gain.toFixed(1)}%)`,
    conversion_rate: `Étudier le funnel et les CTA de ${sourceModel} pour optimiser les conversions de ${targetModel} (gain potentiel: +${gain.toFixed(1)}%)`,
    cpl: `Examiner les stratégies de ciblage et d'enchères de ${sourceModel} pour réduire le CPL de ${targetModel} (gain potentiel: +${gain.toFixed(1)}%)`,
    engagement_rate: `S'inspirer du timing et du contenu de ${sourceModel} pour booster l'engagement de ${targetModel} (gain potentiel: +${gain.toFixed(1)}%)`,
    retention_rate: `Adopter les mécanismes de rétention de ${sourceModel} pour améliorer ${targetModel} (gain potentiel: +${gain.toFixed(1)}%)`
  };
  
  return suggestions[metricName as keyof typeof suggestions] || 
    `S'inspirer des meilleures pratiques de ${sourceModel} pour améliorer ${metricName} de ${targetModel} (gain potentiel: +${gain.toFixed(1)}%)`;
}

/**
 * Analyse complète cross-model pour une métrique.
 */
export async function analyzeCrossModelMetric(metricName: string, timeWindow: string = '7 days'): Promise<CrossModelInsight> {
  const benchmarks = await computeBenchmarks(metricName, timeWindow);
  const opportunities = detectLearningOpportunities(benchmarks);
  
  // Calculer les stats globales
  const values = benchmarks.map(b => b.average);
  const globalStats = {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    stddev: 0,
    min: Math.min(...values),
    max: Math.max(...values),
    models: benchmarks.length
  };
  
  if (values.length > 1) {
    const variance = values.reduce((a, v) => a + Math.pow(v - globalStats.mean, 2), 0) / values.length;
    globalStats.stddev = Math.sqrt(variance);
  }
  
  return {
    metricName,
    benchmarks,
    opportunities,
    globalStats
  };
}

/**
 * Analyse batch de toutes les métriques importantes.
 */
export async function analyzeAllMetrics(timeWindow: string = '7 days'): Promise<CrossModelInsight[]> {
  const importantMetrics = [
    'ctr', 'conversion_rate', 'cpl', 'engagement_rate', 
    'retention_rate', 'ltv', 'arpu', 'churn_rate'
  ];
  
  const insights: CrossModelInsight[] = [];
  
  for (const metric of importantMetrics) {
    try {
      const insight = await analyzeCrossModelMetric(metric, timeWindow);
      if (insight.benchmarks.length > 1) { // Au moins 2 modèles pour comparer
        insights.push(insight);
      }
    } catch (error) {
      console.warn(`Failed to analyze metric ${metric}:`, error);
    }
  }
  
  return insights.sort((a, b) => b.opportunities.length - a.opportunities.length);
}

/**
 * Génère un rapport de benchmark pour un modèle spécifique.
 */
export async function generateModelBenchmarkReport(modelName: string, timeWindow: string = '7 days'): Promise<{
  modelName: string;
  overallRanking: number;
  strengths: Array<{ metric: string; rank: number; score: number }>;
  weaknesses: Array<{ metric: string; rank: number; score: number; opportunities: LearningOpportunity[] }>;
  recommendations: string[];
}> {
  const allInsights = await analyzeAllMetrics(timeWindow);
  
  const modelBenchmarks = allInsights.map(insight => 
    insight.benchmarks.find(b => b.modelName === modelName)
  ).filter(Boolean);
  
  if (modelBenchmarks.length === 0) {
    throw new Error(`No data found for model ${modelName} in the last ${timeWindow}`);
  }
  
  // Calculer le ranking global (moyenne des rangs)
  const averageRank = modelBenchmarks.reduce((sum, b) => sum + b!.rank, 0) / modelBenchmarks.length;
  
  // Identifier les forces (top 3 des métriques)
  const strengths = modelBenchmarks
    .filter(b => b!.rank <= 3)
    .map(b => ({
      metric: b!.metricName,
      rank: b!.rank,
      score: b!.score
    }))
    .sort((a, b) => a.rank - b.rank);
  
  // Identifier les faiblesses avec opportunités
  const weaknesses = allInsights
    .filter(insight => {
      const modelBench = insight.benchmarks.find(b => b.modelName === modelName);
      return modelBench && modelBench.score < -0.5;
    })
    .map(insight => {
      const modelBench = insight.benchmarks.find(b => b.modelName === modelName)!;
      const opportunities = insight.opportunities.filter(opp => opp.targetModel === modelName);
      
      return {
        metric: modelBench.metricName,
        rank: modelBench.rank,
        score: modelBench.score,
        opportunities
      };
    })
    .sort((a, b) => a.score - b.score); // Les plus faibles en premier
  
  // Générer des recommandations
  const recommendations = [
    ...strengths.slice(0, 2).map(s => `Capitaliser sur l'excellence en ${s.metric} (rang #${s.rank})`),
    ...weaknesses.slice(0, 3).map(w => 
      w.opportunities.length > 0 
        ? w.opportunities[0].suggestion
        : `Prioriser l'amélioration de ${w.metric} (actuellement rang #${w.rank})`
    )
  ];
  
  return {
    modelName,
    overallRanking: Math.round(averageRank),
    strengths,
    weaknesses,
    recommendations
  };
}

/**
 * Utilitaire pour sauvegarder les insights cross-model.
 */
export async function saveCrossModelInsights(insights: CrossModelInsight[]): Promise<void> {
  const insertPromises: Promise<any>[] = [];
  
  for (const insight of insights) {
    for (const opportunity of insight.opportunities) {
      insertPromises.push(
        db.query(
          `INSERT INTO kpi_model_learnings (source_model, target_model, learning, confidence, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            opportunity.sourceModel,
            opportunity.targetModel,
            opportunity.suggestion,
            opportunity.confidence,
            {
              metricName: insight.metricName,
              potentialGain: opportunity.potentialGain,
              benchmarkData: insight.benchmarks,
              generatedAt: new Date().toISOString()
            }
          ]
        )
      );
    }
  }
  
  await Promise.all(insertPromises);
}

/**
 * Scheduler pour exécuter l'analyse cross-model périodiquement.
 */
export async function runPeriodicCrossModelAnalysis(): Promise<void> {
  console.log('Starting periodic cross-model analysis...');
  
  try {
    const insights = await analyzeAllMetrics('7 days');
    await saveCrossModelInsights(insights);
    
    console.log(`Cross-model analysis completed. Found ${insights.length} metric insights and ${
      insights.reduce((sum, i) => sum + i.opportunities.length, 0)
    } learning opportunities.`);
    
    // Optionnel : déclencher des notifications pour les opportunités à haute confiance
    const highConfidenceOpportunities = insights
      .flatMap(i => i.opportunities)
      .filter(opp => opp.confidence > 0.8 && opp.potentialGain > 15);
    
    if (highConfidenceOpportunities.length > 0) {
      console.log(`Found ${highConfidenceOpportunities.length} high-confidence learning opportunities requiring attention.`);
      // Ici on pourrait déclencher des alertes ou notifications
    }
  } catch (error) {
    console.error('Cross-model analysis failed:', error);
  }
}