/**
 * Client NATS pour le streaming d'ingestion de métriques KPI
 */

import { connect, NatsConnection, JetStreamManager, JetStreamClient, StringCodec, JSONCodec } from 'nats';
import { createError } from '../utils/errorHandler';

export interface StreamConfig {
  name: string;
  subjects: string[];
  maxAge?: number; // en secondes
  maxBytes?: number;
  maxMsgs?: number;
  retention?: 'limits' | 'interest' | 'workqueue';
  storage?: 'file' | 'memory';
}

export interface KpiMetricEvent {
  id: string;
  modelName: string;
  metricName: string;
  value: number;
  platform?: string;
  campaignId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
  source: string; // API, batch, webhook, etc.
}

export interface StreamingMetrics {
  messagesPublished: number;
  messagesConsumed: number;
  publishLatency: number[];
  consumerLag: number;
  errors: number;
}

export class NatsStreamingClient {
  private connection: NatsConnection | null = null;
  private jetstream: JetStreamClient | null = null;
  private manager: JetStreamManager | null = null;
  private codec = JSONCodec<KpiMetricEvent>();
  private metrics: StreamingMetrics = {
    messagesPublished: 0,
    messagesConsumed: 0,
    publishLatency: [],
    consumerLag: 0,
    errors: 0
  };

  constructor(private config: {
    servers: string[];
    reconnect: boolean;
    maxReconnectAttempts: number;
    reconnectTimeWait: number;
  }) {}

  /**
   * Connexion au cluster NATS
   */
  async connect(): Promise<void> {
    try {
      console.log('Connecting to NATS cluster:', this.config.servers);
      
      this.connection = await connect({
        servers: this.config.servers,
        reconnect: this.config.reconnect,
        maxReconnectAttempts: this.config.maxReconnectAttempts,
        reconnectTimeWait: this.config.reconnectTimeWait,
        pingInterval: 20000,
        maxPingOut: 5
      });

      // Initialiser JetStream
      this.jetstream = this.connection.jetstream();
      this.manager = await this.connection.jetstreamManager();

      console.log('Connected to NATS successfully');
      
      // Gérer les événements de connexion
      this.setupConnectionHandlers();

    } catch (error) {
      throw createError.externalService('NATS', `Connection failed: ${error}`);
    }
  }

  /**
   * Configuration des gestionnaires d'événements de connexion
   */
  private setupConnectionHandlers(): void {
    if (!this.connection) return;

    this.connection.closed().then((err) => {
      if (err) {
        console.error('NATS connection closed with error:', err);
      } else {
        console.log('NATS connection closed gracefully');
      }
    });

    // Gérer les reconnexions
    this.connection.reconnecting = () => {
      console.log('NATS reconnecting...');
    };

    this.connection.reconnected = () => {
      console.log('NATS reconnected successfully');
    };
  }

  /**
   * Créer ou mettre à jour un stream JetStream
   */
  async createStream(streamConfig: StreamConfig): Promise<void> {
    if (!this.manager) {
      throw createError.internal('NATS manager not initialized');
    }

    try {
      const config = {
        name: streamConfig.name,
        subjects: streamConfig.subjects,
        max_age: (streamConfig.maxAge || 24 * 60 * 60) * 1000000000, // Convert to nanoseconds
        max_bytes: streamConfig.maxBytes || 10 * 1024 * 1024 * 1024, // 10GB
        max_msgs: streamConfig.maxMsgs || 1000000,
        retention: streamConfig.retention || 'limits',
        storage: streamConfig.storage || 'file',
        discard: 'old' as const,
        duplicate_window: 2 * 60 * 1000000000 // 2 minutes en nanoseconds
      };

      await this.manager.streams.add(config);
      console.log(`Stream ${streamConfig.name} created/updated successfully`);

    } catch (error: any) {
      if (error.message.includes('stream name already in use')) {
        console.log(`Stream ${streamConfig.name} already exists`);
      } else {
        throw createError.externalService('NATS', `Failed to create stream: ${error.message}`);
      }
    }
  }

  /**
   * Publier une métrique dans le stream
   */
  async publishMetric(subject: string, metric: KpiMetricEvent): Promise<void> {
    if (!this.jetstream) {
      throw createError.internal('JetStream not initialized');
    }

    const startTime = Date.now();

    try {
      // Ajouter un ID unique si pas présent
      if (!metric.id) {
        metric.id = `${metric.modelName}_${metric.metricName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Publier avec déduplication
      const pubAck = await this.jetstream.publish(subject, this.codec.encode(metric), {
        msgID: metric.id,
        expect: { lastMsgID: undefined } // Permettre la déduplication
      });

      // Métriques de performance
      const latency = Date.now() - startTime;
      this.metrics.messagesPublished++;
      this.metrics.publishLatency.push(latency);
      
      // Garder seulement les 1000 dernières mesures de latence
      if (this.metrics.publishLatency.length > 1000) {
        this.metrics.publishLatency = this.metrics.publishLatency.slice(-1000);
      }

      console.log(`Published metric ${metric.id} to ${subject}, sequence: ${pubAck.seq}`);

    } catch (error) {
      this.metrics.errors++;
      throw createError.externalService('NATS', `Failed to publish metric: ${error}`);
    }
  }

  /**
   * Publier plusieurs métriques en batch
   */
  async publishBatch(subject: string, metrics: KpiMetricEvent[]): Promise<void> {
    if (!this.jetstream) {
      throw createError.internal('JetStream not initialized');
    }

    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    try {
      for (const metric of metrics) {
        // Publier en parallèle mais avec limite de concurrence
        if (promises.length >= 50) { // Limite de 50 publications parallèles
          await Promise.all(promises);
          promises.length = 0;
        }

        promises.push(this.publishMetric(subject, metric));
      }

      // Attendre les publications restantes
      if (promises.length > 0) {
        await Promise.all(promises);
      }

      const totalLatency = Date.now() - startTime;
      console.log(`Published batch of ${metrics.length} metrics in ${totalLatency}ms`);

    } catch (error) {
      this.metrics.errors++;
      throw createError.externalService('NATS', `Failed to publish batch: ${error}`);
    }
  }

  /**
   * Créer un consommateur durable
   */
  async createConsumer(
    streamName: string,
    consumerName: string,
    config: {
      filterSubject?: string;
      deliverPolicy?: 'all' | 'last' | 'new';
      ackPolicy?: 'none' | 'all' | 'explicit';
      maxDeliver?: number;
      ackWait?: number; // en millisecondes
      maxAckPending?: number;
    } = {}
  ): Promise<void> {
    if (!this.manager) {
      throw createError.internal('NATS manager not initialized');
    }

    try {
      const consumerConfig = {
        name: consumerName,
        durable_name: consumerName,
        filter_subject: config.filterSubject,
        deliver_policy: config.deliverPolicy || 'new',
        ack_policy: config.ackPolicy || 'explicit',
        max_deliver: config.maxDeliver || 3,
        ack_wait: (config.ackWait || 30000) * 1000000, // Convert to nanoseconds
        max_ack_pending: config.maxAckPending || 1000
      };

      await this.manager.consumers.add(streamName, consumerConfig);
      console.log(`Consumer ${consumerName} created for stream ${streamName}`);

    } catch (error: any) {
      if (error.message.includes('consumer name already in use')) {
        console.log(`Consumer ${consumerName} already exists`);
      } else {
        throw createError.externalService('NATS', `Failed to create consumer: ${error.message}`);
      }
    }
  }

  /**
   * Consommer des messages avec gestion d'erreur
   */
  async consume(
    streamName: string,
    consumerName: string,
    handler: (metric: KpiMetricEvent) => Promise<void>,
    options: {
      batchSize?: number;
      maxWait?: number; // en millisecondes
      maxMessages?: number;
    } = {}
  ): Promise<() => void> {
    if (!this.jetstream) {
      throw createError.internal('JetStream not initialized');
    }

    const batchSize = options.batchSize || 10;
    const maxWait = options.maxWait || 5000;
    const maxMessages = options.maxMessages || 0; // 0 = illimité

    try {
      const consumer = await this.jetstream.consumers.get(streamName, consumerName);
      const messages = await consumer.consume({
        max_messages: maxMessages,
        expires: maxWait
      });

      let processedCount = 0;
      let isRunning = true;

      // Fonction d'arrêt
      const stop = () => {
        isRunning = false;
        messages.stop();
      };

      // Traitement des messages
      (async () => {
        const batch: any[] = [];
        
        for await (const message of messages) {
          if (!isRunning) break;

          try {
            const metric = this.codec.decode(message.data);
            batch.push({ message, metric });

            // Traiter par batch
            if (batch.length >= batchSize) {
              await this.processBatch(batch, handler);
              batch.length = 0;
            }

            processedCount++;
            if (maxMessages > 0 && processedCount >= maxMessages) {
              break;
            }

          } catch (error) {
            this.metrics.errors++;
            console.error('Error processing message:', error);
            message.nak(); // Negative acknowledgment
          }
        }

        // Traiter le batch restant
        if (batch.length > 0) {
          await this.processBatch(batch, handler);
        }

        console.log(`Consumer ${consumerName} stopped after processing ${processedCount} messages`);
      })();

      return stop;

    } catch (error) {
      throw createError.externalService('NATS', `Failed to start consumer: ${error}`);
    }
  }

  /**
   * Traiter un batch de messages
   */
  private async processBatch(
    batch: Array<{ message: any; metric: KpiMetricEvent }>,
    handler: (metric: KpiMetricEvent) => Promise<void>
  ): Promise<void> {
    const promises = batch.map(async ({ message, metric }) => {
      try {
        await handler(metric);
        message.ack();
        this.metrics.messagesConsumed++;
      } catch (error) {
        console.error('Handler error for metric:', metric.id, error);
        message.nak();
        this.metrics.errors++;
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Obtenir les métriques de performance du streaming
   */
  getMetrics(): StreamingMetrics & {
    avgPublishLatency: number;
    currentConnections: number;
    status: string;
  } {
    const avgLatency = this.metrics.publishLatency.length > 0
      ? this.metrics.publishLatency.reduce((a, b) => a + b, 0) / this.metrics.publishLatency.length
      : 0;

    return {
      ...this.metrics,
      avgPublishLatency: avgLatency,
      currentConnections: this.connection ? 1 : 0,
      status: this.connection?.isClosed() ? 'disconnected' : 'connected'
    };
  }

  /**
   * Obtenir les informations d'un stream
   */
  async getStreamInfo(streamName: string) {
    if (!this.manager) {
      throw createError.internal('NATS manager not initialized');
    }

    try {
      const info = await this.manager.streams.info(streamName);
      return {
        name: info.config.name,
        subjects: info.config.subjects,
        messages: info.state.messages,
        bytes: info.state.bytes,
        firstSeq: info.state.first_seq,
        lastSeq: info.state.last_seq,
        consumerCount: info.state.consumer_count
      };
    } catch (error) {
      throw createError.externalService('NATS', `Failed to get stream info: ${error}`);
    }
  }

  /**
   * Obtenir les informations d'un consommateur
   */
  async getConsumerInfo(streamName: string, consumerName: string) {
    if (!this.manager) {
      throw createError.internal('NATS manager not initialized');
    }

    try {
      const info = await this.manager.consumers.info(streamName, consumerName);
      return {
        name: info.name,
        deliveredSeq: info.delivered.stream_seq,
        ackFloorSeq: info.ack_floor.stream_seq,
        numPending: info.num_pending,
        numRedelivered: info.num_redelivered,
        numWaiting: info.num_waiting
      };
    } catch (error) {
      throw createError.externalService('NATS', `Failed to get consumer info: ${error}`);
    }
  }

  /**
   * Fermeture propre de la connexion
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      console.log('Disconnecting from NATS...');
      await this.connection.drain();
      this.connection = null;
      this.jetstream = null;
      this.manager = null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: any;
  }> {
    try {
      if (!this.connection || this.connection.isClosed()) {
        return {
          status: 'unhealthy',
          details: { error: 'Connection closed' }
        };
      }

      // Test de publication simple
      const testSubject = 'kpi.healthcheck';
      const testMetric: KpiMetricEvent = {
        id: `healthcheck_${Date.now()}`,
        modelName: 'test',
        metricName: 'healthcheck',
        value: 1,
        timestamp: new Date().toISOString(),
        source: 'healthcheck'
      };

      await this.publishMetric(testSubject, testMetric);

      return {
        status: 'healthy',
        details: {
          metrics: this.getMetrics(),
          lastHealthCheck: new Date().toISOString()
        }
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }
}

/**
 * Factory pour créer une instance configurée
 */
export function createNatsClient(config?: Partial<{
  servers: string[];
  reconnect: boolean;
  maxReconnectAttempts: number;
  reconnectTimeWait: number;
}>): NatsStreamingClient {
  const defaultConfig = {
    servers: process.env.NATS_SERVERS?.split(',') || ['localhost:4222'],
    reconnect: true,
    maxReconnectAttempts: 10,
    reconnectTimeWait: 2000
  };

  return new NatsStreamingClient({ ...defaultConfig, ...config });
}

/**
 * Configuration par défaut des streams KPI
 */
export const DEFAULT_STREAMS: StreamConfig[] = [
  {
    name: 'KPI_METRICS',
    subjects: ['kpi.metrics.*', 'kpi.events.*'],
    maxAge: 7 * 24 * 60 * 60, // 7 jours
    maxBytes: 50 * 1024 * 1024 * 1024, // 50GB
    retention: 'limits',
    storage: 'file'
  },
  {
    name: 'KPI_ALERTS',
    subjects: ['kpi.alerts.*'],
    maxAge: 30 * 24 * 60 * 60, // 30 jours
    maxBytes: 10 * 1024 * 1024 * 1024, // 10GB
    retention: 'limits',
    storage: 'file'
  },
  {
    name: 'KPI_INSIGHTS', 
    subjects: ['kpi.insights.*'],
    maxAge: 90 * 24 * 60 * 60, // 90 jours
    maxBytes: 20 * 1024 * 1024 * 1024, // 20GB
    retention: 'limits',
    storage: 'file'
  }
];