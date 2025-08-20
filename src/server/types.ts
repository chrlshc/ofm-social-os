// Platform types
export type SupportedPlatform = 'reddit' | 'instagram' | 'tiktok';

// Post result from platform adapters
export interface PostResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
  metadata?: Record<string, any>;
}

// Platform adapter interface
export interface PostPlatformAdapter {
  publishPost(params: {
    accessToken: string;
    caption: string;
    mediaUrl?: string;
    platformSpecific?: any;
  }): Promise<PostResult>;
  
  checkPostStatus?(params: {
    accessToken: string;
    externalId: string;
  }): Promise<{ exists: boolean; metadata?: any }>;
}

// Database types
export interface PlatformAccount {
  id: number;
  user_id: number;
  platform: SupportedPlatform;
  username: string;
  external_id: string;
  scopes: string[];
  access_token_encrypted: string;
  refresh_token_encrypted?: string;
  expires_at?: Date;
  meta_json?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduledPost {
  id: number;
  owner_id: number;
  platform: SupportedPlatform;
  caption: string;
  media_url?: string;
  scheduled_at: Date;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  external_post_id?: string;
  external_post_url?: string;
  error_message?: string;
  attempts: number;
  platform_account_id?: number;
  meta_json?: Record<string, any>;
  dedupe_key?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PostLog {
  id: number;
  scheduled_post_id: number;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: Record<string, any>;
  created_at: Date;
}

// Job types
export interface PublishPostJobData {
  scheduled_post_id: number;
  platform: SupportedPlatform;
  owner_id: number;
  caption: string;
  media_url?: string;
  platform_account_id?: number;
  platform_specific?: Record<string, any>;
}

// API types
export interface ApiError {
  error: string;
  code?: string;
  details?: any;
}