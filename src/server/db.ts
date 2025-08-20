import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// Get the appropriate database URL based on environment
const getDatabaseUrl = (): string => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return process.env.DATABASE_URL_OFM_PRODUCTION || '';
  } else {
    // For development, staging, or any other environment
    return process.env.DATABASE_URL_OFM_DEV || process.env.DATABASE_URL_OFM_PRODUCTION || '';
  }
};

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  console.warn('No database URL configured. Please set DATABASE_URL_OFM_* in environment variables');
  // Don't exit during build time
  if (process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
    console.warn('Running without database connection');
  }
}

// Create the connection pool only if we have a database URL
export const pool = databaseUrl ? new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: false // For RDS with self-signed cert
  }
}) : null as any;

// Set search path to include our schema
if (pool) {
  pool.on('connect', (client: any) => {
    client.query('SET search_path TO social_publisher, public');
  });

  // Error handling
  pool.on('error', (err: Error, client: any) => {
    console.error('Unexpected error on idle client', err);
  });
}

// Helper function to get a client from the pool
export const getClient = () => {
  if (!pool) throw new Error('Database connection not initialized');
  return pool.connect();
};

// Helper function for transactions
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  if (!pool) throw new Error('Database connection not initialized');
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
}

// Test the connection
export async function testConnection(): Promise<boolean> {
  if (!pool) {
    console.warn('No database pool available');
    return false;
  }
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('Database connected:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}