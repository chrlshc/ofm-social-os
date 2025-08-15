import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { InstagramSessionManager } from './session-manager.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use stealth plugin
puppeteer.use(StealthPlugin());

/**
 * Instagram Account Manager - Automated session handling
 * Manages login, session persistence, and account rotation
 */
export class InstagramAccountManager {
  constructor(options = {}) {
    this.sessionManager = new InstagramSessionManager(options);
    this.accounts = new Map();
    this.browsers = new Map();
    this.database = options.database;
    
    // Browser pool settings
    this.maxBrowsers = options.maxBrowsers || 5;
    this.browserTimeout = options.browserTimeout || 30 * 60 * 1000; // 30 min
    
    // Account status tracking
    this.accountStatus = new Map();
  }
  
  /**
   * Load account configuration
   */
  async loadAccounts(configPath) {
    try {
      const config = await import(configPath);
      const accounts = config.default?.accounts || config.accounts || [];
      
      for (const account of accounts) {
        this.accounts.set(account.username, {
          ...account,
          status: 'inactive',
          lastUsed: null,
          sessionValid: false
        });
      }
      
      console.log(`✅ Loaded ${this.accounts.size} accounts`);
      return true;
    } catch (error) {
      console.error('Failed to load accounts:', error);
      return false;
    }
  }
  
  /**
   * Initialize all accounts - validate or create sessions
   */
  async initializeAllAccounts() {
    console.log('🚀 Initializing Instagram accounts...\n');
    
    const results = {
      valid: [],
      refreshed: [],
      failed: [],
      new: []
    };
    
    for (const [username, account] of this.accounts) {
      console.log(`\n📱 Processing @${username}...`);
      
      try {
        // Try to load existing session
        const session = await this.sessionManager.loadSession(username);
        
        if (session && !session.expired) {
          // Validate existing session
          const browser = await this.getBrowser(username);
          const page = await browser.newPage();
          
          // Apply session cookies
          if (session.cookies && session.cookies.length > 0) {
            await page.setCookie(...session.cookies);
          }
          
          const validation = await this.sessionManager.validateSession(username, page);
          await page.close();
          
          if (validation.valid) {
            this.updateAccountStatus(username, 'ready', true);
            results.valid.push(username);
            console.log(`✅ Session valid for @${username}`);
          } else {
            // Try to refresh
            const refreshed = await this.refreshAccount(username);
            if (refreshed) {
              results.refreshed.push(username);
            } else {
              results.failed.push(username);
            }
          }
        } else {
          // No valid session - needs login
          console.log(`⚠️  No valid session for @${username}`);
          
          if (account.password) {
            const loginResult = await this.loginAccount(username);
            if (loginResult.success) {
              results.new.push(username);
            } else {
              results.failed.push(username);
            }
          } else {
            console.log(`❌ No password provided for @${username}`);
            results.failed.push(username);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing @${username}:`, error.message);
        results.failed.push(username);
      }
    }
    
    // Summary
    console.log('\n📊 Initialization Summary:');
    console.log(`   ✅ Valid sessions: ${results.valid.length}`);
    console.log(`   🔄 Refreshed: ${results.refreshed.length}`);
    console.log(`   🆕 New logins: ${results.new.length}`);
    console.log(`   ❌ Failed: ${results.failed.length}`);
    
    return results;
  }
  
  /**
   * Login to an account and save session
   */
  async loginAccount(username) {
    const account = this.accounts.get(username);
    if (!account) {
      return { success: false, reason: 'account_not_found' };
    }
    
    console.log(`🔐 Logging in @${username}...`);
    
    try {
      const browser = await this.getBrowser(username);
      const page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({
        width: 1920 + Math.floor(Math.random() * 100),
        height: 1080 + Math.floor(Math.random() * 100)
      });
      
      // Attempt auto-login
      const loginResult = await this.sessionManager.autoLogin(username, {
        username: account.username,
        password: account.password,
        totpSecret: account.totpSecret,
        proxy: account.proxy
      }, page);
      
      if (loginResult.success) {
        this.updateAccountStatus(username, 'ready', true);
        await page.close();
        return { success: true };
      } else {
        await page.close();
        
        if (loginResult.reason === '2fa_required' && !account.totpSecret) {
          // Queue for manual 2FA
          console.log(`⚠️  Manual 2FA required for @${username}`);
          await this.queueFor2FA(username);
        }
        
        return loginResult;
      }
      
    } catch (error) {
      console.error(`Login error for @${username}:`, error);
      return { success: false, reason: 'error', error: error.message };
    }
  }
  
  /**
   * Refresh account session
   */
  async refreshAccount(username) {
    console.log(`🔄 Refreshing @${username}...`);
    
    try {
      const browser = await this.getBrowser(username);
      const refreshed = await this.sessionManager.refreshSession(username, browser);
      
      if (refreshed) {
        this.updateAccountStatus(username, 'ready', true);
        console.log(`✅ Session refreshed for @${username}`);
        return true;
      } else {
        // Try to login if we have credentials
        const account = this.accounts.get(username);
        if (account?.password) {
          const loginResult = await this.loginAccount(username);
          return loginResult.success;
        }
        
        return false;
      }
    } catch (error) {
      console.error(`Refresh error for @${username}:`, error);
      return false;
    }
  }
  
  /**
   * Get or create browser for account
   */
  async getBrowser(username) {
    // Check if browser exists and is connected
    if (this.browsers.has(username)) {
      const browser = this.browsers.get(username);
      if (browser.isConnected()) {
        return browser;
      }
    }
    
    // Create new browser
    const account = this.accounts.get(username);
    const browserOptions = {
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    };
    
    // Add proxy if configured
    if (account?.proxy) {
      browserOptions.args.push(`--proxy-server=${account.proxy}`);
    }
    
    const browser = await puppeteer.launch(browserOptions);
    this.browsers.set(username, browser);
    
    // Set browser timeout
    setTimeout(() => {
      this.closeBrowser(username);
    }, this.browserTimeout);
    
    return browser;
  }
  
  /**
   * Close browser for account
   */
  async closeBrowser(username) {
    if (this.browsers.has(username)) {
      const browser = this.browsers.get(username);
      if (browser.isConnected()) {
        await browser.close();
      }
      this.browsers.delete(username);
    }
  }
  
  /**
   * Get ready account for DM sending
   */
  async getReadyAccount(options = {}) {
    const { excludeAccounts = [], requireProxy = false } = options;
    
    // Filter ready accounts
    const readyAccounts = Array.from(this.accounts.entries())
      .filter(([username, account]) => {
        if (excludeAccounts.includes(username)) return false;
        if (requireProxy && !account.proxy) return false;
        
        const status = this.accountStatus.get(username);
        return status?.status === 'ready' && status?.sessionValid;
      })
      .map(([username]) => username);
    
    if (readyAccounts.length === 0) {
      console.log('❌ No ready accounts available');
      return null;
    }
    
    // Select least recently used
    readyAccounts.sort((a, b) => {
      const aLastUsed = this.accounts.get(a).lastUsed || 0;
      const bLastUsed = this.accounts.get(b).lastUsed || 0;
      return aLastUsed - bLastUsed;
    });
    
    const selectedUsername = readyAccounts[0];
    const account = this.accounts.get(selectedUsername);
    
    // Update last used
    account.lastUsed = Date.now();
    
    return {
      username: selectedUsername,
      ...account,
      browser: await this.getBrowser(selectedUsername)
    };
  }
  
  /**
   * Update account status
   */
  updateAccountStatus(username, status, sessionValid) {
    this.accountStatus.set(username, {
      status,
      sessionValid,
      lastUpdated: Date.now()
    });
    
    const account = this.accounts.get(username);
    if (account) {
      account.status = status;
      account.sessionValid = sessionValid;
    }
  }
  
  /**
   * Queue account for manual 2FA
   */
  async queueFor2FA(username) {
    if (this.database) {
      await this.database.query(`
        INSERT INTO manual_2fa_queue (username, created_at, status)
        VALUES ($1, NOW(), 'pending')
        ON CONFLICT (username) DO UPDATE SET status = 'pending'
      `, [username]);
    }
    
    // Update status
    this.updateAccountStatus(username, 'needs_2fa', false);
    
    console.log(`📋 Queued @${username} for manual 2FA`);
  }
  
  /**
   * Check and process 2FA completions
   */
  async check2FACompletions() {
    if (!this.database) return;
    
    const result = await this.database.query(`
      SELECT username FROM manual_2fa_queue 
      WHERE status = 'completed' AND processed = false
    `);
    
    for (const row of result.rows) {
      console.log(`✅ Processing 2FA completion for @${row.username}`);
      
      // Try to refresh session
      const refreshed = await this.refreshAccount(row.username);
      
      if (refreshed) {
        // Mark as processed
        await this.database.query(`
          UPDATE manual_2fa_queue 
          SET processed = true, processed_at = NOW()
          WHERE username = $1
        `, [row.username]);
      }
    }
  }
  
  /**
   * Get account statistics
   */
  getAccountStats() {
    const stats = {
      total: this.accounts.size,
      ready: 0,
      needs2FA: 0,
      failed: 0,
      inactive: 0
    };
    
    for (const [username, status] of this.accountStatus) {
      switch (status.status) {
        case 'ready':
          stats.ready++;
          break;
        case 'needs_2fa':
          stats.needs2FA++;
          break;
        case 'failed':
          stats.failed++;
          break;
        default:
          stats.inactive++;
      }
    }
    
    return stats;
  }
  
  /**
   * Periodic session health check
   */
  async performHealthCheck() {
    console.log('🏥 Performing session health check...');
    
    const results = {
      healthy: 0,
      refreshed: 0,
      failed: 0
    };
    
    for (const [username, account] of this.accounts) {
      if (account.status !== 'ready') continue;
      
      try {
        const browser = await this.getBrowser(username);
        const page = await browser.newPage();
        
        const validation = await this.sessionManager.validateSession(username, page);
        await page.close();
        
        if (validation.valid) {
          results.healthy++;
        } else {
          // Try to refresh
          const refreshed = await this.refreshAccount(username);
          if (refreshed) {
            results.refreshed++;
          } else {
            results.failed++;
          }
        }
      } catch (error) {
        console.error(`Health check error for @${username}:`, error);
        results.failed++;
      }
    }
    
    console.log(`✅ Health check complete: ${results.healthy} healthy, ${results.refreshed} refreshed, ${results.failed} failed`);
    return results;
  }
  
  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up Instagram account manager...');
    
    // Close all browsers
    for (const [username, browser] of this.browsers) {
      if (browser.isConnected()) {
        await browser.close();
      }
    }
    
    this.browsers.clear();
    
    // Cleanup old sessions
    await this.sessionManager.cleanupOldSessions();
  }
}