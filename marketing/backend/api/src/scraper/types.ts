export interface ProfileData {
  platform: string;
  username: string;
  fullName?: string;
  bio?: string;
  profilePicUrl?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  likesCount?: number;
  category?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface ScraperOptions {
  userAgent?: string;
  timeout?: number;
  maxRetries?: number;
  delayMs?: number;
}

export interface ScraperResult {
  success: boolean;
  data?: ProfileData;
  error?: string;
}

export type PlatformScraper = (username: string, options?: ScraperOptions) => Promise<ProfileData>;