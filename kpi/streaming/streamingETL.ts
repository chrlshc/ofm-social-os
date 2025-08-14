/**
 * ETL Streaming pour traiter les métriques KPI en temps réel via NATS
 */

import { NatsStreamingClient, KpiMetricEvent } from './natsClient';
import { ImprovedETLProcessor, ValidationResult, ETLConfig } from '../etl/ImprovedETLProcessor';
import { SimplifiedWebSocketServer } from '../api/simplifiedWebSocket';
import { ETLInstrumentation } from '../monitoring/instrumentation';
import { createError } from '../utils/errorHandler';

export interface StreamingETLConfig extends ETLConfig {
  streaming: {
    batchSize: number;
    batchTimeoutMs: number;
    maxConcurrentBatches: number;
    retryAttempts: number;
    retryDelayMs: number;
    deadLetterSubject: string;
  };
  consumers: {
    name: string;
    concurrency: number;
    filterSubject?: string;
  }[];
}

export interface StreamingETLMetrics {
  batchesProcessed: number;
  recordsProcessed: number;
  processingErrors: number;
  avgBatchSize: number;
  avgProcessingTime: number;
  backlogSize: number;
  deadLetterCount: number;
}

export class StreamingETLProcessor {
  private etlProcessor: ImprovedETLProcessor;
  private instrumentation = ETLInstrumentation.instrumentETLProcessor();
  private isProcessing = false;
  private activeBatches = 0;
  private recordBuffer: KpiMetricEvent[] = [];
  private bufferTimer: NodeJS.Timeout | null = null;
  private metrics: StreamingETLMetrics = {
    batchesProcessed: 0,
    recordsProcessed: 0,
    processingErrors: 0,
    avgBatchSize: 0,
    avgProcessingTime: 0,
    backlogSize: 0,
    deadLetterCount: 0
  };

  constructor(
    private natsClient: NatsStreamingClient,
    private wsServer: SimplifiedWebSocketServer | null,
    private config: StreamingETLConfig
  ) {
    this.etlProcessor = new ImprovedETLProcessor(config);
  }

  /**
   * Démarrer le traitement streaming
   */
  async start(): Promise<void> {
    if (this.isProcessing) {
      console.log('Streaming ETL already running');
      return;
    }

    console.log('Starting Streaming ETL processor...');
    this.isProcessing = true;
    this.instrumentation.updateActiveProcessors(1);

    // Démarrer les consommateurs configurés
    const stopFunctions: (() => void)[] = [];
    
    for (const consumerConfig of this.config.consumers) {
      const stopFn = await this.startConsumer(consumerConfig);
      stopFunctions.push(stopFn);
    }

    // Démarrer le timer de batch
    this.startBatchTimer();

    console.log(`Started ${this.config.consumers.length} streaming ETL consumers`);

    // Fonction de nettoyage
    process.on('SIGINT', async () => {
      console.log('Stopping Streaming ETL...');
      this.isProcessing = false;
      
      // Arrêter tous les consommateurs
      stopFunctions.forEach(stop => stop());
      
      // Traiter le buffer restant
      await this.flushBuffer();
      
      this.instrumentation.updateActiveProcessors(0);
      process.exit(0);
    });
  }

  /**
   * Démarrer un consommateur spécifique
   */
  private async startConsumer(consumerConfig: {
    name: string;
    concurrency: number;
    filterSubject?: string;
  }): Promise<() => void> {
    
    const stopFunctions: (() => void)[] = [];

    // Créer plusieurs instances pour la concurrence
    for (let i = 0; i < consumerConfig.concurrency; i++) {
      const instanceName = `${consumerConfig.name}_${i}`;
      
      const stopFn = await this.natsClient.consume(
        'KPI_METRICS',
        instanceName,
        (metric) => this.handleMetric(metric),
        {
          batchSize: this.config.streaming.batchSize,
          maxWait: this.config.streaming.batchTimeoutMs
        }
      );

      stopFunctions.push(stopFn);
    }

    console.log(`Started ${consumerConfig.concurrency} instances of consumer ${consumerConfig.name}`);

    // Fonction d'arrêt globale pour ce consommateur
    return () => {
      stopFunctions.forEach(stop => stop());
    };
  }

  /**
   * Traiter une métrique reçue via NATS
   */
  private async handleMetric(metric: KpiMetricEvent): Promise<void> {
    try {
      // Ajouter au buffer
      this.recordBuffer.push(metric);
      this.metrics.backlogSize = this.recordBuffer.length;

      // Traiter immédiatement si le buffer est plein
      if (this.recordBuffer.length >= this.config.streaming.batchSize) {
        await this.processBatch();
      }

    } catch (error) {
      console.error('Error handling metric:', error);
      this.metrics.processingErrors++;
      
      // Envoyer vers dead letter queue
      await this.sendToDeadLetter(metric, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Traiter un batch de métriques
   */
  private async processBatch(): Promise<void> {
    if (this.recordBuffer.length === 0) return;
    
    // Vérifier la limite de concurrence
    if (this.activeBatches >= this.config.streaming.maxConcurrentBatches) {
      console.log('Max concurrent batches reached, waiting...');
      return;
    }

    const batchToProcess = this.recordBuffer.splice(0, this.config.streaming.batchSize);
    this.activeBatches++;

    const startTime = Date.now();
    const endTimer = this.instrumentation.timeOperation(batchToProcess[0]?.modelName || 'unknown', 'validation');

    try {
      // Convertir les événements NATS en format ETL
      const records = batchToProcess.map(event => ({
        modelName: event.modelName,
        metricName: event.metricName,
        value: event.value,
        platform: event.platform,
        campaignId: event.campaignId,
        metadata: event.metadata,
        createdAt: new Date(event.timestamp)
      }));

      // Traitement ETL
      const result = await this.etlProcessor.processBatch(records);
      
      // Sauvegarder les données validées
      const storageResult = await this.etlProcessor.saveValidatedData(result.valid);

      // Métriques
      const processingTime = Date.now() - startTime;
      this.updateMetrics(result, processingTime);

      // Diffuser les résultats via WebSocket
      await this.broadcastResults(result, batchToProcess);

      // Logging
      console.log(`Processed batch: ${result.stats.validCount}/${result.stats.total} valid, ${storageResult.saved} saved, ${processingTime}ms`);

      this.instrumentation.batchProcessed(batchToProcess[0]?.modelName || 'unknown', 'success');
      
    } catch (error) {
      console.error('Batch processing error:', error);
      this.metrics.processingErrors++;
      
      // Retry logic
      await this.retryBatch(batchToProcess, error);
      
      this.instrumentation.batchProcessed(batchToProcess[0]?.modelName || 'unknown', 'error');
      
    } finally {
      this.activeBatches--;
      endTimer();
    }
  }

  /**
   * Retry d'un batch avec backoff exponentiel
   */
  private async retryBatch(batch: KpiMetricEvent[], error: any, attempt: number = 1): Promise<void> {
    if (attempt > this.config.streaming.retryAttempts) {
      console.error(`Max retry attempts reached for batch, sending to dead letter`);
      
      for (const metric of batch) {
        await this.sendToDeadLetter(metric, `Max retries exceeded: ${error.message}`);
      }
      return;
    }

    const delay = this.config.streaming.retryDelayMs * Math.pow(2, attempt - 1);
    console.log(`Retrying batch in ${delay}ms (attempt ${attempt}/${this.config.streaming.retryAttempts})`);
    
    setTimeout(async () => {
      try {
        // Remettre le batch dans le buffer avec priorité
        this.recordBuffer.unshift(...batch);
        await this.processBatch();
      } catch (retryError) {
        await this.retryBatch(batch, retryError, attempt + 1);
      }
    }, delay);
  }

  /**
   * Envoyer vers dead letter queue
   */
  private async sendToDeadLetter(metric: KpiMetricEvent, reason: string): Promise<void> {
    try {
      const deadLetterEvent = {
        ...metric,
        deadLetterReason: reason,
        deadLetterTimestamp: new Date().toISOString(),
        originalTimestamp: metric.timestamp
      };

      await this.natsClient.publishMetric(this.config.streaming.deadLetterSubject, deadLetterEvent);
      this.metrics.deadLetterCount++;
      
    } catch (error) {
      console.error('Failed to send to dead letter queue:', error);
    }
  }

  /**
   * Diffuser les résultats via WebSocket
   */
  private async broadcastResults(result: ValidationResult, originalEvents: KpiMetricEvent[]): Promise<void> {
    if (!this.wsServer) return;

    try {
      // Diffuser les métriques validées
      for (const record of result.valid) {
        this.wsServer.sendMetricUpdate(record.modelName, {
          metricName: record.metricName,
          value: record.value,
          platform: record.platform,
          timestamp: record.createdAt,
          validated: true
        });
      }

      // Diffuser les alertes pour les données invalides significatives
      if (result.stats.invalidCount > result.stats.total * 0.1) { // Plus de 10% d'erreurs
        this.wsServer.sendAlert('system', {
          type: 'data_quality',
          severity: 'warning',
          message: `High validation error rate: ${result.stats.invalidCount}/${result.stats.total}`,
          timestamp: new Date().toISOString(),
          metadata: {
            batch_id: originalEvents[0]?.id,
            error_rate: (result.stats.invalidCount / result.stats.total * 100).toFixed(2)
          }
        });
      }

    } catch (error) {
      console.error('Error broadcasting results:', error);
    }
  }

  /**
   * Mettre à jour les métriques de performance
   */
  private updateMetrics(result: ValidationResult, processingTime: number): void {
    this.metrics.batchesProcessed++;
    this.metrics.recordsProcessed += result.stats.total;
    
    // Moyenne mobile pour la taille de batch
    this.metrics.avgBatchSize = (this.metrics.avgBatchSize * (this.metrics.batchesProcessed - 1) + result.stats.total) / this.metrics.batchesProcessed;
    
    // Moyenne mobile pour le temps de traitement
    this.metrics.avgProcessingTime = (this.metrics.avgProcessingTime * (this.metrics.batchesProcessed - 1) + processingTime) / this.metrics.batchesProcessed;
    
    this.metrics.backlogSize = this.recordBuffer.length;

    // Instrumentation Prometheus
    this.instrumentation.recordProcessed(
      result.valid[0]?.modelName || 'unknown',
      'valid',
      result.stats.validCount
    );
    
    this.instrumentation.recordProcessed(
      result.invalid[0]?.record?.modelName || 'unknown',
      'invalid',
      result.stats.invalidCount
    );

    this.instrumentation.recordBatchSize(
      result.valid[0]?.modelName || 'unknown',
      result.stats.total
    );
  }

  /**
   * Démarrer le timer de batch périodique
   */
  private startBatchTimer(): void {
    this.bufferTimer = setInterval(async () => {
      if (this.recordBuffer.length > 0 && this.isProcessing) {
        await this.processBatch();
      }
    }, this.config.streaming.batchTimeoutMs);
  }

  /**
   * Vider le buffer (pour l'arrêt propre)
   */
  private async flushBuffer(): Promise<void> {
    if (this.bufferTimer) {
      clearInterval(this.bufferTimer);
      this.bufferTimer = null;
    }

    while (this.recordBuffer.length > 0 && this.activeBatches < this.config.streaming.maxConcurrentBatches) {
      await this.processBatch();
    }

    // Attendre que tous les batches actifs se terminent
    while (this.activeBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Buffer flushed, all batches completed');
  }

  /**
   * Obtenir les métriques de performance
   */
  getMetrics(): StreamingETLMetrics {
    return { ...this.metrics };
  }

  /**
   * Obtenir les statistiques détaillées
   */
  async getDetailedStats(): Promise<{
    metrics: StreamingETLMetrics;
    natsMetrics: any;
    streamInfo: any;
    consumerInfo: any[];
  }> {
    const natsMetrics = this.natsClient.getMetrics();
    const streamInfo = await this.natsClient.getStreamInfo('KPI_METRICS');
    
    const consumerInfo = [];
    for (const consumer of this.config.consumers) {
      for (let i = 0; i < consumer.concurrency; i++) {
        const instanceName = `${consumer.name}_${i}`;
        try {
          const info = await this.natsClient.getConsumerInfo('KPI_METRICS', instanceName);
          consumerInfo.push({ name: instanceName, ...info });
        } catch (error) {
          consumerInfo.push({ name: instanceName, error: error.message });
        }
      }
    }

    return {
      metrics: this.metrics,
      natsMetrics,
      streamInfo,
      consumerInfo
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    const issues = [];

    // Vérifier le backlog
    if (this.metrics.backlogSize > this.config.streaming.batchSize * 10) {
      issues.push('High backlog size');
    }

    // Vérifier le taux d'erreur
    const errorRate = this.metrics.processingErrors / Math.max(1, this.metrics.batchesProcessed);
    if (errorRate > 0.1) {
      issues.push('High error rate');
    }

    // Vérifier la latence
    if (this.metrics.avgProcessingTime > 5000) {
      issues.push('High processing latency');
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (issues.length > 0) {
      status = issues.length > 2 ? 'unhealthy' : 'degraded';
    }

    return {
      status,
      details: {
        isProcessing: this.isProcessing,
        activeBatches: this.activeBatches,
        metrics: this.metrics,
        issues
      }
    };
  }

  /**
   * Arrêter le traitement
   */
  async stop(): Promise<void> {
    console.log('Stopping Streaming ETL...');
    this.isProcessing = false;
    
    await this.flushBuffer();
    this.instrumentation.updateActiveProcessors(0);
    
    console.log('Streaming ETL stopped');
  }
}

/**
 * Configuration par défaut pour le streaming ETL
 */
export const DEFAULT_STREAMING_ETL_CONFIG: StreamingETLConfig = {
  enableDuplicateDetection: true,
  enableOutlierDetection: true,
  outlierThreshold: 3,
  batchSize: 100,
  enableMetricSpecificValidation: true,
  streaming: {
    batchSize: 50,
    batchTimeoutMs: 2000,
    maxConcurrentBatches: 5,
    retryAttempts: 3,
    retryDelayMs: 1000,
    deadLetterSubject: 'kpi.deadletter'
  },
  consumers: [
    {
      name: 'etl_processor_primary',
      concurrency: 3,
      filterSubject: 'kpi.metrics.*'
    },
    {
      name: 'etl_processor_alerts',
      concurrency: 1,
      filterSubject: 'kpi.alerts.*'
    }
  ]
};