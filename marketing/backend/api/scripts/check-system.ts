#!/usr/bin/env ts-node

import { sequelize } from '../src/database';
import { createClient } from 'redis';
import { Client as TemporalClient, Connection } from '@temporalio/client';
import axios from 'axios';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { logger } from '../src/utils/logger';
import chalk from 'chalk';

interface CheckResult {
  service: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
  details?: any;
}

const checks: CheckResult[] = [];

async function checkPostgres(): Promise<void> {
  try {
    await sequelize.authenticate();
    
    // Check if migrations are up to date
    const [results] = await sequelize.query(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
    ) as any;
    
    const latestMigration = results?.[0]?.version || 'none';
    
    // Count tables
    const [tables] = await sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'"
    ) as any;
    
    checks.push({
      service: 'PostgreSQL',
      status: 'ok',
      message: 'Connected successfully',
      details: {
        database: sequelize.config.database,
        latestMigration,
        tableCount: tables[0].count,
      },
    });
  } catch (error) {
    checks.push({
      service: 'PostgreSQL',
      status: 'error',
      message: `Connection failed: ${error.message}`,
    });
  }
}

async function checkRedis(): Promise<void> {
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  try {
    await client.connect();
    await client.ping();
    
    // Check memory usage
    const info = await client.info('memory');
    const usedMemory = info.match(/used_memory_human:(.+)/)?.[1];
    
    checks.push({
      service: 'Redis',
      status: 'ok',
      message: 'Connected successfully',
      details: {
        memoryUsed: usedMemory,
      },
    });
    
    await client.disconnect();
  } catch (error) {
    checks.push({
      service: 'Redis',
      status: 'error',
      message: `Connection failed: ${error.message}`,
    });
  }
}

async function checkTemporal(): Promise<void> {
  try {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    });

    const client = new TemporalClient({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    });

    // Try to list workflows
    const workflows = client.workflow.list({ query: 'WorkflowType="ScrapeAndTrainWorkflow"' });
    let count = 0;
    
    for await (const workflow of workflows) {
      count++;
      if (count >= 5) break; // Just count first 5
    }

    checks.push({
      service: 'Temporal',
      status: 'ok',
      message: 'Connected successfully',
      details: {
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        recentWorkflows: count,
      },
    });

    await connection.close();
  } catch (error) {
    checks.push({
      service: 'Temporal',
      status: 'error',
      message: `Connection failed: ${error.message}`,
    });
  }
}

async function checkS3(): Promise<void> {
  const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
    },
    forcePathStyle: true,
  });

  try {
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    
    const buckets = response.Buckets?.map(b => b.Name) || [];
    const requiredBucket = process.env.S3_BUCKET || 'ofm-media';
    const bucketExists = buckets.includes(requiredBucket);

    checks.push({
      service: 'S3/MinIO',
      status: bucketExists ? 'ok' : 'warning',
      message: bucketExists 
        ? 'Connected successfully' 
        : `Connected but bucket '${requiredBucket}' not found`,
      details: {
        endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
        buckets,
        requiredBucket,
      },
    });
  } catch (error) {
    checks.push({
      service: 'S3/MinIO',
      status: 'error',
      message: `Connection failed: ${error.message}`,
    });
  }
}

async function checkEnvVariables(): Promise<void> {
  const required = [
    'POSTGRES_HOST',
    'REDIS_URL',
    'TEMPORAL_ADDRESS',
    'JWT_SECRET',
    'WEBHOOK_SIGNING_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length === 0) {
    checks.push({
      service: 'Environment',
      status: 'ok',
      message: 'All required variables present',
    });
  } else {
    checks.push({
      service: 'Environment',
      status: 'warning',
      message: `Missing ${missing.length} required variables`,
      details: { missing },
    });
  }

  // Check platform credentials
  const platforms = ['META', 'TIKTOK', 'TWITTER', 'REDDIT'];
  const platformCreds = platforms.filter(p => 
    process.env[`${p}_APP_ID`] || process.env[`${p}_CLIENT_ID`]
  );

  checks.push({
    service: 'Platform Credentials',
    status: platformCreds.length > 0 ? 'ok' : 'warning',
    message: `${platformCreds.length} platforms configured`,
    details: { configured: platformCreds },
  });
}

async function checkAPIHealth(): Promise<void> {
  try {
    const response = await axios.get(`http://localhost:${process.env.PORT || 3000}/health`, {
      timeout: 5000,
    });

    checks.push({
      service: 'API Server',
      status: response.status === 200 ? 'ok' : 'warning',
      message: response.status === 200 ? 'Running' : `Unexpected status: ${response.status}`,
      details: response.data,
    });
  } catch (error) {
    checks.push({
      service: 'API Server',
      status: 'warning',
      message: 'Not running or not accessible',
      details: { port: process.env.PORT || 3000 },
    });
  }
}

async function runChecks() {
  console.log(chalk.blue.bold('\n🔍 OFM Marketing System Check\n'));

  // Run all checks
  await checkEnvVariables();
  await checkPostgres();
  await checkRedis();
  await checkTemporal();
  await checkS3();
  await checkAPIHealth();

  // Display results
  const maxServiceLength = Math.max(...checks.map(c => c.service.length));
  
  checks.forEach(check => {
    const icon = check.status === 'ok' ? '✅' : check.status === 'error' ? '❌' : '⚠️';
    const color = check.status === 'ok' ? chalk.green : check.status === 'error' ? chalk.red : chalk.yellow;
    
    console.log(
      `${icon} ${check.service.padEnd(maxServiceLength + 2)} ${color(check.message)}`
    );
    
    if (check.details && process.env.VERBOSE) {
      console.log(chalk.gray(`   Details: ${JSON.stringify(check.details, null, 2).split('\n').join('\n   ')}`));
    }
  });

  // Summary
  const errors = checks.filter(c => c.status === 'error').length;
  const warnings = checks.filter(c => c.status === 'warning').length;
  
  console.log('\n' + chalk.bold('Summary:'));
  console.log(`  Total checks: ${checks.length}`);
  console.log(`  ${chalk.green('✅ Passed')}: ${checks.filter(c => c.status === 'ok').length}`);
  if (warnings > 0) console.log(`  ${chalk.yellow('⚠️  Warnings')}: ${warnings}`);
  if (errors > 0) console.log(`  ${chalk.red('❌ Failed')}: ${errors}`);

  if (errors === 0 && warnings === 0) {
    console.log(chalk.green.bold('\n✨ All systems operational!\n'));
  } else if (errors === 0) {
    console.log(chalk.yellow.bold('\n⚠️  System operational with warnings\n'));
  } else {
    console.log(chalk.red.bold('\n❌ System has errors that need attention\n'));
  }

  // Exit code based on errors
  process.exit(errors > 0 ? 1 : 0);
}

// Run checks
runChecks().catch(error => {
  console.error(chalk.red('System check failed:'), error);
  process.exit(1);
});