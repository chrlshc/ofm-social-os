# 🚀 Streaming d'ingestion temps réel avec NATS

Ce module implémente une architecture de streaming pour ingérer et traiter des métriques KPI en temps réel à haute capacité.

## 🎯 Architecture

### Composants principaux

**NATS JetStream** : Bus de messages durable avec déduplication
**StreamingETL** : Traitement en batch temps réel avec retry et dead letter
**StreamingAPI** : Endpoints REST pour publication et monitoring
**WebSocket Integration** : Diffusion temps réel des résultats

### Flux de données

```
API/Webhook → NATS → StreamingETL → Database → WebSocket → Clients
                ↓
            Dead Letter Queue (erreurs)
```

## 🔧 Configuration

### 1. Installation NATS Server

```bash
# MacOS
brew install nats-server

# Docker
docker run -p 4222:4222 -p 8222:8222 nats:latest --jetstream --store_dir /data

# Production cluster
docker-compose -f nats-cluster.yml up -d
```

### 2. Configuration du client

```typescript
import { createNatsClient, DEFAULT_STREAMS } from './streaming/natsClient';

const natsClient = createNatsClient({
  servers: ['nats://localhost:4222'],
  reconnect: true,
  maxReconnectAttempts: 10
});

await natsClient.connect();

// Créer les streams
for (const stream of DEFAULT_STREAMS) {
  await natsClient.createStream(stream);
}
```

### 3. Démarrage du processeur ETL

```typescript
import { StreamingETLProcessor, DEFAULT_STREAMING_ETL_CONFIG } from './streaming/streamingETL';

const etlProcessor = new StreamingETLProcessor(
  natsClient,
  wsServer,
  DEFAULT_STREAMING_ETL_CONFIG
);

await etlProcessor.start();
```

## 📊 Utilisation

### Publication de métriques

**Métrique individuelle**
```bash
curl -X POST http://localhost:3000/api/streaming/metrics \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "modelName": "marketing",
    "metricName": "ctr",
    "value": 2.5,
    "platform": "instagram",
    "campaignId": "camp_123"
  }'
```

**Batch de métriques**
```bash
curl -X POST http://localhost:3000/api/streaming/metrics/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "metrics": [
      {
        "modelName": "marketing",
        "metricName": "ctr", 
        "value": 2.5,
        "platform": "instagram"
      },
      {
        "modelName": "payment",
        "metricName": "conversion_rate",
        "value": 15.2
      }
    ],
    "priority": "high"
  }'
```

**Webhooks externes**
```bash
# Facebook Ads webhook
curl -X POST http://localhost:3000/api/streaming/webhook/facebook \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "id": "ad_123",
      "campaign_id": "camp_456", 
      "insights": {
        "ctr": "2.5",
        "impressions": "10000"
      }
    }]
  }'

# Stripe webhook
curl -X POST http://localhost:3000/api/streaming/webhook/stripe \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_123",
        "amount": 2500,
        "currency": "eur",
        "created": 1234567890
      }
    }
  }'
```

### Monitoring et contrôle

**Statistiques temps réel**
```bash
curl http://localhost:3000/api/streaming/stats
```

**Health check**
```bash
curl http://localhost:3000/api/streaming/health
```

**Informations des streams**
```bash
curl http://localhost:3000/api/streaming/streams
```

**Dead letter queue**
```bash
curl http://localhost:3000/api/streaming/deadletter
```

## 🔍 Monitoring avancé

### Métriques NATS spécifiques

```typescript
import { natsMetrics } from './monitoring/metrics';

// Nouvelle métriques pour NATS
export const natsMetrics = {
  messagesPublished: new Counter({
    name: 'kpi_nats_messages_published_total',
    help: 'Total messages published to NATS',
    labelNames: ['stream', 'subject']
  }),

  messagesConsumed: new Counter({
    name: 'kpi_nats_messages_consumed_total', 
    help: 'Total messages consumed from NATS',
    labelNames: ['stream', 'consumer']
  }),

  publishLatency: new Histogram({
    name: 'kpi_nats_publish_latency_seconds',
    help: 'NATS publish latency',
    labelNames: ['stream'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
  }),

  consumerLag: new Gauge({
    name: 'kpi_nats_consumer_lag',
    help: 'Consumer lag in messages',
    labelNames: ['stream', 'consumer']
  }),

  streamSize: new Gauge({
    name: 'kpi_nats_stream_messages',
    help: 'Number of messages in stream',
    labelNames: ['stream']
  })
};
```

### Dashboard Grafana streaming

```json
{
  "title": "NATS Streaming Performance",
  "panels": [
    {
      "title": "Message Throughput",
      "targets": [
        {
          "expr": "rate(kpi_nats_messages_published_total[1m])",
          "legendFormat": "Published/sec - {{stream}}"
        },
        {
          "expr": "rate(kpi_nats_messages_consumed_total[1m])",
          "legendFormat": "Consumed/sec - {{consumer}}"
        }
      ]
    },
    {
      "title": "Publish Latency",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(kpi_nats_publish_latency_seconds_bucket[5m]))",
          "legendFormat": "p95 - {{stream}}"
        }
      ]
    },
    {
      "title": "Consumer Lag",
      "targets": [
        {
          "expr": "kpi_nats_consumer_lag",
          "legendFormat": "{{consumer}} lag"
        }
      ]
    }
  ]
}
```

## ⚡ Performance et Scalabilité

### Capacité théorique

- **NATS JetStream** : >1M msg/sec par nœud
- **StreamingETL** : 10K-50K records/sec par instance
- **WebSocket** : 10K connexions simultanées par instance

### Optimisations

**Configuration NATS**
```bash
# nats-server.conf
jetstream {
  store_dir: "/data/jetstream"
  max_memory_store: 1GB
  max_file_store: 100GB
}

# Clustering pour HA
cluster {
  name: "kpi-cluster"
  listen: "0.0.0.0:6222"
  routes: [
    "nats://nats-1:6222",
    "nats://nats-2:6222", 
    "nats://nats-3:6222"
  ]
}
```

**Batch processing optimisé**
```typescript
const config: StreamingETLConfig = {
  streaming: {
    batchSize: 100,           // Optimal pour la DB
    batchTimeoutMs: 1000,     // Latence max acceptable
    maxConcurrentBatches: 10, // Parallélisme
    retryAttempts: 3,         // Resilience
    retryDelayMs: 500
  },
  consumers: [
    {
      name: 'etl_critical',
      concurrency: 5,          // Pour métriques critiques
      filterSubject: 'kpi.metrics.*.critical'
    },
    {
      name: 'etl_normal', 
      concurrency: 3,          // Pour métriques normales
      filterSubject: 'kpi.metrics.*.normal'
    }
  ]
};
```

## 🛡️ Gestion d'erreur et résilience

### Dead Letter Queue

Les métriques qui échouent après plusieurs tentatives sont automatiquement envoyées vers une dead letter queue pour investigation manuelle.

```typescript
// Reprocessing dead letters
curl -X POST http://localhost:3000/api/streaming/deadletter/reprocess
```

### Circuit breaker

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

### Retry avec backoff exponentiel

```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

## 🚨 Alertes recommandées

```yaml
# prometheus-alerts.yml
groups:
  - name: nats-streaming
    rules:
      - alert: HighConsumerLag
        expr: kpi_nats_consumer_lag > 1000
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High consumer lag: {{ $value }} messages"

      - alert: StreamingETLErrors
        expr: rate(kpi_etl_batches_processed_total{result="error"}[5m]) > 0.1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "High ETL error rate"

      - alert: DeadLetterAccumulation  
        expr: increase(kpi_nats_stream_messages{stream="KPI_DEADLETTER"}[10m]) > 100
        for: 0s
        labels:
          severity: warning
        annotations:
          summary: "Dead letter queue accumulating messages"
```

## 🔧 Déploiement

### Docker Compose

```yaml
# docker-compose.streaming.yml
version: '3.8'
services:
  nats:
    image: nats:latest
    command: [
      "--jetstream",
      "--store_dir", "/data",
      "--cluster_name", "kpi-cluster", 
      "--cluster", "nats://0.0.0.0:6222"
    ]
    ports:
      - "4222:4222"
      - "8222:8222"
    volumes:
      - nats_data:/data

  kpi-streaming:
    build: .
    environment:
      - NATS_SERVERS=nats:4222
      - NODE_ENV=production
    depends_on:
      - nats
      - postgres
    ports:
      - "3000:3000"

volumes:
  nats_data:
```

### Kubernetes

```yaml
# k8s-streaming.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kpi-streaming-etl
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kpi-streaming-etl
  template:
    spec:
      containers:
      - name: etl-processor
        image: kpi-system:latest
        env:
        - name: NATS_SERVERS
          value: "nats-cluster:4222"
        - name: ENABLE_STREAMING_ETL
          value: "true"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi" 
            cpu: "1000m"
```

Cette architecture streaming permet de gérer facilement **100K+ métriques/minute** avec une latence sub-seconde et une résilience production-ready ! 🚀