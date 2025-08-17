#!/usr/bin/env node
import 'dotenv/config';
import { IntegratedDiscoveryQualificationPipeline } from './integrated-discovery-qualification-pipeline.mjs';
import { EnhancedDMOrchestrator } from './enhanced-dm-orchestrator.mjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

// Parse command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

function arg(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  return index > -1 && args[index + 1] ? args[index + 1] : defaultValue;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

// Main CLI handler
async function main() {
  const commands = {
    'discover': runDiscovery,
    'qualify': runQualification,
    'full': runFullPipeline,
    'auto': runAutoPipeline,
    'stats': showStats,
    'export': exportHighQuality,
    'test': testQualification
  };
  
  if (!command || !commands[command]) {
    showHelp();
    return;
  }
  
  try {
    await commands[command]();
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run discovery only
async function runDiscovery() {
  console.log(`${colors.blue}🔍 Running Discovery Only${colors.reset}\n`);
  
  const pipeline = new IntegratedDiscoveryQualificationPipeline({
    crawlDepth: parseInt(arg('depth', '2')),
    seedsPerRun: parseInt(arg('seeds', '3')),
    autoSendToDM: false
  });
  
  await pipeline.initialize();
  
  // Run discovery phase only
  const profiles = await pipeline.runDiscoveryPhase();
  
  // Simple export
  const outputFile = arg('output', `output/discovered_${Date.now()}.json`);
  await fs.promises.writeFile(outputFile, JSON.stringify(profiles, null, 2));
  
  console.log(`\n✅ Discovered ${profiles.length} profiles`);
  console.log(`📁 Saved to: ${outputFile}`);
}

// Run qualification on existing profiles
async function runQualification() {
  console.log(`${colors.blue}🔍 Running Qualification${colors.reset}\n`);
  
  const inputFile = arg('input');
  if (!inputFile) {
    console.error('Please provide --input file with discovered profiles');
    return;
  }
  
  const pipeline = new IntegratedDiscoveryQualificationPipeline({
    minOFScore: parseInt(arg('minScore', '6')),
    minConfidence: parseFloat(arg('minConfidence', '0.6'))
  });
  
  await pipeline.initialize();
  
  // Load profiles
  const profiles = JSON.parse(await fs.promises.readFile(inputFile, 'utf8'));
  console.log(`Loaded ${profiles.length} profiles from ${inputFile}\n`);
  
  // Run qualification
  const qualified = await pipeline.runQualificationPhase(profiles);
  const categorized = await pipeline.categorizeProfiles(qualified);
  await pipeline.exportResults(categorized);
  
  pipeline.printSummary();
}

// Run full pipeline
async function runFullPipeline() {
  console.log(`${colors.blue}🚀 Running Full Discovery & Qualification Pipeline${colors.reset}\n`);
  
  const pipeline = new IntegratedDiscoveryQualificationPipeline({
    crawlDepth: parseInt(arg('depth', '2')),
    seedsPerRun: parseInt(arg('seeds', '5')),
    minOFScore: parseInt(arg('minScore', '6')),
    minConfidence: parseFloat(arg('minConfidence', '0.6')),
    autoSendToDM: hasFlag('autoSend')
  });
  
  await pipeline.initialize();
  const results = await pipeline.runFullCycle();
  
  console.log(`\n${colors.green}✅ Pipeline completed!${colors.reset}`);
  console.log('\nOutput files:');
  Object.entries(results.files).forEach(([type, filepath]) => {
    console.log(`   ${type}: ${path.basename(filepath)}`);
  });
}

// Run automated pipeline with DM integration
async function runAutoPipeline() {
  console.log(`${colors.blue}🤖 Running Automated Pipeline with DM Integration${colors.reset}\n`);
  
  if (!hasFlag('confirm')) {
    console.log(`${colors.yellow}⚠️  This will automatically send DMs to qualified profiles!${colors.reset}`);
    console.log('Add --confirm to proceed\n');
    return;
  }
  
  // Initialize DM orchestrator
  const dmOrchestrator = new EnhancedDMOrchestrator({
    accountConfigPath: path.join(__dirname, '../config/account_proxy_config.json'),
    tempo: 'fast',
    useAI: true,
    preEngagement: true,
    useDatabase: true
  });
  
  await dmOrchestrator.initialize();
  
  // Initialize pipeline with DM integration
  const pipeline = new IntegratedDiscoveryQualificationPipeline({
    crawlDepth: parseInt(arg('depth', '2')),
    seedsPerRun: parseInt(arg('seeds', '5')),
    minOFScore: parseInt(arg('minScore', '7')),
    minConfidence: parseFloat(arg('minConfidence', '0.7')),
    autoSendToDM: true,
    dmOrchestrator: dmOrchestrator
  });
  
  await pipeline.initialize();
  const results = await pipeline.runFullCycle();
  
  console.log(`\n${colors.green}✅ Automated pipeline completed!${colors.reset}`);
  console.log(`   Sent ${results.stats.sentToDM} profiles to DM system`);
}

// Show statistics
async function showStats() {
  console.log(`${colors.blue}📊 Discovery & Qualification Stats${colors.reset}\n`);
  
  const { SmartSeedsDatabase } = await import('./smart-seeds-database.mjs');
  const seedsDB = new SmartSeedsDatabase();
  await seedsDB.initialize();
  
  const analytics = await seedsDB.getAnalytics();
  
  console.log('🌱 Seeds:');
  console.log(`   Total: ${analytics.seeds.total}`);
  console.log(`   Active: ${analytics.seeds.active}`);
  console.log(`   Avg conversion: ${(analytics.seeds.avg_conversion * 100).toFixed(1)}%`);
  
  console.log('\n👥 Discovered Profiles:');
  console.log(`   Total: ${analytics.profiles.total}`);
  console.log(`   High quality: ${analytics.profiles.high_quality}`);
  console.log(`   Avg OF probability: ${(analytics.profiles.avg_probability * 100).toFixed(1)}%`);
  
  if (analytics.recentPerformance.length > 0) {
    console.log('\n📈 Recent Performance:');
    analytics.recentPerformance.forEach(day => {
      const ofRate = day.total_found > 0 ? (day.of_found / day.total_found * 100).toFixed(1) : 0;
      console.log(`   ${day.crawl_date}: ${day.of_found}/${day.total_found} (${ofRate}% OF)`);
    });
  }
}

// Export high quality profiles
async function exportHighQuality() {
  console.log(`${colors.blue}📁 Exporting High Quality Profiles${colors.reset}\n`);
  
  const { SmartSeedsDatabase } = await import('./smart-seeds-database.mjs');
  const seedsDB = new SmartSeedsDatabase();
  await seedsDB.initialize();
  
  const limit = parseInt(arg('limit', '100'));
  const profiles = await seedsDB.getHighQualityProfiles(limit);
  
  if (profiles.length === 0) {
    console.log('No high quality profiles found');
    return;
  }
  
  const outputFile = arg('output', `output/high_quality_of_${Date.now()}.csv`);
  
  // Create CSV
  const { createObjectCsvWriter } = await import('csv-writer');
  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: [
      { id: 'username', title: 'username' },
      { id: 'has_of_probability', title: 'of_probability' },
      { id: 'quality_score', title: 'score' },
      { id: 'external_link', title: 'link' },
      { id: 'bio', title: 'bio' },
      { id: 'followers', title: 'followers' }
    ]
  });
  
  await csvWriter.writeRecords(profiles.map(p => ({
    ...p,
    bio: (p.bio || '').substring(0, 100)
  })));
  
  console.log(`✅ Exported ${profiles.length} high quality profiles`);
  console.log(`📁 File: ${outputFile}`);
}

// Test qualification on sample profiles
async function testQualification() {
  console.log(`${colors.blue}🧪 Testing Qualification System${colors.reset}\n`);
  
  const testProfiles = [
    {
      username: 'test_direct_of',
      bio: 'Model 📸 Check my OF below ⬇️',
      externalLink: 'onlyfans.com/testmodel',
      followers: '25K'
    },
    {
      username: 'test_linktree',
      bio: 'Content creator 🔥 All my links below',
      externalLink: 'linktr.ee/testcreator',
      followers: '50K'
    },
    {
      username: 'test_keywords',
      bio: 'Exclusive content 💦 DM for collabs',
      followers: '10K'
    },
    {
      username: 'test_normal',
      bio: 'Travel blogger ✈️ NYC',
      followers: '100K'
    }
  ];
  
  const { OnlyFansProfileAnalyzer } = await import('./of-profile-analyzer.mjs');
  const analyzer = new OnlyFansProfileAnalyzer();
  
  console.log('Testing profiles:\n');
  
  for (const profile of testProfiles) {
    const analysis = analyzer.analyzeProfile(profile);
    
    console.log(`@${profile.username}:`);
    console.log(`   Score: ${analysis.score}/10`);
    console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
    console.log(`   Has OF: ${analysis.hasOF ? '✅' : '❌'}`);
    if (analysis.signals.length > 0) {
      console.log(`   Signals: ${analysis.signals.join(', ')}`);
    }
    console.log('');
  }
}

// Show help
function showHelp() {
  console.log(`
${colors.blue}🤖 Discovery & Qualification Pipeline${colors.reset}

This system discovers Instagram profiles using smart seeds and qualifies them
for OnlyFans presence using advanced detection algorithms.

Commands:
  discover        Run discovery phase only
  qualify         Run qualification on existing profiles  
  full            Run complete discovery + qualification
  auto            Run with automatic DM sending
  stats           Show system statistics
  export          Export high quality profiles
  test            Test qualification system

Discovery Options:
  --depth <n>     Graph traversal depth (default: 2)
  --seeds <n>     Number of seeds per run (default: 5)
  --output <file> Output file for results

Qualification Options:
  --input <file>      Input file with profiles
  --minScore <n>      Minimum OF score (default: 6)
  --minConfidence <n> Minimum confidence (default: 0.6)

Auto Pipeline Options:
  --confirm       Required flag to enable auto-sending
  --autoSend      Enable automatic DM sending

Examples:
  # Run full pipeline
  npm run pipeline:full

  # Discover with depth 3
  npm run pipeline:discover -- --depth 3 --seeds 10

  # Qualify existing profiles
  npm run pipeline:qualify -- --input output/discovered.json

  # Run automated with DM
  npm run pipeline:auto -- --confirm

  # Export top 200 profiles
  npm run pipeline:export -- --limit 200

  # Test the qualification system
  npm run pipeline:test
`);
}

// Run CLI
main().catch(console.error);