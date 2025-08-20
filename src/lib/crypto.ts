import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

function getMasterKey(): Buffer {
  const key = process.env.CRYPTO_MASTER_KEY;
  if (!key) {
    throw new Error('CRYPTO_MASTER_KEY not set');
  }
  // Decode base64 key to buffer
  return Buffer.from(key, 'base64');
}

export function encrypt(plaintext: string): string {
  const masterKey = getMasterKey();
  
  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  
  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  // Get auth tag
  const tag = cipher.getAuthTag();
  
  // Combine iv + tag + encrypted
  const combined = Buffer.concat([iv, tag, encrypted]);
  
  // Return base64
  return combined.toString('base64');
}

export function decrypt(ciphertext: string): string {
  const masterKey = getMasterKey();
  
  // Decode from base64
  const combined = Buffer.from(ciphertext, 'base64');
  
  // Extract components
  const iv = combined.slice(0, IV_LENGTH);
  const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(tag);
  
  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}