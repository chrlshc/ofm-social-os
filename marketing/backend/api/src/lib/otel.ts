import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { trace, context, SpanStatusCode, SpanKind, metrics } from '@opentelemetry/api';
import { env } from './env';
import { logger } from './logger';

// Service configuration
const SERVICE_NAME = 'ofm-social-api';
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0';

// Global SDK instance
let sdk: NodeSDK | null = null;

// Initialize OpenTelemetry if endpoint is configured
export function initializeOtel(): void {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.debug('OTEL_EXPORTER_OTLP_ENDPOINT not configured, skipping OpenTelemetry initialization');
    return;
  }

  try {
    sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
        }),
        exportIntervalMillis: 30000,
      }),
      instrumentations: [getNodeAutoInstrumentations({
        // Disable some noisy instrumentations
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      })],
    });

    sdk.start();
    logger.info({ endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }, 'OpenTelemetry initialized');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize OpenTelemetry');
  }
}

// Shutdown OpenTelemetry
export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry shut down gracefully');
    } catch (error) {
      logger.error({ err: error }, 'Error shutting down OpenTelemetry');
    }
  }
}

// Tracer instance
const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

// Metrics
const meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);

// Counters
export const publishLatencyHistogram = meter.createHistogram('publish_latency_ms', {
  description: 'Publishing latency in milliseconds',
  unit: 'ms',
});

export const publishErrorsCounter = meter.createCounter('publish_errors_total', {
  description: 'Total number of publishing errors',
});

export const publishRequestsCounter = meter.createCounter('publish_requests_total', {
  description: 'Total number of publishing requests',
});

export const llmCostGauge = meter.createUpDownCounter('llm_cost_total', {
  description: 'Total LLM costs in USD',
  unit: '$',
});

export const budgetExceededCounter = meter.createCounter('budget_exceeded_total', {
  description: 'Number of budget exceeded events',
});

// Utility function for creating spans with automatic error handling
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean> = {},
  fn: () => Promise<T> | T,
  kind: SpanKind = SpanKind.INTERNAL
): Promise<T> {
  return tracer.startActiveSpan(name, { kind, attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

// Utility function for adding attributes to current span
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

// Export tracer for advanced usage
export { tracer };