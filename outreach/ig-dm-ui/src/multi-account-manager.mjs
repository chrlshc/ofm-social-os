import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MultiAccountManager {
  constructor(configPath = path.join(__dirname, '../config/accounts.json')) {
    this.configPath = configPath;
    this.accounts = [];
    this.activeAccounts = new Map();
    this.accountHealth = new Map();
    this.loadAccounts();
  }

  loadAccounts() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.accounts = data.accounts || [];
        
        // Initialize health scores
        this.accounts.forEach(acc => {
          if (!this.accountHealth.has(acc.username)) {
            this.accountHealth.set(acc.username, {
              score: 100,
              lastUsed: null,
              dmsSentToday: 0,
              errors: 0,
              status: 'ready'
            });
          }
        });
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
  }

  saveAccounts() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(this.configPath, JSON.stringify({
      accounts: this.accounts,
      updated: new Date().toISOString()
    }, null, 2));
  }

  addAccount(account) {
    // Validate account structure
    if (!account.username || !account.password) {
      throw new Error('Account must have username and password');
    }

    // Add unique ID if not present
    if (!account.id) {
      account.id = crypto.randomBytes(8).toString('hex');
    }

    // Set default values
    account.type = account.type || 'model';
    account.status = account.status || 'active';
    account.proxy = account.proxy || null;
    account.cookies = account.cookies || null;
    account.created = account.created || new Date().toISOString();
    account.metadata = account.metadata || {
      teamMember: account.teamMember || 'unassigned',
      modelName: account.modelName || account.username,
      niche: account.niche || 'general'
    };

    this.accounts.push(account);
    this.accountHealth.set(account.username, {
      score: 100,
      lastUsed: null,
      dmsSentToday: 0,
      errors: 0,
      status: 'ready'
    });

    this.saveAccounts();
    return account;
  }

  getAvailableAccount(options = {}) {
    const { preferredNiche, excludeAccounts = [] } = options;
    
    // Filter active accounts
    let available = this.accounts.filter(acc => 
      acc.status === 'active' && 
      !excludeAccounts.includes(acc.username) &&
      !this.activeAccounts.has(acc.username)
    );

    // Filter by niche if specified
    if (preferredNiche) {
      const nicheMatches = available.filter(acc => 
        acc.metadata?.niche === preferredNiche
      );
      if (nicheMatches.length > 0) available = nicheMatches;
    }

    // Sort by health score and last used time
    available.sort((a, b) => {
      const healthA = this.accountHealth.get(a.username);
      const healthB = this.accountHealth.get(b.username);
      
      // Prioritize higher health scores
      if (healthA.score !== healthB.score) {
        return healthB.score - healthA.score;
      }
      
      // Then by least recently used
      if (!healthA.lastUsed) return -1;
      if (!healthB.lastUsed) return 1;
      return new Date(healthA.lastUsed) - new Date(healthB.lastUsed);
    });

    // Check daily limits
    for (const account of available) {
      const health = this.accountHealth.get(account.username);
      if (health.dmsSentToday < this.getDailyLimit(account)) {
        return account;
      }
    }

    return null;
  }

  getDailyLimit(account) {
    // Conservative limits based on account age and type
    const accountAge = Math.floor(
      (Date.now() - new Date(account.created).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (accountAge < 7) return 10;  // New accounts: very conservative
    if (accountAge < 30) return 25; // Month old: moderate
    if (accountAge < 90) return 40; // 3 months: standard
    return 50; // Mature accounts: still conservative
  }

  lockAccount(username) {
    this.activeAccounts.set(username, {
      lockedAt: new Date(),
      pid: process.pid
    });
  }

  unlockAccount(username) {
    this.activeAccounts.delete(username);
  }

  updateAccountHealth(username, update) {
    const health = this.accountHealth.get(username) || {
      score: 100,
      lastUsed: null,
      dmsSentToday: 0,
      errors: 0,
      status: 'ready'
    };

    // Update metrics
    if (update.dmSent) {
      health.dmsSentToday++;
      health.lastUsed = new Date().toISOString();
    }

    if (update.error) {
      health.errors++;
      health.score = Math.max(0, health.score - 10);
      
      // Suspend account if too many errors
      if (health.errors >= 3) {
        health.status = 'suspended';
        const account = this.accounts.find(a => a.username === username);
        if (account) account.status = 'suspended';
      }
    }

    if (update.success) {
      health.score = Math.min(100, health.score + 1);
    }

    this.accountHealth.set(username, health);
  }

  resetDailyLimits() {
    // Call this daily via cron
    for (const [username, health] of this.accountHealth) {
      health.dmsSentToday = 0;
      health.errors = 0;
      if (health.status === 'suspended' && health.score > 50) {
        health.status = 'ready';
        const account = this.accounts.find(a => a.username === username);
        if (account) account.status = 'active';
      }
    }
  }

  getAccountStats() {
    const stats = {
      total: this.accounts.length,
      active: 0,
      suspended: 0,
      inUse: this.activeAccounts.size,
      byNiche: {},
      byTeamMember: {},
      totalDmsSentToday: 0
    };

    for (const account of this.accounts) {
      if (account.status === 'active') stats.active++;
      if (account.status === 'suspended') stats.suspended++;
      
      const niche = account.metadata?.niche || 'unknown';
      stats.byNiche[niche] = (stats.byNiche[niche] || 0) + 1;
      
      const member = account.metadata?.teamMember || 'unassigned';
      stats.byTeamMember[member] = (stats.byTeamMember[member] || 0) + 1;
    }

    for (const health of this.accountHealth.values()) {
      stats.totalDmsSentToday += health.dmsSentToday;
    }

    return stats;
  }

  getAccountByTeamMember(teamMember) {
    return this.accounts.filter(acc => 
      acc.metadata?.teamMember === teamMember && 
      acc.status === 'active'
    );
  }
}