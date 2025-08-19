#!/bin/bash

# Script pour déployer les variables d'environnement depuis .env.all-services
# Ce script crée les fichiers .env spécifiques pour chaque service

echo "🚀 Déploiement des variables d'environnement"
echo "=========================================="

# Chemin racine du projet
PROJECT_ROOT="/Users/765h/OFM CHARLES"
ENV_SOURCE="$PROJECT_ROOT/.env.all-services"

# Vérifier que le fichier source existe
if [ ! -f "$ENV_SOURCE" ]; then
    echo "❌ Fichier .env.all-services non trouvé!"
    exit 1
fi

# Fonction pour créer un fichier .env pour un service
create_env_file() {
    local service_name=$1
    local target_path=$2
    local variables=("${@:3}")
    
    echo -e "\n📋 Création de .env pour $service_name"
    
    # Créer le répertoire si nécessaire
    mkdir -p "$(dirname "$target_path")"
    
    # En-tête du fichier
    echo "# Variables d'environnement pour $service_name" > "$target_path"
    echo "# Généré automatiquement le $(date)" >> "$target_path"
    echo "" >> "$target_path"
    
    # Extraire et écrire les variables
    for var in "${variables[@]}"; do
        value=$(grep "^$var=" "$ENV_SOURCE" | head -1)
        if [ ! -z "$value" ]; then
            echo "$value" >> "$target_path"
        fi
    done
    
    echo "✅ Créé: $target_path"
}

# 1. Frontend Next.js
frontend_vars=(
    "NODE_ENV"
    "NEXT_PUBLIC_API_URL=API_BASE_URL"
    "NEXT_PUBLIC_DOMAIN=DOMAIN"
    "DATABASE_URL=DATABASE_URL_MAIN"
    "NEXTAUTH_URL=FRONTEND_URL"
    "NEXTAUTH_SECRET=JWT_SECRET_KEY"
)

# Créer le .env.local pour Next.js
echo "# Variables d'environnement pour Frontend" > "$PROJECT_ROOT/.env.local"
echo "# Généré automatiquement le $(date)" >> "$PROJECT_ROOT/.env.local"
echo "" >> "$PROJECT_ROOT/.env.local"

# Variables standard
for var in NODE_ENV; do
    value=$(grep "^$var=" "$ENV_SOURCE" | head -1)
    [ ! -z "$value" ] && echo "$value" >> "$PROJECT_ROOT/.env.local"
done

# Variables avec mapping
echo "NEXT_PUBLIC_API_URL=$(grep "^API_BASE_URL=" "$ENV_SOURCE" | cut -d'=' -f2-)" >> "$PROJECT_ROOT/.env.local"
echo "NEXT_PUBLIC_DOMAIN=$(grep "^DOMAIN=" "$ENV_SOURCE" | cut -d'=' -f2-)" >> "$PROJECT_ROOT/.env.local"
echo "DATABASE_URL=$(grep "^DATABASE_URL_MAIN=" "$ENV_SOURCE" | cut -d'=' -f2-)" >> "$PROJECT_ROOT/.env.local"
echo "NEXTAUTH_URL=$(grep "^FRONTEND_URL=" "$ENV_SOURCE" | cut -d'=' -f2-)" >> "$PROJECT_ROOT/.env.local"
echo "NEXTAUTH_SECRET=$(grep "^JWT_SECRET_KEY=" "$ENV_SOURCE" | cut -d'=' -f2-)" >> "$PROJECT_ROOT/.env.local"

echo "✅ Créé: .env.local"

# 2. Service Marketing
marketing_vars=(
    "NODE_ENV"
    "PORT=PORT_MARKETING"
    "DATABASE_URL=DATABASE_URL_MARKETING"
    "REDIS_URL"
    "MASTER_ENCRYPTION_KEY"
    "WEBHOOK_SECRET"
    "META_VERIFY_TOKEN"
    "INSTAGRAM_CLIENT_ID"
    "INSTAGRAM_CLIENT_SECRET"
    "TIKTOK_CLIENT_KEY"
    "TIKTOK_CLIENT_SECRET"
    "REDDIT_CLIENT_ID"
    "REDDIT_CLIENT_SECRET"
    "INSTAGRAM_ACCOUNTS"
    "PROXY_LIST"
    "MAX_CONCURRENT_PUBLISHES"
    "DISABLE_INSTAGRAM"
    "DISABLE_TIKTOK"
    "DISABLE_REDDIT"
    "LOG_LEVEL"
)

# 3. Service KPI
kpi_vars=(
    "NODE_ENV"
    "PORT=PORT_KPI"
    "DATABASE_URL=DATABASE_URL_KPI"
    "REDIS_URL"
    "JWT_SECRET_KEY"
    "OPENAI_API_KEY"
    "ANTHROPIC_API_KEY"
    "LOG_LEVEL"
)

# 4. Service Payment
payment_vars=(
    "FLASK_ENV"
    "FLASK_SECRET_KEY"
    "DATABASE_URL=DATABASE_URL_PAYMENT"
    "REDIS_URL"
    "JWT_SECRET_KEY"
    "STRIPE_SECRET_KEY"
    "STRIPE_PUBLISHABLE_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "ONBOARDING_REFRESH_URL"
    "ONBOARDING_RETURN_URL"
    "ENABLE_STRIPE_CONNECT"
    "LOG_LEVEL"
)

# 5. Service Onboarding
onboarding_vars=(
    "FLASK_ENV"
    "FLASK_SECRET_KEY"
    "DATABASE_URL=DATABASE_URL_ONBOARDING"
    "REDIS_URL"
    "JWT_SECRET_KEY"
    "SMTP_HOST"
    "SMTP_PORT"
    "SMTP_USERNAME"
    "SMTP_PASSWORD"
    "EMAIL_FROM"
    "ENABLE_EMAIL_VERIFICATION"
    "ENABLE_ONLYFANS_CONSENT"
    "LOG_LEVEL"
)

# 6. Service Site
site_vars=(
    "NODE_ENV"
    "DATABASE_URL=DATABASE_URL_SITE"
    "REDIS_URL"
    "JWT_SECRET_KEY"
    "DOMAIN"
    "SSL_EMAIL"
    "LOG_LEVEL"
)

# Créer les services si les dossiers n'existent pas
mkdir -p "$PROJECT_ROOT/services/marketing"
mkdir -p "$PROJECT_ROOT/services/kpi"
mkdir -p "$PROJECT_ROOT/services/payment"
mkdir -p "$PROJECT_ROOT/services/onboarding"
mkdir -p "$PROJECT_ROOT/services/site"

# Créer les fichiers .env pour chaque service
create_env_file "Marketing API" "$PROJECT_ROOT/services/marketing/.env" "${marketing_vars[@]}"
create_env_file "KPI Dashboard" "$PROJECT_ROOT/services/kpi/.env" "${kpi_vars[@]}"
create_env_file "Payment Service" "$PROJECT_ROOT/services/payment/.env" "${payment_vars[@]}"
create_env_file "Onboarding Service" "$PROJECT_ROOT/services/onboarding/.env" "${onboarding_vars[@]}"
create_env_file "Site Service" "$PROJECT_ROOT/services/site/.env" "${site_vars[@]}"

# 7. Créer docker-compose.env pour les variables communes
echo -e "\n📋 Création de docker-compose.env"
cat > "$PROJECT_ROOT/docker-compose.env" << EOF
# Variables communes pour Docker Compose
# Généré automatiquement le $(date)

# PostgreSQL
POSTGRES_USER=$(grep "^POSTGRES_USER=" "$ENV_SOURCE" | cut -d'=' -f2-)
POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" "$ENV_SOURCE" | cut -d'=' -f2-)
POSTGRES_DB=$(grep "^POSTGRES_DB=" "$ENV_SOURCE" | cut -d'=' -f2-)

# Redis
REDIS_PASSWORD=$(grep "^REDIS_PASSWORD=" "$ENV_SOURCE" | cut -d'=' -f2-)

# Grafana
GRAFANA_ADMIN_PASSWORD=$(grep "^GRAFANA_ADMIN_PASSWORD=" "$ENV_SOURCE" | cut -d'=' -f2-)

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=$(grep "^OTEL_EXPORTER_OTLP_ENDPOINT=" "$ENV_SOURCE" | cut -d'=' -f2-)
OTEL_SERVICE_NAME=$(grep "^OTEL_SERVICE_NAME=" "$ENV_SOURCE" | cut -d'=' -f2-)
EOF

echo "✅ Créé: docker-compose.env"

# 8. Créer le fichier .env.production pour le déploiement
echo -e "\n📋 Création de .env.production"
cp "$ENV_SOURCE" "$PROJECT_ROOT/.env.production"
echo "✅ Créé: .env.production"

# 9. Créer .gitignore si nécessaire
if ! grep -q "\.env" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    echo -e "\n📋 Mise à jour de .gitignore"
    cat >> "$PROJECT_ROOT/.gitignore" << EOF

# Environment files
.env
.env.*
!.env.example
!.env.all-services.example
docker-compose.env
EOF
    echo "✅ Mis à jour: .gitignore"
fi

# 10. Créer un exemple de fichier .env.all-services
echo -e "\n📋 Création de .env.all-services.example"
sed 's/=.*/=/' "$ENV_SOURCE" > "$PROJECT_ROOT/.env.all-services.example"
echo "✅ Créé: .env.all-services.example"

echo -e "\n=========================================="
echo "✅ Déploiement terminé avec succès!"
echo ""
echo "📁 Fichiers créés:"
echo "   - .env.local (Frontend Next.js)"
echo "   - services/marketing/.env"
echo "   - services/kpi/.env"
echo "   - services/payment/.env"
echo "   - services/onboarding/.env"
echo "   - services/site/.env"
echo "   - docker-compose.env"
echo "   - .env.production"
echo "   - .env.all-services.example"
echo ""
echo "⚠️  IMPORTANT: Ne commitez JAMAIS les fichiers .env!"
echo "    Seul .env.all-services.example doit être dans git."
echo ""
echo "🔐 Pour Vercel/Production:"
echo "    Utilisez les variables de .env.production dans"
echo "    les paramètres d'environnement de votre hébergeur."