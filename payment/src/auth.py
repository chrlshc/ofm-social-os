"""
Module d'authentification JWT pour sécuriser les endpoints de l'API.
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from functools import wraps
from typing import Dict, Any, Optional, Tuple

import jwt
from flask import request, jsonify, current_app

logger = logging.getLogger(__name__)


class AuthService:
    """Service de gestion de l'authentification JWT."""
    
    def __init__(self, secret_key: Optional[str] = None, algorithm: str = 'HS256'):
        """
        Initialise le service d'authentification.
        
        Args:
            secret_key: Clé secrète pour signer les tokens
            algorithm: Algorithme de signature (défaut: HS256)
        """
        self.secret_key = secret_key or os.getenv('JWT_SECRET_KEY')
        if not self.secret_key:
            raise ValueError("JWT_SECRET_KEY est requis pour l'authentification")
        
        self.algorithm = algorithm
        self.token_expiry_hours = int(os.getenv('JWT_EXPIRY_HOURS', '24'))
        self.refresh_token_expiry_days = int(os.getenv('JWT_REFRESH_EXPIRY_DAYS', '30'))
    
    def generate_tokens(self, user_id: str, role: str = 'user', 
                       additional_claims: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        """
        Génère une paire de tokens (access et refresh).
        
        Args:
            user_id: Identifiant de l'utilisateur
            role: Rôle de l'utilisateur (user, creator, admin)
            additional_claims: Claims additionnels à inclure
            
        Returns:
            Dict avec access_token et refresh_token
        """
        now = datetime.now(timezone.utc)
        
        # Claims de base
        base_claims = {
            'user_id': user_id,
            'role': role,
            'iat': now,
            'iss': 'ofm-payment-service'
        }
        
        if additional_claims:
            base_claims.update(additional_claims)
        
        # Access token
        access_claims = {
            **base_claims,
            'exp': now + timedelta(hours=self.token_expiry_hours),
            'type': 'access'
        }
        access_token = jwt.encode(access_claims, self.secret_key, algorithm=self.algorithm)
        
        # Refresh token
        refresh_claims = {
            **base_claims,
            'exp': now + timedelta(days=self.refresh_token_expiry_days),
            'type': 'refresh'
        }
        refresh_token = jwt.encode(refresh_claims, self.secret_key, algorithm=self.algorithm)
        
        logger.info(f"Tokens générés pour l'utilisateur {user_id} avec rôle {role}")
        
        return {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'token_type': 'Bearer',
            'expires_in': self.token_expiry_hours * 3600
        }
    
    def verify_token(self, token: str, token_type: str = 'access') -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Vérifie et décode un token JWT.
        
        Args:
            token: Token JWT à vérifier
            token_type: Type de token attendu (access ou refresh)
            
        Returns:
            Tuple (valide, claims) où claims est None si invalide
        """
        try:
            claims = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            
            # Vérification du type de token
            if claims.get('type') != token_type:
                logger.warning(f"Type de token incorrect: attendu {token_type}, reçu {claims.get('type')}")
                return False, None
            
            # Vérification de l'émetteur
            if claims.get('iss') != 'ofm-payment-service':
                logger.warning(f"Émetteur de token invalide: {claims.get('iss')}")
                return False, None
            
            return True, claims
            
        except jwt.ExpiredSignatureError:
            logger.warning("Token expiré")
            return False, {'error': 'Token expiré'}
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token invalide: {e}")
            return False, {'error': 'Token invalide'}
    
    def refresh_access_token(self, refresh_token: str) -> Optional[Dict[str, str]]:
        """
        Génère un nouveau access token à partir d'un refresh token.
        
        Args:
            refresh_token: Refresh token valide
            
        Returns:
            Nouveau access token ou None si invalide
        """
        valid, claims = self.verify_token(refresh_token, token_type='refresh')
        
        if not valid:
            return None
        
        # Génère un nouveau access token avec les mêmes claims
        return self.generate_tokens(
            user_id=claims['user_id'],
            role=claims.get('role', 'user')
        )


# Instance globale du service d'authentification
auth_service = None


def init_auth(app):
    """Initialise le service d'authentification avec l'application Flask."""
    global auth_service
    auth_service = AuthService(app.config.get('JWT_SECRET_KEY'))


def get_auth_token() -> Optional[str]:
    """
    Extrait le token JWT de la requête.
    Supporte Authorization: Bearer <token> et X-Auth-Token: <token>
    """
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header.split(' ', 1)[1]
    
    return request.headers.get('X-Auth-Token')


def require_auth(allowed_roles: Optional[list] = None):
    """
    Décorateur pour protéger les endpoints avec authentification JWT.
    
    Args:
        allowed_roles: Liste des rôles autorisés (None = tous les rôles)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = get_auth_token()
            
            if not token:
                return jsonify({
                    'error': 'Authentification requise',
                    'message': 'Token JWT manquant'
                }), 401
            
            valid, claims = auth_service.verify_token(token)
            
            if not valid:
                error_msg = claims.get('error', 'Token invalide') if claims else 'Token invalide'
                return jsonify({
                    'error': 'Authentification échouée',
                    'message': error_msg
                }), 401
            
            # Vérification des rôles
            if allowed_roles and claims.get('role') not in allowed_roles:
                logger.warning(
                    f"Accès refusé pour l'utilisateur {claims.get('user_id')} "
                    f"avec rôle {claims.get('role')}. Rôles autorisés: {allowed_roles}"
                )
                return jsonify({
                    'error': 'Accès refusé',
                    'message': 'Rôle insuffisant pour cette opération'
                }), 403
            
            # Injection des claims dans le contexte de la requête
            request.auth_claims = claims
            request.user_id = claims.get('user_id')
            request.user_role = claims.get('role')
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


def require_creator_access(creator_id_param: str = 'creator_id'):
    """
    Décorateur pour vérifier qu'un utilisateur a accès à un compte créatrice spécifique.
    
    Args:
        creator_id_param: Nom du paramètre contenant l'ID de la créatrice
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Vérifie d'abord l'authentification
            token = get_auth_token()
            if not token:
                return jsonify({
                    'error': 'Authentification requise',
                    'message': 'Token JWT manquant'
                }), 401
            
            valid, claims = auth_service.verify_token(token)
            if not valid:
                return jsonify({
                    'error': 'Authentification échouée',
                    'message': claims.get('error', 'Token invalide') if claims else 'Token invalide'
                }), 401
            
            request.auth_claims = claims
            request.user_id = claims.get('user_id')
            request.user_role = claims.get('role')
            
            # Récupère l'ID de la créatrice depuis les paramètres
            creator_id = kwargs.get(creator_id_param)
            if not creator_id:
                # Essaie depuis le body de la requête
                data = request.get_json() or {}
                creator_id = data.get(creator_id_param)
            
            if not creator_id:
                return jsonify({
                    'error': 'ID créatrice manquant'
                }), 400
            
            # Vérifie l'accès
            user_role = claims.get('role')
            user_id = claims.get('user_id')
            
            # Les admins ont accès à tout
            if user_role == 'admin':
                return f(*args, **kwargs)
            
            # Les créatrices n'ont accès qu'à leur propre compte
            if user_role == 'creator' and user_id != creator_id:
                logger.warning(
                    f"Tentative d'accès non autorisé: utilisateur {user_id} "
                    f"essaie d'accéder au compte {creator_id}"
                )
                return jsonify({
                    'error': 'Accès refusé',
                    'message': 'Vous ne pouvez accéder qu\'à votre propre compte'
                }), 403
            
            # Pour les autres rôles, vérifier des permissions spécifiques si nécessaire
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator


# Endpoints d'authentification
def create_auth_endpoints(app):
    """Crée les endpoints d'authentification."""
    
    @app.route('/auth/login', methods=['POST'])
    def login():
        """
        Endpoint de connexion.
        
        Body:
        {
            "email": "user@example.com",
            "password": "password",
            "role": "creator"  // optionnel
        }
        """
        data = request.get_json()
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({
                'error': 'Email et mot de passe requis'
            }), 400
        
        # TODO: Vérifier les credentials dans la base de données
        # Pour l'instant, simulation
        email = data['email']
        password = data['password']
        role = data.get('role', 'user')
        
        # Simulation d'une vérification (à remplacer par une vraie vérification DB)
        if password != 'demo_password':  # À remplacer par hash bcrypt
            return jsonify({
                'error': 'Identifiants invalides'
            }), 401
        
        # Génération des tokens
        user_id = f"user_{email.split('@')[0]}"  # À remplacer par ID réel de DB
        tokens = auth_service.generate_tokens(user_id, role)
        
        logger.info(f"Connexion réussie pour {email} avec rôle {role}")
        
        return jsonify({
            **tokens,
            'user': {
                'id': user_id,
                'email': email,
                'role': role
            }
        }), 200
    
    @app.route('/auth/refresh', methods=['POST'])
    def refresh():
        """
        Endpoint pour rafraîchir le token d'accès.
        
        Body:
        {
            "refresh_token": "..."
        }
        """
        data = request.get_json()
        if not data or not data.get('refresh_token'):
            return jsonify({
                'error': 'Refresh token requis'
            }), 400
        
        new_tokens = auth_service.refresh_access_token(data['refresh_token'])
        
        if not new_tokens:
            return jsonify({
                'error': 'Refresh token invalide ou expiré'
            }), 401
        
        return jsonify(new_tokens), 200
    
    @app.route('/auth/verify', methods=['GET'])
    @require_auth()
    def verify():
        """Endpoint pour vérifier la validité d'un token."""
        return jsonify({
            'valid': True,
            'user_id': request.user_id,
            'role': request.user_role,
            'claims': request.auth_claims
        }), 200


if __name__ == "__main__":
    # Test du service d'authentification
    service = AuthService(secret_key='test-secret-key')
    
    # Génération de tokens
    tokens = service.generate_tokens('user123', 'creator')
    print(f"Access token: {tokens['access_token'][:50]}...")
    print(f"Refresh token: {tokens['refresh_token'][:50]}...")
    
    # Vérification
    valid, claims = service.verify_token(tokens['access_token'])
    print(f"\nToken valide: {valid}")
    print(f"Claims: {claims}")
    
    # Test avec token expiré
    expired_token = jwt.encode(
        {'user_id': 'test', 'exp': datetime.now(timezone.utc) - timedelta(hours=1)},
        'test-secret-key',
        algorithm='HS256'
    )
    valid, claims = service.verify_token(expired_token)
    print(f"\nToken expiré valide: {valid}")
    print(f"Erreur: {claims}")