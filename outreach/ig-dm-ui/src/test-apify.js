// Test Apify SDK installation
console.log('🕷️ Testing Apify SDK installation...');

async function testApify() {
  try {
    const { Actor } = await import('apify');
    console.log('✅ Apify SDK: OK');
    
    const { PuppeteerCrawler } = await import('crawlee');
    console.log('✅ Crawlee: OK');
    
    // Test basic Apify functionality
    try {
      await Actor.init();
      console.log('✅ Apify Actor initialization: OK');
      await Actor.exit();
    } catch (e) {
      console.log('⚠️ Apify Actor init (expected in non-actor env):', e.message.slice(0, 50) + '...');
    }
    
    console.log('🎉 Apify SDK ready for Instagram scraping!');
    
  } catch (e) {
    console.log('❌ Apify SDK error:', e.message);
  }
}

testApify();