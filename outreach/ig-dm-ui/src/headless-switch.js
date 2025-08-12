/**
 * Headless Profile A/B Switch
 * Par défaut headful, teste 'new', réserve 'shell' pour scale/CI
 * Source: https://pptr.dev/guides/headless-modes
 */

import puppeteer from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const pptr = addExtra(puppeteer);
pptr.use(StealthPlugin());

/**
 * Headless strategy switcher avec recommandations
 */
export function getHeadlessMode(mode, debug = false) {
  const strategies = {
    // Headful - recommandé Instagram (meilleure compatibilité)
    'false': false,
    'headful': false,
    
    // New headless - Chrome 109+, proche comportement normal (production)
    'new': 'new', 
    'true': 'new',  // Par défaut si true
    
    // Chrome-headless-shell - performance/scale, pas 100% isomorphe (CI only)
    'shell': 'shell'
  };
  
  const headless = strategies[mode] ?? false; // Default: headful
  
  if (debug) {
    const descriptions = {
      false: 'Headful (Instagram recommended - best compatibility)',
      'new': 'New headless (Chrome 109+ - production ready)',
      'shell': '⚠️  Chrome-headless-shell (CI/scale - behavioral differences)'
    };
    
    console.log(`[Headless] Mode: ${descriptions[String(headless)]}`);
    
    if (headless === 'shell') {
      console.warn('[Headless] ⚠️  Shell mode: performance optimized but NOT 100% Chrome-isomorphic');
      console.warn('[Headless] ⚠️  Use for scale/CI only - higher detection risk on Instagram');
    }
  }
  
  return headless;
}

/**
 * Launch browser avec headless profile
 */
export async function launchWithHeadlessProfile(options = {}) {
  const settings = {
    headless: process.env.HEADLESS || 'false',
    debug: false,
    proxy: null,
    ...options
  };
  
  const headlessMode = getHeadlessMode(settings.headless, settings.debug);
  
  const launchOptions = {
    headless: headlessMode,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US,en',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--no-first-run',
      // Instagram-specific optimizations
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      settings.proxy ? `--proxy-server=${settings.proxy}` : ''
    ].filter(Boolean),
    
    defaultViewport: { width: 1366, height: 768 },
    ignoreDefaultArgs: ['--enable-automation'],
    
    // Performance tuning for headless modes
    ...(headlessMode && {
      pipe: true, // Faster IPC communication
    })
  };
  
  if (settings.debug) {
    console.log(`[Launch] Headless mode: ${headlessMode}`);
    console.log(`[Launch] Stealth plugin: ✅ Active`);
  }
  
  const browser = await pptr.launch(launchOptions);
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  
  // Set realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  
  return { browser, page };
}

/**
 * A/B test headless profiles
 */
export async function testHeadlessProfiles(testUrl = 'https://www.instagram.com/') {
  const modes = ['false', 'new', 'shell'];
  const results = {};
  
  console.log('🧪 A/B Testing headless profiles...');
  
  for (const mode of modes) {
    console.log(`\n🔄 Testing mode: ${mode}`);
    
    try {
      const startTime = performance.now();
      const { browser, page } = await launchWithHeadlessProfile({ 
        headless: mode, 
        debug: true 
      });
      
      // Navigate and measure
      await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      const loadTime = Math.round(performance.now() - startTime);
      
      // Check page title as success indicator
      const title = await page.title();
      const success = title.includes('Instagram') || title.length > 0;
      
      results[mode] = {
        success,
        loadTime,
        title: title.slice(0, 50),
        mode
      };
      
      console.log(`✅ ${mode}: ${loadTime}ms, title: "${title.slice(0, 30)}..."`);
      
      await browser.close();
      
      // Cooldown between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      results[mode] = {
        success: false,
        error: error.message.slice(0, 100),
        mode
      };
      
      console.log(`❌ ${mode}: ${error.message.slice(0, 50)}...`);
    }
  }
  
  // Summary
  console.log('\n📊 A/B Test Results:');
  console.log(JSON.stringify(results, null, 2));
  
  // Recommendations
  const successful = Object.entries(results).filter(([_, result]) => result.success);
  const fastest = successful.sort((a, b) => a[1].loadTime - b[1].loadTime)[0];
  
  if (fastest) {
    console.log(`\n🏆 Recommended mode: ${fastest[0]} (${fastest[1].loadTime}ms)`);
  }
  
  return results;
}

// CLI usage
if (process.argv[2] === '--test') {
  testHeadlessProfiles().catch(console.error);
}