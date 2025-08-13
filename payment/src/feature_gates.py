# Feature Gates et Garde-fous Production - OFM Payments
# Protection contre l'activation accidentelle en production

import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class PaymentFeatureGates:
    """
    Contrôle des features de paiement avec garde-fous production
    """
    
    @staticmethod
    def is_payments_enabled() -> bool:
        """
        Vérifie si les paiements sont activés
        Par défaut: DÉSACTIVÉ en production
        """
        return os.getenv("PAYMENTS_ENABLED", "false").lower() == "true"
    
    @staticmethod
    def get_canary_percentage() -> int:
        """
        Pourcentage de trafic canary
        Par défaut: 0% en production
        """
        try:
            return int(os.getenv("PAYMENTS_CANARY_PERCENT", "0"))
        except ValueError:
            logger.warning("Invalid PAYMENTS_CANARY_PERCENT, defaulting to 0")
            return 0
    
    @staticmethod
    def is_stripe_live_mode() -> bool:
        """
        Vérifie si Stripe est en mode live
        Par défaut: mode test uniquement
        """
        stripe_mode = os.getenv("STRIPE_MODE", "test").lower()
        return stripe_mode == "live"
    
    @staticmethod
    def is_production_environment() -> bool:
        """
        Vérifie si nous sommes en environnement production
        """
        env = os.getenv("APP_ENV", "staging").lower()
        return env == "production"
    
    @staticmethod
    def has_live_stripe_credentials() -> bool:
        """
        Vérifie si les clés Stripe live sont configurées
        """
        live_secret = os.getenv("STRIPE_LIVE_SECRET_KEY")
        live_webhook = os.getenv("STRIPE_WEBHOOK_LIVE_SECRET")
        return bool(live_secret and live_webhook)
    
    @staticmethod
    def is_kill_switch_active() -> bool:
        """
        Vérifie si le kill-switch est activé
        Par défaut: ACTIVÉ en production pour sécurité
        """
        return os.getenv("PAYMENTS_KILL_SWITCH", "1") == "1"
    
    @staticmethod
    def assert_prod_safe() -> None:
        """
        Assertions de sécurité production
        Lève une exception si la configuration n'est pas sûre
        """
        env = os.getenv("APP_ENV", "staging")
        
        if env == "production":
            # En production, les paiements doivent être explicitement activés
            if not PaymentFeatureGates.is_payments_enabled():
                raise PermissionError(
                    "PAYMENTS_ENABLED=false in production. "
                    "Set PAYMENTS_ENABLED=true to enable payments."
                )
            
            # En production avec paiements activés, il faut les clés live
            if PaymentFeatureGates.is_stripe_live_mode():
                if not PaymentFeatureGates.has_live_stripe_credentials():
                    raise ValueError(
                        "Stripe live mode enabled but missing live credentials. "
                        "Set STRIPE_LIVE_SECRET_KEY and STRIPE_WEBHOOK_LIVE_SECRET."
                    )
                    
            # Kill-switch ne doit pas être activé si on veut traiter des paiements
            if PaymentFeatureGates.is_kill_switch_active():
                raise PermissionError(
                    "PAYMENTS_KILL_SWITCH=1 in production. "
                    "Set PAYMENTS_KILL_SWITCH=0 to process payments."
                )
    
    @staticmethod
    def get_feature_status() -> Dict[str, Any]:
        """
        Retourne le statut complet des features
        """
        return {
            "environment": os.getenv("APP_ENV", "staging"),
            "payments_enabled": PaymentFeatureGates.is_payments_enabled(),
            "canary_percentage": PaymentFeatureGates.get_canary_percentage(),
            "stripe_mode": os.getenv("STRIPE_MODE", "test"),
            "stripe_live_mode": PaymentFeatureGates.is_stripe_live_mode(),
            "has_live_credentials": PaymentFeatureGates.has_live_stripe_credentials(),
            "kill_switch_active": PaymentFeatureGates.is_kill_switch_active(),
            "timestamp": datetime.utcnow().isoformat(),
            "production_ready": PaymentFeatureGates._is_production_ready()
        }
    
    @staticmethod
    def _is_production_ready() -> bool:
        """
        Évalue si le système est prêt pour la production
        """
        try:
            PaymentFeatureGates.assert_prod_safe()
            return True
        except (PermissionError, ValueError):
            return False

class FeatureGuard:
    """
    Décorateur pour protéger les endpoints critiques
    """
    
    @staticmethod
    def payments_required(func):
        """
        Décorateur qui vérifie que les paiements sont activés
        """
        def wrapper(*args, **kwargs):
            try:
                PaymentFeatureGates.assert_prod_safe()
                
                if not PaymentFeatureGates.is_payments_enabled():
                    return {
                        "error": "payments_disabled",
                        "message": "Payment processing is currently disabled",
                        "status": PaymentFeatureGates.get_feature_status()
                    }, 503
                    
                if PaymentFeatureGates.is_kill_switch_active():
                    return {
                        "error": "kill_switch_active", 
                        "message": "Payment processing is temporarily suspended",
                        "status": PaymentFeatureGates.get_feature_status()
                    }, 503
                    
                return func(*args, **kwargs)
                
            except PermissionError as e:
                logger.error(f"Production safety check failed: {e}")
                return {
                    "error": "production_safety_check_failed",
                    "message": str(e),
                    "status": PaymentFeatureGates.get_feature_status()
                }, 503
                
            except ValueError as e:
                logger.error(f"Configuration error: {e}")
                return {
                    "error": "configuration_error",
                    "message": str(e),
                    "status": PaymentFeatureGates.get_feature_status()
                }, 500
                
        return wrapper
    
    @staticmethod
    def canary_only(func):
        """
        Décorateur pour les features en canary uniquement
        """
        def wrapper(*args, **kwargs):
            canary_pct = PaymentFeatureGates.get_canary_percentage()
            
            if canary_pct == 0:
                return {
                    "error": "canary_disabled",
                    "message": "This feature is currently in canary mode (0%)",
                    "canary_percentage": canary_pct
                }, 503
                
            # TODO: Implémenter logique de sélection canary basée sur user_id/creator_id
            # Pour l'instant, accepter toutes les requêtes si canary > 0
            
            return func(*args, **kwargs)
            
        return wrapper

# Configuration par défaut sécurisée
DEFAULT_PRODUCTION_CONFIG = {
    "APP_ENV": "production",
    "PAYMENTS_ENABLED": "false",        # 🚫 Désactivé par défaut
    "PAYMENTS_CANARY_PERCENT": "0",     # 🚫 Canary à 0%
    "PAYMENTS_KILL_SWITCH": "1",        # 🚫 Kill-switch activé
    "STRIPE_MODE": "test",              # 🚫 Mode test par défaut
    # STRIPE_LIVE_SECRET_KEY: non défini par défaut
    # STRIPE_WEBHOOK_LIVE_SECRET: non défini par défaut
}

# Configuration staging pour développement
DEFAULT_STAGING_CONFIG = {
    "APP_ENV": "staging",
    "PAYMENTS_ENABLED": "true",         # ✅ Activé en staging
    "PAYMENTS_CANARY_PERCENT": "100",   # ✅ 100% en staging
    "PAYMENTS_KILL_SWITCH": "0",        # ✅ Kill-switch désactivé
    "STRIPE_MODE": "test",              # ✅ Mode test en staging
}

def validate_environment_config() -> Dict[str, Any]:
    """
    Valide la configuration de l'environnement actuel
    Retourne un rapport détaillé
    """
    status = PaymentFeatureGates.get_feature_status()
    
    validation_report = {
        "environment": status["environment"],
        "timestamp": status["timestamp"],
        "validations": {},
        "warnings": [],
        "errors": [],
        "production_ready": False
    }
    
    env = status["environment"]
    
    # Validation par environnement
    if env == "production":
        # Production doit être explicitement activée
        if not status["payments_enabled"]:
            validation_report["validations"]["payments_disabled"] = "✅ Payments safely disabled"
        else:
            validation_report["validations"]["payments_enabled"] = "⚠️ Payments ENABLED in production"
            
        # Kill-switch doit être géré correctement
        if status["kill_switch_active"] and status["payments_enabled"]:
            validation_report["errors"].append("Kill-switch active but payments enabled - conflict")
        elif status["kill_switch_active"]:
            validation_report["validations"]["kill_switch"] = "✅ Kill-switch active (safe)"
        else:
            validation_report["validations"]["kill_switch"] = "⚠️ Kill-switch inactive"
            
        # Vérifications clés live
        if status["stripe_live_mode"] and not status["has_live_credentials"]:
            validation_report["errors"].append("Stripe live mode without live credentials")
        elif status["stripe_live_mode"] and status["has_live_credentials"]:
            validation_report["validations"]["stripe_credentials"] = "✅ Live credentials configured"
        else:
            validation_report["validations"]["stripe_mode"] = "✅ Test mode (safe)"
            
    elif env == "staging":
        # Staging peut être plus permissif
        validation_report["validations"]["staging_mode"] = "✅ Staging environment"
        if status["stripe_mode"] == "test":
            validation_report["validations"]["test_mode"] = "✅ Test mode in staging"
        else:
            validation_report["warnings"].append("Live mode in staging - unusual")
    
    # Déterminer si production ready
    validation_report["production_ready"] = (
        len(validation_report["errors"]) == 0 and
        status["production_ready"]
    )
    
    return validation_report

if __name__ == "__main__":
    # Script de validation standalone
    import json
    
    print("🔍 OFM Payments - Feature Gates Validation")
    print("=" * 50)
    
    status = PaymentFeatureGates.get_feature_status()
    validation = validate_environment_config()
    
    print("\n📊 Feature Status:")
    print(json.dumps(status, indent=2))
    
    print("\n✅ Validation Report:")
    print(json.dumps(validation, indent=2))
    
    if validation["production_ready"]:
        print("\n🎉 System is production ready!")
    else:
        print("\n⚠️ System is NOT production ready")
        if validation["errors"]:
            print("Errors:", validation["errors"])