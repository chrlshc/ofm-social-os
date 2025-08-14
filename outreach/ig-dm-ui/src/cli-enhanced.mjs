#!/usr/bin/env node
import 'dotenv/config';
import { EnhancedDMOrchestrator } from './enhanced-dm-orchestrator.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI argument parsing
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

// Main CLI
async function main() {
  const command = process.argv[2];
  
  const commands = {
    'campaign': runCampaign,
    'check-replies': checkReplies,
    'stats': showStats,
    'accounts': showAccounts,
    'test-message': testMessage,
    'handoff': generateHandoff,
    'db-init': initDatabase,
    'db-stats': showDatabaseStats
  };
  
  if (commands[command]) {
    try {
      await commands[command]();
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  } else {
    showHelp();
  }
}

async function runCampaign() {
  console.log('🚀 Enhanced DM Campaign\n');
  
  const orchestrator = new EnhancedDMOrchestrator({
    tempo: arg('tempo', 'fast'),
    useAI: !hasFlag('no-ai'),
    preEngagement: !hasFlag('no-likes'),
    useDatabase: !hasFlag('no-db'),
    accountConfigPath: arg('accounts', path.join(__dirname, '../config/account_proxy_config.json'))
  });
  
  await orchestrator.initialize();
  
  // Load targets
  const targetsFile = arg('targets', path.join(__dirname, '../out/dm_todo_us.csv'));
  const targets = await loadTargets(targetsFile);
  const maxTargets = Number(arg('max', '50'));
  const selectedTargets = targets.slice(0, maxTargets);
  
  console.log(`\n📋 Campaign Configuration:`);
  console.log(`   Targets: ${selectedTargets.length}/${targets.length}`);
  console.log(`   Tempo: ${arg('tempo', 'fast')}`);
  console.log(`   AI Messages: ${!hasFlag('no-ai') ? 'Yes' : 'No'}`);
  console.log(`   Pre-engagement: ${!hasFlag('no-likes') ? 'Yes' : 'No'}`);
  console.log(`   Database: ${!hasFlag('no-db') ? 'Yes' : 'No'}`);
  
  if (hasFlag('dry-run')) {
    console.log('\n🏃 DRY RUN MODE - Preview only\n');
    
    // Preview distribution
    const accountManager = orchestrator.accountManager;
    const distribution = accountManager.distributeTargets(selectedTargets);
    
    console.log('📤 Would distribute as follows:');
    for (const [accountId, accountTargets] of distribution) {
      console.log(`   @${accountId}: ${accountTargets.length} targets`);
    }
    
    // Preview messages
    console.log('\n📝 Sample messages:');
    for (let i = 0; i < Math.min(3, selectedTargets.length); i++) {
      const message = await orchestrator.generateMessage(selectedTargets[i]);
      console.log(`   To @${selectedTargets[i].username}: "${message}"`);
    }
    
    return;
  }
  
  // Confirm before running
  if (!hasFlag('yes')) {
    console.log('\nPress Enter to start campaign or Ctrl+C to cancel...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  }
  
  // Run campaign
  const campaign = await orchestrator.runCampaign(selectedTargets, {
    distributionStrategy: arg('distribution', 'weighted')
  });
  
  // Check replies after a delay
  if (!hasFlag('no-reply-check')) {
    const replyDelay = Number(arg('reply-delay', '10')) * 60 * 1000; // minutes to ms
    console.log(`\n⏰ Will check replies in ${arg('reply-delay', '10')} minutes...`);
    
    setTimeout(async () => {
      await orchestrator.checkReplies();
    }, replyDelay);
  }
}

async function checkReplies() {
  console.log('📬 Checking Replies\n');
  
  const orchestrator = new EnhancedDMOrchestrator();
  await orchestrator.initialize();
  
  await orchestrator.checkReplies();
  
  // Generate handoff report if requested
  if (hasFlag('handoff')) {
    const outputPath = arg('output', path.join(__dirname, '../output/handoff_manual.csv'));
    await orchestrator.replyMonitor.generateHandoffReport({ outputPath });
  }
}

async function showStats() {
  console.log('📊 System Statistics\n');
  
  const orchestrator = new EnhancedDMOrchestrator();
  await orchestrator.initialize();
  
  const stats = await orchestrator.getStatistics();
  
  console.log('👥 Accounts:');
  console.log(`   Total: ${stats.accounts.total}`);
  console.log(`   Available: ${stats.accounts.available}`);
  console.log(`   Blocked: ${stats.accounts.blocked}`);
  console.log(`   DMs sent today: ${stats.accounts.dmsSentToday}`);
  console.log(`   Capacity remaining: ${stats.accounts.totalCapacityRemaining}`);
  
  console.log('\n💬 Messages:');
  console.log(`   Templates used: ${stats.messages.aiGenerated}`);
  if (stats.messages.bestPerforming.length > 0) {
    console.log('   Best performing:');
    stats.messages.bestPerforming.forEach((msg, i) => {
      console.log(`     ${i + 1}. "${msg.message.substring(0, 50)}..." (${msg.replyRate.toFixed(1)}% reply rate)`);
    });
  }
  
  console.log('\n📨 Replies:');
  console.log(`   Total conversations: ${stats.replies.total}`);
  console.log(`   Replied: ${stats.replies.replied}`);
  console.log(`   Avg reply time: ${stats.replies.avgReplyTime} minutes`);
  console.log('   Sentiment breakdown:');
  console.log(`     Positive: ${stats.replies.bySentiment.positive}`);
  console.log(`     Curious: ${stats.replies.bySentiment.curious}`);
  console.log(`     Neutral: ${stats.replies.bySentiment.neutral}`);
  console.log(`     Negative: ${stats.replies.bySentiment.negative}`);
  
  console.log('\n🎯 Campaigns:');
  console.log(`   Total: ${stats.campaigns.total}`);
  console.log(`   Active: ${stats.campaigns.active}`);
  console.log(`   Completed: ${stats.campaigns.completed}`);
}

async function showAccounts() {
  console.log('👥 Account Status\n');
  
  const orchestrator = new EnhancedDMOrchestrator();
  await orchestrator.initialize();
  
  const stats = orchestrator.accountManager.getAccountStats();
  
  console.log('Summary:');
  console.log(`   Total accounts: ${stats.total}`);
  console.log(`   Available: ${stats.available}`);
  console.log(`   Blocked: ${stats.blocked}`);
  console.log(`   Challenged: ${stats.challenged}`);
  console.log(`   Total DMs today: ${stats.dmsSentToday}`);
  console.log(`   Total capacity remaining: ${stats.totalCapacityRemaining}\n`);
  
  console.log('Account Details:');
  console.log('Username         | Status | Today | Hour | Remaining | Performance | Last Used');
  console.log('-----------------|--------|-------|------|-----------|-------------|----------');
  
  stats.accountDetails.forEach(account => {
    console.log(
      `${account.username.padEnd(16)} | ` +
      `${account.status.padEnd(6)} | ` +
      `${account.dmsSentToday.toString().padEnd(5)} | ` +
      `${account.dmsSentThisHour.toString().padEnd(4)} | ` +
      `${account.remaining.toString().padEnd(9)} | ` +
      `${account.performance.toString().padEnd(11)} | ` +
      `${account.lastUsed}`
    );
  });
}

async function testMessage() {
  console.log('🧪 Test Message Generation\n');
  
  const orchestrator = new EnhancedDMOrchestrator({
    useAI: !hasFlag('no-ai')
  });
  
  const target = {
    username: arg('username', 'testuser'),
    name: arg('name', null),
    location: arg('location', 'Miami'),
    niche: arg('niche', 'fitness'),
    followers: Number(arg('followers', '10000')),
    recentPost: arg('recent', 'gym selfie')
  };
  
  console.log('Target profile:', target);
  console.log('\nGenerating messages...\n');
  
  // Generate multiple variations
  for (let i = 0; i < 5; i++) {
    const message = await orchestrator.generateMessage(target);
    console.log(`${i + 1}. "${message}"`);
  }
}

async function generateHandoff() {
  console.log('📋 Generating Handoff Report\n');
  
  const orchestrator = new EnhancedDMOrchestrator();
  await orchestrator.initialize();
  
  const outputPath = arg('output', path.join(__dirname, '../output/handoff_manual.csv'));
  const onlyReplied = hasFlag('only-replied');
  const minAge = Number(arg('min-age', '30')) * 60 * 1000; // minutes to ms
  
  await orchestrator.replyMonitor.generateHandoffReport({
    outputPath,
    onlyReplied,
    minAge
  });
}

async function initDatabase() {
  console.log('🗄️ Initializing Database\n');
  
  const { DMTrackingDatabase } = await import('./database/dm-tracking-db.mjs');
  const db = new DMTrackingDatabase();
  
  await db.initialize();
  console.log('✅ Database tables created successfully');
  
  await db.close();
}

async function showDatabaseStats() {
  console.log('📊 Database Statistics\n');
  
  const { DMTrackingDatabase } = await import('./database/dm-tracking-db.mjs');
  const db = new DMTrackingDatabase();
  
  const accountStats = await db.getAccountStats();
  const bestTemplates = await db.getBestTemplates(5);
  
  console.log('Account Performance:');
  accountStats.forEach(account => {
    console.log(`\n@${account.account_username}:`);
    console.log(`   DMs sent: ${account.total_dms_sent}`);
    console.log(`   Replies: ${account.total_replies} (${account.reply_rate}%)`);
    console.log(`   Positive: ${account.positive_replies}`);
    console.log(`   Conversions: ${account.total_conversions} (${account.conversion_rate}%)`);
    console.log(`   Performance: ${account.performance_score}/100`);
  });
  
  if (bestTemplates.length > 0) {
    console.log('\n\nBest Performing Templates:');
    bestTemplates.forEach((template, i) => {
      console.log(`\n${i + 1}. "${template.template_text.substring(0, 60)}..."`);
      console.log(`   Used: ${template.times_used} times`);
      console.log(`   Reply rate: ${template.reply_rate}%`);
      console.log(`   Positive sentiment: ${template.positive_sentiment_rate}%`);
      console.log(`   Avg reply time: ${template.avg_reply_time_minutes} minutes`);
    });
  }
  
  await db.close();
}

async function loadTargets(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  
  const targets = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const target = {};
    headers.forEach((header, idx) => {
      target[header] = values[idx];
    });
    targets.push(target);
  }
  
  return targets;
}

function showHelp() {
  console.log(`
🚀 Enhanced DM Automation System

This system supports multi-account DM sending with AI-powered messages,
intelligent reply monitoring, and automated handoff to closers.

Commands:
  campaign        Run a DM campaign
  check-replies   Check for new replies
  stats           Show system statistics
  accounts        Show account status
  test-message    Test message generation
  handoff         Generate handoff report
  db-init         Initialize database
  db-stats        Show database statistics

Campaign Options:
  --targets <file>        CSV file with targets (default: ../out/dm_todo_us.csv)
  --max <number>          Maximum targets to process (default: 50)
  --tempo <fast|normal|conservative>  Sending tempo (default: fast)
  --no-ai                 Disable AI message generation
  --no-likes              Skip pre-engagement (liking posts)
  --no-db                 Don't use database tracking
  --distribution <weighted|even>  Target distribution strategy
  --accounts <file>       Account config file
  --dry-run               Preview without sending
  --yes                   Skip confirmation
  --no-reply-check        Don't check replies after campaign
  --reply-delay <min>     Minutes before checking replies (default: 10)

Examples:
  # Run fast campaign with 100 targets
  node cli-enhanced.mjs campaign --max 100 --tempo fast

  # Dry run to preview
  node cli-enhanced.mjs campaign --dry-run --max 20

  # Check replies and generate handoff
  node cli-enhanced.mjs check-replies --handoff

  # Test AI message generation
  node cli-enhanced.mjs test-message --username sarah --niche fitness --location "Los Angeles"

  # Show account performance from database
  node cli-enhanced.mjs db-stats
`);
}

// Run CLI
main().catch(console.error);