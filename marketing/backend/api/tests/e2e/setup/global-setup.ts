// Global setup for Playwright E2E tests
// Sets up test database, starts services, creates test data

import { chromium, FullConfig } from '@playwright/test';
import { db } from '../../src/lib/db';
import { redis } from '../../src/lib/redis';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test setup...');

  try {
    // 1. Clean up any existing test data
    await cleanupTestData();

    // 2. Set up test database
    await setupTestDatabase();

    // 3. Set up test Redis data
    await setupTestRedis();

    // 4. Create test fixtures
    await createTestFixtures();

    // 5. Start mock services if needed
    if (process.env.USE_MOCK_SERVICES === 'true') {
      await startMockServices();
    }

    // 6. Save authentication state for authenticated tests
    await setupAuthState();

    console.log('✅ E2E test setup completed');

  } catch (error) {
    console.error('❌ E2E test setup failed:', error);
    throw error;
  }
}

async function cleanupTestData() {
  console.log('🧹 Cleaning up existing test data...');

  // Clean up test creators, accounts, posts, etc.
  await db.query(`
    DELETE FROM posts WHERE creator_id IN (
      SELECT id FROM creators WHERE display_name LIKE 'E2E Test%'
    )
  `);

  await db.query(`
    DELETE FROM accounts WHERE creator_id IN (
      SELECT id FROM creators WHERE display_name LIKE 'E2E Test%'
    )
  `);

  await db.query(`
    DELETE FROM creators WHERE display_name LIKE 'E2E Test%'
  `);

  // Clean up test webhook events
  await db.query(`
    DELETE FROM webhook_events WHERE payload->>'test' = 'true'
  `);

  // Clean up test LLM usage
  await db.query(`
    DELETE FROM llm_usage WHERE operation_type LIKE 'test%'
  `);

  // Clean up Redis test keys
  const testKeys = await redis.keys('test:*');
  if (testKeys.length > 0) {
    await redis.del(...testKeys);
  }

  console.log('✅ Test data cleanup completed');
}

async function setupTestDatabase() {
  console.log('🗄️ Setting up test database...');

  // Run any pending migrations
  // This would typically use your migration runner
  // For now, just ensure tables exist

  // Verify critical tables exist
  const tables = [
    'creators', 'accounts', 'posts', 'assets', 'variants',
    'llm_budgets', 'llm_usage', 'webhook_events'
  ];

  for (const table of tables) {
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = $1
      )
    `, [table]);

    if (!result.rows[0].exists) {
      throw new Error(`Required table '${table}' does not exist`);
    }
  }

  console.log('✅ Database setup verified');
}

async function setupTestRedis() {
  console.log('🔴 Setting up test Redis...');

  // Set up test configuration
  await redis.hset('test:config', {
    'webhook_secret_tiktok': 'test-secret',
    'webhook_secret_instagram': 'test-secret',
    'oauth_state_ttl': '3600'
  });

  // Set up test rate limits
  await redis.set('test:rate_limits_enabled', 'true', 'EX', 3600);

  console.log('✅ Redis setup completed');
}

async function createTestFixtures() {
  console.log('🏗️ Creating test fixtures...');

  // Create test creators
  const testCreators = [
    {
      id: 'test-creator-e2e',
      display_name: 'E2E Test Creator',
      email: 'test-e2e@example.com',
      niche: 'testing'
    },
    {
      id: 'test-creator-oauth',
      display_name: 'E2E OAuth Test Creator',
      email: 'test-oauth@example.com',
      niche: 'oauth-testing'
    }
  ];

  for (const creator of testCreators) {
    await db.query(`
      INSERT INTO creators (id, display_name, email, niche)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        niche = EXCLUDED.niche
    `, [creator.id, creator.display_name, creator.email, creator.niche]);
  }

  // Create test accounts for each platform
  const platforms = ['instagram', 'tiktok', 'x', 'reddit'];
  
  for (const creator of testCreators) {
    for (const platform of platforms) {
      await db.query(`
        INSERT INTO accounts (id, creator_id, platform, handle, meta)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (creator_id, platform, handle) DO UPDATE SET
          meta = EXCLUDED.meta
      `, [
        `test-account-${platform}-${creator.id}`,
        creator.id,
        platform,
        `testuser_${platform}`,
        JSON.stringify({
          test: true,
          platform,
          ig_user_id: platform === 'instagram' ? '123456789' : null,
          page_id: platform === 'instagram' ? '987654321' : null
        })
      ]);
    }
  }

  // Create test assets and variants
  const testAsset = {
    id: 'test-asset-e2e',
    creator_id: 'test-creator-e2e',
    kind: 'video',
    s3_url: 'https://test-bucket.s3.amazonaws.com/test-video.mp4',
    width: 1920,
    height: 1080,
    duration_ms: 30000,
    sha256: 'test-hash-1234567890'
  };

  await db.query(`
    INSERT INTO assets (id, creator_id, kind, s3_url, width, height, duration_ms, sha256, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (sha256) DO NOTHING
  `, [
    testAsset.id, testAsset.creator_id, testAsset.kind, testAsset.s3_url,
    testAsset.width, testAsset.height, testAsset.duration_ms, testAsset.sha256,
    JSON.stringify({ test: true, nsfw_score: 0.1 })
  ]);

  // Create variants
  const variants = [
    { type: '9x16', s3_url: 'https://test-bucket.s3.amazonaws.com/test-video-9x16.mp4' },
    { type: '1x1', s3_url: 'https://test-bucket.s3.amazonaws.com/test-video-1x1.mp4' },
    { type: '16x9', s3_url: 'https://test-bucket.s3.amazonaws.com/test-video-16x9.mp4' }
  ];

  for (const variant of variants) {
    await db.query(`
      INSERT INTO variants (id, asset_id, type, s3_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [
      `test-variant-${variant.type}`,
      testAsset.id,
      variant.type,
      variant.s3_url
    ]);
  }

  // Set up test budgets
  for (const creator of testCreators) {
    await db.query(`
      INSERT INTO llm_budgets (creator_id, month_year, usd_limit, soft_limit_pct, hard_stop)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (creator_id, month_year) DO UPDATE SET
        usd_limit = EXCLUDED.usd_limit
    `, [creator.id, '2025-01', 1000.00, 80, true]);
  }

  console.log('✅ Test fixtures created');
}

async function startMockServices() {
  console.log('🎭 Starting mock services...');

  // This would start mock OAuth providers, webhook servers, etc.
  // For now, we'll use nock or similar in individual tests

  console.log('✅ Mock services ready');
}

async function setupAuthState() {
  console.log('🔐 Setting up authentication state...');

  // Create a browser instance to generate auth state
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Generate test JWT token
    const testToken = generateTestJWT('test-creator-e2e');

    // Set up authentication state
    await context.addCookies([
      {
        name: 'auth_token',
        value: testToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false
      }
    ]);

    // Save authentication state for reuse in tests
    await context.storageState({ 
      path: './tests/e2e/fixtures/auth-state.json' 
    });

    console.log('✅ Authentication state saved');

  } finally {
    await context.close();
    await browser.close();
  }
}

function generateTestJWT(creatorId: string): string {
  // In a real implementation, use your JWT library
  // For tests, we can use a simple base64-encoded payload
  const payload = {
    sub: creatorId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    role: 'creator',
    test: true
  };

  // Simple base64 encoding for tests (not secure, just for testing)
  return 'test.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.test';
}

export default globalSetup;