#!/usr/bin/env node
import 'dotenv/config';
import { ApifyDiscoveryProvider } from './apify-provider.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

async function testScraperHealth() {
  console.log(`${colors.blue}🏥 Instagram Scraper Health Check${colors.reset}\n`);
  
  if (!process.env.APIFY_TOKEN) {
    console.error(`${colors.red}❌ APIFY_TOKEN not found in environment!${colors.reset}`);
    console.log('\nPlease set your Apify token:');
    console.log('  export APIFY_TOKEN=your_apify_token_here');
    return;
  }
  
  const provider = new ApifyDiscoveryProvider({ token: process.env.APIFY_TOKEN });
  
  // Test parameters
  const testHashtags = [
    { hashtag: 'onlyfansusa', expectedMin: 50 },
    { hashtag: 'ugcmodel', expectedMin: 30 },
    { hashtag: 'miamimodel', expectedMin: 20 }
  ];
  
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  console.log('🔍 Running health checks...\n');
  
  // Test 1: API Authentication
  console.log(`${colors.yellow}1. Testing API Authentication...${colors.reset}`);
  try {
    await provider.client.user().get();
    console.log(`   ${colors.green}✓ Authentication successful${colors.reset}`);
    results.passed++;
  } catch (error) {
    console.log(`   ${colors.red}✗ Authentication failed: ${error.message}${colors.reset}`);
    results.failed++;
    results.errors.push('Authentication failed');
  }
  
  // Test 2: Actor availability
  console.log(`\n${colors.yellow}2. Testing Instagram Scraper Actor...${colors.reset}`);
  try {
    const actor = await provider.client.actor('apify/instagram-scraper').get();
    console.log(`   ${colors.green}✓ Actor available${colors.reset}`);
    console.log(`   Version: ${actor.versions[0]?.versionNumber || 'Unknown'}`);
    console.log(`   Last updated: ${new Date(actor.modifiedAt).toLocaleDateString()}`);
    results.passed++;
  } catch (error) {
    console.log(`   ${colors.red}✗ Actor not found: ${error.message}${colors.reset}`);
    results.failed++;
    results.errors.push('Actor not available');
  }
  
  // Test 3: Hashtag scraping
  console.log(`\n${colors.yellow}3. Testing Hashtag Scraping...${colors.reset}`);
  
  for (const test of testHashtags) {
    process.stdout.write(`   #${test.hashtag}... `);
    
    const startTime = Date.now();
    try {
      const profiles = await provider.discoverByHashtag(test.hashtag, 100);
      const elapsed = Date.now() - startTime;
      
      if (profiles.length >= test.expectedMin) {
        console.log(`${colors.green}✓ Found ${profiles.length} profiles (${elapsed}ms)${colors.reset}`);
        
        // Show sample profile
        if (profiles.length > 0) {
          const sample = profiles[0];
          console.log(`     Sample: @${sample.username} (${sample.followers || '?'} followers)`);
        }
        
        results.passed++;
      } else {
        console.log(`${colors.yellow}⚠ Only ${profiles.length} profiles (expected ${test.expectedMin}+)${colors.reset}`);
        results.failed++;
        results.errors.push(`Low results for #${test.hashtag}`);
      }
    } catch (error) {
      console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
      results.failed++;
      results.errors.push(`Failed to scrape #${test.hashtag}`);
    }
  }
  
  // Test 4: Rate limits
  console.log(`\n${colors.yellow}4. Testing Rate Limits...${colors.reset}`);
  try {
    const account = await provider.client.user().get();
    const limits = account.limits;
    
    if (limits) {
      console.log(`   Monthly limit: ${limits.monthlyUsageUsd ? `$${limits.monthlyUsageUsd}` : 'Unknown'}`);
      console.log(`   Actor compute units: ${limits.actorComputeUnits || 'Unknown'}`);
    }
    
    console.log(`   ${colors.green}✓ Rate limits checked${colors.reset}`);
    results.passed++;
  } catch (error) {
    console.log(`   ${colors.yellow}⚠ Could not check rate limits${colors.reset}`);
  }
  
  // Test 5: Data quality
  console.log(`\n${colors.yellow}5. Testing Data Quality...${colors.reset}`);
  try {
    const profiles = await provider.discoverByHashtag('creatoreconomy', 20);
    
    let hasUsername = 0;
    let hasFollowers = 0;
    let hasUrl = 0;
    let hasCaption = 0;
    
    profiles.forEach(p => {
      if (p.username) hasUsername++;
      if (p.followers) hasFollowers++;
      if (p.url) hasUrl++;
      if (p.caption) hasCaption++;
    });
    
    console.log(`   Usernames: ${hasUsername}/${profiles.length}`);
    console.log(`   Followers: ${hasFollowers}/${profiles.length}`);
    console.log(`   URLs: ${hasUrl}/${profiles.length}`);
    console.log(`   Captions: ${hasCaption}/${profiles.length}`);
    
    const quality = (hasUsername / profiles.length) * 100;
    if (quality >= 90) {
      console.log(`   ${colors.green}✓ Data quality: ${quality.toFixed(0)}%${colors.reset}`);
      results.passed++;
    } else {
      console.log(`   ${colors.yellow}⚠ Data quality: ${quality.toFixed(0)}%${colors.reset}`);
      results.failed++;
    }
  } catch (error) {
    console.log(`   ${colors.red}✗ Quality test failed${colors.reset}`);
    results.failed++;
  }
  
  // Summary
  console.log(`\n${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.magenta}Health Check Summary${colors.reset}`);
  console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  const totalTests = results.passed + results.failed;
  const healthScore = (results.passed / totalTests) * 100;
  
  console.log(`\nTests passed: ${results.passed}/${totalTests}`);
  console.log(`Health score: ${healthScore.toFixed(0)}%`);
  
  if (healthScore === 100) {
    console.log(`\n${colors.green}✅ Scraper is fully operational!${colors.reset}`);
  } else if (healthScore >= 80) {
    console.log(`\n${colors.yellow}⚠️  Scraper is operational with minor issues${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ Scraper has significant issues${colors.reset}`);
  }
  
  if (results.errors.length > 0) {
    console.log('\nIssues found:');
    results.errors.forEach(err => {
      console.log(`  • ${err}`);
    });
  }
  
  // Recommendations
  console.log(`\n${colors.blue}📋 Recommendations:${colors.reset}`);
  
  if (healthScore === 100) {
    console.log('  ✓ System is healthy - ready for production use');
    console.log('  ✓ Consider running test campaigns with small batches');
  } else {
    if (results.errors.includes('Authentication failed')) {
      console.log('  • Check your APIFY_TOKEN is valid');
      console.log('  • Verify token has not expired');
    }
    if (results.errors.some(e => e.includes('Low results'))) {
      console.log('  • Some hashtags may have limited content');
      console.log('  • Try broader hashtags or increase limits');
    }
    if (results.errors.includes('Actor not available')) {
      console.log('  • Verify Apify subscription includes Instagram scraper');
      console.log('  • Check actor ID is correct: apify/instagram-scraper');
    }
  }
  
  console.log('\n📚 Usage examples:');
  console.log('  npm run apify:us          # US market discovery');
  console.log('  npm run apify:us-intent   # Intent-based targeting');
  console.log('  npm run test:scraper      # Run this health check');
}

// Run health check
testScraperHealth().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});