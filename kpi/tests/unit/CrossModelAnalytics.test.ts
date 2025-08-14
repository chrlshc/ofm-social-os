import { CrossModelAnalytics } from '../../models/CrossModelAnalytics';
import { db } from '../../utils/db';
import { callLLM } from '../../utils/llm';

jest.mock('../../utils/db');
jest.mock('../../utils/llm');

const mockDb = db as jest.Mocked<typeof db>;
const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

describe('CrossModelAnalytics', () => {
  let analytics: CrossModelAnalytics;
  
  beforeEach(() => {
    analytics = new CrossModelAnalytics();
    jest.clearAllMocks();
  });
  
  describe('getCrossModelBenchmarks', () => {
    it('should return benchmark data for a metric', async () => {
      const mockRows = [
        {
          model_name: 'marketing',
          model_avg: '2.5',
          total_samples: '100',
          dominant_trend: 'up',
          global_median: '2.0',
          global_mean: '2.2',
          global_p95: '3.0',
          best_performer: 'marketing'
        },
        {
          model_name: 'onboarding',
          model_avg: '1.8',
          total_samples: '80',
          dominant_trend: 'stable',
          global_median: '2.0',
          global_mean: '2.2',
          global_p95: '3.0',
          best_performer: 'marketing'
        }
      ];
      
      mockDb.query.mockResolvedValue({ rows: mockRows, rowCount: 2 });
      
      const benchmark = await analytics.getCrossModelBenchmarks('conversion_rate');
      
      expect(benchmark).toBeDefined();
      expect(benchmark!.metricName).toBe('conversion');
      expect(benchmark!.modelPerformance).toHaveLength(2);
      expect(benchmark!.globalBenchmark.bestPerformer).toBe('marketing');
      expect(benchmark!.modelPerformance[0].avgValue).toBe(2.5);
    });
    
    it('should handle metrics with no data', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const benchmark = await analytics.getCrossModelBenchmarks('nonexistent_metric');
      
      expect(benchmark).toBeNull();
    });
    
    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));
      
      const benchmark = await analytics.getCrossModelBenchmarks('ctr');
      
      expect(benchmark).toBeNull();
    });
  });
  
  describe('identifyLearningOpportunities', () => {
    it('should identify learning opportunities between models', async () => {
      // Mock getCrossModelBenchmarks pour retourner des données de test
      const mockBenchmark = {
        metricName: 'conversion',
        modelPerformance: [
          { modelName: 'marketing', avgValue: 3.5, trendDirection: 'up' as const, sampleSize: 100 },
          { modelName: 'onboarding', avgValue: 1.2, trendDirection: 'down' as const, sampleSize: 50 }
        ],
        globalBenchmark: {
          mean: 2.2,
          median: 2.0,
          p95: 3.0,
          bestPerformer: 'marketing'
        }
      };
      
      jest.spyOn(analytics, 'getCrossModelBenchmarks').mockResolvedValue(mockBenchmark);
      
      const opportunities = await analytics.identifyLearningOpportunities();
      
      expect(opportunities.length).toBeGreaterThan(0);
      expect(opportunities[0].sourceModel).toBe('marketing');
      expect(opportunities[0].targetModel).toBe('onboarding');
      expect(opportunities[0].confidence).toBeGreaterThan(0.6);
      expect(opportunities[0].impactScore).toBeGreaterThan(0.2);
    });
    
    it('should filter out low-impact opportunities', async () => {
      // Mock avec des différences de performance faibles
      const mockBenchmark = {
        metricName: 'conversion',
        modelPerformance: [
          { modelName: 'marketing', avgValue: 2.1, trendDirection: 'up' as const, sampleSize: 100 },
          { modelName: 'onboarding', avgValue: 2.0, trendDirection: 'stable' as const, sampleSize: 50 }
        ],
        globalBenchmark: {
          mean: 2.05,
          median: 2.0,
          p95: 2.2,
          bestPerformer: 'marketing'
        }
      };
      
      jest.spyOn(analytics, 'getCrossModelBenchmarks').mockResolvedValue(mockBenchmark);
      
      const opportunities = await analytics.identifyLearningOpportunities();
      
      // Devrait filtrer les opportunités avec un impact faible
      expect(opportunities.length).toBe(0);
    });
  });
  
  describe('generateLearningRecommendations', () => {
    it('should generate recommendations from insights', async () => {
      const mockInsights = [
        {
          sourceModel: 'marketing',
          targetModel: 'onboarding',
          insight: 'Marketing performs 50% better on conversion',
          confidence: 0.8,
          impactScore: 0.6,
          applicability: 'direct' as const,
          metrics: ['conversion_rate']
        }
      ];
      
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      mockCallLLM.mockResolvedValue(JSON.stringify({
        recommendation: 'Implement A/B testing strategy from marketing team',
        priority: 'high',
        expectedImpact: 75,
        implementationComplexity: 'medium',
        evidenceStrength: 0.8,
        steps: ['Analyze marketing A/B tests', 'Adapt to onboarding flow', 'Monitor results']
      }));
      
      const recommendations = await analytics.generateLearningRecommendations(mockInsights);
      
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].sourceModel).toBe('marketing');
      expect(recommendations[0].targetModel).toBe('onboarding');
      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[0].expectedImpact).toBe(75);
    });
    
    it('should handle LLM errors with fallback recommendations', async () => {
      const mockInsights = [
        {
          sourceModel: 'marketing',
          targetModel: 'onboarding',
          insight: 'Test insight',
          confidence: 0.9,
          impactScore: 0.8,
          applicability: 'direct' as const,
          metrics: ['ctr']
        }
      ];
      
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
      mockCallLLM.mockRejectedValue(new Error('LLM API error'));
      
      const recommendations = await analytics.generateLearningRecommendations(mockInsights);
      
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].recommendation).toContain('Analyser et adapter');
      expect(recommendations[0].priority).toBe('high'); // Impact score > 0.7
    });
  });
  
  describe('applyHighConfidenceRecommendations', () => {
    it('should auto-apply high-confidence, low-complexity recommendations', async () => {
      const mockRecommendations = [
        {
          sourceModel: 'marketing',
          targetModel: 'onboarding',
          recommendation: 'High confidence recommendation',
          priority: 'high' as const,
          expectedImpact: 80,
          implementationComplexity: 'low' as const,
          evidenceStrength: 0.9
        },
        {
          sourceModel: 'marketing',
          targetModel: 'payment',
          recommendation: 'Low confidence recommendation',
          priority: 'medium' as const,
          expectedImpact: 60,
          implementationComplexity: 'high' as const,
          evidenceStrength: 0.6
        }
      ];
      
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });
      
      await analytics.applyHighConfidenceRecommendations(mockRecommendations);
      
      // Seule la première recommendation devrait être auto-appliquée
      expect(mockDb.query).toHaveBeenCalledTimes(2); // 1 insert recommendation + 1 insert insight
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kpi_recommendations'),
        expect.arrayContaining(['onboarding', 'High confidence recommendation', 'high'])
      );
    });
  });
  
  describe('runCrossModelLearning', () => {
    it('should execute complete cross-model learning workflow', async () => {
      const mockInsights = [
        {
          sourceModel: 'marketing',
          targetModel: 'onboarding',
          insight: 'Test insight',
          confidence: 0.9,
          impactScore: 0.8,
          applicability: 'direct' as const,
          metrics: ['ctr']
        }
      ];
      
      const mockRecommendations = [
        {
          sourceModel: 'marketing',
          targetModel: 'onboarding',
          recommendation: 'Test recommendation',
          priority: 'high' as const,
          expectedImpact: 85,
          implementationComplexity: 'low' as const,
          evidenceStrength: 0.9
        }
      ];
      
      jest.spyOn(analytics, 'identifyLearningOpportunities').mockResolvedValue(mockInsights);
      jest.spyOn(analytics, 'generateLearningRecommendations').mockResolvedValue(mockRecommendations);
      jest.spyOn(analytics, 'applyHighConfidenceRecommendations').mockResolvedValue();
      
      const result = await analytics.runCrossModelLearning();
      
      expect(result.insights).toEqual(mockInsights);
      expect(result.recommendations).toEqual(mockRecommendations);
      expect(result.autoAppliedCount).toBe(1);
    });
  });
  
  describe('private methods', () => {
    it('should calculate impact score correctly', () => {
      const benchmark = {
        metricName: 'test',
        modelPerformance: [],
        globalBenchmark: { mean: 2.0, median: 1.8, p95: 3.0, bestPerformer: 'test' }
      };
      
      // Test via la méthode publique qui l'utilise
      const impact = (analytics as any).calculateImpactScore(2.8, 1.5, benchmark);
      
      // Impact = (2.8 - 1.5) / (3.0 - 2.0) = 1.3 / 1.0 = 1.0 (capped at 1)
      expect(impact).toBeCloseTo(1.0, 1);
    });
    
    it('should determine applicability correctly', () => {
      expect((analytics as any).determineApplicability('marketing', 'onboarding')).toBe('direct');
      expect((analytics as any).determineApplicability('marketing', 'payment')).toBe('adapted');
      expect((analytics as any).determineApplicability('unknown', 'other')).toBe('experimental');
    });
  });
});