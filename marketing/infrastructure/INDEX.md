# 🏗️ Infrastructure

## Observabilité Complète

### 📊 Grafana Dashboards (`/observability/grafana/dashboards/`)

#### 🎯 System Overview (`ofm-social-overview.json`)
**Vue d'ensemble du système complet**
- **Publish Latency** : P95/P50 par plateforme
- **Error Rates** : Taux d'erreur par type et plateforme  
- **Queue Depth** : Profondeur des queues temps réel
- **Active Workers** : Workers actifs par service
- **Policy Violations** : Violations par sévérité
- **Error Traces** : Traces d'erreur récentes (Tempo)
- **Error Logs** : Logs d'erreur en temps réel (Loki)

#### ⚡ Temporal Workflows (`ofm-temporal-workflows.json`)  
**Monitoring des workflows Temporal**
- **Recent Workflows** : Workflows récents avec traces
- **Execution Rate** : Taux d'exécution par statut (Success/Failed/Running)
- **Activity Duration** : P95/P50 par type d'activité
- **Task Queue Depth** : Profondeur queues Temporal
- **Failure Rate** : Taux d'échec par activité et raison
- **Active Workflows** : Workflows actifs par type  
- **Error Logs** : Logs d'erreur Temporal worker

#### 💰 LLM Budgets (`ofm-llm-budgets.json`)
**Tracking coûts et usage LLM**
- **Average Budget Usage** : Utilisation budget moyenne (%)
- **Hourly LLM Cost** : Coût horaire actuel ($)  
- **Budget Exceeded Rate** : Taux de dépassement budget
- **Cost Rate by Model** : Coût par provider/model
- **Usage Rate by Operation** : Usage par type d'opération
- **Budget Usage by Creator** : Table usage par créateur
- **Daily Spend by Creator** : Dépenses quotidiennes
- **Active Reservations** : Réservations budget actives
- **Budget Alert Logs** : Logs d'alertes budget

---

## 🔧 Stack Technique

### Observability Stack
- **Tempo** : Tracing distribué
- **Loki** : Agrégation de logs  
- **Mimir** : Métriques Prometheus
- **Grafana** : Visualisation et alerting

### OpenTelemetry Integration
```typescript
// Exemple instrumentation
import * as otel from '../lib/otel';

export async function publishActivity(input: PublishInput) {
  return await otel.withSpan('activity.publish', {
    'activity.name': 'publishActivity',
    'social.platform': input.platform
  }, async (span) => {
    // Activity logic with automatic tracing
  });
}
```

---

## 📊 Métriques Clés

### Business Metrics
- `publish_latency_ms` : Latence publication par plateforme
- `publish_errors_total` : Erreurs par plateforme et type
- `policy_violations_total` : Violations par champ et sévérité
- `llm_cost_total` : Coût LLM par provider/model/creator
- `llm_usage_total` : Usage LLM par opération
- `budget_exceeded_total` : Événements dépassement budget

### System Metrics  
- `queue_depth` : Profondeur queues par service
- `active_workers` : Workers actifs par type
- `temporal_workflow_executions_total` : Exécutions workflow
- `temporal_activity_execution_duration_ms` : Durée activités
- `temporal_activity_failures_total` : Échecs activités

---

## 🚨 Alerting

### Alerts Configurées
- Budget LLM > 80% (Warning)
- Budget LLM > 95% (Critical) 
- Publish error rate > 5% (Warning)
- Queue depth > 100 (Warning)
- Workflow failure rate > 10% (Critical)