#!/usr/bin/env node
/**
 * Health check script to validate environment and connectivity
 */
import { env } from '../lib/env';
import { db } from '../lib/db';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  duration?: number;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const result = await db.query('SELECT version(), now() as current_time');
    const duration = Date.now() - start;
    return {
      name: 'Database',
      status: 'ok',
      message: `Connected to PostgreSQL (${duration}ms)`,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      name: 'Database',
      status: 'error',
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      duration,
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await redis.ping();
    const duration = Date.now() - start;
    return {
      name: 'Redis',
      status: 'ok',
      message: `Connected to Redis (${duration}ms)`,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      name: 'Redis',
      status: 'error',
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      duration,
    };
  }
}

async function checkEnvironment(): Promise<CheckResult> {
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'INSTAGRAM_CLIENT_ID',
    'INSTAGRAM_CLIENT_SECRET',
    'TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET',
    'X_API_KEY',
    'X_API_SECRET',
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length === 0) {
    return {
      name: 'Environment',
      status: 'ok',
      message: 'All required environment variables are set',
    };
  } else {
    return {
      name: 'Environment',
      status: 'error',
      message: `Missing variables: ${missing.join(', ')}`,
    };
  }
}

async function checkOptionalServices(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  
  // Check AWS S3 access (if configured)
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.S3_BUCKET) {
    checks.push({
      name: 'AWS S3',
      status: 'ok',
      message: 'AWS credentials configured (not tested)',
    });
  } else {
    checks.push({
      name: 'AWS S3',
      status: 'warning',
      message: 'AWS credentials not configured (optional)',
    });
  }
  
  // Check LLM providers
  const llmProviders = [];
  if (env.OPENAI_API_KEY) llmProviders.push('OpenAI');
  if (env.ANTHROPIC_API_KEY) llmProviders.push('Anthropic');
  
  if (llmProviders.length > 0) {
    checks.push({
      name: 'LLM Providers',
      status: 'ok',
      message: `Configured: ${llmProviders.join(', ')}`,
    });
  } else {
    checks.push({
      name: 'LLM Providers',
      status: 'warning',
      message: 'No LLM providers configured (optional)',
    });
  }
  
  // Check OpenTelemetry
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    checks.push({
      name: 'OpenTelemetry',
      status: 'ok',
      message: `Exporter configured: ${env.OTEL_EXPORTER_OTLP_ENDPOINT}`,
    });
  } else {
    checks.push({
      name: 'OpenTelemetry',
      status: 'warning',
      message: 'OTLP endpoint not configured (optional)',
    });
  }
  
  return checks;
}

function printResult(result: CheckResult): void {
  const statusIcon = {
    ok: '✅',
    warning: '⚠️',
    error: '❌',
  }[result.status];
  
  const duration = result.duration ? ` (${result.duration}ms)` : '';
  console.log(`${statusIcon} ${result.name}${duration}: ${result.message}`);
}

async function main(): Promise<void> {
  console.log('🔍 OFM Social API Health Check\n');
  
  // Show environment info
  console.log(`📦 Environment: ${env.NODE_ENV}`);
  console.log(`🚀 Node.js: ${process.version}`);
  console.log(`📍 Working Directory: ${process.cwd()}\n`);
  
  // Run checks
  const checks = await Promise.all([
    checkEnvironment(),
    checkDatabase(),
    checkRedis(),
    ...await checkOptionalServices(),
  ]);
  
  // Print results
  checks.forEach(printResult);
  
  // Summary
  const errorCount = checks.filter(c => c.status === 'error').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  
  console.log('\n📊 Summary:');
  if (errorCount === 0) {
    console.log('✅ All critical systems are healthy');
    if (warningCount > 0) {
      console.log(`⚠️  ${warningCount} optional service(s) not configured`);
    }
    process.exit(0);
  } else {
    console.log(`❌ ${errorCount} critical error(s) found`);
    if (warningCount > 0) {
      console.log(`⚠️  ${warningCount} warning(s)`);
    }
    process.exit(1);
  }
}

// Handle cleanup
process.on('SIGINT', async () => {
  logger.info('Doctor script interrupted, cleaning up...');
  try {
    await db.end();
    redis.disconnect();
  } catch (error) {
    logger.error({ err: error }, 'Error during cleanup');
  }
  process.exit(0);
});

// Run the health check
main().catch((error) => {
  logger.error({ err: error }, 'Doctor script failed');
  process.exit(1);
});