// Temporal Client for starting and managing workflows
// Ref: https://typescript.temporal.io/api/classes/client.WorkflowHandle

import { Client, Connection } from '@temporalio/client';
import { PublishWorkflow, PublishInput } from './workflows/publish';
import { logger } from '../lib/logger';
import { createHash } from 'crypto';
import * as otel from '../lib/otel';

export class PublishClient {
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

      logger.info('Temporal client initialized');
    } catch (error) {
      logger.error('Failed to initialize Temporal client', error);
      throw error;
    }
  }

  async startPublishWorkflow(input: PublishInput): Promise<{
    workflowId: string;
    runId: string;
    status: 'started' | 'duplicate';
  }> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    return await otel.withSpan('temporal.start_workflow', {
      'temporal.workflow_type': 'PublishWorkflow',
      'social.platform': input.platform,
      'social.account_id': input.accountId
    }, async (span) => {
      // Create deterministic workflow ID for idempotency
      const workflowId = `pub:${input.platform}:${input.accountId}:${input.postId}`;
      
      span.setAttributes({
        'temporal.workflow_id': workflowId,
        'social.post_id': input.postId
      });

      try {
        // Determine task queue based on platform and priority
        const taskQueue = this.getTaskQueue(input);
        
        const handle = await this.client.workflow.start(PublishWorkflow, {
          args: [input],
          taskQueue,
          workflowId,
          
          // Idempotency: reject duplicate workflow IDs
          workflowIdReusePolicy: 'RejectDuplicate',
          
          // Execution timeout (max time for entire workflow)
          workflowExecutionTimeout: '2 hours',
          
          // Run timeout (max time for single workflow run)
          workflowRunTimeout: '1 hour',
          
          // Task timeout (max time for workflow task)
          workflowTaskTimeout: '10 seconds',
          
          // Retry policy for workflow
          retry: {
            initialInterval: '1 second',
            maximumInterval: '1 minute',
            backoffCoefficient: 2,
            maximumAttempts: 3
          },
          
          // Search attributes for querying
          searchAttributes: {
            platform: [input.platform],
            accountId: [input.accountId],
            creatorId: [input.creatorId]
          },
          
          // Memo for debugging (not indexed)
          memo: {
            createdBy: 'ofm-social-api',
            version: process.env.SERVICE_VERSION || '1.0.0',
            idempotencyKey: input.idempotencyKey
          }
        });

        logger.info('Workflow started', {
          workflowId,
          runId: handle.execution.runId,
          platform: input.platform,
          taskQueue
        });

        return {
          workflowId,
          runId: handle.execution.runId,
          status: 'started' as const
        };

      } catch (error: any) {
        if (error.message?.includes('WorkflowExecutionAlreadyStarted')) {
          // Workflow already exists - this is expected for idempotency
          logger.info('Workflow already started (idempotent)', { workflowId });
          
          // Get existing workflow handle
          const handle = this.client.workflow.getHandle(workflowId);
          
          return {
            workflowId,
            runId: handle.execution.runId,
            status: 'duplicate' as const
          };
        }
        
        logger.error('Failed to start workflow', {
          workflowId,
          error: error.message,
          platform: input.platform
        });
        
        throw error;
      }
    });
  }

  async getWorkflowStatus(workflowId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    
    try {
      const description = await handle.describe();
      const state = await handle.query('getState');
      const progress = await handle.query('getProgress');
      
      return {
        workflowId,
        runId: handle.execution.runId,
        status: description.status,
        state,
        progress,
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

  async cancelWorkflow(workflowId: string, reason: string): Promise<void> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    
    try {
      // Send cancel signal
      await handle.signal('cancel', reason);
      logger.info('Workflow cancelled', { workflowId, reason });
    } catch (error) {
      logger.error('Failed to cancel workflow', { workflowId, error });
      throw error;
    }
  }

  async retryWorkflow(workflowId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    
    try {
      await handle.signal('retry');
      logger.info('Workflow retry requested', { workflowId });
    } catch (error) {
      logger.error('Failed to retry workflow', { workflowId, error });
      throw error;
    }
  }

  async listWorkflows(filters: {
    platform?: string;
    accountId?: string;
    creatorId?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<any[]> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    // Build search query
    const conditions: string[] = ['WorkflowType="PublishWorkflow"'];
    
    if (filters.platform) {
      conditions.push(`platform="${filters.platform}"`);
    }
    if (filters.accountId) {
      conditions.push(`accountId="${filters.accountId}"`);
    }
    if (filters.creatorId) {
      conditions.push(`creatorId="${filters.creatorId}"`);
    }
    if (filters.status) {
      conditions.push(`ExecutionStatus="${filters.status}"`);
    }

    const query = conditions.join(' AND ');
    
    try {
      const workflows: any[] = [];
      
      for await (const workflow of this.client.workflow.list({ 
        query,
        pageSize: filters.limit || 100
      })) {
        workflows.push({
          workflowId: workflow.workflowId,
          runId: workflow.execution.runId,
          type: workflow.workflowType,
          status: workflow.status,
          startTime: workflow.startTime,
          closeTime: workflow.closeTime,
          searchAttributes: workflow.searchAttributes
        });
      }

      return workflows;
    } catch (error) {
      logger.error('Failed to list workflows', { filters, error });
      throw error;
    }
  }

  async getWorkflowHistory(workflowId: string): Promise<any[]> {
    if (!this.client) {
      throw new Error('Temporal client not initialized');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    
    try {
      const events: any[] = [];
      
      for await (const event of handle.fetchHistory()) {
        events.push({
          eventId: event.eventId,
          eventTime: event.eventTime,
          eventType: event.eventType,
          taskId: event.taskId,
          // Add relevant attributes based on event type
          attributes: this.extractEventAttributes(event)
        });
      }

      return events;
    } catch (error) {
      logger.error('Failed to get workflow history', { workflowId, error });
      throw error;
    }
  }

  private getTaskQueue(input: PublishInput): string {
    // Route to platform-specific queues for better resource isolation
    if (process.env.USE_PLATFORM_QUEUES === 'true') {
      return `publish-${input.platform}`;
    }
    
    // Route to priority queue for premium accounts
    if (input.creatorId && process.env.PRIORITY_CREATORS?.includes(input.creatorId)) {
      return 'publish-priority';
    }
    
    // Default queue
    return 'publish';
  }

  private extractEventAttributes(event: any): any {
    // Extract relevant attributes based on event type
    const attributes: any = {
      eventType: event.eventType
    };

    switch (event.eventType) {
      case 'WorkflowExecutionStarted':
        attributes.input = event.workflowExecutionStartedEventAttributes?.input;
        break;
      case 'ActivityTaskScheduled':
        attributes.activityType = event.activityTaskScheduledEventAttributes?.activityType?.name;
        break;
      case 'ActivityTaskCompleted':
        attributes.result = event.activityTaskCompletedEventAttributes?.result;
        break;
      case 'ActivityTaskFailed':
        attributes.failure = event.activityTaskFailedEventAttributes?.failure;
        break;
    }

    return attributes;
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.client = null;
    logger.info('Temporal client closed');
  }
}

// Singleton instance
let publishClient: PublishClient | null = null;

export async function getPublishClient(): Promise<PublishClient> {
  if (!publishClient) {
    publishClient = new PublishClient();
    await publishClient.initialize();
  }
  return publishClient;
}

// TODO-1: Add workflow scheduling for future posts
// TODO-2: Implement workflow batch operations for bulk publishing
// TODO-3: Add workflow metrics and health monitoring