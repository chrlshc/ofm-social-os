import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/server/db';
import { encrypt } from '@/lib/kms-crypto';
import { log } from '@/lib/observability';

// GET /api/social/auth/instagram/callback
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  if (error) {
    log('warn', 'Instagram OAuth error', { error });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=instagram_denied`);
  }
  
  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }
  
  // Validate state
  const cookieState = request.cookies.get('instagram_oauth_state')?.value;
  const [stateToken, userId] = state.split(':');
  
  if (!cookieState || cookieState !== stateToken) {
    log('warn', 'Instagram OAuth state mismatch', { expected: cookieState, received: stateToken });
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }
  
  try {
    // Exchange code for access token
    const tokenUrl = 'https://api.instagram.com/oauth/access_token';
    const tokenData = new URLSearchParams({
      client_id: process.env.INSTAGRAM_CLIENT_ID!,
      client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_URL}/api/social/auth/instagram/callback`,
      code
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenData
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      log('error', 'Instagram token exchange failed', { error });
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=instagram_token_failed`);
    }
    
    const tokenResult = await tokenResponse.json();
    const { access_token, user_id: igUserId } = tokenResult;
    
    // Exchange short-lived token for long-lived token
    const longLivedUrl = `https://graph.instagram.com/access_token`;
    const longLivedParams = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
      access_token
    });
    
    const longLivedResponse = await fetch(`${longLivedUrl}?${longLivedParams}`);
    const longLivedData = await longLivedResponse.json();
    
    if (!longLivedData.access_token) {
      throw new Error('Failed to get long-lived token');
    }
    
    // Get user info
    const userInfoUrl = `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${longLivedData.access_token}`;
    const userInfoResponse = await fetch(userInfoUrl);
    const userInfo = await userInfoResponse.json();
    
    // Encrypt the long-lived token
    const encryptedToken = encrypt(longLivedData.access_token);
    
    // Calculate expiration (60 days for long-lived tokens)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);
    
    // Store in database
    await pool.query(
      `INSERT INTO social_publisher.platform_accounts 
       (user_id, platform, platform_user_id, username, access_token, refresh_token, expires_at, scopes, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, platform) 
       DO UPDATE SET 
         platform_user_id = EXCLUDED.platform_user_id,
         username = EXCLUDED.username,
         access_token = EXCLUDED.access_token,
         expires_at = EXCLUDED.expires_at,
         scopes = EXCLUDED.scopes,
         raw_data = EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        parseInt(userId),
        'instagram',
        userInfo.id,
        userInfo.username,
        encryptedToken,
        null, // Instagram doesn't use refresh tokens
        expiresAt,
        ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'],
        JSON.stringify({
          account_type: userInfo.account_type,
          media_count: userInfo.media_count,
          expires_in: longLivedData.expires_in
        })
      ]
    );
    
    log('info', 'Instagram account connected successfully', { 
      user_id: userId, 
      platform_user_id: userInfo.id,
      username: userInfo.username 
    });
    
    // Clear state cookie and redirect
    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?success=instagram_connected`);
    response.cookies.delete('instagram_oauth_state');
    
    return response;
    
  } catch (error: any) {
    log('error', 'Instagram OAuth callback error', { error: error.message });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=instagram_connection_failed`);
  }
}