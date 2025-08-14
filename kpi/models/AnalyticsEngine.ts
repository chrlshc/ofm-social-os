import { KpiRecord, Insight, Recommendation } from './BaseModel';
import { ETLProcessor, ProcessedData } from './ETLProcessor';
import { callLLM } from '../utils/llm';
import { 
  detectAnomalies, 
  analyzeTrends, 
  computeCorrelations, 
  calculateBasicStats,
  StatsSummary,
  AnomalyResult,
  TrendResult,
  CorrelationResult
} from '../analytics/StatsUtils';
import { 
  generateRecommendations, 
  generateContextualInsights, 
  KPIContext 
} from '../advisors/AIAdvisor';

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
    
    // 4. AI-Powered Insights Generation
    const aiInsights = await this.produceAIInsights(processedData.transformedRecords, trends, anomalies);
    insights.push(...aiInsights);
    
    // 5. Generate Recommendations (incluant AI Advisor)
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
  
  // Analyse des tendances utilisant StatsUtils
  private async analyzeTrends(records: KpiRecord[]): Promise<TrendData[]> {
    const trends: TrendData[] = [];
    const metricsToAnalyze = [...new Set(records.map(r => r.metricName))];
    
    for (const metric of metricsToAnalyze) {
      const metricRecords = records
        .filter(r => r.metricName === metric && r.createdAt)
        .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
      
      if (metricRecords.length < 5) continue; // Pas assez de données
      
      const values = metricRecords.map(r => r.value);
      const trendResult = analyzeTrends(values, {
        detectSeasonality: this.config.features.seasonalityDetection,
        seasonalityPeriods: [7, 24, 30] // journalier, horaire, mensuel
      });
      
      trends.push({
        metric,
        direction: trendResult.direction,
        strength: trendResult.strength,
        confidence: trendResult.rSquared, // Utiliser R² comme mesure de confiance
        timeframe: `${metricRecords.length} points over ${this.getTimespan(metricRecords)}`,
        seasonality: trendResult.seasonality ? {
          detected: trendResult.seasonality.detected,
          period: trendResult.seasonality.period ? `${trendResult.seasonality.period} units` : 'unknown',
          amplitude: trendResult.seasonality.amplitude || 0
        } : undefined
      });
    }
    
    return trends;
  }
  
  
  
  // Détection d'anomalies utilisant StatsUtils
  private async detectAnomalies(records: KpiRecord[]): Promise<AnomalyData[]> {
    const anomalies: AnomalyData[] = [];
    const metricsToAnalyze = [...new Set(records.map(r => r.metricName))];
    
    for (const metric of metricsToAnalyze) {
      const metricRecords = records.filter(r => r.metricName === metric);
      if (metricRecords.length < 10) continue;
      
      const values = metricRecords.map(r => r.value);
      const stats = calculateBasicStats(values);
      
      // Utiliser les 3 méthodes de détection d'anomalies
      const methods: Array<'zscore' | 'iqr' | 'modified_zscore'> = ['zscore', 'iqr', 'modified_zscore'];
      const detectedAnomalies = new Set<number>();
      
      for (const method of methods) {
        const methodAnomalies = detectAnomalies(values, method);
        methodAnomalies
          .filter(a => a.isAnomaly)
          .forEach(a => detectedAnomalies.add(a.index));
      }
      
      // Convertir les indices d'anomalies en AnomalyData
      Array.from(detectedAnomalies).forEach(index => {
        const record = metricRecords[index];
        const anomalyResult = detectAnomalies(values, 'iqr')[index];
        
        if (anomalyResult && record) {
          anomalies.push({
            metric,
            value: record.value,
            expectedRange: { 
              min: stats.quartiles.q1 - 1.5 * stats.quartiles.iqr, 
              max: stats.quartiles.q3 + 1.5 * stats.quartiles.iqr 
            },
            severity: anomalyResult.severity,
            probability: Math.abs(anomalyResult.zScore) / 3, // Normaliser le z-score
            context: {
              platform: record.platform,
              campaignId: record.campaignId,
              createdAt: record.createdAt,
              meanValue: stats.mean,
              stdDev: stats.standardDeviation,
              detectionMethod: 'multi-method',
              zScore: anomalyResult.zScore
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
    const seriesA: number[] = [];
    const seriesB: number[] = [];
    
    timeGroups.forEach(group => {
      if (group[metric1] !== undefined && group[metric2] !== undefined) {
        seriesA.push(group[metric1]);
        seriesB.push(group[metric2]);
      }
    });
    
    if (seriesA.length < 5) return null;
    
    // Utiliser la fonction de corrélation de StatsUtils
    const correlationResult = computeCorrelations(seriesA, seriesB);
    
    // Mapper la significance de StatsUtils vers notre format
    const significance = correlationResult.significance === 'strong' ? 'high' :
                        correlationResult.significance === 'moderate' ? 'medium' :
                        correlationResult.significance === 'weak' ? 'medium' : 'low';
    
    return {
      metric1,
      metric2,
      correlation: correlationResult.correlation,
      pValue: correlationResult.pValue,
      significance,
      interpretation: this.interpretCorrelation(correlationResult.correlation, metric1, metric2)
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
  
  // Méthodes utilitaires enrichies avec StatsUtils
  private calculateStatistics(values: number[]): StatsSummary {
    return calculateBasicStats(values);
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

  // Production d'insights AI intégrés
  async produceAIInsights(
    records: KpiRecord[], 
    trends: TrendData[], 
    anomalies: AnomalyData[]
  ): Promise<Insight[]> {
    const aggregatedMetrics = await this.computeAggregatedMetrics(records);
    const trendsMap = await this.detectTrends(records);
    const benchmarks = await this.getModelBenchmarks();
    const anomalyDescriptions = anomalies.map(a => 
      `${a.metric}: ${a.value} (${a.severity} severity)`
    );

    const kpiContext: KPIContext = {
      modelName: this.config.modelName,
      aggregatedMetrics,
      trends: trendsMap,
      benchmarks,
      anomalies: anomalyDescriptions
    };

    try {
      const recommendations = await generateRecommendations(kpiContext, {
        priorityLevel: 'high',
        includeActionItems: true
      });

      const historicalData = await this.getHistoricalData(records);
      const contextualInsights = await generateContextualInsights(kpiContext, historicalData);

      return [...recommendations, ...contextualInsights];
    } catch (error) {
      console.error('Error producing AI insights:', error);
      return [{
        modelName: this.config.modelName,
        insight: `Erreur lors de la génération d'insights AI: ${error.message}`,
        timestamp: new Date(),
        category: 'error',
        priority: 'high'
      }];
    }
  }

  private async computeAggregatedMetrics(records: KpiRecord[]): Promise<Record<string, number>> {
    const metrics: Record<string, number[]> = {};
    
    records.forEach(record => {
      if (!metrics[record.metricName]) {
        metrics[record.metricName] = [];
      }
      metrics[record.metricName].push(record.value);
    });

    const aggregated: Record<string, number> = {};
    for (const [metricName, values] of Object.entries(metrics)) {
      const stats = calculateBasicStats(values);
      aggregated[metricName] = stats.mean;
    }

    return aggregated;
  }

  private async detectTrends(records: KpiRecord[]): Promise<Record<string, string>> {
    const trends: Record<string, string> = {};
    const metrics = [...new Set(records.map(r => r.metricName))];

    for (const metric of metrics) {
      const metricRecords = records
        .filter(r => r.metricName === metric)
        .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
      
      if (metricRecords.length >= 5) {
        const values = metricRecords.map(r => r.value);
        const trendResult = analyzeTrends(values);
        trends[metric] = trendResult.direction;
      }
    }

    return trends;
  }

  private async getModelBenchmarks(): Promise<Record<string, { rank: number; score: number }>> {
    return {
      ctr: { rank: 1, score: 85 },
      cpl: { rank: 3, score: 72 },
      engagement_rate: { rank: 2, score: 78 }
    };
  }

  private async getHistoricalData(records: KpiRecord[]): Promise<Array<{ date: Date; metrics: Record<string, number> }>> {
    const dailyData = new Map<string, Record<string, number>>();
    
    records.forEach(record => {
      if (!record.createdAt) return;
      
      const dateKey = record.createdAt.toISOString().split('T')[0];
      if (!dailyData.has(dateKey)) {
        dailyData.set(dateKey, {});
      }
      dailyData.get(dateKey)![record.metricName] = record.value;
    });

    return Array.from(dailyData.entries())
      .map(([dateStr, metrics]) => ({
        date: new Date(dateStr),
        metrics
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-30); // Derniers 30 jours
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