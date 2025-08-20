import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';
import { pool } from '../../../../server/db';
import { encrypt } from '../../../../lib/crypto';

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
const REDDIT_REDIRECT_URI = process.env.REDDIT_REDIRECT_URI || 'http://localhost:3000/api/auth/reddit/callback';

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

interface RedditUserResponse {
  id: string;
  name: string;
  created_utc: number;
  link_karma: number;
  comment_karma: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: authError } = req.query;
  
  // Parse cookies
  const cookies = parseCookies(req.headers.cookie || '');
  const savedState = cookies.reddit_oauth_state;
  const userId = cookies.reddit_oauth_user;

  // Clear cookies
  res.setHeader('Set-Cookie', [
    'reddit_oauth_state=; Path=/; HttpOnly; Max-Age=0',
    'reddit_oauth_user=; Path=/; HttpOnly; Max-Age=0'
  ]);

  // Handle errors
  if (authError) {
    return res.redirect(302, `/settings?error=reddit_auth_denied`);
  }

  // Validate state
  if (!state || state !== savedState) {
    return res.redirect(302, `/settings?error=invalid_state`);
  }

  if (!code || !userId) {
    return res.redirect(302, `/settings?error=missing_params`);
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForToken(code as string);
    
    // Get user info
    const userInfo = await getRedditUserInfo(tokenResponse.access_token);
    
    // Encrypt tokens
    const encryptedAccessToken = encrypt(tokenResponse.access_token);
    const encryptedRefreshToken = tokenResponse.refresh_token 
      ? encrypt(tokenResponse.refresh_token) 
      : null;
    
    // Calculate expiry
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
    
    // Store in database
    await pool.query(
      `INSERT INTO platform_accounts 
       (user_id, platform, username, external_id, scopes, access_token_encrypted, 
        refresh_token_encrypted, expires_at, meta_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, platform, external_id) 
       DO UPDATE SET 
         username = EXCLUDED.username,
         scopes = EXCLUDED.scopes,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         expires_at = EXCLUDED.expires_at,
         meta_json = EXCLUDED.meta_json,
         updated_at = NOW()`,
      [
        parseInt(userId),
        'reddit',
        userInfo.name,
        userInfo.id,
        tokenResponse.scope.split(' '),
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt,
        JSON.stringify({
          link_karma: userInfo.link_karma,
          comment_karma: userInfo.comment_karma,
          created_utc: userInfo.created_utc
        })
      ]
    );

    // Redirect to success page
    res.redirect(302, `/settings?success=reddit_connected&username=${userInfo.name}`);
    
  } catch (error: any) {
    console.error('Reddit OAuth callback error:', error);
    res.redirect(302, `/settings?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
  }
}

async function exchangeCodeForToken(code: string): Promise<RedditTokenResponse> {
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'OFM-Social-Scheduler/1.0'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDDIT_REDIRECT_URI
    }).toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to exchange code: ${response.status} ${text}`);
  }

  return response.json() as Promise<RedditTokenResponse>;
}

async function getRedditUserInfo(accessToken: string): Promise<RedditUserResponse> {
  const response = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'OFM-Social-Scheduler/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.status}`);
  }

  return response.json() as Promise<RedditUserResponse>;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  return cookies;
}