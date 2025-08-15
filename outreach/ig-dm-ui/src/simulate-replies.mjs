#!/usr/bin/env node
import 'dotenv/config';
import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';

const REPLIES = [
  { sentiment: 'positive', intent: 'curious', text: 'omg yes tell me more 😍' },
  { sentiment: 'positive', intent: 'curious', text: 'sounds cool—how does it work?' },
  { sentiment: 'positive', intent: 'interested', text: 'i\'ve been looking for something like this!' },
  { sentiment: 'neutral', intent: 'pricing', text: 'how much is it' },
  { sentiment: 'neutral', intent: 'info', text: 'what exactly do you do?' },
  { sentiment: 'neutral', intent: 'skeptical', text: 'is this legit?' },
  { sentiment: 'negative', intent: 'reject', text: 'no thanks' },
  { sentiment: 'negative', intent: 'annoyed', text: 'stop messaging me' },
];

function pick(arr) { 
  return arr[Math.floor(Math.random() * arr.length)]; 
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const rateIndex = args.indexOf('--rate');
  const maxIndex = args.indexOf('--max');
  
  const rate = rateIndex !== -1 ? parseFloat(args[rateIndex + 1]) : 0.12;
  const max = maxIndex !== -1 ? parseInt(args[maxIndex + 1]) : 80;
  
  console.log(`🎭 Reply Simulator`);
  console.log(`   Target rate: ${(rate * 100).toFixed(0)}%`);
  console.log(`   Max candidates: ${max}\n`);
  
  const db = new DMTrackingDatabase();
  
  try {
    await db.initialize();
    
    // Find recent DMs without replies
    const result = await db.client.query(`
      SELECT o.id, o.username, o.account, o.sent_at
      FROM dm_outreach_logs o
      WHERE o.sent_at > NOW() - INTERVAL '2 hours'
        AND NOT EXISTS (SELECT 1 FROM dm_replies r WHERE r.outreach_log_id = o.id)
      ORDER BY RANDOM() 
      LIMIT $1
    `, [max]);
    
    const pool = result.rows;
    console.log(`Found ${pool.length} unreplied DMs from last 2 hours`);
    
    // Calculate how many to reply to
    const targetReplies = Math.floor(pool.length * Math.max(0, Math.min(rate, 1)));
    const chosen = shuffle(pool).slice(0, targetReplies);
    
    console.log(`Generating ${chosen.length} simulated replies...\n`);
    
    // Insert replies
    for (const dm of chosen) {
      const reply = pick(REPLIES);
      
      await db.logReply(dm.id, {
        replyText: reply.text,
        sentiment: reply.sentiment,
        intent: reply.intent,
        sentimentScore: reply.sentiment === 'positive' ? 0.8 : reply.sentiment === 'negative' ? 0.2 : 0.5,
        replyTime: Math.random() * 30 + 5 // 5-35 minutes
      });
      
      console.log(`✅ @${dm.username}: "${reply.text}" (${reply.sentiment}/${reply.intent})`);
    }
    
    // Show updated stats
    await db.refreshAccountReplyStats(30);
    const globalRate = await db.getRecentReplyRate(30);
    
    console.log(`\n📊 Updated stats:`);
    console.log(`   Global reply rate: ${(globalRate * 100).toFixed(1)}%`);
    
    await db.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    await db.close();
    process.exit(1);
  }
}

main().catch(console.error);