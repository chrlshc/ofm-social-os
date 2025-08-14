import { BaseModel, KpiRecord, Insight, Recommendation, ModelLearning } from '../../models/BaseModel';

// Classe de test concrète pour tester BaseModel
class TestModel extends BaseModel {
  protected name = 'test';
  
  async fetchMetrics(): Promise<KpiRecord[]> {
    return [
      { modelName: 'test', metricName: 'test_metric', value: 10 },
      { modelName: 'test', metricName: 'test_metric', value: 20 },
      { modelName: 'test', metricName: 'test_metric', value: 30 }
    ];
  }
  
  async analyseKpi(records: KpiRecord[]): Promise<Insight[]> {
    return [
      { modelName: 'test', insight: 'Test insight', severity: 'info' }
    ];
  }
  
  async generateRecommendations(insights: Insight[]): Promise<Recommendation[]> {
    return [
      { modelName: 'test', recommendation: 'Test recommendation', priority: 'medium' }
    ];
  }
  
  async learnFromOtherModels(learnings: ModelLearning[]): Promise<void> {
    // Mock implementation
  }
  
  async sharelearnings(): Promise<ModelLearning[]> {
    return [
      { 
        sourceModel: 'test', 
        targetModel: 'other', 
        learning: 'Test learning', 
        confidence: 0.8 
      }
    ];
  }
}

describe('BaseModel', () => {
  let model: TestModel;
  
  beforeEach(() => {
    model = new TestModel();
  });
  
  describe('calculateStats', () => {
    it('should calculate correct statistics', () => {
      const values = [1, 2, 3, 4, 5];
      const stats = (model as any).calculateStats(values);
      
      expect(stats.mean).toBe(3);
      expect(stats.median).toBe(3);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.stdDev).toBeCloseTo(1.58, 1);
    });
    
    it('should handle empty array', () => {
      const stats = (model as any).calculateStats([]);
      
      expect(stats.mean).toBe(0);
      expect(stats.median).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.stdDev).toBe(0);
    });
  });
  
  describe('detectAnomalies', () => {
    it('should detect outliers using z-score', () => {
      const values = [1, 2, 3, 4, 5, 100]; // 100 est un outlier
      const anomalies = (model as any).detectAnomalies(values, 2);
      
      expect(anomalies).toContain(100);
      expect(anomalies.length).toBe(1);
    });
    
    it('should return empty array when no anomalies', () => {
      const values = [1, 2, 3, 4, 5];
      const anomalies = (model as any).detectAnomalies(values, 3);
      
      expect(anomalies).toHaveLength(0);
    });
  });
  
  describe('movingAverage', () => {
    it('should calculate moving average correctly', () => {
      const values = [1, 2, 3, 4, 5, 6];
      const ma = (model as any).movingAverage(values, 3);
      
      expect(ma).toEqual([2, 3, 4, 5]); // (1+2+3)/3=2, (2+3+4)/3=3, etc.
    });
    
    it('should handle window larger than array', () => {
      const values = [1, 2];
      const ma = (model as any).movingAverage(values, 5);
      
      expect(ma).toHaveLength(0);
    });
  });
  
  describe('run', () => {
    it('should execute complete workflow', async () => {
      const result = await model.run();
      
      expect(result.insights).toHaveLength(1);
      expect(result.recommendations).toHaveLength(1);
      expect(result.learnings).toHaveLength(1);
      
      expect(result.insights[0].insight).toBe('Test insight');
      expect(result.recommendations[0].recommendation).toBe('Test recommendation');
      expect(result.learnings[0].learning).toBe('Test learning');
    });
  });
});