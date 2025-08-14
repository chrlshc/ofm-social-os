#!/usr/bin/env node
import 'dotenv/config';
import { NaturalDMCoordinator } from './dm-coordinator-natural.mjs';
import { MultiAccountManager } from './multi-account-manager.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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
      
    case 'add-warm':
      await addWarmAccount();
      break;
      
    case 'campaign':
      await runNaturalCampaign();
      break;
      
    case 'status':
      await showStatus();
      break;
      
    case 'test':
      await testNaturalFlow();
      break;
      
    default:
      showHelp();
  }
}

async function setupAccounts() {
  console.log('🌸 Setting up natural DM accounts...\n');
  
  const manager = new MultiAccountManager();
  
  const username = arg('username');
  const password = arg('password');
  const cookies = arg('cookies');
  const teamMember = arg('team', 'Model');
  const modelName = arg('model', username);
  const niche = arg('niche', 'lifestyle');
  const accountAge = arg('age', 'new');
  
  if (!username) {
    console.error('❌ Username required');
    return;
  }
  
  if (!password && !cookies) {
    console.error('❌ Either password or cookies required');
    return;
  }
  
  const account = {
    username,
    password,
    cookies: cookies ? JSON.parse(fs.readFileSync(cookies, 'utf8')) : null,
    teamMember,
    modelName,
    niche,
    accountAge,
    preferredLocation: 'US',
    proxyType: 'residential'
  };
  
  try {
    const added = manager.addAccount(account);
    console.log(`✅ Added account: ${added.username}`);
    console.log(`   Type: ${added.isWarmAccount ? 'Warm (with cookies)' : 'New'}`);
    console.log(`   Model: ${added.metadata.modelName}`);
    console.log(`   Niche: ${added.metadata.niche}`);
    console.log(`   Daily limit: ${manager.getDailyLimit(added)} DMs`);
  } catch (e) {
    console.error(`❌ Failed to add account: ${e.message}`);
  }
}

async function addWarmAccount() {
  console.log('🍪 Adding warm account with cookies...\n');
  
  const cookieFile = arg('cookies');
  const username = arg('username');
  
  if (!cookieFile || !username) {
    console.log('Usage: node cli-dm-natural.mjs add-warm --username <username> --cookies <cookie_file.json>');
    return;
  }
  
  const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
  const manager = new MultiAccountManager();
  
  const account = {
    username,
    cookies,
    modelName: arg('model', username),
    niche: arg('niche', 'lifestyle'),
    accountAge: arg('age', 'mature'), // mature, established, or new
    teamMember: arg('team', 'Model')
  };
  
  try {
    const added = manager.addAccount(account);
    console.log(`✅ Warm account added: ${added.username}`);
    console.log(`   Daily limit: ${manager.getDailyLimit(added)} DMs`);
    console.log(`   Account age: ${added.metadata.accountAge}`);
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
  }
}

async function runNaturalCampaign() {
  console.log('🌸 Starting Natural DM Campaign...\n');
  
  const coordinator = new NaturalDMCoordinator({
    betaLink: process.env.BETA_LINK || 'https://ofm-beta.com/join'
  });
  
  const campaign = await coordinator.createCampaign({
    name: arg('name', 'Natural Beta Outreach'),
    targetsFile: arg('targets', '../out/dm_todo_us.csv'),
    approachStyle: 'natural',
    timezone: arg('tz', 'ET'),
    language: arg('lang', 'en'),
    maxDMs: Number(arg('max', '30')),
    preEngagement: !hasFlag('no-likes'), // Default true
    accountNiche: arg('niche', null)
  });
  
  console.log(`📋 Campaign created: ${campaign.id}`);
  console.log(`📊 Targets loaded: ${campaign.targets.length}`);
  console.log(`💕 Pre-engagement: ${campaign.settings.preEngagement ? 'Enabled (2 likes)' : 'Disabled'}`);
  
  if (hasFlag('dry-run')) {
    console.log('\n🏃 DRY RUN MODE - Preview only');
    
    // Show sample messages
    const { NaturalConversationFlow } = await import('./natural-message-templates.mjs');
    const flow = new NaturalConversationFlow();
    const sample = flow.startConversation('exampleuser');
    console.log('\nSample first message:');
    console.log(`"${sample.message}"`);
    
    return;
  }
  
  // Confirm before starting
  if (!hasFlag('yes')) {
    console.log('\nPress Enter to start campaign or Ctrl+C to cancel...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  }
  
  await coordinator.startCampaign(campaign.id);
}

async function showStatus() {
  console.log('📊 Natural DM System Status\n');
  
  const coordinator = new NaturalDMCoordinator();
  const stats = await coordinator.getStats();
  
  console.log('👥 Accounts:');
  console.log(`   Total: ${stats.accounts.total}`);
  console.log(`   Active: ${stats.accounts.active}`);
  console.log(`   Warm accounts: ${Object.values(stats.accounts.byTeamMember || {}).filter(a => a.isWarmAccount).length}`);
  console.log(`   DMs today: ${stats.accounts.totalDmsSentToday}`);
  
  console.log('\n💬 Conversations:');
  console.log(`   Active: ${stats.conversations.active}`);
  if (stats.conversations.stages) {
    console.log('   By stage:');
    for (const [stage, count] of Object.entries(stats.conversations.stages)) {
      console.log(`     ${stage}: ${count}`);
    }
  }
  
  console.log('\n📨 Campaigns:');
  console.log(`   Total: ${stats.campaigns.total}`);
  console.log(`   Completed: ${stats.campaigns.completed}`);
  console.log(`   Total DMs: ${stats.campaigns.totalDMsSent}`);
  console.log(`   Total likes: ${stats.campaigns.totalLikes}`);
  console.log(`   Conversations started: ${stats.campaigns.totalConversations}`);
}

async function testNaturalFlow() {
  console.log('🧪 Testing natural conversation flow...\n');
  
  const { NaturalConversationFlow } = await import('./natural-message-templates.mjs');
  const flow = new NaturalConversationFlow();
  
  // Test initial message
  console.log('=== INITIAL CONTACT ===');
  const intro = flow.startConversation('testuser');
  console.log(`Stage: ${intro.stage}`);
  console.log(`Pre-engagement: ${intro.preEngagement ? 'Yes (like 2 posts first)' : 'No'}`);
  console.log(`Message: "${intro.message}"\n`);
  
  // Test positive response
  console.log('=== POSITIVE RESPONSE ===');
  console.log('User: "hey thanks! yeah I do OF too 😊"');
  const followup = flow.getNextMessage('testuser', 'hey thanks! yeah I do OF too 😊');
  console.log(`Stage: ${followup.stage}`);
  console.log(`Our reply: "${followup.message}"\n`);
  
  // Test interest
  console.log('=== SHOWING INTEREST ===');
  console.log('User: "oh really? tell me more"');
  const betaIntro = flow.getNextMessage('testuser', 'oh really? tell me more');
  console.log(`Stage: ${betaIntro.stage}`);
  console.log(`Our reply: "${betaIntro.message}"\n`);
  
  // Test question about cost
  console.log('=== QUESTION ABOUT COST ===');
  console.log('User: "sounds cool but how much does it cost?"');
  const answer = flow.getNextMessage('testuser', 'sounds cool but how much does it cost?');
  console.log(`Our reply: "${answer.message}"\n`);
  
  // Show all intro variations
  console.log('=== ALL INTRO VARIATIONS ===');
  const { NATURAL_TEMPLATES } = await import('./natural-message-templates.mjs');
  NATURAL_TEMPLATES.FIRST_CONTACT.en.forEach(template => {
    console.log(`- "${template.text}" (${template.tone})`);
  });
}

function showHelp() {
  console.log(`
🌸 Natural DM Automation System

This system uses a conversational approach with pre-engagement (liking posts)
and natural, authentic messaging that builds relationships.

Commands:
  setup        - Add a new model account
  add-warm     - Add an existing account with cookies
  campaign     - Run a natural DM campaign
  status       - Show system status
  test         - Test conversation flow

Setup new account:
  node cli-dm-natural.mjs setup --username <ig_username> --password <password> \\
    --team <name> --model <model_name> --niche <niche>

Add warm account (with cookies):
  node cli-dm-natural.mjs add-warm --username <ig_username> \\
    --cookies <cookie_file.json> --age mature

Run natural campaign:
  node cli-dm-natural.mjs campaign --targets <csv_file> --max <max_dms> \\
    --tz <ET|CT|MT|PT> --lang <en|fr|es>

Options:
  --no-likes    Skip pre-engagement (no liking posts)
  --dry-run     Preview without sending
  --yes         Skip confirmation

Cookie format (JSON):
  [
    {"name": "sessionid", "value": "xxx", "domain": ".instagram.com"},
    {"name": "csrftoken", "value": "xxx", "domain": ".instagram.com"}
  ]

Examples:
  # Add warm account
  node cli-dm-natural.mjs add-warm --username sarah_model \\
    --cookies cookies/sarah.json --age mature --model "Sarah's VIP"

  # Run natural campaign with pre-engagement
  node cli-dm-natural.mjs campaign --targets ../out/dm_todo_us.csv --max 30

  # Test conversation flow
  node cli-dm-natural.mjs test
`);
}

// Run CLI
main().catch(console.error);