import { Request, Response, Router } from 'express';
import { db } from '../utils/db';
import { z } from 'zod';
import { alertService } from '../alerts/alertService';

const router = Router();

// Schémas de validation
const alertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  modelName: z.string().min(1),
  metricName: z.string().min(1),
  threshold: z.number(),
  comparison: z.enum(['lt', 'gt', 'eq', 'lte', 'gte']),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
  metadata: z.object({
    timeWindow: z.string().default('1 hour'),
    aggregation: z.enum(['avg', 'sum', 'min', 'max', 'count']).default('avg'),
    debounceMinutes: z.number().min(1).max(1440).default(60),
    tags: z.array(z.string()).optional(),
    description: z.string().optional()
  }).optional()
});

const notificationChannelSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['email', 'slack', 'webhook', 'teams', 'discord']),
  enabled: z.boolean().default(true),
  config: z.record(z.any()),
  severityFilter: z.array(z.enum(['info', 'warning', 'critical'])).optional(),
  modelFilter: z.array(z.string()).optional(),
  schedule: z.object({
    timezone: z.string().default('UTC'),
    quiet_hours: z.object({
      start: z.string().regex(/^\d{2}:\d{2}$/),
      end: z.string().regex(/^\d{2}:\d{2}$/)
    }).optional(),
    days: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).optional()
  }).optional()
});

const alertRuleUpdateSchema = alertRuleSchema.partial();

// Middleware de validation
const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: Function) => {
  try {
    req.body = schema.parse(req.body);
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

// GET /api/kpi/alerts/rules - Récupérer toutes les règles d'alerte
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const { modelName, enabled, severity } = req.query;
    
    let query = `
      SELECT r.*, 
             COUNT(CASE WHEN i.severity = 'critical' THEN 1 END) as critical_count,
             COUNT(CASE WHEN i.severity = 'warning' THEN 1 END) as warning_count,
             MAX(i.created_at) as last_triggered
      FROM alert_rules r
      LEFT JOIN kpi_insights i ON i.metadata->>'ruleId' = r.id 
        AND i.created_at > NOW() - INTERVAL '24 hours'
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (modelName) {
      conditions.push(`r.model_name = $${params.length + 1}`);
      params.push(modelName);
    }
    
    if (enabled !== undefined) {
      conditions.push(`r.enabled = $${params.length + 1}`);
      params.push(enabled === 'true');
    }
    
    if (severity) {
      conditions.push(`r.severity = $${params.length + 1}`);
      params.push(severity);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` GROUP BY r.id ORDER BY r.created_at DESC`;
    
    const result = await db.query(query, params);
    
    res.json({
      rules: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        modelName: row.model_name,
        metricName: row.metric_name,
        threshold: parseFloat(row.threshold),
        comparison: row.comparison,
        severity: row.severity,
        message: row.message,
        enabled: row.enabled,
        metadata: row.metadata,
        stats: {
          criticalCount: parseInt(row.critical_count),
          warningCount: parseInt(row.warning_count),
          lastTriggered: row.last_triggered
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching alert rules:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alert rules',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/kpi/alerts/rules - Créer une nouvelle règle d'alerte
router.post('/rules', validate(alertRuleSchema), async (req: Request, res: Response) => {
  try {
    const rule = req.body;
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Insérer en base
    const result = await db.query(
      `INSERT INTO alert_rules (id, name, model_name, metric_name, threshold, comparison, severity, message, enabled, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        ruleId,
        rule.name,
        rule.modelName,
        rule.metricName,
        rule.threshold,
        rule.comparison,
        rule.severity,
        rule.message,
        rule.enabled,
        rule.metadata || {}
      ]
    );
    
    // Ajouter à l'AlertService
    await alertService.addRule({
      id: ruleId,
      modelName: rule.modelName,
      metricName: rule.metricName,
      threshold: rule.threshold,
      comparison: rule.comparison,
      severity: rule.severity,
      message: rule.message,
      metadata: rule.metadata
    });
    
    res.status(201).json({
      status: 'success',
      rule: result.rows[0],
      message: 'Alert rule created successfully'
    });
  } catch (error) {
    console.error('Error creating alert rule:', error);
    res.status(500).json({ 
      error: 'Failed to create alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/kpi/alerts/rules/:id - Mettre à jour une règle d'alerte
router.put('/rules/:id', validate(alertRuleUpdateSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Construire la requête de mise à jour dynamiquement
    const setClause: string[] = [];
    const params: any[] = [];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'modelName') key = 'model_name';
      if (key === 'metricName') key = 'metric_name';
      
      params.push(value);
      setClause.push(`${key} = $${params.length}`);
    });
    
    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    params.push(new Date()); // updated_at
    setClause.push(`updated_at = $${params.length}`);
    
    params.push(id);
    
    const result = await db.query(
      `UPDATE alert_rules SET ${setClause.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }
    
    // Mettre à jour dans l'AlertService
    alertService.removeRule(id);
    const updatedRule = result.rows[0];
    await alertService.addRule({
      id: updatedRule.id,
      modelName: updatedRule.model_name,
      metricName: updatedRule.metric_name,
      threshold: parseFloat(updatedRule.threshold),
      comparison: updatedRule.comparison,
      severity: updatedRule.severity,
      message: updatedRule.message,
      metadata: updatedRule.metadata
    });
    
    res.json({
      status: 'success',
      rule: updatedRule,
      message: 'Alert rule updated successfully'
    });
  } catch (error) {
    console.error('Error updating alert rule:', error);
    res.status(500).json({ 
      error: 'Failed to update alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/kpi/alerts/rules/:id - Supprimer une règle d'alerte
router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('DELETE FROM alert_rules WHERE id = $1 RETURNING *', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }
    
    // Supprimer de l'AlertService
    alertService.removeRule(id);
    
    res.json({
      status: 'success',
      message: 'Alert rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting alert rule:', error);
    res.status(500).json({ 
      error: 'Failed to delete alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/kpi/alerts/rules/:id/test - Tester une règle d'alerte
router.post('/rules/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Récupérer la règle
    const ruleResult = await db.query('SELECT * FROM alert_rules WHERE id = $1', [id]);
    
    if (ruleResult.rowCount === 0) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }
    
    const rule = ruleResult.rows[0];
    
    // Simuler l'évaluation de la règle
    const mockTriggerData = {
      currentValue: rule.comparison === 'lt' ? rule.threshold - 1 : rule.threshold + 1,
      stats: { count: 10, min_value: 0, max_value: 100 },
      triggeredAt: new Date()
    };
    
    // Test de formatage du message d'alerte
    const testAlert = {
      rule: {
        id: rule.id,
        modelName: rule.model_name,
        metricName: rule.metric_name,
        threshold: parseFloat(rule.threshold),
        comparison: rule.comparison,
        severity: rule.severity,
        message: rule.message
      },
      trigger: mockTriggerData
    };
    
    res.json({
      status: 'success',
      test: testAlert,
      message: 'Alert rule test completed',
      wouldTrigger: true,
      formattedMessage: `${rule.message} - Valeur de test: ${mockTriggerData.currentValue} (seuil: ${rule.threshold})`
    });
  } catch (error) {
    console.error('Error testing alert rule:', error);
    res.status(500).json({ 
      error: 'Failed to test alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/kpi/alerts/channels - Récupérer les canaux de notification
router.get('/channels', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT c.*, COUNT(cr.id) as rules_count
       FROM notification_channels c
       LEFT JOIN channel_rules cr ON c.id = cr.channel_id
       GROUP BY c.id
       ORDER BY c.name`
    );
    
    res.json({
      channels: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching notification channels:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notification channels',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/kpi/alerts/channels - Créer un canal de notification
router.post('/channels', validate(notificationChannelSchema), async (req: Request, res: Response) => {
  try {
    const channel = req.body;
    const channelId = `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await db.query(
      `INSERT INTO notification_channels (id, name, type, enabled, config, severity_filter, model_filter, schedule)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        channelId,
        channel.name,
        channel.type,
        channel.enabled,
        channel.config,
        channel.severityFilter || null,
        channel.modelFilter || null,
        channel.schedule || null
      ]
    );
    
    res.status(201).json({
      status: 'success',
      channel: result.rows[0],
      message: 'Notification channel created successfully'
    });
  } catch (error) {
    console.error('Error creating notification channel:', error);
    res.status(500).json({ 
      error: 'Failed to create notification channel',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/kpi/alerts/channels/:id/test - Tester un canal de notification
router.post('/channels/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await db.query('SELECT * FROM notification_channels WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification channel not found' });
    }
    
    const channel = result.rows[0];
    
    // Créer un message de test
    const testMessage = {
      title: `Test depuis ${channel.name}`,
      body: 'Ceci est un message de test pour vérifier la configuration du canal.',
      severity: 'info',
      timestamp: new Date().toISOString()
    };
    
    // Ici on pourrait réellement envoyer le message de test
    // Pour l'instant, on simule juste
    
    res.json({
      status: 'success',
      channel: channel.name,
      testMessage,
      message: 'Test message would be sent successfully'
    });
  } catch (error) {
    console.error('Error testing notification channel:', error);
    res.status(500).json({ 
      error: 'Failed to test notification channel',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/kpi/alerts/history - Historique des alertes déclenchées
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { 
      modelName, 
      severity, 
      ruleId,
      startDate,
      endDate,
      limit = '50',
      offset = '0'
    } = req.query;
    
    let query = `
      SELECT i.*, r.name as rule_name, r.metric_name
      FROM kpi_insights i
      LEFT JOIN alert_rules r ON i.metadata->>'ruleId' = r.id
      WHERE i.metadata->>'ruleId' IS NOT NULL
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (modelName) {
      conditions.push(`i.model_name = $${params.length + 1}`);
      params.push(modelName);
    }
    
    if (severity) {
      conditions.push(`i.severity = $${params.length + 1}`);
      params.push(severity);
    }
    
    if (ruleId) {
      conditions.push(`i.metadata->>'ruleId' = $${params.length + 1}`);
      params.push(ruleId);
    }
    
    if (startDate) {
      conditions.push(`i.created_at >= $${params.length + 1}`);
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push(`i.created_at <= $${params.length + 1}`);
      params.push(endDate);
    }
    
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY i.created_at DESC`;
    
    // Pagination
    params.push(parseInt(limit as string));
    query += ` LIMIT $${params.length}`;
    
    params.push(parseInt(offset as string));
    query += ` OFFSET $${params.length}`;
    
    const result = await db.query(query, params);
    
    // Compter le total pour la pagination
    let countQuery = query.replace(/SELECT i\.\*, r\.name as rule_name, r\.metric_name/, 'SELECT COUNT(*)');
    countQuery = countQuery.replace(/ORDER BY i\.created_at DESC.*$/, '');
    
    const countResult = await db.query(countQuery, params.slice(0, -2)); // Enlever limit et offset
    
    res.json({
      alerts: result.rows,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Error fetching alert history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alert history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/kpi/alerts/stats - Statistiques des alertes
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { period = '7d' } = req.query;
    
    let interval: string;
    switch (period) {
      case '1d': interval = '1 day'; break;
      case '7d': interval = '7 days'; break;
      case '30d': interval = '30 days'; break;
      default: interval = '7 days';
    }
    
    const stats = await Promise.all([
      // Alertes par sévérité
      db.query(
        `SELECT severity, COUNT(*) as count
         FROM kpi_insights
         WHERE created_at > NOW() - INTERVAL '${interval}'
           AND metadata->>'ruleId' IS NOT NULL
         GROUP BY severity`
      ),
      
      // Alertes par modèle
      db.query(
        `SELECT model_name, COUNT(*) as count
         FROM kpi_insights
         WHERE created_at > NOW() - INTERVAL '${interval}'
           AND metadata->>'ruleId' IS NOT NULL
         GROUP BY model_name`
      ),
      
      // Top règles les plus déclenchées
      db.query(
        `SELECT r.name, r.id, COUNT(i.*) as trigger_count
         FROM alert_rules r
         LEFT JOIN kpi_insights i ON i.metadata->>'ruleId' = r.id
           AND i.created_at > NOW() - INTERVAL '${interval}'
         GROUP BY r.id, r.name
         ORDER BY trigger_count DESC
         LIMIT 10`
      ),
      
      // Évolution temporelle
      db.query(
        `SELECT DATE_TRUNC('hour', created_at) as hour, 
                COUNT(*) as count,
                severity
         FROM kpi_insights
         WHERE created_at > NOW() - INTERVAL '${interval}'
           AND metadata->>'ruleId' IS NOT NULL
         GROUP BY hour, severity
         ORDER BY hour`
      )
    ]);
    
    res.json({
      period,
      bySeverity: stats[0].rows,
      byModel: stats[1].rows,
      topRules: stats[2].rows,
      timeline: stats[3].rows
    });
  } catch (error) {
    console.error('Error fetching alert stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alert statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;