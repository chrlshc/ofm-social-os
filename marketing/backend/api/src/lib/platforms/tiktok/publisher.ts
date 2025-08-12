import { AxiosInstance } from 'axios';
import { db } from '../../db';
import { redis } from '../../redis';
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

export interface TikTokAccount {
  id: string;
  access_token: string;
  open_id: string;
}

export class TikTokPublisher {
  private readonly logger = loggers.publisher.child({ platform: 'tiktok' });
  private readonly BASE_URL = 'https://open.tiktokapis.com/v2';

  constructor(
    private http: AxiosInstance,
    private database = db,
    private cache = redis
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    return withSpan('tiktok.publish', { 
      account_id: input.accountId,
      media_type: input.mediaType || 'UNKNOWN'
    }, async () => {
      const start = Date.now();
      
      try {
        publishRequestsCounter.add(1, { platform: 'tiktok' });
        
        // Check rate limits (TikTok: 6 requests per minute sliding window)
        await this.checkRateLimit(input.accountId);
        
        // Validate caption length based on media type
        const maxLength = input.mediaType === 'PHOTO' ? 4000 : 2200; // UTF-16 characters
        const captionLength = this.getUtf16Length(input.caption);
        
        if (captionLength > maxLength) {
          const mediaTypeLabel = input.mediaType === 'PHOTO' ? 'description' : 'caption';
          throw new Error(`TikTok ${mediaTypeLabel} too long: ${captionLength}/${maxLength} UTF-16 characters`);
        }

        // Get account details
        const account = await this.getAccount(input.accountId);
        
        let result: PublishResult;
        
        if (input.variantUrl) {
          if (input.mediaType === 'VIDEO') {
            result = await this.publishVideo(account, input);
          } else {
            result = await this.publishPhoto(account, input);
          }
        } else {
          throw new Error('TikTok requires media URL for publishing');
        }
        
        // Update rate limit tracking
        await this.updateRateLimit(input.accountId);
        
        // Update post status in database
        await this.updatePostStatus(input.accountId, result.remoteId, 'live');
        
        const duration = Date.now() - start;
        publishLatencyHistogram.record(duration, { platform: 'tiktok' });
        
        this.logger.info({ 
          accountId: input.accountId,
          remoteId: result.remoteId,
          mediaType: input.mediaType,
          duration 
        }, 'TikTok post published successfully');
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - start;
        publishErrorsCounter.add(1, { 
          platform: 'tiktok',
          error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
          error_code: this.extractErrorCode(error)
        });
        
        publishLatencyHistogram.record(duration, { platform: 'tiktok', status: 'error' });
        
        this.logger.error({ 
          err: error,
          accountId: input.accountId,
          duration 
        }, 'TikTok publish failed');
        
        // Update post status to error
        await this.updatePostStatus(input.accountId, null, 'error');
        throw error;
      }
    });
  }

  private async publishVideo(account: TikTokAccount, input: PublishInput): Promise<PublishResult> {
    // TikTok video upload is a multi-step process:
    // 1. Initialize upload
    // 2. Upload video chunks
    // 3. Complete upload and create post
    
    const endpoint = `${this.BASE_URL}/post/publish/video/init/`;
    
    const payload = {
      post_info: {
        title: input.caption,
        privacy_level: 'SELF_ONLY', // Start with private for unaudited apps
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 0, // Will be set during chunk upload
        chunk_size: 10 * 1024 * 1024, // 10MB chunks
        total_chunk_count: 1 // Simplified for now
      }
    };
    
    const response = await this.http.post(endpoint, payload, {
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });
    
    if (!response.data.data?.publish_id) {
      throw new Error('Failed to initialize TikTok video upload');
    }
    
    // For now, return the publish_id as remoteId
    // In a real implementation, you'd upload the video chunks here
    return {
      remoteId: response.data.data.publish_id,
      publishedAt: new Date().toISOString(),
    };
  }

  private async publishPhoto(account: TikTokAccount, input: PublishInput): Promise<PublishResult> {
    const endpoint = `${this.BASE_URL}/post/publish/content/init/`;
    
    const payload = {
      post_info: {
        title: input.caption,
        privacy_level: 'SELF_ONLY', // Start with private for unaudited apps
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: [
          {
            image_url: input.variantUrl
          }
        ]
      }
    };
    
    const response = await this.http.post(endpoint, payload, {
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    });
    
    if (!response.data.data?.publish_id) {
      throw new Error('Failed to publish TikTok photo');
    }
    
    return {
      remoteId: response.data.data.publish_id,
      publishedAt: new Date().toISOString(),
    };
  }

  private async checkRateLimit(accountId: string): Promise<void> {
    const key = `tiktok_rate_limit:${accountId}`;
    const currentMinute = Math.floor(Date.now() / (60 * 1000));
    
    // Get current minute's request count
    const count = await this.cache.get(`${key}:${currentMinute}`) || '0';
    const requests = parseInt(count, 10);
    
    if (requests >= 6) {
      throw new Error('TikTok rate limit exceeded: 6 requests per minute');
    }
  }

  private async updateRateLimit(accountId: string): Promise<void> {
    const key = `tiktok_rate_limit:${accountId}`;
    const currentMinute = Math.floor(Date.now() / (60 * 1000));
    
    // Increment counter for current minute (expires after 2 minutes)
    await this.cache.incr(`${key}:${currentMinute}`);
    await this.cache.expire(`${key}:${currentMinute}`, 120);
  }

  private getUtf16Length(str: string): number {
    // Calculate UTF-16 code units (TikTok's character counting method)
    let length = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      length += code > 0xFFFF ? 2 : 1; // Surrogate pairs count as 2
    }
    return length;
  }

  private extractErrorCode(error: any): string {
    // Extract TikTok-specific error codes for monitoring
    if (error?.response?.data?.error?.code) {
      return error.response.data.error.code;
    }
    if (error?.message?.includes('spam_risk')) {
      return 'spam_risk_detected';
    }
    if (error?.message?.includes('rate_limit_exceeded')) {
      return 'rate_limit_exceeded';
    }
    if (error?.message?.includes('pending_shares_limit')) {
      return 'pending_shares_limit';
    }
    return 'unknown_error';
  }

  private async getAccount(accountId: string): Promise<TikTokAccount> {
    const result = await this.database.query(
      'SELECT id, access_token, platform_account_id as open_id FROM accounts WHERE id = $1 AND platform = $2',
      [accountId, 'tiktok']
    );
    
    if (result.rows.length === 0) {
      throw new Error(`TikTok account not found: ${accountId}`);
    }
    
    const account = result.rows[0];
    if (!account.access_token) {
      throw new Error(`No access token for TikTok account: ${accountId}`);
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