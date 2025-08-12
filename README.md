# OFM Social OS - Marketing System

## 🚀 Multi-Platform Content Marketing System with AI Agents

Système de marketing de contenu multi-plateforme avec des agents IA pour Instagram, TikTok, X (Twitter) et Reddit.

### ✨ Fonctionnalités Principales

- **🤖 Agents IA** - Publication automatisée avec intelligence artificielle
- **📱 Multi-Platform** - Instagram, TikTok, X (Twitter), Reddit
- **🎥 Media Pipeline** - Transcoding FFmpeg, sous-titres Whisper
- **⚡ Temporal Workflows** - Orchestration robuste et durable
- **🔐 Sécurité Enterprise** - Chiffrement, audit, conformité RGPD
- **📊 Monitoring** - SLOs Prometheus, alertes Grafana
- **💾 Backup & DR** - pgBackRest, RPO=15min, RTO=30min

### 🏗️ Architecture

```
marketing/
├── backend/
│   ├── api/                    # API REST Express.js
│   ├── database/              # Migrations PostgreSQL
│   ├── scripts/               # Scripts backup/DR
│   ├── temporal/              # Workflows Temporal
│   └── docker/                # Configuration conteneurs
├── frontend/                  # Interface utilisateur
└── docs/                     # Documentation

outreach/
├── ig-dm-ui/                 # Instagram Automation
├── saas-closer-*.mjs         # Pipeline de vente
└── complete-pipeline.mjs     # Orchestrateur principal
```

### 🔧 Technologies

- **Backend**: Node.js, Express.js, TypeScript
- **Base de données**: PostgreSQL avec pgBackRest
- **Queue**: Temporal.io pour la durabilité
- **Cache**: Redis avec rate limiting
- **Storage**: AWS S3 multipart uploads
- **Monitoring**: Prometheus, Grafana, OpenTelemetry
- **Media**: FFmpeg, Whisper AI

### 📋 PRs Implémentés

- ✅ **PR B** - SecOps Hardening (secrets, RLS, webhooks, audit)
- ✅ **PR C** - CI/CD Supply Chain (GitHub Actions, SBOM, scans)
- ✅ **PR D** - Webhooks Engine (TikTok/Meta, idempotent)
- ✅ **PR E** - Media Pipeline (S3, FFmpeg, Whisper)
- ✅ **PR F** - Multi-account Scaling (rate control, queues)
- ✅ **PR G** - Backup, DR, SLOs, GDPR (conformité)

### 🎯 SLOs & Performance

| Métrique | SLO Target | Status |
|----------|------------|---------|
| Publishing Latency | 95% < 10s | 🟢 |
| API Availability | 99.9% | 🟢 |
| Publishing Success | 99% | 🟢 |
| Media Transcoding | 90% < 5min | 🟢 |
| Webhook Security | 100% | 🟢 |

### 🛡️ Sécurité & Conformité

- **RGPD Article 17** - Effacement et export de données
- **Chiffrement** - At-rest (AES-256) et in-transit (TLS)
- **Audit complet** - Tous les événements tracés
- **Rate limiting** - Protection DDoS et abuse
- **Tokens sécurisés** - Chiffrement + rotation automatique

### 📊 Monitoring & Alertes

- **Prometheus** - Métriques temps réel
- **Grafana** - Dashboards SLO, backup, GDPR
- **Alertmanager** - Alertes multi-niveaux
- **Health checks** - Surveillance continue

### 💾 Backup & Disaster Recovery

- **RPO**: 15 minutes maximum data loss
- **RTO**: 30 minutes maximum recovery time
- **Tests DR**: Automatisés mensuels
- **PITR**: Point-in-time recovery disponible
- **Stockage**: S3 avec rétention configurée

### 🚀 Déploiement

Le système supporte un déploiement en **canari 10%** avec monitoring complet.

```bash
# Setup development
npm install
cp .env.example .env
# Configurer les variables d'environnement

# Start services
docker-compose up -d postgres redis temporal
npm run dev

# Run tests
npm test
npm run test:e2e

# Backup operations
npm run backup:full
npm run backup:diff
npm run backup:incr
npm run dr:test
```

### 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Monitoring Setup](docs/MONITORING.md)
- [Security Guidelines](docs/SECURITY.md)
- [GDPR Compliance](docs/GDPR.md)

### 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/amazing-feature`)
3. Commit les changements (`git commit -m 'Add amazing feature'`)
4. Push vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

### 📝 License

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

**🤖 Generated with [Claude Code](https://claude.ai/code)**

*Co-Authored-By: Claude <noreply@anthropic.com>*