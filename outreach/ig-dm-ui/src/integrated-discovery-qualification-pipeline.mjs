import { InstagramSuggestionsScraper } from './instagram-suggestions-scraper.mjs';
import { SmartSeedsDatabase } from './smart-seeds-database.mjs';
import { OnlyFansProfileAnalyzer } from './of-profile-analyzer.mjs';
import { EnhancedDMOrchestrator } from './enhanced-dm-orchestrator.mjs';
import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Pipeline intégré: Discovery → Qualification → DM Ready
 */
export class IntegratedDiscoveryQualificationPipeline {
  constructor(options = {}) {
    this.scraper = new InstagramSuggestionsScraper(options.scraperOptions);
    this.seedsDB = new SmartSeedsDatabase(options.seedsOptions);
    this.analyzer = new OnlyFansProfileAnalyzer();
    this.database = options.database || new DMTrackingDatabase();
    
    this.config = {
      // Discovery settings
      crawlDepth: options.crawlDepth || 2,
      seedsPerRun: options.seedsPerRun || 5,
      
      // Qualification thresholds
      minOFScore: options.minOFScore || 6,
      minConfidence: options.minConfidence || 0.6,
      
      // Output settings
      outputDir: options.outputDir || path.join(__dirname, '../output'),
      
      // Automation settings
      autoSendToDM: options.autoSendToDM || false,
      dmOrchestrator: options.dmOrchestrator || null,
      
      ...options
    };
    
    this.stats = {
      discovered: 0,
      qualified: 0,
      highQuality: 0,
      sentToDM: 0
    };
  }

  /**
   * Initialize the pipeline
   */
  async initialize() {
    console.log('🚀 Initializing Integrated Discovery & Qualification Pipeline...\n');
    
    await this.seedsDB.initialize();
    await this.database.initialize();
    
    // Create output directories
    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.mkdir(path.join(this.config.outputDir, 'qualified'), { recursive: true });
    await fs.mkdir(path.join(this.config.outputDir, 'dm-ready'), { recursive: true });
    
    console.log('✅ Pipeline initialized\n');
  }

  /**
   * Run complete discovery and qualification cycle
   */
  async runFullCycle() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔄 Starting Full Discovery & Qualification Cycle`);
    console.log(`   ${new Date().toLocaleString()}`);
    console.log(`${'='.repeat(70)}\n`);
    
    try {
      // Phase 1: Discovery
      console.log('📡 PHASE 1: Discovery\n');
      const discoveredProfiles = await this.runDiscoveryPhase();
      
      // Phase 2: Deep Qualification
      console.log('\n🔍 PHASE 2: Deep Qualification\n');
      const qualifiedProfiles = await this.runQualificationPhase(discoveredProfiles);
      
      // Phase 3: Categorization
      console.log('\n📊 PHASE 3: Categorization\n');
      const categorizedProfiles = await this.categorizeProfiles(qualifiedProfiles);
      
      // Phase 4: Export Results
      console.log('\n📁 PHASE 4: Export Results\n');
      const exportedFiles = await this.exportResults(categorizedProfiles);
      
      // Phase 5: Auto-send to DM (if enabled)
      if (this.config.autoSendToDM && this.config.dmOrchestrator) {
        console.log('\n📤 PHASE 5: Auto-send to DM System\n');
        await this.sendToDMSystem(categorizedProfiles.dmReady);
      }
      
      // Summary
      this.printSummary();
      
      return {
        stats: this.stats,
        files: exportedFiles,
        categorized: categorizedProfiles
      };
      
    } catch (error) {
      console.error('❌ Pipeline error:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Discovery using smart seeds
   */
  async runDiscoveryPhase() {
    const seeds = await this.seedsDB.getActiveSeeds(this.config.seedsPerRun);
    console.log(`📌 Using ${seeds.length} premium seeds\n`);
    
    const allProfiles = [];
    
    for (const seed of seeds) {
      console.log(`🌱 Processing: @${seed.username}`);
      console.log(`   Category: ${seed.category}`);
      console.log(`   OF Correlation: ${seed.metadata?.of_correlation || 'Unknown'}`);
      
      try {
        // Crawl with basic analysis
        const profiles = await this.scraper.crawlSuggestionsGraph(
          [seed.username], 
          this.config.crawlDepth
        );
        
        console.log(`   ✓ Discovered ${profiles.length} profiles`);
        
        // Update seed stats
        await this.seedsDB.updateSeedPerformance(seed.username, {
          profilesFound: profiles.length,
          ofProfilesFound: 0, // Will update after qualification
          avgQualityScore: 0
        });
        
        allProfiles.push(...profiles.map(p => ({
          ...p,
          sourceSeed: seed.username,
          seedCategory: seed.category
        })));
        
      } catch (error) {
        console.error(`   ✗ Error: ${error.message}`);
      }
      
      // Pause between seeds
      await this.pause(10000, 20000);
    }
    
    this.stats.discovered = allProfiles.length;
    console.log(`\n📊 Total discovered: ${allProfiles.length} profiles`);
    
    return allProfiles;
  }

  /**
   * Phase 2: Deep qualification with OF analyzer
   */
  async runQualificationPhase(profiles) {
    console.log(`🔍 Analyzing ${profiles.length} profiles for OF indicators...\n`);
    
    const qualifiedProfiles = [];
    const batchSize = 10;
    
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(profiles.length/batchSize)}...`);
      
      for (const profile of batch) {
        try {
          // Get full profile data if needed
          const fullProfile = await this.enrichProfile(profile);
          
          // Analyze with OF detector
          const analysis = this.analyzer.analyzeProfile(fullProfile);
          
          // Combine with scraper score
          const combinedScore = this.calculateCombinedScore(
            profile.ofScore || 0,
            analysis.score
          );
          
          const qualified = {
            ...fullProfile,
            ...analysis,
            combinedScore,
            qualified: combinedScore >= this.config.minOFScore || analysis.confidence >= this.config.minConfidence
          };
          
          if (qualified.qualified) {
            qualifiedProfiles.push(qualified);
            this.stats.qualified++;
            
            // Save to database
            await this.saveQualifiedProfile(qualified);
            
            // Log high quality finds
            if (analysis.directLink || combinedScore >= 8) {
              console.log(`      ✨ HIGH QUALITY: @${qualified.username} (Score: ${combinedScore}/10)`);
              if (analysis.directLink) {
                console.log(`         → Direct OF: ${analysis.directLink}`);
              }
              this.stats.highQuality++;
            }
          }
          
        } catch (error) {
          console.error(`      Error analyzing @${profile.username}: ${error.message}`);
        }
      }
      
      // Pause between batches
      await this.pause(5000, 10000);
    }
    
    console.log(`\n✅ Qualified: ${qualifiedProfiles.length}/${profiles.length} profiles`);
    return qualifiedProfiles;
  }

  /**
   * Phase 3: Categorize profiles by quality and readiness
   */
  async categorizeProfiles(profiles) {
    const categories = {
      dmReady: [],      // Ready for immediate DM
      highPriority: [], // Very likely OF, prioritize
      medium: [],       // Good indicators, worth trying
      lowPriority: []   // Some signals, lower priority
    };
    
    for (const profile of profiles) {
      // DM Ready: Direct link or very high confidence
      if (profile.directLink || profile.confidence >= 0.9 || profile.combinedScore >= 9) {
        categories.dmReady.push(profile);
      }
      // High Priority: Strong signals
      else if (profile.confidence >= 0.7 || profile.combinedScore >= 7) {
        categories.highPriority.push(profile);
      }
      // Medium: Good potential
      else if (profile.confidence >= 0.5 || profile.combinedScore >= 5) {
        categories.medium.push(profile);
      }
      // Low Priority: Some signals
      else {
        categories.lowPriority.push(profile);
      }
    }
    
    console.log('📊 Categorization Results:');
    console.log(`   DM Ready: ${categories.dmReady.length}`);
    console.log(`   High Priority: ${categories.highPriority.length}`);
    console.log(`   Medium: ${categories.medium.length}`);
    console.log(`   Low Priority: ${categories.lowPriority.length}`);
    
    return categories;
  }

  /**
   * Phase 4: Export categorized results
   */
  async exportResults(categorizedProfiles) {
    const timestamp = new Date().toISOString().split('T')[0];
    const files = {};
    
    // Export each category
    for (const [category, profiles] of Object.entries(categorizedProfiles)) {
      if (profiles.length === 0) continue;
      
      const filename = `${category}_${timestamp}.csv`;
      const filepath = path.join(this.config.outputDir, 'qualified', filename);
      
      await this.exportToCSV(profiles, filepath);
      files[category] = filepath;
      
      console.log(`   ✓ Exported ${profiles.length} ${category} profiles`);
    }
    
    // Create master DM-ready file
    if (categorizedProfiles.dmReady.length > 0) {
      const dmReadyFile = path.join(
        this.config.outputDir, 
        'dm-ready',
        `dm_ready_qualified_${timestamp}.csv`
      );
      
      // Combine high priority profiles for DM
      const dmProfiles = [
        ...categorizedProfiles.dmReady,
        ...categorizedProfiles.highPriority.slice(0, 50) // Top 50 high priority
      ];
      
      await this.exportToDMFormat(dmProfiles, dmReadyFile);
      files.dmReady = dmReadyFile;
      
      console.log(`\n📋 DM-Ready file: ${path.basename(dmReadyFile)}`);
    }
    
    return files;
  }

  /**
   * Phase 5: Send to DM system
   */
  async sendToDMSystem(profiles) {
    if (!this.config.dmOrchestrator) {
      console.log('⚠️  DM Orchestrator not configured');
      return;
    }
    
    console.log(`📤 Sending ${profiles.length} profiles to DM system...`);
    
    try {
      const campaign = await this.config.dmOrchestrator.runCampaign(
        profiles.map(p => ({
          username: p.username,
          platform: 'instagram',
          metadata: {
            ofScore: p.combinedScore,
            hasDirectLink: !!p.directLink,
            confidence: p.confidence,
            sourceSeed: p.sourceSeed
          }
        })),
        {
          campaignName: 'auto_qualified_' + Date.now(),
          distributionStrategy: 'weighted'
        }
      );
      
      this.stats.sentToDM = profiles.length;
      console.log(`✅ Campaign started: ${campaign.id}`);
      
    } catch (error) {
      console.error('❌ Failed to start DM campaign:', error.message);
    }
  }

  /**
   * Helper: Enrich profile with additional data
   */
  async enrichProfile(profile) {
    // If we already have bio/followers from scraper
    if (profile.bio || profile.followers) {
      return profile;
    }
    
    // Otherwise, would fetch from Instagram
    // For now, return as-is
    return {
      ...profile,
      bio: profile.bio || '',
      followers: profile.followers || 0,
      externalLink: profile.externalLink || ''
    };
  }

  /**
   * Helper: Calculate combined score
   */
  calculateCombinedScore(scraperScore, analyzerScore) {
    // Weight: 40% scraper, 60% analyzer (since analyzer is more detailed)
    return Math.round((scraperScore * 0.4 + analyzerScore * 0.6));
  }

  /**
   * Helper: Save qualified profile to database
   */
  async saveQualifiedProfile(profile) {
    await this.seedsDB.saveDiscoveredProfile({
      username: profile.username,
      source_seed: profile.sourceSeed,
      discovery_path: profile.discoveryPath || [],
      quality_score: profile.combinedScore,
      has_of_probability: profile.confidence,
      bio: profile.bio || '',
      followers: this.parseFollowers(profile.followers),
      external_link: profile.externalLink || profile.directLink || profile.linkService || '',
      metadata: {
        signals: profile.signals,
        category: profile.seedCategory,
        hasDirectLink: !!profile.directLink,
        linkService: profile.linkService
      }
    });
  }

  /**
   * Export to CSV format
   */
  async exportToCSV(profiles, filepath) {
    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'username', title: 'username' },
        { id: 'combinedScore', title: 'score' },
        { id: 'confidence', title: 'confidence' },
        { id: 'directLink', title: 'direct_of_link' },
        { id: 'linkService', title: 'link_service' },
        { id: 'bio', title: 'bio' },
        { id: 'followers', title: 'followers' },
        { id: 'sourceSeed', title: 'source_seed' },
        { id: 'signals', title: 'signals' }
      ]
    });
    
    const records = profiles.map(p => ({
      username: p.username,
      combinedScore: p.combinedScore || p.score || 0,
      confidence: (p.confidence || 0).toFixed(2),
      directLink: p.directLink || '',
      linkService: p.linkService || '',
      bio: (p.bio || '').replace(/\n/g, ' ').substring(0, 200),
      followers: p.followers || '',
      sourceSeed: p.sourceSeed || '',
      signals: (p.signals || []).join(', ')
    }));
    
    await csvWriter.writeRecords(records);
  }

  /**
   * Export to DM-ready format
   */
  async exportToDMFormat(profiles, filepath) {
    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'username', title: 'username' },
        { id: 'platform', title: 'platform' },
        { id: 'followers', title: 'followers' },
        { id: 'message', title: 'message' },
        { id: 'metadata', title: 'metadata' }
      ]
    });
    
    const records = profiles.map(p => ({
      username: p.username,
      platform: 'instagram',
      followers: p.followers || '',
      message: this.generatePersonalizedIntro(p),
      metadata: JSON.stringify({
        score: p.combinedScore,
        confidence: p.confidence,
        hasOF: !!p.directLink,
        sourceSeed: p.sourceSeed
      })
    }));
    
    await csvWriter.writeRecords(records);
  }

  /**
   * Generate personalized intro message
   */
  generatePersonalizedIntro(profile) {
    if (profile.directLink) {
      return "hey girl! just discovered your page and wow 😍 love that you're killing it on OF! would love to chat about something that could really boost your income 💕";
    } else if (profile.confidence >= 0.8) {
      return "hey babe! your content is amazing 🔥 i work with creators like you and have some ideas that could really help grow your brand 💗 interested?";
    } else {
      return "hey girl! absolutely love your vibe ✨ quick question - are you monetizing your amazing content yet? would love to share some tips! 💕";
    }
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log(`\n${'='.repeat(70)}`);
    console.log('📈 PIPELINE SUMMARY');
    console.log(`${'='.repeat(70)}`);
    console.log(`   Total Discovered: ${this.stats.discovered}`);
    console.log(`   Qualified: ${this.stats.qualified} (${(this.stats.qualified/this.stats.discovered*100).toFixed(1)}%)`);
    console.log(`   High Quality: ${this.stats.highQuality}`);
    if (this.stats.sentToDM > 0) {
      console.log(`   Sent to DM: ${this.stats.sentToDM}`);
    }
    console.log(`${'='.repeat(70)}\n`);
  }

  /**
   * Utility functions
   */
  parseFollowers(text) {
    if (!text) return 0;
    const num = text.toString().replace(/[^\d.KMkmB]/g, '');
    if (num.includes('K') || num.includes('k')) return parseFloat(num) * 1000;
    if (num.includes('M') || num.includes('m')) return parseFloat(num) * 1000000;
    return parseInt(num) || 0;
  }

  async pause(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const pipeline = new IntegratedDiscoveryQualificationPipeline({
      crawlDepth: 2,
      seedsPerRun: 3,
      minOFScore: 6,
      autoSendToDM: false // Set to true to auto-send
    });
    
    try {
      await pipeline.initialize();
      const results = await pipeline.runFullCycle();
      
      console.log('\n✅ Pipeline completed successfully!');
      console.log('\nOutput files:');
      Object.entries(results.files).forEach(([type, path]) => {
        console.log(`   ${type}: ${path}`);
      });
      
    } catch (error) {
      console.error('\n❌ Pipeline failed:', error);
      process.exit(1);
    }
  }
  
  main();
}