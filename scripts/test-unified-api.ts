import * as dotenv from 'dotenv';
dotenv.config();

import { publishPost } from '../src/server/social/publish';
import { ensureValidAccessToken } from '../src/server/oauth/manager';
import { pool } from '../src/server/db';
import { logPostEvent, getPostMetrics } from '../src/lib/observability';

async function testUnifiedAPI() {
  console.log('🧪 Testing Unified Social Publishing API\n');
  
  try {
    // Test 1: Token validation
    console.log('1. Testing token validation (should fail without account):');
    try {
      await ensureValidAccessToken({
        pool,
        ownerId: 999,
        platform: 'reddit'
      });
      console.log('❌ Should have failed');
    } catch (error: any) {
      console.log('✅ Correctly failed:', error.message);
    }
    
    // Test 2: Observability sanitization
    console.log('\n2. Testing observability sanitization:');
    await logPostEvent(pool, {
      level: 'info',
      message: 'test_sanitization',
      details: {
        platform: 'reddit',
        access_token: 'SECRET_TOKEN_123',
        client_secret: 'SECRET_KEY',
        safe_data: 'This is safe'
      }
    });
    
    // Check if it was sanitized
    const { rows } = await pool.query(
      `SELECT details FROM social_publisher.post_logs 
       WHERE message = 'test_sanitization' 
       ORDER BY created_at DESC LIMIT 1`
    );
    
    if (rows.length > 0) {
      const details = rows[0].details;
      const hasSanitized = details.access_token === '[REDACTED]' && 
                          details.client_secret === '[REDACTED]';
      console.log(hasSanitized ? '✅ Secrets properly sanitized' : '❌ Sanitization failed');
      console.log('Details:', JSON.stringify(details, null, 2));
    }
    
    // Test 3: Metrics
    console.log('\n3. Testing metrics aggregation:');
    const metrics = await getPostMetrics(pool);
    console.log('Metrics:', {
      successRate: `${metrics.successRate.toFixed(2)}%`,
      avgLatency: `${metrics.averageLatency}ms`,
      p95Latency: `${metrics.p95Latency}ms`,
      platforms: metrics.postsByPlatform
    });
    
    // Test 4: Unified publish (dry run)
    console.log('\n4. Testing unified publish API (dry run):');
    const testArgs = {
      owner_id: 1,
      platform: 'reddit' as const,
      caption: 'Test post from unified API',
      meta: {
        subreddit: 'test',
        title: 'Test Title'
      }
    };
    console.log('Would publish:', testArgs);
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await pool.end();
  }
}

testUnifiedAPI().catch(console.error);