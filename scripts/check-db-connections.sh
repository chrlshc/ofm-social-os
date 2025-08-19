#!/bin/bash

# Script pour vérifier les connexions aux bases de données PostgreSQL

echo "======================================"
echo "Vérification des connexions PostgreSQL"
echo "======================================"

# Couleurs pour l'affichage
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour tester une connexion
test_connection() {
    local db_name=$1
    local db_url=$2
    
    echo -n "Test de connexion à $db_name... "
    
    # Extraire les informations de connexion
    if [[ $db_url =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
        user="${BASH_REMATCH[1]}"
        password="${BASH_REMATCH[2]}"
        host="${BASH_REMATCH[3]}"
        port="${BASH_REMATCH[4]}"
        database="${BASH_REMATCH[5]}"
        
        # Test de connexion avec psql
        PGPASSWORD="$password" psql -h "$host" -p "$port" -U "$user" -d "$database" -c "SELECT 1" > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Connexion réussie${NC}"
            echo "  - Host: $host"
            echo "  - Port: $port"
            echo "  - Database: $database"
            echo "  - User: $user"
            
            # Vérifier la taille de la base
            size=$(PGPASSWORD="$password" psql -h "$host" -p "$port" -U "$user" -d "$database" -t -c "SELECT pg_size_pretty(pg_database_size('$database'));" 2>/dev/null | tr -d ' ')
            if [ ! -z "$size" ]; then
                echo "  - Taille: $size"
            fi
            
            # Compter les tables
            table_count=$(PGPASSWORD="$password" psql -h "$host" -p "$port" -U "$user" -d "$database" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
            if [ ! -z "$table_count" ]; then
                echo "  - Nombre de tables: $table_count"
            fi
            
            return 0
        else
            echo -e "${RED}✗ Échec de connexion${NC}"
            echo "  - Host: $host"
            echo "  - Database: $database"
            return 1
        fi
    else
        echo -e "${RED}✗ URL invalide${NC}"
        return 1
    fi
}

# Fonction pour tester avec Python si psql n'est pas disponible
test_connection_python() {
    local db_name=$1
    local db_url=$2
    
    python3 -c "
import psycopg2
from urllib.parse import urlparse
import sys

try:
    result = urlparse('$db_url')
    conn = psycopg2.connect(
        database=result.path[1:],
        user=result.username,
        password=result.password,
        host=result.hostname,
        port=result.port
    )
    cur = conn.cursor()
    cur.execute('SELECT version()')
    version = cur.fetchone()
    print(f'✓ Connexion réussie à $db_name')
    print(f'  PostgreSQL: {version[0].split(\",\")[0]}')
    
    # Compter les tables
    cur.execute(\"\"\"
        SELECT COUNT(*) 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    \"\"\")
    table_count = cur.fetchone()[0]
    print(f'  Nombre de tables: {table_count}')
    
    cur.close()
    conn.close()
    sys.exit(0)
except Exception as e:
    print(f'✗ Échec de connexion à $db_name: {str(e)}')
    sys.exit(1)
" 2>/dev/null
}

# Charger les variables d'environnement
if [ -f ".env.all-services" ]; then
    export $(grep -E '^DATABASE_URL_' .env.all-services | xargs)
else
    echo -e "${RED}Fichier .env.all-services non trouvé${NC}"
    exit 1
fi

# Vérifier si psql est installé
if command -v psql &> /dev/null; then
    echo "Utilisation de psql pour les tests"
    echo ""
    
    # Tester chaque connexion
    test_connection "MAIN" "$DATABASE_URL_MAIN"
    echo ""
    test_connection "MARKETING" "$DATABASE_URL_MARKETING"
    echo ""
    test_connection "PAYMENT" "$DATABASE_URL_PAYMENT"
    echo ""
    test_connection "ONBOARDING" "$DATABASE_URL_ONBOARDING"
    echo ""
    test_connection "KPI" "$DATABASE_URL_KPI"
    echo ""
    test_connection "SITE" "$DATABASE_URL_SITE"
    
elif command -v python3 &> /dev/null && python3 -c "import psycopg2" 2>/dev/null; then
    echo "psql non trouvé, utilisation de Python avec psycopg2"
    echo ""
    
    # Tester avec Python
    test_connection_python "MAIN" "$DATABASE_URL_MAIN"
    test_connection_python "MARKETING" "$DATABASE_URL_MARKETING"
    test_connection_python "PAYMENT" "$DATABASE_URL_PAYMENT"
    test_connection_python "ONBOARDING" "$DATABASE_URL_ONBOARDING"
    test_connection_python "KPI" "$DATABASE_URL_KPI"
    test_connection_python "SITE" "$DATABASE_URL_SITE"
else
    echo -e "${YELLOW}Installation des outils nécessaires...${NC}"
    echo ""
    echo "Option 1: Installer PostgreSQL client"
    echo "  macOS: brew install postgresql"
    echo "  Ubuntu: sudo apt-get install postgresql-client"
    echo ""
    echo "Option 2: Installer psycopg2 pour Python"
    echo "  pip install psycopg2-binary"
fi

echo ""
echo "======================================"
echo "Test terminé"
echo "======================================" 