import request from 'supertest';
import express from 'express';
import kpiController from '../../api/kpiController';
import { db } from '../../utils/db';

// Mock de la base de données
jest.mock('../../utils/db');
const mockDb = db as jest.Mocked<typeof db>;

// Créer une app Express pour les tests
const app = express();
app.use(express.json());
app.use('/api/kpi', kpiController);

describe('KPI Controller Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('POST /api/kpi/ingest', () => {
    it('should successfully ingest a metric', async () => {
      mockDb.insertMetric.mockResolvedValue(123);
      
      const metric = {
        modelName: 'marketing',
        metricName: 'ctr',
        value: 2.5,
        platform: 'instagram',
        campaignId: 'camp_123'
      };
      
      const response = await request(app)
        .post('/api/kpi/ingest')
        .send(metric)
        .expect(201);
      
      expect(response.body).toEqual({
        status: 'ok',
        id: 123,
        message: 'Metric ingested successfully'
      });
      
      expect(mockDb.insertMetric).toHaveBeenCalledWith({
        modelName: 'marketing',
        metricName: 'ctr',
        value: 2.5,
        platform: 'instagram',
        campaignId: 'camp_123',
        metadata: undefined
      });
    });
    
    it('should validate required fields', async () => {
      const invalidMetric = {
        modelName: 'marketing',
        // metricName missing
        value: 2.5
      };
      
      const response = await request(app)
        .post('/api/kpi/ingest')
        .send(invalidMetric)
        .expect(400);
      
      expect(response.body.error).toBe('Validation error');
      expect(mockDb.insertMetric).not.toHaveBeenCalled();
    });
    
    it('should handle database errors', async () => {
      mockDb.insertMetric.mockRejectedValue(new Error('Database error'));
      
      const metric = {
        modelName: 'marketing',
        metricName: 'ctr',
        value: 2.5
      };
      
      const response = await request(app)
        .post('/api/kpi/ingest')
        .send(metric)
        .expect(500);
      
      expect(response.body.error).toBe('Failed to ingest metric');
    });
  });
  
  describe('POST /api/kpi/ingest/batch', () => {
    it('should ingest multiple metrics in a transaction', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] })
      };
      
      mockDb.transaction.mockImplementation(async (callback) => {
        return callback(mockClient);
      });
      
      const metrics = [
        { modelName: 'marketing', metricName: 'ctr', value: 2.5 },
        { modelName: 'marketing', metricName: 'cpl', value: 8.0 }
      ];
      
      const response = await request(app)
        .post('/api/kpi/ingest/batch')
        .send(metrics)
        .expect(201);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.count).toBe(2);
      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });
  
  describe('GET /api/kpi/:modelName', () => {
    it('should fetch metrics for a model', async () => {
      const mockMetrics = [
        {
          id: 1,
          model_name: 'marketing',
          metric_name: 'ctr',
          value: 2.5,
          created_at: '2024-01-01T12:00:00Z'
        }
      ];
      
      mockDb.query.mockResolvedValue({
        rows: mockMetrics,
        rowCount: 1
      });
      
      const response = await request(app)
        .get('/api/kpi/marketing')
        .expect(200);
      
      expect(response.body).toEqual({
        model: 'marketing',
        count: 1,
        metrics: mockMetrics
      });
    });
    
    it('should apply query filters', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      await request(app)
        .get('/api/kpi/marketing')
        .query({
          platform: 'instagram',
          limit: '50',
          startDate: '2024-01-01T00:00:00Z'
        })
        .expect(200);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND platform = $'),
        expect.arrayContaining(['marketing', 'instagram'])
      );
    });
  });
  
  describe('GET /api/kpi/:modelName/aggregated', () => {
    it('should return aggregated metrics', async () => {
      const mockAggregated = [
        {
          model_name: 'marketing',
          metric_name: 'ctr',
          platform: 'instagram',
          period: '2024-01-01T12:00:00Z',
          avg_value: 2.5,
          count: 10
        }
      ];
      
      mockDb.query.mockResolvedValue({
        rows: mockAggregated,
        rowCount: 1
      });
      
      const response = await request(app)
        .get('/api/kpi/marketing/aggregated')
        .query({ groupBy: 'hour' })
        .expect(200);
      
      expect(response.body.groupBy).toBe('hour');
      expect(response.body.data).toEqual(mockAggregated);
    });
  });
  
  describe('POST /api/kpi/:modelName/analyze', () => {
    it('should analyze marketing model', async () => {
      // Mock pour simuler l'exécution du modèle
      mockDb.insertInsight.mockResolvedValue(1);
      mockDb.insertRecommendation.mockResolvedValue(1);
      
      const response = await request(app)
        .post('/api/kpi/marketing/analyze')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.model).toBe('marketing');
      expect(response.body).toHaveProperty('insights');
      expect(response.body).toHaveProperty('recommendations');
    });
    
    it('should return 404 for unknown model', async () => {
      const response = await request(app)
        .post('/api/kpi/unknown/analyze')
        .expect(404);
      
      expect(response.body.error).toBe('Model not found');
    });
  });
  
  describe('PATCH /api/kpi/recommendations/:id', () => {
    it('should update recommendation status', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });
      
      const response = await request(app)
        .patch('/api/kpi/recommendations/123')
        .send({ status: 'applied' })
        .expect(200);
      
      expect(response.body).toEqual({
        status: 'ok',
        id: '123',
        newStatus: 'applied'
      });
      
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE kpi_recommendations SET status = $1 WHERE id = $2',
        ['applied', '123']
      );
    });
    
    it('should validate status values', async () => {
      const response = await request(app)
        .patch('/api/kpi/recommendations/123')
        .send({ status: 'invalid' })
        .expect(400);
      
      expect(response.body.error).toBe('Invalid status');
    });
  });
  
  describe('GET /api/kpi/health', () => {
    it('should return healthy status', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 });
      
      const response = await request(app)
        .get('/api/kpi/health')
        .expect(200);
      
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
    
    it('should return unhealthy on database error', async () => {
      mockDb.query.mockRejectedValue(new Error('DB Connection failed'));
      
      const response = await request(app)
        .get('/api/kpi/health')
        .expect(500);
      
      expect(response.body.status).toBe('unhealthy');
    });
  });
});