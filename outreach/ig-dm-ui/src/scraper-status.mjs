#!/usr/bin/env node
import 'dotenv/config';
import { ApifyDiscoveryProvider } from './apify-provider.mjs';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function quickStatus() {
  console.log(`${colors.blue}📊 Scraper Quick Status${colors.reset}\n`);
  
  // Check token
  if (!process.env.APIFY_TOKEN) {
    console.log(`${colors.red}❌ APIFY_TOKEN not configured${colors.reset}`);
    return;
  }
  
  console.log(`${colors.green}✅ APIFY_TOKEN configured${colors.reset}`);
  
  const provider = new ApifyDiscoveryProvider({ token: process.env.APIFY_TOKEN });
  
  // Quick test
  console.log('\nTesting scraper with #creatoreconomy (limit 5)...');
  
  try {
    const startTime = Date.now();
    const profiles = await provider.discoverByHashtag('creatoreconomy', 5);
    const elapsed = Date.now() - startTime;
    
    console.log(`${colors.green}✅ Scraper working!${colors.reset}`);
    console.log(`   Found ${profiles.length} profiles in ${elapsed}ms`);
    
    if (profiles.length > 0) {
      console.log('\n📋 Sample profiles:');
      profiles.slice(0, 3).forEach(p => {
        console.log(`   @${p.username} - ${p.followers || '?'} followers`);
      });
    }
    
    console.log(`\n${colors.green}✅ Scraper is healthy and ready to use!${colors.reset}`);
    
  } catch (error) {
    console.log(`${colors.red}❌ Scraper error: ${error.message}${colors.reset}`);
    console.log('\nTroubleshooting:');
    console.log('  1. Check APIFY_TOKEN is valid');
    console.log('  2. Verify Apify account has credits');
    console.log('  3. Check internet connection');
  }
}

quickStatus().catch(console.error);