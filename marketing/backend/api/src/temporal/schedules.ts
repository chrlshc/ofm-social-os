import { Client, ScheduleHandle, ScheduleAlreadyRunning } from '@temporalio/client';
import { ScrapeAndTrainWorkflow } from './workflows/scrapeAndTrain';
import { logger } from '../utils/logger';

export interface ScheduleConfig {
  enabled: boolean;
  cronExpression: string;
  workflowTaskQueue: string;
  profileLimits?: Record<string, number>;
}

/**
 * Sets up scheduled workflows for automated scraping and training
 */
export async function setupScheduledWorkflows(
  client: Client,
  config: ScheduleConfig
): Promise<void> {
  if (!config.enabled) {
    logger.info('Scheduled workflows are disabled by configuration');
    return;
  }
  
  const scheduleId = 'scrape-and-train-schedule';
  
  try {
    // Check if schedule already exists
    let schedule: ScheduleHandle;
    
    try {
      schedule = client.schedule.getHandle(scheduleId);
      const description = await schedule.describe();
      
      logger.info('Schedule already exists', {
        scheduleId,
        state: description.schedule.state,
        spec: description.schedule.spec,
      });
      
      // Update schedule if cron expression changed
      if (description.schedule.spec.cronExpressions?.[0] !== config.cronExpression) {
        logger.info('Updating schedule cron expression', {
          old: description.schedule.spec.cronExpressions?.[0],
          new: config.cronExpression,
        });
        
        await schedule.update((prev) => ({
          ...prev,
          spec: {
            ...prev.spec,
            cronExpressions: [config.cronExpression],
          },
        }));
      }
      
    } catch (error) {
      // Schedule doesn't exist, create it
      logger.info('Creating new schedule', {
        scheduleId,
        cronExpression: config.cronExpression,
      });
      
      schedule = await client.schedule.create({
        scheduleId,
        spec: {
          cronExpressions: [config.cronExpression],
        },
        action: {
          type: 'startWorkflow',
          workflowType: ScrapeAndTrainWorkflow,
          taskQueue: config.workflowTaskQueue,
          args: [{
            profileLimits: config.profileLimits,
            skipTraining: false,
            dryRun: false,
          }],
          workflowId: `scrape-and-train-${Date.now()}`,
        },
        policies: {
          overlap: 'SKIP', // Skip if previous run is still running
          catchupWindow: '1 day', // Only catch up runs from last day
        },
      });
    }
    
    logger.info('Schedule setup completed', { scheduleId });
    
  } catch (error) {
    logger.error('Failed to setup scheduled workflow', error);
    throw error;
  }
}

/**
 * Pauses the scheduled workflow
 */
export async function pauseSchedule(client: Client): Promise<void> {
  const scheduleId = 'scrape-and-train-schedule';
  
  try {
    const schedule = client.schedule.getHandle(scheduleId);
    await schedule.pause('Paused by admin');
    logger.info('Schedule paused', { scheduleId });
  } catch (error) {
    logger.error('Failed to pause schedule', error);
    throw error;
  }
}

/**
 * Resumes the scheduled workflow
 */
export async function resumeSchedule(client: Client): Promise<void> {
  const scheduleId = 'scrape-and-train-schedule';
  
  try {
    const schedule = client.schedule.getHandle(scheduleId);
    await schedule.unpause('Resumed by admin');
    logger.info('Schedule resumed', { scheduleId });
  } catch (error) {
    logger.error('Failed to resume schedule', error);
    throw error;
  }
}

/**
 * Triggers an immediate run of the scheduled workflow
 */
export async function triggerScheduleNow(client: Client): Promise<void> {
  const scheduleId = 'scrape-and-train-schedule';
  
  try {
    const schedule = client.schedule.getHandle(scheduleId);
    await schedule.trigger();
    logger.info('Schedule triggered for immediate run', { scheduleId });
  } catch (error) {
    if (error instanceof ScheduleAlreadyRunning) {
      logger.warn('Schedule is already running', { scheduleId });
      throw new Error('Workflow is already running');
    }
    logger.error('Failed to trigger schedule', error);
    throw error;
  }
}

/**
 * Gets the status of the scheduled workflow
 */
export async function getScheduleStatus(client: Client): Promise<{
  exists: boolean;
  state?: string;
  nextRun?: Date;
  lastRun?: Date;
  running?: boolean;
}> {
  const scheduleId = 'scrape-and-train-schedule';
  
  try {
    const schedule = client.schedule.getHandle(scheduleId);
    const description = await schedule.describe();
    
    const recentActions = description.recentActions || [];
    const lastRun = recentActions.length > 0 
      ? new Date(recentActions[0].actualTime)
      : undefined;
    
    return {
      exists: true,
      state: description.schedule.state.paused ? 'PAUSED' : 'RUNNING',
      nextRun: description.info?.nextActionTimes?.[0] 
        ? new Date(description.info.nextActionTimes[0])
        : undefined,
      lastRun,
      running: description.info?.runningWorkflows?.length > 0,
    };
  } catch (error) {
    return { exists: false };
  }
}