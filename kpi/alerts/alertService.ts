import { db } from '../utils/db';
import { sendEmail } from '../utils/notif';
import { CronJob } from 'cron';

interface AlertRule {
  id: string;
  modelName: string;
  metricName: string;
  threshold: number;
  comparison: 'lt' | 'gt' | 'eq' | 'gte' | 'lte';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, any>;
}

interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook';
  config: Record<string, any>;
}

class AlertService {
  private rules: AlertRule[] = [];
  private channels: NotificationChannel[] = [];
  private cronJobs: Map<string, CronJob> = new Map();
  
  constructor() {
    this.loadRules();
    this.loadChannels();
  }
  
  private async loadRules() {
    // Charger depuis la config ou la base de données
    this.rules = [
      {
        id: 'ctr-low',
        modelName: 'marketing',
        metricName: 'ctr',
        threshold: 0.5,
        comparison: 'lt',
        severity: 'warning',
        message: 'CTR en dessous du seuil critique'
      },
      {
        id: 'cpl-high',
        modelName: 'marketing',
        metricName: 'cpl',
        threshold: 10,
        comparison: 'gt',
        severity: 'warning',
        message: 'Coût par lead trop élevé'
      },
      {
        id: 'conversion-critical',
        modelName: 'marketing',
        metricName: 'conversion_rate',
        threshold: 0.1,
        comparison: 'lt',
        severity: 'critical',
        message: 'Taux de conversion critique'
      },
      {
        id: 'revenue-drop',
        modelName: 'payment',
        metricName: 'daily_revenue',
        threshold: 0.8, // 80% du revenu habituel
        comparison: 'lt',
        severity: 'critical',
        message: 'Chute importante du revenu quotidien'
      },
      {
        id: 'churn-spike',
        modelName: 'payment',
        metricName: 'churn_rate',
        threshold: 5,
        comparison: 'gt',
        severity: 'warning',
        message: 'Augmentation du taux de churn'
      }
    ];
  }
  
  private loadChannels() {
    this.channels = [
      {
        type: 'email',
        config: {
          to: process.env.ALERT_EMAIL || 'admin@example.com',
          from: 'alerts@ofm-social.com'
        }
      }
    ];
    
    if (process.env.SLACK_WEBHOOK_URL) {
      this.channels.push({
        type: 'slack',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || '#alerts'
        }
      });
    }
  }
  
  async checkAlerts() {
    console.log('Vérification des alertes...');
    
    for (const rule of this.rules) {
      try {
        const triggered = await this.evaluateRule(rule);
        if (triggered) {
          await this.sendAlert(rule, triggered);
        }
      } catch (error) {
        console.error(`Erreur lors de l'évaluation de la règle ${rule.id}:`, error);
      }
    }
  }
  
  private async evaluateRule(rule: AlertRule): Promise<any | null> {
    // Récupérer les métriques récentes
    const timeWindow = rule.metadata?.timeWindow || '1 hour';
    const aggregation = rule.metadata?.aggregation || 'avg';
    
    const query = `
      SELECT 
        ${aggregation}(value) as agg_value,
        COUNT(*) as count,
        MIN(value) as min_value,
        MAX(value) as max_value
      FROM kpi_metrics
      WHERE model_name = $1 
        AND metric_name = $2
        AND created_at > NOW() - INTERVAL '${timeWindow}'
    `;
    
    const result = await db.query(query, [rule.modelName, rule.metricName]);
    
    if (result.rows.length === 0 || result.rows[0].count === 0) {
      return null;
    }
    
    const value = parseFloat(result.rows[0].agg_value);
    const triggered = this.compareValue(value, rule.threshold, rule.comparison);
    
    if (triggered) {
      return {
        ...rule,
        currentValue: value,
        stats: result.rows[0],
        triggeredAt: new Date()
      };
    }
    
    return null;
  }
  
  private compareValue(value: number, threshold: number, comparison: string): boolean {
    switch (comparison) {
      case 'lt': return value < threshold;
      case 'gt': return value > threshold;
      case 'eq': return value === threshold;
      case 'lte': return value <= threshold;
      case 'gte': return value >= threshold;
      default: return false;
    }
  }
  
  private async sendAlert(rule: AlertRule, triggerData: any) {
    // Vérifier le debounce pour éviter le spam
    const lastAlert = await this.getLastAlert(rule.id);
    const debounceMinutes = rule.metadata?.debounceMinutes || 60;
    
    if (lastAlert && 
        new Date().getTime() - new Date(lastAlert.created_at).getTime() < debounceMinutes * 60 * 1000) {
      console.log(`Alerte ${rule.id} en période de debounce`);
      return;
    }
    
    // Sauvegarder l'alerte
    await db.query(
      `INSERT INTO kpi_insights (model_name, insight, severity, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        rule.modelName,
        `${rule.message} - Valeur actuelle: ${triggerData.currentValue.toFixed(2)} (seuil: ${rule.threshold})`,
        rule.severity,
        { 
          ruleId: rule.id, 
          triggered: true, 
          stats: triggerData.stats,
          timestamp: triggerData.triggeredAt
        }
      ]
    );
    
    // Envoyer les notifications
    for (const channel of this.channels) {
      try {
        await this.sendNotification(channel, rule, triggerData);
      } catch (error) {
        console.error(`Erreur envoi notification ${channel.type}:`, error);
      }
    }
  }
  
  private async sendNotification(
    channel: NotificationChannel, 
    rule: AlertRule, 
    triggerData: any
  ) {
    const message = this.formatAlertMessage(rule, triggerData);
    
    switch (channel.type) {
      case 'email':
        await sendEmail({
          to: channel.config.to,
          from: channel.config.from,
          subject: `[${rule.severity.toUpperCase()}] Alerte KPI - ${rule.modelName}`,
          html: message.html,
          text: message.text
        });
        break;
        
      case 'slack':
        await this.sendSlackNotification(channel.config.webhookUrl, {
          channel: channel.config.channel,
          username: 'KPI Alert Bot',
          icon_emoji: rule.severity === 'critical' ? ':rotating_light:' : ':warning:',
          attachments: [{
            color: rule.severity === 'critical' ? 'danger' : 'warning',
            title: `Alerte ${rule.severity.toUpperCase()}: ${rule.message}`,
            fields: [
              { title: 'Modèle', value: rule.modelName, short: true },
              { title: 'Métrique', value: rule.metricName, short: true },
              { title: 'Valeur actuelle', value: triggerData.currentValue.toFixed(2), short: true },
              { title: 'Seuil', value: `${rule.comparison} ${rule.threshold}`, short: true }
            ],
            ts: Math.floor(Date.now() / 1000)
          }]
        });
        break;
        
      case 'webhook':
        await fetch(channel.config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...channel.config.headers
          },
          body: JSON.stringify({
            alert: rule,
            trigger: triggerData,
            timestamp: new Date().toISOString()
          })
        });
        break;
    }
  }
  
  private formatAlertMessage(rule: AlertRule, triggerData: any) {
    const html = `
      <h3>Alerte KPI - ${rule.severity.toUpperCase()}</h3>
      <p><strong>${rule.message}</strong></p>
      <table>
        <tr><td>Modèle:</td><td>${rule.modelName}</td></tr>
        <tr><td>Métrique:</td><td>${rule.metricName}</td></tr>
        <tr><td>Valeur actuelle:</td><td>${triggerData.currentValue.toFixed(2)}</td></tr>
        <tr><td>Seuil:</td><td>${rule.comparison} ${rule.threshold}</td></tr>
        <tr><td>Échantillons:</td><td>${triggerData.stats.count}</td></tr>
        <tr><td>Min/Max:</td><td>${triggerData.stats.min_value} / ${triggerData.stats.max_value}</td></tr>
      </table>
      <p>Déclenché le: ${new Date(triggerData.triggeredAt).toLocaleString()}</p>
    `;
    
    const text = `
Alerte KPI - ${rule.severity.toUpperCase()}
${rule.message}

Modèle: ${rule.modelName}
Métrique: ${rule.metricName}
Valeur actuelle: ${triggerData.currentValue.toFixed(2)}
Seuil: ${rule.comparison} ${rule.threshold}
Échantillons: ${triggerData.stats.count}
Min/Max: ${triggerData.stats.min_value} / ${triggerData.stats.max_value}

Déclenché le: ${new Date(triggerData.triggeredAt).toLocaleString()}
    `;
    
    return { html, text };
  }
  
  private async sendSlackNotification(webhookUrl: string, payload: any) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }
  }
  
  private async getLastAlert(ruleId: string): Promise<any> {
    const result = await db.query(
      `SELECT * FROM kpi_insights 
       WHERE metadata->>'ruleId' = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [ruleId]
    );
    
    return result.rows[0] || null;
  }
  
  // Démarrer le service avec un cron job
  start(schedule: string = '*/15 * * * *') { // Toutes les 15 minutes par défaut
    console.log(`Démarrage du service d'alertes avec le planning: ${schedule}`);
    
    const job = new CronJob(schedule, async () => {
      try {
        await this.checkAlerts();
      } catch (error) {
        console.error('Erreur lors de la vérification des alertes:', error);
      }
    });
    
    job.start();
    this.cronJobs.set('main', job);
    
    // Vérification initiale
    this.checkAlerts();
  }
  
  stop() {
    for (const [key, job] of this.cronJobs) {
      job.stop();
      this.cronJobs.delete(key);
    }
  }
  
  // Ajouter/modifier des règles dynamiquement
  async addRule(rule: AlertRule) {
    this.rules.push(rule);
    
    // Sauvegarder en base si nécessaire
    await db.query(
      `INSERT INTO alert_rules (id, config) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET config = $2`,
      [rule.id, JSON.stringify(rule)]
    );
  }
  
  removeRule(ruleId: string) {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }
  
  getRules(): AlertRule[] {
    return [...this.rules];
  }
}

// Singleton
export const alertService = new AlertService();

// Fonction helper pour démarrer le service
export function startAlertService(schedule?: string) {
  alertService.start(schedule);
}

// Export pour les tests
export { AlertService, AlertRule };