import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// GET /api/social/auth/tiktok - Initiate TikTok OAuth
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('user_id');
  
  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }
  
  // Generate state and code verifier for PKCE
  const state = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  
  // Generate code challenge
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  // TikTok OAuth URL
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    redirect_uri: `${process.env.NEXT_PUBLIC_URL}/api/social/auth/tiktok/callback`,
    scope: 'user.info.basic,video.publish,video.upload',
    response_type: 'code',
    state: `${state}:${userId}`,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  
  const authUrl = `https://www.tiktok.com/v2/auth/authorize?${params}`;
  
  // Set state and code verifier in cookies
  const response = NextResponse.redirect(authUrl);
  response.cookies.set('tiktok_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });
  response.cookies.set('tiktok_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600 // 10 minutes
  });
  
  return response;
}