#!/usr/bin/env node
import 'dotenv/config';
import { DMCoordinator } from './dm-coordinator.mjs';
import { MultiAccountManager } from './multi-account-manager.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI argument parsing
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i+1] : def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

// Main CLI
async function main() {
  const command = process.argv[2];
  
  switch(command) {
    case 'setup':
      await setupAccounts();
      break;
      
    case 'campaign':
      await runCampaign();
      break;
      
    case 'status':
      await showStatus();
      break;
      
    case 'test':
      await testMessage();
      break;
      
    default:
      showHelp();
  }
}

async function setupAccounts() {
  console.log('🔧 Setting up beta accounts...\n');
  
  const manager = new MultiAccountManager();
  
  // Example account setup
  const accounts = [
    {
      username: arg('username', 'model_account_1'),
      password: arg('password', ''),
      teamMember: arg('team', 'Sarah'),
      modelName: arg('model', 'Beta Model'),
      niche: arg('niche', 'fitness'),
      preferredLocation: 'US',
      proxyType: 'residential'
    }
  ];
  
  if (!accounts[0].password) {
    console.error('❌ Password required for account setup');
    console.log('Usage: node cli-dm-beta.mjs setup --username <username> --password <password> --team <member> --model <name>');
    return;
  }
  
  for (const acc of accounts) {
    try {
      const added = manager.addAccount(acc);
      console.log(`✅ Added account: ${added.username}`);
      console.log(`   Team member: ${added.metadata.teamMember}`);
      console.log(`   Model: ${added.metadata.modelName}`);
      console.log(`   Niche: ${added.metadata.niche}`);
    } catch (e) {
      console.error(`❌ Failed to add account: ${e.message}`);
    }
  }
  
  console.log('\n📊 Account summary:', manager.getAccountStats());
}

async function runCampaign() {
  console.log('🚀 Starting DM campaign...\n');
  
  const coordinator = new DMCoordinator({
    teamMembers: ['Sarah', 'Emma', 'Mia', 'Sophia'],
    betaLink: process.env.BETA_LINK || 'https://ofm-beta.com/exclusive'
  });
  
  // Create campaign from CLI args
  const campaign = await coordinator.createCampaign({
    name: arg('name', 'Beta Outreach US'),
    targetsFile: arg('targets', '../out/dm_todo_us.csv'),
    messageCategory: arg('category', 'exclusive'),
    timezone: arg('tz', 'ET'),
    language: arg('lang', 'en'),
    maxDMs: Number(arg('max', '50')),
    accountNiche: arg('niche', null)
  });
  
  console.log(`📋 Campaign created: ${campaign.id}`);
  console.log(`📊 Targets loaded: ${campaign.targets.length}`);
  
  if (hasFlag('dry-run')) {
    console.log('\n🏃 DRY RUN MODE - No actual DMs will be sent');
    console.log('Campaign settings:', campaign.settings);
    return;
  }
  
  // Confirm before starting
  if (!hasFlag('yes')) {
    console.log('\nPress Enter to start campaign or Ctrl+C to cancel...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  }
  
  // Run campaign
  await coordinator.startCampaign(campaign.id);
}

async function showStatus() {
  console.log('📊 Beta DM System Status\n');
  
  const coordinator = new DMCoordinator();
  const stats = await coordinator.getStats();
  
  console.log('👥 Accounts:');
  console.log(`   Total: ${stats.accounts.total}`);
  console.log(`   Active: ${stats.accounts.active}`);
  console.log(`   In use: ${stats.accounts.inUse}`);
  console.log(`   Suspended: ${stats.accounts.suspended}`);
  console.log(`   DMs today: ${stats.accounts.totalDmsSentToday}`);
  
  console.log('\n🌐 Proxies:');
  console.log(`   Total: ${stats.proxies.total}`);
  console.log(`   Ready: ${stats.proxies.ready}`);
  console.log(`   Dead: ${stats.proxies.dead}`);
  console.log(`   In use: ${stats.proxies.inUse}`);
  console.log(`   Avg response: ${stats.proxies.avgResponseTime}ms`);
  
  console.log('\n📨 Campaigns:');
  console.log(`   Total: ${stats.campaigns.total}`);
  console.log(`   Active: ${stats.campaigns.active}`);
  console.log(`   Completed: ${stats.campaigns.completed}`);
  console.log(`   Total DMs sent: ${stats.campaigns.totalDMsSent}`);
  console.log(`   Total failed: ${stats.campaigns.totalDMsFailed}`);
  
  console.log('\n🎯 Deduplication:');
  console.log(`   Unique targets: ${stats.deduplication.uniqueTargets}`);
  
  // Show by team member if available
  if (stats.accounts.byTeamMember) {
    console.log('\n👩‍💼 By Team Member:');
    for (const [member, count] of Object.entries(stats.accounts.byTeamMember)) {
      console.log(`   ${member}: ${count} accounts`);
    }
  }
}

async function testMessage() {
  console.log('🧪 Testing message generation...\n');
  
  const { BetaMessageGenerator } = await import('./beta-message-templates.mjs');
  const generator = new BetaMessageGenerator();
  
  const testCases = [
    { username: 'testuser1', category: 'exclusive', timezone: 'ET' },
    { username: 'testuser2', category: 'earnings', timezone: 'PT' },
    { username: 'testuser3', category: 'peer', timezone: 'CT' },
    { username: 'testuser4', category: 'solution', timezone: 'MT' },
    { username: 'testuser5', category: 'short', timezone: 'ET' }
  ];
  
  for (const test of testCases) {
    const result = generator.generateMessage({
      ...test,
      teamMember: 'Sarah',
      modelName: 'Beta Test'
    });
    
    console.log(`📝 Template: ${result.templateId} (${result.category}/${result.tone})`);
    console.log(`⏰ Timezone: ${test.timezone}`);
    console.log(`💬 Message:\n${result.message}\n`);
  }
}

function showHelp() {
  console.log(`
🤖 Beta DM Automation System

Commands:
  setup     - Add model accounts to the system
  campaign  - Run a DM campaign
  status    - Show system status
  test      - Test message generation

Setup accounts:
  node cli-dm-beta.mjs setup --username <ig_username> --password <password> \\
    --team <team_member> --model <model_name> --niche <niche>

Run campaign:
  node cli-dm-beta.mjs campaign --targets <csv_file> --max <max_dms> \\
    --category <exclusive|earnings|peer|solution|short> \\
    --tz <ET|CT|MT|PT> --lang <en|fr|es>

Options:
  --dry-run   Preview campaign without sending
  --yes       Skip confirmation prompt
  --niche     Filter accounts by niche

Examples:
  # Add a new model account
  node cli-dm-beta.mjs setup --username sarah_model --password xxx \\
    --team Sarah --model "Sarah's Team" --niche fitness

  # Run US campaign
  node cli-dm-beta.mjs campaign --targets ../out/dm_todo_us.csv \\
    --max 100 --category exclusive --tz ET

  # Test run
  node cli-dm-beta.mjs campaign --dry-run --max 10
`);
}

// Run CLI
main().catch(console.error);