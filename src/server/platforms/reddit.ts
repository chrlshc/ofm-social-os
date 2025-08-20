import fetch from 'node-fetch';
import { PostResult, PostPlatformAdapter } from '../types';

interface RedditSubmitResponse {
  json: {
    errors: string[];
    data?: {
      url: string;
      id: string;
      name: string;
    };
  };
}

interface RedditErrorResponse {
  message?: string;
  error?: string;
  error_description?: string;
}

export class RedditAdapter implements PostPlatformAdapter {
  private readonly baseUrl = 'https://oauth.reddit.com';
  private readonly userAgent = process.env.REDDIT_USER_AGENT || 'ofm-social-os:v1.0.0 (by /u/ofm_social)';
  
  async publishPost(params: {
    accessToken: string;
    caption: string;
    mediaUrl?: string;
    platformSpecific?: any;
  }): Promise<PostResult> {
    const { accessToken, caption, mediaUrl, platformSpecific = {} } = params;
    
    // Extract Reddit-specific params
    const {
      subreddit = 'test', // Default to r/test for safety
      title = caption.slice(0, 300), // Reddit title max 300 chars
      kind = mediaUrl ? 'link' : 'self',
      nsfw = false,
      spoiler = false,
      flair_id,
      flair_text,
      send_replies = true
    } = platformSpecific;
    
    // Build form data
    const formData = new URLSearchParams({
      api_type: 'json',
      sr: subreddit,
      title: title,
      kind: kind,
      nsfw: String(nsfw),
      spoiler: String(spoiler),
      sendreplies: String(send_replies)
    });
    
    // Add content based on kind
    if (kind === 'self') {
      formData.append('text', caption);
    } else if (kind === 'link' && mediaUrl) {
      formData.append('url', mediaUrl);
    }
    
    // Add optional flair
    if (flair_id) {
      formData.append('flair_id', flair_id);
    } else if (flair_text) {
      formData.append('flair_text', flair_text);
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      });
      
      const responseText = await response.text();
      let data: RedditSubmitResponse | RedditErrorResponse;
      
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response from Reddit: ${responseText}`);
      }
      
      // Check for OAuth errors
      if (!response.ok) {
        const errorData = data as RedditErrorResponse;
        const errorMessage = errorData.error_description || 
                           errorData.message || 
                           errorData.error || 
                           `HTTP ${response.status}`;
        
        // Check for common errors
        if (response.status === 401) {
          throw new Error(`Reddit auth failed: ${errorMessage}. Token may be expired.`);
        } else if (response.status === 403) {
          throw new Error(`Reddit forbidden: ${errorMessage}. Check subreddit permissions.`);
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('X-Ratelimit-Reset') || 
                           response.headers.get('Retry-After') || 
                           '60';
          const remaining = response.headers.get('X-Ratelimit-Remaining');
          const used = response.headers.get('X-Ratelimit-Used');
          
          console.log('Reddit rate limit headers:', {
            retryAfter,
            remaining,
            used
          });
          
          throw new Error(`Reddit rate limit: ${errorMessage}. Retry after ${retryAfter}s`);
        }
        
        throw new Error(`Reddit API error ${response.status}: ${errorMessage}`);
      }
      
      // Check for Reddit API errors
      const submitData = data as RedditSubmitResponse;
      if (submitData.json?.errors?.length > 0) {
        const errors = submitData.json.errors.join(', ');
        throw new Error(`Reddit submission failed: ${errors}`);
      }
      
      // Extract post data
      if (!submitData.json?.data?.id) {
        throw new Error('Reddit response missing post data');
      }
      
      const postData = submitData.json.data;
      
      return {
        success: true,
        externalId: postData.id,
        externalUrl: `https://reddit.com${postData.url}`,
        metadata: {
          name: postData.name,
          subreddit: subreddit,
          kind: kind,
          title: title
        }
      };
      
    } catch (error: any) {
      // Log detailed error for debugging
      console.error('Reddit publish error:', {
        message: error.message,
        stack: error.stack,
        subreddit,
        titleLength: title.length,
        captionLength: caption.length,
        hasMedia: !!mediaUrl
      });
      
      return {
        success: false,
        error: error.message || 'Unknown Reddit error',
        metadata: {
          errorType: error.constructor.name,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
  
  async checkPostStatus(params: {
    accessToken: string;
    externalId: string;
  }): Promise<{ exists: boolean; metadata?: any }> {
    const { accessToken, externalId } = params;
    
    try {
      // Reddit uses "t3_" prefix for posts
      const fullname = externalId.startsWith('t3_') ? externalId : `t3_${externalId}`;
      
      const response = await fetch(`${this.baseUrl}/api/info?id=${fullname}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': this.userAgent
        }
      });
      
      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status}`);
      }
      
      const data = await response.json();
      const post = data?.data?.children?.[0]?.data;
      
      if (!post) {
        return { exists: false };
      }
      
      return {
        exists: true,
        metadata: {
          score: post.score,
          num_comments: post.num_comments,
          upvote_ratio: post.upvote_ratio,
          created_utc: post.created_utc,
          permalink: `https://reddit.com${post.permalink}`,
          is_removed: post.removed,
          is_deleted: post.author === '[deleted]',
          is_spam: post.spam,
          is_locked: post.locked
        }
      };
      
    } catch (error: any) {
      console.error('Reddit check status error:', error);
      // Don't throw - return exists: true to avoid re-posting
      return { 
        exists: true, 
        metadata: { 
          error: error.message,
          checked_at: new Date().toISOString()
        } 
      };
    }
  }
}