import { Context } from '@temporalio/activity';
import { scrapeProfiles, getTargetProfiles } from '../../scraper';
import { trainAndSaveModel } from '../../ml/contentCategorizer';
import { TopProfile } from '../../models/TopProfile';
import { logger } from '../../utils/logger';
import { metrics } from '../../utils/metrics';

/**
 * Activity to scrape profiles from multiple platforms
 */
export async function scrapeProfilesActivity(params: {
  profileLimits?: Record<string, number>;
  dryRun?: boolean;
}): Promise<{
  successful: number;
  failed: number;
  byPlatform: Record<string, { success: number; failed: number }>;
}> {
  const { profileLimits, dryRun = false } = params;
  
  logger.info('Starting scraping activity', { profileLimits, dryRun });
  
  // Get target profiles
  let targetProfiles = getTargetProfiles();
  
  // Apply limits if specified
  if (profileLimits) {
    for (const [platform, limit] of Object.entries(profileLimits)) {
      if (targetProfiles[platform]) {
        targetProfiles[platform] = targetProfiles[platform].slice(0, limit);
      }
    }
  }
  
  // In dry run mode, just return what would be scraped
  if (dryRun) {
    const totalProfiles = Object.values(targetProfiles).reduce((sum, profiles) => sum + profiles.length, 0);
    logger.info(`Dry run: would scrape ${totalProfiles} profiles`);
    return {
      successful: totalProfiles,
      failed: 0,
      byPlatform: Object.entries(targetProfiles).reduce((acc, [platform, profiles]) => {
        acc[platform] = { success: profiles.length, failed: 0 };
        return acc;
      }, {} as Record<string, { success: number; failed: number }>),
    };
  }
  
  // Send heartbeat periodically during long-running scraping
  const heartbeatInterval = setInterval(() => {
    Context.current().heartbeat();
  }, 10000); // Every 10 seconds
  
  try {
    // Perform the scraping
    const startTime = Date.now();
    const result = await scrapeProfiles({
      platforms: targetProfiles,
      options: {
        delayMs: 2000, // 2 second delay between requests
        timeout: 20000, // 20 second timeout
      },
      saveToDb: true,
    });
    
    const duration = Date.now() - startTime;
    
    // Record metrics
    metrics.increment('scraper_runs_total');
    metrics.increment('scraper_profiles_scraped', result.successful.length);
    metrics.increment('scraper_profiles_failed', result.failed.length);
    metrics.observe('scraper_duration_seconds', duration / 1000);
    
    // Calculate stats by platform
    const byPlatform: Record<string, { success: number; failed: number }> = {};
    
    for (const profile of result.successful) {
      if (!byPlatform[profile.platform]) {
        byPlatform[profile.platform] = { success: 0, failed: 0 };
      }
      byPlatform[profile.platform].success++;
    }
    
    for (const failure of result.failed) {
      if (!byPlatform[failure.platform]) {
        byPlatform[failure.platform] = { success: 0, failed: 0 };
      }
      byPlatform[failure.platform].failed++;
    }
    
    logger.info('Scraping activity completed', {
      successful: result.successful.length,
      failed: result.failed.length,
      duration,
    });
    
    return {
      successful: result.successful.length,
      failed: result.failed.length,
      byPlatform,
    };
    
  } finally {
    clearInterval(heartbeatInterval);
  }
}

/**
 * Activity to train the ML model
 */
export async function trainModelActivity(): Promise<{
  clustersCreated: number;
  profilesCategorized: number;
  categories: string[];
}> {
  logger.info('Starting model training activity');
  
  const startTime = Date.now();
  
  try {
    // Train the model
    await trainAndSaveModel();
    
    // Get results
    const categorizedProfiles = await TopProfile.count({
      where: {
        cluster: { $ne: null },
      },
    });
    
    const categories = await TopProfile.findAll({
      attributes: ['category'],
      where: {
        category: { $ne: null },
      },
      group: ['category'],
      raw: true,
    });
    
    const duration = Date.now() - startTime;
    
    // Record metrics
    metrics.increment('model_training_runs_total');
    metrics.observe('model_training_duration_seconds', duration / 1000);
    metrics.gauge('model_clusters_count', categories.length);
    metrics.gauge('model_profiles_categorized', categorizedProfiles);
    
    logger.info('Model training completed', {
      clustersCreated: categories.length,
      profilesCategorized: categorizedProfiles,
      duration,
    });
    
    return {
      clustersCreated: categories.length,
      profilesCategorized: categorizedProfiles,
      categories: categories.map(c => c.category),
    };
    
  } catch (error) {
    metrics.increment('model_training_failures_total');
    logger.error('Model training failed', error);
    throw error;
  }
}

/**
 * Activity to update recommendation caches
 */
export async function updateRecommendationsActivity(): Promise<{
  categoriesUpdated: number;
  cacheSize: number;
}> {
  logger.info('Starting recommendations update activity');
  
  // In a real implementation, this would:
  // 1. Generate recommendations for each category
  // 2. Cache them in Redis or similar
  // 3. Pre-compute common queries
  
  // For now, just count categories
  const categories = await TopProfile.findAll({
    attributes: ['category'],
    where: {
      category: { $ne: null },
    },
    group: ['category'],
    raw: true,
  });
  
  logger.info('Recommendations updated', {
    categoriesUpdated: categories.length,
  });
  
  return {
    categoriesUpdated: categories.length,
    cacheSize: categories.length * 10, // Assume 10 recommendations per category
  };
}

/**
 * Activity to validate data quality before training
 */
export async function validateDataQuality(): Promise<{
  totalProfiles: number;
  profilesWithBios: number;
  platformCoverage: Record<string, number>;
  dataQualityScore: number;
}> {
  logger.info('Validating data quality');
  
  const totalProfiles = await TopProfile.count();
  
  const profilesWithBios = await TopProfile.count({
    where: {
      bio: {
        $ne: null,
        $ne: '',
      },
    },
  });
  
  const platformStats = await TopProfile.findAll({
    attributes: [
      'platform',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['platform'],
    raw: true,
  });
  
  const platformCoverage = platformStats.reduce((acc, stat) => {
    acc[stat.platform] = parseInt(stat.count);
    return acc;
  }, {} as Record<string, number>);
  
  // Calculate quality score (0-100)
  const bioRatio = totalProfiles > 0 ? profilesWithBios / totalProfiles : 0;
  const platformCount = Object.keys(platformCoverage).length;
  const dataQualityScore = Math.round(
    (bioRatio * 50) + // 50 points for bio coverage
    (Math.min(platformCount / 4, 1) * 30) + // 30 points for platform diversity
    (Math.min(totalProfiles / 100, 1) * 20) // 20 points for data volume
  );
  
  logger.info('Data quality validation complete', {
    totalProfiles,
    profilesWithBios,
    platformCount,
    dataQualityScore,
  });
  
  return {
    totalProfiles,
    profilesWithBios,
    platformCoverage,
    dataQualityScore,
  };
}