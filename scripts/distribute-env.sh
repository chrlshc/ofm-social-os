#!/bin/bash
# Script pour distribuer les variables d'environnement vers tous les services

set -e

echo "🔧 Distribution des variables d'environnement..."

# Vérifier que le fichier source existe
if [ ! -f ".env.all-services" ]; then
    echo "❌ Erreur: .env.all-services n'existe pas!"
    exit 1
fi

# Charger toutes les variables
set -a
source .env.all-services
set +a

# Créer le répertoire de backup
mkdir -p backups/env-$(date +%Y%m%d_%H%M%S)

# Fonction pour créer un fichier .env
create_env_file() {
    local file_path=$1
    local content=$2
    
    # Backup si le fichier existe
    if [ -f "$file_path" ]; then
        cp "$file_path" "backups/env-$(date +%Y%m%d_%H%M%S)/$(basename $file_path)"
    fi
    
    # Créer le fichier
    echo "$content" > "$file_path"
    echo "✅ Créé: $file_path"
}

# 1. .env.production (global)
create_env_file ".env.production" "# Global Production Environment Variables

# Database
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
DATABASE_URL=$DATABASE_URL_MAIN

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD

# Domain
DOMAIN=$DOMAIN
API_DOMAIN=$API_DOMAIN
ADMIN_DOMAIN=$ADMIN_DOMAIN

# SSL
SSL_EMAIL=$SSL_EMAIL

# Backup
BACKUP_RETENTION_DAYS=$BACKUP_RETENTION_DAYS
BACKUP_S3_BUCKET=$BACKUP_S3_BUCKET

# Monitoring
GRAFANA_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD
PROMETHEUS_RETENTION=30d

# Node Environment
NODE_ENV=$NODE_ENV"

# 2. site-web/.env
create_env_file "site-web/.env" "# Neon Database URL
DATABASE_URL=$DATABASE_URL_SITE

# Optional: API base URL
NEXT_PUBLIC_API_BASE=https://$API_DOMAIN"

# 3. marketing/backend/api/.env
create_env_file "marketing/backend/api/.env" "# Database & Cache
DATABASE_URL=$DATABASE_URL_MARKETING
REDIS_URL=$REDIS_URL

# Runtime Configuration
NODE_ENV=$NODE_ENV
PORT=$PORT_MARKETING
LOG_LEVEL=$LOG_LEVEL

# Security & Encryption
MASTER_ENCRYPTION_KEY=$MASTER_ENCRYPTION_KEY
WEBHOOK_SECRET=$WEBHOOK_SECRET
META_VERIFY_TOKEN=$META_VERIFY_TOKEN

# Platform API Credentials
INSTAGRAM_CLIENT_ID=$INSTAGRAM_CLIENT_ID
INSTAGRAM_CLIENT_SECRET=$INSTAGRAM_CLIENT_SECRET
TIKTOK_CLIENT_KEY=$TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET=$TIKTOK_CLIENT_SECRET
X_API_KEY=$X_API_KEY
X_API_SECRET=$X_API_SECRET
REDDIT_CLIENT_ID=$REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET=$REDDIT_CLIENT_SECRET

# AWS Storage
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
S3_BUCKET=$S3_BUCKET
AWS_REGION=$AWS_REGION

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=$OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_SERVICE_NAME=ofm-marketing-api

# External Services
REDDIT_SERVICE_URL=http://localhost:5000
REDDIT_SERVICE_KEY=internal-service-key
FRONTEND_URL=$FRONTEND_URL

# Feature Flags
DISABLE_INSTAGRAM=$DISABLE_INSTAGRAM
DISABLE_TIKTOK=$DISABLE_TIKTOK
DISABLE_X=$DISABLE_X
DISABLE_REDDIT=$DISABLE_REDDIT

MAX_REQUESTS_PER_MINUTE=$MAX_REQUESTS_PER_MINUTE
MAX_CONCURRENT_PUBLISHES=$MAX_CONCURRENT_PUBLISHES"

# 4. payment/.env.production
create_env_file "payment/.env.production" "# Configuration Stripe
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET

# Configuration Flask
FLASK_SECRET_KEY=$FLASK_SECRET_KEY
JWT_SECRET_KEY=$JWT_SECRET_KEY
FLASK_ENV=$FLASK_ENV

# Base de données
DATABASE_URL=$DATABASE_URL_PAYMENT

# Configuration serveur
PORT=$PORT_PAYMENT
HOST=0.0.0.0

# URLs pour les redirections
FRONTEND_URL=$FRONTEND_URL
ADMIN_URL=$ADMIN_URL
ONBOARDING_REFRESH_URL=$ONBOARDING_REFRESH_URL
ONBOARDING_RETURN_URL=$ONBOARDING_RETURN_URL

# Rate limiting
REDIS_URL=$REDIS_URL

# JWT Configuration
JWT_EXPIRY_HOURS=$JWT_EXPIRY_HOURS
JWT_REFRESH_EXPIRY_DAYS=$JWT_REFRESH_EXPIRY_DAYS

# Logging
LOG_LEVEL=$LOG_LEVEL
LOG_FILE=$LOG_FILE_PATH/payment_service.log

# Sécurité
ALLOWED_ORIGINS=$ALLOWED_ORIGINS"

# 5. onboarding/.env
create_env_file "onboarding/.env" "# Flask Configuration
FLASK_ENV=$FLASK_ENV
FLASK_SECRET_KEY=$FLASK_SECRET_KEY
JWT_SECRET_KEY=$JWT_SECRET_KEY

# Database
DATABASE_URL=$DATABASE_URL_ONBOARDING

# Server Configuration
PORT=$PORT_ONBOARDING
HOST=0.0.0.0

# Stripe Configuration
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET

# URLs
FRONTEND_URL=$FRONTEND_URL
ADMIN_URL=$ADMIN_URL
ONBOARDING_REFRESH_URL=$ONBOARDING_REFRESH_URL
ONBOARDING_RETURN_URL=$ONBOARDING_RETURN_URL

# Email Configuration
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USERNAME=$SMTP_USERNAME
SMTP_PASSWORD=$SMTP_PASSWORD
EMAIL_FROM=$EMAIL_FROM

# Redis Configuration
REDIS_URL=$REDIS_URL

# JWT Configuration
JWT_EXPIRY_HOURS=$JWT_EXPIRY_HOURS
JWT_REFRESH_EXPIRY_DAYS=$JWT_REFRESH_EXPIRY_DAYS

# Logging
LOG_LEVEL=$LOG_LEVEL
LOG_FILE=$LOG_FILE_PATH/onboarding_service.log

# Security
ALLOWED_ORIGINS=$ALLOWED_ORIGINS

# OnlyFans Integration
ENABLE_ONLYFANS_CONSENT=$ENABLE_ONLYFANS_CONSENT

# Feature Flags
ENABLE_EMAIL_VERIFICATION=$ENABLE_EMAIL_VERIFICATION
ENABLE_TWO_FACTOR=$ENABLE_TWO_FACTOR
ENABLE_STRIPE_CONNECT=$ENABLE_STRIPE_CONNECT"

# 6. kpi/.env
create_env_file "kpi/.env" "# Database
DATABASE_URL=$DATABASE_URL_KPI

# Redis
REDIS_URL=$REDIS_URL

# Server
NODE_ENV=$NODE_ENV
PORT=$PORT_KPI

# API Keys (if needed for analytics)
OPENAI_API_KEY=$OPENAI_API_KEY
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY

# Monitoring
OTEL_EXPORTER_OTLP_ENDPOINT=$OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_SERVICE_NAME=ofm-kpi-service

# Logging
LOG_LEVEL=$LOG_LEVEL"

# 7. outreach/ig-dm-ui/.env.production (merge avec existant)
if [ -f "outreach/ig-dm-ui/.env.production" ]; then
    # Ajouter les nouvelles variables si elles n'existent pas
    echo "

# Additional Production Configuration
DATABASE_URL=$DATABASE_URL_MARKETING
REDIS_URL=$REDIS_URL
NODE_ENV=$NODE_ENV
LOG_LEVEL=$LOG_LEVEL

# Instagram Accounts
INSTAGRAM_ACCOUNTS='$INSTAGRAM_ACCOUNTS'

# Proxies
PROXY_LIST='$PROXY_LIST'" >> "outreach/ig-dm-ui/.env.production"
    echo "✅ Mis à jour: outreach/ig-dm-ui/.env.production"
else
    create_env_file "outreach/ig-dm-ui/.env.production" "# Instagram DM Production Configuration
DATABASE_URL=$DATABASE_URL_MARKETING
REDIS_URL=$REDIS_URL
NODE_ENV=$NODE_ENV
LOG_LEVEL=$LOG_LEVEL

# Instagram Accounts
INSTAGRAM_ACCOUNTS='$INSTAGRAM_ACCOUNTS'

# Proxies
PROXY_LIST='$PROXY_LIST'"
fi

echo ""
echo "✅ Distribution terminée!"
echo ""
echo "📋 Fichiers créés/mis à jour:"
echo "   - .env.production"
echo "   - site-web/.env"
echo "   - marketing/backend/api/.env"
echo "   - payment/.env.production"
echo "   - onboarding/.env"
echo "   - kpi/.env"
echo "   - outreach/ig-dm-ui/.env.production"
echo ""
echo "⚠️  IMPORTANT: Vérifiez que toutes les valeurs sont correctes avant le déploiement!"
echo ""
echo "🚀 Pour démarrer la production: ./scripts/start-production.sh"