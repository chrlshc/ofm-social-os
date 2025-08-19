#!/usr/bin/env python3

"""
Script pour vérifier les connexions aux bases de données PostgreSQL
"""

import os
import sys
import time
from urllib.parse import urlparse
from typing import Dict, Optional, Tuple

# Essayer d'importer psycopg2
try:
    import psycopg2
except ImportError:
    print("❌ psycopg2 n'est pas installé.")
    print("Installez-le avec: pip install psycopg2-binary")
    sys.exit(1)

# Couleurs pour l'affichage
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def load_env_file(filename: str = ".env.all-services") -> Dict[str, str]:
    """Charge les variables d'environnement depuis un fichier"""
    env_vars = {}
    try:
        with open(filename, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value
        return env_vars
    except FileNotFoundError:
        print(f"{Colors.RED}❌ Fichier {filename} non trouvé{Colors.RESET}")
        sys.exit(1)

def parse_database_url(url: str) -> Optional[Dict[str, str]]:
    """Parse une URL PostgreSQL"""
    try:
        result = urlparse(url)
        return {
            'host': result.hostname,
            'port': result.port or 5432,
            'database': result.path[1:],
            'user': result.username,
            'password': result.password
        }
    except Exception as e:
        print(f"{Colors.RED}Erreur lors du parsing de l'URL: {e}{Colors.RESET}")
        return None

def test_connection(name: str, url: str) -> Tuple[bool, Optional[Dict]]:
    """Teste une connexion à la base de données"""
    print(f"\n{Colors.BLUE}Test de connexion à {name}...{Colors.RESET}")
    
    params = parse_database_url(url)
    if not params:
        return False, None
    
    try:
        # Tentative de connexion
        start_time = time.time()
        conn = psycopg2.connect(
            host=params['host'],
            port=params['port'],
            database=params['database'],
            user=params['user'],
            password=params['password'],
            connect_timeout=10
        )
        connection_time = time.time() - start_time
        
        cur = conn.cursor()
        
        # Récupérer la version de PostgreSQL
        cur.execute('SELECT version()')
        version = cur.fetchone()[0].split(',')[0]
        
        # Compter les tables
        cur.execute("""
            SELECT COUNT(*) 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        table_count = cur.fetchone()[0]
        
        # Taille de la base de données
        cur.execute(f"SELECT pg_size_pretty(pg_database_size('{params['database']}'))")
        db_size = cur.fetchone()[0]
        
        # Vérifier les extensions installées
        cur.execute("""
            SELECT array_agg(extname) 
            FROM pg_extension 
            WHERE extname NOT IN ('plpgsql')
        """)
        extensions = cur.fetchone()[0] or []
        
        cur.close()
        conn.close()
        
        print(f"{Colors.GREEN}✅ Connexion réussie !{Colors.RESET}")
        print(f"  📍 Host: {params['host']}")
        print(f"  🔌 Port: {params['port']}")
        print(f"  💾 Database: {params['database']}")
        print(f"  👤 User: {params['user']}")
        print(f"  🔄 Version: {version}")
        print(f"  📊 Taille: {db_size}")
        print(f"  📋 Tables: {table_count}")
        if extensions:
            print(f"  🔧 Extensions: {', '.join(extensions)}")
        print(f"  ⏱️  Temps de connexion: {connection_time:.2f}s")
        
        return True, {
            'name': name,
            'host': params['host'],
            'database': params['database'],
            'tables': table_count,
            'size': db_size,
            'version': version
        }
        
    except psycopg2.OperationalError as e:
        print(f"{Colors.RED}❌ Échec de connexion{Colors.RESET}")
        print(f"  📍 Host: {params['host']}")
        print(f"  💾 Database: {params['database']}")
        print(f"  ❗ Erreur: {str(e)}")
        return False, None
    except Exception as e:
        print(f"{Colors.RED}❌ Erreur inattendue: {str(e)}{Colors.RESET}")
        return False, None

def main():
    """Fonction principale"""
    print("=" * 60)
    print(f"{Colors.BLUE}🔍 Vérification des connexions PostgreSQL{Colors.RESET}")
    print("=" * 60)
    
    # Charger les variables d'environnement
    env_vars = load_env_file()
    
    # Filtrer les URLs de base de données
    db_urls = {
        key.replace('DATABASE_URL_', ''): value 
        for key, value in env_vars.items() 
        if key.startswith('DATABASE_URL_')
    }
    
    if not db_urls:
        print(f"{Colors.YELLOW}⚠️  Aucune URL de base de données trouvée{Colors.RESET}")
        return
    
    print(f"\n📋 {len(db_urls)} base(s) de données trouvée(s)")
    
    # Tester chaque connexion
    results = []
    successful = 0
    
    for name, url in db_urls.items():
        success, info = test_connection(name, url)
        if success:
            successful += 1
            results.append(info)
    
    # Résumé
    print("\n" + "=" * 60)
    print(f"{Colors.BLUE}📊 Résumé{Colors.RESET}")
    print("=" * 60)
    print(f"✅ Connexions réussies: {successful}/{len(db_urls)}")
    print(f"❌ Connexions échouées: {len(db_urls) - successful}/{len(db_urls)}")
    
    if results:
        print(f"\n{Colors.GREEN}Bases de données accessibles:{Colors.RESET}")
        for db in results:
            print(f"  • {db['name']}: {db['tables']} tables, {db['size']}")
    
    # Conseils si des connexions ont échoué
    if successful < len(db_urls):
        print(f"\n{Colors.YELLOW}💡 Conseils de dépannage:{Colors.RESET}")
        print("  1. Vérifiez que l'instance RDS est démarrée")
        print("  2. Vérifiez les règles de sécurité (Security Groups)")
        print("  3. Assurez-vous que votre IP est autorisée")
        print("  4. Vérifiez les identifiants de connexion")
        print("  5. Testez la connectivité réseau avec:")
        print("     nc -zv <host> 5432")

if __name__ == "__main__":
    main()