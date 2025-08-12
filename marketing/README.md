# 🎯 OFM Social OS - AI Agent-Based Social Media Publisher

> **Multi-platform publishing avec agents autonomes, repurposing intelligent et conformité API stricte**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9%2B-blue)](https://www.typescriptlang.org/)

## 🚀 Quick Start

```bash
# Clone repository  
git clone https://github.com/USERNAME/ofm-social-os.git
cd ofm-social-os

# Backend API
cd backend/api
npm install
npm run dev

# Reddit Service
cd ../../services/reddit-service  
pip install -r requirements.txt
python app.py

# Import Grafana Dashboards
cd ../../infrastructure/observability/grafana/dashboards/
# Import dans votre instance Grafana
```

## 🏗️ Architecture

### Multi-Platform Support
- **Instagram** : Graph API + Business accounts
- **TikTok** : Content Posting API + chunked upload
- **X (Twitter)** : API v2 + Premium limits  
- **Reddit** : PRAW + rate limit automation

### Core Features
- ✅ **Temporal Workflows** : Durable publishing avec idempotence
- ✅ **LLM Budget System** : Hard caps + cost estimation
- ✅ **KPI-Driven Repurposing** : Auto-repost si métriques < seuil  
- ✅ **FFmpeg Variants** : 9:16, 1:1, 16:9 avec sous-titres
- ✅ **E2E Testing** : Playwright avec OAuth stubs
- ✅ **Grafana Observability** : 3 dashboards complets

## 📊 Tech Stack

### Backend
- **API** : Express.js + TypeScript + OpenAPI
- **Database** : PostgreSQL 15+ multi-tenant  
- **Queue** : Temporal pour workflows durables
- **Cache** : Redis pour sessions + rate limits
- **Storage** : AWS S3 pour assets + variants

### Observability  
- **Traces** : OpenTelemetry → Tempo
- **Logs** : Structured JSON → Loki  
- **Metrics** : Prometheus format → Mimir
- **Dashboards** : Grafana (system, workflows, budgets)

### Services
- **Reddit Service** : Python + Flask + PRAW
- **Future Services** : TikTok chunked upload, IG Business

## 🛡️ Conformité & Sécurité

### Platform Compliance
- **No Engagement Manipulation** : Pas de bots, likes artificiels
- **Official APIs Only** : Utilisation exclusive APIs officielles  
- **Rate Limiting Respectueux** : Quotas conservateurs par plateforme
- **GDPR Ready** : Architecture multi-tenant avec isolation

### Security Features
- **OAuth 2.0** : Multi-platform avec refresh automatique
- **JWT Authentication** : Tokens sécurisés par créateur
- **Webhook Signatures** : Vérification cryptographique
- **Budget Hard Stops** : Prévention dépassements LLM

## 📚 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md) - Vue d'ensemble technique
- [API Documentation](backend/INDEX.md) - Guide API détaillé  
- [Deployment Guide](infrastructure/INDEX.md) - Déploiement production
- [Development Setup](docs/DEVELOPMENT.md) - Setup environnement dev

## 🚀 Déploiement

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost/ofm_social
REDIS_URL=redis://localhost:6379

# Platform APIs
INSTAGRAM_CLIENT_ID=your_instagram_client_id
INSTAGRAM_CLIENT_SECRET=your_instagram_client_secret
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret
X_API_KEY=your_x_api_key
X_API_SECRET=your_x_api_secret
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret

# LLM Providers
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Storage
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
S3_BUCKET=your-assets-bucket
```

### Docker Deployment
```bash
# Backend API
docker build -t ofm-social-api backend/api/
docker run -p 3000:3000 ofm-social-api

# Reddit Service
docker build -t ofm-reddit-service services/reddit-service/
docker run -p 5000:5000 ofm-reddit-service
```

## 🧪 Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Load testing
npm run test:load
```

## 📊 Monitoring

### Grafana Dashboards
1. **System Overview** : Latence, erreurs, queues
2. **Temporal Workflows** : Exécutions, durées, échecs  
3. **LLM Budgets** : Coûts, usage, alertes

### Key Metrics
- `publish_latency_ms` : Latence publication par plateforme
- `publish_errors_total` : Erreurs par type et plateforme
- `llm_cost_total` : Coût LLM par provider/model
- `budget_exceeded_total` : Événements dépassement budget

## 🤝 Contributing

1. Fork le repository
2. Créer une feature branch (`git checkout -b feature/amazing-feature`)
3. Commit les changes (`git commit -m 'Add amazing feature'`)
4. Push vers la branch (`git push origin feature/amazing-feature`)  
5. Ouvrir une Pull Request

### Development Guidelines
- **Code Style** : ESLint + Prettier configurés
- **Tests** : Coverage > 80% requis
- **Documentation** : JSDoc pour fonctions publiques
- **Commits** : Conventional commits format

## 📄 License

MIT License - voir [LICENSE](LICENSE) pour détails.

## 🙏 Acknowledgments

- **OpenAI** : LLM integration et cost estimation
- **Temporal** : Durable workflows infrastructure  
- **Grafana Labs** : Observability stack
- **Platform APIs** : Instagram, TikTok, X, Reddit

---

**🤖 Generated with [Claude Code](https://claude.ai/code)**

*Co-Authored-By: Claude <noreply@anthropic.com>*# Agent GPT Configuration

## GitHub Integration

Ce repository contient l'OFM Social OS avec agents autonomes pour publishing multi-plateformes.

### Fonctionnalités Agents
- Agents autonomes par créateur
- LLM budget system avec hard caps  
- Temporal workflows durables
- Multi-platform API compliance

### Mots-clés pour indexation
social-media-automation, ai-agents, temporal-workflows, multi-platform-publishing, llm-budget-system


