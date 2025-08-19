#!/bin/bash

# Script simple pour tester une seule connexion PostgreSQL

if [ -z "$1" ]; then
    echo "Usage: $0 <DATABASE_URL>"
    echo "Exemple: $0 'postgresql://user:pass@host:5432/dbname'"
    exit 1
fi

DATABASE_URL=$1

# Extraire les informations de connexion
if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
    USER="${BASH_REMATCH[1]}"
    PASSWORD="${BASH_REMATCH[2]}"
    HOST="${BASH_REMATCH[3]}"
    PORT="${BASH_REMATCH[4]}"
    DATABASE="${BASH_REMATCH[5]}"
    
    echo "Test de connexion à PostgreSQL..."
    echo "Host: $HOST"
    echo "Port: $PORT"
    echo "Database: $DATABASE"
    echo "User: $USER"
    echo ""
    
    # Test avec nc (netcat) pour vérifier la connectivité réseau
    echo "1. Test de connectivité réseau..."
    nc -zv $HOST $PORT 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Le serveur PostgreSQL est accessible"
    else
        echo "❌ Impossible de se connecter au serveur PostgreSQL"
        echo "Vérifiez:"
        echo "- Que l'instance RDS est démarrée"
        echo "- Les règles de sécurité (Security Groups)"
        echo "- Que votre IP est autorisée"
        exit 1
    fi
    
    # Test avec psql si disponible
    if command -v psql &> /dev/null; then
        echo ""
        echo "2. Test de connexion avec psql..."
        PGPASSWORD="$PASSWORD" psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DATABASE" -c "SELECT current_database(), current_user, version();" 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✅ Connexion à la base de données réussie"
        else
            echo "❌ Échec de connexion à la base de données"
        fi
    else
        echo ""
        echo "psql n'est pas installé. Installez-le avec:"
        echo "  macOS: brew install postgresql"
        echo "  Ubuntu: sudo apt-get install postgresql-client"
    fi
else
    echo "❌ URL de base de données invalide"
    echo "Format attendu: postgresql://user:password@host:port/database"
    exit 1
fi