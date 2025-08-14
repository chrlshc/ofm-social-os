#!/usr/bin/env node

/**
 * Apply production improvements to the Enhanced DM System
 * This script adds:
 * 1. Banned terms guard for first messages
 * 2. SQL idempotence with UNIQUE constraint
 * 3. Automatic backpressure based on reply rate
 * 4. Enriched handoff CSV with TZ/latency/hints
 * 5. Dry-run by default with confirmation prompt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Applying Production Improvements...\n');

// 1. Add banned terms guard to AI Message Generator
console.log('1️⃣ Adding banned terms guard to AI messages...');
const aiGenPath = path.join(__dirname, 'src/ai-message-generator.mjs');
let aiGenContent = fs.readFileSync(aiGenPath, 'utf8');

// Add banned terms check
const bannedTermsCode = `
  // Production guard: no pitch/price terms in first message
  const bannedTerms = /\\b(price|pricing|pay|payout|subscription|subscribe|trial|beta\\s*link|link in bio|join now|discount|promo|coupon|offer|deal)\\b/i;
  
  scrubBannedTerms(message) {
    if (bannedTerms.test(message)) {
      // Try to regenerate once with constraints
      console.log('⚠️ Banned terms detected, regenerating...');
      return message.replace(bannedTerms, 'details');
    }
    return message;
  }
`;

// Insert after the constructor
aiGenContent = aiGenContent.replace(
  'constructor(options = {}) {',
  `constructor(options = {}) {
    this.bannedTerms = /\\b(price|pricing|pay|payout|subscription|subscribe|trial|beta\\s*link|link in bio|join now|discount|promo|coupon|offer|deal)\\b/i;`
);

// Add check in generateMessage
aiGenContent = aiGenContent.replace(
  'return this.pickRandomTemplate(target);',
  `const message = this.pickRandomTemplate(target);
    // Check for banned terms
    if (this.bannedTerms.test(message)) {
      console.log('⚠️ Template contains banned terms, cleaning...');
      return message.replace(this.bannedTerms, 'details');
    }
    return message;`
);

fs.writeFileSync(aiGenPath, aiGenContent);
console.log('✅ Banned terms guard added\n');

// 2. Add SQL idempotence to database schema
console.log('2️⃣ Adding SQL idempotence constraints...');
const dbPath = path.join(__dirname, 'src/database/dm-tracking-db.mjs');
let dbContent = fs.readFileSync(dbPath, 'utf8');

// Add UNIQUE constraint and ON CONFLICT handling
const idempotenceSQL = `
      -- Idempotence: avoid re-DM same user within same campaign
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uniq_campaign_user'
        ) THEN
          ALTER TABLE dm_outreach_logs 
          ADD CONSTRAINT uniq_campaign_user UNIQUE (campaign_id, username);
        END IF;
      END$$;
      
      -- Fast lookups on recent activity
      CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON dm_outreach_logs(sent_at);
      CREATE INDEX IF NOT EXISTS idx_replies_reply_at ON dm_replies(reply_at);`;

// Insert after table creation
dbContent = dbContent.replace(
  'CREATE TABLE IF NOT EXISTS message_templates',
  idempotenceSQL + '\n\n      CREATE TABLE IF NOT EXISTS message_templates'
);

// Update INSERT to handle conflicts
dbContent = dbContent.replace(
  'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
  'VALUES ($1, $2, $3, $4, $5, $6, $7, $8)\n        ON CONFLICT (campaign_id, username) DO NOTHING'
);

// Add reply rate calculation method
const replyRateMethod = `
  
  /**
   * Calculate recent reply rate for backpressure
   */
  async getRecentReplyRate(minutes = 30) {
    const query = \`
      WITH recent_sent AS (
        SELECT id FROM dm_outreach_logs
        WHERE sent_at > NOW() - INTERVAL '\${minutes} minutes'
      )
      SELECT 
        COUNT(DISTINCT r.id)::float / GREATEST(COUNT(DISTINCT s.id), 1)::float AS reply_rate
      FROM recent_sent s
      LEFT JOIN dm_replies r ON r.outreach_log_id = s.id
    \`;
    
    const result = await this.client.query(query);
    return result.rows[0]?.reply_rate || 0;
  }`;

dbContent = dbContent.replace(
  'async close() {',
  replyRateMethod + '\n\n  async close() {'
);

fs.writeFileSync(dbPath, dbContent);
console.log('✅ SQL idempotence added\n');

// 3. Add backpressure to account manager
console.log('3️⃣ Adding automatic backpressure...');
const accountMgrPath = path.join(__dirname, 'src/enhanced-multi-account-manager.mjs');
let accountMgrContent = fs.readFileSync(accountMgrPath, 'utf8');

// Add backpressure configuration
const backpressureCode = `
    // Backpressure configuration
    this.backpressure = {
      enabled: true,
      highThreshold: 0.10, // 10% reply rate
      lowThreshold: 0.04,  // 4% reply rate
      slowTempo: { min: 120000, max: 240000 }, // 2-4 minutes
      fastTempo: { min: 45000, max: 120000 }   // 45s-2 minutes
    };`;

accountMgrContent = accountMgrContent.replace(
  'this.accounts = [];',
  'this.accounts = [];' + backpressureCode
);

// Add backpressure check method
const backpressureMethod = `
  
  /**
   * Apply backpressure based on reply rate
   */
  async applyBackpressure() {
    if (!this.backpressure.enabled || !this.database) return;
    
    try {
      const replyRate = await this.database.getRecentReplyRate(30);
      console.log(\`📊 Current reply rate: \${(replyRate * 100).toFixed(1)}%\`);
      
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
  }`;

accountMgrContent = accountMgrContent.replace(
  'getAccountStats() {',
  backpressureMethod + '\n\n  getAccountStats() {'
);

fs.writeFileSync(accountMgrPath, accountMgrContent);
console.log('✅ Backpressure added\n');

// 4. Enrich handoff CSV
console.log('4️⃣ Enriching handoff CSV format...');
const replyMonitorPath = path.join(__dirname, 'src/enhanced-reply-monitor.mjs');
let replyMonitorContent = fs.readFileSync(replyMonitorPath, 'utf8');

// Add timezone guesser
const tzGuesserCode = `
  
  /**
   * Guess US timezone from username/text
   */
  guessTimezone(username, text = '') {
    const combined = \`\${username} \${text}\`.toLowerCase();
    
    const timezones = {
      ET: /(new york|nyc|miami|boston|philly|atlanta|orlando|tampa|dc|washington)/,
      CT: /(chicago|houston|dallas|austin|nashville|detroit|minneapolis|st\\.?\\s*louis)/,
      MT: /(denver|salt lake|phoenix|albuquerque|boise)/,
      PT: /(los angeles|la\\b|san diego|san francisco|sf\\b|seattle|portland|vegas|las vegas)/
    };
    
    for (const [tz, pattern] of Object.entries(timezones)) {
      if (pattern.test(combined)) return tz;
    }
    
    return 'ET'; // Default to Eastern
  }
  
  /**
   * Generate closer hint based on intent
   */
  getCloserHint(intent, sentiment) {
    const hints = {
      'pricing': 'Ask budget range; offer light ROI example; propose async trial.',
      'curious': 'Acknowledge; share 1-liner value; ask for preferred contact.',
      'positive': 'Build rapport; share success story; soft pitch allowed.',
      'negative': 'Thank and park; offer to keep a gamma slot later.',
      'neutral': 'Probe with 1 question; avoid pitch; keep it friendly.'
    };
    
    return hints[intent] || hints[sentiment] || hints.neutral;
  }`;

replyMonitorContent = replyMonitorContent.replace(
  'getStatistics() {',
  tzGuesserCode + '\n\n  getStatistics() {'
);

// Update CSV headers
replyMonitorContent = replyMonitorContent.replace(
  "{ id: 'next_action', title: 'next_action' }",
  `{ id: 'next_action', title: 'next_action' },
        { id: 'first_response_latency_sec', title: 'first_response_latency_sec' },
        { id: 'tz', title: 'tz' },
        { id: 'closer_hint', title: 'closer_hint' }`
);

fs.writeFileSync(replyMonitorPath, replyMonitorContent);
console.log('✅ Handoff CSV enriched\n');

// 5. Add dry-run by default to CLI
console.log('5️⃣ Adding dry-run by default with confirmation...');
const cliPath = path.join(__dirname, 'src/cli-enhanced.mjs');
let cliContent = fs.readFileSync(cliPath, 'utf8');

// Update dry-run logic
cliContent = cliContent.replace(
  "if (hasFlag('dry-run')) {",
  `// Default to dry-run unless explicitly disabled
  const isDryRun = !hasFlag('no-dry-run');
  
  if (isDryRun) {`
);

// Add confirmation prompt
const confirmCode = `
  // Require explicit confirmation for real sends
  if (!isDryRun && !hasFlag('yes') && !hasFlag('confirm')) {
    console.log(\`\\n⚠️  WARNING: This will send REAL DMs to \${selectedTargets.length} accounts!\\n\`);
    console.log('Type YES to proceed or anything else to cancel:');
    
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('> ', resolve);
    });
    rl.close();
    
    if (answer.trim() !== 'YES') {
      console.log('\\n❌ Campaign cancelled');
      process.exit(0);
    }
  }`;

cliContent = cliContent.replace(
  '// Confirm before running',
  '// Confirm before running' + confirmCode
);

fs.writeFileSync(cliPath, cliContent);
console.log('✅ Dry-run by default added\n');

// Create migration SQL file
console.log('6️⃣ Creating database migration file...');
const migrationSQL = `-- Production Improvements Migration
-- Run this after npm run enhanced:db-init

-- 1. Add unique constraint for idempotence
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_campaign_user'
  ) THEN
    ALTER TABLE dm_outreach_logs 
    ADD CONSTRAINT uniq_campaign_user UNIQUE (campaign_id, username);
  END IF;
END$$;

-- 2. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON dm_outreach_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_outreach_account ON dm_outreach_logs(account);
CREATE INDEX IF NOT EXISTS idx_replies_reply_at ON dm_replies(reply_at);
CREATE INDEX IF NOT EXISTS idx_replies_sentiment ON dm_replies(sentiment);

-- 3. Add account performance tracking columns
ALTER TABLE account_performance 
ADD COLUMN IF NOT EXISTS hourly_sent INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_sent INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_hour TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_reset_day DATE;

-- 4. Create view for quick stats
CREATE OR REPLACE VIEW dm_stats AS
SELECT 
  COUNT(DISTINCT o.username) as total_contacted,
  COUNT(DISTINCT r.username) as total_replied,
  ROUND(100.0 * COUNT(DISTINCT r.username) / NULLIF(COUNT(DISTINCT o.username), 0), 2) as reply_rate_pct,
  COUNT(DISTINCT CASE WHEN r.sentiment = 'positive' THEN r.username END) as positive_replies,
  COUNT(DISTINCT CASE WHEN r.sentiment = 'negative' THEN r.username END) as negative_replies
FROM dm_outreach_logs o
LEFT JOIN dm_replies r ON r.outreach_log_id = o.id
WHERE o.sent_at > NOW() - INTERVAL '7 days';

GRANT SELECT ON dm_stats TO PUBLIC;
`;

fs.writeFileSync(path.join(__dirname, 'migrations/001_production_improvements.sql'), migrationSQL);
console.log('✅ Migration file created\n');

console.log('🎉 All production improvements applied successfully!\n');
console.log('Next steps:');
console.log('1. Run database migration: psql $DATABASE_URL < migrations/001_production_improvements.sql');
console.log('2. Test with: bash smoke-test.sh');
console.log('3. Commit changes: git add -A && git commit -m "feat: Apply production hardening"');
console.log('4. Push to GitHub: git push origin feature/payments-production-ready');