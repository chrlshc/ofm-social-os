# 📊 Monitoring & Observabilité du Système KPI

Ce module fournit une observabilité complète pour tous les composants du système KPI avec Prometheus et Grafana.

## 🎯 Vue d'ensemble

### Métriques collectées

**ETL (Extract-Transform-Load)**
- Débit de traitement (records/sec) par modèle et statut
- Durée des étapes (validation, transformation, stockage)
- Score de qualité des données en temps réel
- Distribution des tailles de batch
- Taux d'erreurs de validation par type

**Analytics Engine**
- Performance des algorithmes statistiques
- Détection d'anomalies par méthode (z-score, IQR, modified z-score)
- Latence des appels LLM par provider
- Nombre d'insights générés par sévérité
- Calculs de corrélations et analyse de tendances

**WebSocket Real-time**
- Connexions actives et événements diffusés
- Latence de livraison des événements
- Taille du buffer et distribution des batches
- Opérations de subscription par type

**Sécurité**
- Rate limiting et tentatives d'intrusion
- Authentification API key (succès/échecs)
- Durée des requêtes avec middlewares de sécurité
- Opérations de sanitisation des inputs

**Cross-Model Benchmarks**
- Calculs de benchmarks par métrique
- Opportunités d'apprentissage détectées
- Score de confiance moyen des recommandations
- Nombre de modèles comparés

## 🚀 Utilisation

### 1. Configuration des métriques

```typescript
import { configureMetrics, metricsEndpoint } from './monitoring/metrics';
import { instrumentExpressApp } from './monitoring/instrumentation';

// Configuration initiale
configureMetrics({
  appName: 'ofm-kpi-system',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development'
});

// Instrumenter Express
app.use(instrumentExpressApp());

// Endpoint pour Prometheus
app.get('/metrics', metricsEndpoint());
```

### 2. Instrumentation ETL

```typescript
import { ETLInstrumentation } from './monitoring/instrumentation';

const etl = ETLInstrumentation.instrumentETLProcessor();

// Dans votre processeur ETL
export class ImprovedETLProcessor {
  async processBatch(records: any[]) {
    const endTimer = etl.timeOperation('marketing', 'validation');
    
    try {
      // Traitement...
      etl.recordProcessed('marketing', 'valid', validRecords.length);
      etl.recordProcessed('marketing', 'invalid', invalidRecords.length);
      etl.setQualityScore('marketing', qualityScore);
      
      etl.batchProcessed('marketing', 'success');
    } catch (error) {
      etl.batchProcessed('marketing', 'error');
      throw error;
    } finally {
      endTimer();
    }
  }
}
```

### 3. Instrumentation Analytics

```typescript
import { AnalyticsInstrumentation } from './monitoring/instrumentation';

const analytics = AnalyticsInstrumentation.instrumentAnalyticsEngine();

export class AnalyticsEngine {
  async runAnalysis(modelName: string) {
    analytics.analysisStarted(modelName);
    
    try {
      // Mesurer chaque étape
      await AnalyticsInstrumentation.instrumentAnalysisStage(
        modelName, 
        'statistical',
        () => this.detectAnomalies(records)
      );
      
      analytics.analysisCompleted(modelName, 'success');
    } catch (error) {
      analytics.analysisCompleted(modelName, 'error');
      throw error;
    }
  }

  detectAnomalies(records: KpiRecord[]) {
    // Pour chaque anomalie détectée
    analytics.anomalyDetected(modelName, metricName, 'zscore', 'high');
  }
}
```

### 4. Instrumentation WebSocket

```typescript
import { WebSocketInstrumentation } from './monitoring/instrumentation';

const ws = WebSocketInstrumentation.instrumentWebSocketServer();

export class SimplifiedWebSocketServer {
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      ws.clientConnected();
      
      socket.on('subscribe', (filter) => {
        ws.subscriptionOperation('subscribe');
      });
      
      socket.on('disconnect', () => {
        ws.clientDisconnected();
      });
    });
  }

  broadcast(event: KpiWebSocketEvent) {
    ws.eventPublished(event.type, event.modelName);
    
    // Mesurer la latence de diffusion
    WebSocketInstrumentation.measureDeliveryLatency(event.type, () => {
      this.io.emit('kpi_event', event);
      ws.eventDelivered(event.type, event.modelName, recipientCount);
    });
  }
}
```

## 📊 Dashboards Grafana

### 1. KPI System Health Overview
- Vue d'ensemble du système (disponibilité, connexions, processeurs actifs)
- Taux de traitement ETL et score de qualité
- Distribution des événements WebSocket
- Métriques de sécurité et opportunités d'apprentissage

### 2. Analytics Performance
- Performance détaillée ETL et AnalyticsEngine
- Durée des algorithmes et détection d'anomalies
- Performance des appels LLM
- Analyse cross-model et points de données traités

### 3. Real-time Monitoring
- Connexions WebSocket en temps réel
- Événements diffusés par type
- Latence de livraison et taille des buffers
- Filtres clients actifs

### 4. Security Dashboard
- Rate limiting et tentatives d'intrusion
- Authentification et accès API
- Durée des requêtes sécurisées
- Clients suspects et inputs sanitisés

## 🔧 Configuration Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'kpi-system'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

## 📈 Alertes recommandées

```yaml
# alerts.yml
groups:
  - name: kpi-system
    rules:
      - alert: ETLQualityLow
        expr: kpi_etl_quality_score < 70
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "ETL data quality is low for {{ $labels.model_name }}"

      - alert: HighAnomalyRate
        expr: rate(kpi_analytics_anomalies_detected_total{severity="high"}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High anomaly detection rate for {{ $labels.model_name }}"

      - alert: WebSocketConnectionsHigh
        expr: kpi_websocket_active_connections > 1000
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "High number of WebSocket connections: {{ $value }}"

      - alert: SecurityIntrusionAttempts
        expr: rate(kpi_security_intrusion_attempts_total[1m]) > 0
        for: 0s
        labels:
          severity: critical
        annotations:
          summary: "Security intrusion attempts detected"
```

## 🩺 Health Checks

```typescript
// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metrics: getInstrumentationHealth(),
    version: process.env.APP_VERSION
  };
  
  res.json(health);
});
```

## 📝 Notes importantes

- Les métriques sont automatiquement préfixées par `kpi_`
- Les labels par défaut incluent `app`, `version`, `environment`, `instance`
- Le registre Prometheus est exporté pour usage avancé
- Fonction `clearMetrics()` disponible pour les tests
- Decorateur `@Timed` pour instrumenter automatiquement les méthodes

Cette instrumentation fournit une visibilité complète sur les performances et la santé du système KPI, permettant une optimisation basée sur des données réelles.