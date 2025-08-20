import { Pool } from 'pg';
import { decrypt, encrypt } from '../../lib/kms-crypto';
import { PlatformAccount } from '../types';
import fetch from 'node-fetch';

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

export async function ensureValidAccessToken(args: {
  pool: Pool;
  ownerId: number;
  platform: 'reddit' | 'instagram' | 'tiktok';
}): Promise<{ account: PlatformAccount; accessToken: string }> {
  const { rows } = await args.pool.query(
    `SELECT * FROM social_publisher.platform_accounts 
     WHERE user_id = $1 AND platform = $2 
     ORDER BY id DESC LIMIT 1`,
    [args.ownerId, args.platform]
  );
  
  const account = rows[0] as PlatformAccount;
  if (!account) {
    throw new Error(`PLATFORM_ACCOUNT_MISSING: No ${args.platform} account for user ${args.ownerId}`);
  }

  const token = decrypt(account.access_token_encrypted);
  const expiresAt = account.expires_at ? new Date(account.expires_at) : null;
  const needsRefresh = !expiresAt || (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);

  if (!needsRefresh) {
    console.log(`Token for ${args.platform} still valid, expires at ${expiresAt}`);
    return { account, accessToken: token };
  }

  console.log(`Token for ${args.platform} needs refresh (expires ${expiresAt})`);
  
  // Perform token refresh
  try {
    const refreshedAccount = await refreshAccessToken(args.pool, account);
    const newToken = decrypt(refreshedAccount.access_token_encrypted);
    return { account: refreshedAccount, accessToken: newToken };
  } catch (error) {
    console.error(`Failed to refresh token for ${args.platform}:`, error);
    // Return existing token as fallback (might still work)
    return { account, accessToken: token };
  }
}

async function refreshAccessToken(
  pool: Pool,
  account: PlatformAccount
): Promise<PlatformAccount> {
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

  const refreshToken = decrypt(account.refresh_token_encrypted);
  let response: any;
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
  }

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${JSON.stringify(newTokenData)}`);
  }

  // Update account with new tokens
  const newAccessToken = newTokenData.access_token;
  const newRefreshToken = newTokenData.refresh_token || refreshToken;
  const expiresIn = newTokenData.expires_in || config.expiresIn;

  const encryptedAccessToken = encrypt(newAccessToken);
  const encryptedRefreshToken = encrypt(newRefreshToken);
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

  console.log(`Successfully refreshed token for ${account.platform}, new expiry: ${expiresAt}`);

  // Return updated account
  return {
    ...account,
    access_token_encrypted: encryptedAccessToken,
    refresh_token_encrypted: encryptedRefreshToken,
    expires_at: expiresAt
  };
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