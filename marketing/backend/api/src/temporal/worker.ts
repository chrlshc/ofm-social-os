// Temporal Worker for publish workflows
// Ref: https://docs.temporal.io/workers
// Ref: https://typescript.temporal.io/api/classes/worker.Worker

import { Worker, NativeConnection } from '@temporalio/worker';
import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import * as activities from './activities';
import { logger } from '../lib/logger';

// Initialize OpenTelemetry for the worker
const provider = new NodeTracerProvider({
  resource: new Resource({
    'service.name': 'ofm-temporal-worker',
    'service.version': process.env.SERVICE_VERSION || '1.0.0'
  })
});

registerInstrumentations({
  instrumentations: [getNodeAutoInstrumentations()]
});

provider.register();

interface WorkerConfig {
  taskQueue: string;
  maxConcurrentActivityTaskExecutions: number;
  maxActivitiesPerSecond: number;
  maxConcurrentWorkflowTaskExecutions: number;
  identity?: string;
}

export class PublishWorker {
  private worker: Worker | null = null;
  private connection: NativeConnection | null = null;
  
  constructor(private config: WorkerConfig) {}

  async start(): Promise<void> {
    try {
      // Create connection to Temporal server
      this.connection = await NativeConnection.connect({
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        tls: process.env.TEMPORAL_TLS === 'true' ? {} : undefined
      });

      logger.info('Connected to Temporal server', { 
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        tls: process.env.TEMPORAL_TLS === 'true'
      });

      // Create worker
      this.worker = await Worker.create({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE || 'default',
        taskQueue: this.config.taskQueue,
        workflowsPath: require.resolve('./workflows'),
        activities,
        
        // Concurrency and rate limits
        // Ref: https://docs.temporal.io/workers#worker-tuning
        maxConcurrentActivityTaskExecutions: this.config.maxConcurrentActivityTaskExecutions,
        maxConcurrentWorkflowTaskExecutions: this.config.maxConcurrentWorkflowTaskExecutions || 100,
        
        // Rate limiting to respect platform APIs
        rateLimit: {
          // Global rate limit for all activities
          totalActivitiesPerSecond: this.config.maxActivitiesPerSecond
        },

        // Worker identity for debugging
        identity: this.config.identity || `publish-worker-${process.env.HOSTNAME || 'local'}-${Date.now()}`,
        
        // Resource-based tuning
        maxTaskQueueActivitiesPerSecond: this.config.maxActivitiesPerSecond,
        
        // Activity timeouts (can be overridden per activity)
        activityDefaults: {
          startToCloseTimeout: '5 minutes',
          heartbeatTimeout: '30 seconds',
          retry: {
            initialInterval: '1 second',
            maximumInterval: '30 seconds',
            backoffCoefficient: 2,
            maximumAttempts: 3
          }
        },

        // Workflow defaults
        workflowDefaults: {
          workflowExecutionTimeout: '1 hour',
          workflowRunTimeout: '30 minutes',
          workflowTaskTimeout: '10 seconds'
        },

        // Enable worker metrics
        enableLogging: true,
        debugMode: process.env.NODE_ENV === 'development',
        
        // Interceptors for observability
        interceptors: {
          workflowModules: [require.resolve('./interceptors/workflow-interceptor')],
          activityInbound: [require.resolve('./interceptors/activity-interceptor')]
        }
      });

      // Start the worker
      logger.info('Starting Temporal worker', {
        taskQueue: this.config.taskQueue,
        identity: this.worker.options.identity,
        maxConcurrentActivities: this.config.maxConcurrentActivityTaskExecutions,
        maxActivitiesPerSecond: this.config.maxActivitiesPerSecond
      });

      // Run the worker (this blocks until shutdown)
      await this.worker.run();

    } catch (error) {
      logger.error('Failed to start Temporal worker', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      logger.info('Shutting down Temporal worker...');
      this.worker.shutdown();
      await this.worker.run(); // Wait for graceful shutdown
      this.worker = null;
    }

    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }

    logger.info('Temporal worker shut down');
  }
}

// Factory for creating workers with different configurations
export class WorkerManager {
  private workers: Map<string, PublishWorker> = new Map();

  // Create worker for general publishing
  createPublishWorker(): PublishWorker {
    const worker = new PublishWorker({
      taskQueue: 'publish',
      maxConcurrentActivityTaskExecutions: 100,
      maxActivitiesPerSecond: 20, // Conservative to respect platform APIs
      maxConcurrentWorkflowTaskExecutions: 200,
      identity: `publish-worker-${process.env.INSTANCE_ID || 'default'}`
    });

    this.workers.set('publish', worker);
    return worker;
  }

  // Create worker for high-priority publishing (premium accounts)
  createPriorityWorker(): PublishWorker {
    const worker = new PublishWorker({
      taskQueue: 'publish-priority',
      maxConcurrentActivityTaskExecutions: 50,
      maxActivitiesPerSecond: 10, // Higher rate limit budgets
      maxConcurrentWorkflowTaskExecutions: 100,
      identity: `priority-worker-${process.env.INSTANCE_ID || 'default'}`
    });

    this.workers.set('publish-priority', worker);
    return worker;
  }

  // Create worker for specific platforms with custom limits
  createPlatformWorker(platform: string): PublishWorker {
    const platformConfigs = {
      instagram: { activities: 30, rate: 8 }, // Instagram has strict rate limits
      tiktok: { activities: 20, rate: 5 },    // TikTok is conservative
      x: { activities: 50, rate: 15 },        // X has higher limits for paid tiers
      reddit: { activities: 40, rate: 12 }    // Reddit 100 QPM shared across operations
    };

    const config = platformConfigs[platform as keyof typeof platformConfigs] || 
                  { activities: 25, rate: 10 };

    const worker = new PublishWorker({
      taskQueue: `publish-${platform}`,
      maxConcurrentActivityTaskExecutions: config.activities,
      maxActivitiesPerSecond: config.rate,
      maxConcurrentWorkflowTaskExecutions: 50,
      identity: `${platform}-worker-${process.env.INSTANCE_ID || 'default'}`
    });

    this.workers.set(`publish-${platform}`, worker);
    return worker;
  }

  async startAll(): Promise<void> {
    const startPromises = Array.from(this.workers.values()).map(worker => worker.start());
    await Promise.all(startPromises);
  }

  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.workers.values()).map(worker => worker.shutdown());
    await Promise.all(shutdownPromises);
    this.workers.clear();
  }

  getWorker(name: string): PublishWorker | undefined {
    return this.workers.get(name);
  }
}

// CLI entry point for running workers
if (require.main === module) {
  const manager = new WorkerManager();
  
  // Create workers based on environment
  const workerType = process.env.WORKER_TYPE || 'all';
  
  switch (workerType) {
    case 'publish':
      manager.createPublishWorker();
      break;
    case 'priority':
      manager.createPriorityWorker();
      break;
    case 'instagram':
    case 'tiktok':
    case 'x':
    case 'reddit':
      manager.createPlatformWorker(workerType);
      break;
    case 'all':
    default:
      manager.createPublishWorker();
      manager.createPriorityWorker();
      ['instagram', 'tiktok', 'x', 'reddit'].forEach(platform => {
        manager.createPlatformWorker(platform);
      });
      break;
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await manager.shutdownAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start workers
  manager.startAll().catch(error => {
    logger.error('Failed to start workers', error);
    process.exit(1);
  });
}

// TODO-1: Add worker health checks and auto-restart mechanisms  
// TODO-2: Implement worker scaling based on queue depth metrics
// TODO-3: Add worker-specific metrics collection and dashboards