import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Robust Instagram Session Manager
 * Handles cookie persistence, validation, and automatic refresh
 */
export class InstagramSessionManager {
  constructor(options = {}) {
    this.sessionDir = options.sessionDir || path.join(__dirname, '../sessions');
    this.encryptionKey = options.encryptionKey || process.env.SESSION_ENCRYPTION_KEY || this.generateKey();
    this.maxSessionAge = options.maxSessionAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.database = options.database;
    
    // Session health tracking
    this.sessionHealth = new Map();
    
    // Initialize session directory
    this.initializeSessionStorage();
  }
  
  async initializeSessionStorage() {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      
      // Create .gitignore to prevent accidental commits
      const gitignorePath = path.join(this.sessionDir, '.gitignore');
      await fs.writeFile(gitignorePath, '*\n!.gitignore\n');
    } catch (error) {
      console.error('Failed to initialize session storage:', error);
    }
  }
  
  /**
   * Generate encryption key if not provided
   */
  generateKey() {
    const key = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  Generated temporary encryption key. Set SESSION_ENCRYPTION_KEY in .env for production!');
    return key;
  }
  
  /**
   * Encrypt sensitive data
   */
  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.encryptionKey, 'hex').slice(0, 32),
      iv
    );
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }
  
  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(this.encryptionKey, 'hex').slice(0, 32),
        Buffer.from(encryptedData.iv, 'base64')
      );
      
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));
      
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedData.encrypted, 'base64')),
        decipher.final()
      ]);
      
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }
  
  /**
   * Save session for an account
   */
  async saveSession(accountId, sessionData) {
    const session = {
      accountId,
      cookies: sessionData.cookies || [],
      localStorage: sessionData.localStorage || {},
      sessionStorage: sessionData.sessionStorage || {},
      userAgent: sessionData.userAgent,
      viewport: sessionData.viewport || { width: 1920, height: 1080 },
      proxy: sessionData.proxy,
      lastUpdated: Date.now(),
      lastActivity: Date.now(),
      health: {
        loginCount: 0,
        errorCount: 0,
        challengeCount: 0,
        lastError: null
      }
    };
    
    // Encrypt sensitive session data
    const encrypted = this.encrypt(session);
    
    // Save to file
    const sessionPath = path.join(this.sessionDir, `${accountId}.session`);
    await fs.writeFile(sessionPath, JSON.stringify(encrypted, null, 2));
    
    // Update database if available
    if (this.database) {
      await this.database.query(`
        INSERT INTO instagram_sessions (account_id, session_data, last_updated, health_score)
        VALUES ($1, $2, NOW(), 100)
        ON CONFLICT (account_id) 
        DO UPDATE SET session_data = $2, last_updated = NOW()
      `, [accountId, encrypted]);
    }
    
    // Update health tracking
    this.sessionHealth.set(accountId, session.health);
    
    console.log(`✅ Session saved for @${accountId}`);
    return true;
  }
  
  /**
   * Load session for an account
   */
  async loadSession(accountId) {
    try {
      const sessionPath = path.join(this.sessionDir, `${accountId}.session`);
      
      // Check if session file exists
      try {
        await fs.access(sessionPath);
      } catch {
        console.log(`❌ No session found for @${accountId}`);
        return null;
      }
      
      // Read and decrypt session
      const encryptedData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
      const session = this.decrypt(encryptedData);
      
      if (!session) {
        console.error(`❌ Failed to decrypt session for @${accountId}`);
        return null;
      }
      
      // Validate session age
      const age = Date.now() - session.lastUpdated;
      if (age > this.maxSessionAge) {
        console.warn(`⚠️  Session expired for @${accountId} (${Math.floor(age / 86400000)} days old)`);
        return { ...session, expired: true };
      }
      
      // Restore health tracking
      this.sessionHealth.set(accountId, session.health);
      
      console.log(`✅ Session loaded for @${accountId}`);
      return session;
      
    } catch (error) {
      console.error(`Failed to load session for @${accountId}:`, error);
      return null;
    }
  }
  
  /**
   * Validate session by testing Instagram access
   */
  async validateSession(accountId, page) {
    console.log(`🔍 Validating session for @${accountId}...`);
    
    try {
      // Navigate to Instagram
      await page.goto('https://www.instagram.com/', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Check for login form (indicates logged out)
      const loginForm = await page.$('form[id="loginForm"]');
      if (loginForm) {
        console.log(`❌ Session invalid for @${accountId} - Login required`);
        return { valid: false, reason: 'logged_out' };
      }
      
      // Check for challenge
      const challengeButton = await page.$('button:has-text("Dismiss")');
      if (challengeButton) {
        console.log(`⚠️  Challenge detected for @${accountId}`);
        this.updateSessionHealth(accountId, { challengeCount: 1 });
        return { valid: false, reason: 'challenge_required' };
      }
      
      // Check for suspension
      const suspensionText = await page.$('text=/account.*suspended/i');
      if (suspensionText) {
        console.log(`❌ Account suspended: @${accountId}`);
        return { valid: false, reason: 'suspended' };
      }
      
      // Look for profile icon or navigation (indicates logged in)
      const profileIcon = await page.$('svg[aria-label="Profile"]');
      const navBar = await page.$('nav[role="navigation"]');
      
      if (profileIcon || navBar) {
        console.log(`✅ Session valid for @${accountId}`);
        return { valid: true };
      }
      
      // Fallback check - look for any Instagram-specific elements
      const hasInstagramElements = await page.evaluate(() => {
        return document.querySelector('meta[property="al:ios:app_name"][content="Instagram"]') !== null;
      });
      
      if (hasInstagramElements) {
        console.log(`✅ Session valid for @${accountId} (fallback check)`);
        return { valid: true };
      }
      
      console.log(`❓ Session status unclear for @${accountId}`);
      return { valid: false, reason: 'unknown' };
      
    } catch (error) {
      console.error(`Validation error for @${accountId}:`, error);
      this.updateSessionHealth(accountId, { errorCount: 1 });
      return { valid: false, reason: 'error', error: error.message };
    }
  }
  
  /**
   * Refresh session with stored cookies
   */
  async refreshSession(accountId, browser) {
    console.log(`🔄 Refreshing session for @${accountId}...`);
    
    const session = await this.loadSession(accountId);
    if (!session || !session.cookies || session.cookies.length === 0) {
      console.log(`❌ No valid session data for @${accountId}`);
      return false;
    }
    
    try {
      // Create new context with session data
      const context = await browser.newContext({
        userAgent: session.userAgent || this.getRandomUserAgent(),
        viewport: session.viewport,
        proxy: session.proxy ? { server: session.proxy } : undefined
      });
      
      // Add cookies
      await context.addCookies(session.cookies);
      
      // Create page and validate
      const page = await context.newPage();
      const validation = await this.validateSession(accountId, page);
      
      if (validation.valid) {
        // Update session with current timestamp
        session.lastUpdated = Date.now();
        session.lastActivity = Date.now();
        await this.saveSession(accountId, session);
        
        await page.close();
        await context.close();
        return true;
      }
      
      await page.close();
      await context.close();
      return false;
      
    } catch (error) {
      console.error(`Failed to refresh session for @${accountId}:`, error);
      return false;
    }
  }
  
  /**
   * Auto-login with credentials (use sparingly)
   */
  async autoLogin(accountId, credentials, page) {
    console.log(`🔐 Auto-login for @${accountId}...`);
    
    try {
      // Navigate to login page
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle2'
      });
      
      // Wait for login form
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      
      // Add human-like delays
      await this.humanDelay(1000, 2000);
      
      // Fill credentials with typing simulation
      await page.type('input[name="username"]', credentials.username, {
        delay: this.randomDelay(50, 150)
      });
      
      await this.humanDelay(500, 1000);
      
      await page.type('input[name="password"]', credentials.password, {
        delay: this.randomDelay(50, 150)
      });
      
      await this.humanDelay(500, 1000);
      
      // Click login button
      await page.click('button[type="submit"]');
      
      // Wait for navigation or challenge
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      
      // Check for 2FA
      const twoFactorInput = await page.$('input[name="verificationCode"]');
      if (twoFactorInput) {
        console.log(`⚠️  2FA required for @${accountId}`);
        
        // If we have TOTP secret, generate code
        if (credentials.totpSecret) {
          const code = await this.generateTOTP(credentials.totpSecret);
          await page.type('input[name="verificationCode"]', code);
          await page.click('button:has-text("Confirm")');
          await page.waitForNavigation({ waitUntil: 'networkidle2' });
        } else {
          return { success: false, reason: '2fa_required' };
        }
      }
      
      // Check for challenge
      const challengeDetected = await this.detectChallenge(page);
      if (challengeDetected) {
        console.log(`⚠️  Challenge detected for @${accountId}`);
        return { success: false, reason: 'challenge_required' };
      }
      
      // Save session if login successful
      const validation = await this.validateSession(accountId, page);
      if (validation.valid) {
        // Extract and save cookies
        const cookies = await page.context().cookies();
        const localStorage = await page.evaluate(() => {
          const items = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            items[key] = window.localStorage.getItem(key);
          }
          return items;
        });
        
        await this.saveSession(accountId, {
          cookies,
          localStorage,
          userAgent: await page.evaluate(() => navigator.userAgent),
          viewport: page.viewportSize(),
          proxy: credentials.proxy
        });
        
        this.updateSessionHealth(accountId, { loginCount: 1 });
        console.log(`✅ Auto-login successful for @${accountId}`);
        return { success: true };
      }
      
      return { success: false, reason: 'login_failed' };
      
    } catch (error) {
      console.error(`Auto-login failed for @${accountId}:`, error);
      this.updateSessionHealth(accountId, { errorCount: 1, lastError: error.message });
      return { success: false, reason: 'error', error: error.message };
    }
  }
  
  /**
   * Generate TOTP code for 2FA
   */
  async generateTOTP(secret) {
    // Implementation would use a library like speakeasy
    // This is a placeholder
    console.warn('TOTP generation not implemented');
    return '000000';
  }
  
  /**
   * Detect Instagram challenges
   */
  async detectChallenge(page) {
    const challengeSelectors = [
      'button:has-text("This Was Me")',
      'button:has-text("This Was Not Me")',
      'text=/suspicious activity/i',
      'text=/confirm your identity/i',
      'text=/help us confirm/i'
    ];
    
    for (const selector of challengeSelectors) {
      const element = await page.$(selector);
      if (element) return true;
    }
    
    return false;
  }
  
  /**
   * Update session health metrics
   */
  updateSessionHealth(accountId, updates) {
    const current = this.sessionHealth.get(accountId) || {
      loginCount: 0,
      errorCount: 0,
      challengeCount: 0,
      lastError: null
    };
    
    if (updates.loginCount) current.loginCount += updates.loginCount;
    if (updates.errorCount) current.errorCount += updates.errorCount;
    if (updates.challengeCount) current.challengeCount += updates.challengeCount;
    if (updates.lastError) current.lastError = updates.lastError;
    
    this.sessionHealth.set(accountId, current);
  }
  
  /**
   * Get session health score (0-100)
   */
  getSessionHealthScore(accountId) {
    const health = this.sessionHealth.get(accountId);
    if (!health) return 100;
    
    let score = 100;
    score -= health.errorCount * 5;
    score -= health.challengeCount * 10;
    score = Math.max(0, Math.min(100, score));
    
    return score;
  }
  
  /**
   * Cleanup old sessions
   */
  async cleanupOldSessions(daysToKeep = 30) {
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    
    const sessionFiles = await fs.readdir(this.sessionDir);
    let cleaned = 0;
    
    for (const file of sessionFiles) {
      if (!file.endsWith('.session')) continue;
      
      const filePath = path.join(this.sessionDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime.getTime() < cutoff) {
        await fs.unlink(filePath);
        cleaned++;
      }
    }
    
    console.log(`🧹 Cleaned ${cleaned} old sessions`);
  }
  
  /**
   * Get all stored sessions
   */
  async getAllSessions() {
    const sessionFiles = await fs.readdir(this.sessionDir);
    const sessions = [];
    
    for (const file of sessionFiles) {
      if (!file.endsWith('.session')) continue;
      
      const accountId = file.replace('.session', '');
      const session = await this.loadSession(accountId);
      
      if (session) {
        sessions.push({
          accountId,
          lastUpdated: new Date(session.lastUpdated),
          expired: session.expired || false,
          healthScore: this.getSessionHealthScore(accountId)
        });
      }
    }
    
    return sessions;
  }
  
  /**
   * Utility functions
   */
  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0'
    ];
    
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }
  
  humanDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }
  
  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}