import { Pool, PoolClient, QueryResult } from 'pg';
import { env } from './env';
import { logger } from './logger';

// Connection pool with reasonable defaults
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Pool error handling
pool.on('error', (err) => {
  logger.error({ err }, 'PostgreSQL pool error');
});

// Database interface
interface DbInterface {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  getClient(): Promise<PoolClient>;
  end(): Promise<void>;
}

const db: DbInterface = {
  query: async <T = any>(text: string, params?: any[]): Promise<QueryResult<T>> => {
    const start = Date.now();
    try {
      const result = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug({ 
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        rows: result.rowCount 
      }, 'Database query executed');
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error({ 
        err: error,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration 
      }, 'Database query failed');
      throw error;
    }
  },
  
  getClient: () => pool.connect(),
  end: () => pool.end(),
};

export { db, pool };