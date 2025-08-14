import { MarketingKpiModel } from '../../models/MarketingKpiModel';
import { db } from '../../utils/db';
import { callLLM } from '../../utils/llm';

jest.mock('../../utils/db');
jest.mock('../../utils/llm');

const mockDb = db as jest.Mocked<typeof db>;
const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

describe('MarketingKpiModel', () => {
  let model: MarketingKpiModel;
  
  beforeEach(() => {
    model = new MarketingKpiModel();
    jest.clearAllMocks();
  });
  
  describe('fetchMetrics', () => {
    it('should fetch metrics with default options', async () => {
      const mockRows = [
        {
          model_name: 'marketing',
          metric_name: 'ctr',
          value: '2.5',
          platform: 'instagram',
          campaign_id: 'camp_123',
          metadata: {},
          created_at: '2024-01-01T12:00:00Z'
        }
      ];
      
      mockDb.query.mockResolvedValue({ rows: mockRows, rowCount: 1 });
      
      const metrics = await model.fetchMetrics();
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM kpi_metrics WHERE model_name = $1'),
        ['marketing']
      );
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(2.5);
    });
    
    it('should apply filters correctly', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      await model.fetchMetrics({
        platform: 'tiktok',
        limit: 50,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      });
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND platform = $'),
        expect.arrayContaining(['marketing', 'tiktok'])
      );
    });
  });
  
  describe('analyseKpi', () => {
    it('should detect low CTR and generate warning', async () => {
      const records = [
        { modelName: 'marketing', metricName: 'ctr', value: 0.3, platform: 'instagram' },
        { modelName: 'marketing', metricName: 'ctr', value: 0.4, platform: 'instagram' }
      ];
      
      const insights = await model.analyseKpi(records);
      
      const ctrInsight = insights.find(i => i.insight.includes('CTR moyen faible'));
      expect(ctrInsight).toBeDefined();
      expect(ctrInsight?.severity).toBe('warning');
    });
    
    it('should detect high CPL and generate warning', async () => {
      const records = [
        { modelName: 'marketing', metricName: 'cpl', value: 15, platform: 'instagram' },
        { modelName: 'marketing', metricName: 'cpl', value: 12, platform: 'instagram' }
      ];
      
      const insights = await model.analyseKpi(records);
      
      const cplInsight = insights.find(i => i.insight.includes('CPL moyen élevé'));
      expect(cplInsight).toBeDefined();
      expect(cplInsight?.severity).toBe('warning');
    });
    
    it('should calculate platform conversion rates', async () => {
      const records = [
        { modelName: 'marketing', metricName: 'conversion_rate', value: 2.5, platform: 'instagram' },
        { modelName: 'marketing', metricName: 'conversion_rate', value: 3.0, platform: 'instagram' }
      ];
      
      const insights = await model.analyseKpi(records);
      
      const platformInsight = insights.find(i => i.insight.includes('instagram: taux de conversion'));
      expect(platformInsight).toBeDefined();
      expect(platformInsight?.metadata?.conversion_rate).toBe(2.75);
    });
    
    it('should detect anomalies', async () => {
      const records = [
        { modelName: 'marketing', metricName: 'ctr', value: 1.0 },
        { modelName: 'marketing', metricName: 'ctr', value: 1.1 },
        { modelName: 'marketing', metricName: 'ctr', value: 50.0 } // Anomalie
      ];
      
      const insights = await model.analyseKpi(records);
      
      const anomalyInsight = insights.find(i => i.insight.includes('valeurs CTR anormales'));
      expect(anomalyInsight).toBeDefined();
      expect(anomalyInsight?.severity).toBe('critical');
    });
  });
  
  describe('generateRecommendations', () => {
    it('should generate recommendations based on insights', async () => {
      const insights = [
        {
          modelName: 'marketing',
          insight: 'CTR moyen faible',
          severity: 'warning' as const,
          metadata: { metric: 'ctr', mean: 0.3 }
        }
      ];
      
      const recommendations = await model.generateRecommendations(insights);
      
      expect(recommendations.length).toBeGreaterThan(0);
      const ctrRec = recommendations.find(r => r.recommendation.includes('formats visuels'));
      expect(ctrRec).toBeDefined();
      expect(ctrRec?.priority).toBe('high');
    });
    
    it('should call LLM for AI recommendations', async () => {
      mockCallLLM.mockResolvedValue(JSON.stringify([
        { action: 'Test AI recommendation', impact: 'high', timeframe: 'court terme' }
      ]));
      
      const insights = [
        { modelName: 'marketing', insight: 'Test insight', severity: 'warning' as const }
      ];
      
      const recommendations = await model.generateRecommendations(insights);
      
      expect(mockCallLLM).toHaveBeenCalled();
      const aiRec = recommendations.find(r => r.metadata?.source === 'ai');
      expect(aiRec).toBeDefined();
    });
    
    it('should handle LLM errors gracefully', async () => {
      mockCallLLM.mockRejectedValue(new Error('LLM API error'));
      
      const insights = [
        { modelName: 'marketing', insight: 'Test insight', severity: 'warning' as const }
      ];
      
      // Ne devrait pas throw
      const recommendations = await model.generateRecommendations(insights);
      expect(recommendations).toBeDefined();
    });
  });
  
  describe('sharelearnings', () => {
    it('should share top performing platform insights', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ platform: 'instagram', avg_conversion: '3.5' }],
        rowCount: 1
      });
      
      mockDb.query.mockResolvedValueOnce({
        rows: [{ hour: 18, avg_engagement: '2.8' }],
        rowCount: 1
      });
      
      const learnings = await model.sharelearnings();
      
      expect(learnings.length).toBeGreaterThan(0);
      const platformLearning = learnings.find(l => l.learning.includes('instagram'));
      expect(platformLearning).toBeDefined();
      expect(platformLearning?.targetModel).toBe('onboarding');
    });
  });
  
  describe('learnFromOtherModels', () => {
    it('should apply high-confidence learnings', async () => {
      const learnings = [
        {
          sourceModel: 'onboarding',
          targetModel: 'marketing',
          learning: 'Best time to engage is 18h',
          confidence: 0.9
        },
        {
          sourceModel: 'payment',
          targetModel: 'marketing',
          learning: 'Low confidence insight',
          confidence: 0.5
        }
      ];
      
      await model.learnFromOtherModels(learnings);
      
      // Seul le learning avec confidence > 0.7 devrait être appliqué
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kpi_insights'),
        expect.arrayContaining(['marketing', expect.stringContaining('Best time')])
      );
    });
  });
});