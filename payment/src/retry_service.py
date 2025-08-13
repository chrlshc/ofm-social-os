"""
Service de retry avec idempotency pour les appels réseau critiques

Implémente des stratégies de retry intelligentes avec gestion
des clés d'idempotence pour éviter les doublons en production.
"""

import time
import logging
import functools
from typing import Callable, Any, Optional, Dict, List
from datetime import datetime, timedelta
import uuid
import redis
import stripe

logger = logging.getLogger(__name__)


class RetryConfig:
    """Configuration pour les stratégies de retry"""
    
    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        backoff_multiplier: float = 2.0,
        jitter: bool = True,
        retriable_errors: Optional[List[type]] = None
    ):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_multiplier = backoff_multiplier
        self.jitter = jitter
        self.retriable_errors = retriable_errors or [
            stripe.error.APIConnectionError,
            stripe.error.APIError,
            stripe.error.RateLimitError,
            ConnectionError,
            TimeoutError
        ]


class IdempotencyService:
    """Service de gestion des clés d'idempotence"""
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        self.redis = redis_client or redis.Redis.from_url("redis://localhost:6379/3")
        self.default_ttl = 86400  # 24 heures
    
    def generate_key(self, operation: str, *args, **kwargs) -> str:
        """
        Génère une clé d'idempotence unique pour une opération
        
        Args:
            operation: Type d'opération (payment_intent, checkout_session, etc.)
            *args, **kwargs: Paramètres de l'opération
            
        Returns:
            Clé d'idempotence unique
        """
        # Créer un hash stable des paramètres
        import hashlib
        import json
        
        params_str = json.dumps({
            'args': args,
            'kwargs': {k: v for k, v in kwargs.items() if k != 'idempotency_key'}
        }, sort_keys=True, default=str)
        
        params_hash = hashlib.md5(params_str.encode()).hexdigest()[:16]
        timestamp = int(datetime.now().timestamp())
        
        return f"{operation}_{params_hash}_{timestamp}"
    
    def store_result(self, key: str, result: Any, ttl: Optional[int] = None) -> bool:
        """
        Stocke le résultat d'une opération avec sa clé d'idempotence
        
        Args:
            key: Clé d'idempotence
            result: Résultat de l'opération
            ttl: Durée de vie en secondes
            
        Returns:
            True si stocké avec succès
        """
        try:
            import json
            serialized_result = json.dumps(result, default=str)
            
            success = self.redis.setex(
                f"idem:{key}",
                ttl or self.default_ttl,
                serialized_result
            )
            
            logger.debug(f"Résultat stocké pour clé idempotence: {key}")
            return bool(success)
            
        except Exception as e:
            logger.error(f"Erreur stockage idempotence {key}: {e}")
            return False
    
    def get_result(self, key: str) -> Optional[Any]:
        """
        Récupère le résultat stocké pour une clé d'idempotence
        
        Args:
            key: Clé d'idempotence
            
        Returns:
            Résultat stocké ou None
        """
        try:
            import json
            stored = self.redis.get(f"idem:{key}")
            
            if stored:
                result = json.loads(stored.decode())
                logger.info(f"Résultat trouvé pour clé idempotence: {key}")
                return result
            
            return None
            
        except Exception as e:
            logger.error(f"Erreur récupération idempotence {key}: {e}")
            return None
    
    def is_duplicate(self, key: str) -> bool:
        """Vérifie si une opération a déjà été exécutée"""
        return self.redis.exists(f"idem:{key}") > 0


class RetryService:
    """Service de retry avec backoff exponentiel et idempotency"""
    
    def __init__(self, idempotency_service: Optional[IdempotencyService] = None):
        self.idempotency = idempotency_service or IdempotencyService()
    
    def with_retry(
        self,
        config: Optional[RetryConfig] = None,
        operation_type: Optional[str] = None,
        use_idempotency: bool = True
    ):
        """
        Décorateur pour ajouter retry et idempotency à une fonction
        
        Args:
            config: Configuration de retry
            operation_type: Type d'opération pour l'idempotence
            use_idempotency: Utiliser l'idempotence ou non
        """
        if config is None:
            config = RetryConfig()
        
        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # Gestion de l'idempotence
                idempotency_key = None
                cached_result = None
                
                if use_idempotency:
                    # Utiliser la clé fournie ou en générer une
                    idempotency_key = kwargs.get('idempotency_key')
                    if not idempotency_key:
                        op_type = operation_type or func.__name__
                        idempotency_key = self.idempotency.generate_key(op_type, *args, **kwargs)
                        kwargs['idempotency_key'] = idempotency_key
                    
                    # Vérifier si déjà exécuté
                    cached_result = self.idempotency.get_result(idempotency_key)
                    if cached_result:
                        logger.info(f"Résultat trouvé en cache pour {idempotency_key}")
                        return cached_result
                
                # Retry loop
                last_exception = None
                
                for attempt in range(config.max_attempts):
                    try:
                        result = func(*args, **kwargs)
                        
                        # Stocker le résultat pour idempotency
                        if use_idempotency and idempotency_key:
                            self.idempotency.store_result(idempotency_key, result)
                        
                        if attempt > 0:
                            logger.info(f"Opération réussie après {attempt + 1} tentatives")
                        
                        return result
                        
                    except Exception as e:
                        last_exception = e
                        
                        # Vérifier si l'erreur est retriable
                        if not self._is_retriable_error(e, config.retriable_errors):
                            logger.error(f"Erreur non retriable: {e}")
                            raise e
                        
                        # Ne pas retry sur le dernier attempt
                        if attempt == config.max_attempts - 1:
                            break
                        
                        # Calculer le délai de retry
                        delay = self._calculate_delay(attempt, config)
                        
                        logger.warning(
                            f"Tentative {attempt + 1}/{config.max_attempts} échouée: {e}. "
                            f"Retry dans {delay:.2f}s"
                        )
                        
                        time.sleep(delay)
                
                # Toutes les tentatives ont échoué
                logger.error(f"Opération échouée après {config.max_attempts} tentatives")
                raise last_exception
            
            return wrapper
        return decorator
    
    def _is_retriable_error(self, error: Exception, retriable_errors: List[type]) -> bool:
        """Vérifie si une erreur est retriable"""
        for error_type in retriable_errors:
            if isinstance(error, error_type):
                return True
        
        # Vérifications spécifiques Stripe
        if isinstance(error, stripe.error.StripeError):
            # Rate limiting est toujours retriable
            if isinstance(error, stripe.error.RateLimitError):
                return True
            
            # Certains codes d'erreur sont retriables
            retriable_codes = ['rate_limit', 'api_connection_error', 'api_error']
            if hasattr(error, 'code') and error.code in retriable_codes:
                return True
        
        return False
    
    def _calculate_delay(self, attempt: int, config: RetryConfig) -> float:
        """Calcule le délai de retry avec backoff exponentiel"""
        delay = config.base_delay * (config.backoff_multiplier ** attempt)
        delay = min(delay, config.max_delay)
        
        # Ajouter du jitter pour éviter le thundering herd
        if config.jitter:
            import random
            jitter_factor = random.uniform(0.8, 1.2)
            delay *= jitter_factor
        
        return delay


# Configurations prédéfinies pour différents cas d'usage
PAYMENT_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    base_delay=1.0,
    max_delay=10.0,
    backoff_multiplier=2.0,
    retriable_errors=[
        stripe.error.APIConnectionError,
        stripe.error.APIError,
        stripe.error.RateLimitError
    ]
)

WEBHOOK_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    base_delay=2.0,
    max_delay=30.0,
    backoff_multiplier=1.5,
    retriable_errors=[
        ConnectionError,
        TimeoutError,
        stripe.error.APIConnectionError
    ]
)

CONNECT_RETRY_CONFIG = RetryConfig(
    max_attempts=2,
    base_delay=0.5,
    max_delay=5.0,
    backoff_multiplier=3.0,
    retriable_errors=[
        stripe.error.APIConnectionError,
        stripe.error.RateLimitError
    ]
)


# Service global
retry_service = RetryService()

# Décorateurs conveniences
def with_payment_retry(func):
    """Décorateur pour retry sur opérations de paiement"""
    return retry_service.with_retry(
        config=PAYMENT_RETRY_CONFIG,
        operation_type='payment',
        use_idempotency=True
    )(func)

def with_webhook_retry(func):
    """Décorateur pour retry sur webhooks"""
    return retry_service.with_retry(
        config=WEBHOOK_RETRY_CONFIG,
        operation_type='webhook',
        use_idempotency=False
    )(func)

def with_connect_retry(func):
    """Décorateur pour retry sur opérations Connect"""
    return retry_service.with_retry(
        config=CONNECT_RETRY_CONFIG,
        operation_type='connect',
        use_idempotency=True
    )(func)


# Exemple d'utilisation
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    @with_payment_retry
    def create_test_payment(amount: int, account_id: str, idempotency_key: str = None):
        """Fonction test avec retry automatique"""
        print(f"Création paiement: {amount}€ vers {account_id}")
        
        # Simuler une erreur réseau parfois
        import random
        if random.random() < 0.3:
            raise stripe.error.APIConnectionError("Erreur réseau simulée")
        
        return {
            'payment_id': f"pi_{uuid.uuid4().hex[:16]}",
            'amount': amount,
            'account_id': account_id,
            'status': 'succeeded'
        }
    
    # Test
    try:
        result = create_test_payment(100, "acct_test123")
        print(f"Résultat: {result}")
    except Exception as e:
        print(f"Erreur finale: {e}")