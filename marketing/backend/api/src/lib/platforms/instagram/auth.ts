import { AxiosInstance } from 'axios';
import { env } from '../../env';
import { loggers } from '../../logger';
import { db } from '../../db';

export interface AuthUrlOptions {
  state: string;
  redirectUri: string;
  scopes?: string[];
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
  username: string;
  name?: string;
  account_type?: string;
  media_count?: number;
  followers_count?: number;
}

export class InstagramAuth {
  private readonly logger = loggers.auth.child({ platform: 'instagram' });
  private readonly BASE_URL = 'https://api.instagram.com/oauth';
  private readonly GRAPH_URL = 'https://graph.instagram.com';

  constructor(private http: AxiosInstance) {}

  getAuthUrl(options: AuthUrlOptions): string {
    const defaultScopes = [
      'user_profile',
      'user_media',
      'business_basic',
      'business_manage_messages',
      'business_manage_comments',
      'business_content_publish'
    ];
    
    const scopes = options.scopes || defaultScopes;
    
    const params = new URLSearchParams({
      client_id: env.INSTAGRAM_CLIENT_ID,
      redirect_uri: options.redirectUri,
      scope: scopes.join(','),
      response_type: 'code',
      state: options.state
    });

    const authUrl = `${this.BASE_URL}/authorize?${params.toString()}`;
    
    this.logger.info({
      scopes: scopes.join(','),
      redirectUri: options.redirectUri,
      state: options.state
    }, 'Generated Instagram OAuth URL');
    
    return authUrl;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    try {
      const response = await this.http.post(`${this.BASE_URL}/access_token`, {
        client_id: env.INSTAGRAM_CLIENT_ID,
        client_secret: env.INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = response.data;
      
      // Exchange short-lived token for long-lived token
      const longLivedToken = await this.exchangeForLongLivedToken(tokenData.access_token);
      
      this.logger.info({
        hasLongLivedToken: !!longLivedToken.access_token,
        expiresIn: longLivedToken.expires_in
      }, 'Successfully exchanged Instagram code for tokens');
      
      return longLivedToken;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to exchange Instagram code');
      throw new Error(`Instagram token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      // Instagram Basic Display API uses long-lived tokens that can be refreshed
      const response = await this.http.get(`${this.GRAPH_URL}/refresh_access_token`, {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: refreshToken // For Instagram, the refresh token is the access token itself
        }
      });

      this.logger.info({
        expiresIn: response.data.expires_in
      }, 'Successfully refreshed Instagram token');
      
      return response.data;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to refresh Instagram token');
      throw new Error(`Instagram token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      const response = await this.http.get(`${this.GRAPH_URL}/me`, {
        params: {
          fields: 'id,username,account_type,media_count',
          access_token: accessToken
        }
      });

      return response.data;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to get Instagram user info');
      throw new Error(`Instagram user info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBusinessAccounts(accessToken: string): Promise<any[]> {
    try {
      // Get Facebook pages first
      const pagesResponse = await this.http.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: {
          access_token: accessToken
        }
      });

      const businessAccounts = [];
      
      for (const page of pagesResponse.data.data) {
        try {
          // Get Instagram business account for each page
          const igResponse = await this.http.get(`https://graph.facebook.com/v18.0/${page.id}`, {
            params: {
              fields: 'instagram_business_account',
              access_token: page.access_token
            }
          });

          if (igResponse.data.instagram_business_account) {
            businessAccounts.push({
              page_id: page.id,
              page_name: page.name,
              instagram_business_account_id: igResponse.data.instagram_business_account.id,
              access_token: page.access_token
            });
          }
        } catch (error) {
          this.logger.warn({ pageId: page.id, err: error }, 'Failed to get Instagram business account for page');
        }
      }

      return businessAccounts;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to get Instagram business accounts');
      throw new Error(`Instagram business accounts failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        'instagram',
        userInfo.id,
        userInfo.username,
        tokenResponse.access_token,
        tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
        JSON.stringify({
          account_type: userInfo.account_type,
          media_count: userInfo.media_count,
          followers_count: userInfo.followers_count,
          scope: tokenResponse.scope
        })
      ]);

      const accountId = accountResult.rows[0].id;
      
      // Save refresh token separately if provided
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
          null // Refresh tokens typically don't expire
        ]);
      }

      await client.query('COMMIT');
      
      this.logger.info({
        accountId,
        creatorId,
        username: userInfo.username,
        accountType: userInfo.account_type
      }, 'Instagram account saved successfully');
      
      return accountId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error({ err: error, creatorId, username: userInfo.username }, 'Failed to save Instagram account');
      throw error;
    } finally {
      client.release();
    }
  }

  private async exchangeForLongLivedToken(shortLivedToken: string): Promise<TokenResponse> {
    const response = await this.http.get(`${this.GRAPH_URL}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: env.INSTAGRAM_CLIENT_SECRET,
        access_token: shortLivedToken
      }
    });

    return {
      access_token: response.data.access_token,
      token_type: 'bearer',
      expires_in: response.data.expires_in
    };
  }
}