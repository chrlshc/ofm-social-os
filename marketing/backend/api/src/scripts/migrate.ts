#!/usr/bin/env node
/**
 * Database migration runner
 */
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '../lib/db';
import { logger } from '../lib/logger';

interface Migration {
  filename: string;
  content: string;
  version: number;
}

async function createMigrationsTable(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      version INTEGER NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const result = await db.query('SELECT filename FROM migrations ORDER BY version');
  return result.rows.map(row => row.filename);
}

async function loadMigrations(): Promise<Migration[]> {
  const migrationsDir = join(__dirname, '../../../database/migrations');
  
  try {
    const files = await readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
    
    const migrations: Migration[] = [];
    
    for (const filename of sqlFiles) {
      const content = await readFile(join(migrationsDir, filename), 'utf-8');
      const version = parseInt(filename.split('_')[0], 10);
      
      if (isNaN(version)) {
        logger.warn(`Skipping migration ${filename}: invalid version number`);
        continue;
      }
      
      migrations.push({ filename, content, version });
    }
    
    return migrations.sort((a, b) => a.version - b.version);
  } catch (error) {
    logger.error({ err: error, migrationsDir }, 'Failed to load migrations');
    throw error;
  }
}

async function runMigration(migration: Migration): Promise<void> {
  const start = Date.now();
  logger.info(`Running migration: ${migration.filename}`);
  
  try {
    // Run the migration in a transaction
    await db.query('BEGIN');
    await db.query(migration.content);
    
    // Record that we ran this migration
    await db.query(
      'INSERT INTO migrations (filename, version) VALUES ($1, $2)',
      [migration.filename, migration.version]
    );
    
    await db.query('COMMIT');
    
    const duration = Date.now() - start;
    logger.info(`✅ Migration ${migration.filename} completed (${duration}ms)`);
  } catch (error) {
    await db.query('ROLLBACK');
    logger.error({ err: error }, `❌ Migration ${migration.filename} failed`);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting database migrations...');
    
    // Ensure migrations table exists
    await createMigrationsTable();
    
    // Load all migrations
    const migrations = await loadMigrations();
    logger.info(`Found ${migrations.length} migration(s)`);
    
    // Get already applied migrations
    const applied = await getAppliedMigrations();
    logger.info(`${applied.length} migration(s) already applied`);
    
    // Find pending migrations
    const pending = migrations.filter(m => !applied.includes(m.filename));
    
    if (pending.length === 0) {
      logger.info('✅ Database is up to date');
      return;
    }
    
    logger.info(`Running ${pending.length} pending migration(s):`);
    pending.forEach(m => logger.info(`  - ${m.filename}`));
    
    // Run pending migrations
    for (const migration of pending) {
      await runMigration(migration);
    }
    
    logger.info('✅ All migrations completed successfully');
  } catch (error) {
    logger.error({ err: error }, '❌ Migration failed');
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Handle cleanup
process.on('SIGINT', async () => {
  logger.info('Migration interrupted, cleaning up...');
  await db.end();
  process.exit(0);
});

main();