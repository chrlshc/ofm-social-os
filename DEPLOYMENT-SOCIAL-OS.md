# 🚀 Guide de Déploiement Production - Social OS

## Vue d'ensemble

Ce guide couvre le déploiement complet du système Social OS sur votre infrastructure de production.

## 1. Prérequis Infrastructure

### Serveur Application
- Node.js 18+ 
- PM2 pour process management
- Nginx comme reverse proxy
- SSL/TLS certificat (Let's Encrypt)

### Base de données
- PostgreSQL 14+
- pg-boss installé
- Backup automatique configuré

### Services externes
- Compte Stripe avec Connect activé
- App Reddit créée et approuvée
- Domaine vérifié

## 2. Configuration Production

### Variables d'environnement (.env.production)
```env
# Database
DATABASE_URL_OFM_PRODUCTION=postgresql://prod_user:prod_pass@rds.amazonaws.com:5432/ofm_prod?sslmode=require
CRYPTO_MASTER_KEY=<production-32-char-key>

# Reddit OAuth 
REDDIT_CLIENT_ID=prod_reddit_id
REDDIT_CLIENT_SECRET=prod_reddit_secret
REDDIT_USER_AGENT=ofm-social:v1.0.0 (by /u/ofm_official)
REDDIT_REDIRECT_URI=https://app.yourdomain.com/api/social/auth/reddit/callback

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...

# App
NEXT_PUBLIC_URL=https://app.yourdomain.com
NODE_ENV=production
```

## 3. Déploiement Next.js

### Build de production
```bash
# 1. Installer dépendances
npm ci --production

# 2. Build Next.js
npm run build

# 3. Vérifier build
npm run start
```

### Configuration PM2
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'ofm-social-app',
      script: 'npm',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'ofm-social-worker',
      script: './worker.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
```

### Démarrage avec PM2
```bash
# Démarrer tous les services
pm2 start ecosystem.config.js

# Sauvegarder configuration
pm2 save

# Auto-start au boot
pm2 startup
```

## 4. Configuration Nginx

### Site configuration
```nginx
# /etc/nginx/sites-available/ofm-social
server {
    listen 80;
    server_name app.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Proxy to Next.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API specific timeouts
    location /api/social/publish {
        proxy_pass http://localhost:3000;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

### Activer le site
```bash
ln -s /etc/nginx/sites-available/ofm-social /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## 5. Base de données Production

### Migrations
```bash
# 1. Backup avant migration
pg_dump $DATABASE_URL_OFM_PRODUCTION > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Appliquer migrations
psql $DATABASE_URL_OFM_PRODUCTION < schema.sql
psql $DATABASE_URL_OFM_PRODUCTION < migration-social-os.sql

# 3. Vérifier
psql $DATABASE_URL_OFM_PRODUCTION -c "SELECT * FROM social_publisher.platform_accounts LIMIT 1;"
```

### Configuration pg-boss
```sql
-- Optimisations production
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '4MB';

-- Indexes additionnels
CREATE INDEX CONCURRENTLY idx_posts_user_status 
ON social_publisher.scheduled_posts(owner_id, status);

CREATE INDEX CONCURRENTLY idx_logs_created 
ON social_publisher.post_logs(created_at);
```

## 6. Monitoring et Logs

### Configuration Datadog (optionnel)
```javascript
// lib/monitoring.js
const StatsD = require('node-dogstatsd').StatsD;
const dogstatsd = new StatsD();

export function trackMetric(metric, value, tags = []) {
  if (process.env.NODE_ENV === 'production') {
    dogstatsd.gauge(metric, value, tags);
  }
}

// Usage
trackMetric('social.publish.latency', latency, ['platform:reddit']);
```

### Logs centralisés
```bash
# Configuration rsyslog
echo "*.* @@logs.yourdomain.com:514" >> /etc/rsyslog.conf
systemctl restart rsyslog
```

### Health checks
```javascript
// app/api/health/route.ts
export async function GET() {
  try {
    // Check database
    await pool.query('SELECT 1');
    
    // Check worker
    const boss = new PgBoss(connectionString);
    await boss.start();
    const queueSize = await boss.getQueueSize('post:execute');
    await boss.stop();
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
        worker: 'ok',
        queue_size: queueSize
      }
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error.message
    }, { status: 503 });
  }
}
```

## 7. Sécurité Production

### Firewall rules
```bash
# UFW configuration
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp  # SSH
ufw allow 80/tcp  # HTTP
ufw allow 443/tcp # HTTPS
ufw enable
```

### Secrets management
```bash
# Utiliser AWS Secrets Manager
aws secretsmanager create-secret \
  --name ofm-social/production \
  --secret-string file://secrets.json

# Ou Vault
vault kv put secret/ofm-social/production @secrets.json
```

### Backup automatique
```bash
# Cron job pour backup quotidien
0 2 * * * /usr/local/bin/backup-social-os.sh

# backup-social-os.sh
#!/bin/bash
BACKUP_DIR="/backups/social-os"
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
pg_dump $DATABASE_URL_OFM_PRODUCTION | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Application backup  
tar -czf $BACKUP_DIR/app_$DATE.tar.gz /app/social-os

# Rotation (garder 30 jours)
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

# Upload to S3
aws s3 sync $BACKUP_DIR s3://ofm-backups/social-os/
```

## 8. Mise à jour sans interruption

### Script de déploiement
```bash
#!/bin/bash
# deploy.sh

echo "🚀 Déploiement Social OS..."

# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm ci --production

# 3. Build
npm run build

# 4. Database migrations
psql $DATABASE_URL_OFM_PRODUCTION < migrations/latest.sql

# 5. Reload PM2 (zero downtime)
pm2 reload ecosystem.config.js

echo "✅ Déploiement terminé!"
```

### Rollback procedure
```bash
#!/bin/bash
# rollback.sh

# 1. Restore previous version
git checkout $PREVIOUS_VERSION

# 2. Rebuild
npm ci --production
npm run build

# 3. Restore database if needed
psql $DATABASE_URL_OFM_PRODUCTION < backups/before_deploy.sql

# 4. Reload
pm2 reload all
```

## 9. Monitoring Dashboard

### Métriques clés à surveiller
- Latence API (p50, p95, p99)
- Taux de succès des publications
- Queue size pg-boss
- Erreurs par plateforme
- Token expiration warnings

### Alertes recommandées
```javascript
// Configuration alertes
const alerts = {
  high_latency: {
    threshold: 5000, // 5s
    action: 'email'
  },
  failed_posts: {
    threshold: 10, // per hour
    action: 'slack'
  },
  token_expiring: {
    threshold: 3600, // 1 hour
    action: 'email'
  }
};
```

## 10. Checklist Go-Live

### Avant le lancement
- [ ] Tous les tests passent
- [ ] SSL configuré et testé
- [ ] Backups configurés et testés
- [ ] Monitoring actif
- [ ] Rate limiting configuré
- [ ] Variables de production définies
- [ ] Documentation à jour

### Jour du lancement
- [ ] Backup complet avant switch
- [ ] DNS mis à jour
- [ ] Health checks verts
- [ ] Logs sans erreurs
- [ ] Performance acceptable
- [ ] Rollback plan prêt

### Post-lancement
- [ ] Monitoring 24h
- [ ] Analyse des logs
- [ ] Feedback utilisateurs
- [ ] Optimisations identifiées

---

**Production Ready! 🎉**

Pour toute question: devops@ofm-social.com