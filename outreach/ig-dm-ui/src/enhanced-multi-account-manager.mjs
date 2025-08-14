import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Multi-Account Manager with proxy rotation and intelligent distribution
 */
export class EnhancedMultiAccountManager {
  constructor(configPath = path.join(__dirname, '../config/account_proxy_config.json')) {
    this.configPath = configPath;
    this.accounts = [];
    // Backpressure configuration
    this.backpressure = {
      enabled: true,
      highThreshold: 0.10, // 10% reply rate
      lowThreshold: 0.04,  // 4% reply rate
      slowTempo: { min: 120000, max: 240000 }, // 2-4 minutes
      fastTempo: { min: 45000, max: 120000 }   // 45s-2 minutes
    };
    this.accountStatus = new Map();
    this.accountMetrics = new Map();
    this.loadConfiguration();
  }

  loadConfiguration() {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.accounts = config.accounts || config; // Support both formats
        
        // Initialize status and metrics for each account
        this.accounts.forEach(account => {
          const accountId = this.getAccountId(account);
          
          this.accountStatus.set(accountId, {
            available: true,
            lastUsed: null,
            dmsSentToday: 0,
            dmsSentThisHour: 0,
            errors: 0,
            blocked: false,
            challengeRequired: false
          });
          
          this.accountMetrics.set(accountId, {
            totalDmsSent: 0,
            totalReplies: 0,
            replyRate: 0,
            avgResponseTime: 0,
            lastError: null,
            performance: 100 // Health score 0-100
          });
        });
        
        console.log(`✅ Loaded ${this.accounts.length} accounts with proxy configuration`);
      } else {
        console.warn('⚠️ No account configuration found, creating example...');
        this.createExampleConfig();
      }
    } catch (error) {
      console.error('❌ Failed to load account configuration:', error);
      this.accounts = [];
    }
  }

  createExampleConfig() {
    const exampleConfig = {
      accounts: [
        {
          username: "account1",
          password: "password1",
          proxy: "http://proxy1:8080",
          cookies: null,
          maxDmsPerHour: 6,
          maxDmsPerDay: 50,
          tags: ["warm", "primary"]
        },
        {
          username: "account2",
          password: "password2",
          proxy: "http://proxy2:8080",
          cookies: null,
          maxDmsPerHour: 6,
          maxDmsPerDay: 50,
          tags: ["new", "secondary"]
        }
      ],
      settings: {
        defaultMaxDmsPerHour: 6,
        defaultMaxDmsPerDay: 50,
        rotationStrategy: "round-robin", // or "least-used", "performance-based"
        fastTempo: true,
        pauseBetweenAccounts: 5000 // 5 seconds
      }
    };
    
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(this.configPath, JSON.stringify(exampleConfig, null, 2));
    console.log(`📝 Created example config at ${this.configPath}`);
  }

  getAccountId(account) {
    return account.username;
  }

  /**
   * Get next available account using intelligent rotation
   * @param {Object} options - Selection options
   * @returns {Object|null} Account object with credentials and proxy
   */
  getNextAvailableAccount(options = {}) {
    const { strategy = 'round-robin', excludeAccounts = [] } = options;
    
    // Filter available accounts
    const availableAccounts = this.accounts.filter(account => {
      const accountId = this.getAccountId(account);
      const status = this.accountStatus.get(accountId);
      
      return (
        status.available &&
        !status.blocked &&
        !status.challengeRequired &&
        !excludeAccounts.includes(accountId) &&
        this.canSendDM(account)
      );
    });
    
    if (availableAccounts.length === 0) {
      console.warn('⚠️ No available accounts for DM sending');
      return null;
    }
    
    // Select account based on strategy
    let selectedAccount;
    
    switch (strategy) {
      case 'least-used':
        selectedAccount = this.selectLeastUsedAccount(availableAccounts);
        break;
        
      case 'performance-based':
        selectedAccount = this.selectBestPerformingAccount(availableAccounts);
        break;
        
      case 'round-robin':
      default:
        selectedAccount = this.selectRoundRobinAccount(availableAccounts);
        break;
    }
    
    if (selectedAccount) {
      this.markAccountUsed(selectedAccount);
    }
    
    return selectedAccount;
  }

  canSendDM(account) {
    const accountId = this.getAccountId(account);
    const status = this.accountStatus.get(accountId);
    
    const maxPerHour = account.maxDmsPerHour || 6;
    const maxPerDay = account.maxDmsPerDay || 50;
    
    // Check hourly and daily limits
    if (status.dmsSentThisHour >= maxPerHour) {
      console.log(`⏸️ Account ${accountId} reached hourly limit (${maxPerHour})`);
      return false;
    }
    
    if (status.dmsSentToday >= maxPerDay) {
      console.log(`⏸️ Account ${accountId} reached daily limit (${maxPerDay})`);
      return false;
    }
    
    // Check if account needs cooldown after errors
    if (status.errors >= 3) {
      const lastErrorTime = this.accountMetrics.get(accountId).lastError;
      if (lastErrorTime && Date.now() - lastErrorTime < 30 * 60 * 1000) { // 30 min cooldown
        console.log(`⏸️ Account ${accountId} in cooldown after errors`);
        return false;
      }
    }
    
    return true;
  }

  selectRoundRobinAccount(accounts) {
    // Sort by last used time
    return accounts.sort((a, b) => {
      const statusA = this.accountStatus.get(this.getAccountId(a));
      const statusB = this.accountStatus.get(this.getAccountId(b));
      
      const lastUsedA = statusA.lastUsed || 0;
      const lastUsedB = statusB.lastUsed || 0;
      
      return lastUsedA - lastUsedB;
    })[0];
  }

  selectLeastUsedAccount(accounts) {
    // Sort by total DMs sent today
    return accounts.sort((a, b) => {
      const statusA = this.accountStatus.get(this.getAccountId(a));
      const statusB = this.accountStatus.get(this.getAccountId(b));
      
      return statusA.dmsSentToday - statusB.dmsSentToday;
    })[0];
  }

  selectBestPerformingAccount(accounts) {
    // Sort by performance score
    return accounts.sort((a, b) => {
      const metricsA = this.accountMetrics.get(this.getAccountId(a));
      const metricsB = this.accountMetrics.get(this.getAccountId(b));
      
      return metricsB.performance - metricsA.performance;
    })[0];
  }

  markAccountUsed(account) {
    const accountId = this.getAccountId(account);
    const status = this.accountStatus.get(accountId);
    
    status.lastUsed = Date.now();
    status.available = false; // Temporarily mark as unavailable
    
    // Make available again after a short delay
    setTimeout(() => {
      status.available = true;
    }, 5000); // 5 seconds
  }

  /**
   * Update account metrics after DM sent
   */
  updateAccountMetrics(accountId, result) {
    const status = this.accountStatus.get(accountId);
    const metrics = this.accountMetrics.get(accountId);
    
    if (!status || !metrics) return;
    
    if (result.success) {
      status.dmsSentToday++;
      status.dmsSentThisHour++;
      metrics.totalDmsSent++;
      
      // Reset error count on success
      if (status.errors > 0) {
        status.errors = 0;
      }
      
      // Update performance score
      metrics.performance = Math.min(100, metrics.performance + 1);
      
    } else {
      status.errors++;
      metrics.lastError = Date.now();
      
      // Decrease performance score
      metrics.performance = Math.max(0, metrics.performance - 10);
      
      // Check for specific error types
      if (result.error?.includes('challenge_required')) {
        status.challengeRequired = true;
        console.warn(`⚠️ Account ${accountId} requires challenge`);
      } else if (result.error?.includes('blocked') || result.error?.includes('restricted')) {
        status.blocked = true;
        console.error(`❌ Account ${accountId} appears to be blocked`);
      }
    }
    
    // Update reply metrics if applicable
    if (result.gotReply) {
      metrics.totalReplies++;
      metrics.replyRate = (metrics.totalReplies / metrics.totalDmsSent) * 100;
    }
  }

  /**
   * Distribute targets among available accounts
   */
  distributeTargets(targets, options = {}) {
    const { strategy = 'even' } = options;
    const availableAccounts = this.accounts.filter(account => {
      const status = this.accountStatus.get(this.getAccountId(account));
      return !status.blocked && !status.challengeRequired;
    });
    
    if (availableAccounts.length === 0) {
      throw new Error('No available accounts for distribution');
    }
    
    const distribution = new Map();
    
    switch (strategy) {
      case 'even':
        // Distribute evenly among accounts
        const targetsPerAccount = Math.ceil(targets.length / availableAccounts.length);
        
        availableAccounts.forEach((account, index) => {
          const start = index * targetsPerAccount;
          const end = Math.min(start + targetsPerAccount, targets.length);
          distribution.set(this.getAccountId(account), targets.slice(start, end));
        });
        break;
        
      case 'weighted':
        // Distribute based on account performance and limits
        const totalCapacity = availableAccounts.reduce((sum, account) => {
          const status = this.accountStatus.get(this.getAccountId(account));
          const remaining = (account.maxDmsPerDay || 50) - status.dmsSentToday;
          return sum + remaining;
        }, 0);
        
        let assignedCount = 0;
        availableAccounts.forEach(account => {
          const accountId = this.getAccountId(account);
          const status = this.accountStatus.get(accountId);
          const remaining = (account.maxDmsPerDay || 50) - status.dmsSentToday;
          const proportion = remaining / totalCapacity;
          const targetCount = Math.floor(targets.length * proportion);
          
          distribution.set(accountId, targets.slice(assignedCount, assignedCount + targetCount));
          assignedCount += targetCount;
        });
        
        // Assign remaining targets
        if (assignedCount < targets.length) {
          const firstAccount = availableAccounts[0];
          const accountId = this.getAccountId(firstAccount);
          const existing = distribution.get(accountId) || [];
          distribution.set(accountId, [...existing, ...targets.slice(assignedCount)]);
        }
        break;
    }
    
    return distribution;
  }

  /**
   * Reset hourly counters (should be called by cron)
   */
  resetHourlyLimits() {
    for (const [accountId, status] of this.accountStatus) {
      status.dmsSentThisHour = 0;
    }
    console.log('🔄 Reset hourly DM limits for all accounts');
  }

  /**
   * Reset daily counters (should be called by cron at midnight)
   */
  resetDailyLimits() {
    for (const [accountId, status] of this.accountStatus) {
      status.dmsSentToday = 0;
      status.dmsSentThisHour = 0;
      
      // Reset challenge/block status if it's been 24 hours
      if (status.challengeRequired || status.blocked) {
        const metrics = this.accountMetrics.get(accountId);
        const lastError = metrics.lastError || 0;
        
        if (Date.now() - lastError > 24 * 60 * 60 * 1000) {
          status.challengeRequired = false;
          status.blocked = false;
          status.errors = 0;
          console.log(`🔄 Reset block/challenge status for ${accountId}`);
        }
      }
    }
    console.log('🔄 Reset daily DM limits for all accounts');
  }

  /**
   * Get account statistics
   */
  
  
  /**
   * Apply backpressure based on reply rate
   */
  async applyBackpressure() {
    if (!this.backpressure.enabled || !this.database) return;
    
    try {
      const replyRate = await this.database.getRecentReplyRate(30);
      console.log(`📊 Current reply rate: ${(replyRate * 100).toFixed(1)}%`);
      
      if (replyRate > this.backpressure.highThreshold) {
        // Slow down
        this.currentTempo = this.backpressure.slowTempo;
        console.log('🐌 Backpressure: Slowing down tempo (high reply rate)');
      } else if (replyRate < this.backpressure.lowThreshold) {
        // Speed up
        this.currentTempo = this.backpressure.fastTempo;
        console.log('🚀 Backpressure: Speeding up tempo (low reply rate)');
      }
    } catch (error) {
      console.error('Backpressure check failed:', error);
    }
  }

  getAccountStats() {
    const stats = {
      total: this.accounts.length,
      available: 0,
      blocked: 0,
      challenged: 0,
      dmsSentToday: 0,
      totalCapacityRemaining: 0,
      accountDetails: []
    };
    
    this.accounts.forEach(account => {
      const accountId = this.getAccountId(account);
      const status = this.accountStatus.get(accountId);
      const metrics = this.accountMetrics.get(accountId);
      
      if (!status.blocked && !status.challengeRequired && this.canSendDM(account)) {
        stats.available++;
      }
      
      if (status.blocked) stats.blocked++;
      if (status.challengeRequired) stats.challenged++;
      
      stats.dmsSentToday += status.dmsSentToday;
      
      const dailyLimit = account.maxDmsPerDay || 50;
      const remaining = Math.max(0, dailyLimit - status.dmsSentToday);
      stats.totalCapacityRemaining += remaining;
      
      stats.accountDetails.push({
        username: accountId,
        status: status.blocked ? 'blocked' : status.challengeRequired ? 'challenged' : 'active',
        dmsSentToday: status.dmsSentToday,
        dmsSentThisHour: status.dmsSentThisHour,
        dailyLimit: dailyLimit,
        hourlyLimit: account.maxDmsPerHour || 6,
        remaining: remaining,
        performance: metrics.performance,
        replyRate: metrics.replyRate.toFixed(1) + '%',
        lastUsed: status.lastUsed ? new Date(status.lastUsed).toLocaleTimeString() : 'Never'
      });
    });
    
    return stats;
  }

  /**
   * Export account performance report
   */
  exportPerformanceReport(outputPath) {
    const report = {
      generated: new Date().toISOString(),
      accounts: []
    };
    
    this.accounts.forEach(account => {
      const accountId = this.getAccountId(account);
      const status = this.accountStatus.get(accountId);
      const metrics = this.accountMetrics.get(accountId);
      
      report.accounts.push({
        username: accountId,
        proxy: account.proxy,
        status: status.blocked ? 'blocked' : status.challengeRequired ? 'challenged' : 'active',
        performance: {
          totalDmsSent: metrics.totalDmsSent,
          totalReplies: metrics.totalReplies,
          replyRate: metrics.replyRate,
          performanceScore: metrics.performance
        },
        usage: {
          dmsSentToday: status.dmsSentToday,
          dmsSentThisHour: status.dmsSentThisHour,
          errors: status.errors
        }
      });
    });
    
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📊 Exported performance report to ${outputPath}`);
  }
}