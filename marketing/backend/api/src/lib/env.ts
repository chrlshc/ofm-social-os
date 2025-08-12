import { z } from 'zod';

// Custom validators for security-sensitive fields
const hexKeyValidator = (length: number) => 
  z.string().regex(new RegExp(`^[a-f0-9]{${length}}$`), `Must be ${length} hex characters`);

const envSchema = z.object({
  // Database & Cache (REQUIRED)
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL')
    .refine(url => url.startsWith('postgresql://'), 'DATABASE_URL must use postgresql:// scheme'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis URL')
    .refine(url => url.startsWith('redis://'), 'REDIS_URL must use redis:// scheme'),
  
  // Security & Encryption (REQUIRED for production)
  MASTER_ENCRYPTION_KEY: z.string().optional()
    .refine((key) => {
      if (process.env.NODE_ENV === 'production' && !key) {
        return false;
      }
      if (key && !/^[a-f0-9]{64}$/.test(key)) {
        return false;
      }
      return true;
    }, 'MASTER_ENCRYPTION_KEY must be 64 hex characters (32 bytes) and is required in production'),
  
  WEBHOOK_SECRET: hexKeyValidator(64).optional()
    .refine((secret) => process.env.NODE_ENV !== 'production' || secret, 
      'WEBHOOK_SECRET required in production'),
  
  META_VERIFY_TOKEN: z.string().optional()
    .refine((token) => process.env.NODE_ENV !== 'production' || token,
      'META_VERIFY_TOKEN required in production'),
  
  // Platform APIs with format validation
  INSTAGRAM_CLIENT_ID: z.string()
    .regex(/^\d{15,16}$/, 'INSTAGRAM_CLIENT_ID must be 15-16 digits'),
  INSTAGRAM_CLIENT_SECRET: z.string()
    .regex(/^[a-f0-9]{32}$/, 'INSTAGRAM_CLIENT_SECRET must be 32 hex characters'),
  
  TIKTOK_CLIENT_KEY: z.string()
    .regex(/^[a-z0-9]{20,30}$/, 'TIKTOK_CLIENT_KEY invalid format'),
  TIKTOK_CLIENT_SECRET: z.string()
    .regex(/^[a-zA-Z0-9]{40,60}$/, 'TIKTOK_CLIENT_SECRET invalid format'),
  
  X_API_KEY: z.string()
    .regex(/^[a-zA-Z0-9]{25}$/, 'X_API_KEY must be exactly 25 alphanumeric characters'),
  X_API_SECRET: z.string()
    .regex(/^[a-zA-Z0-9]{50}$/, 'X_API_SECRET must be exactly 50 alphanumeric characters'),
  
  REDDIT_CLIENT_ID: z.string()
    .regex(/^[a-zA-Z0-9_-]{14}$/, 'REDDIT_CLIENT_ID invalid format'),
  REDDIT_CLIENT_SECRET: z.string()
    .regex(/^[a-zA-Z0-9_-]{27}$/, 'REDDIT_CLIENT_SECRET invalid format'),
  
  // LLM Providers (optional with format validation)
  OPENAI_API_KEY: z.string()
    .regex(/^sk-[a-zA-Z0-9]{48,}$/, 'OPENAI_API_KEY invalid format')
    .optional(),
  ANTHROPIC_API_KEY: z.string()
    .regex(/^sk-ant-[a-zA-Z0-9_-]{95,}$/, 'ANTHROPIC_API_KEY invalid format')
    .optional(),
  
  // AWS Storage (optional)
  AWS_ACCESS_KEY_ID: z.string()
    .regex(/^AKIA[A-Z0-9]{16}$/, 'AWS_ACCESS_KEY_ID invalid format')
    .optional(),
  AWS_SECRET_ACCESS_KEY: z.string()
    .min(40, 'AWS_SECRET_ACCESS_KEY too short')
    .optional(),
  S3_BUCKET: z.string()
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'S3_BUCKET invalid format')
    .optional(),
  AWS_REGION: z.string().default('us-east-1'),
  
  // External Services
  REDDIT_SERVICE_URL: z.string().url().optional(),
  REDDIT_SERVICE_KEY: z.string().min(16).optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  
  // Kill Switches
  DISABLE_INSTAGRAM: z.string().transform(val => val === 'true').default('false'),
  DISABLE_TIKTOK: z.string().transform(val => val === 'true').default('false'),
  DISABLE_X: z.string().transform(val => val === 'true').default('false'),
  DISABLE_REDDIT: z.string().transform(val => val === 'true').default('false'),
  
  // Rate Limiting
  MAX_REQUESTS_PER_MINUTE: z.string().transform(Number).pipe(z.number().int().min(1)).default('60'),
  MAX_CONCURRENT_PUBLISHES: z.string().transform(Number).pipe(z.number().int().min(1)).default('10'),
  
  // Observability (optional)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('ofm-social-api'),
  
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().int().min(1000).max(65535)).default('3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  
  // Testing
  TEST_DATABASE_URL: z.string().url().optional(),
  TEST_REDIS_URL: z.string().url().optional(),
  MOCK_PLATFORM_APIS: z.string().transform(val => val === 'true').default('false'),
});

// Validate environment variables
let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingVars = error.errors.map(e => `- ${e.path.join('.')}: ${e.message}`).join('\n');
    console.error('❌ Environment validation failed:\n' + missingVars);
    process.exit(1);
  }
  throw error;
}

export { env };