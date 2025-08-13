import { TfIdfVectorizer, KMeansClustering } from './textVectorizer';
import { prepareTrainingData, cleanBioText } from './dataPrep';
import { TopProfile } from '../models/TopProfile';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ModelData {
  vectorizer: any;
  centroids: number[][];
  clusterNames: string[];
  clusterStats: Array<{
    size: number;
    avgFollowers: number;
    topKeywords: string[];
  }>;
}

export interface ContentPlanAdvice {
  category: string;
  cluster: number;
  recommendedPostingTimes: string[];
  recommendedContentTypes: string[];
  recommendedHashtags: string[];
  notes: string;
}

// Predefined category mappings based on keywords
const CATEGORY_KEYWORDS = {
  fitness: ['fitness', 'gym', 'workout', 'training', 'health', 'muscle', 'yoga', 'coach', 'personal trainer'],
  travel: ['travel', 'wanderlust', 'explore', 'adventure', 'destination', 'nomad', 'journey'],
  fashion: ['fashion', 'style', 'outfit', 'clothing', 'designer', 'model', 'beauty', 'makeup'],
  food: ['food', 'cooking', 'chef', 'recipe', 'restaurant', 'foodie', 'culinary'],
  gaming: ['gaming', 'gamer', 'streamer', 'twitch', 'esports', 'game', 'playstation', 'xbox'],
  tech: ['tech', 'developer', 'programmer', 'software', 'startup', 'entrepreneur', 'code'],
  lifestyle: ['lifestyle', 'blogger', 'influencer', 'content creator', 'vlog', 'daily'],
  adult: ['onlyfans', 'of', 'adult', 'content', 'exclusive', 'premium', 'subscription'],
};

/**
 * Trains a content categorization model
 */
export async function trainAndSaveModel(): Promise<void> {
  logger.info('Starting content categorization model training');
  
  try {
    // Prepare training data
    const { bios, features, metadata } = await prepareTrainingData();
    
    if (bios.length < 10) {
      logger.warn('Not enough data for training (need at least 10 profiles)');
      return;
    }
    
    // Vectorize bio text
    const vectorizer = new TfIdfVectorizer();
    const bioVectors = vectorizer.fitTransform(bios);
    
    // Determine optimal number of clusters (between 5 and 10)
    const k = Math.min(Math.max(5, Math.floor(bios.length / 20)), 10);
    
    // Perform clustering
    const kmeans = new KMeansClustering(k);
    kmeans.fit(bioVectors);
    
    const labels = kmeans.getLabels();
    const centroids = kmeans.getCentroids();
    
    // Analyze clusters
    const clusterNames: string[] = [];
    const clusterStats: ModelData['clusterStats'] = [];
    
    for (let i = 0; i < k; i++) {
      // Get profiles in this cluster
      const clusterIndices = labels
        .map((label, idx) => ({ label, idx }))
        .filter(item => item.label === i)
        .map(item => item.idx);
      
      if (clusterIndices.length === 0) {
        clusterNames.push(`Cluster ${i}`);
        clusterStats.push({
          size: 0,
          avgFollowers: 0,
          topKeywords: [],
        });
        continue;
      }
      
      // Get top keywords for this cluster
      const topKeywords = vectorizer.getTopFeatures(centroids[i], 15);
      
      // Determine category name based on keywords
      let categoryName = `Cluster ${i}`;
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const matchCount = topKeywords.filter(kw => 
          keywords.some(catKw => kw.includes(catKw))
        ).length;
        
        if (matchCount >= 2) {
          categoryName = category.charAt(0).toUpperCase() + category.slice(1);
          break;
        }
      }
      
      clusterNames.push(categoryName);
      
      // Calculate cluster statistics
      const clusterProfiles = clusterIndices.map(idx => metadata[idx]);
      const avgFollowers = clusterProfiles.reduce((sum, p) => sum + (p.followersCount || 0), 0) / clusterProfiles.length;
      
      clusterStats.push({
        size: clusterIndices.length,
        avgFollowers: Math.round(avgFollowers),
        topKeywords: topKeywords.slice(0, 10),
      });
      
      logger.info(`Cluster ${i} (${categoryName}): ${clusterIndices.length} profiles, top keywords: ${topKeywords.slice(0, 5).join(', ')}`);
    }
    
    // Update database with cluster assignments
    for (let i = 0; i < labels.length; i++) {
      const profile = metadata[i];
      const cluster = labels[i];
      const category = clusterNames[cluster];
      
      await TopProfile.update(
        { cluster, category },
        { where: { id: profile.id } }
      );
    }
    
    // Save model data
    const modelData: ModelData = {
      vectorizer: {
        vocabulary: Array.from(vectorizer['vocabulary'].entries()),
        idfValues: Array.from(vectorizer['idfValues'].entries()),
      },
      centroids,
      clusterNames,
      clusterStats,
    };
    
    const modelPath = path.join(__dirname, '../../data/content_model.json');
    await fs.mkdir(path.dirname(modelPath), { recursive: true });
    await fs.writeFile(modelPath, JSON.stringify(modelData, null, 2));
    
    logger.info('Model training completed and saved');
    
  } catch (error) {
    logger.error('Failed to train model:', error);
    throw error;
  }
}

/**
 * Loads the trained model
 */
async function loadModel(): Promise<ModelData | null> {
  try {
    const modelPath = path.join(__dirname, '../../data/content_model.json');
    const data = await fs.readFile(modelPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.warn('No trained model found');
    return null;
  }
}

/**
 * Suggests content strategy based on user profile
 */
export async function suggestContentStrategy(userBio: string): Promise<ContentPlanAdvice> {
  const model = await loadModel();
  
  if (!model) {
    // Fallback: Rule-based categorization
    return getRuleBasedAdvice(userBio);
  }
  
  try {
    // Recreate vectorizer
    const vectorizer = new TfIdfVectorizer();
    vectorizer['vocabulary'] = new Map(model.vectorizer.vocabulary);
    vectorizer['idfValues'] = new Map(model.vectorizer.idfValues);
    
    // Vectorize user bio
    const cleanedBio = cleanBioText(userBio);
    const bioVector = vectorizer.transform([cleanedBio])[0];
    
    // Find nearest cluster
    let minDist = Infinity;
    let nearestCluster = 0;
    
    for (let i = 0; i < model.centroids.length; i++) {
      const dist = euclideanDistance(bioVector, model.centroids[i]);
      if (dist < minDist) {
        minDist = dist;
        nearestCluster = i;
      }
    }
    
    const category = model.clusterNames[nearestCluster];
    const stats = model.clusterStats[nearestCluster];
    
    // Generate advice based on cluster
    return generateAdvice(category, nearestCluster, stats);
    
  } catch (error) {
    logger.error('Failed to use trained model:', error);
    return getRuleBasedAdvice(userBio);
  }
}

/**
 * Generates content advice based on category
 */
function generateAdvice(
  category: string,
  cluster: number,
  stats: ModelData['clusterStats'][0]
): ContentPlanAdvice {
  const categoryLower = category.toLowerCase();
  
  const adviceMap: Record<string, ContentPlanAdvice> = {
    fitness: {
      category,
      cluster,
      recommendedPostingTimes: ['6:00 AM', '12:00 PM', '6:00 PM'],
      recommendedContentTypes: ['Workout videos', 'Progress photos', 'Nutrition tips', 'Training routines'],
      recommendedHashtags: ['fitness', 'workout', 'gymlife', 'fitfam', 'healthylifestyle'],
      notes: 'Fitness content performs best in early morning and evening. Focus on transformation stories and actionable tips.',
    },
    travel: {
      category,
      cluster,
      recommendedPostingTimes: ['8:00 AM', '1:00 PM', '7:00 PM'],
      recommendedContentTypes: ['Destination photos', 'Travel vlogs', 'Local culture', 'Travel tips'],
      recommendedHashtags: ['travel', 'wanderlust', 'explore', 'travelgram', 'adventure'],
      notes: 'Travel content gets high engagement on weekends. Use high-quality visuals and storytelling.',
    },
    fashion: {
      category,
      cluster,
      recommendedPostingTimes: ['9:00 AM', '2:00 PM', '8:00 PM'],
      recommendedContentTypes: ['Outfit posts', 'Fashion hauls', 'Style tips', 'Behind-the-scenes'],
      recommendedHashtags: ['fashion', 'style', 'ootd', 'fashionista', 'outfitoftheday'],
      notes: 'Fashion content thrives on consistency. Post daily outfits and engage with fashion communities.',
    },
    gaming: {
      category,
      cluster,
      recommendedPostingTimes: ['3:00 PM', '7:00 PM', '10:00 PM'],
      recommendedContentTypes: ['Gameplay clips', 'Stream highlights', 'Gaming news', 'Reviews'],
      recommendedHashtags: ['gaming', 'gamer', 'twitch', 'gameplay', 'streamer'],
      notes: 'Gaming audience is most active in evenings and weekends. Focus on entertaining moments and skill showcases.',
    },
    lifestyle: {
      category,
      cluster,
      recommendedPostingTimes: ['8:00 AM', '1:00 PM', '6:00 PM'],
      recommendedContentTypes: ['Day-in-life', 'Personal stories', 'Tips & advice', 'Product reviews'],
      recommendedHashtags: ['lifestyle', 'blogger', 'dailylife', 'contentcreator', 'lifestyleblogger'],
      notes: 'Lifestyle content benefits from authenticity and relatability. Share personal experiences and useful tips.',
    },
    adult: {
      category,
      cluster,
      recommendedPostingTimes: ['9:00 PM', '11:00 PM', '1:00 AM'],
      recommendedContentTypes: ['Teasers', 'Behind-the-scenes', 'Exclusive previews', 'Interactive content'],
      recommendedHashtags: ['onlyfans', 'exclusive', 'contentcreator', 'premium', 'subscribe'],
      notes: 'Adult content performs best late evening/night. Focus on building anticipation and exclusive value.',
    },
  };
  
  // Get specific advice or default
  const advice = adviceMap[categoryLower] || {
    category,
    cluster,
    recommendedPostingTimes: ['9:00 AM', '1:00 PM', '7:00 PM'],
    recommendedContentTypes: ['Educational content', 'Behind-the-scenes', 'Q&A sessions', 'User-generated content'],
    recommendedHashtags: stats.topKeywords.slice(0, 5),
    notes: `Based on analysis of ${stats.size} similar profiles with avg ${stats.avgFollowers} followers. Keywords: ${stats.topKeywords.slice(0, 5).join(', ')}`,
  };
  
  return advice;
}

/**
 * Fallback rule-based advice
 */
function getRuleBasedAdvice(bio: string): ContentPlanAdvice {
  const cleanedBio = cleanBioText(bio);
  
  // Check each category
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matchCount = keywords.filter(kw => cleanedBio.includes(kw)).length;
    if (matchCount >= 2) {
      return generateAdvice(
        category.charAt(0).toUpperCase() + category.slice(1),
        0,
        { size: 0, avgFollowers: 0, topKeywords: keywords.slice(0, 5) }
      );
    }
  }
  
  // Default advice
  return {
    category: 'General',
    cluster: 0,
    recommendedPostingTimes: ['9:00 AM', '1:00 PM', '7:00 PM'],
    recommendedContentTypes: ['Educational content', 'Entertainment', 'Behind-the-scenes', 'Community engagement'],
    recommendedHashtags: ['contentcreator', 'creative', 'community', 'dailycontent'],
    notes: 'Focus on building a consistent posting schedule and engaging with your audience.',
  };
}

/**
 * Calculate Euclidean distance between vectors
 */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}