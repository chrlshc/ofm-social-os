import { AxiosInstance } from 'axios';
import { env } from '../../env';
import { loggers } from '../../logger';
import { db } from '../../db';

export interface AuthUrlOptions {
  state: string;
  redirectUri: string;
  scopes?: string[];
  duration?: 'temporary' | 'permanent';
}

export interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

export interface UserInfo {
  id: string;
  name: string;
  created_utc: number;
  comment_karma: number;
  link_karma: number;
  is_gold: boolean;
  is_mod: boolean;
  has_verified_email: boolean;
  icon_img?: string;
  subreddit?: {
    display_name: string;
    title: string;
    public_description: string;
    subscribers: number;
  };
}

export class RedditAuth {
  private readonly logger = loggers.auth.child({ platform: 'reddit' });
  private readonly AUTH_URL = 'https://www.reddit.com/api/v1/authorize';
  private readonly TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
  private readonly REVOKE_URL = 'https://www.reddit.com/api/v1/revoke_token';
  private readonly API_URL = 'https://oauth.reddit.com';

  constructor(private http: AxiosInstance) {}

  getAuthUrl(options: AuthUrlOptions): string {
    const defaultScopes = [
      'identity',
      'read',
      'submit',
      'edit',
      'mysubreddits',
      'vote'
    ];
    
    const scopes = options.scopes || defaultScopes;
    
    const params = new URLSearchParams({
      client_id: env.REDDIT_CLIENT_ID,
      response_type: 'code',
      state: options.state,
      redirect_uri: options.redirectUri,
      duration: options.duration || 'permanent',
      scope: scopes.join(' ')
    });

    const authUrl = `${this.AUTH_URL}?${params.toString()}`;
    
    this.logger.info({
      scopes: scopes.join(' '),
      redirectUri: options.redirectUri,
      state: options.state,
      duration: options.duration || 'permanent'
    }, 'Generated Reddit OAuth URL');
    
    return authUrl;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      });

      const response = await this.http.post(this.TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
          'User-Agent': 'OFM-Social-OS/1.0'
        }
      });

      const tokenData = response.data;
      
      if (tokenData.error) {
        throw new Error(`Reddit OAuth error: ${tokenData.error} - ${tokenData.error_description}`);
      }
      
      this.logger.info({
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
        tokenType: tokenData.token_type
      }, 'Successfully exchanged Reddit code for tokens');
      
      return tokenData;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to exchange Reddit code');
      throw new Error(`Reddit token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const response = await this.http.post(this.TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
          'User-Agent': 'OFM-Social-OS/1.0'
        }
      });

      if (response.data.error) {
        throw new Error(`Reddit refresh error: ${response.data.error} - ${response.data.error_description}`);
      }

      this.logger.info({
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      }, 'Successfully refreshed Reddit token');
      
      return response.data;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to refresh Reddit token');
      throw new Error(`Reddit token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      const response = await this.http.get(`${this.API_URL}/api/v1/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'OFM-Social-OS/1.0'
        }
      });

      if (response.data.error) {
        throw new Error(`Reddit API error: ${response.data.error} - ${response.data.message}`);
      }

      return response.data;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to get Reddit user info');
      throw new Error(`Reddit user info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserSubreddits(accessToken: string): Promise<any[]> {
    try {
      const response = await this.http.get(`${this.API_URL}/subreddits/mine/subscriber`, {
        params: {
          limit: 100
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'OFM-Social-OS/1.0'
        }
      });

      return response.data.data.children.map((child: any) => child.data);
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to get Reddit user subreddits');
      throw new Error(`Reddit subreddits failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async saveAccount(creatorId: string, tokenResponse: TokenResponse, userInfo: UserInfo): Promise<string> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Insert or update account
      const accountResult = await client.query(`
        INSERT INTO accounts (creator_id, platform, platform_account_id, username, access_token, token_expires_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (creator_id, platform, platform_account_id)
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          token_expires_at = EXCLUDED.token_expires_at,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `, [
        creatorId,
        'reddit',
        userInfo.id,
        userInfo.name,
        tokenResponse.access_token,
        tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
        JSON.stringify({
          created_utc: userInfo.created_utc,
          comment_karma: userInfo.comment_karma,
          link_karma: userInfo.link_karma,
          is_gold: userInfo.is_gold,
          is_mod: userInfo.is_mod,
          has_verified_email: userInfo.has_verified_email,
          icon_img: userInfo.icon_img,
          subreddit: userInfo.subreddit,
          scope: tokenResponse.scope
        })
      ]);

      const accountId = accountResult.rows[0].id;
      
      // Save refresh token
      if (tokenResponse.refresh_token) {
        await client.query(`
          INSERT INTO tokens (account_id, token_type, token_value, expires_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (account_id, token_type)
          DO UPDATE SET
            token_value = EXCLUDED.token_value,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
        `, [
          accountId,
          'refresh_token',
          tokenResponse.refresh_token,
          null // Reddit refresh tokens don't expire if permanent
        ]);
      }

      await client.query('COMMIT');
      
      this.logger.info({
        accountId,
        creatorId,
        username: userInfo.name,
        commentKarma: userInfo.comment_karma,
        linkKarma: userInfo.link_karma,
        isGold: userInfo.is_gold
      }, 'Reddit account saved successfully');
      
      return accountId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error({ err: error, creatorId, username: userInfo.name }, 'Failed to save Reddit account');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeAccess(accessToken: string, refreshToken?: string): Promise<void> {
    try {
      const tokens = [accessToken];
      if (refreshToken) {
        tokens.push(refreshToken);
      }

      for (const token of tokens) {
        await this.http.post(this.REVOKE_URL,
          new URLSearchParams({
            token,
            token_type_hint: token === accessToken ? 'access_token' : 'refresh_token'
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
              'User-Agent': 'OFM-Social-OS/1.0'
            }
          }
        );
      }

      this.logger.info('Reddit access revoked successfully');
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to revoke Reddit access');
      throw new Error(`Reddit revoke failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}