import { InstagramSuggestionsScraper } from './instagram-suggestions-scraper.mjs';
import { SmartSeedsDatabase } from './smart-seeds-database.mjs';
import { InstagramAccountManager } from './instagram-account-manager.mjs';
import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Automated discovery pipeline using Instagram suggestions
 * No daily hashtag configuration needed!
 */
export class AutomatedDiscoveryPipeline {
  constructor(options = {}) {
    this.scraper = new InstagramSuggestionsScraper(options.scraperOptions);
    this.seedsDB = new SmartSeedsDatabase(options.seedsOptions);
    this.accountManager = options.accountManager || new InstagramAccountManager();
    this.database = options.database || new DMTrackingDatabase();
    
    this.config = {
      crawlDepth: options.crawlDepth || 2,
      seedsPerRun: options.seedsPerRun || 5,
      minOFScore: options.minOFScore || 6,
      outputDir: options.outputDir || path.join(__dirname, '../output'),
      runInterval: options.runInterval || 24 * 60 * 60 * 1000, // 24 hours
      ...options
    };
    
    this.isRunning = false;
  }

  /**
   * Initialize the pipeline
   */
  async initialize() {
    console.log('🚀 Initializing Automated Discovery Pipeline...\n');
    
    // Initialize components
    await this.seedsDB.initialize();
    await this.database.initialize();
    
    // Get initial stats
    const analytics = await this.seedsDB.getAnalytics();
    console.log('📊 Current Status:');
    console.log(`   Seeds: ${analytics.seeds.total} (${analytics.seeds.active} active)`);
    console.log(`   Discovered profiles: ${analytics.profiles.total}`);
    console.log(`   High quality profiles: ${analytics.profiles.high_quality}`);
    console.log('');
  }

  /**
   * Run one discovery cycle
   */
  async runDiscoveryCycle() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 Starting Discovery Cycle - ${new Date().toLocaleString()}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      // 1. Get active seeds
      const seeds = await this.seedsDB.getActiveSeeds(this.config.seedsPerRun);
      console.log(`📌 Selected ${seeds.length} seeds for this cycle\n`);
      
      if (seeds.length === 0) {
        console.log('⚠️  No seeds available for crawling');
        return;
      }
      
      const allDiscoveredProfiles = [];
      
      // 2. Process each seed
      for (const seed of seeds) {
        console.log(`\n🌱 Processing seed: @${seed.username} (${seed.category})`);
        console.log(`   Quality score: ${seed.quality_score}/10`);
        console.log(`   Previous leads: ${seed.leads_generated}`);
        
        try {
          // Crawl suggestions
          const profiles = await this.scraper.smartCrawl(
            [seed.username],
            {
              depth: this.config.crawlDepth,
              analyzeProfiles: true
            }
          );
          
          // Filter high quality profiles
          const qualityProfiles = profiles.filter(p => 
            p.ofScore >= this.config.minOFScore
          );
          
          console.log(`   ✅ Found ${qualityProfiles.length} high-quality profiles`);
          
          // Save to database
          for (const profile of qualityProfiles) {
            await this.seedsDB.saveDiscoveredProfile({
              ...profile,
              source_seed: seed.username,
              quality_score: profile.ofScore,
              has_of_probability: profile.ofScore / 10,
              followers: this.parseFollowers(profile.followers)
            });
          }
          
          // Update seed performance
          await this.seedsDB.updateSeedPerformance(seed.username, {
            profilesFound: profiles.length,
            ofProfilesFound: qualityProfiles.length,
            avgQualityScore: this.calculateAvgScore(qualityProfiles)
          });
          
          allDiscoveredProfiles.push(...qualityProfiles);
          
        } catch (error) {
          console.error(`   ❌ Error processing seed ${seed.username}:`, error.message);
        }
        
        // Pause between seeds
        await this.pause(30000, 60000); // 30-60 seconds
      }
      
      // 3. Export results
      if (allDiscoveredProfiles.length > 0) {
        await this.exportResults(allDiscoveredProfiles);
      }
      
      // 4. Optimize seeds
      await this.seedsDB.optimizeSeeds();
      
      // 5. Discover new seeds
      const newSeeds = await this.seedsDB.discoverNewSeeds();
      if (newSeeds.length > 0) {
        console.log(`\n🌟 Auto-discovered ${newSeeds.length} new seeds from high-performers!`);
      }
      
      // 6. Summary
      console.log(`\n${'='.repeat(60)}`);
      console.log('📈 Cycle Summary:');
      console.log(`   Total profiles discovered: ${allDiscoveredProfiles.length}`);
      console.log(`   Average OF score: ${this.calculateAvgScore(allDiscoveredProfiles).toFixed(1)}/10`);
      console.log(`   New seeds discovered: ${newSeeds.length}`);
      console.log(`${'='.repeat(60)}\n`);
      
    } catch (error) {
      console.error('❌ Discovery cycle error:', error);
    }
  }

  /**
   * Export discovered profiles to CSV
   */
  async exportResults(profiles) {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `discovered_profiles_${timestamp}.csv`;
    const filepath = path.join(this.config.outputDir, filename);
    
    // Sort by OF score
    profiles.sort((a, b) => (b.ofScore || 0) - (a.ofScore || 0));
    
    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'username', title: 'username' },
        { id: 'platform', title: 'platform' },
        { id: 'ofScore', title: 'of_score' },
        { id: 'bio', title: 'bio' },
        { id: 'followers', title: 'followers' },
        { id: 'externalLink', title: 'external_link' },
        { id: 'discoveryPath', title: 'discovery_path' },
        { id: 'sourceSeed', title: 'source_seed' }
      ]
    });
    
    const records = profiles.map(p => ({
      username: p.username,
      platform: 'instagram',
      ofScore: p.ofScore || 0,
      bio: (p.bio || '').replace(/\n/g, ' '),
      followers: p.followers || '',
      externalLink: p.externalLink || '',
      discoveryPath: (p.discoveryPath || []).join(' → '),
      sourceSeed: p.source_seed || p.discoveryPath?.[0] || ''
    }));
    
    await csvWriter.writeRecords(records);
    console.log(`\n📁 Exported ${records.length} profiles to: ${filename}`);
    
    return filepath;
  }

  /**
   * Start automated pipeline
   */
  async start() {
    if (this.isRunning) {
      console.log('Pipeline is already running');
      return;
    }
    
    this.isRunning = true;
    await this.initialize();
    
    console.log('🤖 Starting automated discovery pipeline...');
    console.log(`   Run interval: ${this.config.runInterval / 1000 / 60 / 60} hours`);
    console.log(`   Crawl depth: ${this.config.crawlDepth} levels`);
    console.log(`   Min OF score: ${this.config.minOFScore}/10`);
    console.log('\nPress Ctrl+C to stop\n');
    
    // Run immediately
    await this.runDiscoveryCycle();
    
    // Schedule regular runs
    this.interval = setInterval(() => {
      this.runDiscoveryCycle();
    }, this.config.runInterval);
  }

  /**
   * Stop the pipeline
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('\n🛑 Pipeline stopped');
  }

  /**
   * Run once (for testing/manual runs)
   */
  async runOnce() {
    await this.initialize();
    await this.runDiscoveryCycle();
    
    // Get final stats
    const analytics = await this.seedsDB.getAnalytics();
    console.log('\n📊 Final Statistics:');
    console.log(`   Total profiles discovered: ${analytics.profiles.total}`);
    console.log(`   High quality profiles: ${analytics.profiles.high_quality}`);
    console.log(`   Average OF probability: ${(analytics.profiles.avg_probability * 100).toFixed(1)}%`);
  }

  /**
   * Utility functions
   */
  parseFollowers(followersText) {
    if (!followersText) return 0;
    const match = followersText.match(/[\d,]+/);
    if (!match) return 0;
    return parseInt(match[0].replace(/,/g, ''));
  }

  calculateAvgScore(profiles) {
    if (profiles.length === 0) return 0;
    const sum = profiles.reduce((acc, p) => acc + (p.ofScore || 0), 0);
    return sum / profiles.length;
  }

  async pause(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const pipeline = new AutomatedDiscoveryPipeline({
    crawlDepth: 2,
    seedsPerRun: 3,
    minOFScore: 6
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n⏹️  Shutting down gracefully...');
    pipeline.stop();
    process.exit(0);
  });
  
  // Run based on command
  const command = process.argv[2];
  if (command === 'once') {
    pipeline.runOnce().catch(console.error);
  } else {
    pipeline.start().catch(console.error);
  }
}