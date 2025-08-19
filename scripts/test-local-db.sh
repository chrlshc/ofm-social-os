#!/bin/bash

# Script pour tester la connexion à RDS via tunnel local

echo "📊 Test de connexion à RDS via tunnel local..."
echo ""

# URLs modifiées pour utiliser localhost
DATABASES=(
    "MAIN|postgresql://Huntaze:Francelyse1!@localhost:5432/ofm_production?sslmode=require"
    "MARKETING|postgresql://Huntaze:Francelyse1!@localhost:5432/ofm_marketing?sslmode=require"
    "PAYMENT|postgresql://Huntaze:Francelyse1!@localhost:5432/ofm_payment?sslmode=require"
    "ONBOARDING|postgresql://Huntaze:Francelyse1!@localhost:5432/ofm_onboarding?sslmode=require"
    "KPI|postgresql://Huntaze:Francelyse1!@localhost:5432/ofm_kpi?sslmode=require"
    "SITE|postgresql://Huntaze:Francelyse1!@localhost:5432/ofm_site?sslmode=require"
)

for db in "${DATABASES[@]}"; do
    IFS='|' read -r name url <<< "$db"
    echo "Test de $name..."
    
    if command -v psql &> /dev/null; then
        PGPASSWORD="Francelyse1!" psql "postgresql://Huntaze@localhost:5432/${name,,}?sslmode=require" -c "SELECT current_database();" 2>&1 | head -5
    else
        python3 -c "
import psycopg2
try:
    conn = psycopg2.connect('$url')
    print('✅ Connexion réussie')
    conn.close()
except Exception as e:
    print(f'❌ Erreur: {str(e)[:100]}')
"
    fi
    echo ""
done