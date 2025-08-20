import fetch from 'node-fetch';
import { PostResult, PostPlatformAdapter } from '../types';

interface IGContainerResponse {
  id: string;
}

interface IGPublishResponse {
  id: string;
}

interface IGStatusResponse {
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
  id?: string;
  permalink?: string;
  error_message?: string;
}

export class InstagramAdapter implements PostPlatformAdapter {
  private readonly baseUrl = process.env.GRAPH_API_VERSION 
    ? `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}`
    : 'https://graph.facebook.com/v20.0';
  private readonly maxPollAttempts = 60; // 5 minutes max
  private readonly pollIntervalMs = 5000; // 5 seconds
  
  async publishPost(params: {
    accessToken: string;
    caption: string;
    mediaUrl?: string;
    platformSpecific?: any;
  }): Promise<PostResult> {
    const { accessToken, caption, mediaUrl, platformSpecific = {} } = params;
    
    // Extract Instagram-specific params
    const {
      ig_user_id,
      media_type = mediaUrl ? 'REELS' : 'IMAGE', // Default to REELS for video
      cover_url,
      thumb_offset,
      location_id,
      user_tags,
      product_tags,
      share_to_feed = false
    } = platformSpecific;
    
    if (!ig_user_id) {
      throw new Error('Instagram user ID (ig_user_id) is required');
    }
    
    if (!mediaUrl) {
      throw new Error('Instagram requires a media URL');
    }
    
    try {
      // Step 1: Create media container
      console.log('Creating Instagram media container...');
      const containerId = await this.createMediaContainer({
        igUserId: ig_user_id,
        accessToken,
        caption,
        mediaUrl,
        mediaType: media_type,
        coverUrl: cover_url,
        thumbOffset: thumb_offset,
        locationId: location_id,
        userTags: user_tags,
        productTags: product_tags,
        shareToFeed: share_to_feed
      });
      
      // Step 2: Wait for container to be ready
      console.log('Waiting for container to be ready...');
      await this.waitForContainer(containerId, accessToken);
      
      // Step 3: Publish the media
      console.log('Publishing Instagram media...');
      const publishResult = await this.publishContainer({
        igUserId: ig_user_id,
        containerId,
        accessToken
      });
      
      // Step 4: Get permalink
      const permalink = await this.getMediaPermalink(publishResult.id, accessToken);
      
      return {
        success: true,
        externalId: publishResult.id,
        externalUrl: permalink,
        metadata: {
          container_id: containerId,
          media_type: media_type,
          shared_to_feed: share_to_feed
        }
      };
      
    } catch (error: any) {
      console.error('Instagram publish error:', error);
      
      return {
        success: false,
        error: error.message || 'Unknown Instagram error',
        metadata: {
          errorType: error.constructor.name,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
  
  private async createMediaContainer(params: {
    igUserId: string;
    accessToken: string;
    caption: string;
    mediaUrl: string;
    mediaType: string;
    coverUrl?: string;
    thumbOffset?: number;
    locationId?: string;
    userTags?: any[];
    productTags?: any[];
    shareToFeed?: boolean;
  }): Promise<string> {
    const formData = new URLSearchParams({
      access_token: params.accessToken,
      caption: params.caption
    });
    
    // Add media based on type
    if (params.mediaType === 'REELS') {
      formData.append('media_type', 'REELS');
      formData.append('video_url', params.mediaUrl);
      
      if (params.coverUrl) {
        formData.append('cover_url', params.coverUrl);
      }
      if (params.thumbOffset !== undefined) {
        formData.append('thumb_offset', params.thumbOffset.toString());
      }
      if (params.shareToFeed !== undefined) {
        formData.append('share_to_feed', params.shareToFeed.toString());
      }
    } else if (params.mediaType === 'VIDEO') {
      formData.append('media_type', 'VIDEO');
      formData.append('video_url', params.mediaUrl);
    } else {
      // Default to IMAGE
      formData.append('image_url', params.mediaUrl);
    }
    
    // Add optional params
    if (params.locationId) {
      formData.append('location_id', params.locationId);
    }
    if (params.userTags?.length) {
      formData.append('user_tags', JSON.stringify(params.userTags));
    }
    if (params.productTags?.length) {
      formData.append('product_tags', JSON.stringify(params.productTags));
    }
    
    const response = await fetch(
      `${this.baseUrl}/${params.igUserId}/media`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      }
    );
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || `HTTP ${response.status}`;
      throw new Error(`Failed to create media container: ${errorMessage}`);
    }
    
    if (!data.id) {
      throw new Error('No container ID returned from Instagram');
    }
    
    return data.id;
  }
  
  private async waitForContainer(containerId: string, accessToken: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const status = await this.checkContainerStatus(containerId, accessToken);
      
      if (status.status_code === 'FINISHED') {
        return;
      }
      
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new Error(
          `Container ${status.status_code}: ${status.error_message || 'Unknown error'}`
        );
      }
      
      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
    
    throw new Error('Timeout waiting for media container to be ready');
  }
  
  private async checkContainerStatus(containerId: string, accessToken: string): Promise<IGStatusResponse> {
    const response = await fetch(
      `${this.baseUrl}/${containerId}?fields=status_code,status,error_message&access_token=${accessToken}`
    );
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(`Failed to check container status: ${data.error?.message || response.status}`);
    }
    
    return data;
  }
  
  private async publishContainer(params: {
    igUserId: string;
    containerId: string;
    accessToken: string;
  }): Promise<IGPublishResponse> {
    const response = await fetch(
      `${this.baseUrl}/${params.igUserId}/media_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          creation_id: params.containerId,
          access_token: params.accessToken
        }).toString()
      }
    );
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(`Failed to publish media: ${data.error?.message || response.status}`);
    }
    
    if (!data.id) {
      throw new Error('No media ID returned from publish');
    }
    
    return data;
  }
  
  private async getMediaPermalink(mediaId: string, accessToken: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.baseUrl}/${mediaId}?fields=permalink&access_token=${accessToken}`
      );
      
      const data = await response.json();
      
      if (data.permalink) {
        return data.permalink;
      }
    } catch (error) {
      console.error('Failed to get permalink:', error);
    }
    
    // Fallback to Instagram URL format
    return `https://www.instagram.com/p/${mediaId}/`;
  }
  
  async checkPostStatus(params: {
    accessToken: string;
    externalId: string;
  }): Promise<{ exists: boolean; metadata?: any }> {
    const { accessToken, externalId } = params;
    
    try {
      const response = await fetch(
        `${this.baseUrl}/${externalId}?fields=id,permalink,caption,timestamp,like_count,comments_count&access_token=${accessToken}`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          return { exists: false };
        }
        throw new Error(`Instagram API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        exists: true,
        metadata: {
          permalink: data.permalink,
          caption: data.caption,
          timestamp: data.timestamp,
          like_count: data.like_count,
          comments_count: data.comments_count
        }
      };
      
    } catch (error: any) {
      console.error('Instagram check status error:', error);
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