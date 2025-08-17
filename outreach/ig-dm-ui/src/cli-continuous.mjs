#!/usr/bin/env node
import 'dotenv/config';
import { ContinuousPipelineOrchestrator } from './continuous-pipeline-orchestrator.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

/**
 * Main continuous pipeline CLI
 */
async function main() {
  console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.blue}🚀 Instagram Continuous Pipeline Orchestrator${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(70)}${colors.reset}\n`);
  
  // Parse environment or use defaults
  const config = {
    // Intervals from env
    discoveryInterval: parseInt(process.env.DISCOVERY_INTERVAL) || 4 * 60 * 60 * 1000,
    replyCheckInterval: parseInt(process.env.REPLY_CHECK_INTERVAL) || 30 * 60 * 1000,
    handoffInterval: parseInt(process.env.HANDOFF_INTERVAL) || 2 * 60 * 60 * 1000,
    
    // Pipeline settings
    seedsPerCycle: parseInt(process.env.SEEDS_PER_CYCLE) || 5,
    crawlDepth: parseInt(process.env.CRAWL_DEPTH) || 2,
    minOFScore: parseInt(process.env.MIN_OF_SCORE) || 6,
    
    // DM settings
    maxDMsPerCycle: parseInt(process.env.MAX_DMS_PER_CYCLE) || 100,
    dmTempo: process.env.DM_TEMPO || 'fast',
    
    // Cloud settings
    healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT) || 3000,
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    
    // Webhook for handoff notifications
    handoffWebhook: process.env.HANDOFF_WEBHOOK_URL
  };
  
  console.log('📋 Configuration:');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Discovery: Every ${config.discoveryInterval / 1000 / 60} minutes`);
  console.log(`   Reply Check: Every ${config.replyCheckInterval / 1000 / 60} minutes`);
  console.log(`   Handoff: Every ${config.handoffInterval / 1000 / 60} minutes`);
  console.log(`   Seeds/Cycle: ${config.seedsPerCycle}`);
  console.log(`   Max DMs/Cycle: ${config.maxDMsPerCycle}`);
  console.log(`   Health Check Port: ${config.healthCheckPort}\n`);
  
  // Create orchestrator
  const orchestrator = new ContinuousPipelineOrchestrator(config);
  
  try {
    // Initialize all components
    await orchestrator.initialize();
    
    // Start continuous operation
    await orchestrator.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(`\n${colors.yellow}⚠️  Received SIGINT, shutting down gracefully...${colors.reset}`);
      await orchestrator.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log(`\n${colors.yellow}⚠️  Received SIGTERM, shutting down gracefully...${colors.reset}`);
      await orchestrator.stop();
      process.exit(0);
    });
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error(`${colors.red}❌ Uncaught Exception:${colors.reset}`, error);
      console.log('Pipeline will continue running...');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error(`${colors.red}❌ Unhandled Rejection at:${colors.reset}`, promise, 'reason:', reason);
      console.log('Pipeline will continue running...');
    });
    
  } catch (error) {
    console.error(`${colors.red}❌ Failed to start pipeline:${colors.reset}`, error);
    process.exit(1);
  }
}

// Show startup banner
function showBanner() {
  console.log(`
${colors.magenta}
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🤖 INSTAGRAM AUTOMATION PIPELINE - CONTINUOUS MODE 🤖      ║
║                                                               ║
║   Discovery → Qualification → DM → Monitor → Handoff         ║
║                                                               ║
║   NO RE-DM | NO RE-QUALIFICATION | 24/7 OPERATION           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
${colors.reset}
`);
}

// Run
showBanner();
main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});