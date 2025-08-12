# 🔧 Backend

## Structure Backend

### 📁 Composants Principaux

```
🔧 backend/
├── 🗄️ database/           # Schema PostgreSQL + Migrations
└── 🚀 api/                # API TypeScript principale
    ├── migrations/        # Migrations Temporal & LLM
    ├── src/              # Code source
    └── tests/            # Tests E2E Playwright
```

---

## 🚀 API Principal (`/api/`)

### Core Features
- **Multi-Platform Publishing** : Instagram, TikTok, X, Reddit
- **Temporal Workflows** : Orchestration durable avec idempotence  
- **LLM Budget System** : Gestion budgets avec hard caps
- **OAuth Integration** : Authentification automatisée
- **E2E Testing** : Suite complète Playwright

### Structure Détaillée
```
api/src/
├── agents/           # KPI loop & agents autonomes
├── cli/             # Outils CLI (LLM reporting)
├── lib/             # Librairies (llm-budget)
├── routes/          # Routes API (auth, publish, budget)
├── temporal/        # Workflows & Activities
└── workers/         # Background workers
```

---

## 🗄️ Database (`/database/`)

### Schema Multi-Tenant
- **Creators** : Isolation par creator_id
- **Accounts** : Comptes OAuth par plateforme  
- **Posts & Assets** : Contenu avec variants
- **LLM Budgets** : Tracking coûts et usage
- **Workflows** : État Temporal persisté

### Migrations
- `002_temporal_migration.sql` : Support Temporal
- `003_llm_budgets.sql` : Système budgets LLM

---

## 🧪 Tests (`/tests/`)

### E2E Coverage
- **API Testing** : Routes publish, auth, budgets
- **OAuth Flows** : Simulation complète OAuth
- **Webhook Verification** : Sécurité signatures
- **Global Setup/Teardown** : Données test automatisées

### Commandes
```bash
npm run test:e2e          # Run all E2E tests
npm run test:setup        # Setup test environment  
npm run test:teardown     # Cleanup test data
```