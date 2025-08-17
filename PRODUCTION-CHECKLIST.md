# Production Deployment Checklist

## ✅ Infrastructure créée

### Fichiers de configuration
- [x] Docker Compose production (`docker-compose.production.yml`)
- [x] Configuration Nginx avec SSL (`nginx.conf`)
- [x] Configuration Prometheus (`monitoring/prometheus.yml`)
- [x] Alertes de monitoring (`monitoring/alerts/service-alerts.yml`)

### Dockerfiles
- [x] Frontend (`site-web/Dockerfile`)
- [x] Payment API (`payment/Dockerfile`)
- [x] Onboarding API (`onboarding/Dockerfile`)
- [x] KPI Service (`kpi/Dockerfile`)
- [x] Outreach/IG DM (`outreach/ig-dm-ui/Dockerfile`)
- [x] Marketing API (déjà existant)

### Scripts
- [x] Script de démarrage (`scripts/start-production.sh`)
- [x] Script d'arrêt (`scripts/stop-production.sh`)
- [x] Script de backup (`scripts/backup.sh`)
- [x] Initialisation DB (`init-scripts/01-create-databases.sql`)
- [x] Migrations (`init-scripts/02-run-migrations.sh`)

### Fichiers .env
- [x] `.env.production` (global)
- [x] `site-web/.env`
- [x] `marketing/backend/api/.env`
- [x] `onboarding/.env`
- [x] `payment/.env.production` (déjà existant)
- [x] `outreach/ig-dm-ui/.env` (déjà existant)

### Sécurité
- [x] Clés de chiffrement générées
- [x] Configuration CORS
- [x] Rate limiting dans Nginx
- [x] Headers de sécurité
- [x] Utilisateurs non-root dans Docker

### Health checks
- [x] Frontend health endpoint
- [x] Docker health checks
- [x] Prometheus monitoring

## 📋 À faire avant le déploiement

### 1. Configuration des domaines
- [ ] Acheter/configurer le domaine principal
- [ ] Créer les sous-domaines (api, admin)
- [ ] Configurer les DNS

### 2. Certificats SSL
```bash
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
sudo certbot certonly --standalone -d api.yourdomain.com
sudo certbot certonly --standalone -d admin.yourdomain.com
```

### 3. Remplacer les placeholders
Dans tous les fichiers .env :
- [ ] Mots de passe PostgreSQL
- [ ] Mots de passe Redis
- [ ] Clés API des plateformes sociales
- [ ] Clés Stripe
- [ ] Configuration SMTP
- [ ] URLs de domaine

### 4. Préparer le serveur
- [ ] Ubuntu 22.04 LTS ou similaire
- [ ] Docker et Docker Compose installés
- [ ] Minimum 8GB RAM, 4 CPU cores
- [ ] 100GB+ stockage SSD

### 5. Sécurité additionnelle
- [ ] Configurer le firewall (UFW)
- [ ] Configurer fail2ban
- [ ] Désactiver l'accès root SSH
- [ ] Configurer les backups automatiques

## 🚀 Commandes de déploiement

1. Cloner le repository sur le serveur
2. Configurer tous les fichiers .env
3. Lancer : `./scripts/start-production.sh`

## 📊 Monitoring

- Prometheus : http://localhost:9090
- Grafana : http://localhost:3001 (si activé)
- Logs : `docker-compose -f docker-compose.production.yml logs -f`

## 🔧 Maintenance

- Backup : Automatique quotidien
- Mise à jour : `docker-compose -f docker-compose.production.yml pull && ./scripts/start-production.sh`
- Redémarrage : `./scripts/stop-production.sh && ./scripts/start-production.sh`