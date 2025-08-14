#!/usr/bin/env node
import 'dotenv/config';
import { FastTempoCoordinator } from './fast-tempo-coordinator.mjs';
import { CloserHandoffManager } from './closer-handoff-manager.mjs';
import { MultiAccountManager } from './multi-account-manager.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI helpers
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
    case 'blast':
      await runFastBlast();
      break;
      
    case 'handoff':
      await exportHandoffs();
      break;
      
    case 'stats':
      await showStats();
      break;
      
    case 'responses':
      await checkResponses();
      break;
      
    default:
      showHelp();
  }
}

async function runFastBlast() {
  console.log('🚀 FAST TEMPO DM BLAST\n');
  
  const coordinator = new FastTempoCoordinator({
    betaLink: process.env.BETA_LINK || 'https://ofm-beta.com/join'
  });
  
  const handoffManager = new CloserHandoffManager();
  
  const campaign = await coordinator.createCampaign({
    name: arg('name', 'Fast Blast Campaign'),
    targetsFile: arg('targets', '../out/dm_todo_us.csv'),
    maxDMs: Number(arg('max', '100')),
    preEngagement: !hasFlag('no-likes'),
    accountNiche: arg('niche', null)
  });
  
  console.log(`📋 Campaign: ${campaign.name}`);
  console.log(`🎯 Targets: ${campaign.targets.length}`);
  console.log(`⚡ Mode: FAST TEMPO (1-3min between DMs)`);
  console.log(`💕 Pre-engagement: ${campaign.settings.preEngagement ? 'Yes (30s-1min after likes)' : 'No'}`);
  console.log(`🤝 Handoff: Auto-export for closers after 30min\n`);
  
  if (hasFlag('dry-run')) {
    console.log('🏃 DRY RUN - Preview only');
    return;
  }
  
  // Confirm
  if (!hasFlag('yes')) {
    console.log('Press Enter to start FAST BLAST or Ctrl+C to cancel...');
    await new Promise(resolve => process.stdin.once('data', resolve));
  }
  
  // Run campaign
  console.log('\n⚡ Starting FAST TEMPO blast...\n');
  
  // Hook pour enregistrer les handoffs
  coordinator.on = coordinator.on || {};
  coordinator.on.dmSent = (result) => {
    if (result.success && result.handoffReady) {
      handoffManager.registerHandoff(result);
    }
  };
  
  await coordinator.startCampaign(campaign.id);
  
  // Export automatique pour les closeurs
  const handoffPath = path.join(__dirname, '../output/handoffs_ready.csv');
  await handoffManager.exportForCloserInterface(handoffPath);
}

async function exportHandoffs() {
  console.log('📤 Exporting conversations for closers...\n');
  
  const manager = new CloserHandoffManager();
  const outputPath = arg('output', path.join(__dirname, '../output/closer_queue.csv'));
  const minAge = Number(arg('min-age', '30')); // Minutes
  
  const ready = manager.getReadyForClosers({ 
    minAge: minAge * 60 * 1000,
    onlyWithResponse: hasFlag('only-responded')
  });
  
  console.log(`Found ${ready.length} conversations ready for closers:`);
  console.log(`  • High priority: ${ready.filter(c => c.priority === 'high').length}`);
  console.log(`  • With responses: ${ready.filter(c => c.metrics.responseReceived).length}`);
  console.log(`  • Pending: ${ready.filter(c => !c.metrics.responseReceived).length}`);
  
  await manager.exportForCloserInterface(outputPath);
}

async function showStats() {
  console.log('📊 Fast Tempo DM Stats\n');
  
  // Coordinator stats
  const coordinator = new FastTempoCoordinator();
  const coordStats = await coordinator.getStats();
  
  console.log('🚀 DM Automation:');
  console.log(`   Accounts active: ${coordStats.accounts.active}`);
  console.log(`   DMs sent today: ${coordStats.accounts.totalDmsSentToday}`);
  console.log(`   Campaigns run: ${coordStats.campaigns.total}`);
  
  // Handoff stats
  const handoffManager = new CloserHandoffManager();
  const handoffStats = handoffManager.getStats();
  
  console.log('\n🤝 Handoff Queue:');
  console.log(`   Total conversations: ${handoffStats.total}`);
  console.log(`   Pending response: ${handoffStats.pending}`);
  console.log(`   Responded: ${handoffStats.responded} (avg ${handoffStats.avgResponseTime}min)`);
  console.log(`   Assigned to closers: ${handoffStats.assigned}`);
  
  console.log('\n😊 Response Sentiment:');
  console.log(`   Positive: ${handoffStats.bySentiment.positive}`);
  console.log(`   Curious: ${handoffStats.bySentiment.curious}`);
  console.log(`   Neutral: ${handoffStats.bySentiment.neutral}`);
  console.log(`   Negative: ${handoffStats.bySentiment.negative}`);
  
  console.log('\n🎯 Priority Distribution:');
  console.log(`   High: ${handoffStats.byPriority.high}`);
  console.log(`   Medium: ${handoffStats.byPriority.medium}`);
  console.log(`   Low: ${handoffStats.byPriority.low}`);
}

async function checkResponses() {
  console.log('📨 Checking for responses...\n');
  
  // This would integrate with IG API or scraping
  // For now, simulate some responses
  const manager = new CloserHandoffManager();
  
  const simulatedResponses = [
    { username: 'test1', message: 'hey thanks! yeah I do OF too 😊' },
    { username: 'test2', message: 'what is it?' },
    { username: 'test3', message: 'not interested' }
  ];
  
  for (const resp of simulatedResponses) {
    manager.markResponse(resp.username, resp);
    console.log(`✅ Response from @${resp.username}: "${resp.message}"`);
  }
  
  console.log('\nUpdated handoff queue');
}

function showHelp() {
  console.log(`
⚡ FAST TEMPO DM SYSTEM

Système optimisé pour blast rapide avec handoff aux closeurs.
- Tempo: 1-3 min entre DMs (vs 5-10 min)
- Likes: 30s-1min après (vs 1-3 min)  
- Auto-export pour closeurs après 30 min

Commands:
  blast      - Lancer un blast rapide (intro seulement)
  handoff    - Exporter les conversations pour closeurs
  stats      - Voir les statistiques
  responses  - Check/simuler des réponses

BLAST RAPIDE:
  node cli-fast-tempo.mjs blast --targets <csv> --max <number>
  
  Options:
    --no-likes    Skip pre-engagement pour aller plus vite
    --dry-run     Preview sans envoyer
    --yes         Skip confirmation

EXPORT CLOSEURS:
  node cli-fast-tempo.mjs handoff --output <file.csv>
  
  Options:
    --only-responded   Seulement celles avec réponse
    --min-age <min>    Age minimum en minutes (default: 30)

Examples:
  # Blast rapide 100 DMs
  node cli-fast-tempo.mjs blast --targets ../out/targets.csv --max 100 --yes

  # Export pour closeurs (avec réponses seulement)
  node cli-fast-tempo.mjs handoff --only-responded

  # Stats temps réel
  node cli-fast-tempo.mjs stats
`);
}

// Run
main().catch(console.error);