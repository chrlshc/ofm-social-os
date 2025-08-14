import { Request, Response, Router } from 'express';
import { db } from '../utils/db';
import { MarketingKpiModel } from '../models/MarketingKpiModel';
import { z } from 'zod';

const router = Router();

// Schémas de validation
const ingestSchema = z.object({
  modelName: z.string(),
  metricName: z.string(),
  value: z.number(),
  platform: z.string().optional(),
  campaignId: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  platform: z.string().optional(),
  limit: z.string().regex(/^\d+$/).optional()
});

// Middleware de validation
const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: Function) => {
  try {
    schema.parse(req.body || req.query);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Ingestion des métriques depuis les autres services
router.post('/ingest', validate(ingestSchema), async (req: Request, res: Response) => {
  try {
    const data = ingestSchema.parse(req.body);
    
    const id = await db.insertMetric({
      modelName: data.modelName,
      metricName: data.metricName,
      value: data.value,
      platform: data.platform,
      campaignId: data.campaignId,
      metadata: data.metadata
    });
    
    res.status(201).json({ 
      status: 'ok', 
      id,
      message: 'Metric ingested successfully' 
    });
  } catch (error) {
    console.error('Error ingesting metric:', error);
    res.status(500).json({ 
      error: 'Failed to ingest metric',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Ingestion en batch
router.post('/ingest/batch', async (req: Request, res: Response) => {
  try {
    const metrics = z.array(ingestSchema).parse(req.body);
    
    const results = await db.transaction(async (client) => {
      const ids = [];
      for (const metric of metrics) {
        const { rows } = await client.query(
          `INSERT INTO kpi_metrics (model_name, metric_name, value, platform, campaign_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            metric.modelName,
            metric.metricName,
            metric.value,
            metric.platform || null,
            metric.campaignId || null,
            metric.metadata || {}
          ]
        );
        ids.push(rows[0].id);
      }
      return ids;
    });
    
    res.status(201).json({
      status: 'ok',
      count: results.length,
      ids: results
    });
  } catch (error) {
    console.error('Error in batch ingest:', error);
    res.status(500).json({ 
      error: 'Failed to ingest metrics batch',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Récupération des métriques d'un modèle
router.get('/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const query = querySchema.parse(req.query);
    
    let sql = 'SELECT * FROM kpi_metrics WHERE model_name = $1';
    const params: any[] = [modelName];
    
    if (query.startDate) {
      params.push(query.startDate);
      sql += ` AND created_at >= $${params.length}`;
    }
    
    if (query.endDate) {
      params.push(query.endDate);
      sql += ` AND created_at <= $${params.length}`;
    }
    
    if (query.platform) {
      params.push(query.platform);
      sql += ` AND platform = $${params.length}`;
    }
    
    sql += ' ORDER BY created_at DESC';
    
    if (query.limit) {
      params.push(parseInt(query.limit));
      sql += ` LIMIT $${params.length}`;
    } else {
      sql += ' LIMIT 1000'; // Limite par défaut
    }
    
    const result = await db.query(sql, params);
    
    res.json({
      model: modelName,
      count: result.rowCount,
      metrics: result.rows
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Récupération des métriques agrégées
router.get('/:modelName/aggregated', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const { groupBy = 'hour', metricName } = req.query;
    
    let timeGroup = 'hour';
    if (groupBy === 'day') timeGroup = 'day';
    else if (groupBy === 'week') timeGroup = 'week';
    
    let sql = `
      SELECT 
        model_name,
        metric_name,
        platform,
        DATE_TRUNC('${timeGroup}', created_at) as period,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as count,
        STDDEV(value) as stddev_value
      FROM kpi_metrics
      WHERE model_name = $1
    `;
    
    const params: any[] = [modelName];
    
    if (metricName) {
      params.push(metricName);
      sql += ` AND metric_name = $${params.length}`;
    }
    
    sql += ` GROUP BY model_name, metric_name, platform, period
             ORDER BY period DESC
             LIMIT 500`;
    
    const result = await db.query(sql, params);
    
    res.json({
      model: modelName,
      groupBy: timeGroup,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching aggregated metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch aggregated metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Récupération des insights générés
router.get('/:modelName/insights', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const { limit = '50', severity } = req.query;
    
    let sql = 'SELECT * FROM kpi_insights WHERE model_name = $1';
    const params: any[] = [modelName];
    
    if (severity) {
      params.push(severity);
      sql += ` AND severity = $${params.length}`;
    }
    
    sql += ' ORDER BY created_at DESC';
    
    params.push(parseInt(limit as string));
    sql += ` LIMIT $${params.length}`;
    
    const result = await db.query(sql, params);
    
    res.json({
      model: modelName,
      count: result.rowCount,
      insights: result.rows
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ 
      error: 'Failed to fetch insights',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Récupération des recommandations
router.get('/:modelName/recommendations', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const { status = 'pending', priority } = req.query;
    
    let sql = 'SELECT * FROM kpi_recommendations WHERE model_name = $1';
    const params: any[] = [modelName];
    
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    
    if (priority) {
      params.push(priority);
      sql += ` AND priority = $${params.length}`;
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 50';
    
    const result = await db.query(sql, params);
    
    res.json({
      model: modelName,
      count: result.rowCount,
      recommendations: result.rows
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch recommendations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Exécuter l'analyse pour un modèle
router.post('/:modelName/analyze', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    
    if (modelName === 'marketing') {
      const model = new MarketingKpiModel();
      const result = await model.run();
      
      // Sauvegarder les insights et recommandations
      for (const insight of result.insights) {
        await db.insertInsight(insight);
      }
      
      for (const recommendation of result.recommendations) {
        await db.insertRecommendation(recommendation);
      }
      
      res.json({
        status: 'ok',
        model: modelName,
        insights: result.insights.length,
        recommendations: result.recommendations.length,
        learnings: result.learnings.length,
        result
      });
    } else {
      res.status(404).json({ 
        error: 'Model not found',
        availableModels: ['marketing']
      });
    }
  } catch (error) {
    console.error('Error analyzing model:', error);
    res.status(500).json({ 
      error: 'Failed to analyze model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Mise à jour du statut d'une recommandation
router.patch('/recommendations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'applied', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses: ['pending', 'applied', 'rejected']
      });
    }
    
    await db.query(
      'UPDATE kpi_recommendations SET status = $1 WHERE id = $2',
      [status, id]
    );
    
    res.json({ status: 'ok', id, newStatus: status });
  } catch (error) {
    console.error('Error updating recommendation:', error);
    res.status(500).json({ 
      error: 'Failed to update recommendation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check
router.get('/health', async (req: Request, res: Response) => {
  try {
    await db.query('SELECT 1');
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;