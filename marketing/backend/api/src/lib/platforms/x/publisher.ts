import { AxiosInstance } from 'axios';
import { db } from '../../db';
import { loggers } from '../../logger';
import { withSpan, publishLatencyHistogram, publishErrorsCounter, publishRequestsCounter } from '../../otel';

export interface PublishInput {
  accountId: string;
  caption: string;
  variantUrl?: string;
  mediaType?: 'VIDEO' | 'PHOTO';
}

export interface PublishResult {
  remoteId: string;
  publishedAt?: string;
  containerRef?: string;
}

export interface XAccount {
  id: string;
  access_token: string;
  access_token_secret: string;
  username: string;
  is_premium?: boolean;
}

export class XPublisher {
  private readonly logger = loggers.publisher.child({ platform: 'x' });
  private readonly BASE_URL = 'https://api.twitter.com/2';
  private readonly UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';

  constructor(
    private http: AxiosInstance,
    private database = db
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    return withSpan('x.publish', { 
      account_id: input.accountId,
      media_type: input.mediaType || 'TEXT_ONLY'
    }, async () => {
      const start = Date.now();
      
      try {
        publishRequestsCounter.add(1, { platform: 'x' });
        
        // Get account details to check premium status
        const account = await this.getAccount(input.accountId);
        
        // Validate text length based on account type
        const maxLength = account.is_premium ? 25000 : 280;
        if (input.caption.length > maxLength) {
          const accountType = account.is_premium ? 'Premium' : 'Standard';
          throw new Error(`X ${accountType} tweet too long: ${input.caption.length}/${maxLength} characters`);
        }

        let mediaIds: string[] = [];
        
        // Upload media if provided
        if (input.variantUrl) {
          const mediaId = await this.uploadMedia(account, input);
          mediaIds.push(mediaId);
        }
        
        // Create tweet
        const result = await this.createTweet(account, input.caption, mediaIds);
        
        // Update post status in database
        await this.updatePostStatus(input.accountId, result.remoteId, 'live');
        
        const duration = Date.now() - start;
        publishLatencyHistogram.record(duration, { platform: 'x' });
        
        this.logger.info({ 
          accountId: input.accountId,
          remoteId: result.remoteId,
          textLength: input.caption.length,
          maxLength,
          duration 
        }, 'X tweet published successfully');
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - start;
        publishErrorsCounter.add(1, { 
          platform: 'x',
          error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
          error_code: this.extractErrorCode(error)
        });
        
        publishLatencyHistogram.record(duration, { platform: 'x', status: 'error' });
        
        this.logger.error({ 
          err: error,
          accountId: input.accountId,
          duration 
        }, 'X tweet publish failed');
        
        // Update post status to error
        await this.updatePostStatus(input.accountId, null, 'error');
        throw error;
      }
    });
  }

  private async uploadMedia(account: XAccount, input: PublishInput): Promise<string> {
    return withSpan('x.upload_media', { 
      account_id: input.accountId,
      media_type: input.mediaType 
    }, async () => {
      // For simplicity, we'll use the chunked upload endpoint
      // In a real implementation, you'd fetch the media from the URL and upload it
      
      const initResponse = await this.http.post(this.UPLOAD_URL, {
        command: 'INIT',
        total_bytes: 1000000, // Placeholder - would be actual file size
        media_type: input.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
        media_category: input.mediaType === 'VIDEO' ? 'tweet_video' : 'tweet_image'
      }, {
        headers: {
          'Authorization': this.getOAuth1Header(account, 'POST', this.UPLOAD_URL),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const mediaId = initResponse.data.media_id_string;
      
      // In a real implementation, you would:
      // 1. Download the media from input.variantUrl
      // 2. Split it into chunks
      // 3. Upload each chunk with APPEND command
      // 4. Finalize with FINALIZE command
      
      this.logger.debug({ 
        mediaId,
        mediaUrl: input.variantUrl 
      }, 'X media upload initialized (mock)');
      
      return mediaId;
    });
  }

  private async createTweet(account: XAccount, text: string, mediaIds: string[]): Promise<PublishResult> {
    const endpoint = `${this.BASE_URL}/tweets`;
    
    const payload: any = {
      text: text
    };
    
    if (mediaIds.length > 0) {
      payload.media = {
        media_ids: mediaIds
      };
    }
    
    const response = await this.http.post(endpoint, payload, {
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.data.data?.id) {
      throw new Error('Failed to create X tweet');
    }
    
    return {
      remoteId: response.data.data.id,
      publishedAt: new Date().toISOString(),
    };
  }

  private getOAuth1Header(account: XAccount, method: string, url: string): string {
    // OAuth 1.0a signature generation for media upload
    // This is a simplified version - in production, use a proper OAuth library
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substring(2, 15);
    
    return `OAuth oauth_consumer_key="${process.env.X_API_KEY}", ` +
           `oauth_token="${account.access_token}", ` +
           `oauth_signature_method="HMAC-SHA1", ` +
           `oauth_timestamp="${timestamp}", ` +
           `oauth_nonce="${nonce}", ` +
           `oauth_version="1.0", ` +
           `oauth_signature="placeholder_signature"`;
  }

  private extractErrorCode(error: any): string {
    // Extract X-specific error codes for monitoring
    if (error?.response?.data?.errors?.[0]?.code) {
      return error.response.data.errors[0].code.toString();
    }
    if (error?.response?.status === 429) {
      return 'rate_limit_exceeded';
    }
    if (error?.response?.status === 403) {
      return 'forbidden';
    }
    return 'unknown_error';
  }

  private async getAccount(accountId: string): Promise<XAccount> {
    const result = await this.database.query(
      `SELECT id, access_token, platform_account_id as username, 
              metadata->>'access_token_secret' as access_token_secret,
              (metadata->>'is_premium')::boolean as is_premium
       FROM accounts WHERE id = $1 AND platform = $2`,
      [accountId, 'x']
    );
    
    if (result.rows.length === 0) {
      throw new Error(`X account not found: ${accountId}`);
    }
    
    const account = result.rows[0];
    if (!account.access_token) {
      throw new Error(`No access token for X account: ${accountId}`);
    }
    
    return account;
  }

  private async updatePostStatus(accountId: string, remoteId: string | null, status: 'publishing' | 'live' | 'error'): Promise<void> {
    if (remoteId) {
      await this.database.query(
        'UPDATE posts SET status = $1, remote_id = $2, published_at = $3 WHERE account_id = $4 AND status = $5',
        [status, remoteId, status === 'live' ? new Date() : null, accountId, 'publishing']
      );
    } else {
      await this.database.query(
        'UPDATE posts SET status = $1 WHERE account_id = $2 AND status = $3',
        [status, accountId, 'publishing']
      );
    }
  }
}