/**
 * Instagram Private Reply Implementation
 * Endpoint: /{ig_user_id}/messages with recipient: { comment_id }
 * Limitation: 1 seule réponse privée par commentaire
 */

import axios from 'axios';
import { logger } from '../../logger';

interface PrivateReplyRequest {
  igUserId: string;
  accessToken: string;
  commentId: string;
  message: string;
  creatorId: string;
}

interface PrivateReplyResponse {
  messageId: string;
  success: boolean;
  error?: string;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
  };
}

export class InstagramPrivateReply {
  private static readonly BASE_URL = 'https://graph.instagram.com';
  
  /**
   * Send private reply to comment
   * Meta Docs: https://developers.facebook.com/docs/instagram-api/guides/comment-moderation/
   */
  static async sendPrivateReply(request: PrivateReplyRequest): Promise<PrivateReplyResponse> {
    const { igUserId, accessToken, commentId, message, creatorId } = request;
    
    try {
      logger.info('Sending Instagram private reply', {
        igUserId,
        commentId: commentId.substring(0, 10) + '...',
        messageLength: message.length,
        creatorId
      });
      
      // Check if already replied to this comment (1 reply per comment limit)
      const existingReply = await this.checkExistingReply(commentId, creatorId);
      if (existingReply) {
        throw new Error(`Already replied to comment ${commentId}. Instagram allows only 1 private reply per comment.`);
      }
      
      const endpoint = `${this.BASE_URL}/${igUserId}/messages`;
      const payload = {
        recipient: {
          comment_id: commentId
        },
        message: {
          text: message
        },
        access_token: accessToken
      };
      
      const response = await axios.post(endpoint, payload, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OFM-Social-OS/1.0'
        }
      });
      
      // Track the reply to prevent duplicates
      await this.trackReply(commentId, response.data.message_id, creatorId);
      
      logger.info('Instagram private reply sent successfully', {
        messageId: response.data.message_id,
        commentId,
        creatorId
      });
      
      return {
        messageId: response.data.message_id,
        success: true
      };
      
    } catch (error: any) {
      if (error.response?.status === 429) {
        // Rate limit exceeded
        const resetTime = error.response.headers['x-app-usage-reset-time'] || Date.now() + 3600000; // 1h fallback
        
        logger.warn('Instagram private reply rate limited', {
          commentId,
          resetTime,
          creatorId,
          rateLimitHeaders: error.response.headers
        });
        
        return {
          messageId: '',
          success: false,
          error: 'Rate limit exceeded',
          rateLimitInfo: {
            remaining: 0,
            resetTime: parseInt(resetTime)
          }
        };
      }
      
      if (error.response?.data?.error) {
        const igError = error.response.data.error;
        logger.error('Instagram private reply API error', {
          error: igError,
          commentId,
          creatorId,
          code: igError.code,
          subcode: igError.error_subcode
        });
        
        return {
          messageId: '',
          success: false,
          error: `Instagram API Error: ${igError.message} (${igError.code})`
        };
      }
      
      logger.error('Instagram private reply unexpected error', {
        error: error.message,
        commentId,
        creatorId
      });
      
      throw error;
    }
  }
  
  /**
   * Check if we already replied to this comment
   * Instagram limitation: 1 private reply per comment
   */
  private static async checkExistingReply(commentId: string, creatorId: string): Promise<boolean> {
    const db = require('../../db');
    
    const result = await db.query(`
      SELECT id FROM dm_history 
      WHERE comment_id = $1 
      AND creator_id = $2 
      AND platform = 'instagram'
      AND reply_type = 'private_reply'
      LIMIT 1
    `, [commentId, creatorId]);
    
    return result.rows.length > 0;
  }
  
  /**
   * Track sent reply to prevent duplicates
   */
  private static async trackReply(commentId: string, messageId: string, creatorId: string): Promise<void> {
    const db = require('../../db');
    
    await db.query(`
      INSERT INTO dm_history (creator_id, platform, comment_id, message_id, reply_type, sent_at)
      VALUES ($1, 'instagram', $2, $3, 'private_reply', NOW())
    `, [creatorId, commentId, messageId]);
  }
  
  /**
   * Get private reply rate limit status
   */
  static async getRateLimitStatus(igUserId: string, accessToken: string): Promise<{
    remaining: number;
    resetTime: number;
  }> {
    try {
      const response = await axios.get(`${this.BASE_URL}/${igUserId}?fields=id&access_token=${accessToken}`, {
        timeout: 10000
      });
      
      const usage = response.headers['x-app-usage'];
      if (usage) {
        const usageData = JSON.parse(usage);
        return {
          remaining: 100 - (usageData.call_count || 0),
          resetTime: Date.now() + 3600000 // 1h reset window
        };
      }
      
      return { remaining: 100, resetTime: Date.now() + 3600000 };
      
    } catch (error: any) {
      logger.warn('Failed to get Instagram rate limit status', {
        error: error.message,
        igUserId
      });
      
      return { remaining: 0, resetTime: Date.now() + 3600000 };
    }
  }
}