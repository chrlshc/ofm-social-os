import { IntegratedDiscoveryQualificationPipeline } from './integrated-discovery-qualification-pipeline.mjs';
import { EnhancedDMOrchestrator } from './enhanced-dm-orchestrator.mjs';
import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';
import { InstagramAccountManager } from './instagram-account-manager.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Orchestrateur continu 24/7 pour pipeline complet
 * Discovery → Qualification → DM → Closing
 * SANS re-DM ou re-qualification!
 */
export class ContinuousPipelineOrchestrator {
  constructor(options = {}) {
    this.database = new DMTrackingDatabase();
    this.processedProfiles = new Set(); // Cache mémoire des profils traités
    
    this.config = {
      // Intervals
      discoveryInterval: options.discoveryInterval || 4 * 60 * 60 * 1000, // 4 heures
      replyCheckInterval: options.replyCheckInterval || 30 * 60 * 1000, // 30 minutes
      handoffInterval: options.handoffInterval || 2 * 60 * 60 * 1000, // 2 heures
      
      // Pipeline settings
      seedsPerCycle: options.seedsPerCycle || 5,
      crawlDepth: options.crawlDepth || 2,
      minOFScore: options.minOFScore || 6,
      
      // DM settings
      maxDMsPerCycle: options.maxDMsPerCycle || 100,
      dmTempo: options.dmTempo || 'fast',
      
      // Cloud settings
      healthCheckPort: options.healthCheckPort || 3000,
      metricsEnabled: options.metricsEnabled !== false,
      
      ...options
    };
    
    this.stats = {
      startTime: new Date(),
      cycles: 0,
      discovered: 0,
      qualified: 0,
      sentToDM: 0,
      replies: 0,
      handoffs: 0,
      errors: 0
    };
    
    this.isRunning = false;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    console.log('🚀 Initializing Continuous Pipeline Orchestrator...\n');
    
    // Initialize database
    await this.database.initialize();
    
    // Initialize anti-duplication system
    await this.initializeAntiDuplication();
    
    // Initialize pipeline components
    this.discoveryPipeline = new IntegratedDiscoveryQualificationPipeline({
      crawlDepth: this.config.crawlDepth,
      seedsPerRun: this.config.seedsPerCycle,
      minOFScore: this.config.minOFScore,
      autoSendToDM: false // We handle this manually
    });
    
    await this.discoveryPipeline.initialize();
    
    // Initialize DM orchestrator
    this.dmOrchestrator = new EnhancedDMOrchestrator({
      tempo: this.config.dmTempo,
      useAI: true,
      preEngagement: true,
      useDatabase: true,
      useSessionManager: true
    });
    
    await this.dmOrchestrator.initialize();
    
    // Initialize session manager for Instagram
    this.sessionManager = new InstagramAccountManager({ database: this.database });
    await this.sessionManager.loadAccounts();
    await this.sessionManager.initializeAllAccounts();
    
    console.log('✅ All components initialized\n');
  }

  /**
   * Initialize anti-duplication tracking
   */
  async initializeAntiDuplication() {
    // Create tables for tracking
    await this.database.query(`
      -- Global profile tracking (never re-process)
      CREATE TABLE IF NOT EXISTS processed_profiles (
        username VARCHAR(255) PRIMARY KEY,
        first_discovered TIMESTAMPTZ DEFAULT NOW(),
        discovery_count INT DEFAULT 1,
        qualified BOOLEAN DEFAULT FALSE,
        dm_sent BOOLEAN DEFAULT FALSE,
        dm_sent_at TIMESTAMPTZ,
        replied BOOLEAN DEFAULT FALSE,
        handed_off BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}'
      );
      
      -- Index for quick lookups
      CREATE INDEX IF NOT EXISTS idx_processed_dm ON processed_profiles(dm_sent);
      CREATE INDEX IF NOT EXISTS idx_processed_qualified ON processed_profiles(qualified);
      
      -- Campaign deduplication
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_dm 
      ON dm_conversations(prospect_username);
    `);
    
    // Load existing processed profiles into memory
    const result = await this.database.query(`
      SELECT username FROM processed_profiles 
      WHERE dm_sent = true OR handed_off = true
    `);
    
    result.rows.forEach(row => {
      this.processedProfiles.add(row.username);
    });
    
    console.log(`📊 Loaded ${this.processedProfiles.size} already processed profiles\n`);
  }

  /**
   * Start continuous operation
   */
  async start() {
    if (this.isRunning) {
      console.log('Pipeline already running!');
      return;
    }
    
    this.isRunning = true;
    console.log('🤖 Starting Continuous Pipeline...\n');
    console.log('Configuration:');
    console.log(`   Discovery: Every ${this.config.discoveryInterval / 1000 / 60} minutes`);
    console.log(`   Reply Check: Every ${this.config.replyCheckInterval / 1000 / 60} minutes`);
    console.log(`   Handoff: Every ${this.config.handoffInterval / 1000 / 60} minutes`);
    console.log(`   Seeds per cycle: ${this.config.seedsPerCycle}`);
    console.log(`   Max DMs per cycle: ${this.config.maxDMsPerCycle}\n`);
    
    // Start health check server (for cloud monitoring)
    this.startHealthCheckServer();
    
    // Start all loops
    this.startDiscoveryLoop();
    this.startReplyMonitoringLoop();
    this.startHandoffLoop();
    
    // Start metrics reporting
    if (this.config.metricsEnabled) {
      this.startMetricsReporting();
    }
    
    console.log('✅ Pipeline is running continuously!\n');
    console.log('Press Ctrl+C to stop gracefully\n');
  }

  /**
   * Discovery loop - finds and qualifies new profiles
   */
  async startDiscoveryLoop() {
    const runDiscovery = async () => {
      if (!this.isRunning) return;
      
      try {
        console.log(`\n🔄 Discovery Cycle #${++this.stats.cycles} - ${new Date().toLocaleTimeString()}`);
        
        // Run discovery & qualification
        const results = await this.discoveryPipeline.runFullCycle();
        
        // Filter out already processed profiles
        const newProfiles = [];
        for (const category of ['dmReady', 'highPriority']) {
          if (results.categorized[category]) {
            for (const profile of results.categorized[category]) {
              if (!await this.isProfileProcessed(profile.username)) {
                newProfiles.push(profile);
              }
            }
          }
        }
        
        console.log(`   🆕 New unprocessed profiles: ${newProfiles.length}`);
        
        if (newProfiles.length > 0) {
          // Send to DM system
          const toSend = newProfiles.slice(0, this.config.maxDMsPerCycle);
          await this.sendToDMSystem(toSend);
          
          // Mark as processed
          for (const profile of toSend) {
            await this.markProfileAsProcessed(profile);
          }
        }
        
        // Update stats
        this.stats.discovered += results.stats.discovered;
        this.stats.qualified += results.stats.qualified;
        
      } catch (error) {
        console.error('❌ Discovery error:', error);
        this.stats.errors++;
      }
    };
    
    // Run immediately then on interval
    await runDiscovery();
    this.discoveryInterval = setInterval(runDiscovery, this.config.discoveryInterval);
  }

  /**
   * Reply monitoring loop - checks for responses
   */
  async startReplyMonitoringLoop() {
    const checkReplies = async () => {
      if (!this.isRunning) return;
      
      try {
        console.log(`\n📬 Checking replies - ${new Date().toLocaleTimeString()}`);
        
        await this.dmOrchestrator.checkReplies();
        
        // Get reply stats
        const stats = this.dmOrchestrator.replyMonitor.getStatistics();
        console.log(`   Replies: ${stats.replied}/${stats.total}`);
        
        // Update processed profiles with reply status
        const conversations = this.dmOrchestrator.replyMonitor.getConversations();
        for (const conv of conversations) {
          if (conv.replied) {
            await this.database.query(`
              UPDATE processed_profiles 
              SET replied = true 
              WHERE username = $1
            `, [conv.prospect]);
            
            this.stats.replies++;
          }
        }
        
      } catch (error) {
        console.error('❌ Reply check error:', error);
        this.stats.errors++;
      }
    };
    
    // Run on interval
    this.replyInterval = setInterval(checkReplies, this.config.replyCheckInterval);
  }

  /**
   * Handoff loop - generates reports for closers
   */
  async startHandoffLoop() {
    const generateHandoff = async () => {
      if (!this.isRunning) return;
      
      try {
        console.log(`\n📋 Generating handoff report - ${new Date().toLocaleTimeString()}`);
        
        const outputPath = path.join(
          __dirname, 
          '../output/handoff',
          `handoff_${new Date().toISOString().split('T')[0]}_${Date.now()}.csv`
        );
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        const handoffData = await this.dmOrchestrator.replyMonitor.generateHandoffReport({
          outputPath,
          onlyReplied: true,
          minAge: 30 * 60 * 1000 // 30 minutes old
        });
        
        if (handoffData.length > 0) {
          console.log(`   ✅ Handed off ${handoffData.length} conversations to closers`);
          
          // Mark as handed off
          for (const conv of handoffData) {
            await this.database.query(`
              UPDATE processed_profiles 
              SET handed_off = true 
              WHERE username = $1
            `, [conv.username]);
          }
          
          this.stats.handoffs += handoffData.length;
          
          // Notify webhook if configured
          if (this.config.handoffWebhook) {
            await this.notifyHandoffWebhook(outputPath, handoffData.length);
          }
        }
        
      } catch (error) {
        console.error('❌ Handoff error:', error);
        this.stats.errors++;
      }
    };
    
    // Run on interval
    this.handoffInterval = setInterval(generateHandoff, this.config.handoffInterval);
  }

  /**
   * Send qualified profiles to DM system
   */
  async sendToDMSystem(profiles) {
    console.log(`   📤 Sending ${profiles.length} profiles to DM system...`);
    
    const targets = profiles.map(p => ({
      username: p.username,
      platform: 'instagram',
      followers: p.followers || '',
      metadata: {
        ofScore: p.combinedScore || p.score,
        confidence: p.confidence,
        hasDirectLink: !!p.directLink,
        linkService: p.linkService,
        sourceSeed: p.sourceSeed
      }
    }));
    
    const campaign = await this.dmOrchestrator.runCampaign(targets, {
      campaignName: `auto_continuous_${Date.now()}`,
      distributionStrategy: 'weighted'
    });
    
    this.stats.sentToDM += profiles.length;
    console.log(`   ✅ Campaign started: ${campaign.id}`);
  }

  /**
   * Check if profile was already processed
   */
  async isProfileProcessed(username) {
    // Quick memory check first
    if (this.processedProfiles.has(username)) {
      return true;
    }
    
    // Database check
    const result = await this.database.query(`
      SELECT dm_sent, handed_off 
      FROM processed_profiles 
      WHERE username = $1
    `, [username]);
    
    if (result.rows.length > 0) {
      const profile = result.rows[0];
      if (profile.dm_sent || profile.handed_off) {
        this.processedProfiles.add(username); // Update cache
        return true;
      }
    }
    
    return false;
  }

  /**
   * Mark profile as processed
   */
  async markProfileAsProcessed(profile) {
    await this.database.query(`
      INSERT INTO processed_profiles 
      (username, qualified, dm_sent, dm_sent_at, metadata)
      VALUES ($1, $2, true, NOW(), $3)
      ON CONFLICT (username) DO UPDATE
      SET 
        discovery_count = processed_profiles.discovery_count + 1,
        qualified = $2,
        dm_sent = true,
        dm_sent_at = NOW(),
        metadata = processed_profiles.metadata || $3
    `, [
      profile.username,
      true,
      JSON.stringify({
        score: profile.combinedScore || profile.score,
        confidence: profile.confidence,
        sourceSeed: profile.sourceSeed
      })
    ]);
    
    this.processedProfiles.add(profile.username);
  }

  /**
   * Start health check server for cloud monitoring
   */
  startHealthCheckServer() {
    const http = require('http');
    
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        const health = {
          status: 'healthy',
          uptime: Math.floor((Date.now() - this.stats.startTime) / 1000),
          stats: this.stats,
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(this.config.healthCheckPort, () => {
      console.log(`🏥 Health check server running on port ${this.config.healthCheckPort}\n`);
    });
  }

  /**
   * Start metrics reporting
   */
  startMetricsReporting() {
    setInterval(() => {
      const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000 / 60);
      
      console.log('\n📊 === METRICS REPORT ===');
      console.log(`Runtime: ${runtime} minutes`);
      console.log(`Cycles: ${this.stats.cycles}`);
      console.log(`Discovered: ${this.stats.discovered}`);
      console.log(`Qualified: ${this.stats.qualified}`);
      console.log(`Sent to DM: ${this.stats.sentToDM}`);
      console.log(`Replies: ${this.stats.replies}`);
      console.log(`Handoffs: ${this.stats.handoffs}`);
      console.log(`Errors: ${this.stats.errors}`);
      console.log(`Processed cache: ${this.processedProfiles.size} profiles`);
      console.log('======================\n');
      
    }, 15 * 60 * 1000); // Every 15 minutes
  }

  /**
   * Graceful shutdown
   */
  async stop() {
    console.log('\n🛑 Stopping pipeline gracefully...');
    this.isRunning = false;
    
    // Clear all intervals
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
    if (this.replyInterval) clearInterval(this.replyInterval);
    if (this.handoffInterval) clearInterval(this.handoffInterval);
    
    // Cleanup components
    if (this.dmOrchestrator) await this.dmOrchestrator.shutdown();
    if (this.sessionManager) await this.sessionManager.cleanup();
    if (this.database) await this.database.close();
    
    console.log('✅ Pipeline stopped\n');
  }

  /**
   * Notify webhook about handoff
   */
  async notifyHandoffWebhook(filepath, count) {
    // Implementation would POST to configured webhook
    console.log(`   🔔 Webhook notification: ${count} profiles ready for closing`);
  }
}

// Export for use
export default ContinuousPipelineOrchestrator;