import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from '../activities/scrapeAndTrain';

const {
  scrapeProfilesActivity,
  trainModelActivity,
  updateRecommendationsActivity,
  validateDataQuality,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '5 minutes',
  retry: {
    initialInterval: '1m',
    backoffCoefficient: 2,
    maximumInterval: '10m',
    maximumAttempts: 3,
  },
});

export interface ScrapeAndTrainWorkflowParams {
  profileLimits?: Record<string, number>;
  skipTraining?: boolean;
  dryRun?: boolean;
}

/**
 * Main workflow for scraping profiles and training the model
 */
export async function ScrapeAndTrainWorkflow(
  params: ScrapeAndTrainWorkflowParams = {}
): Promise<{
  scrapingResults: any;
  trainingResults?: any;
  recommendations?: any;
}> {
  const { profileLimits, skipTraining = false, dryRun = false } = params;
  
  console.log(`Starting ScrapeAndTrainWorkflow - ${new Date().toISOString()}`);
  console.log(`Params: ${JSON.stringify(params)}`);
  
  let scrapingResults;
  let trainingResults;
  let recommendations;
  
  try {
    // Step 1: Scrape profiles
    console.log('Starting profile scraping...');
    scrapingResults = await scrapeProfilesActivity({
      profileLimits,
      dryRun,
    });
    
    console.log(`Scraping completed: ${scrapingResults.successful} successful, ${scrapingResults.failed} failed`);
    
    // Step 2: Validate data quality
    const dataQuality = await validateDataQuality();
    console.log(`Data quality check: ${dataQuality.totalProfiles} profiles, ${dataQuality.profilesWithBios} with bios`);
    
    // Only proceed with training if we have enough data
    if (!skipTraining && dataQuality.profilesWithBios >= 10) {
      console.log('Starting model training...');
      
      // Add small delay before training
      await sleep('30s');
      
      trainingResults = await trainModelActivity();
      console.log(`Training completed: ${trainingResults.clustersCreated} clusters created`);
      
      // Step 3: Update recommendations cache
      console.log('Updating recommendations...');
      recommendations = await updateRecommendationsActivity();
      console.log(`Recommendations updated for ${recommendations.categoriesUpdated} categories`);
      
    } else if (dataQuality.profilesWithBios < 10) {
      console.log(`Skipping training: insufficient data (${dataQuality.profilesWithBios} profiles with bios, need 10+)`);
    } else {
      console.log('Skipping training as requested');
    }
    
    console.log('ScrapeAndTrainWorkflow completed successfully');
    
    return {
      scrapingResults,
      trainingResults,
      recommendations,
    };
    
  } catch (error) {
    console.error('ScrapeAndTrainWorkflow failed:', error);
    throw error;
  }
}

/**
 * Workflow for running scraping only (faster for testing)
 */
export async function ScrapeOnlyWorkflow(
  params: { profileLimits?: Record<string, number>; dryRun?: boolean } = {}
): Promise<any> {
  console.log('Starting ScrapeOnlyWorkflow');
  
  const result = await scrapeProfilesActivity({
    profileLimits: params.profileLimits,
    dryRun: params.dryRun,
  });
  
  console.log('ScrapeOnlyWorkflow completed');
  return result;
}

/**
 * Workflow for running training only (after scraping is done)
 */
export async function TrainOnlyWorkflow(): Promise<{
  trainingResults: any;
  recommendations: any;
}> {
  console.log('Starting TrainOnlyWorkflow');
  
  // Validate we have enough data
  const dataQuality = await validateDataQuality();
  if (dataQuality.profilesWithBios < 10) {
    throw new Error(`Insufficient data for training: ${dataQuality.profilesWithBios} profiles with bios (need 10+)`);
  }
  
  const trainingResults = await trainModelActivity();
  const recommendations = await updateRecommendationsActivity();
  
  console.log('TrainOnlyWorkflow completed');
  
  return {
    trainingResults,
    recommendations,
  };
}