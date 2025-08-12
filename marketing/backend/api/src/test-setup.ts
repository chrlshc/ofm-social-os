import { env } from './lib/env';

// Override environment for tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL || process.env.REDIS_URL;

// Disable OpenTelemetry in tests
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// Mock external services
jest.mock('./lib/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    disconnect: jest.fn(),
  },
  redisUtils: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  }
}));

// Increase timeout for tests
jest.setTimeout(30000);