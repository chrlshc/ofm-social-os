"""
Module de gestion d'erreurs améliorée avec codes explicites et traçabilité.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional, Union
from flask import jsonify, request
from werkzeug.exceptions import HTTPException

from .security import SecurityUtils

logger = logging.getLogger(__name__)


class ErrorCode(Enum):
    """Codes d'erreur standardisés pour l'API."""
    
    # Erreurs d'authentification (1000-1099)
    AUTH_MISSING_TOKEN = "AUTH_1001"
    AUTH_INVALID_TOKEN = "AUTH_1002"
    AUTH_EXPIRED_TOKEN = "AUTH_1003"
    AUTH_INSUFFICIENT_PERMISSIONS = "AUTH_1004"
    AUTH_ACCOUNT_LOCKED = "AUTH_1005"
    AUTH_ACCOUNT_SUSPENDED = "AUTH_1006"
    AUTH_INVALID_CREDENTIALS = "AUTH_1007"
    
    # Erreurs de validation (2000-2099)
    VALIDATION_MISSING_FIELD = "VAL_2001"
    VALIDATION_INVALID_FORMAT = "VAL_2002"
    VALIDATION_OUT_OF_RANGE = "VAL_2003"
    VALIDATION_INVALID_AMOUNT = "VAL_2004"
    VALIDATION_INVALID_CURRENCY = "VAL_2005"
    
    # Erreurs de ressources (3000-3099)
    RESOURCE_NOT_FOUND = "RES_3001"
    RESOURCE_ALREADY_EXISTS = "RES_3002"
    RESOURCE_UNAVAILABLE = "RES_3003"
    RESOURCE_CONFLICT = "RES_3004"
    
    # Erreurs de paiement (4000-4099)
    PAYMENT_INSUFFICIENT_FUNDS = "PAY_4001"
    PAYMENT_DECLINED = "PAY_4002"
    PAYMENT_PROCESSING_ERROR = "PAY_4003"
    PAYMENT_ALREADY_PROCESSED = "PAY_4004"
    PAYMENT_CANNOT_CANCEL = "PAY_4005"
    PAYMENT_INVALID_ACCOUNT = "PAY_4006"
    
    # Erreurs Stripe (5000-5099)
    STRIPE_API_ERROR = "STR_5001"
    STRIPE_CARD_ERROR = "STR_5002"
    STRIPE_RATE_LIMIT = "STR_5003"
    STRIPE_AUTHENTICATION_ERROR = "STR_5004"
    STRIPE_INVALID_REQUEST = "STR_5005"
    
    # Erreurs système (9000-9099)
    SYSTEM_INTERNAL_ERROR = "SYS_9001"
    SYSTEM_DATABASE_ERROR = "SYS_9002"
    SYSTEM_RATE_LIMIT_EXCEEDED = "SYS_9003"
    SYSTEM_MAINTENANCE = "SYS_9004"
    SYSTEM_CONFIGURATION_ERROR = "SYS_9005"


class PaymentAPIError(Exception):
    """Exception personnalisée pour l'API de paiement."""
    
    def __init__(self, error_code: ErrorCode, message: str, 
                 details: Optional[Dict[str, Any]] = None,
                 http_status: int = 400):
        """
        Initialise une erreur API.
        
        Args:
            error_code: Code d'erreur standardisé
            message: Message d'erreur pour l'utilisateur
            details: Détails additionnels
            http_status: Code de statut HTTP
        """
        self.error_code = error_code
        self.message = message
        self.details = details or {}
        self.http_status = http_status
        self.error_id = SecurityUtils.generate_secure_token(8)
        self.timestamp = datetime.now(timezone.utc)
        
        super().__init__(f"{error_code.value}: {message}")


class ErrorHandler:
    """Gestionnaire centralisé des erreurs."""
    
    @staticmethod
    def format_error_response(error: Union[PaymentAPIError, Exception], 
                            request_context: Optional[Dict[str, Any]] = None) -> tuple:
        """
        Formate une réponse d'erreur standardisée.
        
        Args:
            error: Exception à formatter
            request_context: Contexte de la requête
            
        Returns:
            Tuple (response_dict, http_status)
        """
        if isinstance(error, PaymentAPIError):
            # Erreur API structurée
            response = {
                'success': False,
                'error': {
                    'code': error.error_code.value,
                    'message': error.message,
                    'error_id': error.error_id,
                    'timestamp': error.timestamp.isoformat()
                }
            }
            
            # Ajouter les détails si présents
            if error.details:
                response['error']['details'] = error.details
            
            # Log de l'erreur
            logger.error(
                f"API Error [{error.error_id}]: {error.error_code.value} - {error.message}",
                extra={
                    'error_code': error.error_code.value,
                    'error_id': error.error_id,
                    'details': error.details,
                    'request_context': request_context
                }
            )
            
            return response, error.http_status
            
        else:
            # Erreur non structurée
            error_id = SecurityUtils.generate_secure_token(8)
            
            response = {
                'success': False,
                'error': {
                    'code': ErrorCode.SYSTEM_INTERNAL_ERROR.value,
                    'message': 'Une erreur interne s\'est produite',
                    'error_id': error_id,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
            }
            
            # Log détaillé de l'erreur
            logger.error(
                f"Unhandled Error [{error_id}]: {type(error).__name__} - {str(error)}",
                exc_info=True,
                extra={
                    'error_id': error_id,
                    'error_type': type(error).__name__,
                    'request_context': request_context
                }
            )
            
            return response, 500
    
    @staticmethod
    def get_request_context() -> Dict[str, Any]:
        """Récupère le contexte de la requête pour les logs."""
        try:
            return {
                'method': request.method,
                'path': request.path,
                'remote_addr': request.remote_addr,
                'user_agent': request.headers.get('User-Agent', 'Unknown')[:200],
                'user_id': getattr(request, 'user_id', None),
                'endpoint': request.endpoint,
                'args': dict(request.args),
                'content_length': request.content_length
            }
        except:
            return {'context': 'unavailable'}


def setup_error_handlers(app):
    """Configure les gestionnaires d'erreur pour l'application Flask."""
    
    @app.errorhandler(PaymentAPIError)
    def handle_payment_api_error(error: PaymentAPIError):
        """Gestionnaire pour les erreurs API personnalisées."""
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(error, context)
        return jsonify(response), status
    
    @app.errorhandler(400)
    def handle_bad_request(error):
        """Gestionnaire pour les erreurs 400."""
        api_error = PaymentAPIError(
            error_code=ErrorCode.VALIDATION_INVALID_FORMAT,
            message="Requête invalide",
            details={'original_error': str(error)},
            http_status=400
        )
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(api_error, context)
        return jsonify(response), status
    
    @app.errorhandler(401)
    def handle_unauthorized(error):
        """Gestionnaire pour les erreurs 401."""
        api_error = PaymentAPIError(
            error_code=ErrorCode.AUTH_MISSING_TOKEN,
            message="Authentification requise",
            http_status=401
        )
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(api_error, context)
        return jsonify(response), status
    
    @app.errorhandler(403)
    def handle_forbidden(error):
        """Gestionnaire pour les erreurs 403."""
        api_error = PaymentAPIError(
            error_code=ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
            message="Permissions insuffisantes",
            http_status=403
        )
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(api_error, context)
        return jsonify(response), status
    
    @app.errorhandler(404)
    def handle_not_found(error):
        """Gestionnaire pour les erreurs 404."""
        api_error = PaymentAPIError(
            error_code=ErrorCode.RESOURCE_NOT_FOUND,
            message="Ressource non trouvée",
            details={'path': request.path},
            http_status=404
        )
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(api_error, context)
        return jsonify(response), status
    
    @app.errorhandler(429)
    def handle_rate_limit(error):
        """Gestionnaire pour les erreurs de rate limiting."""
        api_error = PaymentAPIError(
            error_code=ErrorCode.SYSTEM_RATE_LIMIT_EXCEEDED,
            message="Trop de requêtes. Veuillez réessayer plus tard.",
            details={
                'retry_after': getattr(error, 'retry_after', 60)
            },
            http_status=429
        )
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(api_error, context)
        return jsonify(response), status
    
    @app.errorhandler(500)
    def handle_internal_error(error):
        """Gestionnaire pour les erreurs 500."""
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(error, context)
        return jsonify(response), status
    
    @app.errorhandler(Exception)
    def handle_generic_exception(error):
        """Gestionnaire générique pour toutes les exceptions non gérées."""
        # Ne pas gérer les HTTPException qui ont leurs propres handlers
        if isinstance(error, HTTPException):
            return error
        
        context = ErrorHandler.get_request_context()
        response, status = ErrorHandler.format_error_response(error, context)
        return jsonify(response), status


# Fonctions utilitaires pour lever des erreurs spécifiques
def raise_validation_error(message: str, field: Optional[str] = None):
    """Lève une erreur de validation."""
    details = {'field': field} if field else {}
    raise PaymentAPIError(
        error_code=ErrorCode.VALIDATION_INVALID_FORMAT,
        message=message,
        details=details,
        http_status=400
    )


def raise_auth_error(message: str, error_code: ErrorCode = ErrorCode.AUTH_INVALID_CREDENTIALS):
    """Lève une erreur d'authentification."""
    raise PaymentAPIError(
        error_code=error_code,
        message=message,
        http_status=401
    )


def raise_permission_error(message: str = "Permissions insuffisantes"):
    """Lève une erreur de permissions."""
    raise PaymentAPIError(
        error_code=ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
        message=message,
        http_status=403
    )


def raise_not_found_error(resource_type: str, resource_id: Optional[str] = None):
    """Lève une erreur de ressource non trouvée."""
    message = f"{resource_type} non trouvé"
    if resource_id:
        message += f": {resource_id}"
    
    raise PaymentAPIError(
        error_code=ErrorCode.RESOURCE_NOT_FOUND,
        message=message,
        details={'resource_type': resource_type, 'resource_id': resource_id},
        http_status=404
    )


def raise_payment_error(message: str, error_code: ErrorCode = ErrorCode.PAYMENT_PROCESSING_ERROR):
    """Lève une erreur de paiement."""
    raise PaymentAPIError(
        error_code=error_code,
        message=message,
        http_status=400
    )


def raise_stripe_error(stripe_error, operation: str = "payment"):
    """
    Convertit une erreur Stripe en PaymentAPIError.
    
    Args:
        stripe_error: Exception Stripe
        operation: Type d'opération qui a échoué
    """
    import stripe
    
    error_mapping = {
        stripe.error.CardError: ErrorCode.STRIPE_CARD_ERROR,
        stripe.error.RateLimitError: ErrorCode.STRIPE_RATE_LIMIT,
        stripe.error.InvalidRequestError: ErrorCode.STRIPE_INVALID_REQUEST,
        stripe.error.AuthenticationError: ErrorCode.STRIPE_AUTHENTICATION_ERROR,
        stripe.error.APIConnectionError: ErrorCode.STRIPE_API_ERROR,
        stripe.error.StripeError: ErrorCode.STRIPE_API_ERROR
    }
    
    error_code = error_mapping.get(type(stripe_error), ErrorCode.STRIPE_API_ERROR)
    
    # Message utilisateur amical
    user_messages = {
        ErrorCode.STRIPE_CARD_ERROR: "Problème avec votre carte de paiement",
        ErrorCode.STRIPE_RATE_LIMIT: "Service temporairement surchargé",
        ErrorCode.STRIPE_INVALID_REQUEST: "Données de paiement invalides",
        ErrorCode.STRIPE_AUTHENTICATION_ERROR: "Erreur de configuration du paiement",
        ErrorCode.STRIPE_API_ERROR: "Erreur du service de paiement"
    }
    
    message = user_messages.get(error_code, "Erreur de traitement du paiement")
    
    details = {
        'operation': operation,
        'stripe_type': type(stripe_error).__name__,
        'stripe_code': getattr(stripe_error, 'code', None),
        'stripe_param': getattr(stripe_error, 'param', None)
    }
    
    raise PaymentAPIError(
        error_code=error_code,
        message=message,
        details=details,
        http_status=400
    )


if __name__ == "__main__":
    # Tests du système de gestion d'erreurs
    print("=== Tests de gestion d'erreurs ===\n")
    
    # Test d'erreur API
    try:
        raise_validation_error("Email invalide", "email")
    except PaymentAPIError as e:
        response, status = ErrorHandler.format_error_response(e)
        print(f"Erreur de validation:")
        print(f"  Code: {response['error']['code']}")
        print(f"  Message: {response['error']['message']}")
        print(f"  Status: {status}")
        print(f"  Error ID: {response['error']['error_id']}\n")
    
    # Test d'erreur d'authentification
    try:
        raise_auth_error("Token expiré", ErrorCode.AUTH_EXPIRED_TOKEN)
    except PaymentAPIError as e:
        response, status = ErrorHandler.format_error_response(e)
        print(f"Erreur d'authentification:")
        print(f"  Code: {response['error']['code']}")
        print(f"  Message: {response['error']['message']}")
        print(f"  Status: {status}\n")
    
    # Test d'erreur générique
    try:
        raise ValueError("Erreur non gérée")
    except Exception as e:
        response, status = ErrorHandler.format_error_response(e)
        print(f"Erreur générique:")
        print(f"  Code: {response['error']['code']}")
        print(f"  Message: {response['error']['message']}")
        print(f"  Status: {status}")