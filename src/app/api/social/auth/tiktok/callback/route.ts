import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/server/db';
import { encrypt } from '@/lib/crypto';
import { log } from '@/lib/observability';

// GET /api/social/auth/tiktok/callback
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  if (error) {
    log('warn', 'TikTok OAuth error', { error });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=tiktok_denied`);
  }
  
  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }
  
  // Validate state
  const cookieState = request.cookies.get('tiktok_oauth_state')?.value;
  const codeVerifier = request.cookies.get('tiktok_code_verifier')?.value;
  const [stateToken, userId] = state.split(':');
  
  if (!cookieState || cookieState !== stateToken || !codeVerifier) {
    log('warn', 'TikTok OAuth state mismatch', { expected: cookieState, received: stateToken });
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
  }
  
  try {
    // Exchange code for access token
    const tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
    const tokenData = {
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_URL}/api/social/auth/tiktok/callback`,
      code,
      code_verifier: codeVerifier
    };
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(tokenData)
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      log('error', 'TikTok token exchange failed', { error });
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=tiktok_token_failed`);
    }
    
    const tokenResult = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, open_id, scope } = tokenResult;
    
    // Get user info
    const userInfoUrl = 'https://open.tiktokapis.com/v2/user/info/';
    const userInfoResponse = await fetch(userInfoUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const userInfoData = await userInfoResponse.json();
    const userInfo = userInfoData.data?.user || {};
    
    // Encrypt tokens
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;
    
    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);
    
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
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         scopes = EXCLUDED.scopes,
         raw_data = EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        parseInt(userId),
        'tiktok',
        open_id,
        userInfo.display_name || userInfo.username || 'TikTok User',
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt,
        scope ? scope.split(',') : ['user.info.basic', 'video.publish'],
        JSON.stringify({
          avatar_url: userInfo.avatar_url,
          is_verified: userInfo.is_verified,
          follower_count: userInfo.follower_count,
          following_count: userInfo.following_count,
          video_count: userInfo.video_count
        })
      ]
    );
    
    log('info', 'TikTok account connected successfully', { 
      user_id: userId, 
      platform_user_id: open_id,
      username: userInfo.display_name 
    });
    
    // Clear cookies and redirect
    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?success=tiktok_connected`);
    response.cookies.delete('tiktok_oauth_state');
    response.cookies.delete('tiktok_code_verifier');
    
    return response;
    
  } catch (error: any) {
    log('error', 'TikTok OAuth callback error', { error: error.message });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/settings?error=tiktok_connection_failed`);
  }
}