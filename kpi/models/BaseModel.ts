export interface KpiRecord {
  modelName: string;
  metricName: string;
  value: number;
  platform?: string;
  campaignId?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
}

export interface Insight {
  modelName: string;
  insight: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, any>;
  createdAt?: Date;
}

export interface Recommendation {
  modelName: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
}

export interface ModelLearning {
  sourceModel: string;
  targetModel: string;
  learning: string;
  confidence: number;
}

export abstract class BaseModel {
  protected abstract name: string;
  
  // Lire les KPI depuis la BDD
  abstract fetchMetrics(options?: {
    startDate?: Date;
    endDate?: Date;
    platform?: string;
    limit?: number;
  }): Promise<KpiRecord[]>;
  
  // Calculer des indicateurs dérivés, détecter des anomalies
  abstract analyseKpi(records: KpiRecord[]): Promise<Insight[]>;
  
  // Générer des recommandations à partir des analyses
  abstract generateRecommendations(insights: Insight[]): Promise<Recommendation[]>;
  
  // Apprendre des autres modèles
  abstract learnFromOtherModels(learnings: ModelLearning[]): Promise<void>;
  
  // Partager les apprentissages avec d'autres modèles
  abstract sharelearnings(): Promise<ModelLearning[]>;
  
  // Calculer des métriques statistiques
  protected calculateStats(values: number[]): {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
  } {
    if (values.length === 0) {
      return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const stdDev = Math.sqrt(
      values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
    );
    
    return {
      mean,
      median,
      stdDev,
      min: sorted[0],
      max: sorted[sorted.length - 1]
    };
  }
  
  // Détecter les anomalies par z-score
  protected detectAnomalies(values: number[], threshold: number = 3): number[] {
    const stats = this.calculateStats(values);
    return values.filter(v => Math.abs((v - stats.mean) / stats.stdDev) > threshold);
  }
  
  // Calculer la moyenne mobile
  protected movingAverage(values: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = window - 1; i < values.length; i++) {
      const slice = values.slice(i - window + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b) / window);
    }
    return result;
  }
  
  async run(): Promise<{
    insights: Insight[];
    recommendations: Recommendation[];
    learnings: ModelLearning[];
  }> {
    const records = await this.fetchMetrics();
    const insights = await this.analyseKpi(records);
    const recommendations = await this.generateRecommendations(insights);
    const learnings = await this.sharelearnings();
    
    return { insights, recommendations, learnings };
  }
}