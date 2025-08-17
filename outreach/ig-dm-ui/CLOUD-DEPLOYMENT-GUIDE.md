# 🚀 Guide de Déploiement Cloud - Pipeline Complet 24/7

## 📋 Architecture Complète du Système

```
Discovery → Qualification → DM → Reply Monitor → Handoff → Closing
    ↑                                                           ↓
    └────────────── Anti-Duplication System ──────────────────┘
```

## 🔧 Requirements Système Complet

### 1. **Serveur Cloud**
- **CPU**: 4 vCPUs minimum (8 recommandé)
- **RAM**: 8GB minimum (16GB recommandé)
- **Storage**: 100GB SSD
- **OS**: Ubuntu 22.04 LTS
- **Providers**: AWS EC2, DigitalOcean, Hetzner, OVH

### 2. **Base de Données**
```bash
# PostgreSQL 14+
sudo apt update
sudo apt install postgresql postgresql-contrib

# Créer database
sudo -u postgres psql
CREATE DATABASE instagram_automation;
CREATE USER ig_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE instagram_automation TO ig_user;
```

### 3. **Node.js & Dependencies**
```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Chrome/Chromium pour Puppeteer
sudo apt-get install -y chromium-browser
sudo apt-get install -y libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0
```

### 4. **Proxies Résidentiels**
```javascript
// config/proxies.json
{
  "proxies": [
    {
      "id": "proxy1",
      "url": "http://username:password@residential-proxy1.com:8080",
      "location": "US"
    },
    {
      "id": "proxy2", 
      "url": "http://username:password@residential-proxy2.com:8080",
      "location": "US"
    }
    // Minimum 5 proxies pour 10 comptes
  ]
}
```

### 5. **Comptes Instagram**
```javascript
// config/account_proxy_config.json
{
  "accounts": [
    {
      "username": "model_account_1",
      "password": "secure_password_1",
      "proxy": "proxy1",
      "tags": ["warm", "primary"],
      "limits": {
        "dmsPerDay": 100,
        "dmsPerHour": 20
      }
    }
    // 10-20 comptes recommandés
  ]
}
```

## 📦 Installation Complète

### 1. Clone et Setup
```bash
# Clone repository
git clone [your-repo]
cd outreach/ig-dm-ui

# Install dependencies
npm install

# Setup environment
cp .env.example .env
```

### 2. Configuration Environment
```bash
# .env
# Database
DATABASE_URL=postgresql://ig_user:password@localhost:5432/instagram_automation

# API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Session Encryption
SESSION_ENCRYPTION_KEY=generate-32-byte-hex-key

# Cloud Settings
NODE_ENV=production
PORT=3333
HEALTH_CHECK_PORT=3000

# Intervals (ms)
DISCOVERY_INTERVAL=14400000    # 4 heures
REPLY_CHECK_INTERVAL=1800000   # 30 minutes
HANDOFF_INTERVAL=7200000       # 2 heures

# Limits
MAX_DMS_PER_CYCLE=100
SEEDS_PER_CYCLE=5
CRAWL_DEPTH=2
MIN_OF_SCORE=6

# Monitoring
METRICS_ENABLED=true
LOG_LEVEL=info
```

### 3. Initialize Database
```bash
# Run migrations
npm run enhanced:db-init

# Verify tables
psql -U ig_user -d instagram_automation -c "\dt"
```

### 4. Initialize Sessions
```bash
# Login all accounts (une fois)
npm run session:init

# Verify sessions
npm run session:status
```

## 🚀 Lancement Production

### 1. Script de Démarrage
```bash
#!/bin/bash
# start-pipeline.sh

# Export environment
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=4096"

# Start with PM2
pm2 start ecosystem.config.js

# Or direct with logging
node src/cli-continuous.mjs >> logs/pipeline.log 2>&1
```

### 2. Configuration PM2
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ig-pipeline',
    script: './src/cli-continuous.mjs',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 5000,
    autorestart: true
  }]
};
```

### 3. Commande de Lancement
```bash
# Avec PM2 (recommandé)
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Direct (pour test)
npm run pipeline:continuous

# Avec nohup
nohup npm run pipeline:continuous > pipeline.log 2>&1 &
```

## 📊 Monitoring & Health Checks

### 1. Health Check Endpoint
```bash
# Vérifier santé
curl http://localhost:3000/health

# Response:
{
  "status": "healthy",
  "uptime": 3600,
  "stats": {
    "cycles": 10,
    "discovered": 5000,
    "qualified": 1500,
    "sentToDM": 800,
    "replies": 120,
    "handoffs": 50
  }
}
```

### 2. Logs Structure
```
logs/
├── pipeline.log         # Main pipeline logs
├── discovery.log        # Discovery phase logs
├── dm-automation.log    # DM sending logs
├── replies.log          # Reply monitoring
├── handoff.log          # Closer handoff logs
└── errors.log          # All errors
```

### 3. Monitoring Commands
```bash
# Live logs
pm2 logs ig-pipeline

# Stats
pm2 monit

# Database queries
psql -U ig_user -d instagram_automation

# Active profiles
SELECT COUNT(*) FROM processed_profiles WHERE dm_sent = true;

# Reply rate
SELECT 
  COUNT(*) FILTER (WHERE replied = true) * 100.0 / COUNT(*) as reply_rate
FROM processed_profiles 
WHERE dm_sent = true;
```

## 🔄 Anti-Duplication System

### Garanties:
1. **Jamais de re-DM** - Un profil contacté ne sera JAMAIS recontacté
2. **Pas de re-qualification** - Profils qualifiés une fois seulement
3. **Mémoire persistante** - Survit aux redémarrages

### Tables de tracking:
```sql
-- processed_profiles: Track global
-- dm_conversations: UNIQUE constraint sur username
-- discovered_profiles: Track par seed source
```

## 📈 Pipeline Continu - Flow

```
Toutes les 4 heures:
  → Discovery (5 seeds × 30 suggestions × 30 niveau 2 = 4500 profiles)
  → Qualification (30% = 1350 qualified)
  → Filtrage anti-duplication
  → DM sending (max 100/cycle)

Toutes les 30 minutes:
  → Check replies
  → Update sentiment/intent
  → Mark hot leads

Toutes les 2 heures:
  → Generate handoff CSV
  → Only replied conversations
  → Ready for human closers
```

## 🛡️ Sécurité Production

### 1. Sessions Instagram
```bash
# Backup sessions
tar -czf sessions-backup-$(date +%Y%m%d).tar.gz sessions/

# Rotation automatique
0 3 * * * cd /path/to/project && npm run session:refresh
```

### 2. Database Backup
```bash
# Backup quotidien
pg_dump instagram_automation > backup-$(date +%Y%m%d).sql

# Cron
0 2 * * * pg_dump instagram_automation > /backups/ig-$(date +\%Y\%m\%d).sql
```

### 3. Monitoring Santé
```bash
# Alerting si down
*/5 * * * * curl -f http://localhost:3000/health || echo "Pipeline DOWN" | mail -s "Alert" admin@example.com
```

## 🎯 Optimisations Cloud

### 1. Resources
- **CPU**: Pics pendant discovery phase
- **RAM**: Stable ~2-4GB
- **Network**: ~100MB/hour
- **Storage**: ~1GB/semaine de logs

### 2. Scaling
```javascript
// Pour plus de volume
{
  seedsPerCycle: 10,      // Plus de seeds
  crawlDepth: 3,          // Plus profond
  maxDMsPerCycle: 200,    // Plus de DMs
  discoveryInterval: 2h   // Plus fréquent
}
```

### 3. Multi-Instance (Advanced)
```javascript
// Instance 1: Discovery only
// Instance 2: DM sending only
// Instance 3: Reply monitoring only
// Communiquent via PostgreSQL
```

## 📞 Support & Troubleshooting

### Erreurs Communes:
1. **"No sessions found"** → Run `npm run session:init`
2. **"Database connection failed"** → Check DATABASE_URL
3. **"Proxy timeout"** → Verify proxy credentials
4. **"Rate limit"** → Reduce seedsPerCycle

### Commandes Debug:
```bash
# Test individual components
npm run pipeline:test
npm run session:status
npm run enhanced:db-stats

# Check processed profiles
SELECT username, dm_sent, replied, handed_off 
FROM processed_profiles 
ORDER BY first_discovered DESC 
LIMIT 20;
```

## 🚀 Checklist Déploiement

- [ ] Serveur cloud provisionné
- [ ] PostgreSQL installé et configuré
- [ ] Node.js 20+ installé
- [ ] Chrome/Chromium installé
- [ ] Repository cloné
- [ ] Dependencies installées (`npm install`)
- [ ] `.env` configuré
- [ ] Database initialisée
- [ ] Proxies configurés et testés
- [ ] Comptes Instagram configurés
- [ ] Sessions Instagram initialisées
- [ ] PM2 installé globalement
- [ ] Pipeline lancé avec PM2
- [ ] Health check accessible
- [ ] Logs fonctionnels
- [ ] Backup automatique configuré
- [ ] Monitoring alerts setup

---

**🎊 Une fois tout configuré**, le système tourne 24/7 automatiquement:
- Découvre des profils en continu
- Qualifie avec détection OF
- Envoie DMs sans duplication
- Monitor les replies
- Génère handoffs pour closers
- Zero intervention manuelle! 🤖