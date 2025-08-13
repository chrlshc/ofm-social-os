import { Client, Connection } from '@temporalio/client';
import { ScrapeAndTrainWorkflow, ScrapeOnlyWorkflow, TrainOnlyWorkflow } from './workflows/scrapeAndTrain';
import { setupScheduledWorkflows, ScheduleConfig } from './schedules';
import { logger } from '../utils/logger';

export class MarketingTemporalClient {
  private client: Client | null = null;
  private connection: Connection | null = null;

  async initialize(): Promise<void> {
    try {
      this.connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        tls: process.env.TEMPORAL_TLS === 'true' ? {} : undefined
      });

      this.client = new Client({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE || 'default'
      });

      logger.info('Marketing Temporal client initialized');

      // Setup scheduled workflows if enabled
      const scheduleConfig: ScheduleConfig = {
        enabled: process.env.ENABLE_AUTOMATION !== 'false',
        cronExpression: process.env.SCRAPER_CRON || '0 3 * * *', // Default: 3 AM daily
        workflowTaskQueue: 'marketing-automation',
        profileLimits: process.env.SCRAPER_PROFILE_LIMITS 
          ? JSON.parse(process.env.SCRAPER_PROFILE_LIMITS)
          : undefined,
      };

      if (scheduleConfig.enabled) {
        await setupScheduledWorkflows(this.client, scheduleConfig);
      }

    } catch (error) {
      logger.error('Failed to initialize Marketing Temporal client', error);
      throw error;
    }
  }

  async startScrapeAndTrainWorkflow(params?: {
    profileLimits?: Record<string, number>;
    skipTraining?: boolean;
    dryRun?: boolean;
  }): Promise<{ workflowId: string; runId: string }> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const workflowId = `scrape-and-train-${Date.now()}`;

    try {
      const handle = await this.client.workflow.start(ScrapeAndTrainWorkflow, {
        args: [params || {}],
        taskQueue: 'marketing-automation',
        workflowId,
        workflowIdReusePolicy: 'RejectDuplicate',
        workflowExecutionTimeout: '2 hours',
        retry: {
          initialInterval: '1 minute',
          maximumInterval: '10 minutes',
          backoffCoefficient: 2,
          maximumAttempts: 3
        },
        searchAttributes: {
          workflowType: ['ScrapeAndTrain'],
          automation: ['marketing']
        },
        memo: {
          createdBy: 'marketing-api',
          version: process.env.SERVICE_VERSION || '1.0.0'
        }
      });

      logger.info('ScrapeAndTrain workflow started', {
        workflowId,
        runId: handle.execution.runId
      });

      return {
        workflowId,
        runId: handle.execution.runId
      };

    } catch (error) {
      logger.error('Failed to start ScrapeAndTrain workflow', { workflowId, error });
      throw error;
    }
  }

  async startScrapeOnlyWorkflow(params?: {
    profileLimits?: Record<string, number>;
    dryRun?: boolean;
  }): Promise<{ workflowId: string; runId: string }> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const workflowId = `scrape-only-${Date.now()}`;

    try {
      const handle = await this.client.workflow.start(ScrapeOnlyWorkflow, {
        args: [params || {}],
        taskQueue: 'marketing-automation',
        workflowId,
        workflowIdReusePolicy: 'RejectDuplicate',
        workflowExecutionTimeout: '1 hour',
      });

      logger.info('ScrapeOnly workflow started', {
        workflowId,
        runId: handle.execution.runId
      });

      return {
        workflowId,
        runId: handle.execution.runId
      };

    } catch (error) {
      logger.error('Failed to start ScrapeOnly workflow', { workflowId, error });
      throw error;
    }
  }

  async startTrainOnlyWorkflow(): Promise<{ workflowId: string; runId: string }> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const workflowId = `train-only-${Date.now()}`;

    try {
      const handle = await this.client.workflow.start(TrainOnlyWorkflow, {
        args: [],
        taskQueue: 'marketing-automation',
        workflowId,
        workflowIdReusePolicy: 'RejectDuplicate',
        workflowExecutionTimeout: '30 minutes',
      });

      logger.info('TrainOnly workflow started', {
        workflowId,
        runId: handle.execution.runId
      });

      return {
        workflowId,
        runId: handle.execution.runId
      };

    } catch (error) {
      logger.error('Failed to start TrainOnly workflow', { workflowId, error });
      throw error;
    }
  }

  async getWorkflowStatus(workflowId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    
    try {
      const description = await handle.describe();
      
      return {
        workflowId,
        runId: handle.execution.runId,
        status: description.status,
        startTime: description.startTime,
        closeTime: description.closeTime,
        historyLength: description.historyLength
      };
    } catch (error: any) {
      if (error.message?.includes('workflow execution not found')) {
        return {
          workflowId,
          status: 'NOT_FOUND',
          error: 'Workflow not found'
        };
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.client = null;
    logger.info('Marketing Temporal client closed');
  }

  // Expose the raw client for schedule management
  getClient(): Client {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }
    return this.client;
  }
}

// Singleton instance
let marketingClient: MarketingTemporalClient | null = null;

export async function getMarketingTemporalClient(): Promise<MarketingTemporalClient> {
  if (!marketingClient) {
    marketingClient = new MarketingTemporalClient();
    await marketingClient.initialize();
  }
  return marketingClient;
}