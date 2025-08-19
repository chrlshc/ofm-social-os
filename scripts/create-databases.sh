#!/bin/bash

# Script pour créer toutes les bases de données nécessaires

echo "🔨 Création des bases de données PostgreSQL"
echo "=========================================="

# Configuration
HOST="huntaze.c2ryoow8c5m4.us-east-1.rds.amazonaws.com"
USER="postgres"
PASSWORD="Francelyse1!"
PORT="5432"

# Liste des bases de données à créer
DATABASES=(
    "ofm_production"
    "ofm_marketing"
    "ofm_payment"
    "ofm_onboarding"
    "ofm_kpi"
    "ofm_site"
)

# Fonction pour créer une base de données
create_database() {
    local db_name=$1
    echo -n "Création de la base de données $db_name... "
    
    # Vérifier si la base existe déjà
    PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$db_name'" | grep -q 1
    
    if [ $? -eq 0 ]; then
        echo "✅ Existe déjà"
    else
        # Créer la base de données
        PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -c "CREATE DATABASE $db_name" 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✅ Créée avec succès"
        else
            echo "❌ Échec de création"
        fi
    fi
}

# Connexion test à la base principale
echo "Test de connexion à PostgreSQL..."
PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -c "SELECT version();" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Impossible de se connecter à PostgreSQL"
    echo "Vérifiez les identifiants et la connectivité"
    exit 1
fi

echo "✅ Connexion réussie"
echo ""

# Créer chaque base de données
for db in "${DATABASES[@]}"; do
    create_database "$db"
done

echo ""
echo "=========================================="
echo "✅ Processus terminé"
echo ""
echo "Pour vérifier les bases créées :"
echo "python3 scripts/check-db-connections.py"