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
  refresh_expires_in?: number;
  scope?: string;
  token_type: string;
  open_id?: string;
}

export interface UserInfo {
  open_id: string;
  union_id: string;
  avatar_url?: string;
  avatar_url_100?: string;
  display_name?: string;
  bio_description?: string;
  profile_deep_link?: string;
  is_verified?: boolean;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

export class TikTokAuth {
  private readonly logger = loggers.auth.child({ platform: 'tiktok' });
  private readonly BASE_URL = 'https://www.tiktok.com/v2/auth/authorize';
  private readonly TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
  private readonly API_URL = 'https://open.tiktokapis.com/v2';

  constructor(private http: AxiosInstance) {}

  getAuthUrl(options: AuthUrlOptions): string {
    const defaultScopes = [
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
      'video.list',
      'video.upload',
      'video.publish'
    ];
    
    const scopes = options.scopes || defaultScopes;
    
    const params = new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      scope: scopes.join(','),
      response_type: 'code',
      redirect_uri: options.redirectUri,
      state: options.state
    });

    const authUrl = `${this.BASE_URL}?${params.toString()}`;
    
    this.logger.info({
      scopes: scopes.join(','),
      redirectUri: options.redirectUri,
      state: options.state
    }, 'Generated TikTok OAuth URL');
    
    return authUrl;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    try {
      const response = await this.http.post(this.TOKEN_URL, {
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data.error) {
        throw new Error(`TikTok OAuth error: ${response.data.error} - ${response.data.error_description}`);
      }

      const tokenData = response.data.data;
      
      this.logger.info({
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        openId: tokenData.open_id,
        scope: tokenData.scope
      }, 'Successfully exchanged TikTok code for tokens');
      
      return tokenData;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to exchange TikTok code');
      throw new Error(`TikTok token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const response = await this.http.post(this.TOKEN_URL, {
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data.error) {
        throw new Error(`TikTok refresh error: ${response.data.error} - ${response.data.error_description}`);
      }

      this.logger.info({
        expiresIn: response.data.data.expires_in,
        refreshExpiresIn: response.data.data.refresh_expires_in
      }, 'Successfully refreshed TikTok token');
      
      return response.data.data;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to refresh TikTok token');
      throw new Error(`TikTok token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      const response = await this.http.post(`${this.API_URL}/user/info/`, {
        fields: [
          'open_id',
          'union_id', 
          'avatar_url',
          'avatar_url_100',
          'display_name',
          'bio_description',
          'profile_deep_link',
          'is_verified',
          'follower_count',
          'following_count',
          'likes_count',
          'video_count'
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(`TikTok user info error: ${response.data.error.code} - ${response.data.error.message}`);
      }

      return response.data.data.user;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to get TikTok user info');
      throw new Error(`TikTok user info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        'tiktok',
        userInfo.open_id,
        userInfo.display_name || userInfo.open_id,
        tokenResponse.access_token,
        tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
        JSON.stringify({
          union_id: userInfo.union_id,
          avatar_url: userInfo.avatar_url,
          avatar_url_100: userInfo.avatar_url_100,
          display_name: userInfo.display_name,
          bio_description: userInfo.bio_description,
          profile_deep_link: userInfo.profile_deep_link,
          is_verified: userInfo.is_verified,
          follower_count: userInfo.follower_count,
          following_count: userInfo.following_count,
          likes_count: userInfo.likes_count,
          video_count: userInfo.video_count,
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
          tokenResponse.refresh_expires_in ? new Date(Date.now() + tokenResponse.refresh_expires_in * 1000) : null
        ]);
      }

      await client.query('COMMIT');
      
      this.logger.info({
        accountId,
        creatorId,
        openId: userInfo.open_id,
        displayName: userInfo.display_name
      }, 'TikTok account saved successfully');
      
      return accountId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error({ err: error, creatorId, openId: userInfo.open_id }, 'Failed to save TikTok account');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeAccess(accessToken: string): Promise<void> {
    try {
      await this.http.post(`${this.API_URL}/oauth/revoke/`, {
        client_key: env.TIKTOK_CLIENT_KEY,
        client_secret: env.TIKTOK_CLIENT_SECRET,
        token: accessToken
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.logger.info('TikTok access revoked successfully');
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to revoke TikTok access');
      throw new Error(`TikTok revoke failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}