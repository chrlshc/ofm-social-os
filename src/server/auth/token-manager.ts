import { pool } from '../db';
import { encrypt, decrypt } from '../../lib/crypto';
import fetch from 'node-fetch';
import { PlatformAccount } from '../types';

// Token refresh configurations per platform
const TOKEN_REFRESH_CONFIG = {
  reddit: {
    endpoint: 'https://www.reddit.com/api/v1/access_token',
    grantType: 'refresh_token',
    expiresIn: 3600, // 1 hour
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
  },
  instagram: {
    endpoint: 'https://graph.facebook.com/v20.0/oauth/access_token',
    grantType: 'fb_exchange_token',
    expiresIn: 5184000, // 60 days
    clientId: process.env.INSTAGRAM_APP_ID,
    clientSecret: process.env.INSTAGRAM_APP_SECRET,
  },
  tiktok: {
    endpoint: 'https://open.tiktokapis.com/v2/oauth/token/',
    grantType: 'refresh_token',
    expiresIn: 86400, // 24 hours
    clientId: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
  }
};

/**
 * Check if token needs refresh (less than 5 minutes remaining)
 */
export function needsRefresh(expiresAt?: Date | string | null): boolean {
  if (!expiresAt) return true;
  
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const now = new Date();
  const timeRemaining = expiry.getTime() - now.getTime();
  
  // Refresh if less than 5 minutes remaining
  return timeRemaining < 5 * 60 * 1000;
}

/**
 * Refresh access token for a platform account
 */
export async function refreshAccessToken(account: PlatformAccount): Promise<PlatformAccount> {
  console.log(`Refreshing token for ${account.platform} account ${account.username}`);
  
  const config = TOKEN_REFRESH_CONFIG[account.platform];
  if (!config) {
    throw new Error(`No refresh configuration for platform: ${account.platform}`);
  }
  
  if (!account.refresh_token_encrypted) {
    throw new Error(`No refresh token available for ${account.platform} account ${account.username}`);
  }
  
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`Missing OAuth credentials for ${account.platform}. Check environment variables.`);
  }
  
  try {
    const refreshToken = decrypt(account.refresh_token_encrypted);
    
    let response;
    let newTokenData: any;
    
    switch (account.platform) {
      case 'reddit':
        response = await refreshRedditToken(refreshToken, config);
        newTokenData = await response.json();
        break;
        
      case 'instagram':
        response = await refreshInstagramToken(account.access_token_encrypted, config);
        newTokenData = await response.json();
        break;
        
      case 'tiktok':
        response = await refreshTikTokToken(refreshToken, config);
        newTokenData = await response.json();
        break;
        
      default:
        throw new Error(`Unsupported platform: ${account.platform}`);
    }
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${JSON.stringify(newTokenData)}`);
    }
    
    // Update account with new tokens
    const newAccessToken = newTokenData.access_token;
    const newRefreshToken = newTokenData.refresh_token || refreshToken; // Some platforms reuse refresh token
    const expiresIn = newTokenData.expires_in || config.expiresIn;
    
    const encryptedAccessToken = encrypt(newAccessToken);
    const encryptedRefreshToken = newRefreshToken ? encrypt(newRefreshToken) : account.refresh_token_encrypted;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    
    // Update in database
    await pool.query(
      `UPDATE social_publisher.platform_accounts 
       SET access_token_encrypted = $1, 
           refresh_token_encrypted = $2,
           expires_at = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [encryptedAccessToken, encryptedRefreshToken, expiresAt, account.id]
    );
    
    // Return updated account
    return {
      ...account,
      access_token_encrypted: encryptedAccessToken,
      refresh_token_encrypted: encryptedRefreshToken,
      expires_at: expiresAt
    };
    
  } catch (error: any) {
    console.error(`Failed to refresh token for ${account.platform}:`, error);
    throw error;
  }
}

async function refreshRedditToken(refreshToken: string, config: any) {
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  
  return fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': process.env.REDDIT_USER_AGENT || 'ofm-social-os:v1.0.0'
    },
    body: new URLSearchParams({
      grant_type: config.grantType,
      refresh_token: refreshToken
    }).toString()
  });
}

async function refreshInstagramToken(encryptedAccessToken: string, config: any) {
  const currentToken = decrypt(encryptedAccessToken);
  
  return fetch(`${config.endpoint}?${new URLSearchParams({
    grant_type: config.grantType,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    fb_exchange_token: currentToken
  }).toString()}`);
}

async function refreshTikTokToken(refreshToken: string, config: any) {
  return fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: config.clientId,
      client_secret: config.clientSecret,
      grant_type: config.grantType,
      refresh_token: refreshToken
    }).toString()
  });
}

/**
 * Get platform account with auto-refresh if needed
 */
export async function getAccountWithFreshToken(
  userId: number,
  platform: string,
  accountId?: number
): Promise<PlatformAccount> {
  let query = 'SELECT * FROM social_publisher.platform_accounts WHERE user_id = $1 AND platform = $2';
  const params: any[] = [userId, platform];
  
  if (accountId) {
    query += ' AND id = $3';
    params.push(accountId);
  } else {
    query += ' ORDER BY created_at DESC LIMIT 1';
  }
  
  const result = await pool.query(query, params);
  
  if (result.rows.length === 0) {
    throw new Error(`No ${platform} account found for user ${userId}`);
  }
  
  let account: PlatformAccount = result.rows[0];
  
  // Check if token needs refresh
  if (needsRefresh(account.expires_at)) {
    console.log(`Token expired or expiring soon for ${platform} account ${account.username}, refreshing...`);
    account = await refreshAccessToken(account);
  }
  
  return account;
}