import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MultiAccountManager } from './multi-account-manager.mjs';
import { ProxyRotator } from './proxy-rotator.mjs';
import { BetaMessageGenerator } from './beta-message-templates.mjs';
import { createObjectCsvWriter } from 'csv-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DMCoordinator {
  constructor(options = {}) {
    this.accountManager = new MultiAccountManager(options.accountsConfig);
    this.proxyRotator = new ProxyRotator(options.proxiesConfig);
    this.messageGenerator = new BetaMessageGenerator();
    
    // Tracking
    this.campaigns = new Map();
    this.messageHistory = new Map();
    this.targetDeduplication = new Set();
    
    // Config
    this.config = {
      maxDMsPerHour: 20,
      maxDMsPerAccountPerHour: 5,
      pauseBetweenDMs: { min: 120000, max: 300000 }, // 2-5 minutes
      teamMembers: options.teamMembers || ['Sarah', 'Emma', 'Mia', 'Sophia'],
      betaLink: options.betaLink || 'https://ofm-beta.com/exclusive',
      ...options
    };
  }

  async createCampaign(options) {
    const campaignId = `campaign_${Date.now()}`;
    const campaign = {
      id: campaignId,
      name: options.name || 'Beta Outreach',
      targets: options.targets || [],
      targetsFile: options.targetsFile,
      settings: {
        messageCategory: options.messageCategory || 'exclusive',
        timezone: options.timezone || 'ET',
        language: options.language || 'en',
        accountNiche: options.accountNiche,
        maxDMs: options.maxDMs || 100,
        ...options.settings
      },
      status: 'pending',
      stats: {
        sent: 0,
        failed: 0,
        responses: 0,
        startTime: null,
        endTime: null
      },
      created: new Date().toISOString()
    };

    // Load targets from CSV if provided
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
    
    console.log(`🚀 Starting campaign: ${campaign.name}`);
    console.log(`📊 Targets: ${campaign.targets.length}`);
    console.log(`⚙️  Settings:`, campaign.settings);
    
    // Process targets in batches
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
        const result = await this.sendDM(target, campaign);
        results.push(result);
        
        if (result.success) {
          campaign.stats.sent++;
          this.targetDeduplication.add(targetKey);
        } else {
          campaign.stats.failed++;
        }
        
        // Rate limiting pause
        const pauseTime = this.getRandomPause();
        console.log(`⏸️  Pausing for ${Math.round(pauseTime/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, pauseTime));
        
      } catch (error) {
        console.error(`❌ Error processing ${target.username}:`, error);
        campaign.stats.failed++;
      }
    }
    
    campaign.status = 'completed';
    campaign.stats.endTime = new Date().toISOString();
    
    // Save results
    await this.saveCampaignResults(campaign, results);
    
    console.log(`\n✅ Campaign completed!`);
    console.log(`📊 Results: ${campaign.stats.sent} sent, ${campaign.stats.failed} failed`);
    
    return campaign;
  }

  async sendDM(target, campaign) {
    // Get available account
    const account = this.accountManager.getAvailableAccount({
      preferredNiche: campaign.settings.accountNiche,
      excludeAccounts: Array.from(this.messageHistory.get(target.username) || [])
    });
    
    if (!account) {
      throw new Error('No available accounts');
    }
    
    // Lock account
    this.accountManager.lockAccount(account.username);
    
    try {
      // Get proxy for account
      const proxy = await this.proxyRotator.getProxyForAccount(account);
      if (proxy) {
        this.proxyRotator.lockProxy(proxy);
      }
      
      // Generate message
      const teamMember = this.getTeamMemberForAccount(account);
      const { message, templateId } = this.messageGenerator.generateMessage({
        username: target.username,
        teamMember: teamMember,
        modelName: account.metadata?.modelName || 'our',
        language: campaign.settings.language,
        category: campaign.settings.messageCategory,
        timezone: target.tz || campaign.settings.timezone
      });
      
      // Log the DM attempt
      console.log(`\n📤 Sending DM:`);
      console.log(`   Account: ${account.username} (${teamMember})`);
      console.log(`   Target: @${target.username}`);
      console.log(`   Template: ${templateId}`);
      if (proxy) console.log(`   Proxy: ${proxy.location}`);
      
      // Here you would integrate with actual DM sending logic
      // For now, we'll simulate success
      const success = Math.random() > 0.1; // 90% success rate simulation
      
      // Update tracking
      if (!this.messageHistory.has(target.username)) {
        this.messageHistory.set(target.username, new Set());
      }
      this.messageHistory.get(target.username).add(account.username);
      
      // Update account health
      this.accountManager.updateAccountHealth(account.username, {
        dmSent: true,
        success: success,
        error: !success
      });
      
      // Update proxy health
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
        teamMember: teamMember,
        message: message,
        templateId: templateId,
        proxy: proxy ? this.proxyRotator.getProxyKey(proxy) : null,
        success: success,
        timestamp: new Date().toISOString()
      };
      
      return result;
      
    } finally {
      // Always unlock resources
      this.accountManager.unlockAccount(account.username);
      if (proxy) {
        this.proxyRotator.unlockProxy(proxy);
      }
    }
  }

  getTeamMemberForAccount(account) {
    if (account.metadata?.teamMember && account.metadata.teamMember !== 'unassigned') {
      return account.metadata.teamMember;
    }
    
    // Assign a team member if not already assigned
    const teamMember = this.config.teamMembers[
      Math.floor(Math.random() * this.config.teamMembers.length)
    ];
    
    account.metadata = account.metadata || {};
    account.metadata.teamMember = teamMember;
    
    return teamMember;
  }

  getRandomPause() {
    const { min, max } = this.config.pauseBetweenDMs;
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
        { id: 'teamMember', title: 'team_member' },
        { id: 'templateId', title: 'template_id' },
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

  async getStats() {
    const accountStats = this.accountManager.getAccountStats();
    const proxyStats = this.proxyRotator.getProxyStats();
    
    const campaignStats = {
      total: this.campaigns.size,
      active: 0,
      completed: 0,
      totalDMsSent: 0,
      totalDMsFailed: 0
    };
    
    for (const campaign of this.campaigns.values()) {
      if (campaign.status === 'running') campaignStats.active++;
      if (campaign.status === 'completed') campaignStats.completed++;
      campaignStats.totalDMsSent += campaign.stats.sent;
      campaignStats.totalDMsFailed += campaign.stats.failed;
    }
    
    return {
      accounts: accountStats,
      proxies: proxyStats,
      campaigns: campaignStats,
      deduplication: {
        uniqueTargets: this.targetDeduplication.size
      }
    };
  }
}