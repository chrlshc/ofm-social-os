import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// GET /api/social/auth/instagram - Initiate Instagram OAuth
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');
  
  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }
  
  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString('base64url');
  
  // Instagram OAuth URL
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_URL}/api/social/auth/instagram/callback`,
    scope: 'instagram_basic,instagram_content_publish,instagram_manage_insights',
    response_type: 'code',
    state: `${state}:${userId}` // Include userId in state
  });
  
  const authUrl = `https://api.instagram.com/oauth/authorize?${params}`;
  
  // Set state in cookie for validation
  const response = NextResponse.redirect(authUrl);
  response.cookies.set('instagram_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });
  
  return response;
}