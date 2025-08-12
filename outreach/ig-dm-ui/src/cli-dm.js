#!/usr/bin/env node
/**
 * CLI pour Instagram DM avec pré-engagement
 * Usage: node cli-dm.js --user username --message "Hello" --preengage likes=2
 */

import { sendDMClean } from './dm-clean.js';
import { launchWithHeadlessProfile } from './headless-switch.js';
import { getRateLimitStatus } from './rate/policies.ts';
import { getRandomMessage, getMessageByIndex, listMessages } from './message-templates.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    user: null,
    message: null,
    randomMessage: false,
    messageIndex: null,
    preEngage: false,
    debug: false,
    headless: 'false'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--user':
      case '-u':
        options.user = args[++i];
        break;
      
      case '--message':
      case '-m':
        options.message = args[++i];
        break;
        
      case '--random-message':
      case '-r':
        options.randomMessage = true;
        break;
        
      case '--message-index':
        options.messageIndex = parseInt(args[++i]);
        break;
        
      case '--preengage':
        const preEngageValue = args[++i];
        if (preEngageValue === 'likes=2') {
          options.preEngage = true;
          process.env.PRE_ENGAGE_LIKES = "2";
        }
        break;
        
      case '--debug':
        options.debug = true;
        break;
        
      case '--headless':
        options.headless = args[++i] || 'new';
        break;
        
      case '--help':
      case '-h':
        console.log(`
Instagram DM CLI avec pré-engagement

Usage:
  node cli-dm.js --user USERNAME [message options] [autres options]

Message Options:
  --message, -m         Message custom
  --random-message, -r  Message aléatoire US business (10 templates)
  --message-index N     Message spécifique par index (0-9)
  --list-messages       Liste tous les templates disponibles

Other Options:
  --user, -u        Target username (sans @)
  --preengage       Pré-engagement (likes=2)
  --debug          Mode debug avec logs détaillés
  --headless       Mode headless (false|new|shell)
  --help, -h       Affiche cette aide

Exemples:
  # Message aléatoire US business
  node cli-dm.js --user target --random-message --preengage likes=2
  
  # Message spécifique par index
  node cli-dm.js --user target --message-index 0 --preengage likes=2
  
  # Message custom
  node cli-dm.js --user target --message "hey custom message"

Variables d'environnement:
  PRE_ENGAGE_LIKES=2    Active le pré-engagement (alternative à --preengage)
  HEADLESS=new          Mode headless par défaut
        `);
        process.exit(0);
        
      case '--status':
        console.log('📊 Rate Limit Status:');
        console.log(JSON.stringify(getRateLimitStatus(), null, 2));
        process.exit(0);
        
      case '--list-messages':
        console.log('💬 Available US Business Templates:');
        listMessages().forEach(({ index, message, preview }) => {
          console.log(`  ${index}: "${preview}"`);
        });
        process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  
  if (!options.user) {
    console.error('❌ User is required. Use --help for usage.');
    process.exit(1);
  }

  // Determine message to use
  let message = options.message;
  
  if (options.randomMessage) {
    message = getRandomMessage();
    console.log(`📝 Random message selected: "${message}"`);
  } else if (options.messageIndex !== null) {
    try {
      message = getMessageByIndex(options.messageIndex);
      console.log(`📝 Message #${options.messageIndex}: "${message}"`);
    } catch (error) {
      console.error(`❌ ${error.message}. Use --list-messages to see available options.`);
      process.exit(1);
    }
  }
  
  if (!message) {
    console.error('❌ Message is required. Use --message, --random-message, or --message-index. Use --help for usage.');
    process.exit(1);
  }

  console.log(`🚀 Instagram DM CLI`);
  console.log(`👤 Target: ${options.user}`);
  console.log(`💬 Message: "${message}"`);
  console.log(`❤️ Pre-engage: ${options.preEngage ? '✅ 2 likes' : '❌ disabled'}`);
  console.log(`🔍 Debug: ${options.debug ? '✅' : '❌'}`);
  console.log(`👻 Headless: ${options.headless}`);
  
  if (options.debug) {
    console.log('\n📊 Current Rate Limits:');
    console.log(JSON.stringify(getRateLimitStatus(), null, 2));
  }

  try {
    // Launch browser
    const { browser, page } = await launchWithHeadlessProfile({
      headless: options.headless,
      debug: options.debug
    });

    console.log('\n🌐 Browser launched, starting DM process...');

    // Send DM with optional pre-engagement
    const result = await sendDMClean(page, options.user, message, {
      debug: options.debug,
      preEngage: options.preEngage
    });

    console.log('\n📊 DM Result:');
    console.log(`✅ Success: ${result.success}`);
    console.log(`⏱️ Time: ${result.dm_time_ms}ms`);
    console.log(`🌐 Status: ${result.dm_network_status}`);
    
    if (options.debug) {
      console.log('\n🔍 Full Result:');
      console.log(JSON.stringify(result, null, 2));
    }

    await browser.close();
    
    console.log(result.success ? '\n🎉 DM sent successfully!' : '\n❌ DM failed');
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ CLI Error:', error.message);
    
    if (options.debug) {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run CLI
main();