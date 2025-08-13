#!/usr/bin/env python3
"""
Script de validation de configuration production - OFM Payments
Vérifie que tous les garde-fous sont en place avant déploiement
"""

import os
import sys
import json
import logging
import subprocess
from typing import Dict, List, Any, Tuple
from datetime import datetime
import requests

# Configuration logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class ProductionValidator:
    """
    Validateur de configuration production
    """
    
    def __init__(self, environment: str = "production"):
        self.environment = environment
        self.validation_results = {
            "environment": environment,
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {},
            "warnings": [],
            "errors": [],
            "blocking_errors": [],
            "production_ready": False
        }
    
    def validate_environment_variables(self) -> bool:
        """Valide les variables d'environnement critiques"""
        logger.info("🔍 Validation des variables d'environnement...")
        
        # Variables requises en production
        required_vars = [
            "APP_ENV",
            "DATABASE_URL", 
            "FLASK_SECRET_KEY",
            "JWT_SECRET_KEY"
        ]
        
        # Variables de sécurité
        security_vars = [
            "PAYMENTS_ENABLED",
            "PAYMENTS_KILL_SWITCH", 
            "STRIPE_MODE"
        ]
        
        missing_vars = []
        for var in required_vars:
            if not os.getenv(var):
                missing_vars.append(var)
        
        if missing_vars:
            self.validation_results["blocking_errors"].append(
                f"Variables manquantes: {', '.join(missing_vars)}"
            )
            return False
        
        # Vérifications spécifiques production
        if self.environment == "production":
            app_env = os.getenv("APP_ENV", "")
            if app_env != "production":
                self.validation_results["warnings"].append(
                    f"APP_ENV={app_env} mais validation en mode production"
                )
            
            # Vérifier garde-fous par défaut
            payments_enabled = os.getenv("PAYMENTS_ENABLED", "false").lower()
            kill_switch = os.getenv("PAYMENTS_KILL_SWITCH", "1")
            stripe_mode = os.getenv("STRIPE_MODE", "test")
            
            if payments_enabled == "true":
                self.validation_results["warnings"].append(
                    "⚠️ PAYMENTS_ENABLED=true en production - risqué"
                )
            else:
                self.validation_results["checks"]["payments_disabled"] = "✅ Payments disabled by default"
            
            if kill_switch == "0":
                self.validation_results["warnings"].append(
                    "⚠️ PAYMENTS_KILL_SWITCH=0 en production - pas de protection"
                )
            else:
                self.validation_results["checks"]["kill_switch_active"] = "✅ Kill-switch active by default"
            
            if stripe_mode == "live":
                # Vérifier clés live
                live_secret = os.getenv("STRIPE_LIVE_SECRET_KEY")
                live_webhook = os.getenv("STRIPE_WEBHOOK_LIVE_SECRET")
                
                if not live_secret or not live_webhook:
                    self.validation_results["blocking_errors"].append(
                        "Mode Stripe live mais clés manquantes"
                    )
                    return False
                else:
                    self.validation_results["checks"]["stripe_live_configured"] = "✅ Stripe live keys configured"
            else:
                self.validation_results["checks"]["stripe_test_mode"] = "✅ Stripe in test mode (safe)"
        
        self.validation_results["checks"]["environment_variables"] = "✅ Environment variables valid"
        return True
    
    def validate_feature_gates(self) -> bool:
        """Valide le système de feature gates"""
        logger.info("🚪 Validation des feature gates...")
        
        try:
            # Import du module feature gates
            sys.path.append('/Users/765h/OFM CHARLES/payment/src')
            from feature_gates import PaymentFeatureGates, validate_environment_config
            
            # Validation via le module
            feature_status = PaymentFeatureGates.get_feature_status()
            validation_report = validate_environment_config()
            
            self.validation_results["feature_gates"] = {
                "status": feature_status,
                "validation": validation_report
            }
            
            if not validation_report["production_ready"]:
                for error in validation_report["errors"]:
                    self.validation_results["blocking_errors"].append(f"Feature gate: {error}")
                return False
            
            self.validation_results["checks"]["feature_gates"] = "✅ Feature gates configured correctly"
            return True
            
        except ImportError as e:
            self.validation_results["blocking_errors"].append(f"Cannot import feature_gates: {e}")
            return False
        except Exception as e:
            self.validation_results["errors"].append(f"Feature gates validation failed: {e}")
            return False
    
    def validate_database_connection(self) -> bool:
        """Valide la connexion à la base de données"""
        logger.info("🗄️ Validation de la connexion base de données...")
        
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            self.validation_results["blocking_errors"].append("DATABASE_URL non définie")
            return False
        
        try:
            # Test basique de connexion
            import psycopg2
            conn = psycopg2.connect(database_url)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            conn.close()
            
            if result and result[0] == 1:
                self.validation_results["checks"]["database_connection"] = "✅ Database connection OK"
                return True
            else:
                self.validation_results["blocking_errors"].append("Database connection test failed")
                return False
                
        except ImportError:
            self.validation_results["warnings"].append("psycopg2 not available - skipping DB test")
            return True
        except Exception as e:
            self.validation_results["blocking_errors"].append(f"Database connection failed: {e}")
            return False
    
    def validate_stripe_connectivity(self) -> bool:
        """Valide la connectivité Stripe"""
        logger.info("💳 Validation de la connectivité Stripe...")
        
        stripe_key = os.getenv("STRIPE_SECRET_KEY")
        if not stripe_key:
            self.validation_results["blocking_errors"].append("STRIPE_SECRET_KEY non définie")
            return False
        
        try:
            import stripe
            stripe.api_key = stripe_key
            
            # Test basique
            balance = stripe.Balance.retrieve()
            
            self.validation_results["checks"]["stripe_connectivity"] = "✅ Stripe API accessible"
            return True
            
        except ImportError:
            self.validation_results["warnings"].append("stripe module not available - skipping test")
            return True
        except Exception as e:
            self.validation_results["errors"].append(f"Stripe connectivity test failed: {e}")
            return False
    
    def validate_security_headers(self) -> bool:
        """Valide que les headers de sécurité sont configurés"""
        logger.info("🔒 Validation des headers de sécurité...")
        
        # Cette validation serait idéalement faite sur une instance running
        # Pour l'instant, on vérifie juste que le module existe
        try:
            sys.path.append('/Users/765h/OFM CHARLES/payment/src')
            from security import setup_security_headers
            
            self.validation_results["checks"]["security_headers"] = "✅ Security headers module available"
            return True
            
        except ImportError as e:
            self.validation_results["blocking_errors"].append(f"Security module missing: {e}")
            return False
    
    def validate_observability_config(self) -> bool:
        """Valide la configuration d'observabilité"""
        logger.info("📊 Validation de l'observabilité...")
        
        # Vérifier que les fichiers d'observabilité existent
        observability_files = [
            "/Users/765h/OFM CHARLES/payment/observability/prometheus/prometheus.yml",
            "/Users/765h/OFM CHARLES/payment/observability/grafana/dashboards/payments-overview.json",
            "/Users/765h/OFM CHARLES/payment/observability/alerting/alerts.yml"
        ]
        
        missing_files = []
        for file_path in observability_files:
            if not os.path.exists(file_path):
                missing_files.append(file_path)
        
        if missing_files:
            self.validation_results["warnings"].append(
                f"Fichiers observabilité manquants: {len(missing_files)}"
            )
        else:
            self.validation_results["checks"]["observability_files"] = "✅ Observability files present"
        
        return True
    
    def validate_deployment_scripts(self) -> bool:
        """Valide que les scripts de déploiement existent"""
        logger.info("🚀 Validation des scripts de déploiement...")
        
        deployment_files = [
            "/Users/765h/OFM CHARLES/payment/deployment/run_of_show.md",
            "/Users/765h/OFM CHARLES/payment/deployment/rollback_procedures.md",
            "/Users/765h/OFM CHARLES/payment/go-live/checklist.md"
        ]
        
        missing_files = []
        for file_path in deployment_files:
            if not os.path.exists(file_path):
                missing_files.append(file_path)
        
        if missing_files:
            self.validation_results["errors"].append(
                f"Scripts de déploiement manquants: {missing_files}"
            )
            return False
        
        self.validation_results["checks"]["deployment_scripts"] = "✅ Deployment scripts present"
        return True
    
    def run_unit_tests(self) -> bool:
        """Exécute les tests unitaires"""
        logger.info("🧪 Exécution des tests unitaires...")
        
        test_dir = "/Users/765h/OFM CHARLES/payment/tests"
        if not os.path.exists(test_dir):
            self.validation_results["warnings"].append("Répertoire tests non trouvé")
            return True
        
        try:
            # Exécuter pytest si disponible
            result = subprocess.run([
                "python3", "-m", "pytest", test_dir, "-v", "--tb=short"
            ], capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                self.validation_results["checks"]["unit_tests"] = "✅ Unit tests passed"
                return True
            else:
                self.validation_results["errors"].append(
                    f"Unit tests failed:\n{result.stdout}\n{result.stderr}"
                )
                return False
                
        except FileNotFoundError:
            self.validation_results["warnings"].append("pytest not available - skipping tests")
            return True
        except subprocess.TimeoutExpired:
            self.validation_results["errors"].append("Unit tests timeout")
            return False
        except Exception as e:
            self.validation_results["errors"].append(f"Unit tests error: {e}")
            return False
    
    def validate_all(self) -> Tuple[bool, Dict[str, Any]]:
        """Exécute toutes les validations"""
        logger.info(f"🔍 Début validation {self.environment}...")
        
        validations = [
            ("Environment Variables", self.validate_environment_variables),
            ("Feature Gates", self.validate_feature_gates),
            ("Database Connection", self.validate_database_connection),
            ("Stripe Connectivity", self.validate_stripe_connectivity),
            ("Security Headers", self.validate_security_headers),
            ("Observability Config", self.validate_observability_config),
            ("Deployment Scripts", self.validate_deployment_scripts),
            ("Unit Tests", self.run_unit_tests)
        ]
        
        all_passed = True
        
        for name, validation_func in validations:
            try:
                logger.info(f"Executing: {name}")
                result = validation_func()
                if not result:
                    all_passed = False
                    logger.error(f"❌ {name} failed")
                else:
                    logger.info(f"✅ {name} passed")
            except Exception as e:
                all_passed = False
                self.validation_results["errors"].append(f"{name}: {e}")
                logger.error(f"❌ {name} error: {e}")
        
        # Déterminer si production ready
        self.validation_results["production_ready"] = (
            all_passed and 
            len(self.validation_results["blocking_errors"]) == 0
        )
        
        return self.validation_results["production_ready"], self.validation_results
    
    def generate_report(self) -> str:
        """Génère un rapport de validation"""
        report = []
        report.append("=" * 60)
        report.append(f"OFM PAYMENTS - RAPPORT DE VALIDATION {self.environment.upper()}")
        report.append("=" * 60)
        report.append(f"Timestamp: {self.validation_results['timestamp']}")
        report.append("")
        
        # Statut global
        if self.validation_results["production_ready"]:
            report.append("🎉 STATUT: PRODUCTION READY ✅")
        else:
            report.append("⚠️ STATUT: NOT PRODUCTION READY ❌")
        report.append("")
        
        # Checks réussis
        if self.validation_results["checks"]:
            report.append("✅ CHECKS RÉUSSIS:")
            for check, status in self.validation_results["checks"].items():
                report.append(f"  - {check}: {status}")
            report.append("")
        
        # Warnings
        if self.validation_results["warnings"]:
            report.append("⚠️ WARNINGS:")
            for warning in self.validation_results["warnings"]:
                report.append(f"  - {warning}")
            report.append("")
        
        # Erreurs
        if self.validation_results["errors"]:
            report.append("❌ ERREURS:")
            for error in self.validation_results["errors"]:
                report.append(f"  - {error}")
            report.append("")
        
        # Erreurs bloquantes
        if self.validation_results["blocking_errors"]:
            report.append("🚫 ERREURS BLOQUANTES:")
            for error in self.validation_results["blocking_errors"]:
                report.append(f"  - {error}")
            report.append("")
        
        # Feature gates status
        if "feature_gates" in self.validation_results:
            report.append("🚪 FEATURE GATES STATUS:")
            status = self.validation_results["feature_gates"]["status"]
            for key, value in status.items():
                report.append(f"  - {key}: {value}")
            report.append("")
        
        # Recommandations
        report.append("📋 RECOMMANDATIONS:")
        if self.environment == "production":
            if self.validation_results["production_ready"]:
                report.append("  - ✅ Système prêt pour déploiement")
                report.append("  - 📍 Pour activer le jour J:")
                report.append("    * PAYMENTS_ENABLED=true")
                report.append("    * PAYMENTS_KILL_SWITCH=0") 
                report.append("    * Configurer clés Stripe live si nécessaire")
            else:
                report.append("  - ❌ Corriger les erreurs bloquantes avant déploiement")
                report.append("  - 🔍 Revalider après corrections")
        
        report.append("=" * 60)
        
        return "\n".join(report)

def main():
    """Point d'entrée principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Validation configuration OFM Payments")
    parser.add_argument("--environment", default="production", 
                       choices=["production", "staging"],
                       help="Environment à valider")
    parser.add_argument("--output", help="Fichier de sortie pour le rapport")
    parser.add_argument("--json", action="store_true", 
                       help="Sortie en format JSON")
    
    args = parser.parse_args()
    
    # Charger l'environnement
    env_file = f"/Users/765h/OFM CHARLES/payment/.env.{args.environment}"
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value
    
    # Exécuter validation
    validator = ProductionValidator(args.environment)
    is_ready, results = validator.validate_all()
    
    # Générer rapport
    if args.json:
        output = json.dumps(results, indent=2)
    else:
        output = validator.generate_report()
    
    # Afficher/sauvegarder
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        logger.info(f"Rapport sauvegardé: {args.output}")
    else:
        print(output)
    
    # Code de sortie
    sys.exit(0 if is_ready else 1)

if __name__ == "__main__":
    main()