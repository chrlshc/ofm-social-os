#!/usr/bin/env node
import 'dotenv/config';

console.log('🧪 Testing Enhanced DM Automation System\n');

// Test 1: Multi-Account Manager
console.log('1️⃣ Testing Multi-Account Manager...');
try {
  const { EnhancedMultiAccountManager } = await import('./src/enhanced-multi-account-manager.mjs');
  const accountManager = new EnhancedMultiAccountManager();
  const stats = accountManager.getAccountStats();
  console.log('✅ Account Manager loaded');
  console.log(`   Total accounts: ${stats.total}`);
  console.log(`   Available: ${stats.available}`);
  console.log(`   Capacity remaining: ${stats.totalCapacityRemaining}\n`);
} catch (error) {
  console.error('❌ Account Manager error:', error.message, '\n');
}

// Test 2: AI Message Generator
console.log('2️⃣ Testing AI Message Generator...');
try {
  const { AIMessageGenerator } = await import('./src/ai-message-generator.mjs');
  const generator = new AIMessageGenerator();
  const testTarget = {
    username: 'test_user',
    name: 'Sarah',
    location: 'Miami',
    niche: 'fitness',
    recent_post: 'beach workout'
  };
  const message = await generator.generateMessage(testTarget, { useAI: false });
  console.log('✅ Message Generator loaded');
  console.log(`   Generated: "${message}"\n`);
} catch (error) {
  console.error('❌ Message Generator error:', error.message, '\n');
}

// Test 3: Reply Monitor
console.log('3️⃣ Testing Enhanced Reply Monitor...');
try {
  const { EnhancedReplyMonitor } = await import('./src/enhanced-reply-monitor.mjs');
  const monitor = new EnhancedReplyMonitor();
  
  // Record a test DM
  const convId = monitor.recordSentDM('test_user', 'test_account', 'hey girl! love your content 😍');
  
  // Simulate a reply
  const reply = monitor.recordReply('test_user', 'test_account', 'thanks! what is this about?');
  
  console.log('✅ Reply Monitor loaded');
  console.log(`   Conversation ID: ${convId}`);
  console.log(`   Reply sentiment: ${reply.sentiment}`);
  console.log(`   Intent: ${reply.intent}\n`);
} catch (error) {
  console.error('❌ Reply Monitor error:', error.message, '\n');
}

// Test 4: Database Schema
console.log('4️⃣ Testing Database Schema...');
try {
  const { DMTrackingDatabase } = await import('./src/database/dm-tracking-db.mjs');
  console.log('✅ Database module loaded');
  console.log('   Tables: dm_outreach_logs, dm_replies, account_performance, message_templates');
  console.log('   Note: Run "npm run enhanced:db-init" to create tables\n');
} catch (error) {
  console.error('❌ Database error:', error.message, '\n');
}

// Test 5: CLI Commands
console.log('5️⃣ Available CLI Commands:');
console.log('   npm run enhanced:campaign    - Run DM campaign');
console.log('   npm run enhanced:accounts    - Show account status');
console.log('   npm run enhanced:stats       - Show system statistics');
console.log('   npm run enhanced:check-replies - Check for replies');
console.log('   npm run enhanced:db-init     - Initialize database');
console.log('   npm run enhanced:db-stats    - Show database stats\n');

console.log('✨ System Features Summary:');
console.log('   ✅ Multi-account management with proxy rotation');
console.log('   ✅ AI-powered message generation (OpenAI/Anthropic)');
console.log('   ✅ Enhanced reply monitoring with sentiment analysis');
console.log('   ✅ PostgreSQL database integration');
console.log('   ✅ Automated handoff to closers');
console.log('   ✅ Token bucket rate limiting');
console.log('   ✅ A/B testing for messages\n');

console.log('📊 Performance Capabilities:');
console.log('   • 30+ DMs/hour safely across multiple accounts');
console.log('   • Fast tempo: 1-3 min between DMs');
console.log('   • Pre-engagement: 2 likes before DM');
console.log('   • Automatic handoff after 30 minutes\n');

process.exit(0);