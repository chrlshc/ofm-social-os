import axios from 'axios';
import { ProfileData, ScraperOptions } from './types';
import { logger } from '../utils/logger';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Fetches TikTok profile data
 */
export async function fetchTikTokProfile(
  username: string,
  options: ScraperOptions = {}
): Promise<ProfileData> {
  const { userAgent = DEFAULT_USER_AGENT, timeout = 10000 } = options;
  
  logger.info(`Scraping TikTok profile: ${username}`);
  
  try {
    const url = `https://www.tiktok.com/@${username}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      timeout,
    });
    
    if (response.status === 200) {
      const html = response.data;
      
      // Look for SIGI_STATE or __UNIVERSAL_DATA_FOR_REHYDRATION__
      const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>(.+?)<\/script>/);
      const universalMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.+?)<\/script>/);
      
      let userData;
      
      if (sigiMatch) {
        const sigiData = JSON.parse(sigiMatch[1]);
        userData = Object.values(sigiData.UserModule?.users || {})[0] as any;
      } else if (universalMatch) {
        const universalData = JSON.parse(universalMatch[1]);
        userData = universalData.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
      }
      
      if (userData) {
        return {
          platform: 'tiktok',
          username,
          fullName: userData.nickname,
          bio: userData.signature,
          profilePicUrl: userData.avatarLarger || userData.avatarMedium || userData.avatarThumb,
          followersCount: userData.stats?.followerCount || 0,
          followingCount: userData.stats?.followingCount || 0,
          postsCount: userData.stats?.videoCount || 0,
          likesCount: userData.stats?.heartCount || 0,
          metadata: {
            userId: userData.id,
            secUid: userData.secUid,
            verified: userData.verified,
            privateAccount: userData.privateAccount,
          },
          timestamp: new Date(),
        };
      }
      
      // Fallback: Try to extract from meta tags or JSON-LD
      const metaDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
      const followersMatch = html.match(/(\d+(?:\.\d+)?[KMB]?)\s*Followers/i);
      const likesMatch = html.match(/(\d+(?:\.\d+)?[KMB]?)\s*Likes/i);
      
      if (metaDescMatch || followersMatch) {
        return {
          platform: 'tiktok',
          username,
          bio: metaDescMatch?.[1],
          followersCount: followersMatch ? parseCount(followersMatch[1]) : undefined,
          likesCount: likesMatch ? parseCount(likesMatch[1]) : undefined,
          timestamp: new Date(),
        };
      }
    }
    
    throw new Error('Failed to extract TikTok profile data');
    
  } catch (error) {
    logger.error(`Failed to scrape TikTok profile ${username}:`, error);
    throw new Error(`TikTok scraping failed: ${error.message}`);
  }
}

/**
 * Parses count strings like "1.2K", "3.5M" to numbers
 */
function parseCount(countStr: string): number {
  const num = parseFloat(countStr);
  if (countStr.includes('K')) return num * 1000;
  if (countStr.includes('M')) return num * 1000000;
  if (countStr.includes('B')) return num * 1000000000;
  return num;
}