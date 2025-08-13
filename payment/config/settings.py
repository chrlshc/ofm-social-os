"""
Configuration centralisée pour l'application de paiement OFM.
"""

import os
from typing import Dict, Any


class Config:
    """Configuration de base."""
    
    # Clés secrètes
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
    
    # Base de données
    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///payments.db')
    
    # Configuration Stripe Connect
    STRIPE_CONNECT_REFRESH_URL = os.getenv('ONBOARDING_REFRESH_URL', 'http://localhost:3000/onboarding/refresh')
    STRIPE_CONNECT_RETURN_URL = os.getenv('ONBOARDING_RETURN_URL', 'http://localhost:3000/onboarding/complete')
    
    # URLs et domaines autorisés
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
    ALLOWED_ORIGINS = [
        'http://localhost:3000',
        'https://your-domain.com'
    ]
    
    # Limites de paiement
    MIN_PAYMENT_EUROS = 0.50  # Minimum Stripe
    MAX_PAYMENT_EUROS = 999999.99
    
    # Configuration des commissions (en centimes)
    COMMISSION_TIERS = [
        (0, 200_000, 0.00),           # 0% jusqu'à 2 000€
        (200_000, 500_000, 0.25),     # 25% de 2k à 5k€
        (500_000, 1_000_000, 0.20),   # 20% de 5k à 10k€
        (1_000_000, 2_000_000, 0.15), # 15% de 10k à 20k€
        (2_000_000, 3_000_000, 0.10), # 10% de 20k à 30k€
        (3_000_000, float('inf'), 0.10) # 10% au-delà de 30k€
    ]
    
    # Devises supportées
    SUPPORTED_CURRENCIES = ['eur']
    DEFAULT_CURRENCY = 'eur'
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    @classmethod
    def validate(cls) -> Dict[str, Any]:
        """Valide la configuration et retourne les erreurs."""
        errors = []
        warnings = []
        
        if not cls.STRIPE_SECRET_KEY:
            errors.append("STRIPE_SECRET_KEY est requis")
        
        if not cls.STRIPE_WEBHOOK_SECRET:
            warnings.append("STRIPE_WEBHOOK_SECRET non défini - les webhooks ne fonctionneront pas")
        
        if cls.SECRET_KEY == 'dev-secret-key-change-in-production':
            warnings.append("SECRET_KEY utilise la valeur par défaut - changez-la en production")
        
        return {
            'errors': errors,
            'warnings': warnings,
            'is_valid': len(errors) == 0
        }


class DevelopmentConfig(Config):
    """Configuration pour le développement."""
    DEBUG = True
    TESTING = False


class TestingConfig(Config):
    """Configuration pour les tests."""
    DEBUG = True
    TESTING = True
    DATABASE_URL = 'sqlite:///:memory:'
    
    # Utilise des clés de test Stripe
    STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing'
    STRIPE_WEBHOOK_SECRET = 'whsec_fake_webhook_secret_for_testing'


class ProductionConfig(Config):
    """Configuration pour la production."""
    DEBUG = False
    TESTING = False
    
    # URLs de production
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://your-domain.com')
    ALLOWED_ORIGINS = [
        'https://your-domain.com',
        'https://www.your-domain.com'
    ]
    
    @classmethod
    def validate(cls) -> Dict[str, Any]:
        """Validation renforcée pour la production."""
        result = super().validate()
        
        if cls.SECRET_KEY == 'dev-secret-key-change-in-production':
            result['errors'].append("SECRET_KEY doit être changée en production")
        
        if not cls.STRIPE_SECRET_KEY or cls.STRIPE_SECRET_KEY.startswith('sk_test_'):
            result['errors'].append("Clé Stripe de production requise")
        
        if 'localhost' in cls.FRONTEND_URL:
            result['errors'].append("FRONTEND_URL ne doit pas pointer vers localhost en production")
        
        result['is_valid'] = len(result['errors']) == 0
        return result


# Factory pour obtenir la configuration selon l'environnement
def get_config() -> Config:
    """Retourne la configuration selon la variable d'environnement FLASK_ENV."""
    env = os.getenv('FLASK_ENV', 'development').lower()
    
    config_map = {
        'development': DevelopmentConfig,
        'testing': TestingConfig,
        'production': ProductionConfig
    }
    
    return config_map.get(env, DevelopmentConfig)


# Configuration par défaut
config = get_config()


if __name__ == "__main__":
    # Test de la configuration
    print("=== Configuration actuelle ===")
    print(f"Environnement: {os.getenv('FLASK_ENV', 'development')}")
    print(f"Debug: {config.DEBUG}")
    print(f"Database: {config.DATABASE_URL}")
    print(f"Frontend URL: {config.FRONTEND_URL}")
    
    # Validation
    validation = config.validate()
    print(f"\n=== Validation ===")
    print(f"Valide: {validation['is_valid']}")
    
    if validation['errors']:
        print("Erreurs:")
        for error in validation['errors']:
            print(f"  - {error}")
    
    if validation['warnings']:
        print("Avertissements:")
        for warning in validation['warnings']:
            print(f"  - {warning}")
    
    # Test des paliers de commission
    print(f"\n=== Paliers de commission ===")
    for i, (min_amount, max_amount, rate) in enumerate(config.COMMISSION_TIERS):
        max_display = f"{max_amount/100:.0f}€" if max_amount != float('inf') else "∞"
        print(f"Palier {i+1}: {min_amount/100:.0f}€ - {max_display} = {rate*100:.0f}%")