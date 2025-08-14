# KPI Model Dashboards IA

Module de gestion des KPI avec modèles IA, dashboards et système d'alertes pour OFM Social OS.

## 🎯 Objectif

Ce module permet aux agents marketing de :
- Lire et analyser leurs KPI en temps réel
- Apprendre les uns des autres via le partage d'insights
- S'auto-améliorer grâce aux recommandations IA
- Recevoir des alertes automatiques sur les anomalies

## 📂 Structure

```
kpi/
├── data/               # Schémas de base de données
│   ├── schema.sql      # Schéma PostgreSQL
│   └── kpiEntity.ts    # Entités TypeORM
├── models/             # Modèles IA/ML
│   ├── BaseModel.ts    # Classe abstraite de base
│   └── MarketingKpiModel.ts # Modèle marketing
├── dashboards/         # Application React Next.js
│   ├── components/     # Composants React
│   ├── lib/           # Utilitaires et API client
│   └── app/           # Pages Next.js
├── alerts/            # Service d'alertes
│   ├── alertService.ts # Logique des alertes
│   └── alertRules.json # Configuration des règles
├── api/               # API REST
│   └── kpiController.ts # Endpoints Express
└── utils/             # Utilitaires
    ├── db.ts          # Connexion base de données
    ├── llm.ts         # Intégration LLM
    └── notif.ts       # Service de notifications
```

## 🚀 Installation

### Prérequis
- Node.js ≥ 18
- PostgreSQL
- Redis (optionnel)
- Clés API pour LLM (OpenAI ou Anthropic)

### Base de données

1. Créer la base de données :
```bash
createdb ofm_social
```

2. Exécuter le schéma :
```bash
psql -d ofm_social -f kpi/data/schema.sql
```

### Variables d'environnement

Créer un fichier `.env` :
```env
# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ofm_social
DB_USER=postgres
DB_PASSWORD=postgres

# API
KPI_API_URL=http://localhost:3000/api/kpi
PORT=3000

# LLM
LLM_PROVIDER=openai # ou anthropic
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=password
ALERT_EMAIL=admin@example.com

# Slack (optionnel)
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Installation des dépendances

```bash
# API et services
cd kpi
npm install

# Dashboard
cd dashboards
npm install
```

## 🔧 Utilisation

### Démarrer l'API

```bash
cd kpi
npm run dev
```

L'API sera disponible sur `http://localhost:3000/api/kpi`

### Démarrer le dashboard

```bash
cd kpi/dashboards
npm run dev
```

Le dashboard sera accessible sur `http://localhost:3001`

### Démarrer le service d'alertes

```javascript
// Dans votre fichier principal
import { startAlertService } from './kpi/alerts/alertService';

// Démarrer avec la configuration par défaut (toutes les 15 minutes)
startAlertService();

// Ou avec un planning personnalisé
startAlertService('*/5 * * * *'); // Toutes les 5 minutes
```

## 📊 API Endpoints

### Ingestion de métriques

```bash
# Ingestion simple
POST /api/kpi/ingest
{
  "modelName": "marketing",
  "metricName": "ctr",
  "value": 2.5,
  "platform": "instagram",
  "campaignId": "camp_123"
}

# Ingestion en batch
POST /api/kpi/ingest/batch
[
  { "modelName": "marketing", "metricName": "ctr", "value": 2.5 },
  { "modelName": "marketing", "metricName": "cpl", "value": 8.0 }
]
```

### Récupération des données

```bash
# Métriques d'un modèle
GET /api/kpi/marketing?platform=instagram&limit=100

# Métriques agrégées
GET /api/kpi/marketing/aggregated?groupBy=hour&metricName=ctr

# Insights
GET /api/kpi/marketing/insights?severity=warning

# Recommandations
GET /api/kpi/marketing/recommendations?status=pending
```

### Analyse

```bash
# Lancer l'analyse d'un modèle
POST /api/kpi/marketing/analyze
```

## 🔗 Intégration avec les services existants

### Marketing

```typescript
import { trackPublishMetrics, trackContentPerformance } from './marketing/backend/hooks/kpiIngestion';

// Après publication de contenu
await trackPublishMetrics({
  platform: 'instagram',
  campaignId: 'camp_123',
  latencyMs: 1500,
  success: true
});

// Après récupération des stats
await trackContentPerformance({
  platform: 'instagram',
  campaignId: 'camp_123',
  contentId: 'content_456',
  impressions: 10000,
  clicks: 250,
  conversions: 25,
  cost: 100
});
```

### Onboarding

```typescript
import { trackSignupStart, trackSignupComplete } from './onboarding/hooks/kpiTracking';

// Au début du signup
await trackSignupStart(userId, 'organic');

// Après completion
await trackSignupComplete(userId, { plan: 'premium' });
```

### Payment

```typescript
import { trackPaymentTransaction } from './payment/hooks/paymentKpiTracking';

// Après une transaction
await trackPaymentTransaction({
  transactionId: 'tx_789',
  userId: 'user_123',
  amount: 29.99,
  currency: 'EUR',
  status: 'success',
  paymentMethod: 'card',
  planType: 'premium'
});
```

## 🤖 Modèles IA

### Créer un nouveau modèle

```typescript
import { BaseModel } from './models/BaseModel';

export class CustomKpiModel extends BaseModel {
  protected name = 'custom';
  
  async fetchMetrics(options?: any): Promise<KpiRecord[]> {
    // Récupérer les métriques depuis la BDD
  }
  
  async analyseKpi(records: KpiRecord[]): Promise<Insight[]> {
    // Analyser les données et détecter les anomalies
  }
  
  async generateRecommendations(insights: Insight[]): Promise<Recommendation[]> {
    // Générer des recommandations basées sur les insights
  }
  
  async learnFromOtherModels(learnings: ModelLearning[]): Promise<void> {
    // Appliquer les apprentissages d'autres modèles
  }
  
  async sharelearnings(): Promise<ModelLearning[]> {
    // Partager les meilleures pratiques découvertes
  }
}
```

## 🚨 Configuration des alertes

Modifier `kpi/alerts/alertRules.json` :

```json
{
  "rules": [
    {
      "id": "custom-alert",
      "modelName": "marketing",
      "metricName": "custom_metric",
      "threshold": 100,
      "comparison": "gt",
      "severity": "warning",
      "message": "Custom metric dépassé",
      "metadata": {
        "timeWindow": "1 hour",
        "aggregation": "avg",
        "debounceMinutes": 60
      }
    }
  ]
}
```

## 📈 Dashboard

Le dashboard affiche :
- Graphiques d'évolution temporelle
- Répartition par plateforme
- Statistiques clés avec tendances
- Insights en temps réel
- Recommandations IA

### Personnalisation

Les composants peuvent être étendus dans `kpi/dashboards/components/` :
- `ModelDashboard.tsx` : Dashboard principal
- Ajouter de nouveaux graphiques avec Chart.js
- Créer des widgets personnalisés

## 🧪 Tests

```bash
# Tests unitaires
npm test

# Tests E2E
npm run test:e2e

# Coverage
npm run test:coverage
```

## 🔒 Sécurité

- Validation des entrées avec Zod
- Rate limiting sur les endpoints
- Authentification requise pour les endpoints sensibles
- Sanitization des données avant stockage
- Chiffrement des clés API sensibles

## 📝 Conventions

- Commits : Conventional Commits
- Code : ESLint + Prettier
- Tests : Jest + Testing Library
- Documentation : JSDoc pour les fonctions publiques

## 🚀 Déploiement

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

### Kubernetes

Voir les manifests dans le dossier `k8s/` du projet principal.

## 📊 Monitoring

Les métriques système sont exposées via Prometheus :
- `kpi_ingestion_total` : Nombre de métriques ingérées
- `kpi_analysis_duration` : Durée des analyses
- `kpi_alerts_triggered` : Alertes déclenchées

## 🤝 Contribution

1. Créer une branche feature
2. Implémenter les changements avec tests
3. Soumettre une PR avec description détaillée
4. Attendre la review et les tests CI

## 📄 License

Voir LICENSE dans le dossier racine du projet.