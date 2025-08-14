import { KpiRecord } from '../models/BaseModel';
import { calculateBasicStats } from '../analytics/StatsUtils';

export interface BenchmarkData {
  metricName: string;
  modelName: string;
  value: number;
  rank: number;
  percentile: number;
  industryAverage: number;
  topPerformerValue: number;
  lastUpdated: Date;
}

export interface TrendData {
  metricName: string;
  direction: 'upward' | 'downward' | 'stable';
  strength: number;
  velocity: number;
  confidence: number;
  timeframe: string;
}

export interface CompetitivePosition {
  modelName: string;
  overallRank: number;
  totalModels: number;
  strengthAreas: string[];
  improvementAreas: string[];
  benchmarkScore: number;
}

export class BenchmarkAnalyzer {
  private benchmarkData: Map<string, BenchmarkData[]> = new Map();
  private industryAverages: Map<string, number> = new Map();

  constructor() {
    this.initializeIndustryAverages();
  }

  private initializeIndustryAverages() {
    this.industryAverages.set('ctr', 2.5);
    this.industryAverages.set('cpl', 6.8);
    this.industryAverages.set('conversion_rate', 3.2);
    this.industryAverages.set('engagement_rate', 4.1);
    this.industryAverages.set('roas', 3.8);
    this.industryAverages.set('reach', 15000);
    this.industryAverages.set('impressions', 45000);
  }

  async computeModelBenchmarks(
    modelName: string, 
    records: KpiRecord[]
  ): Promise<Record<string, { rank: number; score: number }>> {
    const benchmarks: Record<string, { rank: number; score: number }> = {};
    const metrics = [...new Set(records.map(r => r.metricName))];

    for (const metric of metrics) {
      const metricRecords = records.filter(r => r.metricName === metric);
      if (metricRecords.length === 0) continue;

      const stats = calculateBasicStats(metricRecords.map(r => r.value));
      const industryAvg = this.industryAverages.get(metric) || stats.mean;
      
      const percentileScore = this.calculatePercentile(stats.mean, metric);
      const rank = this.calculateRank(percentileScore);

      benchmarks[metric] = {
        rank,
        score: Math.round(percentileScore)
      };

      await this.updateBenchmarkData(modelName, metric, stats.mean, rank, percentileScore);
    }

    return benchmarks;
  }

  private calculatePercentile(value: number, metricName: string): number {
    const industryAvg = this.industryAverages.get(metricName) || value;
    
    const ratio = value / industryAvg;
    
    if (['cpl'].includes(metricName)) {
      return Math.max(0, Math.min(100, 100 - (ratio - 1) * 50));
    } else {
      return Math.max(0, Math.min(100, (ratio - 0.5) * 100));
    }
  }

  private calculateRank(percentile: number): number {
    if (percentile >= 90) return 1;
    if (percentile >= 75) return 2;
    if (percentile >= 50) return 3;
    if (percentile >= 25) return 4;
    return 5;
  }

  private async updateBenchmarkData(
    modelName: string,
    metricName: string,
    value: number,
    rank: number,
    percentile: number
  ): Promise<void> {
    const key = `${modelName}_${metricName}`;
    const existing = this.benchmarkData.get(key) || [];
    
    const newEntry: BenchmarkData = {
      metricName,
      modelName,
      value,
      rank,
      percentile,
      industryAverage: this.industryAverages.get(metricName) || value,
      topPerformerValue: this.calculateTopPerformerValue(metricName),
      lastUpdated: new Date()
    };

    existing.push(newEntry);
    this.benchmarkData.set(key, existing.slice(-30));
  }

  private calculateTopPerformerValue(metricName: string): number {
    const industryAvg = this.industryAverages.get(metricName) || 1;
    
    const multipliers: Record<string, number> = {
      'ctr': 2.5,
      'conversion_rate': 2.0,
      'engagement_rate': 2.2,
      'roas': 2.0,
      'cpl': 0.4,
      'reach': 3.0,
      'impressions': 2.8
    };

    const multiplier = multipliers[metricName] || 1.5;
    return ['cpl'].includes(metricName) ? industryAvg * multiplier : industryAvg * multiplier;
  }

  async detectTrendDirection(
    modelName: string,
    metricName: string,
    records: KpiRecord[]
  ): Promise<TrendData> {
    const metricRecords = records
      .filter(r => r.metricName === metricName && r.createdAt)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());

    if (metricRecords.length < 3) {
      return {
        metricName,
        direction: 'stable',
        strength: 0,
        velocity: 0,
        confidence: 0,
        timeframe: 'insufficient_data'
      };
    }

    const values = metricRecords.map(r => r.value);
    const timepoints = metricRecords.map(r => r.createdAt!.getTime());
    
    const { slope, confidence } = this.calculateLinearTrend(values, timepoints);
    const direction = this.determineTrendDirection(slope);
    const strength = Math.abs(slope);
    const velocity = this.calculateVelocity(values);

    return {
      metricName,
      direction,
      strength: Math.min(1, strength),
      velocity,
      confidence,
      timeframe: this.getTimeframeDescription(metricRecords)
    };
  }

  private calculateLinearTrend(values: number[], timepoints: number[]): { slope: number; confidence: number } {
    const n = values.length;
    const sumX = timepoints.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = timepoints.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumXX = timepoints.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    const meanY = sumY / n;
    const ssr = values.reduce((sum, y, i) => {
      const predicted = slope * timepoints[i];
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    
    const sst = values.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const rSquared = Math.max(0, 1 - ssr / sst);

    return { slope: slope / 1000000, confidence: rSquared };
  }

  private determineTrendDirection(slope: number): 'upward' | 'downward' | 'stable' {
    const threshold = 0.1;
    if (Math.abs(slope) < threshold) return 'stable';
    return slope > 0 ? 'upward' : 'downward';
  }

  private calculateVelocity(values: number[]): number {
    if (values.length < 2) return 0;
    
    const recentChange = values[values.length - 1] - values[values.length - 2];
    const initialValue = values[0];
    
    return initialValue === 0 ? 0 : Math.abs(recentChange / initialValue);
  }

  private getTimeframeDescription(records: KpiRecord[]): string {
    if (records.length < 2) return 'single_point';
    
    const start = records[0].createdAt!;
    const end = records[records.length - 1].createdAt!;
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) return `${Math.round(diffHours)}h`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d`;
  }

  async getCompetitivePosition(modelName: string, allModelsData: Map<string, KpiRecord[]>): Promise<CompetitivePosition> {
    const modelRecords = allModelsData.get(modelName) || [];
    const allModels = Array.from(allModelsData.keys());
    
    const modelBenchmarks = await this.computeModelBenchmarks(modelName, modelRecords);
    const overallScore = this.calculateOverallScore(modelBenchmarks);
    
    const modelScores = new Map<string, number>();
    for (const [otherModel, records] of allModelsData) {
      const benchmarks = await this.computeModelBenchmarks(otherModel, records);
      modelScores.set(otherModel, this.calculateOverallScore(benchmarks));
    }

    const sortedModels = Array.from(modelScores.entries())
      .sort(([,a], [,b]) => b - a);
    
    const rank = sortedModels.findIndex(([model]) => model === modelName) + 1;
    
    const strengthAreas = Object.entries(modelBenchmarks)
      .filter(([, data]) => data.rank <= 2)
      .map(([metric]) => metric);
    
    const improvementAreas = Object.entries(modelBenchmarks)
      .filter(([, data]) => data.rank >= 4)
      .map(([metric]) => metric);

    return {
      modelName,
      overallRank: rank,
      totalModels: allModels.length,
      strengthAreas,
      improvementAreas,
      benchmarkScore: overallScore
    };
  }

  private calculateOverallScore(benchmarks: Record<string, { rank: number; score: number }>): number {
    const scores = Object.values(benchmarks).map(b => b.score);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  getBenchmarkHistory(modelName: string, metricName: string): BenchmarkData[] {
    const key = `${modelName}_${metricName}`;
    return this.benchmarkData.get(key) || [];
  }

  getIndustryAverage(metricName: string): number {
    return this.industryAverages.get(metricName) || 0;
  }
}