import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { KpiMetric, KpiInsight, KpiRecommendation, KpiModelLearning } from '../data/kpiEntity';

// Configuration PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ofm_social',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Configuration TypeORM
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'ofm_social',
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [KpiMetric, KpiInsight, KpiRecommendation, KpiModelLearning],
  migrations: ['../migrations/*.ts'],
  subscribers: [],
});

// Interface pour les résultats de requêtes
interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

// Wrapper pour les requêtes avec gestion d'erreur
export const db = {
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development') {
        console.log('Query executed', { text, duration, rows: res.rowCount });
      }
      return res;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },
  
  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  
  // Helpers pour les opérations courantes
  async insertMetric(metric: Partial<KpiMetric>): Promise<number> {
    const { rows } = await this.query<{ id: number }>(
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
    return rows[0].id;
  },
  
  async insertInsight(insight: Partial<KpiInsight>): Promise<number> {
    const { rows } = await this.query<{ id: number }>(
      `INSERT INTO kpi_insights (model_name, insight, severity, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        insight.modelName,
        insight.insight,
        insight.severity || 'info',
        insight.metadata || {}
      ]
    );
    return rows[0].id;
  },
  
  async insertRecommendation(recommendation: Partial<KpiRecommendation>): Promise<number> {
    const { rows } = await this.query<{ id: number }>(
      `INSERT INTO kpi_recommendations (model_name, recommendation, priority, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        recommendation.modelName,
        recommendation.recommendation,
        recommendation.priority || 'medium',
        recommendation.metadata || {}
      ]
    );
    return rows[0].id;
  }
};

// Initialiser TypeORM
export async function initializeDatabase() {
  try {
    await AppDataSource.initialize();
    console.log('TypeORM Data Source has been initialized');
  } catch (error) {
    console.error('Error during TypeORM initialization:', error);
    throw error;
  }
}

// Fermer les connexions
export async function closeDatabase() {
  await pool.end();
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}