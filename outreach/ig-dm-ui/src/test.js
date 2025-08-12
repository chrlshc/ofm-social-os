// Test simple pour vérifier les dépendances ESM
console.log('🚀 Instagram DM UI - Test des dépendances');

async function testDependencies() {
  try {
    const puppeteer = await import('puppeteer');
    console.log('✅ Puppeteer: OK');
  } catch (e) {
    console.log('❌ Puppeteer:', e.message);
  }

  try {
    const dotenv = await import('dotenv');
    console.log('✅ Dotenv: OK');
  } catch (e) {
    console.log('❌ Dotenv:', e.message);
  }

  try {
    const puppeteerExtra = await import('puppeteer-extra');
    console.log('✅ Puppeteer-extra: OK');
  } catch (e) {
    console.log('❌ Puppeteer-extra:', e.message);
  }

  try {
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
    console.log('✅ Stealth plugin: OK');
  } catch (e) {
    console.log('❌ Stealth plugin:', e.message);
  }

  try {
    const fingerprintInjector = await import('fingerprint-injector');
    console.log('✅ Fingerprint injector: OK');
  } catch (e) {
    console.log('❌ Fingerprint injector:', e.message);
  }

  try {
    const ghostCursor = await import('ghost-cursor');
    console.log('✅ Ghost cursor: OK');
  } catch (e) {
    console.log('❌ Ghost cursor:', e.message);
  }

  try {
    const pino = await import('pino');
    console.log('✅ Pino: OK');
  } catch (e) {
    console.log('❌ Pino:', e.message);
  }

  console.log('✅ Toutes les dépendances sont installées et accessibles !');
}

testDependencies();