import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import crypto from 'crypto';
import { env } from './env';

// KMS client singleton
let kmsClient: KMSClient | null = null;

function getKMSClient(): KMSClient {
  if (!kmsClient) {
    kmsClient = new KMSClient({
      region: env.AWS_REGION || 'us-east-1',
    });
  }
  return kmsClient;
}

// Use KMS if available, fallback to local encryption
const useKMS = !!(env.AWS_KMS_KEY_ID && env.AWS_REGION);

/**
 * Encrypt data using AWS KMS (if available) or local AES-256-GCM
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (useKMS) {
    try {
      const client = getKMSClient();
      const command = new EncryptCommand({
        KeyId: env.AWS_KMS_KEY_ID!,
        Plaintext: Buffer.from(plaintext),
      });
      
      const response = await client.send(command);
      if (!response.CiphertextBlob) {
        throw new Error('KMS encryption failed');
      }
      
      // Return base64 encoded ciphertext with KMS prefix
      return `kms:${Buffer.from(response.CiphertextBlob).toString('base64')}`;
    } catch (error) {
      console.error('KMS encryption error, falling back to local:', error);
      // Fallback to local encryption
    }
  }
  
  // Local AES-256-GCM encryption
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(env.CRYPTO_MASTER_KEY, 'base64').slice(0, 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + authTag + encrypted data
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ]);
  
  // Return with local prefix
  return `local:${combined.toString('base64')}`;
}

/**
 * Decrypt data using AWS KMS (if available) or local AES-256-GCM
 */
export async function decrypt(encryptedData: string): Promise<string> {
  // Check encryption method
  if (encryptedData.startsWith('kms:')) {
    const ciphertext = encryptedData.slice(4);
    
    try {
      const client = getKMSClient();
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, 'base64'),
      });
      
      const response = await client.send(command);
      if (!response.Plaintext) {
        throw new Error('KMS decryption failed');
      }
      
      return Buffer.from(response.Plaintext).toString('utf8');
    } catch (error) {
      console.error('KMS decryption error:', error);
      throw new Error('Failed to decrypt KMS data');
    }
  }
  
  // Local decryption
  const data = encryptedData.startsWith('local:') 
    ? encryptedData.slice(6) 
    : encryptedData;
  
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(env.CRYPTO_MASTER_KEY, 'base64').slice(0, 32);
  
  const combined = Buffer.from(data, 'base64');
  
  // Extract components
  const iv = combined.slice(0, 16);
  const authTag = combined.slice(16, 32);
  const encrypted = combined.slice(32);
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate a new data encryption key (for future use)
 */
export async function generateDataKey(): Promise<{ plaintext: string; encrypted: string }> {
  if (useKMS) {
    // Generate DEK using KMS
    // This would be used for envelope encryption
    // For now, we'll just generate a local key
  }
  
  // Generate a random 256-bit key
  const key = crypto.randomBytes(32);
  const plaintext = key.toString('base64');
  const encrypted = await encrypt(plaintext);
  
  return { plaintext, encrypted };
}

/**
 * Rotate encryption (re-encrypt with new key/method)
 */
export async function rotateEncryption(encryptedData: string): Promise<string> {
  const decrypted = await decrypt(encryptedData);
  return encrypt(decrypted);
}