/**
 * Système de métriques Prometheus/OpenTelemetry pour le système KPI
 */

import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Activer les métriques par défaut (CPU, mémoire, etc.)
collectDefaultMetrics({ register });

/**
 * Métriques ETL
 */
export const etlMetrics = {
  // Compteurs
  recordsProcessed: new Counter({
    name: 'kpi_etl_records_processed_total',
    help: 'Total number of records processed by ETL',
    labelNames: ['model_name', 'status'] // status: valid, invalid, duplicate, outlier
  }),

  batchesProcessed: new Counter({
    name: 'kpi_etl_batches_processed_total',
    help: 'Total number of batches processed',
    labelNames: ['model_name', 'result'] // result: success, error
  }),

  validationErrors: new Counter({
    name: 'kpi_etl_validation_errors_total',
    help: 'Total validation errors by type',
    labelNames: ['model_name', 'error_type']
  }),

  // Histogrammes pour les durées
  processingDuration: new Histogram({
    name: 'kpi_etl_processing_duration_seconds',
    help: 'Time spent processing ETL batches',
    labelNames: ['model_name', 'stage'], // stage: validation, transformation, storage
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  }),

  batchSize: new Histogram({
    name: 'kpi_etl_batch_size',
    help: 'Number of records per batch',
    labelNames: ['model_name'],
    buckets: [10, 50, 100, 500, 1000, 5000]
  }),

  // Gauges pour l'état actuel
  qualityScore: new Gauge({
    name: 'kpi_etl_quality_score',
    help: 'Current data quality score (0-100)',
    labelNames: ['model_name']
  }),

  activeProcessors: new Gauge({
    name: 'kpi_etl_active_processors',
    help: 'Number of active ETL processors'
  })
};

/**
 * Métriques AnalyticsEngine
 */
export const analyticsMetrics = {
  // Compteurs
  analysisRuns: new Counter({
    name: 'kpi_analytics_runs_total',
    help: 'Total number of analytics runs',
    labelNames: ['model_name', 'status'] // status: success, error, timeout
  }),

  insightsGenerated: new Counter({
    name: 'kpi_analytics_insights_generated_total',
    help: 'Total insights generated',
    labelNames: ['model_name', 'algorithm_type', 'severity']
  }),

  anomaliesDetected: new Counter({
    name: 'kpi_analytics_anomalies_detected_total',
    help: 'Total anomalies detected',
    labelNames: ['model_name', 'metric_name', 'method', 'severity']
  }),

  correlationsCalculated: new Counter({
    name: 'kpi_analytics_correlations_calculated_total',
    help: 'Total correlations calculated',
    labelNames: ['model_name', 'significance']
  }),

  llmCalls: new Counter({
    name: 'kpi_analytics_llm_calls_total',
    help: 'Total LLM API calls',
    labelNames: ['provider', 'status'] // provider: openai, anthropic
  }),

  // Histogrammes
  analysisDuration: new Histogram({
    name: 'kpi_analytics_analysis_duration_seconds',
    help: 'Time spent on analytics analysis',
    labelNames: ['model_name', 'stage'], // stage: etl, statistical, llm
    buckets: [1, 5, 10, 30, 60, 120, 300]
  }),

  algorithmDuration: new Histogram({
    name: 'kpi_analytics_algorithm_duration_seconds',
    help: 'Time spent by individual algorithms',
    labelNames: ['algorithm_name', 'model_name'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),

  llmLatency: new Histogram({
    name: 'kpi_analytics_llm_latency_seconds',
    help: 'LLM API call latency',
    labelNames: ['provider', 'model'],
    buckets: [0.5, 1, 2, 5, 10, 20, 30]
  }),

  // Gauges
  activeAnalysis: new Gauge({
    name: 'kpi_analytics_active_analysis',
    help: 'Number of currently running analysis'
  }),

  dataPointsAnalyzed: new Gauge({
    name: 'kpi_analytics_data_points_analyzed',
    help: 'Number of data points in last analysis',
    labelNames: ['model_name']
  })
};

/**
 * Métriques WebSocket
 */
export const websocketMetrics = {
  // Compteurs
  connectionsTotal: new Counter({
    name: 'kpi_websocket_connections_total',
    help: 'Total WebSocket connections',
    labelNames: ['status'] // status: connected, disconnected, error
  }),

  eventsPublished: new Counter({
    name: 'kpi_websocket_events_published_total',
    help: 'Total events published',
    labelNames: ['event_type', 'model_name']
  }),

  eventsDelivered: new Counter({
    name: 'kpi_websocket_events_delivered_total',
    help: 'Total events delivered to clients',
    labelNames: ['event_type', 'model_name']
  }),

  subscriptions: new Counter({
    name: 'kpi_websocket_subscriptions_total',
    help: 'Total subscription operations',
    labelNames: ['operation'] // operation: subscribe, unsubscribe, update_filter
  }),

  // Histogrammes
  deliveryLatency: new Histogram({
    name: 'kpi_websocket_delivery_latency_seconds',
    help: 'Event delivery latency',
    labelNames: ['event_type'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
  }),

  batchSize: new Histogram({
    name: 'kpi_websocket_batch_size',
    help: 'Number of events in batch deliveries',
    buckets: [1, 5, 10, 25, 50, 100]
  }),

  // Gauges
  activeConnections: new Gauge({
    name: 'kpi_websocket_active_connections',
    help: 'Number of active WebSocket connections'
  }),

  bufferedEvents: new Gauge({
    name: 'kpi_websocket_buffered_events',
    help: 'Number of events in buffer'
  }),

  clientsWithFilters: new Gauge({
    name: 'kpi_websocket_clients_with_filters',
    help: 'Number of clients with active filters'
  })
};

/**
 * Métriques de Sécurité
 */
export const securityMetrics = {
  // Compteurs
  requestsTotal: new Counter({
    name: 'kpi_security_requests_total',
    help: 'Total HTTP requests processed',
    labelNames: ['method', 'status_code', 'authenticated']
  }),

  rateLimitHits: new Counter({
    name: 'kpi_security_rate_limit_hits_total',
    help: 'Total rate limit hits',
    labelNames: ['client_type', 'endpoint']
  }),

  authenticationAttempts: new Counter({
    name: 'kpi_security_authentication_attempts_total',
    help: 'Total authentication attempts',
    labelNames: ['method', 'result'] // method: api_key, result: success, failure
  }),

  intrusionAttempts: new Counter({
    name: 'kpi_security_intrusion_attempts_total',
    help: 'Total intrusion attempts detected',
    labelNames: ['attack_type', 'severity']
  }),

  inputSanitized: new Counter({
    name: 'kpi_security_input_sanitized_total',
    help: 'Total input sanitization operations',
    labelNames: ['input_type'] // input_type: body, query, headers
  }),

  // Histogrammes
  requestDuration: new Histogram({
    name: 'kpi_security_request_duration_seconds',
    help: 'HTTP request duration including security middleware',
    labelNames: ['method', 'endpoint'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
  }),

  // Gauges
  activeRateLimits: new Gauge({
    name: 'kpi_security_active_rate_limits',
    help: 'Number of clients currently rate limited'
  }),

  suspiciousClients: new Gauge({
    name: 'kpi_security_suspicious_clients',
    help: 'Number of clients flagged as suspicious'
  })
};

/**
 * Métriques Cross-Model (Benchmarks)
 */
export const benchmarkMetrics = {
  // Compteurs
  benchmarksCalculated: new Counter({
    name: 'kpi_benchmark_calculations_total',
    help: 'Total benchmark calculations',
    labelNames: ['metric_name', 'time_window']
  }),

  learningOpportunities: new Counter({
    name: 'kpi_benchmark_learning_opportunities_total',
    help: 'Total learning opportunities identified',
    labelNames: ['source_model', 'target_model', 'metric_name']
  }),

  // Histogrammes
  benchmarkDuration: new Histogram({
    name: 'kpi_benchmark_calculation_duration_seconds',
    help: 'Time spent calculating benchmarks',
    labelNames: ['metric_name'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  }),

  // Gauges
  modelsCompared: new Gauge({
    name: 'kpi_benchmark_models_compared',
    help: 'Number of models in last benchmark comparison',
    labelNames: ['metric_name']
  }),

  averageConfidence: new Gauge({
    name: 'kpi_benchmark_average_confidence',
    help: 'Average confidence score of learning opportunities',
    labelNames: ['metric_name']
  })
};

/**
 * Métriques Streaming et Backpressure
 */
export const streamingMetrics = {
  // NATS/Streaming métriques
  messagesPublished: new Counter({
    name: 'kpi_nats_messages_published_total',
    help: 'Total messages published to NATS',
    labelNames: ['subject', 'status', 'priority'] // status: success, error; priority: low, medium, high, critical
  }),

  messagesConsumed: new Counter({
    name: 'kpi_nats_messages_consumed_total',
    help: 'Total messages consumed from NATS',
    labelNames: ['stream', 'consumer']
  }),

  messagesDropped: new Counter({
    name: 'kpi_streaming_messages_dropped_total',
    help: 'Total messages dropped due to backpressure',
    labelNames: ['reason', 'subject'] // reason: circuit_breaker, sampling, low_priority, queue_full, max_retries
  }),

  publishLatency: new Histogram({
    name: 'kpi_nats_publish_latency_seconds',
    help: 'Time to publish message to NATS',
    labelNames: ['subject'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25]
  }),

  consumerLag: new Gauge({
    name: 'kpi_nats_consumer_lag',
    help: 'Number of pending messages in consumer',
    labelNames: ['stream', 'consumer']
  }),

  streamSize: new Gauge({
    name: 'kpi_nats_stream_size_bytes',
    help: 'Size of NATS stream in bytes',
    labelNames: ['stream']
  }),

  // Backpressure metrics
  backpressureLevel: new Gauge({
    name: 'kpi_backpressure_degradation_level',
    help: 'Current backpressure degradation level (0=none, 1=low, 2=medium, 3=high, 4=critical)'
  }),

  backpressureMemoryUsage: new Gauge({
    name: 'kpi_backpressure_memory_usage_mb',
    help: 'Current memory usage tracked by backpressure manager'
  }),

  backpressureQueueSize: new Gauge({
    name: 'kpi_backpressure_queue_size',
    help: 'Current internal queue size in backpressure manager'
  }),

  samplingRate: new Gauge({
    name: 'kpi_backpressure_sampling_rate',
    help: 'Current adaptive sampling rate (0-1)'
  }),

  circuitBreakerOpen: new Gauge({
    name: 'kpi_circuit_breaker_open',
    help: 'Circuit breaker status by subject (0=closed, 1=open)',
    labelNames: ['subject']
  }),

  batchesProcessed: new Counter({
    name: 'kpi_streaming_batches_processed_total',
    help: 'Total batches processed by streaming system',
    labelNames: ['subject', 'size'] // size buckets: small, medium, large
  }),

  // Adaptive windows metrics
  adaptiveWindowConfidence: new Gauge({
    name: 'kpi_adaptive_window_confidence',
    help: 'Confidence score for adaptive window recommendations',
    labelNames: ['model_name', 'metric_name']
  }),

  windowAdjustments: new Counter({
    name: 'kpi_adaptive_window_adjustments_total',
    help: 'Total automatic window adjustments',
    labelNames: ['model_name', 'metric_name', 'direction'] // direction: increase, decrease
  })
};

/**
 * Fonctions utilitaires pour instrumenter le code
 */
export class MetricsHelper {
  /**
   * Timer pour mesurer la durée d'exécution
   */
  static startTimer(histogram: Histogram<string>, labels?: Record<string, string>) {
    return histogram.startTimer(labels || {});
  }

  /**
   * Incrémenter un compteur avec gestion d'erreur
   */
  static incrementCounter(counter: Counter<string>, labels?: Record<string, string>, value: number = 1) {
    try {
      counter.inc(labels || {}, value);
    } catch (error) {
      console.error('Failed to increment counter:', error);
    }
  }

  /**
   * Définir une gauge avec gestion d'erreur
   */
  static setGauge(gauge: Gauge<string>, value: number, labels?: Record<string, string>) {
    try {
      gauge.set(labels || {}, value);
    } catch (error) {
      console.error('Failed to set gauge:', error);
    }
  }

  /**
   * Observer une valeur dans un histogramme
   */
  static observeHistogram(histogram: Histogram<string>, value: number, labels?: Record<string, string>) {
    try {
      histogram.observe(labels || {}, value);
    } catch (error) {
      console.error('Failed to observe histogram:', error);
    }
  }

  /**
   * Wrapper pour instrumenter une fonction async
   */
  static async instrumentAsync<T>(
    operation: () => Promise<T>,
    histogram: Histogram<string>,
    labels?: Record<string, string>
  ): Promise<T> {
    const endTimer = histogram.startTimer(labels || {});
    try {
      const result = await operation();
      return result;
    } finally {
      endTimer();
    }
  }

  /**
   * Wrapper pour instrumenter une fonction sync
   */
  static instrument<T>(
    operation: () => T,
    histogram: Histogram<string>,
    labels?: Record<string, string>
  ): T {
    const endTimer = histogram.startTimer(labels || {});
    try {
      return operation();
    } finally {
      endTimer();
    }
  }
}

/**
 * Decorateur pour instrumenter automatiquement les méthodes
 */
export function Timed(histogram: Histogram<string>, labels?: Record<string, string>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const endTimer = histogram.startTimer(labels || {});
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        endTimer();
      }
    };

    return descriptor;
  };
}

/**
 * Middleware Express pour exposer les métriques
 */
export function metricsEndpoint() {
  return async (req: any, res: any) => {
    try {
      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (error) {
      console.error('Error generating metrics:', error);
      res.status(500).end('Error generating metrics');
    }
  };
}

/**
 * Configuration des métriques personnalisées pour l'environnement
 */
export function configureMetrics(config: {
  appName: string;
  version: string;
  environment: string;
}) {
  // Ajouter des labels par défaut
  register.setDefaultLabels({
    app: config.appName,
    version: config.version,
    environment: config.environment,
    instance: process.env.HOSTNAME || 'unknown'
  });

  console.log(`Metrics configured for ${config.appName} v${config.version} in ${config.environment}`);
}

/**
 * Fonction de nettoyage pour les tests
 */
export function clearMetrics() {
  register.clear();
}

/**
 * Export du registre pour usage avancé
 */
export { register };

/**
 * Fonction de health check pour les métriques
 */
export function getMetricsHealth() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metricsCount: register.getMetricsAsArray().length,
    defaultLabels: register.getDefaultLabels()
  };
}