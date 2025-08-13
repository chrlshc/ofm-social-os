import { TopProfile } from '../models/TopProfile';
import { logger } from '../utils/logger';

export interface TrainingData {
  bios: string[];
  features: number[][];
  metadata: Array<{
    id: string;
    platform: string;
    username: string;
    followersCount?: number;
  }>;
}

/**
 * Prepares training data from the top profiles database
 */
export async function prepareTrainingData(): Promise<TrainingData> {
  logger.info('Preparing training data for ML model');
  
  try {
    // Fetch all profiles with bio data
    const profiles = await TopProfile.findAll({
      where: {
        bio: {
          $ne: null,
          $ne: '',
        },
      },
      order: [['followersCount', 'DESC']],
    });
    
    logger.info(`Found ${profiles.length} profiles with bio data`);
    
    const bios: string[] = [];
    const features: number[][] = [];
    const metadata: TrainingData['metadata'] = [];
    
    for (const profile of profiles) {
      // Clean and normalize bio text
      const cleanedBio = cleanBioText(profile.bio || '');
      
      // Skip if bio is too short after cleaning
      if (cleanedBio.length < 10) continue;
      
      bios.push(cleanedBio);
      
      // Extract numerical features
      const profileFeatures = [
        Math.log10((profile.followersCount || 0) + 1), // Log scale for followers
        Math.log10((profile.followingCount || 0) + 1),
        Math.log10((profile.postsCount || 0) + 1),
        Math.log10((profile.likesCount || 0) + 1),
        profile.platform === 'instagram' ? 1 : 0,
        profile.platform === 'tiktok' ? 1 : 0,
        profile.platform === 'twitter' ? 1 : 0,
        profile.platform === 'reddit' ? 1 : 0,
      ];
      
      features.push(profileFeatures);
      
      metadata.push({
        id: profile.id,
        platform: profile.platform,
        username: profile.username,
        followersCount: profile.followersCount,
      });
    }
    
    logger.info(`Prepared ${bios.length} samples for training`);
    
    return { bios, features, metadata };
    
  } catch (error) {
    logger.error('Failed to prepare training data:', error);
    throw error;
  }
}

/**
 * Cleans bio text for ML processing
 */
export function cleanBioText(bio: string): string {
  // Convert to lowercase
  let cleaned = bio.toLowerCase();
  
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');
  
  // Remove email addresses
  cleaned = cleaned.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '');
  
  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Remove special characters but keep alphanumeric and basic punctuation
  cleaned = cleaned.replace(/[^\w\s.,!?-]/g, '');
  
  // Trim
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * Extracts keywords from bio text for categorization
 */
export function extractKeywords(bio: string): string[] {
  const cleaned = cleanBioText(bio);
  
  // Common stop words to filter out
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for',
    'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on',
    'that', 'the', 'to', 'was', 'will', 'with', 'the', 'i', 'me',
    'my', 'we', 'you', 'your', 'am', 'or', 'but', 'so', 'if',
  ]);
  
  // Split into words and filter
  const words = cleaned
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  // Count word frequency
  const wordFreq = new Map<string, number>();
  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }
  
  // Sort by frequency and return top keywords
  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}