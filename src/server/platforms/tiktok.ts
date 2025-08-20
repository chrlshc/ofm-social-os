import fetch from 'node-fetch';
import { PostResult, PostPlatformAdapter } from '../types';

interface TikTokInitResponse {
  data: {
    publish_id: string;
  };
  error?: {
    code: string;
    message: string;
    log_id: string;
  };
}

interface TikTokStatusResponse {
  data: {
    status: 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'SEND_TO_REVIEW' | 'PUBLISH_COMPLETE' | 'FAILED';
    fail_reason?: string;
    publicaly_available_post_id?: string[];
    uploaded_bytes?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

export class TikTokAdapter implements PostPlatformAdapter {
  private readonly baseUrl = 'https://open.tiktokapis.com/v2';
  private readonly maxPollAttempts = 120; // 10 minutes max
  private readonly pollIntervalMs = 5000; // 5 seconds
  
  async publishPost(params: {
    accessToken: string;
    caption: string;
    mediaUrl?: string;
    platformSpecific?: any;
  }): Promise<PostResult> {
    const { accessToken, caption, mediaUrl, platformSpecific = {} } = params;
    
    if (!mediaUrl) {
      throw new Error('TikTok requires a media URL');
    }
    
    // Extract TikTok-specific params
    const {
      title = caption.slice(0, 150), // TikTok title max 150 chars
      privacy_level = 'PUBLIC', // PUBLIC, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY
      disable_duet = false,
      disable_stitch = false,
      disable_comment = false,
      video_cover_timestamp_ms = 1000,
      brand_content_toggle = false,
      brand_organic_toggle = false
    } = platformSpecific;
    
    try {
      // Step 1: Initialize direct post
      console.log('Initializing TikTok direct post...');
      const initResult = await this.initializeDirectPost({
        accessToken,
        title,
        caption,
        mediaUrl,
        privacyLevel: privacy_level,
        disableDuet: disable_duet,
        disableStitch: disable_stitch,
        disableComment: disable_comment,
        videoCoverTimestampMs: video_cover_timestamp_ms,
        brandContentToggle: brand_content_toggle,
        brandOrganicToggle: brand_organic_toggle
      });
      
      const publishId = initResult.data.publish_id;
      console.log(`TikTok publish initiated with ID: ${publishId}`);
      
      // Step 2: Poll for completion
      console.log('Polling for TikTok publish completion...');
      const publishedPostId = await this.pollForCompletion(publishId, accessToken);
      
      // Build TikTok URL (format may vary)
      const externalUrl = `https://www.tiktok.com/@user/video/${publishedPostId}`;
      
      return {
        success: true,
        externalId: publishedPostId,
        externalUrl: externalUrl,
        metadata: {
          publish_id: publishId,
          privacy_level: privacy_level
        }
      };
      
    } catch (error: any) {
      console.error('TikTok publish error:', error);
      
      return {
        success: false,
        error: error.message || 'Unknown TikTok error',
        metadata: {
          errorType: error.constructor.name,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
  
  private async initializeDirectPost(params: {
    accessToken: string;
    title: string;
    caption: string;
    mediaUrl: string;
    privacyLevel: string;
    disableDuet: boolean;
    disableStitch: boolean;
    disableComment: boolean;
    videoCoverTimestampMs: number;
    brandContentToggle: boolean;
    brandOrganicToggle: boolean;
  }): Promise<TikTokInitResponse> {
    const requestBody = {
      post_info: {
        title: params.title,
        description: params.caption,
        privacy_level: params.privacyLevel,
        disable_duet: params.disableDuet,
        disable_stitch: params.disableStitch,
        disable_comment: params.disableComment,
        video_cover_timestamp_ms: params.videoCoverTimestampMs,
        brand_content_toggle: params.brandContentToggle,
        brand_organic_toggle: params.brandOrganicToggle
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: params.mediaUrl
      }
    };
    
    const response = await fetch(
      `${this.baseUrl}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );
    
    const data = await response.json() as TikTokInitResponse;
    
    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || `HTTP ${response.status}`;
      const errorCode = data.error?.code || 'UNKNOWN';
      
      // Handle specific TikTok errors
      if (errorCode === 'invalid_auth') {
        throw new Error('TikTok authentication failed. Token may be expired.');
      } else if (errorCode === 'spam_risk_too_many_posts') {
        throw new Error('TikTok rate limit: Too many posts. Try again later.');
      } else if (errorCode === 'video_format_not_supported') {
        throw new Error('Video format not supported by TikTok');
      }
      
      throw new Error(`TikTok API error: ${errorMessage} (${errorCode})`);
    }
    
    if (!data.data?.publish_id) {
      throw new Error('No publish ID returned from TikTok');
    }
    
    return data;
  }
  
  private async pollForCompletion(publishId: string, accessToken: string): Promise<string> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const status = await this.checkPublishStatus(publishId, accessToken);
      
      if (status.data.status === 'PUBLISH_COMPLETE') {
        const postId = status.data.publicaly_available_post_id?.[0];
        if (!postId) {
          throw new Error('TikTok publish completed but no post ID returned');
        }
        return postId;
      }
      
      if (status.data.status === 'FAILED') {
        const reason = status.data.fail_reason || 'Unknown reason';
        throw new Error(`TikTok publish failed: ${reason}`);
      }
      
      // Log progress
      if (attempt % 6 === 0) { // Every 30 seconds
        console.log(`TikTok publish status: ${status.data.status}`, {
          uploadedBytes: status.data.uploaded_bytes,
          attempt: attempt + 1
        });
      }
      
      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
    
    throw new Error('Timeout waiting for TikTok publish to complete');
  }
  
  private async checkPublishStatus(publishId: string, accessToken: string): Promise<TikTokStatusResponse> {
    const response = await fetch(
      `${this.baseUrl}/post/publish/status/fetch/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publish_id: publishId
        })
      }
    );
    
    const data = await response.json() as TikTokStatusResponse;
    
    if (!response.ok || data.error) {
      throw new Error(`Failed to check publish status: ${data.error?.message || response.status}`);
    }
    
    return data;
  }
  
  async checkPostStatus(params: {
    accessToken: string;
    externalId: string;
  }): Promise<{ exists: boolean; metadata?: any }> {
    // TikTok doesn't provide a direct API to check individual posts
    // In production, you might need to use the User Videos API
    // For now, we'll assume the post exists if we have an ID
    
    return {
      exists: true,
      metadata: {
        checked_at: new Date().toISOString(),
        note: 'TikTok post status check not implemented'
      }
    };
  }
}