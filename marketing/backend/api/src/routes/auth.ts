import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { db } from '../lib/db';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { InstagramAuth } from '../lib/platforms/instagram/auth';
import { TikTokAuth } from '../lib/platforms/tiktok/auth';
import { XAuth } from '../lib/platforms/x/auth';
import { RedditAuth } from '../lib/platforms/reddit/auth';

export const authRouter = Router();

// OAuth state management using Redis
async function saveOAuthState(state: string, data: { platform: string; creatorId: string; redirectUri: string }): Promise<void> {
  await redis.setex(`oauth_state:${state}`, 3600, JSON.stringify(data)); // 1 hour TTL
}

async function getOAuthState(state: string): Promise<{ platform: string; creatorId: string; redirectUri: string } | null> {
  const data = await redis.get(`oauth_state:${state}`);
  if (!data) return null;
  await redis.del(`oauth_state:${state}`); // Use once
  return JSON.parse(data);
}

// Start OAuth flow
authRouter.post('/:platform/start', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { creatorId, redirectUri } = req.body;

    if (!['instagram', 'tiktok', 'x', 'reddit'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    if (!creatorId || !redirectUri) {
      return res.status(400).json({ error: 'Missing creatorId or redirectUri' });
    }

    const state = crypto.randomBytes(32).toString('hex');
    await saveOAuthState(state, { platform, creatorId, redirectUri });

    const httpClient = axios.create();
    let authUrl: string;

    switch (platform) {
      case 'instagram': {
        const auth = new InstagramAuth(httpClient);
        authUrl = auth.getAuthUrl({ state, redirectUri });
        break;
      }
      
      case 'tiktok': {
        const auth = new TikTokAuth(httpClient);
        authUrl = auth.getAuthUrl({ state, redirectUri });
        break;
      }
      
      case 'x': {
        const auth = new XAuth(httpClient);
        authUrl = auth.getAuthUrl({ state, redirectUri });
        break;
      }
      
      case 'reddit': {
        const auth = new RedditAuth(httpClient);
        authUrl = auth.getAuthUrl({ state, redirectUri });
        break;
      }
      
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    res.json({ authUrl, state });
  } catch (error) {
    logger.error({ err: error, platform: req.params.platform }, 'OAuth start error');
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
});

// OAuth callback
authRouter.get('/:platform/callback', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      logger.error({ platform, oauthError: error }, 'OAuth error received');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?platform=${platform}&error=${error}`);
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    const stateData = await getOAuthState(state as string);
    if (!stateData || stateData.platform !== platform) {
      return res.status(400).json({ error: 'Invalid or expired state' });
    }

    const httpClient = axios.create();
    let tokens: any;
    let userInfo: any;
    let accountId: string;

    switch (platform) {
      case 'instagram': {
        const auth = new InstagramAuth(httpClient);
        tokens = await auth.exchangeCode(code as string, stateData.redirectUri);
        userInfo = await auth.getUserInfo(tokens.access_token);
        accountId = await auth.saveAccount(stateData.creatorId, tokens, userInfo);
        break;
      }
      
      case 'tiktok': {
        const auth = new TikTokAuth(httpClient);
        tokens = await auth.exchangeCode(code as string, stateData.redirectUri);
        userInfo = await auth.getUserInfo(tokens.access_token);
        accountId = await auth.saveAccount(stateData.creatorId, tokens, userInfo);
        break;
      }
      
      case 'x': {
        const auth = new XAuth(httpClient);
        tokens = await auth.exchangeCode(code as string, stateData.redirectUri);
        userInfo = await auth.getUserInfo(tokens.access_token);
        accountId = await auth.saveAccount(stateData.creatorId, tokens, userInfo);
        break;
      }
      
      case 'reddit': {
        const auth = new RedditAuth(httpClient);
        tokens = await auth.exchangeCode(code as string, stateData.redirectUri);
        userInfo = await auth.getUserInfo(tokens.access_token);
        accountId = await auth.saveAccount(stateData.creatorId, tokens, userInfo);
        break;
      }
      
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    logger.info({
      platform,
      creatorId: stateData.creatorId,
      accountId,
      username: userInfo.username || userInfo.name || userInfo.display_name
    }, 'OAuth flow completed successfully');

    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/success?platform=${platform}&account=${accountId}`);
  } catch (error) {
    logger.error({ err: error, platform: req.params.platform }, 'OAuth callback error');
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?platform=${req.params.platform}&error=callback_failed`);
  }
});

// Refresh token endpoint
authRouter.post('/:platform/refresh', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing accountId' });
    }

    // Get account and refresh token
    const accountResult = await db.query(`
      SELECT a.id, a.access_token, t.token_value as refresh_token
      FROM accounts a
      LEFT JOIN tokens t ON a.id = t.account_id AND t.token_type = 'refresh_token'
      WHERE a.id = $1 AND a.platform = $2
    `, [accountId, platform]);

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accountResult.rows[0];
    if (!account.refresh_token) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    const httpClient = axios.create();
    let newTokens: any;

    switch (platform) {
      case 'instagram': {
        const auth = new InstagramAuth(httpClient);
        newTokens = await auth.refreshToken(account.refresh_token);
        break;
      }
      case 'tiktok': {
        const auth = new TikTokAuth(httpClient);
        newTokens = await auth.refreshToken(account.refresh_token);
        break;
      }
      case 'x': {
        const auth = new XAuth(httpClient);
        newTokens = await auth.refreshToken(account.refresh_token);
        break;
      }
      case 'reddit': {
        const auth = new RedditAuth(httpClient);
        newTokens = await auth.refreshToken(account.refresh_token);
        break;
      }
      default:
        return res.status(400).json({ error: 'Unsupported platform' });
    }

    // Update tokens in database
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Update access token
      await client.query(`
        UPDATE accounts 
        SET access_token = $1, token_expires_at = $2, updated_at = NOW()
        WHERE id = $3
      `, [
        newTokens.access_token,
        newTokens.expires_in ? new Date(Date.now() + newTokens.expires_in * 1000) : null,
        accountId
      ]);

      // Update refresh token if provided
      if (newTokens.refresh_token) {
        await client.query(`
          UPDATE tokens 
          SET token_value = $1, expires_at = $2, updated_at = NOW()
          WHERE account_id = $3 AND token_type = 'refresh_token'
        `, [
          newTokens.refresh_token,
          newTokens.refresh_expires_in ? new Date(Date.now() + newTokens.refresh_expires_in * 1000) : null,
          accountId
        ]);
      }

      await client.query('COMMIT');
      
      logger.info({ platform, accountId }, 'Token refreshed successfully');
      res.json({ success: true, expiresIn: newTokens.expires_in });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error({ err: error, platform: req.params.platform }, 'Token refresh error');
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});