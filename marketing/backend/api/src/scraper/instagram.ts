import axios from 'axios';
import { ProfileData, ScraperOptions } from './types';
import { logger } from '../utils/logger';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Fetches Instagram profile data
 */
export async function fetchInstagramProfile(
  username: string,
  options: ScraperOptions = {}
): Promise<ProfileData> {
  const { userAgent = DEFAULT_USER_AGENT, timeout = 10000 } = options;
  
  logger.info(`Scraping Instagram profile: ${username}`);
  
  try {
    // Try the JSON endpoint first
    const jsonUrl = `https://www.instagram.com/${username}/?__a=1&__d=dis`;
    
    const response = await axios.get(jsonUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout,
      validateStatus: (status) => status < 500,
    });
    
    if (response.status === 200 && response.data) {
      const user = response.data.graphql?.user || response.data.user;
      
      if (user) {
        return {
          platform: 'instagram',
          username,
          fullName: user.full_name,
          bio: user.biography,
          profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url,
          followersCount: user.edge_followed_by?.count || 0,
          followingCount: user.edge_follow?.count || 0,
          postsCount: user.edge_owner_to_timeline_media?.count || 0,
          category: user.category_name || user.business_category_name,
          metadata: {
            isVerified: user.is_verified,
            isBusinessAccount: user.is_business_account,
            externalUrl: user.external_url,
          },
          timestamp: new Date(),
        };
      }
    }
    
    // Fallback: Try HTML scraping
    const htmlUrl = `https://www.instagram.com/${username}/`;
    const htmlResponse = await axios.get(htmlUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout,
    });
    
    if (htmlResponse.status === 200) {
      const html = htmlResponse.data;
      
      // Extract data from script tags
      const scriptMatch = html.match(/<script[^>]*>window\._sharedData\s*=\s*({.+?});<\/script>/);
      
      if (scriptMatch) {
        const sharedData = JSON.parse(scriptMatch[1]);
        const user = sharedData.entry_data?.ProfilePage?.[0]?.graphql?.user;
        
        if (user) {
          return {
            platform: 'instagram',
            username,
            fullName: user.full_name,
            bio: user.biography,
            profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url,
            followersCount: user.edge_followed_by?.count || 0,
            followingCount: user.edge_follow?.count || 0,
            postsCount: user.edge_owner_to_timeline_media?.count || 0,
            category: user.category_name,
            metadata: {
              isVerified: user.is_verified,
              isBusinessAccount: user.is_business_account,
              externalUrl: user.external_url,
            },
            timestamp: new Date(),
          };
        }
      }
    }
    
    throw new Error('Failed to extract Instagram profile data');
    
  } catch (error) {
    logger.error(`Failed to scrape Instagram profile ${username}:`, error);
    throw new Error(`Instagram scraping failed: ${error.message}`);
  }
}