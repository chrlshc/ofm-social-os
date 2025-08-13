"""
Module de sécurité pour la gestion des webhooks, rate limiting et autres aspects de sécurité.
"""

import os
import hmac
import hashlib
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Callable
from functools import wraps

from flask import request, jsonify, current_app
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import stripe


logger = logging.getLogger(__name__)


class WebhookSecurity:
    """Gestion sécurisée des webhooks Stripe."""
    
    # Types d'événements autorisés
    ALLOWED_EVENT_TYPES = {
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'payment_intent.canceled',
        'account.updated',
        'account.application.authorized',
        'account.application.deauthorized'
    }
    
    def __init__(self, webhook_secret: Optional[str] = None):
        """
        Initialise la sécurité des webhooks.
        
        Args:
            webhook_secret: Secret webhook Stripe
        """
        self.webhook_secret = webhook_secret or os.getenv('STRIPE_WEBHOOK_SECRET')
        if not self.webhook_secret:
            logger.warning("STRIPE_WEBHOOK_SECRET non configuré - webhooks désactivés")
    
    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """
        Vérifie la signature d'un webhook Stripe.
        
        Args:
            payload: Corps de la requête
            signature: Signature Stripe
            
        Returns:
            True si la signature est valide
        """
        if not self.webhook_secret:
            return False
        
        try:
            stripe.Webhook.construct_event(payload, signature, self.webhook_secret)
            return True
        except stripe.error.SignatureVerificationError:
            logger.error("Signature webhook invalide")
            return False
        except Exception as e:
            logger.error(f"Erreur lors de la vérification du webhook: {e}")
            return False
    
    def is_event_allowed(self, event_type: str) -> bool:
        """
        Vérifie si un type d'événement est autorisé.
        
        Args:
            event_type: Type d'événement Stripe
            
        Returns:
            True si l'événement est autorisé
        """
        if event_type not in self.ALLOWED_EVENT_TYPES:
            logger.warning(f"Type d'événement non autorisé: {event_type}")
            return False
        return True
    
    def validate_webhook_payload(self, event: Dict[str, Any]) -> Optional[str]:
        """
        Valide le contenu d'un événement webhook.
        
        Args:
            event: Événement Stripe
            
        Returns:
            Message d'erreur si invalide, None sinon
        """
        # Vérification de la structure de base
        if not isinstance(event, dict):
            return "Format d'événement invalide"
        
        if 'id' not in event or 'type' not in event:
            return "Champs obligatoires manquants"
        
        # Vérification du type d'événement
        if not self.is_event_allowed(event['type']):
            return f"Type d'événement non autorisé: {event['type']}"
        
        # Vérification de la présence des données
        if 'data' not in event or 'object' not in event.get('data', {}):
            return "Données de l'événement manquantes"
        
        # Validation spécifique selon le type
        if event['type'].startswith('payment_intent.'):
            payment_intent = event['data']['object']
            if 'id' not in payment_intent or not payment_intent['id'].startswith('pi_'):
                return "PaymentIntent invalide"
        
        return None


class SecurityUtils:
    """Utilitaires de sécurité généraux."""
    
    @staticmethod
    def sanitize_input(value: str, max_length: int = 255) -> str:
        """
        Nettoie une chaîne d'entrée pour éviter les injections.
        
        Args:
            value: Valeur à nettoyer
            max_length: Longueur maximale autorisée
            
        Returns:
            Valeur nettoyée
        """
        if not value:
            return ""
        
        # Tronquer à la longueur maximale
        value = str(value)[:max_length]
        
        # Supprimer les caractères de contrôle
        value = ''.join(char for char in value if ord(char) >= 32)
        
        return value.strip()
    
    @staticmethod
    def mask_sensitive_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Masque les données sensibles pour les logs.
        
        Args:
            data: Dictionnaire contenant potentiellement des données sensibles
            
        Returns:
            Dictionnaire avec données sensibles masquées
        """
        sensitive_fields = {
            'password', 'secret', 'token', 'api_key', 'client_secret',
            'card_number', 'cvv', 'stripe_account_id', 'payment_method'
        }
        
        masked_data = data.copy()
        
        for key, value in masked_data.items():
            # Masquer les champs sensibles
            if any(field in key.lower() for field in sensitive_fields):
                if isinstance(value, str) and len(value) > 4:
                    masked_data[key] = value[:4] + '*' * (len(value) - 4)
                else:
                    masked_data[key] = '***'
            
            # Récursif pour les dictionnaires imbriqués
            elif isinstance(value, dict):
                masked_data[key] = SecurityUtils.mask_sensitive_data(value)
        
        return masked_data
    
    @staticmethod
    def generate_secure_token(length: int = 32) -> str:
        """
        Génère un token sécurisé.
        
        Args:
            length: Longueur du token en octets
            
        Returns:
            Token hexadécimal
        """
        return os.urandom(length).hex()
    
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hash un mot de passe avec bcrypt.
        
        Args:
            password: Mot de passe en clair
            
        Returns:
            Hash du mot de passe
        """
        import bcrypt
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """
        Vérifie un mot de passe contre son hash.
        
        Args:
            password: Mot de passe en clair
            hashed: Hash à vérifier
            
        Returns:
            True si le mot de passe correspond
        """
        import bcrypt
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


# Configuration du rate limiting
def get_rate_limiter(app=None) -> Limiter:
    """
    Configure et retourne une instance de rate limiter.
    
    Args:
        app: Application Flask (optionnel)
        
    Returns:
        Instance de Limiter configurée
    """
    return Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["200 per day", "50 per hour"],
        storage_uri=os.getenv('REDIS_URL', 'memory://'),
        strategy="fixed-window"
    )


# Décorateurs de sécurité
def require_secure_webhook(f: Callable) -> Callable:
    """
    Décorateur pour sécuriser les endpoints webhook.
    
    Vérifie la signature et valide le contenu.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Vérification de la méthode
        if request.method != 'POST':
            return jsonify({'error': 'Méthode non autorisée'}), 405
        
        # Récupération du payload et de la signature
        payload = request.data
        signature = request.headers.get('Stripe-Signature')
        
        if not signature:
            logger.warning("Webhook reçu sans signature")
            return jsonify({'error': 'Signature manquante'}), 400
        
        # Vérification de la signature
        webhook_security = WebhookSecurity()
        if not webhook_security.verify_webhook_signature(payload, signature):
            return jsonify({'error': 'Signature invalide'}), 400
        
        # Construction et validation de l'événement
        try:
            event = stripe.Webhook.construct_event(
                payload, 
                signature, 
                webhook_security.webhook_secret
            )
            
            error = webhook_security.validate_webhook_payload(event)
            if error:
                logger.error(f"Validation webhook échouée: {error}")
                return jsonify({'error': error}), 400
            
            # Injection de l'événement validé dans la requête
            request.webhook_event = event
            
        except Exception as e:
            logger.error(f"Erreur lors du traitement du webhook: {e}")
            return jsonify({'error': 'Erreur de traitement'}), 400
        
        return f(*args, **kwargs)
    
    return decorated_function


def audit_log(action: str, resource_type: str):
    """
    Décorateur pour enregistrer automatiquement les actions dans les logs d'audit.
    
    Args:
        action: Type d'action (create, update, delete, etc.)
        resource_type: Type de ressource (payment, account, etc.)
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated_function(*args, **kwargs):
            from .database import db_service
            
            # Capture des informations de la requête
            audit_data = {
                'user_id': getattr(request, 'user_id', None),
                'action': action,
                'resource_type': resource_type,
                'resource_id': kwargs.get('id') or kwargs.get(f'{resource_type}_id'),
                'ip_address': get_remote_address(),
                'user_agent': request.headers.get('User-Agent', '')[:500],
                'request_data': SecurityUtils.mask_sensitive_data(
                    request.get_json() or {}
                )
            }
            
            # Exécution de la fonction
            try:
                response = f(*args, **kwargs)
                
                # Enregistrement du statut de réponse
                if hasattr(response, 'status_code'):
                    audit_data['response_status'] = response.status_code
                elif isinstance(response, tuple) and len(response) > 1:
                    audit_data['response_status'] = response[1]
                
                # Log en base de données
                if db_service:
                    db_service.log_audit(audit_data)
                
                return response
                
            except Exception as e:
                # En cas d'erreur, log avec le message d'erreur
                audit_data['response_status'] = 500
                audit_data['error_message'] = str(e)[:1000]
                
                if db_service:
                    db_service.log_audit(audit_data)
                
                raise
        
        return decorated_function
    return decorator


# Configuration CORS sécurisée
def setup_secure_cors(app, allowed_origins: Optional[list] = None):
    """
    Configure CORS de manière sécurisée.
    
    Args:
        app: Application Flask
        allowed_origins: Liste des origines autorisées
    """
    from flask_cors import CORS
    
    if not allowed_origins:
        # En production, utiliser uniquement les domaines autorisés
        if app.config.get('ENV') == 'production':
            allowed_origins = [
                os.getenv('FRONTEND_URL', 'https://your-domain.com')
            ]
        else:
            # En développement, autoriser localhost
            allowed_origins = [
                'http://localhost:3000',
                'http://127.0.0.1:3000'
            ]
    
    CORS(app, 
         origins=allowed_origins,
         supports_credentials=True,
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
         allow_headers=['Content-Type', 'Authorization', 'X-Auth-Token'],
         expose_headers=['X-Total-Count', 'X-Page', 'X-Per-Page']
    )


# Headers de sécurité
def setup_security_headers(app):
    """Configure les headers de sécurité pour l'application."""
    
    @app.after_request
    def add_security_headers(response):
        # Protection XSS
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        # HSTS en production
        if app.config.get('ENV') == 'production':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        # CSP basique
        response.headers['Content-Security-Policy'] = "default-src 'self'"
        
        # Pas de cache pour les réponses sensibles
        if request.endpoint and 'auth' in request.endpoint:
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
        
        return response


if __name__ == "__main__":
    # Tests des utilitaires de sécurité
    print("=== Tests de sécurité ===\n")
    
    # Test de sanitization
    test_input = "Hello<script>alert('xss')</script> World\x00\x01"
    sanitized = SecurityUtils.sanitize_input(test_input)
    print(f"Input: {repr(test_input)}")
    print(f"Sanitized: {repr(sanitized)}\n")
    
    # Test de masquage
    sensitive_data = {
        'email': 'user@example.com',
        'password': 'supersecret123',
        'stripe_account_id': 'acct_1234567890',
        'amount': 100
    }
    masked = SecurityUtils.mask_sensitive_data(sensitive_data)
    print(f"Original: {sensitive_data}")
    print(f"Masked: {masked}\n")
    
    # Test de génération de token
    token = SecurityUtils.generate_secure_token()
    print(f"Secure token: {token}\n")
    
    # Test de hash de mot de passe
    password = "MySecureP@ssw0rd"
    hashed = SecurityUtils.hash_password(password)
    print(f"Password hash: {hashed}")
    print(f"Verification: {SecurityUtils.verify_password(password, hashed)}")
    print(f"Wrong password: {SecurityUtils.verify_password('wrong', hashed)}")