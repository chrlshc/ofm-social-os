/**
 * Benchmarks intelligents avec fenêtres adaptatives et contextualisation
 */

import { computeBenchmarks, detectLearningOpportunities, Benchmark, LearningOpportunity } from './BenchmarkAnalytics';
import { getAdaptiveWindowManager, VariabilityProfile } from './adaptiveWindows';
import { db } from '../utils/db';

export interface SmartBenchmarkConfig {
  useAdaptiveWindows: boolean;
  contextualFilters: {
    platform?: string[];
    campaignType?: string[];
    timeOfDay?: number[]; // heures 0-23
    dayOfWeek?: number[]; // 0=dimanche, 6=samedi
  };
  confidenceThreshold: number;
  minSampleSize: number;
}

export interface ContextualBenchmark extends Benchmark {
  timeWindow: string;
  context: {
    platform?: string;
    campaignType?: string;
    timeOfDay?: string;
    dayOfWeek?: string;
  };
  dataQuality: number;
  adaptiveWindow: boolean;
}

export interface SmartLearningOpportunity extends LearningOpportunity {
  contextMatch: number; // 0-1, similarité contextuelle
  timeRelevance: number; // 0-1, pertinence temporelle
  adaptiveConfidence: number; // confiance ajustée avec fenêtres adaptatives
  implementation: {
    priority: 'low' | 'medium' | 'high' | 'critical';
    estimatedImpact: string;
    timeframe: string;
    dependencies: string[];
  };
}

export class SmartBenchmarkAnalyzer {
  private windowManager = getAdaptiveWindowManager();

  constructor(private config: SmartBenchmarkConfig = {
    useAdaptiveWindows: true,
    contextualFilters: {},
    confidenceThreshold: 0.7,
    minSampleSize: 20
  }) {}

  /**
   * Calculer des benchmarks intelligents avec fenêtres adaptatives
   */
  async computeSmartBenchmarks(
    metricName: string,
    context?: Partial<SmartBenchmarkConfig['contextualFilters']>
  ): Promise<ContextualBenchmark[]> {
    
    // Récupérer tous les modèles pour cette métrique
    const modelsResult = await db.query(
      `SELECT DISTINCT model_name FROM kpi_metrics WHERE metric_name = $1`,
      [metricName]
    );

    const benchmarks: ContextualBenchmark[] = [];

    for (const modelRow of modelsResult.rows) {
      const modelName = modelRow.model_name;
      
      // Déterminer la fenêtre temporelle
      let timeWindow: string;
      let adaptiveWindow = false;
      
      if (this.config.useAdaptiveWindows) {
        const optimalHours = this.windowManager.getOptimalWindow(modelName, metricName);
        timeWindow = `${optimalHours} hours`;
        adaptiveWindow = true;
      } else {
        timeWindow = '7 days'; // Fenêtre par défaut
      }

      // Construire la requête avec filtres contextuels
      const { query, params } = this.buildContextualQuery(
        metricName, 
        modelName, 
        timeWindow, 
        context
      );

      const result = await db.query(query, params);

      if (result.rows.length < this.config.minSampleSize) {
        console.warn(`Insufficient data for ${modelName}.${metricName}: ${result.rows.length} samples`);
        continue;
      }

      // Calculer les statistiques
      const values = result.rows.map(r => Number(r.value));
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
      const stddev = Math.sqrt(variance);

      // Calculer la qualité des données
      const dataQuality = this.calculateDataQuality(values, result.rows);

      // Déterminer le contexte prédominant
      const contextInfo = this.analyzeContext(result.rows);

      const benchmark: ContextualBenchmark = {
        modelName,
        metricName,
        average,
        score: 0, // Sera calculé après avoir tous les benchmarks
        rank: 0,  // Sera calculé après avoir tous les benchmarks
        sampleSize: values.length,
        timeWindow,
        context: contextInfo,
        dataQuality,
        adaptiveWindow
      };

      benchmarks.push(benchmark);
    }

    // Calculer les scores et rangs relatifs
    return this.calculateRelativeScores(benchmarks);
  }

  /**
   * Construire une requête avec filtres contextuels
   */
  private buildContextualQuery(
    metricName: string,
    modelName: string,
    timeWindow: string,
    context?: Partial<SmartBenchmarkConfig['contextualFilters']>
  ): { query: string; params: any[] } {
    
    let query = `
      SELECT 
        value,
        platform,
        metadata,
        created_at,
        EXTRACT(HOUR FROM created_at) as hour_of_day,
        EXTRACT(DOW FROM created_at) as day_of_week
      FROM kpi_metrics 
      WHERE metric_name = $1 
        AND model_name = $2 
        AND created_at > NOW() - INTERVAL '${timeWindow}'
    `;
    
    const params: any[] = [metricName, modelName];
    let paramIndex = 3;

    // Filtres contextuels
    if (context?.platform && context.platform.length > 0) {
      query += ` AND platform = ANY($${paramIndex})`;
      params.push(context.platform);
      paramIndex++;
    }

    if (context?.timeOfDay && context.timeOfDay.length > 0) {
      query += ` AND EXTRACT(HOUR FROM created_at) = ANY($${paramIndex})`;
      params.push(context.timeOfDay);
      paramIndex++;
    }

    if (context?.dayOfWeek && context.dayOfWeek.length > 0) {
      query += ` AND EXTRACT(DOW FROM created_at) = ANY($${paramIndex})`;
      params.push(context.dayOfWeek);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    return { query, params };
  }

  /**
   * Calculer la qualité des données
   */
  private calculateDataQuality(values: number[], rows: any[]): number {
    let qualityScore = 1.0;

    // Pénaliser pour les valeurs aberrantes
    const q1 = this.percentile(values, 0.25);
    const q3 = this.percentile(values, 0.75);
    const iqr = q3 - q1;
    const outliers = values.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
    const outlierRate = outliers.length / values.length;
    qualityScore *= (1 - outlierRate * 0.5);

    // Pénaliser pour les données manquantes (valeurs nulles dans metadata)
    const missingMetadata = rows.filter(r => !r.metadata || Object.keys(r.metadata).length === 0).length;
    const missingRate = missingMetadata / rows.length;
    qualityScore *= (1 - missingRate * 0.3);

    // Récompenser pour la régularité temporelle
    const timestamps = rows.map(r => new Date(r.created_at).getTime());
    const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    const medianInterval = this.percentile(intervals, 0.5);
    const irregularityRate = intervals.filter(i => Math.abs(i - medianInterval) > medianInterval * 0.5).length / intervals.length;
    qualityScore *= (1 - irregularityRate * 0.2);

    return Math.max(0, Math.min(1, qualityScore));
  }

  /**
   * Analyser le contexte prédominant
   */
  private analyzeContext(rows: any[]): ContextualBenchmark['context'] {
    const platforms = rows.map(r => r.platform).filter(Boolean);
    const hoursOfDay = rows.map(r => r.hour_of_day);
    const daysOfWeek = rows.map(r => r.day_of_week);

    // Trouver les valeurs les plus fréquentes
    const mostFrequentPlatform = this.getMostFrequent(platforms);
    const mostFrequentHour = this.getMostFrequent(hoursOfDay);
    const mostFrequentDay = this.getMostFrequent(daysOfWeek);

    return {
      platform: mostFrequentPlatform,
      timeOfDay: mostFrequentHour ? `${mostFrequentHour}h` : undefined,
      dayOfWeek: mostFrequentDay ? this.getDayName(mostFrequentDay) : undefined
    };
  }

  /**
   * Calculer les scores et rangs relatifs
   */
  private calculateRelativeScores(benchmarks: ContextualBenchmark[]): ContextualBenchmark[] {
    if (benchmarks.length === 0) return benchmarks;

    // Calculer la moyenne et l'écart-type global
    const values = benchmarks.map(b => b.average);
    const globalMean = values.reduce((a, b) => a + b, 0) / values.length;
    const globalStddev = Math.sqrt(
      values.reduce((sum, val) => sum + Math.pow(val - globalMean, 2), 0) / values.length
    );

    // Calculer les z-scores
    benchmarks.forEach(benchmark => {
      benchmark.score = globalStddev > 0 
        ? (benchmark.average - globalMean) / globalStddev 
        : 0;
    });

    // Trier et attribuer les rangs
    benchmarks.sort((a, b) => b.average - a.average);
    benchmarks.forEach((benchmark, index) => {
      benchmark.rank = index + 1;
    });

    return benchmarks;
  }

  /**
   * Détecter des opportunités d'apprentissage intelligentes
   */
  async detectSmartLearningOpportunities(
    metricName: string,
    context?: Partial<SmartBenchmarkConfig['contextualFilters']>
  ): Promise<SmartLearningOpportunity[]> {
    
    const benchmarks = await this.computeSmartBenchmarks(metricName, context);
    
    if (benchmarks.length < 2) {
      return [];
    }

    const opportunities: SmartLearningOpportunity[] = [];
    const bestPerformer = benchmarks.find(b => b.rank === 1);
    const underperformers = benchmarks.filter(b => b.score < -0.5);

    if (!bestPerformer || underperformers.length === 0) {
      return opportunities;
    }

    for (const underperformer of underperformers) {
      const baseOpportunity = this.createBaseOpportunity(bestPerformer, underperformer);
      
      // Calculer la similarité contextuelle
      const contextMatch = this.calculateContextSimilarity(
        bestPerformer.context, 
        underperformer.context
      );

      // Calculer la pertinence temporelle
      const timeRelevance = this.calculateTimeRelevance(
        bestPerformer.timeWindow,
        underperformer.timeWindow
      );

      // Calculer la confiance ajustée
      const adaptiveConfidence = this.calculateAdaptiveConfidence(
        baseOpportunity.confidence,
        bestPerformer.dataQuality,
        underperformer.dataQuality,
        contextMatch
      );

      // Déterminer l'implémentation recommandée
      const implementation = this.generateImplementationPlan(
        baseOpportunity,
        bestPerformer,
        underperformer,
        adaptiveConfidence
      );

      const smartOpportunity: SmartLearningOpportunity = {
        ...baseOpportunity,
        contextMatch,
        timeRelevance,
        adaptiveConfidence,
        implementation
      };

      opportunities.push(smartOpportunity);
    }

    // Trier par priorité et confiance
    return opportunities.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.implementation.priority];
      const bPriority = priorityOrder[b.implementation.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return b.adaptiveConfidence - a.adaptiveConfidence;
    });
  }

  /**
   * Créer une opportunité de base
   */
  private createBaseOpportunity(
    bestPerformer: ContextualBenchmark,
    underperformer: ContextualBenchmark
  ): LearningOpportunity {
    const potentialGain = ((bestPerformer.average - underperformer.average) / underperformer.average) * 100;
    
    return {
      targetModel: underperformer.modelName,
      sourceModel: bestPerformer.modelName,
      metricName: bestPerformer.metricName,
      suggestion: this.generateContextualSuggestion(bestPerformer, underperformer, potentialGain),
      potentialGain,
      confidence: Math.min(bestPerformer.dataQuality, underperformer.dataQuality)
    };
  }

  /**
   * Calculer la similarité contextuelle
   */
  private calculateContextSimilarity(
    context1: ContextualBenchmark['context'],
    context2: ContextualBenchmark['context']
  ): number {
    let similarity = 1.0;
    let factors = 0;

    if (context1.platform && context2.platform) {
      similarity *= (context1.platform === context2.platform) ? 1.0 : 0.5;
      factors++;
    }

    if (context1.timeOfDay && context2.timeOfDay) {
      // Comparer les heures (tolérance de ±2h)
      const hour1 = parseInt(context1.timeOfDay);
      const hour2 = parseInt(context2.timeOfDay);
      const hourDiff = Math.abs(hour1 - hour2);
      similarity *= Math.max(0, 1 - hourDiff / 12); // 12h = similarité 0
      factors++;
    }

    if (context1.dayOfWeek && context2.dayOfWeek) {
      similarity *= (context1.dayOfWeek === context2.dayOfWeek) ? 1.0 : 0.7;
      factors++;
    }

    return factors > 0 ? similarity : 1.0;
  }

  /**
   * Calculer la pertinence temporelle
   */
  private calculateTimeRelevance(timeWindow1: string, timeWindow2: string): number {
    // Extraire les heures des fenêtres temporelles
    const hours1 = this.extractHours(timeWindow1);
    const hours2 = this.extractHours(timeWindow2);
    
    // Plus les fenêtres sont similaires, plus c'est pertinent
    const ratio = Math.min(hours1, hours2) / Math.max(hours1, hours2);
    return ratio;
  }

  /**
   * Calculer la confiance ajustée
   */
  private calculateAdaptiveConfidence(
    baseConfidence: number,
    dataQuality1: number,
    dataQuality2: number,
    contextMatch: number
  ): number {
    const avgDataQuality = (dataQuality1 + dataQuality2) / 2;
    return baseConfidence * avgDataQuality * (0.7 + 0.3 * contextMatch);
  }

  /**
   * Générer un plan d'implémentation
   */
  private generateImplementationPlan(
    opportunity: LearningOpportunity,
    bestPerformer: ContextualBenchmark,
    underperformer: ContextualBenchmark,
    confidence: number
  ): SmartLearningOpportunity['implementation'] {
    
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    let timeframe = '2-4 weeks';
    const dependencies: string[] = [];

    // Déterminer la priorité
    if (opportunity.potentialGain > 50 && confidence > 0.8) {
      priority = 'critical';
      timeframe = '1-2 weeks';
    } else if (opportunity.potentialGain > 25 && confidence > 0.7) {
      priority = 'high';
      timeframe = '2-3 weeks';
    } else if (opportunity.potentialGain > 10 && confidence > 0.6) {
      priority = 'medium';
      timeframe = '3-4 weeks';
    } else {
      priority = 'low';
      timeframe = '1-2 months';
    }

    // Ajouter des dépendances basées sur le contexte
    if (bestPerformer.context.platform !== underperformer.context.platform) {
      dependencies.push('Platform-specific optimization required');
    }

    if (bestPerformer.adaptiveWindow !== underperformer.adaptiveWindow) {
      dependencies.push('Window alignment needed');
    }

    const estimatedImpact = this.generateImpactEstimate(opportunity.potentialGain, confidence);

    return {
      priority,
      estimatedImpact,
      timeframe,
      dependencies
    };
  }

  /**
   * Utilitaires
   */
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private getMostFrequent<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    
    const frequency = new Map<T, number>();
    array.forEach(item => {
      frequency.set(item, (frequency.get(item) || 0) + 1);
    });
    
    let mostFrequent = array[0];
    let maxCount = 0;
    
    frequency.forEach((count, item) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = item;
      }
    });
    
    return mostFrequent;
  }

  private getDayName(dayNumber: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNumber] || 'Unknown';
  }

  private extractHours(timeWindow: string): number {
    const match = timeWindow.match(/(\d+)\s*hours?/i);
    if (match) return parseInt(match[1]);
    
    if (timeWindow.includes('day')) {
      const dayMatch = timeWindow.match(/(\d+)\s*days?/i);
      return dayMatch ? parseInt(dayMatch[1]) * 24 : 168; // Default 7 days
    }
    
    return 24; // Default 1 day
  }

  private generateContextualSuggestion(
    bestPerformer: ContextualBenchmark,
    underperformer: ContextualBenchmark,
    gain: number
  ): string {
    let suggestion = `Analyser les stratégies de ${bestPerformer.modelName} pour améliorer ${underperformer.metricName} de ${underperformer.modelName}`;
    
    if (bestPerformer.context.platform && bestPerformer.context.platform !== underperformer.context.platform) {
      suggestion += ` (optimisé pour ${bestPerformer.context.platform})`;
    }
    
    if (bestPerformer.context.timeOfDay) {
      suggestion += `. Meilleure performance observée à ${bestPerformer.context.timeOfDay}`;
    }
    
    if (bestPerformer.adaptiveWindow) {
      suggestion += `. Fenêtre adaptative recommandée: ${bestPerformer.timeWindow}`;
    }
    
    suggestion += ` (gain potentiel: +${gain.toFixed(1)}%)`;
    
    return suggestion;
  }

  private generateImpactEstimate(gain: number, confidence: number): string {
    const adjustedGain = gain * confidence;
    
    if (adjustedGain > 30) return 'Très fort impact attendu';
    if (adjustedGain > 15) return 'Fort impact attendu';
    if (adjustedGain > 5) return 'Impact modéré attendu';
    return 'Impact faible attendu';
  }
}

/**
 * Factory pour créer un analyseur de benchmarks intelligents
 */
export function createSmartBenchmarkAnalyzer(config?: Partial<SmartBenchmarkConfig>): SmartBenchmarkAnalyzer {
  const fullConfig: SmartBenchmarkConfig = {
    useAdaptiveWindows: true,
    contextualFilters: {},
    confidenceThreshold: 0.7,
    minSampleSize: 20,
    ...config
  };
  return new SmartBenchmarkAnalyzer(fullConfig);
}