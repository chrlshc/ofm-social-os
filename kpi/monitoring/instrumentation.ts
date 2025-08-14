/**
 * Instrumentation des services KPI avec les métriques Prometheus
 */

import { 
  etlMetrics, 
  analyticsMetrics, 
  websocketMetrics, 
  securityMetrics, 
  benchmarkMetrics,
  MetricsHelper 
} from './metrics';

/**
 * Instrumentation ETL
 */
export class ETLInstrumentation {
  static instrumentETLProcessor() {
    return {
      recordProcessed: (modelName: string, status: 'valid' | 'invalid' | 'duplicate' | 'outlier', count: number = 1) => {
        MetricsHelper.incrementCounter(etlMetrics.recordsProcessed, { model_name: modelName, status }, count);
      },

      batchProcessed: (modelName: string, result: 'success' | 'error') => {
        MetricsHelper.incrementCounter(etlMetrics.batchesProcessed, { model_name: modelName, result });
      },

      validationError: (modelName: string, errorType: string) => {
        MetricsHelper.incrementCounter(etlMetrics.validationErrors, { model_name: modelName, error_type: errorType });
      },

      setQualityScore: (modelName: string, score: number) => {
        MetricsHelper.setGauge(etlMetrics.qualityScore, score, { model_name: modelName });
      },

      updateActiveProcessors: (count: number) => {
        MetricsHelper.setGauge(etlMetrics.activeProcessors, count);
      },

      recordBatchSize: (modelName: string, size: number) => {
        MetricsHelper.observeHistogram(etlMetrics.batchSize, size, { model_name: modelName });
      },

      timeOperation: (modelName: string, stage: 'validation' | 'transformation' | 'storage') => {
        return MetricsHelper.startTimer(etlMetrics.processingDuration, { model_name: modelName, stage });
      }
    };
  }

  static async instrumentETLOperation<T>(
    modelName: string,
    stage: 'validation' | 'transformation' | 'storage',
    operation: () => Promise<T>
  ): Promise<T> {
    return MetricsHelper.instrumentAsync(
      operation,
      etlMetrics.processingDuration,
      { model_name: modelName, stage }
    );
  }
}

/**
 * Instrumentation Analytics
 */
export class AnalyticsInstrumentation {
  static instrumentAnalyticsEngine() {
    return {
      analysisStarted: (modelName: string) => {
        MetricsHelper.incrementCounter(analyticsMetrics.analysisRuns, { model_name: modelName, status: 'started' });
        // Incrémenter les analyses actives
        const current = analyticsMetrics.activeAnalysis.get();
        MetricsHelper.setGauge(analyticsMetrics.activeAnalysis, (current as any)?.values?.[0]?.value + 1 || 1);
      },

      analysisCompleted: (modelName: string, status: 'success' | 'error' | 'timeout') => {
        MetricsHelper.incrementCounter(analyticsMetrics.analysisRuns, { model_name: modelName, status });
        // Décrémenter les analyses actives
        const current = analyticsMetrics.activeAnalysis.get();
        MetricsHelper.setGauge(analyticsMetrics.activeAnalysis, Math.max(0, ((current as any)?.values?.[0]?.value || 1) - 1));
      },

      insightGenerated: (modelName: string, algorithmType: string, severity: string) => {
        MetricsHelper.incrementCounter(analyticsMetrics.insightsGenerated, {
          model_name: modelName,
          algorithm_type: algorithmType,
          severity
        });
      },

      anomalyDetected: (modelName: string, metricName: string, method: string, severity: string) => {
        MetricsHelper.incrementCounter(analyticsMetrics.anomaliesDetected, {
          model_name: modelName,
          metric_name: metricName,
          method,
          severity
        });
      },

      correlationCalculated: (modelName: string, significance: string) => {
        MetricsHelper.incrementCounter(analyticsMetrics.correlationsCalculated, {
          model_name: modelName,
          significance
        });
      },

      llmCallMade: (provider: string, status: 'success' | 'error' | 'timeout') => {
        MetricsHelper.incrementCounter(analyticsMetrics.llmCalls, { provider, status });
      },

      recordDataPoints: (modelName: string, count: number) => {
        MetricsHelper.setGauge(analyticsMetrics.dataPointsAnalyzed, count, { model_name: modelName });
      },

      timeAlgorithm: (algorithmName: string, modelName: string) => {
        return MetricsHelper.startTimer(analyticsMetrics.algorithmDuration, {
          algorithm_name: algorithmName,
          model_name: modelName
        });
      },

      timeLLMCall: (provider: string, model: string) => {
        return MetricsHelper.startTimer(analyticsMetrics.llmLatency, { provider, model });
      },

      timeAnalysis: (modelName: string, stage: 'etl' | 'statistical' | 'llm') => {
        return MetricsHelper.startTimer(analyticsMetrics.analysisDuration, {
          model_name: modelName,
          stage
        });
      }
    };
  }

  static async instrumentAnalysisStage<T>(
    modelName: string,
    stage: 'etl' | 'statistical' | 'llm',
    operation: () => Promise<T>
  ): Promise<T> {
    return MetricsHelper.instrumentAsync(
      operation,
      analyticsMetrics.analysisDuration,
      { model_name: modelName, stage }
    );
  }
}

/**
 * Instrumentation WebSocket
 */
export class WebSocketInstrumentation {
  static instrumentWebSocketServer() {
    return {
      clientConnected: () => {
        MetricsHelper.incrementCounter(websocketMetrics.connectionsTotal, { status: 'connected' });
        // Mettre à jour les connexions actives
        const current = websocketMetrics.activeConnections.get();
        MetricsHelper.setGauge(websocketMetrics.activeConnections, ((current as any)?.values?.[0]?.value || 0) + 1);
      },

      clientDisconnected: () => {
        MetricsHelper.incrementCounter(websocketMetrics.connectionsTotal, { status: 'disconnected' });
        // Mettre à jour les connexions actives
        const current = websocketMetrics.activeConnections.get();
        MetricsHelper.setGauge(websocketMetrics.activeConnections, Math.max(0, ((current as any)?.values?.[0]?.value || 1) - 1));
      },

      clientError: () => {
        MetricsHelper.incrementCounter(websocketMetrics.connectionsTotal, { status: 'error' });
      },

      eventPublished: (eventType: string, modelName: string) => {
        MetricsHelper.incrementCounter(websocketMetrics.eventsPublished, {
          event_type: eventType,
          model_name: modelName
        });
      },

      eventDelivered: (eventType: string, modelName: string, count: number = 1) => {
        MetricsHelper.incrementCounter(websocketMetrics.eventsDelivered, {
          event_type: eventType,
          model_name: modelName
        }, count);
      },

      subscriptionOperation: (operation: 'subscribe' | 'unsubscribe' | 'update_filter') => {
        MetricsHelper.incrementCounter(websocketMetrics.subscriptions, { operation });
      },

      updateBufferedEvents: (count: number) => {
        MetricsHelper.setGauge(websocketMetrics.bufferedEvents, count);
      },

      updateClientsWithFilters: (count: number) => {
        MetricsHelper.setGauge(websocketMetrics.clientsWithFilters, count);
      },

      recordDeliveryLatency: (eventType: string, latencyMs: number) => {
        MetricsHelper.observeHistogram(websocketMetrics.deliveryLatency, latencyMs / 1000, {
          event_type: eventType
        });
      },

      recordBatchSize: (size: number) => {
        MetricsHelper.observeHistogram(websocketMetrics.batchSize, size);
      }
    };
  }

  static measureDeliveryLatency<T>(eventType: string, operation: () => T): T {
    const start = Date.now();
    try {
      const result = operation();
      const latency = Date.now() - start;
      MetricsHelper.observeHistogram(websocketMetrics.deliveryLatency, latency / 1000, {
        event_type: eventType
      });
      return result;
    } catch (error) {
      const latency = Date.now() - start;
      MetricsHelper.observeHistogram(websocketMetrics.deliveryLatency, latency / 1000, {
        event_type: eventType
      });
      throw error;
    }
  }
}

/**
 * Instrumentation Sécurité
 */
export class SecurityInstrumentation {
  static instrumentSecurityMiddleware() {
    return {
      requestProcessed: (method: string, statusCode: number, authenticated: boolean) => {
        MetricsHelper.incrementCounter(securityMetrics.requestsTotal, {
          method,
          status_code: statusCode.toString(),
          authenticated: authenticated.toString()
        });
      },

      rateLimitHit: (clientType: string, endpoint: string) => {
        MetricsHelper.incrementCounter(securityMetrics.rateLimitHits, {
          client_type: clientType,
          endpoint
        });
      },

      authenticationAttempt: (method: string, result: 'success' | 'failure') => {
        MetricsHelper.incrementCounter(securityMetrics.authenticationAttempts, { method, result });
      },

      intrusionAttempt: (attackType: string, severity: string) => {
        MetricsHelper.incrementCounter(securityMetrics.intrusionAttempts, {
          attack_type: attackType,
          severity
        });
      },

      inputSanitized: (inputType: 'body' | 'query' | 'headers') => {
        MetricsHelper.incrementCounter(securityMetrics.inputSanitized, { input_type: inputType });
      },

      updateActiveRateLimits: (count: number) => {
        MetricsHelper.setGauge(securityMetrics.activeRateLimits, count);
      },

      updateSuspiciousClients: (count: number) => {
        MetricsHelper.setGauge(securityMetrics.suspiciousClients, count);
      },

      timeRequest: (method: string, endpoint: string) => {
        return MetricsHelper.startTimer(securityMetrics.requestDuration, { method, endpoint });
      }
    };
  }

  static async instrumentSecurityOperation<T>(
    method: string,
    endpoint: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return MetricsHelper.instrumentAsync(
      operation,
      securityMetrics.requestDuration,
      { method, endpoint }
    );
  }
}

/**
 * Instrumentation Benchmarks
 */
export class BenchmarkInstrumentation {
  static instrumentBenchmarkAnalytics() {
    return {
      benchmarkCalculated: (metricName: string, timeWindow: string) => {
        MetricsHelper.incrementCounter(benchmarkMetrics.benchmarksCalculated, {
          metric_name: metricName,
          time_window: timeWindow
        });
      },

      learningOpportunityFound: (sourceModel: string, targetModel: string, metricName: string) => {
        MetricsHelper.incrementCounter(benchmarkMetrics.learningOpportunities, {
          source_model: sourceModel,
          target_model: targetModel,
          metric_name: metricName
        });
      },

      updateModelsCompared: (metricName: string, count: number) => {
        MetricsHelper.setGauge(benchmarkMetrics.modelsCompared, count, { metric_name: metricName });
      },

      updateAverageConfidence: (metricName: string, confidence: number) => {
        MetricsHelper.setGauge(benchmarkMetrics.averageConfidence, confidence, { metric_name: metricName });
      },

      timeBenchmarkCalculation: (metricName: string) => {
        return MetricsHelper.startTimer(benchmarkMetrics.benchmarkDuration, { metric_name: metricName });
      }
    };
  }

  static async instrumentBenchmarkOperation<T>(
    metricName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return MetricsHelper.instrumentAsync(
      operation,
      benchmarkMetrics.benchmarkDuration,
      { metric_name: metricName }
    );
  }
}

/**
 * Middleware Express pour instrumenter automatiquement les requêtes
 */
export function instrumentExpressApp() {
  const security = SecurityInstrumentation.instrumentSecurityMiddleware();

  return (req: any, res: any, next: any) => {
    const start = Date.now();

    // Instrumenter la fin de la requête
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const authenticated = req.authenticated || false;

      security.requestProcessed(req.method, res.statusCode, authenticated);
      
      MetricsHelper.observeHistogram(securityMetrics.requestDuration, duration, {
        method: req.method,
        endpoint: req.route?.path || req.path || 'unknown'
      });
    });

    next();
  };
}

/**
 * Fonction utilitaire pour créer des decorateurs d'instrumentation
 */
export function createInstrumentationDecorator(
  histogram: any,
  getLabels: (target: any, propertyKey: string, args: any[]) => Record<string, string>
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const labels = getLabels(target, propertyKey, args);
      return MetricsHelper.instrumentAsync(
        () => originalMethod.apply(this, args),
        histogram,
        labels
      );
    };

    return descriptor;
  };
}

/**
 * Fonctions de reporting pour le health check
 */
export function getInstrumentationHealth() {
  return {
    etl: {
      activeProcessors: etlMetrics.activeProcessors.get(),
      recordsProcessedLastHour: etlMetrics.recordsProcessed.get()
    },
    analytics: {
      activeAnalysis: analyticsMetrics.activeAnalysis.get(),
      dataPointsAnalyzed: analyticsMetrics.dataPointsAnalyzed.get()
    },
    websocket: {
      activeConnections: websocketMetrics.activeConnections.get(),
      bufferedEvents: websocketMetrics.bufferedEvents.get()
    },
    security: {
      activeRateLimits: securityMetrics.activeRateLimits.get(),
      suspiciousClients: securityMetrics.suspiciousClients.get()
    },
    timestamp: new Date().toISOString()
  };
}