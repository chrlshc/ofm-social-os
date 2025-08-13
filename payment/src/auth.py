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
    """Crée les endpoints d'authentification avec gestion complète des utilisateurs."""
    
    @app.route('/auth/login', methods=['POST'])
    def login():
        """
        Endpoint de connexion avec vérification réelle des identifiants.
        
        Body:
        {
            "email": "user@example.com",
            "password": "password"
        }
        """
        from .user_management import user_service
        from .security import SecurityUtils
        
        data = request.get_json()
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({
                'error': 'Email et mot de passe requis'
            }), 400
        
        # Sanitization des entrées
        email = SecurityUtils.sanitize_input(data['email'])
        password = data['password']  # Ne pas sanitizer le mot de passe
        
        # Authentification réelle
        success, user, error_message = user_service.authenticate_user(email, password)
        
        if not success:
            # Log de la tentative d'intrusion
            logger.warning(
                f"Tentative de connexion échouée pour {email} depuis {request.remote_addr}"
            )
            return jsonify({
                'error': error_message or 'Identifiants invalides'
            }), 401
        
        # Génération des tokens avec claims additionnels
        additional_claims = {
            'email': user.email,
            'email_verified': user.email_verified,
            'last_login': user.last_login_at.isoformat() if user.last_login_at else None
        }
        
        tokens = auth_service.generate_tokens(
            user_id=user.id,
            role=user.role.value,
            additional_claims=additional_claims
        )
        
        logger.info(f"Connexion réussie pour {user.email} ({user.id}) avec rôle {user.role.value}")
        
        return jsonify({
            **tokens,
            'user': {
                'id': user.id,
                'email': user.email,
                'role': user.role.value,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'email_verified': user.email_verified,
                'status': user.status.value
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
        """Endpoint pour vérifier la validité d'un token et récupérer les infos utilisateur."""
        from .user_management import user_service
        
        # Récupération des informations utilisateur à jour
        user = user_service.get_user_by_id(request.user_id)
        if not user:
            return jsonify({
                'error': 'Utilisateur non trouvé'
            }), 404
        
        return jsonify({
            'valid': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'role': user.role.value,
                'status': user.status.value,
                'email_verified': user.email_verified,
                'first_name': user.first_name,
                'last_name': user.last_name
            },
            'token_claims': {
                'issued_at': request.auth_claims.get('iat'),
                'expires_at': request.auth_claims.get('exp')
            }
        }), 200
    
    @app.route('/auth/register', methods=['POST'])
    def register():
        """
        Endpoint d'inscription d'un nouvel utilisateur.
        
        Body:
        {
            "email": "user@example.com",
            "password": "SecureP@ssw0rd123",
            "first_name": "John",
            "last_name": "Doe",
            "role": "user"  // optionnel, par défaut "user"
        }
        """
        from .user_management import user_service, UserRole
        from .security import SecurityUtils
        
        data = request.get_json()
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({
                'error': 'Email et mot de passe requis'
            }), 400
        
        try:
            # Validation du rôle
            role_str = data.get('role', 'user').lower()
            if role_str == 'admin':
                # Seuls les admins existants peuvent créer d'autres admins
                return jsonify({
                    'error': 'Création de compte admin non autorisée'
                }), 403
            
            role = UserRole.CREATOR if role_str == 'creator' else UserRole.USER
            
            # Création de l'utilisateur
            user = user_service.create_user(
                email=data['email'],
                password=data['password'],
                role=role,
                first_name=data.get('first_name'),
                last_name=data.get('last_name')
            )
            
            logger.info(f"Nouvel utilisateur créé: {user.email} ({user.id}) avec rôle {role.value}")
            
            return jsonify({
                'success': True,
                'user': {
                    'id': user.id,
                    'email': user.email,
                    'role': user.role.value,
                    'status': user.status.value
                },
                'message': 'Compte créé avec succès. Vérification d\'email requise.'
            }), 201
            
        except ValueError as e:
            return jsonify({
                'error': str(e)
            }), 400
        except Exception as e:
            logger.error(f"Erreur lors de la création d'utilisateur: {e}")
            return jsonify({
                'error': 'Erreur lors de la création du compte'
            }), 500
    
    @app.route('/auth/change-password', methods=['POST'])
    @require_auth()
    def change_password():
        """
        Endpoint pour changer le mot de passe.
        
        Body:
        {
            "old_password": "current_password",
            "new_password": "new_secure_password"
        }
        """
        from .user_management import user_service
        
        data = request.get_json()
        if not data or not data.get('old_password') or not data.get('new_password'):
            return jsonify({
                'error': 'Ancien et nouveau mot de passe requis'
            }), 400
        
        try:
            success = user_service.update_password(
                user_id=request.user_id,
                old_password=data['old_password'],
                new_password=data['new_password']
            )
            
            if not success:
                return jsonify({
                    'error': 'Ancien mot de passe incorrect'
                }), 400
            
            logger.info(f"Mot de passe changé pour l'utilisateur: {request.user_id}")
            
            return jsonify({
                'success': True,
                'message': 'Mot de passe mis à jour avec succès'
            }), 200
            
        except ValueError as e:
            return jsonify({
                'error': str(e)
            }), 400
        except Exception as e:
            logger.error(f"Erreur lors du changement de mot de passe: {e}")
            return jsonify({
                'error': 'Erreur lors de la mise à jour du mot de passe'
            }), 500


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