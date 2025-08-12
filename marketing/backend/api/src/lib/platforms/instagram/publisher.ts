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

export interface InstagramAccount {
  id: string;
  access_token: string;
  instagram_business_account_id: string;
}

export class InstagramPublisher {
  private readonly logger = loggers.publisher.child({ platform: 'instagram' });
  private readonly BASE_URL = 'https://graph.facebook.com/v18.0';

  constructor(
    private http: AxiosInstance,
    private database = db
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    return withSpan('instagram.publish', { 
      account_id: input.accountId,
      media_type: input.mediaType || 'UNKNOWN'
    }, async () => {
      const start = Date.now();
      
      try {
        publishRequestsCounter.add(1, { platform: 'instagram' });
        
        // Validate caption length (Instagram limit: 2200 characters)
        if (input.caption.length > 2200) {
          throw new Error(`Caption too long: ${input.caption.length}/2200 characters`);
        }

        // Get account details
        const account = await this.getAccount(input.accountId);
        
        // Create container (media upload)
        const containerId = await this.createContainer(account, input);
        
        // Publish the container
        const result = await this.publishContainer(account, containerId);
        
        // Update post status in database
        await this.updatePostStatus(input.accountId, result.remoteId, 'live');
        
        const duration = Date.now() - start;
        publishLatencyHistogram.record(duration, { platform: 'instagram' });
        
        this.logger.info({ 
          accountId: input.accountId,
          remoteId: result.remoteId,
          duration 
        }, 'Instagram post published successfully');
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - start;
        publishErrorsCounter.add(1, { 
          platform: 'instagram',
          error_type: error instanceof Error ? error.constructor.name : 'UnknownError'
        });
        
        publishLatencyHistogram.record(duration, { platform: 'instagram', status: 'error' });
        
        this.logger.error({ 
          err: error,
          accountId: input.accountId,
          duration 
        }, 'Instagram publish failed');
        
        // Update post status to error
        await this.updatePostStatus(input.accountId, null, 'error');
        throw error;
      }
    });
  }

  async privateReply(igUserId: string, commentId: string, message: string): Promise<any> {
    return withSpan('instagram.private_reply', { 
      ig_user_id: igUserId,
      comment_id: commentId 
    }, async () => {
      const endpoint = `${this.BASE_URL}/${igUserId}/messages`;
      
      const payload = {
        recipient: { comment_id: commentId },
        message: { text: message }
      };
      
      const response = await this.http.post(endpoint, payload);
      
      // Log DM history
      await this.database.query(
        `INSERT INTO dm_history (comment_id, recipient_username, message_sent, platform, response_data, account_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [commentId, null, message, 'instagram', response.data, igUserId]
      );
      
      this.logger.info({ 
        commentId,
        messageId: response.data.message_id 
      }, 'Instagram private reply sent');
      
      return response.data;
    });
  }

  private async getAccount(accountId: string): Promise<InstagramAccount> {
    const result = await this.database.query(
      'SELECT id, access_token, platform_account_id as instagram_business_account_id FROM accounts WHERE id = $1 AND platform = $2',
      [accountId, 'instagram']
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Instagram account not found: ${accountId}`);
    }
    
    const account = result.rows[0];
    if (!account.access_token) {
      throw new Error(`No access token for Instagram account: ${accountId}`);
    }
    
    return account;
  }

  private async createContainer(account: InstagramAccount, input: PublishInput): Promise<string> {
    const endpoint = `${this.BASE_URL}/${account.instagram_business_account_id}/media`;
    
    const payload: any = {
      caption: input.caption,
      access_token: account.access_token,
    };
    
    // Add media URL if provided
    if (input.variantUrl) {
      if (input.mediaType === 'VIDEO') {
        payload.media_type = 'VIDEO';
        payload.video_url = input.variantUrl;
      } else {
        payload.image_url = input.variantUrl;
      }
    }
    
    const response = await this.http.post(endpoint, payload);
    
    if (!response.data.id) {
      throw new Error('Failed to create Instagram media container');
    }
    
    return response.data.id;
  }

  private async publishContainer(account: InstagramAccount, containerId: string): Promise<PublishResult> {
    const endpoint = `${this.BASE_URL}/${account.instagram_business_account_id}/media_publish`;
    
    const payload = {
      creation_id: containerId,
      access_token: account.access_token,
    };
    
    const response = await this.http.post(endpoint, payload);
    
    if (!response.data.id) {
      throw new Error('Failed to publish Instagram media container');
    }
    
    return {
      remoteId: response.data.id,
      publishedAt: new Date().toISOString(),
      containerRef: containerId,
    };
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