#!/bin/bash

# Script pour appliquer tous les schémas de base de données

echo "🔨 Application des schémas de base de données"
echo "==========================================="

# Configuration
HOST="huntaze.c2ryoow8c5m4.us-east-1.rds.amazonaws.com"
USER="postgres"
PASSWORD="Francelyse1!"
PORT="5432"

# Ordre d'application des schémas
SCHEMAS=(
    "01_ofm_production.sql:ofm_production"
    "02_ofm_marketing.sql:ofm_marketing"
    "03_ofm_payment.sql:ofm_payment"
    "04_ofm_onboarding.sql:ofm_onboarding"
    "05_ofm_kpi.sql:ofm_kpi"
    "06_ofm_site.sql:ofm_site"
)

# Fonction pour appliquer un schéma
apply_schema() {
    local schema_file=$1
    local database=$2
    
    echo -e "\n📋 Application du schéma: $schema_file → $database"
    echo "----------------------------------------"
    
    if [ ! -f "database/schemas/$schema_file" ]; then
        echo "❌ Fichier non trouvé: database/schemas/$schema_file"
        return 1
    fi
    
    # Appliquer le schéma
    PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$database" -f "database/schemas/$schema_file" 2>&1 | grep -E "(CREATE|ALTER|INSERT|ERROR)" || true
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo "✅ Schéma appliqué avec succès"
        
        # Compter les tables créées
        table_count=$(PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$database" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        echo "📊 Nombre total de tables: $table_count"
    else
        echo "❌ Erreur lors de l'application du schéma"
        return 1
    fi
}

# Vérifier la connexion
echo "Test de connexion à PostgreSQL..."
PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -c "SELECT version();" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Impossible de se connecter à PostgreSQL"
    exit 1
fi

echo "✅ Connexion réussie"

# Appliquer chaque schéma
for schema_info in "${SCHEMAS[@]}"; do
    IFS=':' read -r schema_file database <<< "$schema_info"
    apply_schema "$schema_file" "$database"
done

echo -e "\n==========================================="
echo "✅ Tous les schémas ont été appliqués"
echo ""
echo "Pour vérifier les tables créées :"
echo "psql -h $HOST -U $USER -d [database_name] -c '\dt'"
echo ""
echo "Pour explorer un schéma :"
echo "psql -h $HOST -U $USER -d [database_name]"