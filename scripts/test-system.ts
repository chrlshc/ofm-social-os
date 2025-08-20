import * as dotenv from 'dotenv';
dotenv.config();

import { testConnection } from '../src/server/db';
import { encrypt, decrypt } from '../src/lib/crypto';

async function testSystem() {
  console.log('🔍 Testing OFM Social Publishing System...\n');
  
  // Test 1: Crypto
  console.log('1. Testing encryption/decryption...');
  try {
    const testData = 'SECRET_TOKEN_123';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    
    if (decrypted === testData) {
      console.log('✅ Encryption/decryption working correctly');
    } else {
      console.log('❌ Encryption/decryption failed');
    }
  } catch (error: any) {
    console.log('❌ Crypto error:', error.message);
  }
  
  // Test 2: Database
  console.log('\n2. Testing database connection...');
  const dbConnected = await testConnection();
  if (dbConnected) {
    console.log('✅ Database connection successful');
  } else {
    console.log('❌ Database connection failed');
    console.log('   Make sure DATABASE_URL_OFM_* is set in .env');
  }
  
  // Test 3: Environment
  console.log('\n3. Checking environment variables...');
  const requiredEnvVars = [
    'CRYPTO_MASTER_KEY',
    'DATABASE_URL_OFM_PRODUCTION'
  ];
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length === 0) {
    console.log('✅ All required environment variables are set');
  } else {
    console.log('❌ Missing environment variables:', missingVars.join(', '));
  }
  
  // Test 4: API endpoints
  console.log('\n4. API endpoints to test:');
  console.log('   - GET  http://localhost:3000/api/health');
  console.log('   - POST http://localhost:3000/api/post/publish-now');
  console.log('   - POST http://localhost:3000/api/post/schedule');
  console.log('   - GET  http://localhost:3000/api/posts/list');
  
  console.log('\n🚀 To start the system:');
  console.log('   Terminal 1: npm run dev');
  console.log('   Terminal 2: npm run worker');
  
  process.exit(0);
}

testSystem().catch(console.error);