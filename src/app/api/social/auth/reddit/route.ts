import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const REDDIT_REDIRECT_URI = process.env.REDDIT_REDIRECT_URI || 'http://localhost:3000/api/social/auth/reddit/callback';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');
  
  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }
  
  if (!REDDIT_CLIENT_ID) {
    return NextResponse.json({ error: 'Reddit client ID not configured' }, { status: 500 });
  }

  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString('base64url');
  
  // Build Reddit OAuth URL
  const params = new URLSearchParams({
    client_id: REDDIT_CLIENT_ID,
    response_type: 'code',
    state: state,
    redirect_uri: REDDIT_REDIRECT_URI,
    duration: 'permanent',
    scope: 'identity submit read'
  });

  const authUrl = `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  
  // Create response with cookies
  const response = NextResponse.redirect(authUrl);
  
  // Set cookies for state and user_id
  response.cookies.set('reddit_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });
  
  response.cookies.set('reddit_oauth_user', userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });
  
  return response;
}