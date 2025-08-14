import { KpiRecord, Insight, Recommendation } from './BaseModel';
import { ETLProcessor, ProcessedData } from './ETLProcessor';
import { callLLM } from '../utils/llm';

export interface AnalyticsConfig {
  modelName: string;
  algorithms: AnalyticsAlgorithm[];
  thresholds: ThresholdConfig;
  features: FeatureConfig;
}

export interface AnalyticsAlgorithm {
  name: string;
  type: 'statistical' | 'ml' | 'rule-based' | 'llm-powered';
  targetMetrics: string[];
  parameters: Record<string, any>;
  processor: (records: KpiRecord[], config: any) => Promise<Insight[]>;
}

export interface ThresholdConfig {
  [metricName: string]: {
    warning: number;
    critical: number;
    comparison: 'lt' | 'gt' | 'eq';
    unit?: string;
  };
}

export interface FeatureConfig {
  anomalyDetection: boolean;
  trendAnalysis: boolean;
  seasonalityDetection: boolean;
  correlationAnalysis: boolean;
  predictiveModeling: boolean;
  segmentAnalysis: boolean;
}

export interface TrendData {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  strength: number; // 0-1
  confidence: number; // 0-1
  timeframe: string;
  seasonality?: {
    detected: boolean;
    period: string;
    amplitude: number;
  };
}

export interface AnomalyData {
  metric: string;
  value: number;
  expectedRange: { min: number; max: number };
  severity: 'low' | 'medium' | 'high';
  probability: number;
  context: Record<string, any>;
}

export interface CorrelationData {
  metric1: string;
  metric2: string;
  correlation: number;
  pValue: number;
  significance: 'low' | 'medium' | 'high';
  interpretation: string;
}

export class AnalyticsEngine {
  private config: AnalyticsConfig;
  private etlProcessor: ETLProcessor;
  
  constructor(config: AnalyticsConfig, etlProcessor: ETLProcessor) {
    this.config = config;
    this.etlProcessor = etlProcessor;
  }
  
  // Point d'entrée principal pour l'analyse
  async runAnalysis(startDate?: Date, endDate?: Date): Promise<{
    insights: Insight[];
    recommendations: Recommendation[];
    trends: TrendData[];
    anomalies: AnomalyData[];
    correlations: CorrelationData[];
    processedData: ProcessedData;
  }> {
    console.log(`Starting analytics for model: ${this.config.modelName}`);
    
    // 1. ETL Processing
    const processedData = await this.etlProcessor.processKpiData(startDate, endDate);
    
    // 2. Statistical Analysis
    const insights: Insight[] = [];
    const recommendations: Recommendation[] = [];
    
    // Exécuter tous les algorithmes configurés
    for (const algorithm of this.config.algorithms) {
      try {
        const algorithmInsights = await algorithm.processor(
          processedData.transformedRecords,
          algorithm.parameters
        );
        insights.push(...algorithmInsights.map(insight => ({
          ...insight,
          metadata: {
            ...insight.metadata,
            algorithm: algorithm.name,
            algorithmType: algorithm.type
          }
        })));
      } catch (error) {
        console.error(`Algorithm ${algorithm.name} failed:`, error);
      }
    }
    
    // 3. Feature Analysis (si activées)
    const trends = this.config.features.trendAnalysis 
      ? await this.analyzeTrends(processedData.transformedRecords)
      : [];
      
    const anomalies = this.config.features.anomalyDetection
      ? await this.detectAnomalies(processedData.transformedRecords)
      : [];
      
    const correlations = this.config.features.correlationAnalysis
      ? await this.analyzeCorrelations(processedData.transformedRecords)
      : [];
    
    // 4. Generate Recommendations
    const analyticsRecommendations = await this.generateRecommendations({
      insights,
      trends,
      anomalies,
      correlations
    });
    
    recommendations.push(...analyticsRecommendations);
    
    return {
      insights,
      recommendations,
      trends,
      anomalies,
      correlations,
      processedData
    };
  }
  
  // Analyse des tendances
  private async analyzeTrends(records: KpiRecord[]): Promise<TrendData[]> {
    const trends: TrendData[] = [];
    const metricsToAnalyze = [...new Set(records.map(r => r.metricName))];
    
    for (const metric of metricsToAnalyze) {
      const metricRecords = records
        .filter(r => r.metricName === metric && r.createdAt)
        .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
      
      if (metricRecords.length < 5) continue; // Pas assez de données
      
      const trend = this.calculateTrend(metricRecords);
      const seasonality = this.config.features.seasonalityDetection
        ? this.detectSeasonality(metricRecords)
        : undefined;
      
      trends.push({
        metric,
        direction: trend.direction,
        strength: trend.strength,
        confidence: trend.confidence,
        timeframe: `${metricRecords.length} points over ${this.getTimespan(metricRecords)}`,
        seasonality
      });
    }
    
    return trends;
  }
  
  private calculateTrend(records: KpiRecord[]): {
    direction: 'up' | 'down' | 'stable';
    strength: number;
    confidence: number;
  } {
    const values = records.map(r => r.value);
    const n = values.length;
    
    // Régression linéaire simple
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculer R²
    const meanY = sumY / n;
    const totalSumSquares = values.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
    const residualSumSquares = values.reduce((sum, yi, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    
    const rSquared = 1 - (residualSumSquares / totalSumSquares);
    
    return {
      direction: slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'stable',
      strength: Math.abs(slope),
      confidence: Math.max(0, rSquared)
    };
  }
  
  private detectSeasonality(records: KpiRecord[]): {
    detected: boolean;
    period: string;
    amplitude: number;
  } | undefined {
    // Implémentation simplifiée de détection de saisonnalité
    // En production, utiliser une FFT ou des méthodes plus sophistiquées
    
    if (records.length < 14) return undefined; // Pas assez de données
    
    const values = records.map(r => r.value);
    const hours = records.map(r => r.createdAt!.getHours());
    
    // Analyser les patterns horaires
    const hourlyAverages = new Array(24).fill(0);
    const hourlyCounts = new Array(24).fill(0);
    
    values.forEach((value, i) => {
      const hour = hours[i];
      hourlyAverages[hour] += value;
      hourlyCounts[hour]++;
    });
    
    for (let i = 0; i < 24; i++) {
      if (hourlyCounts[i] > 0) {
        hourlyAverages[i] /= hourlyCounts[i];
      }
    }
    
    const mean = hourlyAverages.reduce((a, b) => a + b, 0) / 24;
    const variance = hourlyAverages.reduce((sum, avg) => sum + Math.pow(avg - mean, 2), 0) / 24;
    const amplitude = Math.sqrt(variance);
    
    return {
      detected: amplitude > mean * 0.1, // 10% de variation
      period: 'daily',
      amplitude
    };
  }
  
  // Détection d'anomalies
  private async detectAnomalies(records: KpiRecord[]): Promise<AnomalyData[]> {
    const anomalies: AnomalyData[] = [];
    const metricsToAnalyze = [...new Set(records.map(r => r.metricName))];
    
    for (const metric of metricsToAnalyze) {
      const metricRecords = records.filter(r => r.metricName === metric);
      if (metricRecords.length < 10) continue;
      
      const values = metricRecords.map(r => r.value);
      const stats = this.calculateStatistics(values);
      
      // Utiliser IQR pour détecter les outliers
      const q1 = this.percentile(values, 0.25);
      const q3 = this.percentile(values, 0.75);
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      
      metricRecords.forEach(record => {
        if (record.value < lowerBound || record.value > upperBound) {
          const distanceFromNormal = Math.min(
            Math.abs(record.value - lowerBound),
            Math.abs(record.value - upperBound)
          );
          
          const severity = distanceFromNormal > iqr * 2 ? 'high' :
                          distanceFromNormal > iqr ? 'medium' : 'low';
          
          anomalies.push({
            metric,
            value: record.value,
            expectedRange: { min: lowerBound, max: upperBound },
            severity,
            probability: Math.min(distanceFromNormal / (iqr * 3), 1),
            context: {
              platform: record.platform,
              campaignId: record.campaignId,
              createdAt: record.createdAt,
              meanValue: stats.mean,
              stdDev: stats.stdDev
            }
          });
        }
      });
    }
    
    return anomalies.sort((a, b) => b.probability - a.probability);
  }
  
  // Analyse des corrélations
  private async analyzeCorrelations(records: KpiRecord[]): Promise<CorrelationData[]> {
    const correlations: CorrelationData[] = [];
    const metrics = [...new Set(records.map(r => r.metricName))];
    
    // Analyser toutes les paires de métriques
    for (let i = 0; i < metrics.length; i++) {
      for (let j = i + 1; j < metrics.length; j++) {
        const metric1 = metrics[i];
        const metric2 = metrics[j];
        
        const correlation = await this.calculateCorrelation(records, metric1, metric2);
        if (correlation) {
          correlations.push(correlation);
        }
      }
    }
    
    return correlations.filter(c => Math.abs(c.correlation) > 0.3); // Seulement les corrélations significatives
  }
  
  private async calculateCorrelation(
    records: KpiRecord[], 
    metric1: string, 
    metric2: string
  ): Promise<CorrelationData | null> {
    // Grouper par timeframe pour avoir des paires de valeurs
    const timeGroups = new Map<string, { [key: string]: number }>();
    
    records.forEach(record => {
      const timeKey = record.createdAt?.toISOString().split('T')[0] || 'unknown';
      if (!timeGroups.has(timeKey)) {
        timeGroups.set(timeKey, {});
      }
      timeGroups.get(timeKey)![record.metricName] = record.value;
    });
    
    // Extraire les paires de valeurs
    const pairs: Array<{ x: number; y: number }> = [];
    timeGroups.forEach(group => {
      if (group[metric1] !== undefined && group[metric2] !== undefined) {
        pairs.push({ x: group[metric1], y: group[metric2] });
      }
    });
    
    if (pairs.length < 5) return null;
    
    // Calculer la corrélation de Pearson
    const n = pairs.length;
    const sumX = pairs.reduce((sum, p) => sum + p.x, 0);
    const sumY = pairs.reduce((sum, p) => sum + p.y, 0);
    const sumXY = pairs.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = pairs.reduce((sum, p) => sum + p.x * p.x, 0);
    const sumYY = pairs.reduce((sum, p) => sum + p.y * p.y, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    
    if (denominator === 0) return null;
    
    const correlation = numerator / denominator;
    
    // Calculer une approximation du p-value (test t)
    const tStat = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
    const pValue = this.approximatePValue(Math.abs(tStat), n - 2);
    
    return {
      metric1,
      metric2,
      correlation,
      pValue,
      significance: pValue < 0.01 ? 'high' : pValue < 0.05 ? 'medium' : 'low',
      interpretation: this.interpretCorrelation(correlation, metric1, metric2)
    };
  }
  
  // Génération de recommandations basées sur l'analyse
  private async generateRecommendations(analysisResults: {
    insights: Insight[];
    trends: TrendData[];
    anomalies: AnomalyData[];
    correlations: CorrelationData[];
  }): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    
    // Recommandations basées sur les anomalies
    for (const anomaly of analysisResults.anomalies.slice(0, 5)) {
      if (anomaly.severity === 'high') {
        recommendations.push({
          modelName: this.config.modelName,
          recommendation: `Investiguer l'anomalie détectée sur ${anomaly.metric}: valeur ${anomaly.value} hors de la plage normale [${anomaly.expectedRange.min.toFixed(2)}, ${anomaly.expectedRange.max.toFixed(2)}]`,
          priority: 'high'
        });
      }
    }
    
    // Recommandations basées sur les tendances
    for (const trend of analysisResults.trends) {
      if (trend.direction === 'down' && trend.confidence > 0.7) {
        recommendations.push({
          modelName: this.config.modelName,
          recommendation: `Tendance négative détectée sur ${trend.metric} avec une confiance de ${(trend.confidence * 100).toFixed(1)}%. Investiguer les causes et mettre en place des actions correctives.`,
          priority: trend.strength > 0.5 ? 'high' : 'medium'
        });
      }
    }
    
    // Recommandations basées sur les corrélations
    for (const correlation of analysisResults.correlations) {
      if (correlation.significance === 'high' && Math.abs(correlation.correlation) > 0.7) {
        recommendations.push({
          modelName: this.config.modelName,
          recommendation: `Forte corrélation détectée entre ${correlation.metric1} et ${correlation.metric2} (r=${correlation.correlation.toFixed(3)}). ${correlation.interpretation}`,
          priority: 'medium'
        });
      }
    }
    
    // Utiliser LLM pour des recommandations plus sophistiquées
    if (analysisResults.insights.length > 0) {
      try {
        const llmRecommendations = await this.generateLLMRecommendations(analysisResults);
        recommendations.push(...llmRecommendations);
      } catch (error) {
        console.error('Failed to generate LLM recommendations:', error);
      }
    }
    
    return recommendations;
  }
  
  private async generateLLMRecommendations(analysisResults: any): Promise<Recommendation[]> {
    const prompt = `
Analyse ces résultats d'analytics pour le modèle ${this.config.modelName} et génère des recommandations actionnables :

Insights: ${analysisResults.insights.slice(0, 3).map((i: any) => i.insight).join(', ')}
Tendances: ${analysisResults.trends.slice(0, 3).map((t: any) => `${t.metric}: ${t.direction}`).join(', ')}
Anomalies: ${analysisResults.anomalies.slice(0, 2).map((a: any) => `${a.metric}: ${a.severity}`).join(', ')}

Génère 2-3 recommandations concrètes en format JSON:
[{"recommendation": "action spécifique", "priority": "high|medium|low", "reasoning": "explication"}]
    `;
    
    const response = await callLLM(prompt, { temperature: 0.4, maxTokens: 400 });
    const parsed = JSON.parse(response);
    
    return parsed.map((rec: any) => ({
      modelName: this.config.modelName,
      recommendation: rec.recommendation,
      priority: rec.priority,
      metadata: { source: 'llm', reasoning: rec.reasoning }
    }));
  }
  
  // Méthodes utilitaires
  private calculateStatistics(values: number[]) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    return { mean, variance, stdDev, count: n };
  }
  
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
  
  private getTimespan(records: KpiRecord[]): string {
    if (records.length < 2) return 'unknown';
    
    const start = records[0].createdAt!;
    const end = records[records.length - 1].createdAt!;
    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffHours < 24) return `${diffHours.toFixed(1)} hours`;
    const diffDays = diffHours / 24;
    return `${diffDays.toFixed(1)} days`;
  }
  
  private approximatePValue(tStat: number, df: number): number {
    // Approximation très simplifiée du p-value
    // En production, utiliser une vraie distribution t de Student
    if (tStat > 3) return 0.001;
    if (tStat > 2.5) return 0.01;
    if (tStat > 2) return 0.05;
    return 0.1;
  }
  
  private interpretCorrelation(correlation: number, metric1: string, metric2: string): string {
    const strength = Math.abs(correlation);
    const direction = correlation > 0 ? 'positive' : 'négative';
    
    if (strength > 0.8) {
      return `Très forte corrélation ${direction}. ${metric1} et ${metric2} évoluent ensemble.`;
    } else if (strength > 0.6) {
      return `Forte corrélation ${direction}. Optimiser ${metric1} pourrait impacter ${metric2}.`;
    } else {
      return `Corrélation ${direction} modérée. Relation à surveiller.`;
    }
  }
}

// Factory pour créer des moteurs d'analyse configurés
export class AnalyticsEngineFactory {
  static createMarketingAnalytics(etlProcessor: ETLProcessor): AnalyticsEngine {
    const config: AnalyticsConfig = {
      modelName: 'marketing',
      algorithms: [
        {
          name: 'threshold_analyzer',
          type: 'rule-based',
          targetMetrics: ['ctr', 'cpl', 'conversion_rate'],
          parameters: {},
          processor: async (records: KpiRecord[]) => {
            const insights: Insight[] = [];
            // Implémentation des seuils pour le marketing
            return insights;
          }
        }
      ],
      thresholds: {
        ctr: { warning: 1.0, critical: 0.5, comparison: 'lt', unit: '%' },
        cpl: { warning: 8.0, critical: 12.0, comparison: 'gt', unit: '€' },
        conversion_rate: { warning: 2.0, critical: 1.0, comparison: 'lt', unit: '%' }
      },
      features: {
        anomalyDetection: true,
        trendAnalysis: true,
        seasonalityDetection: true,
        correlationAnalysis: true,
        predictiveModeling: false,
        segmentAnalysis: true
      }
    };
    
    return new AnalyticsEngine(config, etlProcessor);
  }
}