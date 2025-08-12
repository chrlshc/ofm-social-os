import { AxiosInstance } from 'axios';
import { env } from '../../env';
import { loggers } from '../../logger';
import { db } from '../../db';
import { createHmac, randomBytes } from 'crypto';

export interface AuthUrlOptions {
  state: string;
  redirectUri: string;
  scopes?: string[];
  codeChallenge?: string;
  codeChallengeMethod?: string;
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
  username: string;
  created_at?: string;
  description?: string;
  location?: string;
  pinned_tweet_id?: string;
  profile_image_url?: string;
  protected?: boolean;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
  url?: string;
  verified?: boolean;
  verified_type?: string;
}

export class XAuth {
  private readonly logger = loggers.auth.child({ platform: 'x' });
  private readonly AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
  private readonly TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
  private readonly REVOKE_URL = 'https://api.twitter.com/2/oauth2/revoke';
  private readonly API_URL = 'https://api.twitter.com/2';

  constructor(private http: AxiosInstance) {}

  getAuthUrl(options: AuthUrlOptions): string {
    const defaultScopes = [
      'tweet.read',
      'tweet.write',
      'users.read',
      'follows.read',
      'offline.access'
    ];
    
    const scopes = options.scopes || defaultScopes;
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.X_API_KEY,
      redirect_uri: options.redirectUri,
      scope: scopes.join(' '),
      state: options.state,
      code_challenge: options.codeChallenge || this.generateCodeChallenge(),
      code_challenge_method: options.codeChallengeMethod || 'S256'
    });

    const authUrl = `${this.AUTH_URL}?${params.toString()}`;
    
    this.logger.info({
      scopes: scopes.join(' '),
      redirectUri: options.redirectUri,
      state: options.state,
      hasCodeChallenge: !!options.codeChallenge
    }, 'Generated X OAuth 2.0 URL');
    
    return authUrl;
  }

  async exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<TokenResponse> {
    try {
      const params = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: env.X_API_KEY,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier || this.generateCodeVerifier()
      });

      const response = await this.http.post(this.TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${env.X_API_KEY}:${env.X_API_SECRET}`).toString('base64')}`
        }
      });

      const tokenData = response.data;
      
      this.logger.info({
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
        tokenType: tokenData.token_type
      }, 'Successfully exchanged X code for tokens');
      
      return tokenData;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to exchange X code');
      throw new Error(`X token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const params = new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        client_id: env.X_API_KEY
      });

      const response = await this.http.post(this.TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${env.X_API_KEY}:${env.X_API_SECRET}`).toString('base64')}`
        }
      });

      this.logger.info({
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      }, 'Successfully refreshed X token');
      
      return response.data;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to refresh X token');
      throw new Error(`X token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    try {
      const response = await this.http.get(`${this.API_URL}/users/me`, {
        params: {
          'user.fields': [
            'id',
            'name', 
            'username',
            'created_at',
            'description',
            'location',
            'pinned_tweet_id',
            'profile_image_url',
            'protected',
            'public_metrics',
            'url',
            'verified',
            'verified_type'
          ].join(',')
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.data.errors) {
        throw new Error(`X API errors: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data;
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to get X user info');
      throw new Error(`X user info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async saveAccount(creatorId: string, tokenResponse: TokenResponse, userInfo: UserInfo): Promise<string> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Check if user has Premium features (based on verified status or metrics)
      const isPremium = this.detectPremiumFeatures(userInfo);
      
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
        'x',
        userInfo.id,
        userInfo.username,
        tokenResponse.access_token,
        tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
        JSON.stringify({
          name: userInfo.name,
          created_at: userInfo.created_at,
          description: userInfo.description,
          location: userInfo.location,
          profile_image_url: userInfo.profile_image_url,
          protected: userInfo.protected,
          public_metrics: userInfo.public_metrics,
          url: userInfo.url,
          verified: userInfo.verified,
          verified_type: userInfo.verified_type,
          is_premium: isPremium,
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
          null // X refresh tokens don't expire
        ]);
      }

      await client.query('COMMIT');
      
      this.logger.info({
        accountId,
        creatorId,
        username: userInfo.username,
        verified: userInfo.verified,
        isPremium,
        followersCount: userInfo.public_metrics?.followers_count
      }, 'X account saved successfully');
      
      return accountId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error({ err: error, creatorId, username: userInfo.username }, 'Failed to save X account');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeAccess(accessToken: string): Promise<void> {
    try {
      await this.http.post(this.REVOKE_URL, 
        new URLSearchParams({
          token: accessToken,
          client_id: env.X_API_KEY
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${env.X_API_KEY}:${env.X_API_SECRET}`).toString('base64')}`
          }
        }
      );

      this.logger.info('X access revoked successfully');
      
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to revoke X access');
      throw new Error(`X revoke failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier?: string): string {
    const codeVerifier = verifier || this.generateCodeVerifier();
    return createHmac('sha256', codeVerifier).digest('base64url');
  }

  private detectPremiumFeatures(userInfo: UserInfo): boolean {
    // Heuristics to detect X Premium features
    // Premium users typically have:
    // - Blue checkmark (verified)
    // - Higher character limits (detected during publishing)
    // - Edit tweets capability
    
    if (userInfo.verified && userInfo.verified_type === 'blue') {
      return true;
    }
    
    // Additional premium indicators could be added based on API response
    return false;
  }
}