import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

// Common schemas
export const userIdSchema = z.number().int().positive();
export const platformSchema = z.enum(['reddit', 'instagram', 'tiktok']);
export const dateSchema = z.string().datetime().or(z.date()).transform(val => new Date(val));

// OAuth schemas
export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
});

// Social accounts schemas
export const deleteAccountSchema = z.object({
  account_id: z.number().int().positive(),
});

// Publish schemas
export const publishPostSchema = z.object({
  platform: platformSchema,
  caption: z.string().min(1).max(10000),
  media_url: z.string().url().optional(),
  scheduled_at: dateSchema.optional(),
  platform_specific: z.record(z.string(), z.any()).default({}),
});

export const getPostsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']).optional(),
  platform: platformSchema.optional(),
});

// Stripe Connect schemas
export const stripeConnectSchema = z.object({
  email: z.string().email(),
  return_url: z.string().url().optional(),
});

// Validation helper
export async function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<{ data: T } | { error: NextResponse }> {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    return {
      error: NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      ),
    };
  }
  
  return { data: result.data };
}

// Sanitization helpers
export function sanitizeHtml(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export function sanitizeLog(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'access_token',
    'refresh_token',
    'api_key',
    'client_secret',
  ];
  
  const sanitized = { ...data };
  
  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeLog(sanitized[key]);
    }
  }
  
  return sanitized;
}