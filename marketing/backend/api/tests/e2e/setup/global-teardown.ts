// Global teardown for Playwright E2E tests
// Cleans up test data and stops services

import { FullConfig } from '@playwright/test';
import { db } from '../../src/lib/db';
import { redis } from '../../src/lib/redis';
import fs from 'fs/promises';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test teardown...');

  try {
    // 1. Clean up test data from database
    await cleanupTestDatabase();

    // 2. Clean up Redis test data
    await cleanupTestRedis();

    // 3. Clean up test files
    await cleanupTestFiles();

    // 4. Close database connections
    await closeConnections();

    console.log('✅ E2E test teardown completed');

  } catch (error) {
    console.error('❌ E2E test teardown failed:', error);
    // Don't throw - we want tests to report their actual results
  }
}

async function cleanupTestDatabase() {
  console.log('🗄️ Cleaning up test database...');

  try {
    // Clean up in reverse dependency order
    const cleanupQueries = [
      // Metrics and events
      `DELETE FROM llm_usage WHERE operation_type LIKE 'test%' OR creator_id LIKE 'test-%'`,
      `DELETE FROM llm_usage_reservations WHERE creator_id LIKE 'test-%'`,
      `DELETE FROM llm_budget_alerts WHERE creator_id LIKE 'test-%'`,
      `DELETE FROM webhook_events WHERE payload->>'test' = 'true'`,
      `DELETE FROM workflow_events WHERE workflow_id LIKE 'pub:test-%'`,
      
      // Posts and content
      `DELETE FROM metrics WHERE post_id IN (
        SELECT id FROM posts WHERE creator_id LIKE 'test-%'
      )`,
      `DELETE FROM posts WHERE creator_id LIKE 'test-%'`,
      `DELETE FROM variants WHERE asset_id IN (
        SELECT id FROM assets WHERE creator_id LIKE 'test-%'
      )`,
      `DELETE FROM assets WHERE creator_id LIKE 'test-%'`,
      
      // Budgets and tokens
      `DELETE FROM llm_budgets WHERE creator_id LIKE 'test-%'`,
      `DELETE FROM rate_budget_reservations WHERE account_id IN (
        SELECT id FROM accounts WHERE creator_id LIKE 'test-%'
      )`,
      `DELETE FROM tokens WHERE id IN (
        SELECT token_id FROM accounts WHERE creator_id LIKE 'test-%'
      )`,
      
      // Accounts and creators
      `DELETE FROM accounts WHERE creator_id LIKE 'test-%'`,
      `DELETE FROM dm_triggers WHERE creator_id LIKE 'test-%'`,
      `DELETE FROM dm_history WHERE creator_id IN (
        SELECT id FROM creators WHERE id LIKE 'test-%'
      )`,
      `DELETE FROM creators WHERE id LIKE 'test-%' OR display_name LIKE 'E2E Test%'`
    ];

    for (const query of cleanupQueries) {
      try {
        const result = await db.query(query);
        if (result.rowCount && result.rowCount > 0) {
          console.log(`  Cleaned up ${result.rowCount} rows from: ${query.split(' ')[2]}`);
        }
      } catch (error) {
        console.warn(`  Warning: Failed to execute cleanup query: ${query.substring(0, 50)}...`);
      }
    }

    // Reset sequences if needed
    const sequenceResets = [
      'ALTER SEQUENCE llm_usage_id_seq RESTART WITH 1',
      'ALTER SEQUENCE metrics_id_seq RESTART WITH 1',
      'ALTER SEQUENCE webhook_events_id_seq RESTART WITH 1'
    ];

    for (const reset of sequenceResets) {
      try {
        await db.query(reset);
      } catch (error) {
        // Ignore sequence reset errors - they're not critical
      }
    }

    console.log('✅ Database cleanup completed');

  } catch (error) {
    console.warn('⚠️ Database cleanup had issues:', error);
  }
}

async function cleanupTestRedis() {
  console.log('🔴 Cleaning up test Redis data...');

  try {
    // Get all test keys
    const testKeys = await redis.keys('test:*');
    const idemKeys = await redis.keys('idem:*test*');
    const rateLimitKeys = await redis.keys('rate_budget:*test*');
    const webhookKeys = await redis.keys('webhook:*test*');

    const allTestKeys = [...testKeys, ...idemKeys, ...rateLimitKeys, ...webhookKeys];

    if (allTestKeys.length > 0) {
      await redis.del(...allTestKeys);
      console.log(`  Deleted ${allTestKeys.length} test keys from Redis`);
    }

    // Clean up any OAuth states that might be lingering
    const oauthKeys = await redis.keys('oauth_state:*');
    if (oauthKeys.length > 0) {
      // Only delete old ones (> 1 hour old)
      for (const key of oauthKeys) {
        const ttl = await redis.ttl(key);
        if (ttl > 0 && ttl < 3600 - 300) { // If expiring in next 5 minutes
          await redis.del(key);
        }
      }
    }

    console.log('✅ Redis cleanup completed');

  } catch (error) {
    console.warn('⚠️ Redis cleanup had issues:', error);
  }
}

async function cleanupTestFiles() {
  console.log('📁 Cleaning up test files...');

  try {
    const filesToCleanup = [
      './tests/e2e/fixtures/auth-state.json',
      './tests/e2e/results',
      './tests/e2e/reports'
    ];

    for (const fileOrDir of filesToCleanup) {
      try {
        const fullPath = path.resolve(fileOrDir);
        
        // Check if exists first
        try {
          await fs.access(fullPath);
        } catch {
          continue; // File doesn't exist, skip
        }

        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          await fs.rm(fullPath, { recursive: true, force: true });
          console.log(`  Removed directory: ${fileOrDir}`);
        } else {
          await fs.unlink(fullPath);
          console.log(`  Removed file: ${fileOrDir}`);
        }
      } catch (error) {
        console.warn(`  Warning: Could not remove ${fileOrDir}:`, error.message);
      }
    }

    console.log('✅ File cleanup completed');

  } catch (error) {
    console.warn('⚠️ File cleanup had issues:', error);
  }
}

async function closeConnections() {
  console.log('🔌 Closing connections...');

  try {
    // Close database pool
    if (db && typeof db.end === 'function') {
      await db.end();
      console.log('  Database connection closed');
    }

    // Close Redis connection
    if (redis && typeof redis.quit === 'function') {
      await redis.quit();
      console.log('  Redis connection closed');
    }

    console.log('✅ Connections closed');

  } catch (error) {
    console.warn('⚠️ Error closing connections:', error);
  }
}

// Generate cleanup report
async function generateCleanupReport() {
  const reportPath = './tests/e2e/cleanup-report.json';
  
  const report = {
    timestamp: new Date().toISOString(),
    cleanup: {
      database: 'completed',
      redis: 'completed',
      files: 'completed',
      connections: 'closed'
    },
    stats: {
      testDataRemoved: true,
      tempFilesRemoved: true,
      connectionsClean: true
    }
  };

  try {
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 Cleanup report saved to: ${reportPath}`);
  } catch (error) {
    console.warn('⚠️ Could not save cleanup report:', error);
  }
}

export default globalTeardown;