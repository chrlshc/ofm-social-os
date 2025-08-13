import axios from 'axios';
import { ProfileData, ScraperOptions } from './types';
import { logger } from '../utils/logger';

/**
 * Fetches Reddit profile data using their public JSON API
 */
export async function fetchRedditProfile(
  username: string,
  options: ScraperOptions = {}
): Promise<ProfileData> {
  const { userAgent = 'OFM-Scraper/1.0', timeout = 10000 } = options;
  
  logger.info(`Scraping Reddit profile: ${username}`);
  
  try {
    const url = `https://www.reddit.com/user/${username}/about.json`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent, // Reddit requires a unique user agent
        'Accept': 'application/json',
      },
      timeout,
    });
    
    if (response.status === 200 && response.data?.data) {
      const userData = response.data.data;
      
      // Reddit profile data structure
      return {
        platform: 'reddit',
        username,
        fullName: userData.subreddit?.title || userData.name,
        bio: userData.subreddit?.public_description || '',
        profilePicUrl: userData.icon_img || userData.subreddit?.icon_img,
        followersCount: userData.subreddit?.subscribers,
        metadata: {
          totalKarma: userData.total_karma,
          linkKarma: userData.link_karma,
          commentKarma: userData.comment_karma,
          createdAt: userData.created_utc ? new Date(userData.created_utc * 1000) : undefined,
          isGold: userData.is_gold,
          isMod: userData.is_mod,
          verified: userData.verified,
          hasVerifiedEmail: userData.has_verified_email,
          subredditId: userData.subreddit?.name,
        },
        timestamp: new Date(),
      };
    }
    
    throw new Error('Invalid response from Reddit API');
    
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Reddit user ${username} not found`);
    }
    
    logger.error(`Failed to scrape Reddit profile ${username}:`, error);
    throw new Error(`Reddit scraping failed: ${error.message}`);
  }
}