import { 
  proxyActivities, 
  defineSignal, 
  defineQuery, 
  setHandler, 
  condition, 
  sleep 
} from '@temporalio/workflow';
import type * as activities from '../activities/media';

// Configure activity options with retries and timeouts
const { 
  processAsset, 
  transcodeVideo, 
  generateSubtitles, 
  generateThumbnails,
  analyzeMedia 
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30m', // 30 minutes for media processing
  scheduleToCloseTimeout: '1h', // Total workflow timeout
  retry: {
    initialInterval: '30s',
    backoffCoefficient: 2,
    maximumInterval: '5m',
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['AssetNotFound', 'InvalidAssetType']
  }
});

// =============================================
// Signals and Queries
// =============================================

export const cancelProcessingSignal = defineSignal<[]>('cancelProcessing');
export const pauseProcessingSignal = defineSignal<[]>('pauseProcessing');
export const resumeProcessingSignal = defineSignal<[]>('resumeProcessing');

export const getProgressQuery = defineQuery<WorkflowProgress>('getProgress');
export const getStatusQuery = defineQuery<WorkflowStatus>('getStatus');

// =============================================
// Types
// =============================================

export interface MediaProcessingParams {
  assetId: string;
  operations: Array<{
    type: 'transcode' | 'subtitle' | 'thumbnail' | 'analysis';
    parameters: Record<string, any>;
    priority?: number;
  }>;
  creatorId: string;
  metadata?: Record<string, any>;
}

export interface WorkflowProgress {
  totalOperations: number;
  completedOperations: number;
  currentOperation?: string;
  results: any[];
  errors: string[];
  startedAt: string;
  estimatedCompletion?: string;
}

export interface WorkflowStatus {
  status: 'running' | 'paused' | 'cancelled' | 'completed' | 'failed';
  progress: WorkflowProgress;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
}

// =============================================
// Main Media Processing Workflow
// =============================================

export async function processMediaWorkflow(params: MediaProcessingParams): Promise<WorkflowProgress> {
  // Initialize workflow state
  let cancelled = false;
  let paused = false;
  let currentOperationIndex = 0;
  const results: any[] = [];
  const errors: string[] = [];
  const startedAt = new Date().toISOString();

  // Sort operations by priority (1 = highest, 10 = lowest)
  const sortedOperations = [...params.operations].sort((a, b) => 
    (a.priority || 5) - (b.priority || 5)
  );

  const progress: WorkflowProgress = {
    totalOperations: sortedOperations.length,
    completedOperations: 0,
    results,
    errors,
    startedAt
  };

  // Set up signal handlers
  setHandler(cancelProcessingSignal, () => {
    cancelled = true;
  });

  setHandler(pauseProcessingSignal, () => {
    paused = true;
  });

  setHandler(resumeProcessingSignal, () => {
    paused = false;
  });

  // Set up query handlers
  setHandler(getProgressQuery, () => progress);
  
  setHandler(getStatusQuery, (): WorkflowStatus => ({
    status: cancelled ? 'cancelled' : 
           paused ? 'paused' : 
           currentOperationIndex >= sortedOperations.length ? 'completed' : 
           'running',
    progress,
    canPause: !paused && !cancelled && currentOperationIndex < sortedOperations.length,
    canResume: paused && !cancelled,
    canCancel: !cancelled
  }));

  try {
    // Process each operation
    for (let i = 0; i < sortedOperations.length; i++) {
      // Check for cancellation
      if (cancelled) {
        break;
      }

      // Wait while paused
      await condition(() => !paused || cancelled);
      
      if (cancelled) {
        break;
      }

      currentOperationIndex = i;
      const operation = sortedOperations[i];
      
      progress.currentOperation = `${operation.type} (${i + 1}/${sortedOperations.length})`;
      
      try {
        // Estimate completion time based on operation type and past performance
        const estimatedDuration = getEstimatedDuration(operation.type);
        progress.estimatedCompletion = new Date(
          Date.now() + estimatedDuration * (sortedOperations.length - i)
        ).toISOString();

        // Execute the operation
        const result = await processAsset({
          assetId: params.assetId,
          operation: operation.type,
          parameters: operation.parameters
        });

        results.push({
          operation: operation.type,
          parameters: operation.parameters,
          result: result.results,
          completedAt: new Date().toISOString()
        });

        progress.completedOperations = i + 1;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`${operation.type}: ${errorMessage}`);
        
        // Decide whether to continue or fail the entire workflow
        if (isRetryableError(error)) {
          // Log error but continue with next operation
          continue;
        } else {
          // Critical error - fail the workflow
          throw error;
        }
      }
    }

    // Update final progress
    progress.currentOperation = undefined;
    progress.estimatedCompletion = undefined;

    return progress;

  } catch (error) {
    // Handle workflow-level errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Workflow failed: ${errorMessage}`);
    throw error;
  }
}

// =============================================
// Specialized Workflows
// =============================================

/**
 * Video transcoding workflow with automatic profile selection
 */
export async function transcodeVideoWorkflow(params: {
  assetId: string;
  targetPlatforms: string[];
  quality: 'fast' | 'balanced' | 'quality';
  enableSubtitles?: boolean;
}): Promise<any> {
  const profiles = selectProfilesForPlatforms(params.targetPlatforms);
  const operations = [];

  // Add transcoding operations
  for (const profile of profiles) {
    operations.push({
      type: 'transcode' as const,
      parameters: { 
        profiles: [profile],
        quality: params.quality
      },
      priority: getProfilePriority(profile)
    });
  }

  // Add subtitle generation if requested
  if (params.enableSubtitles) {
    operations.push({
      type: 'subtitle' as const,
      parameters: { 
        languages: ['en'], // Default to English
        model: params.quality === 'fast' ? 'base' : 'medium'
      },
      priority: 3
    });
  }

  // Add thumbnail generation
  operations.push({
    type: 'thumbnail' as const,
    parameters: { 
      count: 3,
      timestamps: [0.1, 0.5, 0.9]
    },
    priority: 5
  });

  return await processMediaWorkflow({
    assetId: params.assetId,
    operations,
    creatorId: '', // Will be filled by caller
    metadata: {
      targetPlatforms: params.targetPlatforms,
      quality: params.quality,
      autoGenerated: true
    }
  });
}

/**
 * Batch processing workflow for multiple assets
 */
export async function batchProcessWorkflow(params: {
  assetIds: string[];
  operation: 'transcode' | 'subtitle' | 'thumbnail' | 'analysis';
  parameters: Record<string, any>;
  parallelism?: number;
}): Promise<any[]> {
  const parallelism = params.parallelism || 3;
  const results: any[] = [];
  const chunks = chunkArray(params.assetIds, parallelism);

  for (const chunk of chunks) {
    // Process chunk in parallel
    const chunkPromises = chunk.map(assetId => 
      processAsset({
        assetId,
        operation: params.operation,
        parameters: params.parameters
      })
    );

    const chunkResults = await Promise.allSettled(chunkPromises);
    
    for (let i = 0; i < chunkResults.length; i++) {
      const result = chunkResults[i];
      const assetId = chunk[i];
      
      if (result.status === 'fulfilled') {
        results.push({
          assetId,
          success: true,
          result: result.value.results
        });
      } else {
        results.push({
          assetId,
          success: false,
          error: result.reason?.message || String(result.reason)
        });
      }
    }

    // Small delay between chunks to avoid overwhelming the system
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await sleep('5s');
    }
  }

  return results;
}

/**
 * Content optimization workflow for social media
 */
export async function optimizeForSocialWorkflow(params: {
  assetId: string;
  platforms: string[];
  locale?: string;
}): Promise<any> {
  const operations = [];

  // Platform-specific transcoding
  if (params.platforms.includes('tiktok') || params.platforms.includes('instagram_stories')) {
    operations.push({
      type: 'transcode' as const,
      parameters: { profiles: ['9x16'] },
      priority: 1
    });
  }

  if (params.platforms.includes('instagram_feed')) {
    operations.push({
      type: 'transcode' as const,
      parameters: { profiles: ['1x1'] },
      priority: 1
    });
  }

  if (params.platforms.includes('twitter') || params.platforms.includes('youtube')) {
    operations.push({
      type: 'transcode' as const,
      parameters: { profiles: ['16x9'] },
      priority: 1
    });
  }

  // Subtitle generation for accessibility
  operations.push({
    type: 'subtitle' as const,
    parameters: { 
      languages: [params.locale || 'en'],
      model: 'medium' // Better quality for social media
    },
    priority: 2
  });

  // Thumbnail generation for previews
  operations.push({
    type: 'thumbnail' as const,
    parameters: { 
      count: 5,
      timestamps: [0.05, 0.25, 0.5, 0.75, 0.95] // More options for social media
    },
    priority: 3
  });

  return await processMediaWorkflow({
    assetId: params.assetId,
    operations,
    creatorId: '', // Will be filled by caller
    metadata: {
      optimizedFor: 'social',
      platforms: params.platforms,
      locale: params.locale
    }
  });
}

// =============================================
// Helper Functions
// =============================================

function selectProfilesForPlatforms(platforms: string[]): string[] {
  const profiles = new Set<string>();

  for (const platform of platforms) {
    switch (platform.toLowerCase()) {
      case 'tiktok':
      case 'instagram_stories':
      case 'snapchat':
        profiles.add('9x16');
        break;
      case 'instagram_feed':
      case 'instagram_post':
        profiles.add('1x1');
        break;
      case 'twitter':
      case 'x':
      case 'youtube':
      case 'facebook':
        profiles.add('16x9');
        break;
      default:
        // Default to most versatile format
        profiles.add('16x9');
    }
  }

  return Array.from(profiles);
}

function getProfilePriority(profile: string): number {
  const priorities: Record<string, number> = {
    '9x16': 1, // TikTok/Stories - highest priority
    '1x1': 2,  // Instagram feed
    '16x9': 3  // YouTube/Twitter
  };
  return priorities[profile] || 5;
}

function getEstimatedDuration(operationType: string): number {
  // Estimated duration in milliseconds based on operation type
  const durations: Record<string, number> = {
    'analysis': 30 * 1000,      // 30 seconds
    'thumbnail': 60 * 1000,     // 1 minute
    'transcode': 300 * 1000,    // 5 minutes
    'subtitle': 180 * 1000      // 3 minutes
  };
  return durations[operationType] || 120 * 1000; // Default 2 minutes
}

function isRetryableError(error: any): boolean {
  // Determine if error is retryable or should fail the entire workflow
  const nonRetryableErrors = [
    'AssetNotFound',
    'InvalidAssetType',
    'InvalidParameters'
  ];
  
  return !nonRetryableErrors.some(type => 
    error?.message?.includes(type) || error?.type === type
  );
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}