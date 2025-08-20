import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL_OFM_PRODUCTION: z.string().url(),
  CRYPTO_MASTER_KEY: z.string().min(32),
  
  // Authentication
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url().optional(),
  
  // Reddit OAuth
  REDDIT_CLIENT_ID: z.string().min(1),
  REDDIT_CLIENT_SECRET: z.string().min(1),
  REDDIT_USER_AGENT: z.string().min(1),
  REDDIT_REDIRECT_URI: z.string().url(),
  
  // Instagram OAuth
  INSTAGRAM_CLIENT_ID: z.string().min(1),
  INSTAGRAM_CLIENT_SECRET: z.string().min(1),
  
  // TikTok OAuth
  TIKTOK_CLIENT_KEY: z.string().min(1),
  TIKTOK_CLIENT_SECRET: z.string().min(1),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  
  // AWS (optional for now)
  AWS_REGION: z.string().optional(),
  AWS_KMS_KEY_ID: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_EMAIL: z.string().email().optional(),
  
  // App
  NEXT_PUBLIC_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsedEnv.data;

// Type-safe environment variables
export type Env = z.infer<typeof envSchema>;