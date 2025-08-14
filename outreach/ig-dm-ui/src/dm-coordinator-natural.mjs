import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MultiAccountManager } from './multi-account-manager.mjs';
import { ProxyRotator } from './proxy-rotator.mjs';
import { NaturalConversationFlow } from './natural-message-templates.mjs';
import { createObjectCsvWriter } from 'csv-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class NaturalDMCoordinator {
  constructor(options = {}) {
    this.accountManager = new MultiAccountManager(options.accountsConfig);
    this.proxyRotator = new ProxyRotator(options.proxiesConfig);
    this.conversationFlow = new NaturalConversationFlow();
    
    // Tracking
    this.campaigns = new Map();
    this.conversations = new Map(); // Track ongoing conversations
    this.targetDeduplication = new Set();
    this.preEngagementTracking = new Map(); // Track likes before DM
    
    // Config
    this.config = {
      maxDMsPerHour: 15, // Plus conservateur pour approche naturelle
      maxDMsPerAccountPerHour: 3,
      pauseBetweenDMs: { min: 300000, max: 600000 }, // 5-10 minutes
      pauseAfterLikes: { min: 60000, max: 180000 }, // 1-3 minutes après likes
      betaLink: options.betaLink || 'https://ofm-beta.com/join',
      preEngagementLikes: 2, // Nombre de posts à liker
      ...options
    };
  }

  async createCampaign(options) {
    const campaignId = `campaign_natural_${Date.now()}`;
    const campaign = {
      id: campaignId,
      name: options.name || 'Natural Beta Outreach',
      targets: options.targets || [],
      targetsFile: options.targetsFile,
      settings: {
        approachStyle: options.approachStyle || 'natural',
        timezone: options.timezone || 'ET',
        language: options.language || 'en',
        maxDMs: options.maxDMs || 50,
        preEngagement: options.preEngagement !== false, // Default true
        conversational: true,
        ...options.settings
      },
      status: 'pending',
      stats: {
        sent: 0,
        failed: 0,
        responses: 0,
        conversations: 0,
        likes: 0,
        startTime: null,
        endTime: null
      },
      created: new Date().toISOString()
    };

    if (campaign.targetsFile) {
      campaign.targets = await this.loadTargetsFromCSV(campaign.targetsFile);
    }

    this.campaigns.set(campaignId, campaign);
    return campaign;
  }

  async loadTargetsFromCSV(filePath) {
    const csvPath = path.resolve(__dirname, filePath);
    const content = fs.readFileSync(csvPath, 'utf8');
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

  async startCampaign(campaignId) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    
    campaign.status = 'running';
    campaign.stats.startTime = new Date().toISOString();
    
    console.log(`\n🌸 Starting Natural DM Campaign: ${campaign.name}`);
    console.log(`📊 Targets: ${campaign.targets.length}`);
    console.log(`🎯 Style: Natural conversational approach`);
    console.log(`💕 Pre-engagement: ${campaign.settings.preEngagement ? 'Yes (2 likes before DM)' : 'No'}`);
    
    const results = [];
    
    for (const target of campaign.targets) {
      if (campaign.stats.sent >= campaign.settings.maxDMs) {
        console.log('📍 Campaign DM limit reached');
        break;
      }
      
      // Check deduplication
      const targetKey = `${target.platform}:${target.username}`;
      if (this.targetDeduplication.has(targetKey)) {
        console.log(`⏭️  Skipping duplicate: ${target.username}`);
        continue;
      }
      
      try {
        // Check if we have an ongoing conversation
        const hasConversation = this.conversations.has(target.username);
        
        if (!hasConversation) {
          // New conversation - do pre-engagement if enabled
          if (campaign.settings.preEngagement) {
            await this.preEngageTarget(target, campaign);
          }
          
          // Send initial DM
          const result = await this.sendNaturalDM(target, campaign, 'intro');
          results.push(result);
          
          if (result.success) {
            campaign.stats.sent++;
            this.targetDeduplication.add(targetKey);
            this.conversations.set(target.username, {
              stage: 'intro',
              account: result.account,
              started: new Date()
            });
          } else {
            campaign.stats.failed++;
          }
        } else {
          // Continue existing conversation
          console.log(`💬 Continuing conversation with ${target.username}`);
          // This would be handled by a separate conversation manager
        }
        
        // Natural pause between actions
        const pauseTime = this.getRandomPause();
        console.log(`⏸️  Natural pause for ${Math.round(pauseTime/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, pauseTime));
        
      } catch (error) {
        console.error(`❌ Error processing ${target.username}:`, error);
        campaign.stats.failed++;
      }
    }
    
    campaign.status = 'completed';
    campaign.stats.endTime = new Date().toISOString();
    
    await this.saveCampaignResults(campaign, results);
    
    console.log(`\n✅ Campaign completed!`);
    console.log(`📊 Results:`);
    console.log(`   • DMs sent: ${campaign.stats.sent}`);
    console.log(`   • Failed: ${campaign.stats.failed}`);
    console.log(`   • Likes given: ${campaign.stats.likes}`);
    console.log(`   • Conversations started: ${campaign.stats.conversations}`);
    
    return campaign;
  }

  async preEngageTarget(target, campaign) {
    console.log(`\n💕 Pre-engaging with @${target.username}`);
    
    // Get account for pre-engagement
    const account = this.accountManager.getAvailableAccount({
      preferredNiche: campaign.settings.accountNiche
    });
    
    if (!account) {
      throw new Error('No available accounts for pre-engagement');
    }
    
    // Track pre-engagement
    this.preEngagementTracking.set(target.username, {
      account: account.username,
      timestamp: new Date(),
      likes: 0
    });
    
    // Simulate liking 2 posts (in real implementation, this would use Puppeteer)
    console.log(`   ❤️  Liking ${this.config.preEngagementLikes} recent posts...`);
    
    // Update stats
    campaign.stats.likes += this.config.preEngagementLikes;
    
    // Natural pause after likes
    const pauseTime = this.getRandomPause(
      this.config.pauseAfterLikes.min,
      this.config.pauseAfterLikes.max
    );
    console.log(`   ⏸️  Waiting ${Math.round(pauseTime/1000)}s after likes...`);
    await new Promise(resolve => setTimeout(resolve, pauseTime));
    
    return true;
  }

  async sendNaturalDM(target, campaign, stage = 'intro') {
    // Get the same account that did pre-engagement if applicable
    let preferredAccount = null;
    if (this.preEngagementTracking.has(target.username)) {
      preferredAccount = this.preEngagementTracking.get(target.username).account;
    }
    
    const account = this.accountManager.getAvailableAccount({
      preferredNiche: campaign.settings.accountNiche,
      preferredAccount: preferredAccount
    });
    
    if (!account) {
      throw new Error('No available accounts');
    }
    
    this.accountManager.lockAccount(account.username);
    
    try {
      // Get proxy
      const proxy = await this.proxyRotator.getProxyForAccount(account);
      if (proxy) {
        this.proxyRotator.lockProxy(proxy);
      }
      
      // Generate natural message
      let messageData;
      if (stage === 'intro') {
        messageData = this.conversationFlow.startConversation(target.username, {
          language: campaign.settings.language
        });
      } else {
        // For follow-ups (would need response data)
        messageData = this.conversationFlow.getNextMessage(
          target.username,
          '', // Would contain actual response
          {
            language: campaign.settings.language,
            betaLink: this.config.betaLink
          }
        );
      }
      
      // Log the DM attempt
      console.log(`\n💬 Sending natural DM:`);
      console.log(`   Model: @${account.username} (${account.metadata?.modelName})`);
      console.log(`   Target: @${target.username}`);
      console.log(`   Stage: ${messageData.stage}`);
      console.log(`   Message: "${messageData.message}"`);
      if (proxy) console.log(`   Proxy: ${proxy.location}`);
      
      // Simulate success (90% for warm accounts, 80% for new)
      const successRate = account.isWarmAccount ? 0.9 : 0.8;
      const success = Math.random() < successRate;
      
      // Update tracking
      this.accountManager.updateAccountHealth(account.username, {
        dmSent: true,
        success: success,
        error: !success
      });
      
      if (proxy) {
        if (success) {
          this.proxyRotator.markProxySuccess(proxy);
        } else {
          this.proxyRotator.markProxyFailed(proxy);
        }
      }
      
      const result = {
        target: target.username,
        account: account.username,
        accountType: account.isWarmAccount ? 'warm' : 'new',
        message: messageData.message,
        templateId: messageData.templateId,
        stage: messageData.stage,
        proxy: proxy ? this.proxyRotator.getProxyKey(proxy) : null,
        success: success,
        preEngagement: this.preEngagementTracking.has(target.username),
        timestamp: new Date().toISOString()
      };
      
      // Update conversation stats
      if (success && stage === 'intro') {
        campaign.stats.conversations++;
      }
      
      return result;
      
    } finally {
      this.accountManager.unlockAccount(account.username);
      if (proxy) {
        this.proxyRotator.unlockProxy(proxy);
      }
    }
  }

  getRandomPause(min = null, max = null) {
    const minPause = min || this.config.pauseBetweenDMs.min;
    const maxPause = max || this.config.pauseBetweenDMs.max;
    return Math.floor(Math.random() * (maxPause - minPause + 1)) + minPause;
  }

  async saveCampaignResults(campaign, results) {
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save detailed results
    const csvPath = path.join(outputDir, `${campaign.id}_results.csv`);
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'target', title: 'target' },
        { id: 'account', title: 'account' },
        { id: 'accountType', title: 'account_type' },
        { id: 'stage', title: 'stage' },
        { id: 'templateId', title: 'template_id' },
        { id: 'preEngagement', title: 'pre_engagement' },
        { id: 'proxy', title: 'proxy' },
        { id: 'success', title: 'success' }
      ]
    });
    
    await csvWriter.writeRecords(results);
    
    // Save campaign summary
    const summaryPath = path.join(outputDir, `${campaign.id}_summary.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(campaign, null, 2));
    
    console.log(`\n📁 Results saved to:`);
    console.log(`   - ${csvPath}`);
    console.log(`   - ${summaryPath}`);
  }

  async handleResponse(username, response, campaignId) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return null;
    
    const conversation = this.conversations.get(username);
    if (!conversation) return null;
    
    // Get next message in conversation
    const nextMessage = this.conversationFlow.getNextMessage(
      username,
      response,
      {
        language: campaign.settings.language,
        betaLink: this.config.betaLink
      }
    );
    
    if (!nextMessage) {
      console.log(`🚫 No appropriate response for ${username}`);
      return null;
    }
    
    // Update conversation stage
    conversation.stage = nextMessage.stage;
    campaign.stats.responses++;
    
    // Send the response (would integrate with actual DM sending)
    console.log(`\n💬 Conversation with ${username}:`);
    console.log(`   Their response: "${response}"`);
    console.log(`   Our reply: "${nextMessage.message}"`);
    console.log(`   Stage: ${nextMessage.stage}`);
    
    return nextMessage;
  }

  async getStats() {
    const accountStats = this.accountManager.getAccountStats();
    const proxyStats = this.proxyRotator.getProxyStats();
    
    const campaignStats = {
      total: this.campaigns.size,
      active: 0,
      completed: 0,
      totalDMsSent: 0,
      totalLikes: 0,
      totalConversations: 0,
      activeConversations: this.conversations.size
    };
    
    for (const campaign of this.campaigns.values()) {
      if (campaign.status === 'running') campaignStats.active++;
      if (campaign.status === 'completed') campaignStats.completed++;
      campaignStats.totalDMsSent += campaign.stats.sent;
      campaignStats.totalLikes += campaign.stats.likes;
      campaignStats.totalConversations += campaign.stats.conversations;
    }
    
    return {
      accounts: accountStats,
      proxies: proxyStats,
      campaigns: campaignStats,
      conversations: {
        active: this.conversations.size,
        stages: this.getConversationStages()
      }
    };
  }

  getConversationStages() {
    const stages = {};
    for (const conv of this.conversations.values()) {
      stages[conv.stage] = (stages[conv.stage] || 0) + 1;
    }
    return stages;
  }
}