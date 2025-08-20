import * as dotenv from 'dotenv';
dotenv.config();

import { needsRefresh } from '../src/server/auth/token-manager';
import { createLogEntry, createErrorLogEntry } from '../src/server/logging/structured-logger';

console.log('🧪 Testing Production Features...\n');

// Test 1: Token refresh check
console.log('1. Testing token refresh logic:');
const now = new Date();
const in10Minutes = new Date(now.getTime() + 10 * 60 * 1000);
const in3Minutes = new Date(now.getTime() + 3 * 60 * 1000);

console.log('  - Token expiring in 10 minutes:', needsRefresh(in10Minutes) ? '❌ Needs refresh' : '✅ Still valid');
console.log('  - Token expiring in 3 minutes:', needsRefresh(in3Minutes) ? '✅ Needs refresh' : '❌ Should refresh');
console.log('  - Expired token:', needsRefresh(new Date(now.getTime() - 1000)) ? '✅ Needs refresh' : '❌ Should refresh');

// Test 2: Canonical logging
console.log('\n2. Testing canonical log format:');
const successLog = createLogEntry('reddit', 'Post published successfully', {
  code: 'SUCCESS',
  http_status: 200,
  latency_ms: 1250,
  correlation_id: 'test-123',
  externalId: 't3_abc123'
});
console.log('Success log:', JSON.stringify(successLog, null, 2));

// Test 3: Error logging with sanitization
console.log('\n3. Testing error log with sanitization:');
const testError = new Error('Rate limit exceeded');
(testError as any).code = 'RATE_LIMIT';
(testError as any).response = { status: 429 };

const errorLog = createErrorLogEntry('reddit', testError, {
  access_token: 'SECRET_TOKEN_123', // Should be sanitized
  correlation_id: 'test-456',
  attempt: 2
});
console.log('Error log (token should be [REDACTED]):', JSON.stringify(errorLog, null, 2));

// Test 4: Environment variables
console.log('\n4. Checking new environment variables:');
const envVars = [
  'REDDIT_USER_AGENT',
  'GRAPH_API_VERSION'
];

envVars.forEach(varName => {
  const value = process.env[varName];
  console.log(`  - ${varName}: ${value ? `✅ ${value}` : '❌ Not set'}`);
});

console.log('\n✨ Production features test complete!');