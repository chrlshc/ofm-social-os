import IORedis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

// Redis client with connection retry
const redis = new IORedis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxLoadingTimeout: 5000,
});

// Event handlers
redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error) => {
  logger.error({ err: error }, 'Redis connection error');
});

redis.on('ready', () => {
  logger.debug('Redis ready for operations');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Utility functions with error handling
export const redisUtils = {
  async set(key: string, value: string | object, ttlSeconds?: number): Promise<void> {
    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, serializedValue);
      } else {
        await redis.set(key, serializedValue);
      }
    } catch (error) {
      logger.error({ err: error, key }, 'Redis SET failed');
      throw error;
    }
  },

  async get<T = string>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      if (!value) return null;
      
      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error({ err: error, key }, 'Redis GET failed');
      throw error;
    }
  },

  async del(key: string): Promise<number> {
    try {
      return await redis.del(key);
    } catch (error) {
      logger.error({ err: error, key }, 'Redis DEL failed');
      throw error;
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ err: error, key }, 'Redis EXISTS failed');
      throw error;
    }
  },
};

export { redis };