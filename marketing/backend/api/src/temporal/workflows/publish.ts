// Temporal Workflow for durable, idempotent publishing
// Ref: https://docs.temporal.io/workflow-execution/workflowid-runid
// Ref: https://typescript.temporal.io/api/interfaces/client.WorkflowOptions

import { 
  proxyActivities, 
  defineSignal, 
  defineQuery,
  setHandler,
  condition,
  sleep,
  log,
  uuid4
} from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  policyCheck,
  reserveRateBudget,
  publishToPlatform,
  awaitAckOrPollMetrics,
  rollbackRateBudget,
  updatePostStatus,
  logWorkflowEvent
} = proxyActivities<typeof activities>({
  // Activity timeouts and retries
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '30 seconds',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '30 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 5,
    nonRetryableErrorTypes: ['PolicyViolationError', 'PermanentError']
  }
});

// Platform-specific activities with different timeouts
const {
  publishToInstagram,
  publishToTikTok,
  publishToX,
  publishToReddit
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes', // Longer for video uploads
  heartbeatTimeout: '1 minute',
  retry: {
    initialInterval: '2 seconds',
    maximumInterval: '2 minutes',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['AuthenticationError', 'ContentPolicyError']
  }
});

export interface PublishInput {
  platform: 'instagram' | 'tiktok' | 'x' | 'reddit';
  accountId: string;
  tokenId: string;
  variantUrl?: string;
  caption: string;
  hashtags?: string[];
  mentions?: string[];
  location?: { lat: number; lng: number; placeId?: string };
  scheduleAt?: string;
  postId: string; // DB tracking
  creatorId: string;
  idempotencyKey: string;
}

export interface PublishState {
  step: 'init' | 'policy_check' | 'rate_reserved' | 'publishing' | 'awaiting_ack' | 'completed' | 'failed';
  publishResult?: any;
  error?: string;
  retryCount: number;
  startedAt: string;
  completedAt?: string;
}

// Signals for external control
export const cancelWorkflow = defineSignal<[string]>('cancel');
export const retryPublish = defineSignal('retry');

// Queries for state inspection
export const getState = defineQuery<PublishState>('getState');
export const getProgress = defineQuery<{ step: string; progress: number }>('getProgress');

export async function PublishWorkflow(input: PublishInput): Promise<any> {
  const workflowId = `pub:${input.platform}:${input.accountId}:${input.postId}`;
  
  const state: PublishState = {
    step: 'init',
    retryCount: 0,
    startedAt: new Date().toISOString()
  };

  let cancelled = false;
  let shouldRetry = false;

  // Set up signal handlers
  setHandler(cancelWorkflow, (reason: string) => {
    log.info('Workflow cancelled', { reason, workflowId });
    cancelled = true;
  });

  setHandler(retryPublish, () => {
    log.info('Retry requested', { workflowId });
    shouldRetry = true;
  });

  // Set up query handlers
  setHandler(getState, () => state);
  setHandler(getProgress, () => {
    const steps = ['init', 'policy_check', 'rate_reserved', 'publishing', 'awaiting_ack', 'completed'];
    const currentIndex = steps.indexOf(state.step);
    return {
      step: state.step,
      progress: Math.round((currentIndex / (steps.length - 1)) * 100)
    };
  });

  try {
    // Log workflow start
    await logWorkflowEvent({
      workflowId,
      eventType: 'workflow_started',
      data: { platform: input.platform, accountId: input.accountId }
    });

    // Wait for scheduled time if specified
    if (input.scheduleAt) {
      const scheduleTime = new Date(input.scheduleAt);
      const now = new Date();
      if (scheduleTime > now) {
        log.info('Waiting for scheduled time', { scheduleTime, workflowId });
        await sleep(scheduleTime.getTime() - now.getTime());
        
        if (cancelled) {
          await updatePostStatus(input.postId, 'cancelled', 'Workflow cancelled before execution');
          return { status: 'cancelled' };
        }
      }
    }

    // Step 1: Policy check
    state.step = 'policy_check';
    log.info('Running policy check', { workflowId });
    
    const policyResult = await policyCheck({
      platform: input.platform,
      variantUrl: input.variantUrl,
      caption: input.caption,
      hashtags: input.hashtags,
      accountId: input.accountId,
      creatorId: input.creatorId
    });

    if (!policyResult.passed) {
      state.step = 'failed';
      state.error = `Policy violations: ${policyResult.violations.map((v: any) => v.reason).join(', ')}`;
      await updatePostStatus(input.postId, 'policy_failed', state.error);
      throw new Error(state.error);
    }

    // Step 2: Reserve rate budget
    state.step = 'rate_reserved';
    log.info('Reserving rate budget', { workflowId });
    
    const budgetReservation = await reserveRateBudget({
      accountId: input.accountId,
      platform: input.platform,
      estimatedCost: 1
    });

    if (!budgetReservation.success) {
      state.step = 'failed';
      state.error = `Rate budget exceeded: ${budgetReservation.reason}`;
      await updatePostStatus(input.postId, 'rate_limited', state.error);
      
      // Wait and retry if it's a temporary limit
      if (budgetReservation.retryAfter) {
        log.info('Waiting for rate limit reset', { 
          retryAfter: budgetReservation.retryAfter,
          workflowId 
        });
        await sleep(budgetReservation.retryAfter * 1000);
        
        // TODO: Retry logic could be enhanced here
        throw new Error(state.error);
      }
      
      throw new Error(state.error);
    }

    // Step 3: Platform-specific publishing
    state.step = 'publishing';
    log.info('Publishing to platform', { platform: input.platform, workflowId });
    
    try {
      let publishResult: any;

      switch (input.platform) {
        case 'instagram':
          publishResult = await publishToInstagram({
            accountId: input.accountId,
            accessToken: await getAccessToken(input.tokenId),
            variantUrl: input.variantUrl!,
            caption: input.caption,
            hashtags: input.hashtags,
            location: input.location
          });
          break;
          
        case 'tiktok':
          publishResult = await publishToTikTok({
            accountId: input.accountId,
            accessToken: await getAccessToken(input.tokenId),
            variantUrl: input.variantUrl!,
            caption: input.caption
          });
          break;
          
        case 'x':
          publishResult = await publishToX({
            accountId: input.accountId,
            accessToken: await getAccessToken(input.tokenId),
            variantUrl: input.variantUrl,
            caption: input.caption
          });
          break;
          
        case 'reddit':
          publishResult = await publishToReddit({
            accountId: input.accountId,
            accessToken: await getAccessToken(input.tokenId),
            subreddit: input.location?.placeId, // Using placeId as subreddit name
            title: input.caption.split('\n')[0],
            url: input.variantUrl,
            text: input.caption
          });
          break;
          
        default:
          throw new Error(`Unsupported platform: ${input.platform}`);
      }

      state.publishResult = publishResult;
      
      // Update post with success
      await updatePostStatus(input.postId, 'live', null, {
        remoteId: publishResult.remoteId,
        remoteUrl: publishResult.remoteUrl,
        containerId: publishResult.containerId,
        publishedAt: new Date().toISOString()
      });

    } catch (error: any) {
      log.error('Publishing failed', { error: error.message, workflowId });
      
      // Rollback rate budget reservation
      await rollbackRateBudget(budgetReservation.reservationId);
      
      state.retryCount++;
      
      // Check if it's a retryable error
      if (error.message.includes('Rate limit') && state.retryCount < 3) {
        const retryDelay = Math.pow(2, state.retryCount) * 60000; // Exponential backoff
        log.info('Retrying after rate limit', { retryDelay, attempt: state.retryCount });
        
        await sleep(retryDelay);
        
        // Recursive retry (workflow will restart from this point)
        return await PublishWorkflow(input);
      }
      
      state.step = 'failed';
      state.error = error.message;
      await updatePostStatus(input.postId, 'failed', error.message);
      throw error;
    }

    // Step 4: Await acknowledgment or poll metrics
    state.step = 'awaiting_ack';
    log.info('Awaiting acknowledgment', { workflowId });
    
    // Wait for webhook or poll for metrics
    const ackResult = await awaitAckOrPollMetrics({
      platform: input.platform,
      remoteId: state.publishResult.remoteId,
      postId: input.postId,
      maxWaitMinutes: 30
    });

    // Step 5: Complete
    state.step = 'completed';
    state.completedAt = new Date().toISOString();
    
    await logWorkflowEvent({
      workflowId,
      eventType: 'workflow_completed',
      data: { 
        remoteId: state.publishResult.remoteId,
        metrics: ackResult.metrics 
      }
    });

    return {
      status: 'completed',
      remoteId: state.publishResult.remoteId,
      remoteUrl: state.publishResult.remoteUrl,
      metrics: ackResult.metrics,
      duration: Date.now() - new Date(state.startedAt).getTime()
    };

  } catch (error: any) {
    state.step = 'failed';
    state.error = error.message;
    state.completedAt = new Date().toISOString();
    
    await logWorkflowEvent({
      workflowId,
      eventType: 'workflow_failed',
      data: { error: error.message, step: state.step }
    });

    log.error('Workflow failed', { error: error.message, workflowId });
    throw error;
  }
}

// Helper function to get access token (would be implemented as activity)
async function getAccessToken(tokenId: string): Promise<string> {
  // This would be implemented as an activity
  // For now, returning placeholder
  return 'access-token-from-db';
}

// TODO-1: Add compensation activities for complex rollback scenarios
// TODO-2: Implement workflow versioning for schema evolution
// TODO-3: Add child workflows for complex multi-step operations like TikTok chunk upload