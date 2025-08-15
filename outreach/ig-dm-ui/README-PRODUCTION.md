# 🚀 Production-Ready Instagram DM Automation System

## Overview

Système d'automatisation DM Instagram de niveau entreprise avec:
- 🔐 Gestion automatique des sessions (plus de connexion manuelle quotidienne!)
- 👥 Multi-comptes avec rotation de proxy
- 🤖 Messages IA personnalisés
- 📊 Tracking PostgreSQL complet
- 🎯 Backpressure intelligent par compte
- 📱 Dashboard temps réel

## 🔧 Installation rapide

```bash
# 1. Clone et installation
git clone [repo]
cd outreach/ig-dm-ui
npm install

# 2. Configuration
cp .env.example .env
# Éditer .env avec vos clés API

# 3. Initialiser la base de données
npm run enhanced:db-init

# 4. Initialiser les sessions Instagram
npm run session:init
```

## 🎯 Utilisation quotidienne

### Lancer une campagne
```bash
# Mode dry-run (test)
npm run enhanced:campaign

# Mode production avec sessions
npm run enhanced:campaign -- --no-dry-run

# Sans sessions (mode simulation)
npm run enhanced:campaign -- --no-dry-run --no-sessions
```

### Gestion des sessions
```bash
# Vérifier le statut
npm run session:status

# Health check automatique
npm run session:health

# Refresh des sessions expirées
npm run session:refresh
```

### Monitoring temps réel
```bash
# Lancer le dashboard
npm run enhanced:live

# Accéder à http://localhost:3333
```

## 📋 Workflow complet

### 1. Découverte de prospects
```bash
# US market avec filtres avancés
npm run apify:us

# Ciblage par intention
npm run apify:us-intent
```

### 2. Campagne DM
```bash
# Lancer avec 100 prospects
npm run enhanced:campaign -- --max 100 --no-dry-run
```

### 3. Monitoring des réponses
```bash
# Vérifier les réponses
npm run enhanced:check-replies

# Générer handoff pour closers
npm run enhanced:check-replies -- --handoff
```

### 4. Analyse des performances
```bash
# Statistiques système
npm run enhanced:stats

# Métriques database
npm run enhanced:db-stats
```

## 🔐 Configuration des comptes

### config/account_proxy_config.json
```json
{
  "accounts": [
    {
      "username": "model_account_1",
      "password": "secure_password",
      "proxy": "http://user:pass@proxy1.com:8080",
      "tags": ["warm", "primary"],
      "limits": {
        "dmsPerDay": 100,
        "dmsPerHour": 20
      }
    }
  ]
}
```

## 📊 KPIs à surveiller

### Métriques temps réel (Dashboard)
- **DM Rate**: 15-25 DMs/compte/heure
- **Reply Rate**: >10% (alerte si <5%)
- **Session Health**: >80% des comptes
- **Backpressure**: Ajustement automatique

### SQL pour reporting
```sql
-- Performance par compte (30 min)
SELECT * FROM account_reply_stats 
ORDER BY reply_rate_30m DESC;

-- Top messages performants
SELECT template_text, reply_rate, positive_sentiment_rate
FROM message_templates 
WHERE times_used > 10
ORDER BY reply_rate DESC 
LIMIT 10;

-- Prospects chauds pour closers
SELECT username, sentiment, intent, reply_text 
FROM dm_replies 
WHERE sentiment IN ('positive', 'curious')
AND created_at > NOW() - INTERVAL '24 hours';
```

## 🚨 Sécurité et limites

### Limites Instagram
- 100-150 DMs/jour/compte
- 20-30 DMs/heure/compte
- Pause 1-3 min entre DMs
- 2 likes avant DM

### Garde-fous intégrés
- ✅ Banned terms filtering
- ✅ Idempotence (pas de double DM)
- ✅ Backpressure par compte
- ✅ Dry-run par défaut
- ✅ Session health monitoring

## 🔄 Automatisation Cron

```bash
# crontab -e

# Health check sessions (toutes les 4h)
0 */4 * * * cd /path/to/project && npm run session:health >> logs/health.log

# Refresh sessions (3h du matin)
0 3 * * * cd /path/to/project && npm run session:refresh >> logs/refresh.log

# Campagne quotidienne (10h)
0 10 * * * cd /path/to/project && npm run enhanced:campaign -- --max 50 --no-dry-run --yes

# Check replies (toutes les 2h)
0 */2 * * * cd /path/to/project && npm run enhanced:check-replies --handoff
```

## 📈 Optimisation des performances

### Messages performants
- Courts et naturels (< 100 caractères)
- Emojis modérés (1-2 max)
- Questions ouvertes
- Compliments spécifiques

### Timing optimal
- 10h-14h ET (côte Est US)
- 18h-22h (engagement élevé)
- Éviter dimanche matin

### Ciblage efficace
- Comptes 5k-50k followers
- Bio avec mots-clés (collab, creator)
- Posts récents (<7 jours)
- Localisation US confirmée

## 🛠️ Troubleshooting

### Sessions expirées
```bash
# Forcer refresh
npm run session:refresh -- --force

# Login manuel si nécessaire
npm run session:login -- --username problematic_account
```

### Reply rate faible
- Vérifier diversité des messages
- Ajuster ciblage prospects
- Analyser templates performants

### Erreurs 2FA
```bash
# Marquer 2FA complété
npm run session:2fa -- --username account_name

# Puis refresh
npm run session:refresh
```

## 📞 Support

- Issues GitHub: [lien]
- Documentation API: `/docs`
- Logs: `logs/` directory

---

**⚡ Ready for production!** Ce système est conçu pour gérer 50+ comptes Instagram de manière autonome avec intervention minimale.