import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL_OFM_PRODUCTION: z.string().default(''),
  CRYPTO_MASTER_KEY: z.string().default('default-key-for-build-only-not-for-production'),
  
  // Authentication
  NEXTAUTH_SECRET: z.string().default('default-secret-for-build-only'),
  NEXTAUTH_URL: z.string().default('https://huntaze.com'),
  
  // Reddit OAuth
  REDDIT_CLIENT_ID: z.string().default(''),
  REDDIT_CLIENT_SECRET: z.string().default(''),
  REDDIT_USER_AGENT: z.string().default('OFM Social OS/1.0'),
  REDDIT_REDIRECT_URI: z.string().default('https://huntaze.com/api/social/auth/reddit/callback'),
  
  // Instagram OAuth
  INSTAGRAM_CLIENT_ID: z.string().default(''),
  INSTAGRAM_CLIENT_SECRET: z.string().default(''),
  
  // TikTok OAuth
  TIKTOK_CLIENT_KEY: z.string().default(''),
  TIKTOK_CLIENT_SECRET: z.string().default(''),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  
  // AWS (optional for now)
  AWS_REGION: z.string().default('us-east-1'),
  AWS_KMS_KEY_ID: z.string().default(''),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  SES_FROM_EMAIL: z.string().default('charles@huntaze.com'),
  
  // App
  NEXT_PUBLIC_URL: z.string().default('https://huntaze.com'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Parse environment - always succeeds with defaults
export const env = envSchema.parse(process.env);

// Type-safe environment variables
export type Env = z.infer<typeof envSchema>;