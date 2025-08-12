/**
 * Instagram DM Clean - Network sync (pas de sleeps) + métriques
 * Usage conforme API Puppeteer waitForResponse
 */

import { dmBucket, searchBucket, likeBucket, navBucket } from './rate/policies.ts';
import { preEngageTwoLikes } from './preengage.ts';

/**
 * Send DM avec preuve réseau propre + métriques
 * Sources: https://pptr.dev/api/puppeteer.page.waitforresponse
 */
export async function sendDMClean(page, user, message, options = {}) {
  const settings = {
    debug: false,
    timeout: 15000,
    preEngage: process.env.PRE_ENGAGE_LIKES === "2",
    ...options
  };

  const t0 = performance.now();
  
  if (settings.debug) {
    console.log(`[DM-Clean] Starting DM to ${user}: "${message.slice(0, 30)}..."`);
  }

  // Pre-engagement: 2 likes avant DM (optionnel)
  if (settings.preEngage) {
    try {
      await navBucket.take(1);
      await likeBucket.take(2); // Reserve 2 like tokens
      
      const liked = await preEngageTwoLikes(page, user, { 
        maxLikes: 2, 
        dwellMs: [4000, 9000] 
      });
      
      if (settings.debug) {
        console.log(`[DM-Clean] Pre-engagement: ${liked}/2 likes completed`);
      }
      
      // Pause between pre-engagement and DM
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      
    } catch (error) {
      console.warn(`[DM-Clean] Pre-engagement failed: ${error.message}`);
      // Continue with DM even if pre-engagement fails
    }
  }

  try {
    // Rate limiting avec token bucket
    await dmBucket.take(1);
    
    if (settings.debug) {
      console.log(`[DM-Clean] Token consumed, ${dmBucket.getTokens()} remaining`);
    }

    // Navigate to user via DM interface
    await page.goto(`https://www.instagram.com/direct/new/`, {
      waitUntil: 'networkidle2',
      timeout: settings.timeout
    });

    // Search for user
    await searchBucket.take(1);
    
    const searchInput = 'input[placeholder*="Search" i], input[aria-label*="Search" i]';
    await page.waitForSelector(searchInput, { visible: true, timeout: 10000 });
    
    // Type username with human timing
    await page.focus(searchInput);
    await page.keyboard.type(user, { delay: 80 + Math.random() * 60 });
    
    // Wait for user suggestions and click first result  
    await page.waitForTimeout(1000 + Math.random() * 1000);
    
    const userOption = 'div[role="dialog"] [role="button"], [role="option"]';
    await page.waitForSelector(userOption, { visible: true, timeout: 10000 });
    await page.click(userOption);
    
    // Click Next/Chat button
    const nextBtn = 'button[aria-label*="Next" i], button:has-text("Next")';
    await page.waitForSelector(nextBtn, { visible: true, timeout: 5000 });
    await page.click(nextBtn);
    
    // Wait for message composer
    const composer = 'div[contenteditable="true"][role="textbox"], div[contenteditable="true"]';
    await page.waitForSelector(composer, { visible: true, timeout: 10000 });
    
    // Type message with human timing
    await page.focus(composer);
    await page.keyboard.type(message, { delay: 70 + Math.random() * 80 });
    
    // ARM network wait BEFORE clicking send (crucial sequence)
    const waitResp = page.waitForResponse(
      r => r.request().method() === 'POST' &&
           (r.url().includes('/direct_v2/') || r.url().includes('/api/v1/direct_v2/')),
      { timeout: settings.timeout }
    );
    
    // Click send button
    const sendBtn = 'button[type="submit"], [aria-label*="Send" i]';
    await page.waitForSelector(sendBtn, { visible: true, timeout: 5000 });
    await page.click(sendBtn);
    
    // Wait for network confirmation (official Puppeteer pattern)
    const resp = await waitResp;
    const totalTime = Math.round(performance.now() - t0);
    
    const metrics = {
      dm_time_ms: totalTime,
      dm_network_status: resp.status(),
      dm_network_2xx_rate: resp.ok() ? 1 : 0,
      ok: resp.ok(),
      user,
      timestamp: new Date().toISOString(),
      tokens_remaining: dmBucket.getTokens(),
      pre_engagement_likes: settings.preEngage ? 2 : 0
    };
    
    if (settings.debug) {
      console.log(`[DM-Clean] ✅ DM sent in ${totalTime}ms, status: ${resp.status()}`);
      console.log('[DM-Clean] Metrics:', metrics);
    }
    
    return {
      success: resp.ok(),
      ...metrics
    };
    
  } catch (error) {
    const totalTime = Math.round(performance.now() - t0);
    
    const metrics = {
      dm_time_ms: totalTime,
      dm_network_status: 0,
      dm_network_2xx_rate: 0,
      ok: false,
      user,
      error: error.message,
      timestamp: new Date().toISOString(),
      tokens_remaining: dmBucket.getTokens(),
      pre_engagement_likes: settings.preEngage ? 2 : 0
    };
    
    if (settings.debug) {
      console.log(`[DM-Clean] ❌ DM failed in ${totalTime}ms:`, error.message);
    }
    
    return {
      success: false,
      ...metrics
    };
  }
}

/**
 * Batch DM sending avec métriques agrégées
 */
export async function sendBatchDMsClean(page, dmList, options = {}) {
  const settings = {
    debug: false,
    delayMin: 8000,   // 8s min entre DMs
    delayMax: 20000,  // 20s max entre DMs
    ...options
  };
  
  const results = [];
  const startTime = performance.now();
  
  console.log(`[Batch-DM] Starting batch of ${dmList.length} DMs`);
  
  for (let i = 0; i < dmList.length; i++) {
    const { user, message } = dmList[i];
    
    if (settings.debug) {
      console.log(`[Batch-DM] ${i + 1}/${dmList.length}: ${user}`);
    }
    
    const result = await sendDMClean(page, user, message, { debug: settings.debug });
    results.push(result);
    
    // Rate limiting delay (except for last message)
    if (i < dmList.length - 1) {
      const delay = settings.delayMin + Math.random() * (settings.delayMax - settings.delayMin);
      
      if (settings.debug) {
        console.log(`[Batch-DM] Waiting ${Math.round(delay/1000)}s...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Calcul métriques agrégées
  const totalTime = Math.round(performance.now() - startTime);
  const successful = results.filter(r => r.success).length;
  const avgTime = Math.round(results.reduce((sum, r) => sum + r.dm_time_ms, 0) / results.length);
  const rate2xx = Math.round((results.filter(r => r.dm_network_2xx_rate === 1).length / results.length) * 100);
  
  const summary = {
    total: results.length,
    successful,
    failed: results.length - successful,
    success_rate: Math.round((successful / results.length) * 100),
    avg_dm_time_ms: avgTime,
    total_session_time_ms: totalTime,
    network_2xx_rate: rate2xx,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[Batch-DM] Complete: ${summary.success_rate}% success, avg ${avgTime}ms/DM`);
  
  return {
    results,
    summary
  };
}