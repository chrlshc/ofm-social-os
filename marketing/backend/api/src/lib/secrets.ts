import { randomBytes, createCipher, createDecipher, scrypt } from 'crypto';
import { promisify } from 'util';
import { env } from './env';
import { loggers } from './logger';
import { redisUtils } from './redis';

const logger = loggers.auth.child({ component: 'secrets' });
const scryptAsync = promisify(scrypt);

interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
}

export class SecretsManager {
  private masterKey: Buffer | null = null;

  constructor() {
    this.initializeMasterKey();
  }

  private async initializeMasterKey(): Promise<void> {
    try {
      // Use environment-based master key or generate one
      const masterKeyEnv = process.env.MASTER_ENCRYPTION_KEY;
      
      if (masterKeyEnv) {
        this.masterKey = Buffer.from(masterKeyEnv, 'hex');
        if (this.masterKey.length !== 32) {
          throw new Error('MASTER_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
        }
      } else {
        // Generate ephemeral key (not recommended for production)
        this.masterKey = randomBytes(32);
        logger.warn('Using ephemeral encryption key. Set MASTER_ENCRYPTION_KEY for persistence.');
      }
      
      logger.info('Secrets manager initialized');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize secrets manager');
      throw error;
    }
  }

  async encrypt(plaintext: string, purpose: string = 'generic'): Promise<EncryptedData> {
    if (!this.masterKey) {
      throw new Error('Secrets manager not initialized');
    }

    try {
      const salt = randomBytes(16);
      const iv = randomBytes(16);
      
      // Derive key from master key + salt + purpose
      const key = await scryptAsync(`${this.masterKey.toString('hex')}:${purpose}`, salt, 32) as Buffer;
      
      const cipher = createCipher('aes-256-gcm', key);
      cipher.setAAD(Buffer.from(purpose, 'utf8'));
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted: encrypted + ':' + authTag.toString('hex'),
        iv: iv.toString('hex'),
        salt: salt.toString('hex')
      };
    } catch (error) {
      logger.error({ err: error, purpose }, 'Encryption failed');
      throw new Error('Encryption failed');
    }
  }

  async decrypt(encryptedData: EncryptedData, purpose: string = 'generic'): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Secrets manager not initialized');
    }

    try {
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      
      const [encryptedText, authTagHex] = encryptedData.encrypted.split(':');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      // Derive same key
      const key = await scryptAsync(`${this.masterKey.toString('hex')}:${purpose}`, salt, 32) as Buffer;
      
      const decipher = createDecipher('aes-256-gcm', key);
      decipher.setAAD(Buffer.from(purpose, 'utf8'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error({ err: error, purpose }, 'Decryption failed');
      throw new Error('Decryption failed');
    }
  }

  async encryptToken(token: string, platform: string, accountId: string): Promise<EncryptedData> {
    const purpose = `token:${platform}:${accountId}`;
    return this.encrypt(token, purpose);
  }

  async decryptToken(encryptedData: EncryptedData, platform: string, accountId: string): Promise<string> {
    const purpose = `token:${platform}:${accountId}`;
    return this.decrypt(encryptedData, purpose);
  }

  // Rotate encryption key (for key rotation workflows)
  async rotateKey(newMasterKey: string): Promise<void> {
    if (!newMasterKey || Buffer.from(newMasterKey, 'hex').length !== 32) {
      throw new Error('New master key must be 32 bytes (64 hex chars)');
    }

    const oldKey = this.masterKey;
    this.masterKey = Buffer.from(newMasterKey, 'hex');
    
    logger.info('Encryption key rotated successfully');
    
    // TODO: Re-encrypt existing tokens with new key
    // This would require database migration
  }

  // Generate secure random tokens
  generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  // Cache encrypted tokens in Redis with TTL
  async cacheEncryptedToken(
    key: string, 
    token: string, 
    platform: string, 
    accountId: string, 
    ttlSeconds: number = 3600
  ): Promise<void> {
    const encrypted = await this.encryptToken(token, platform, accountId);
    await redisUtils.set(`encrypted_token:${key}`, encrypted, ttlSeconds);
  }

  async getCachedToken(
    key: string, 
    platform: string, 
    accountId: string
  ): Promise<string | null> {
    const encrypted = await redisUtils.get<EncryptedData>(`encrypted_token:${key}`);
    if (!encrypted) return null;
    
    return this.decryptToken(encrypted, platform, accountId);
  }
}

// Singleton instance
export const secretsManager = new SecretsManager();

// Validation functions for secrets format
export const secretValidators = {
  instagram: {
    clientId: (id: string) => /^\d+$/.test(id) && id.length >= 10,
    clientSecret: (secret: string) => /^[a-f0-9]{32}$/.test(secret),
  },
  
  tiktok: {
    clientKey: (key: string) => /^[a-z0-9]{20,}$/.test(key),
    clientSecret: (secret: string) => /^[a-zA-Z0-9]{40,}$/.test(secret),
  },
  
  x: {
    apiKey: (key: string) => /^[a-zA-Z0-9]{25}$/.test(key),
    apiSecret: (secret: string) => /^[a-zA-Z0-9]{50}$/.test(secret),
  },
  
  reddit: {
    clientId: (id: string) => /^[a-zA-Z0-9_-]{14}$/.test(id),
    clientSecret: (secret: string) => /^[a-zA-Z0-9_-]{27}$/.test(secret),
  },
  
  openai: {
    apiKey: (key: string) => /^sk-[a-zA-Z0-9]{48}$/.test(key),
  },
  
  anthropic: {
    apiKey: (key: string) => /^sk-ant-[a-zA-Z0-9_-]{95}$/.test(key),
  }
};

// Validate all platform secrets
export function validatePlatformSecrets(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Instagram
  if (!secretValidators.instagram.clientId(env.INSTAGRAM_CLIENT_ID)) {
    errors.push('INSTAGRAM_CLIENT_ID format invalid');
  }
  if (!secretValidators.instagram.clientSecret(env.INSTAGRAM_CLIENT_SECRET)) {
    errors.push('INSTAGRAM_CLIENT_SECRET format invalid');
  }
  
  // TikTok
  if (!secretValidators.tiktok.clientKey(env.TIKTOK_CLIENT_KEY)) {
    errors.push('TIKTOK_CLIENT_KEY format invalid');
  }
  if (!secretValidators.tiktok.clientSecret(env.TIKTOK_CLIENT_SECRET)) {
    errors.push('TIKTOK_CLIENT_SECRET format invalid');
  }
  
  // X
  if (!secretValidators.x.apiKey(env.X_API_KEY)) {
    errors.push('X_API_KEY format invalid');
  }
  if (!secretValidators.x.apiSecret(env.X_API_SECRET)) {
    errors.push('X_API_SECRET format invalid');
  }
  
  // Reddit
  if (!secretValidators.reddit.clientId(env.REDDIT_CLIENT_ID)) {
    errors.push('REDDIT_CLIENT_ID format invalid');
  }
  if (!secretValidators.reddit.clientSecret(env.REDDIT_CLIENT_SECRET)) {
    errors.push('REDDIT_CLIENT_SECRET format invalid');
  }
  
  // Optional LLM providers
  if (env.OPENAI_API_KEY && !secretValidators.openai.apiKey(env.OPENAI_API_KEY)) {
    errors.push('OPENAI_API_KEY format invalid');
  }
  if (env.ANTHROPIC_API_KEY && !secretValidators.anthropic.apiKey(env.ANTHROPIC_API_KEY)) {
    errors.push('ANTHROPIC_API_KEY format invalid');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}