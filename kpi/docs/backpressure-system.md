# Système de Gestion du Backpressure

Ce document détaille le système de gestion du backpressure intégré au KPI Analytics Platform, conçu pour gérer les scénarios de surcharge extrême avec dégradation gracieuse.

## Vue d'ensemble

Le système de backpressure protège l'infrastructure de streaming contre les surcharges en:
- Surveillant les métriques système (mémoire, CPU, queue, débit)
- Appliquant des stratégies de mitigation adaptatives
- Maintenant la disponibilité du service même sous stress extrême
- Fournissant une observabilité complète des opérations

## Architecture

### Composants Principaux

1. **BackpressureManager** - Gestionnaire central du backpressure
2. **BackpressureAPI** - Interface REST pour la gestion et le monitoring
3. **Metrics Integration** - Intégration avec Prometheus pour l'observabilité
4. **Circuit Breaker** - Protection contre les cascades d'échec

### Diagramme d'Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Applications  │───▶│ BackpressureAPI  │───▶│   Monitoring    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  NATS Streaming │◀───│BackpressureManager│───▶│  Event System   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Message Queue   │◀───│  Circuit Breaker │───▶│ Alert System    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Fonctionnalités

### 1. Surveillance Multi-Dimensionnelle

Le système surveille plusieurs métriques en temps réel:

```typescript
interface BackpressureMetrics {
  currentMemoryMB: number;        // Usage mémoire actuel
  currentQueueSize: number;       // Taille de la queue interne
  currentPublishRate: number;     // Messages/seconde actuels
  currentCpuPercent: number;      // Usage CPU actuel
  droppedMessages: number;        // Messages abandonnés
  sampledMessages: number;        // Messages échantillonnés
  circuitBreakerOpen: boolean;    // État du circuit breaker
  degradationLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}
```

### 2. Niveaux de Dégradation

Le système fonctionne sur 5 niveaux de dégradation:

| Niveau    | Seuil       | Actions                                    | Impact |
|-----------|-------------|-------------------------------------------|--------|
| **None**  | < 70%       | Fonctionnement normal                     | Aucun  |
| **Low**   | 70-100%     | Sampling 90%, batches de 5                | Léger  |
| **Medium**| 100-150%    | Sampling 70%, batches de 10               | Modéré |
| **High**  | 150-200%    | Sampling 50%, batches de 20, drop low priority | Important |
| **Critical** | > 200%   | Sampling 20%, batches de 50, circuit breaker | Sévère |

### 3. Stratégies de Mitigation

#### Échantillonnage Adaptatif
```typescript
// Réduction du taux de messages traités selon la charge
samplingRate = adaptiveRate; // 0.2 à 1.0
shouldProcess = Math.random() <= samplingRate;
```

#### Priorisation des Messages
```typescript
// Priorités: critical > high > medium > low
// Abandon des messages low priority en premier
enum Priority { low = 1, medium = 2, high = 3, critical = 4 }
```

#### Batching Adaptatif
```typescript
// Taille des batches augmente avec la charge
batchSize = calculateOptimalBatch(degradationLevel);
// 1 → 5 → 10 → 20 → 50 selon le niveau
```

#### Circuit Breaker
```typescript
// Protection par subject
circuitBreaker.open('problematic.subject');
// Récupération automatique après délai
```

### 4. Configuration

#### Configuration de Base
```typescript
const config: BackpressureConfig = {
  maxMemoryUsageMB: 512,         // Seuil mémoire
  maxQueueSize: 10000,           // Taille max queue
  maxPublishRate: 1000,          // Messages/sec max
  maxCpuUsagePercent: 80,        // Seuil CPU
  enableCircuitBreaker: true,    // Activer circuit breaker
  enableSampling: true,          // Activer échantillonnage
  enablePrioritization: true,    // Activer priorisation
  enableBatching: true,          // Activer batching
  recoveryThresholdPercent: 70,  // Seuil de récupération
  recoveryDelayMs: 5000,         // Délai récupération
  maxBackoffMs: 30000           // Backoff maximum
};
```

#### Presets Prédéfinis

**Production**
```typescript
PRODUCTION_BACKPRESSURE_CONFIG = {
  maxMemoryUsageMB: 1024,
  maxQueueSize: 50000,
  maxPublishRate: 10000,
  maxCpuUsagePercent: 75,
  // Toutes les stratégies activées
  recoveryThresholdPercent: 60,
  recoveryDelayMs: 10000,
  maxBackoffMs: 60000
};
```

**Development**
```typescript
const devConfig = {
  maxMemoryUsageMB: 256,
  maxQueueSize: 1000,
  maxPublishRate: 100,
  // Circuit breaker et sampling désactivés
  enableCircuitBreaker: false,
  enableSampling: false
};
```

## API REST

### Endpoints Principaux

#### Status et Monitoring
```http
GET /api/backpressure/status
GET /api/backpressure/metrics?timeRange=1h
GET /api/backpressure/health
GET /api/backpressure/health/detailed
```

#### Configuration
```http
GET /api/backpressure/config
PUT /api/backpressure/config
POST /api/backpressure/config/reset
```

#### Circuit Breaker
```http
GET /api/backpressure/circuit-breaker/status
POST /api/backpressure/circuit-breaker
```

#### Load Testing
```http
POST /api/backpressure/load-test
GET /api/backpressure/load-test/status
POST /api/backpressure/load-test/stop
```

#### Actions
```http
POST /api/backpressure/actions/drain-queue
POST /api/backpressure/actions/clear-queue
```

#### Analytics
```http
GET /api/backpressure/analytics/degradation-history
GET /api/backpressure/analytics/recommendations
```

### Exemples d'Utilisation

#### Vérifier le Status
```bash
curl -X GET http://localhost:3000/api/backpressure/status
```

#### Mettre à Jour la Configuration
```bash
curl -X PUT http://localhost:3000/api/backpressure/config \
  -H "Content-Type: application/json" \
  -d '{
    "maxQueueSize": 20000,
    "enableSampling": true
  }'
```

#### Lancer un Test de Charge
```bash
curl -X POST http://localhost:3000/api/backpressure/load-test \
  -H "Content-Type: application/json" \
  -d '{
    "messagesPerSecond": 100,
    "durationSeconds": 60,
    "messageSize": 1024,
    "subjects": ["test.load.marketing", "test.load.payment"]
  }'
```

## Métriques Prometheus

### Métriques de Base
```prometheus
# Niveau de dégradation actuel
kpi_backpressure_degradation_level

# Usage mémoire suivi
kpi_backpressure_memory_usage_mb

# Taille de la queue interne
kpi_backpressure_queue_size

# Taux d'échantillonnage actuel
kpi_backpressure_sampling_rate

# État du circuit breaker par subject
kpi_circuit_breaker_open{subject="kpi.marketing.ctr"}
```

### Métriques de Messages
```prometheus
# Messages publiés avec succès
kpi_nats_messages_published_total{subject="kpi.marketing.ctr",status="success",priority="medium"}

# Messages abandonnés par raison
kpi_streaming_messages_dropped_total{reason="circuit_breaker",subject="kpi.payment.conversion"}

# Latence de publication
kpi_nats_publish_latency_seconds{subject="kpi.onboarding.completion"}

# Batches traités
kpi_streaming_batches_processed_total{subject="kpi.analytics.result",size="medium"}
```

### Requêtes Utiles

#### Taux d'Erreur Global
```promql
rate(kpi_streaming_messages_dropped_total[5m]) / 
rate(kpi_nats_messages_published_total[5m]) * 100
```

#### Latence P95 par Subject
```promql
histogram_quantile(0.95, 
  rate(kpi_nats_publish_latency_seconds_bucket[5m])
)
```

#### Circuits Ouverts
```promql
sum(kpi_circuit_breaker_open) by (subject)
```

## Alertes Recommandées

### Alertes Critiques

#### Dégradation Critique
```yaml
- alert: BackpressureCritical
  expr: kpi_backpressure_degradation_level >= 4
  for: 1m
  annotations:
    summary: "Système en dégradation critique"
    description: "Le système de backpressure est en mode critique (niveau {{ $value }})"
```

#### Circuit Breaker Ouvert
```yaml
- alert: CircuitBreakerOpen
  expr: kpi_circuit_breaker_open == 1
  for: 2m
  annotations:
    summary: "Circuit breaker ouvert"
    description: "Circuit breaker ouvert pour {{ $labels.subject }}"
```

#### Taux d'Erreur Élevé
```yaml
- alert: HighMessageDropRate
  expr: |
    rate(kpi_streaming_messages_dropped_total[5m]) / 
    rate(kpi_nats_messages_published_total[5m]) > 0.1
  for: 5m
  annotations:
    summary: "Taux d'abandon de messages élevé"
    description: "{{ $value | humanizePercentage }} des messages sont abandonnés"
```

### Alertes d'Avertissement

#### Queue Pleine
```yaml
- alert: BackpressureQueueHigh
  expr: kpi_backpressure_queue_size > 8000
  for: 3m
  labels:
    severity: warning
```

#### Memory Usage Élevé
```yaml
- alert: BackpressureMemoryHigh
  expr: kpi_backpressure_memory_usage_mb > 800
  for: 5m
  labels:
    severity: warning
```

## Dashboards Grafana

### Dashboard Principal: "Backpressure Overview"

#### Panel 1: Status Global
- **Type**: Stat
- **Metric**: `kpi_backpressure_degradation_level`
- **Thresholds**: 0=Green, 2=Yellow, 4=Red

#### Panel 2: Métriques Système
- **Type**: Time Series
- **Metrics**: 
  - Memory: `kpi_backpressure_memory_usage_mb`
  - Queue: `kpi_backpressure_queue_size`
  - CPU: `node_cpu_seconds_total`

#### Panel 3: Taux de Messages
- **Type**: Time Series
- **Metrics**:
  - Published: `rate(kpi_nats_messages_published_total[1m])`
  - Dropped: `rate(kpi_streaming_messages_dropped_total[1m])`

#### Panel 4: Circuit Breakers
- **Type**: Stat
- **Metric**: `sum(kpi_circuit_breaker_open) by (subject)`

#### Panel 5: Latence Distribution
- **Type**: Heatmap
- **Metric**: `kpi_nats_publish_latency_seconds_bucket`

### Dashboard Détaillé: "Backpressure Deep Dive"

#### Sections:
1. **System Resources** - CPU, Memory, Disk I/O
2. **Message Flow** - Rates, latencies, errors par subject
3. **Backpressure Actions** - Sampling rates, batch sizes
4. **Recovery Metrics** - Recovery attempts, success rates
5. **Historical Analysis** - Trends, patterns, incidents

## Bonnes Pratiques

### 1. Dimensionnement

#### Configuration Production
```typescript
// Pour 100K messages/minute
const productionConfig = {
  maxMemoryUsageMB: 2048,      // 2GB RAM buffer
  maxQueueSize: 100000,        // 100K messages queue
  maxPublishRate: 2000,        // 2K msg/s (120K/min)
  maxCpuUsagePercent: 70,      // 70% CPU threshold
  recoveryThresholdPercent: 50, // Recovery at 50%
  recoveryDelayMs: 30000,      // 30s recovery delay
  maxBackoffMs: 300000         // 5min max backoff
};
```

#### Monitoring Requirements
- **CPU**: Minimum 4 cores, monitoring à 1s intervals
- **Memory**: Minimum 4GB RAM, 50% réservé pour OS/autres services
- **Network**: Latence < 10ms vers NATS, bandwidth > 1Gbps
- **Storage**: SSD pour logs et métriques

### 2. Tuning

#### Ajustement par Workload

**High Frequency, Low Latency** (Trading, Real-time)
```typescript
{
  maxQueueSize: 50000,
  enableBatching: false,        // Pas de batching
  enableSampling: true,         // Sampling agressif
  recoveryDelayMs: 1000,        // Recovery rapide
  maxBackoffMs: 10000          // Backoff court
}
```

**Batch Processing, High Throughput**
```typescript
{
  maxQueueSize: 200000,
  enableBatching: true,         // Batching activé
  batchSizeMultiplier: 2,       // Batches plus gros
  enablePrioritization: false,  // Pas de priorisation
  recoveryDelayMs: 60000       // Recovery plus lente
}
```

#### Ajustement par Environnement

**Development**
- Seuils élevés pour éviter les interruptions
- Toutes les métriques activées pour debugging
- Recovery rapide pour les tests

**Staging**
- Configuration identique à production
- Simulation de charge régulière
- Monitoring complet activé

**Production**
- Configuration conservatrice
- Alerting complet
- Logging minimal pour performance

### 3. Monitoring et Alerting

#### Métriques Clés à Surveiller
1. **Degradation Level** - Indicateur principal de santé
2. **Message Drop Rate** - Perte de données
3. **Queue Size Trend** - Prédiction de saturation
4. **Recovery Success Rate** - Efficacité du système
5. **Circuit Breaker Activity** - Patterns d'échec

#### Alerting Strategy
- **Immediate** (< 30s): Critical degradation, data loss
- **Short term** (2-5min): Performance degradation, queue growth
- **Medium term** (10-15min): Resource trends, capacity planning
- **Long term** (1h+): Historical analysis, optimization opportunities

### 4. Troubleshooting

#### Problèmes Courants

**Queue Growth Excessif**
```bash
# Diagnostic
curl /api/backpressure/metrics | jq '.data.current.currentQueueSize'

# Solutions
1. Augmenter maxPublishRate
2. Activer batching adaptatif
3. Vérifier la connectivité NATS
4. Scaling horizontal des consumers
```

**Circuit Breaker Ouvert en Permanence**
```bash
# Diagnostic
curl /api/backpressure/circuit-breaker/status

# Solutions
1. Vérifier la santé du subject NATS
2. Ajuster recoveryThresholdPercent
3. Réduire recoveryDelayMs temporairement
4. Investigation des logs d'erreur
```

**Memory Leak Suspecté**
```bash
# Diagnostic
curl /api/backpressure/health/detailed

# Solutions
1. Monitoring memory trends
2. Vérifier la queue cleanup
3. Restart planifié si nécessaire
4. Investigation des références circulaires
```

## Tests et Validation

### Tests de Charge

#### Test de Capacité Maximum
```typescript
const loadTest = {
  messagesPerSecond: 10000,
  durationSeconds: 300,      // 5 minutes
  messageSize: 1024,         // 1KB par message
  subjects: ['test.capacity.1', 'test.capacity.2'],
  expectedSuccessRate: 95    // 95% minimum
};
```

#### Test de Récupération
```typescript
const recoveryTest = {
  overloadDurationSeconds: 60,    // 1 minute de surcharge
  recoveryTimeoutSeconds: 180,    // 3 minutes pour récupération
  expectedRecoveryLevel: 'low',   // Niveau attendu après récupération
  maxRecoveryTime: 120           // 2 minutes max pour récupération
};
```

### Tests d'Intégration

#### Scénarios de Test
1. **Normal Operation** - Fonctionnement sous charge normale
2. **Gradual Overload** - Montée progressive de la charge
3. **Spike Load** - Pic soudain de charge
4. **Network Partitioning** - Perte de connectivité temporaire
5. **Memory Pressure** - Simulation de pression mémoire
6. **CPU Saturation** - Simulation de saturation CPU

#### Métriques de Validation
- **Success Rate** > 95% sous charge normale
- **Recovery Time** < 3 minutes après incident
- **Data Loss** < 1% pendant les pics
- **Latency P95** < 100ms sous charge normale
- **System Stability** - Pas de crash/leak sur 24h

## Évolutions Futures

### Phase 1: Optimisations Immédiates
- [ ] Predictive scaling basé sur les patterns historiques
- [ ] Auto-tuning des paramètres via machine learning
- [ ] Compression adaptative des messages
- [ ] Partitioning intelligent des subjects

### Phase 2: Fonctionnalités Avancées
- [ ] Multi-region backpressure coordination
- [ ] Custom algorithms pluggables
- [ ] Real-time configuration updates
- [ ] Advanced anomaly detection

### Phase 3: Ecosystem Integration
- [ ] Kubernetes native scaling
- [ ] Service mesh integration
- [ ] Multi-cloud deployment
- [ ] Edge computing support

## Support et Maintenance

### Contacts
- **Équipe Platform**: platform-team@company.com
- **Équipe SRE**: sre-team@company.com
- **Escalation**: oncall@company.com

### Documentation
- **API Reference**: `/docs/api/backpressure`
- **Runbooks**: `/docs/runbooks/backpressure`
- **Architecture**: `/docs/architecture/streaming`

### Formation
- **Workshop Backpressure**: Trimestre Q1
- **Certification SRE**: Programme continu
- **Documentation Interne**: Wiki d'équipe