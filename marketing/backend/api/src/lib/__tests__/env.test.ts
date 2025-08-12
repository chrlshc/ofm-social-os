import { env } from '../env';

describe('Environment Configuration', () => {
  it('should validate required environment variables', () => {
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.REDIS_URL).toBeDefined();
    expect(env.NODE_ENV).toBeDefined();
    expect(env.PORT).toBeDefined();
  });

  it('should have valid platform API keys', () => {
    expect(env.INSTAGRAM_CLIENT_ID).toBeDefined();
    expect(env.INSTAGRAM_CLIENT_SECRET).toBeDefined();
    expect(env.TIKTOK_CLIENT_KEY).toBeDefined();
    expect(env.TIKTOK_CLIENT_SECRET).toBeDefined();
    expect(env.X_API_KEY).toBeDefined();
    expect(env.X_API_SECRET).toBeDefined();
    expect(env.REDDIT_CLIENT_ID).toBeDefined();
    expect(env.REDDIT_CLIENT_SECRET).toBeDefined();
  });

  it('should set defaults for optional variables', () => {
    expect(env.LOG_LEVEL).toBe('warn'); // Set in test-setup.ts
    expect(typeof env.PORT).toBe('number');
    expect(env.PORT).toBeGreaterThan(0);
  });
});