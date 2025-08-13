import { ProfileData, ScraperOptions } from './types';
import { fetchInstagramProfile } from './instagram';
import { fetchTikTokProfile } from './tiktok';
import { fetchTwitterProfile } from './twitter';
import { fetchRedditProfile } from './reddit';
import { TopProfile } from '../models/TopProfile';
import { logger } from '../utils/logger';

// Platform scraper mapping
const scrapers = {
  instagram: fetchInstagramProfile,
  tiktok: fetchTikTokProfile,
  twitter: fetchTwitterProfile,
  reddit: fetchRedditProfile,
};

export interface ScrapeProfilesOptions {
  platforms: Record<string, string[]>;
  options?: ScraperOptions;
  saveToDb?: boolean;
}

/**
 * Scrapes profiles from multiple platforms
 */
export async function scrapeProfiles({
  platforms,
  options = {},
  saveToDb = true,
}: ScrapeProfilesOptions): Promise<{
  successful: ProfileData[];
  failed: Array<{ platform: string; username: string; error: string }>;
}> {
  const successful: ProfileData[] = [];
  const failed: Array<{ platform: string; username: string; error: string }> = [];
  
  logger.info(`Starting profile scraping for ${Object.keys(platforms).length} platforms`);
  
  for (const [platform, usernames] of Object.entries(platforms)) {
    const scraper = scrapers[platform];
    
    if (!scraper) {
      logger.warn(`No scraper available for platform: ${platform}`);
      continue;
    }
    
    for (const username of usernames) {
      try {
        logger.info(`Scraping ${platform}/${username}`);
        
        // Add delay between requests
        if (successful.length > 0 || failed.length > 0) {
          const delay = options.delayMs || 1000 + Math.random() * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Scrape the profile
        const profileData = await scraper(username, options);
        successful.push(profileData);
        
        // Save to database if enabled
        if (saveToDb) {
          await saveProfileToDB(profileData);
        }
        
        logger.info(`Successfully scraped ${platform}/${username}: ${profileData.followersCount || 0} followers`);
        
      } catch (error) {
        logger.error(`Failed to scrape ${platform}/${username}:`, error);
        failed.push({
          platform,
          username,
          error: error.message || 'Unknown error',
        });
      }
    }
  }
  
  logger.info(`Scraping completed: ${successful.length} successful, ${failed.length} failed`);
  
  return { successful, failed };
}

/**
 * Saves or updates a profile in the database
 */
export async function saveProfileToDB(profile: ProfileData): Promise<void> {
  try {
    const profileData = {
      platform: profile.platform,
      username: profile.username,
      fullName: profile.fullName,
      bio: profile.bio,
      profilePicUrl: profile.profilePicUrl,
      followersCount: profile.followersCount,
      followingCount: profile.followingCount,
      postsCount: profile.postsCount,
      likesCount: profile.likesCount,
      category: profile.category,
      metadata: profile.metadata,
      scrapedAt: profile.timestamp,
    };
    
    await TopProfile.upsert(profileData, {
      conflictFields: ['platform', 'username'],
    });
    
    logger.debug(`Saved profile ${profile.platform}/${profile.username} to database`);
  } catch (error) {
    logger.error(`Failed to save profile to database:`, error);
    throw error;
  }
}

/**
 * Gets a list of target profiles to scrape
 * This can be expanded to pull from a config file or API
 */
export function getTargetProfiles(): Record<string, string[]> {
  // Example profiles - in production, this would come from a config or database
  return {
    instagram: [
      'kimkardashian',
      'therock',
      'arianagrande',
      'kyliejenner',
      'leomessi',
    ],
    tiktok: [
      'charlidamelio',
      'khaby.lame',
      'bellapoarch',
      'addisonre',
      'zachking',
    ],
    reddit: [
      'GovSchwarzenegger',
      'thisisbillgates',
      'spez',
    ],
    // Twitter requires API token, so fewer examples
    twitter: process.env.TWITTER_BEARER_TOKEN ? [
      'elonmusk',
      'BarackObama',
      'rihanna',
    ] : [],
  };
}

// Export individual scrapers for direct use
export {
  fetchInstagramProfile,
  fetchTikTokProfile,
  fetchTwitterProfile,
  fetchRedditProfile,
};