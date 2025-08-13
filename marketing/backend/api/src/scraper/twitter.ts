import axios from 'axios';
import { ProfileData, ScraperOptions } from './types';
import { logger } from '../utils/logger';

/**
 * Fetches Twitter/X profile data
 * Note: Twitter heavily restricts unauthenticated access
 * This implementation requires API credentials or will have limited functionality
 */
export async function fetchTwitterProfile(
  username: string,
  options: ScraperOptions = {}
): Promise<ProfileData> {
  const { timeout = 10000 } = options;
  
  logger.info(`Attempting to scrape Twitter profile: ${username}`);
  
  try {
    // Check if we have Twitter API credentials
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    
    if (bearerToken) {
      // Use Twitter API v2
      const apiUrl = `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics,description,profile_image_url,verified,created_at`;
      
      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Accept': 'application/json',
        },
        timeout,
      });
      
      if (response.status === 200 && response.data?.data) {
        const user = response.data.data;
        
        return {
          platform: 'twitter',
          username,
          fullName: user.name,
          bio: user.description,
          profilePicUrl: user.profile_image_url?.replace('_normal', '_400x400'),
          followersCount: user.public_metrics?.followers_count,
          followingCount: user.public_metrics?.following_count,
          postsCount: user.public_metrics?.tweet_count,
          metadata: {
            verified: user.verified,
            createdAt: user.created_at,
            userId: user.id,
          },
          timestamp: new Date(),
        };
      }
    }
    
    // Fallback: Limited HTML scraping (often blocked)
    logger.warn('No Twitter API token found, attempting limited HTML scraping');
    
    const url = `https://twitter.com/${username}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout,
      validateStatus: (status) => status < 500,
    });
    
    if (response.status === 200) {
      const html = response.data;
      
      // Try to extract from meta tags
      const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
      const bioMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
      
      if (nameMatch) {
        return {
          platform: 'twitter',
          username,
          fullName: nameMatch[1].replace(/ \(@[^)]+\)/, ''),
          bio: bioMatch?.[1] || '(Twitter data requires API access)',
          profilePicUrl: imageMatch?.[1],
          metadata: {
            note: 'Limited data due to Twitter restrictions',
          },
          timestamp: new Date(),
        };
      }
    }
    
    throw new Error('Twitter profile not accessible without API credentials');
    
  } catch (error) {
    logger.error(`Failed to scrape Twitter profile ${username}:`, error);
    
    // Return minimal data with error note
    return {
      platform: 'twitter',
      username,
      bio: '(Twitter data requires API access)',
      metadata: {
        error: error.message,
        note: 'Twitter/X requires API credentials for full profile data',
      },
      timestamp: new Date(),
    };
  }
}