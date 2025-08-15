#!/usr/bin/env node
import 'dotenv/config';
import { InstagramAccountManager } from './instagram-account-manager.mjs';
import { InstagramSessionManager } from './session-manager.mjs';
import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import fs from 'fs/promises';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

// Parse command line arguments
const command = process.argv[2];
const args = process.argv.slice(3);

function arg(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  return index > -1 && args[index + 1] ? args[index + 1] : defaultValue;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

// Main CLI handler
async function main() {
  const commands = {
    'init': initializeSessions,
    'status': showStatus,
    'validate': validateSessions,
    'refresh': refreshSessions,
    'login': loginAccount,
    'health': healthCheck,
    'cleanup': cleanupSessions,
    '2fa': handle2FA,
    'export': exportSessions,
    'import': importSessions
  };
  
  if (!command || !commands[command]) {
    showHelp();
    return;
  }
  
  try {
    await commands[command]();
  } catch (error) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Initialize all sessions
async function initializeSessions() {
  console.log(`${colors.blue}🚀 Initializing Instagram Sessions${colors.reset}\n`);
  
  const configPath = arg('config', path.join(__dirname, '../config/account_proxy_config.json'));
  const database = hasFlag('no-db') ? null : new DMTrackingDatabase();
  
  if (database) {
    await database.initialize();
  }
  
  const manager = new InstagramAccountManager({ database });
  await manager.loadAccounts(configPath);
  
  const results = await manager.initializeAllAccounts();
  
  // Save results to database if available
  if (database) {
    for (const username of results.valid) {
      await updateSessionStatus(database, username, 'valid');
    }
    for (const username of results.failed) {
      await updateSessionStatus(database, username, 'failed');
    }
    
    await database.close();
  }
  
  await manager.cleanup();
  
  if (results.failed.length > 0) {
    console.log(`\n${colors.yellow}⚠️  Failed accounts need manual attention:${colors.reset}`);
    results.failed.forEach(username => {
      console.log(`   - @${username}`);
    });
  }
}

// Show session status
async function showStatus() {
  console.log(`${colors.blue}📊 Session Status${colors.reset}\n`);
  
  const sessionManager = new InstagramSessionManager();
  const sessions = await sessionManager.getAllSessions();
  
  if (sessions.length === 0) {
    console.log('No sessions found. Run "init" first.');
    return;
  }
  
  // Sort by health score
  sessions.sort((a, b) => b.healthScore - a.healthScore);
  
  console.log('Account              | Status    | Health | Last Updated         ');
  console.log('---------------------|-----------|--------|----------------------');
  
  for (const session of sessions) {
    const status = session.expired ? 'EXPIRED' : 'VALID';
    const statusColor = session.expired ? colors.red : colors.green;
    const healthColor = session.healthScore >= 80 ? colors.green : 
                       session.healthScore >= 50 ? colors.yellow : colors.red;
    
    console.log(
      `${session.accountId.padEnd(20)} | ` +
      `${statusColor}${status.padEnd(9)}${colors.reset} | ` +
      `${healthColor}${session.healthScore.toString().padStart(5)}%${colors.reset} | ` +
      `${session.lastUpdated.toLocaleString()}`
    );
  }
  
  // Summary
  const validCount = sessions.filter(s => !s.expired).length;
  const avgHealth = sessions.reduce((sum, s) => sum + s.healthScore, 0) / sessions.length;
  
  console.log(`\n${colors.magenta}Summary:${colors.reset}`);
  console.log(`   Total sessions: ${sessions.length}`);
  console.log(`   Valid: ${validCount} (${Math.round(validCount / sessions.length * 100)}%)`);
  console.log(`   Average health: ${avgHealth.toFixed(1)}%`);
}

// Validate all sessions
async function validateSessions() {
  console.log(`${colors.blue}🔍 Validating Sessions${colors.reset}\n`);
  
  const configPath = arg('config', path.join(__dirname, '../config/account_proxy_config.json'));
  const manager = new InstagramAccountManager();
  
  await manager.loadAccounts(configPath);
  
  let valid = 0;
  let invalid = 0;
  
  for (const [username] of manager.accounts) {
    process.stdout.write(`Validating @${username}... `);
    
    try {
      const browser = await manager.getBrowser(username);
      const page = await browser.newPage();
      
      const validation = await manager.sessionManager.validateSession(username, page);
      
      if (validation.valid) {
        console.log(`${colors.green}✓${colors.reset}`);
        valid++;
      } else {
        console.log(`${colors.red}✗ (${validation.reason})${colors.reset}`);
        invalid++;
      }
      
      await page.close();
    } catch (error) {
      console.log(`${colors.red}✗ (error)${colors.reset}`);
      invalid++;
    }
  }
  
  await manager.cleanup();
  
  console.log(`\n${colors.magenta}Results:${colors.reset}`);
  console.log(`   Valid: ${valid}`);
  console.log(`   Invalid: ${invalid}`);
}

// Refresh expired sessions
async function refreshSessions() {
  console.log(`${colors.blue}🔄 Refreshing Expired Sessions${colors.reset}\n`);
  
  const configPath = arg('config', path.join(__dirname, '../config/account_proxy_config.json'));
  const force = hasFlag('force');
  
  const manager = new InstagramAccountManager();
  await manager.loadAccounts(configPath);
  
  const sessionManager = new InstagramSessionManager();
  const sessions = await sessionManager.getAllSessions();
  
  const toRefresh = force ? sessions : sessions.filter(s => s.expired);
  
  if (toRefresh.length === 0) {
    console.log('No sessions need refreshing.');
    return;
  }
  
  console.log(`Found ${toRefresh.length} sessions to refresh\n`);
  
  let refreshed = 0;
  let failed = 0;
  
  for (const session of toRefresh) {
    process.stdout.write(`Refreshing @${session.accountId}... `);
    
    const result = await manager.refreshAccount(session.accountId);
    
    if (result) {
      console.log(`${colors.green}✓${colors.reset}`);
      refreshed++;
    } else {
      console.log(`${colors.red}✗${colors.reset}`);
      failed++;
    }
  }
  
  await manager.cleanup();
  
  console.log(`\n${colors.magenta}Results:${colors.reset}`);
  console.log(`   Refreshed: ${refreshed}`);
  console.log(`   Failed: ${failed}`);
}

// Login specific account
async function loginAccount() {
  const username = arg('username');
  
  if (!username) {
    console.error('Please provide --username');
    return;
  }
  
  console.log(`${colors.blue}🔐 Logging in @${username}${colors.reset}\n`);
  
  const configPath = arg('config', path.join(__dirname, '../config/account_proxy_config.json'));
  const manager = new InstagramAccountManager();
  
  await manager.loadAccounts(configPath);
  
  if (!manager.accounts.has(username)) {
    console.error(`Account @${username} not found in config`);
    return;
  }
  
  const result = await manager.loginAccount(username);
  
  if (result.success) {
    console.log(`${colors.green}✅ Login successful!${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Login failed: ${result.reason}${colors.reset}`);
    
    if (result.reason === '2fa_required') {
      console.log('\nPlease complete 2FA manually, then run:');
      console.log(`   npm run session:2fa -- --username ${username}`);
    }
  }
  
  await manager.cleanup();
}

// Perform health check
async function healthCheck() {
  console.log(`${colors.blue}🏥 Session Health Check${colors.reset}\n`);
  
  const configPath = arg('config', path.join(__dirname, '../config/account_proxy_config.json'));
  const manager = new InstagramAccountManager();
  
  await manager.loadAccounts(configPath);
  await manager.initializeAllAccounts();
  
  const results = await manager.performHealthCheck();
  const stats = manager.getAccountStats();
  
  console.log(`\n${colors.magenta}Health Check Results:${colors.reset}`);
  console.log(`   Healthy: ${results.healthy}`);
  console.log(`   Refreshed: ${results.refreshed}`);
  console.log(`   Failed: ${results.failed}`);
  
  console.log(`\n${colors.magenta}Account Status:${colors.reset}`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   Ready: ${stats.ready}`);
  console.log(`   Needs 2FA: ${stats.needs2FA}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   Inactive: ${stats.inactive}`);
  
  await manager.cleanup();
}

// Cleanup old sessions
async function cleanupSessions() {
  console.log(`${colors.blue}🧹 Cleaning Up Old Sessions${colors.reset}\n`);
  
  const days = parseInt(arg('days', '30'));
  const sessionManager = new InstagramSessionManager();
  
  await sessionManager.cleanupOldSessions(days);
}

// Handle 2FA completion
async function handle2FA() {
  const username = arg('username');
  
  if (!username) {
    console.error('Please provide --username');
    return;
  }
  
  console.log(`${colors.blue}📱 Handling 2FA for @${username}${colors.reset}\n`);
  
  const database = new DMTrackingDatabase();
  await database.initialize();
  
  // Mark 2FA as completed in database
  await database.query(`
    UPDATE manual_2fa_queue 
    SET status = 'completed', completed_at = NOW()
    WHERE username = $1
  `, [username]);
  
  console.log(`✅ Marked 2FA as completed for @${username}`);
  console.log('Run "refresh" to update the session');
  
  await database.close();
}

// Export sessions
async function exportSessions() {
  console.log(`${colors.blue}📤 Exporting Sessions${colors.reset}\n`);
  
  const output = arg('output', 'sessions_export.json');
  const sessionManager = new InstagramSessionManager();
  const sessions = await sessionManager.getAllSessions();
  
  const exportData = {
    exported: new Date().toISOString(),
    encryptionKeyHash: crypto.createHash('sha256')
      .update(sessionManager.encryptionKey)
      .digest('hex')
      .substring(0, 8),
    sessions: sessions.map(s => ({
      accountId: s.accountId,
      lastUpdated: s.lastUpdated,
      healthScore: s.healthScore
    }))
  };
  
  await fs.writeFile(output, JSON.stringify(exportData, null, 2));
  console.log(`✅ Exported ${sessions.length} sessions to ${output}`);
}

// Import sessions
async function importSessions() {
  console.log(`${colors.blue}📥 Importing Sessions${colors.reset}\n`);
  
  const input = arg('input');
  
  if (!input) {
    console.error('Please provide --input');
    return;
  }
  
  console.log(`${colors.yellow}⚠️  This will overwrite existing sessions!${colors.reset}`);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('Continue? (yes/no): ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('Import cancelled');
    return;
  }
  
  // Implementation would copy session files from backup
  console.log('Import functionality to be implemented');
}

// Update session status in database
async function updateSessionStatus(db, username, status) {
  await db.query(`
    INSERT INTO instagram_session_status (username, status, last_checked)
    VALUES ($1, $2, NOW())
    ON CONFLICT (username) 
    DO UPDATE SET status = $2, last_checked = NOW()
  `, [username, status]);
}

// Show help
function showHelp() {
  console.log(`
${colors.blue}🔐 Instagram Session Manager${colors.reset}

Commands:
  init              Initialize all account sessions
  status            Show session status
  validate          Validate all sessions
  refresh           Refresh expired sessions
  login             Login specific account
  health            Perform health check
  cleanup           Remove old sessions
  2fa               Mark 2FA as completed
  export            Export session metadata
  import            Import sessions from backup

Options:
  --config <path>   Account config file (default: config/account_proxy_config.json)
  --username <name> Target account username
  --days <number>   Days to keep for cleanup (default: 30)
  --force           Force operation
  --no-db           Skip database operations
  --output <path>   Export output file
  --input <path>    Import input file

Examples:
  npm run session:init
  npm run session:status
  npm run session:login -- --username myaccount
  npm run session:refresh -- --force
  npm run session:cleanup -- --days 7
`);
}

// Run CLI
main().catch(console.error);