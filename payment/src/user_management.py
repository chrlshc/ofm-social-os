"""
Module de gestion des utilisateurs pour l'authentification réelle.
Remplace la simulation d'authentification par une vraie gestion des identifiants.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from enum import Enum

from sqlalchemy import Column, String, DateTime, Enum as SQLEnum, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session
import uuid

from .database import Base, db_service
from .security import SecurityUtils

logger = logging.getLogger(__name__)


class UserRole(Enum):
    """Rôles d'utilisateur dans le système."""
    USER = "user"
    CREATOR = "creator"
    ADMIN = "admin"


class UserStatus(Enum):
    """Statuts d'utilisateur."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING_VERIFICATION = "pending_verification"


class DBUser(Base):
    """Modèle utilisateur en base de données."""
    __tablename__ = 'users'
    
    id = Column(String(50), primary_key=True, default=lambda: f"user_{uuid.uuid4().hex[:16]}")
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.USER)
    status = Column(SQLEnum(UserStatus), nullable=False, default=UserStatus.PENDING_VERIFICATION)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    phone = Column(String(20), nullable=True)
    
    # CGU acceptance tracking
    accepted_terms = Column(Boolean, nullable=False, default=False)
    accepted_terms_at = Column(DateTime(timezone=True), nullable=True)
    
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(String(10), nullable=False, default='0')
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))


class UserService:
    """Service de gestion des utilisateurs."""
    
    MAX_LOGIN_ATTEMPTS = 5
    LOCKOUT_DURATION_MINUTES = 30
    
    def __init__(self):
        """Initialise le service utilisateur."""
        pass
    
    def create_user(self, email: str, password: str, role: UserRole = UserRole.USER,
                   first_name: Optional[str] = None, last_name: Optional[str] = None) -> DBUser:
        """
        Crée un nouveau utilisateur.
        
        Args:
            email: Adresse email (unique)
            password: Mot de passe en clair
            role: Rôle de l'utilisateur
            first_name: Prénom (optionnel)
            last_name: Nom (optionnel)
            
        Returns:
            Utilisateur créé
            
        Raises:
            ValueError: Si l'email existe déjà ou est invalide
        """
        # Validation de l'email
        email = SecurityUtils.sanitize_input(email.lower().strip())
        if not self._validate_email(email):
            raise ValueError("Email invalide")
        
        # Validation du mot de passe
        if not self._validate_password(password):
            raise ValueError(
                "Mot de passe invalide: minimum 8 caractères, "
                "avec majuscule, minuscule, chiffre et caractère spécial"
            )
        
        with db_service.get_session() as session:
            # Vérifier l'unicité de l'email
            existing_user = session.query(DBUser).filter_by(email=email).first()
            if existing_user:
                raise ValueError("Un utilisateur avec cet email existe déjà")
            
            # Hasher le mot de passe
            password_hash = SecurityUtils.hash_password(password)
            
            # Créer l'utilisateur
            user = DBUser(
                email=email,
                password_hash=password_hash,
                role=role,
                first_name=SecurityUtils.sanitize_input(first_name) if first_name else None,
                last_name=SecurityUtils.sanitize_input(last_name) if last_name else None,
                status=UserStatus.ACTIVE if role == UserRole.ADMIN else UserStatus.PENDING_VERIFICATION
            )
            
            session.add(user)
            session.flush()
            
            logger.info(f"Utilisateur créé: {user.id} ({email}) avec rôle {role.value}")
            return user
    
    def authenticate_user(self, email: str, password: str) -> Tuple[bool, Optional[DBUser], Optional[str]]:
        """
        Authentifie un utilisateur.
        
        Args:
            email: Adresse email
            password: Mot de passe en clair
            
        Returns:
            Tuple (succès, utilisateur, message_erreur)
        """
        email = SecurityUtils.sanitize_input(email.lower().strip())
        
        with db_service.get_session() as session:
            user = session.query(DBUser).filter_by(email=email).first()
            
            if not user:
                logger.warning(f"Tentative de connexion avec email inexistant: {email}")
                return False, None, "Identifiants invalides"
            
            # Vérifier si le compte est verrouillé
            if self._is_account_locked(user):
                logger.warning(f"Tentative de connexion sur compte verrouillé: {email}")
                return False, None, "Compte temporairement verrouillé"
            
            # Vérifier le statut du compte
            if user.status != UserStatus.ACTIVE:
                logger.warning(f"Tentative de connexion sur compte inactif: {email}")
                return False, None, f"Compte {user.status.value}"
            
            # Vérifier le mot de passe
            if not SecurityUtils.verify_password(password, user.password_hash):
                self._handle_failed_login(session, user)
                logger.warning(f"Mot de passe incorrect pour: {email}")
                return False, None, "Identifiants invalides"
            
            # Connexion réussie
            self._handle_successful_login(session, user)
            logger.info(f"Connexion réussie: {email}")
            
            return True, user, None
    
    def get_user_by_id(self, user_id: str) -> Optional[DBUser]:
        """
        Récupère un utilisateur par son ID.
        
        Args:
            user_id: ID de l'utilisateur
            
        Returns:
            Utilisateur ou None
        """
        with db_service.get_session() as session:
            return session.query(DBUser).filter_by(id=user_id).first()
    
    def get_user_by_email(self, email: str) -> Optional[DBUser]:
        """
        Récupère un utilisateur par son email.
        
        Args:
            email: Email de l'utilisateur
            
        Returns:
            Utilisateur ou None
        """
        email = SecurityUtils.sanitize_input(email.lower().strip())
        with db_service.get_session() as session:
            return session.query(DBUser).filter_by(email=email).first()
    
    def update_password(self, user_id: str, old_password: str, new_password: str) -> bool:
        """
        Met à jour le mot de passe d'un utilisateur.
        
        Args:
            user_id: ID de l'utilisateur
            old_password: Ancien mot de passe
            new_password: Nouveau mot de passe
            
        Returns:
            True si la mise à jour a réussi
        """
        if not self._validate_password(new_password):
            raise ValueError("Nouveau mot de passe invalide")
        
        with db_service.get_session() as session:
            user = session.query(DBUser).filter_by(id=user_id).with_for_update().first()
            
            if not user:
                return False
            
            # Vérifier l'ancien mot de passe
            if not SecurityUtils.verify_password(old_password, user.password_hash):
                return False
            
            # Mettre à jour le mot de passe
            user.password_hash = SecurityUtils.hash_password(new_password)
            user.updated_at = datetime.now(timezone.utc)
            
            logger.info(f"Mot de passe mis à jour pour l'utilisateur: {user_id}")
            return True
    
    def activate_user(self, user_id: str) -> bool:
        """
        Active un utilisateur.
        
        Args:
            user_id: ID de l'utilisateur
            
        Returns:
            True si l'activation a réussi
        """
        with db_service.get_session() as session:
            user = session.query(DBUser).filter_by(id=user_id).with_for_update().first()
            
            if not user:
                return False
            
            user.status = UserStatus.ACTIVE
            user.email_verified = True
            user.updated_at = datetime.now(timezone.utc)
            
            logger.info(f"Utilisateur activé: {user_id}")
            return True
    
    def suspend_user(self, user_id: str, reason: str = "") -> bool:
        """
        Suspend un utilisateur.
        
        Args:
            user_id: ID de l'utilisateur
            reason: Raison de la suspension
            
        Returns:
            True si la suspension a réussi
        """
        with db_service.get_session() as session:
            user = session.query(DBUser).filter_by(id=user_id).with_for_update().first()
            
            if not user:
                return False
            
            user.status = UserStatus.SUSPENDED
            user.updated_at = datetime.now(timezone.utc)
            
            # Log de l'audit
            db_service.log_audit({
                'user_id': user_id,
                'action': 'suspend_user',
                'resource_type': 'user',
                'resource_id': user_id,
                'request_data': {'reason': reason}
            })
            
            logger.warning(f"Utilisateur suspendu: {user_id}, raison: {reason}")
            return True
    
    def _validate_email(self, email: str) -> bool:
        """Valide le format d'un email."""
        import re
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None and len(email) <= 255
    
    def _validate_password(self, password: str) -> bool:
        """
        Valide un mot de passe selon les critères de sécurité.
        
        Critères:
        - Minimum 8 caractères
        - Au moins une majuscule
        - Au moins une minuscule  
        - Au moins un chiffre
        - Au moins un caractère spécial
        """
        if len(password) < 8:
            return False
        
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
        
        return has_upper and has_lower and has_digit and has_special
    
    def _is_account_locked(self, user: DBUser) -> bool:
        """Vérifie si un compte est verrouillé."""
        if not user.locked_until:
            return False
        
        return datetime.now(timezone.utc) < user.locked_until
    
    def _handle_failed_login(self, session: Session, user: DBUser):
        """Gère un échec de connexion."""
        current_attempts = int(user.failed_login_attempts)
        current_attempts += 1
        user.failed_login_attempts = str(current_attempts)
        
        if current_attempts >= self.MAX_LOGIN_ATTEMPTS:
            # Verrouiller le compte
            lockout_until = datetime.now(timezone.utc) + timedelta(minutes=self.LOCKOUT_DURATION_MINUTES)
            user.locked_until = lockout_until
            
            logger.warning(f"Compte verrouillé pour {self.LOCKOUT_DURATION_MINUTES} minutes: {user.email}")
        
        user.updated_at = datetime.now(timezone.utc)
    
    def _handle_successful_login(self, session: Session, user: DBUser):
        """Gère une connexion réussie."""
        user.failed_login_attempts = '0'
        user.locked_until = None
        user.last_login_at = datetime.now(timezone.utc)
        user.updated_at = datetime.now(timezone.utc)


# Instance globale du service utilisateur
user_service = UserService()


def init_default_users():
    """
    Initialise les utilisateurs par défaut pour les tests et le développement.
    """
    try:
        # Admin par défaut
        admin_email = os.getenv('DEFAULT_ADMIN_EMAIL', 'admin@ofm.local')
        admin_password = os.getenv('DEFAULT_ADMIN_PASSWORD', 'AdminP@ssw0rd123')
        
        if not user_service.get_user_by_email(admin_email):
            user_service.create_user(
                email=admin_email,
                password=admin_password,
                role=UserRole.ADMIN,
                first_name="Admin",
                last_name="System"
            )
            logger.info(f"Utilisateur admin par défaut créé: {admin_email}")
        
        # Créatrice de test en développement
        if os.getenv('FLASK_ENV') == 'development':
            test_creator_email = 'creator@test.local'
            test_creator_password = 'Creator123!'
            
            if not user_service.get_user_by_email(test_creator_email):
                user_service.create_user(
                    email=test_creator_email,
                    password=test_creator_password,
                    role=UserRole.CREATOR,
                    first_name="Test",
                    last_name="Creator"
                )
                # Activer immédiatement en dev
                test_user = user_service.get_user_by_email(test_creator_email)
                user_service.activate_user(test_user.id)
                logger.info(f"Créatrice de test créée: {test_creator_email}")
            
            # Utilisateur de test
            test_user_email = 'user@test.local'
            test_user_password = 'User123!'
            
            if not user_service.get_user_by_email(test_user_email):
                user_service.create_user(
                    email=test_user_email,
                    password=test_user_password,
                    role=UserRole.USER,
                    first_name="Test",
                    last_name="User"
                )
                test_user = user_service.get_user_by_email(test_user_email)
                user_service.activate_user(test_user.id)
                logger.info(f"Utilisateur de test créé: {test_user_email}")
                
    except Exception as e:
        logger.error(f"Erreur lors de la création des utilisateurs par défaut: {e}")


if __name__ == "__main__":
    # Tests du service utilisateur
    from datetime import timedelta
    
    print("=== Tests du service utilisateur ===\n")
    
    # Test de création d'utilisateur
    try:
        user = user_service.create_user(
            email="test@example.com",
            password="TestP@ssw0rd123",
            role=UserRole.USER,
            first_name="Test",
            last_name="User"
        )
        print(f"Utilisateur créé: {user.id} ({user.email})")
    except ValueError as e:
        print(f"Erreur de création: {e}")
    
    # Test d'authentification
    success, user, error = user_service.authenticate_user("test@example.com", "TestP@ssw0rd123")
    print(f"\nAuthentification: succès={success}, erreur={error}")
    
    if success:
        print(f"Utilisateur connecté: {user.email} (rôle: {user.role.value})")
    
    # Test d'authentification avec mauvais mot de passe
    success, user, error = user_service.authenticate_user("test@example.com", "wrong_password")
    print(f"\nAuthentification échouée: succès={success}, erreur={error}")
    
    # Test de validation de mot de passe
    test_passwords = [
        "weak",              # Trop court
        "WeakPassword",      # Pas de chiffre ni caractère spécial
        "Weak123",           # Pas de caractère spécial
        "Strong123!",        # Valide
    ]
    
    print(f"\n=== Tests de validation de mot de passe ===")
    for pwd in test_passwords:
        valid = user_service._validate_password(pwd)
        print(f"'{pwd}': {'✓' if valid else '✗'}")