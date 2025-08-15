import { EnhancedMultiAccountManager } from './enhanced-multi-account-manager.mjs';
import { AIMessageGenerator } from './ai-message-generator.mjs';
import { EnhancedReplyMonitor } from './enhanced-reply-monitor.mjs';
import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';
import { createObjectCsvWriter } from 'csv-writer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main orchestrator for enhanced DM automation system
 */
export class EnhancedDMOrchestrator {
  constructor(options = {}) {
    this.accountManager = new EnhancedMultiAccountManager(options.accountConfigPath);
    this.messageGenerator = new AIMessageGenerator(options.messageOptions);
    this.replyMonitor = new EnhancedReplyMonitor(options.replyOptions);
    this.database = options.useDatabase !== false ? new DMTrackingDatabase(options.dbOptions) : null;
    
    this.config = {
      tempo: options.tempo || 'fast', // 'fast', 'normal', 'conservative'
      pauseBetweenDMs: this.getTempoConfig(options.tempo).pauseBetweenDMs,
      pauseAfterLikes: this.getTempoConfig(options.tempo).pauseAfterLikes,
      preEngagement: options.preEngagement !== false,
      useAI: options.useAI !== false,
      maxDMsPerBatch: options.maxDMsPerBatch || 50,
      handoffDelay: options.handoffDelay || 30 * 60 * 1000, // 30 minutes
      ...options
    };
    
    this.campaigns = new Map();
    this.activeProcesses = new Map();
  }

  getTempoConfig(tempo) {
    const configs = {
      fast: {
        pauseBetweenDMs: { min: 60000, max: 180000 }, // 1-3 minutes
        pauseAfterLikes: { min: 30000, max: 60000 }   // 30s-1 minute
      },
      normal: {
        pauseBetweenDMs: { min: 180000, max: 300000 }, // 3-5 minutes
        pauseAfterLikes: { min: 60000, max: 120000 }   // 1-2 minutes
      },
      conservative: {
        pauseBetweenDMs: { min: 300000, max: 600000 }, // 5-10 minutes
        pauseAfterLikes: { min: 120000, max: 180000 }  // 2-3 minutes
      }
    };
    
    return configs[tempo] || configs.normal;
  }

  /**
   * Initialize the system
   */
  async initialize() {
    console.log('🚀 Initializing Enhanced DM Orchestrator...\n');
    
    // Initialize database if enabled
    if (this.database) {
      await this.database.initialize();
    }
    
    // Load account configuration
    const accountStats = this.accountManager.getAccountStats();
    console.log(`✅ Loaded ${accountStats.total} accounts`);
    console.log(`   Available: ${accountStats.available}`);
    console.log(`   Total capacity: ${accountStats.totalCapacityRemaining} DMs remaining today\n`);
    
    // Load message templates
    console.log(`✅ Message generator initialized`);
    console.log(`   AI: ${this.config.useAI ? 'Enabled' : 'Disabled'}`);
    console.log(`   Templates loaded: ${Object.keys(this.messageGenerator.templates).length} categories\n`);
    
    // Start hourly reset timer
    this.startHourlyReset();
    
    console.log('✅ System ready!\n');
  }

  /**
   * Create and run a DM campaign
   */
  async runCampaign(targets, options = {}) {
    const campaignId = `campaign_${Date.now()}`;
    const campaign = {
      id: campaignId,
      targets: targets,
      options: options,
      startTime: new Date(),
      stats: {
        total: targets.length,
        sent: 0,
        failed: 0,
        replied: 0
      }
    };
    
    this.campaigns.set(campaignId, campaign);
    
    console.log(`\n🎯 Starting DM Campaign: ${campaignId}`);
    console.log(`📊 Targets: ${targets.length}`);
    console.log(`⚡ Tempo: ${this.config.tempo}`);
    console.log(`🤖 AI Messages: ${this.config.useAI ? 'Yes' : 'No'}`);
    console.log(`💕 Pre-engagement: ${this.config.preEngagement ? 'Yes' : 'No'}`);
    
    try {
      // Distribute targets among accounts
      const distribution = this.accountManager.distributeTargets(targets, {
        strategy: options.distributionStrategy || 'weighted'
      });
      
      console.log(`\n📤 Distribution across ${distribution.size} accounts:`);
      for (const [accountId, accountTargets] of distribution) {
        console.log(`   @${accountId}: ${accountTargets.length} targets`);
      }
      
      // Process each account's targets
      const results = await this.processDistribution(distribution, campaign);
      
      // Update campaign stats
      campaign.endTime = new Date();
      campaign.stats.sent = results.filter(r => r.success).length;
      campaign.stats.failed = results.filter(r => !r.success).length;
      
      console.log(`\n✅ Campaign completed!`);
      console.log(`   Sent: ${campaign.stats.sent}/${campaign.stats.total}`);
      console.log(`   Failed: ${campaign.stats.failed}`);
      console.log(`   Duration: ${Math.round((campaign.endTime - campaign.startTime) / 1000 / 60)} minutes`);
      
      // Schedule handoff report
      setTimeout(() => {
        this.generateHandoffReport(campaignId);
      }, this.config.handoffDelay);
      
      return campaign;
      
    } catch (error) {
      console.error('❌ Campaign error:', error);
      campaign.error = error.message;
      throw error;
    }
  }

  /**
   * Process distributed targets
   */
  async processDistribution(distribution, campaign) {
    const results = [];
    
    for (const [accountId, targets] of distribution) {
      const account = this.accountManager.accounts.find(a => 
        this.accountManager.getAccountId(a) === accountId
      );
      
      if (!account) continue;
      
      console.log(`\n🔄 Processing account @${accountId}...`);
      
      // Process targets for this account
      for (const target of targets) {
        try {
          // Check if account can still send
          if (!this.accountManager.canSendDM(account)) {
            console.log(`⏸️ Account ${accountId} reached limit, skipping remaining targets`);
            break;
          }
          
          // Pre-engagement if enabled
          if (this.config.preEngagement) {
            await this.performPreEngagement(target, account);
          }
          
          // Generate personalized message
          const message = await this.generateMessage(target);
          
          // Send DM (simulated for now)
          const result = await this.sendDM(target, account, message);
          
          // Record in database
          if (this.database && result.success) {
            await this.recordDMInDatabase(result);
          }
          
          results.push(result);
          
          // Update account metrics
          this.accountManager.updateAccountMetrics(accountId, result);
          
          // Natural pause (per-account tempo)
          const accountTempo = this.accountManager.tempoFor(account);
          const pauseTime = this.getRandomPause(accountTempo);
          console.log(`   ⏸️ Pausing ${Math.round(pauseTime / 1000)}s before next DM...`);
          await this.sleep(pauseTime);
          
        } catch (error) {
          console.error(`   ❌ Error with ${target.username}:`, error.message);
          results.push({
            target: target.username,
            account: accountId,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Perform pre-engagement (like posts)
   */
  async performPreEngagement(target, account) {
    console.log(`   💕 Pre-engaging @${target.username}...`);
    
    // Simulate liking 2 posts
    // In real implementation, this would use Instagram API/automation
    await this.sleep(2000); // Simulate action time
    
    console.log(`     ✓ Liked 2 recent posts`);
    
    // Pause after likes
    const pauseTime = this.getRandomPause(this.config.pauseAfterLikes);
    console.log(`     ⏸️ Waiting ${Math.round(pauseTime / 1000)}s after likes...`);
    await this.sleep(pauseTime);
  }

  /**
   * Generate personalized message
   */
  async generateMessage(target) {
    const message = await this.messageGenerator.generateMessage(target, {
      useAI: this.config.useAI
    });
    
    console.log(`   📝 Generated message: "${message}"`);
    
    return message;
  }

  /**
   * Send DM (simulated)
   */
  async sendDM(target, account, message) {
    const accountId = this.accountManager.getAccountId(account);
    
    console.log(`   📤 Sending DM:`);
    console.log(`      From: @${accountId}`);
    console.log(`      To: @${target.username}`);
    console.log(`      Message: "${message}"`);
    
    // Simulate send (90% success rate)
    const success = Math.random() > 0.1;
    
    // Record in reply monitor
    const conversationId = this.replyMonitor.recordSentDM(
      target.username,
      accountId,
      message,
      {
        preEngagement: this.config.preEngagement,
        messageSource: this.config.useAI ? 'ai' : 'template'
      }
    );
    
    return {
      conversationId,
      target: target.username,
      account: accountId,
      message,
      proxy: account.proxy,
      success,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Record DM in database
   */
  async recordDMInDatabase(result) {
    if (!this.database) return;
    
    try {
      await this.database.logDMSent({
        conversationId: result.conversationId,
        prospect: {
          username: result.target,
          // Add more prospect data if available
        },
        account: result.account,
        message: result.message,
        proxy: result.proxy,
        preEngagement: this.config.preEngagement,
        messageSource: this.config.useAI ? 'ai' : 'template'
      });
    } catch (error) {
      console.error('Database error:', error);
    }
  }

  /**
   * Check for replies across all accounts
   */
  async checkReplies() {
    console.log('\n📬 Checking for replies...');
    
    // In real implementation, this would login to each account and check DMs
    // For now, simulate some replies
    const simulatedReplies = this.simulateReplies();
    
    for (const reply of simulatedReplies) {
      const result = this.replyMonitor.recordReply(
        reply.target,
        reply.account,
        reply.text
      );
      
      if (result && this.database) {
        await this.database.logReply(result.conversationId, {
          replyText: reply.text,
          sentiment: result.sentiment,
          sentimentScore: result.sentimentScore,
          intent: result.intent,
          replyTime: result.replyTime
        });
      }
      
      console.log(`✅ Reply from @${reply.target}: "${reply.text}" (${result.sentiment})`);
    }
    
    const stats = this.replyMonitor.getStatistics();
    console.log(`\n📊 Reply Statistics:`);
    console.log(`   Total conversations: ${stats.total}`);
    console.log(`   Replied: ${stats.replied} (${Math.round(stats.replied / stats.total * 100)}%)`);
    console.log(`   Avg reply time: ${stats.avgReplyTime} minutes`);
  }

  simulateReplies() {
    // Simulate some replies for testing
    const replies = [
      { target: 'user1', account: 'account1', text: 'hey thanks! yeah i do OF too 😊' },
      { target: 'user2', account: 'account1', text: 'what is this about?' },
      { target: 'user3', account: 'account2', text: 'not interested thanks' },
      { target: 'user4', account: 'account2', text: 'omg yes tell me more!!' }
    ];
    
    // Only return replies for conversations that exist
    return replies.filter(reply => {
      const convId = `${reply.account}-${reply.target}`;
      return this.replyMonitor.conversations.has(convId);
    });
  }

  /**
   * Generate handoff report
   */
  async generateHandoffReport(campaignId) {
    console.log(`\n📋 Generating handoff report for campaign ${campaignId}...`);
    
    const outputPath = path.join(__dirname, '../output', `handoff_${campaignId}.csv`);
    const handoffData = await this.replyMonitor.generateHandoffReport({
      outputPath,
      minAge: 0, // Include all for campaign
      onlyReplied: false
    });
    
    // Send notification or trigger webhook
    console.log(`✅ Handoff report ready for closers: ${outputPath}`);
    
    return handoffData;
  }

  /**
   * Get system statistics
   */
  async getStatistics() {
    const stats = {
      accounts: this.accountManager.getAccountStats(),
      messages: {
        aiGenerated: this.messageGenerator.performanceData.size,
        bestPerforming: this.messageGenerator.getBestPerformingMessages(5)
      },
      replies: this.replyMonitor.getStatistics(),
      campaigns: {
        total: this.campaigns.size,
        active: Array.from(this.campaigns.values()).filter(c => !c.endTime).length,
        completed: Array.from(this.campaigns.values()).filter(c => c.endTime).length
      }
    };
    
    if (this.database) {
      stats.database = {
        accountPerformance: await this.database.getAccountStats(),
        bestTemplates: await this.database.getBestTemplates(5)
      };
    }
    
    return stats;
  }

  /**
   * Start hourly reset timer
   */
  startHourlyReset() {
    // Reset hourly limits at the top of each hour
    const now = new Date();
    const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000;
    
    // Also check backpressure every 5 minutes
    setInterval(() => {
      this.accountManager.applyBackpressure();
    }, 5 * 60 * 1000);
    
    setTimeout(() => {
      this.accountManager.resetHourlyLimits();
      
      // Set up recurring hourly reset
      setInterval(() => {
        this.accountManager.resetHourlyLimits();
      }, 60 * 60 * 1000);
    }, msUntilNextHour);
  }

  /**
   * Utility functions
   */
  getRandomPause(range) {
    const { min, max } = range;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    console.log('\n🔄 Shutting down system...');
    
    // Save any pending data
    this.replyMonitor.saveConversations();
    
    // Export performance reports
    if (this.messageGenerator.performanceData.size > 0) {
      this.messageGenerator.exportPerformanceData(
        path.join(__dirname, '../output/message_performance.json')
      );
    }
    
    // Close database connection
    if (this.database) {
      await this.database.close();
    }
    
    console.log('✅ Shutdown complete');
  }
}