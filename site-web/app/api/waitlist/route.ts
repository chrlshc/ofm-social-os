import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { z } from 'zod';

const rateLimiter = new RateLimiterMemory({ points: 30, duration: 60 });

const waitlistSchema = z.object({
  email: z.string().email(),
  handle_ig: z.string().optional(),
  niche: z.string().optional(),
  timezone: z.string().optional(),
  consent: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

  try {
    await rateLimiter.consume(ip);
  } catch (err) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }
  
  const result = waitlistSchema.safeParse(payload);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // For now, just log the data and return success
  console.log('New waitlist signup:', result.data);

  return NextResponse.json(
    { message: 'Successfully joined the waitlist' },
    { status: 200 }
  );
}