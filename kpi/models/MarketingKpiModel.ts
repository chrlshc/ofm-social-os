import { BaseModel, KpiRecord, Insight, Recommendation, ModelLearning } from './BaseModel';
import { db } from '../utils/db';
import { callLLM } from '../utils/llm';

export class MarketingKpiModel extends BaseModel {
  protected name = 'marketing';
  
  async fetchMetrics(options?: {
    startDate?: Date;
    endDate?: Date;
    platform?: string;
    limit?: number;
  }): Promise<KpiRecord[]> {
    let query = 'SELECT * FROM kpi_metrics WHERE model_name = $1';
    const params: any[] = [this.name];
    
    if (options?.startDate) {
      params.push(options.startDate);
      query += ` AND created_at >= $${params.length}`;
    }
    
    if (options?.endDate) {
      params.push(options.endDate);
      query += ` AND created_at <= $${params.length}`;
    }
    
    if (options?.platform) {
      params.push(options.platform);
      query += ` AND platform = $${params.length}`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (options?.limit) {
      params.push(options.limit);
      query += ` LIMIT $${params.length}`;
    }
    
    const res = await db.query(query, params);
    return res.rows.map(row => ({
      modelName: row.model_name,
      metricName: row.metric_name,
      value: parseFloat(row.value),
      platform: row.platform,
      campaignId: row.campaign_id,
      metadata: row.metadata,
      createdAt: new Date(row.created_at)
    }));
  }
  
  async analyseKpi(records: KpiRecord[]): Promise<Insight[]> {
    const insights: Insight[] = [];
    
    // Analyse CTR
    const ctrRecords = records.filter(r => r.metricName === 'ctr');
    if (ctrRecords.length > 0) {
      const ctrValues = ctrRecords.map(r => r.value);
      const stats = this.calculateStats(ctrValues);
      
      if (stats.mean < 0.5) {
        insights.push({
          modelName: this.name,
          insight: `CTR moyen faible: ${stats.mean.toFixed(2)}%. Recommandation: réviser le contenu créatif`,
          severity: 'warning',
          metadata: { metric: 'ctr', mean: stats.mean }
        });
      }
      
      // Détection d'anomalies
      const anomalies = this.detectAnomalies(ctrValues);
      if (anomalies.length > 0) {
        insights.push({
          modelName: this.name,
          insight: `${anomalies.length} valeurs CTR anormales détectées`,
          severity: 'critical',
          metadata: { anomalies }
        });
      }
    }
    
    // Analyse CPL (Coût Par Lead)
    const cplRecords = records.filter(r => r.metricName === 'cpl');
    if (cplRecords.length > 0) {
      const cplValues = cplRecords.map(r => r.value);
      const stats = this.calculateStats(cplValues);
      
      if (stats.mean > 10) {
        insights.push({
          modelName: this.name,
          insight: `CPL moyen élevé: ${stats.mean.toFixed(2)}€. Optimisation du ciblage nécessaire`,
          severity: 'warning',
          metadata: { metric: 'cpl', mean: stats.mean }
        });
      }
    }
    
    // Analyse par plateforme
    const platforms = ['instagram', 'tiktok', 'x', 'reddit'];
    for (const platform of platforms) {
      const platformRecords = records.filter(r => r.platform === platform);
      if (platformRecords.length > 0) {
        const conversionRecords = platformRecords.filter(r => r.metricName === 'conversion_rate');
        if (conversionRecords.length > 0) {
          const avgConversion = conversionRecords.reduce((sum, r) => sum + r.value, 0) / conversionRecords.length;
          insights.push({
            modelName: this.name,
            insight: `${platform}: taux de conversion moyen ${avgConversion.toFixed(2)}%`,
            severity: 'info',
            metadata: { platform, conversion_rate: avgConversion }
          });
        }
      }
    }
    
    // Tendances temporelles
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    const recentRecords = records.filter(r => r.createdAt && r.createdAt > last7Days);
    const olderRecords = records.filter(r => r.createdAt && r.createdAt <= last7Days);
    
    if (recentRecords.length > 0 && olderRecords.length > 0) {
      const recentCtr = recentRecords
        .filter(r => r.metricName === 'ctr')
        .reduce((sum, r) => sum + r.value, 0) / recentRecords.length;
      const olderCtr = olderRecords
        .filter(r => r.metricName === 'ctr')
        .reduce((sum, r) => sum + r.value, 0) / olderRecords.length;
      
      const trend = ((recentCtr - olderCtr) / olderCtr) * 100;
      insights.push({
        modelName: this.name,
        insight: `Tendance CTR sur 7 jours: ${trend > 0 ? '+' : ''}${trend.toFixed(1)}%`,
        severity: trend < -10 ? 'warning' : 'info',
        metadata: { trend, recent: recentCtr, older: olderCtr }
      });
    }
    
    return insights;
  }
  
  async generateRecommendations(insights: Insight[]): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    
    // Recommandations basées sur les insights
    for (const insight of insights) {
      if (insight.severity === 'warning' || insight.severity === 'critical') {
        if (insight.metadata?.metric === 'ctr' && insight.metadata.mean < 0.5) {
          recommendations.push({
            modelName: this.name,
            recommendation: 'Tester de nouveaux formats visuels: vidéos courtes (15-30s), carrousels interactifs',
            priority: 'high',
            metadata: { basedOn: 'low_ctr' }
          });
          
          recommendations.push({
            modelName: this.name,
            recommendation: 'Réviser les accroches: utiliser des questions directes ou des statistiques choc',
            priority: 'medium',
            metadata: { basedOn: 'low_ctr' }
          });
        }
        
        if (insight.metadata?.metric === 'cpl' && insight.metadata.mean > 10) {
          recommendations.push({
            modelName: this.name,
            recommendation: 'Affiner le ciblage: exclure les audiences peu performantes, tester des lookalike audiences',
            priority: 'high',
            metadata: { basedOn: 'high_cpl' }
          });
        }
      }
    }
    
    // Utiliser l'IA pour des recommandations plus sophistiquées
    if (insights.length > 0) {
      const insightsSummary = insights
        .map(i => `- ${i.insight}`)
        .join('\n');
      
      const llmPrompt = `En tant qu'expert marketing digital, analyse ces KPI et propose 3 actions concrètes:
      
${insightsSummary}

Réponds en format JSON avec la structure:
[{"action": "description", "impact": "high/medium/low", "timeframe": "court/moyen/long terme"}]`;
      
      try {
        const response = await callLLM(llmPrompt);
        const aiRecommendations = JSON.parse(response);
        
        for (const aiRec of aiRecommendations) {
          recommendations.push({
            modelName: this.name,
            recommendation: `${aiRec.action} (Impact: ${aiRec.impact}, ${aiRec.timeframe})`,
            priority: aiRec.impact === 'high' ? 'high' : aiRec.impact === 'medium' ? 'medium' : 'low',
            metadata: { source: 'ai', ...aiRec }
          });
        }
      } catch (error) {
        console.error('Erreur lors de l\'appel LLM:', error);
      }
    }
    
    return recommendations;
  }
  
  async learnFromOtherModels(learnings: ModelLearning[]): Promise<void> {
    // Appliquer les apprentissages d'autres modèles
    for (const learning of learnings) {
      if (learning.targetModel === this.name && learning.confidence > 0.7) {
        // Sauvegarder l'apprentissage pour utilisation future
        await db.query(
          `INSERT INTO kpi_insights (model_name, insight, severity, metadata)
           VALUES ($1, $2, $3, $4)`,
          [
            this.name,
            `Apprentissage de ${learning.sourceModel}: ${learning.learning}`,
            'info',
            { source: learning.sourceModel, confidence: learning.confidence }
          ]
        );
      }
    }
  }
  
  async sharelearnings(): Promise<ModelLearning[]> {
    const learnings: ModelLearning[] = [];
    
    // Partager les meilleures pratiques découvertes
    const topPerformingPlatforms = await db.query(
      `SELECT platform, AVG(value) as avg_conversion
       FROM kpi_metrics
       WHERE model_name = $1 AND metric_name = 'conversion_rate'
       GROUP BY platform
       ORDER BY avg_conversion DESC
       LIMIT 1`,
      [this.name]
    );
    
    if (topPerformingPlatforms.rows.length > 0) {
      const bestPlatform = topPerformingPlatforms.rows[0];
      learnings.push({
        sourceModel: this.name,
        targetModel: 'onboarding',
        learning: `${bestPlatform.platform} génère les meilleurs taux de conversion (${parseFloat(bestPlatform.avg_conversion).toFixed(2)}%)`,
        confidence: 0.85
      });
    }
    
    // Partager les heures optimales de publication
    const bestHours = await db.query(
      `SELECT EXTRACT(HOUR FROM created_at) as hour, AVG(value) as avg_engagement
       FROM kpi_metrics
       WHERE model_name = $1 AND metric_name = 'engagement_rate'
       GROUP BY hour
       ORDER BY avg_engagement DESC
       LIMIT 3`,
      [this.name]
    );
    
    if (bestHours.rows.length > 0) {
      const hours = bestHours.rows.map(r => r.hour).join(', ');
      learnings.push({
        sourceModel: this.name,
        targetModel: 'all',
        learning: `Heures optimales pour l'engagement: ${hours}h`,
        confidence: 0.75
      });
    }
    
    return learnings;
  }
}