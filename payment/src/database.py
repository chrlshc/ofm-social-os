"""
Module de base de données utilisant SQLAlchemy pour remplacer MockDatabase.
Gère la persistance des transactions, revenus mensuels et comptes créatrices.
"""

import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

from sqlalchemy import create_engine, Column, String, Integer, DateTime, Boolean, Enum, Text, Index, UniqueConstraint, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import text
import uuid

from .models import TransactionStatus, AccountStatus

Base = declarative_base()


class DBTransaction(Base):
    """Modèle de transaction en base de données."""
    __tablename__ = 'transactions'
    
    id = Column(String(50), primary_key=True, default=lambda: f"txn_{uuid.uuid4().hex[:16]}")
    fan_id = Column(String(100), nullable=False, index=True)
    creator_id = Column(String(100), nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    fee_cents = Column(Integer, nullable=False)
    net_amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default='EUR')
    status = Column(Enum(TransactionStatus), nullable=False, default=TransactionStatus.PENDING)
    stripe_payment_intent_id = Column(String(255), unique=True, nullable=False)
    stripe_connected_account_id = Column(String(255), nullable=False)
    monthly_revenue_before_cents = Column(Integer, nullable=False)
    metadata = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))
    
    # Index composés pour les requêtes fréquentes
    __table_args__ = (
        Index('idx_creator_status_created', 'creator_id', 'status', 'created_at'),
        Index('idx_fan_created', 'fan_id', 'created_at'),
    )


class DBMonthlyRevenue(Base):
    """Modèle de revenu mensuel en base de données."""
    __tablename__ = 'monthly_revenues'
    
    id = Column(String(50), primary_key=True, default=lambda: f"rev_{uuid.uuid4().hex[:16]}")
    creator_id = Column(String(100), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    total_revenue_cents = Column(Integer, nullable=False, default=0)
    total_fees_cents = Column(Integer, nullable=False, default=0)
    net_revenue_cents = Column(Integer, nullable=False, default=0)
    transaction_count = Column(Integer, nullable=False, default=0)
    currency = Column(String(3), nullable=False, default='EUR')
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))
    
    __table_args__ = (
        UniqueConstraint('creator_id', 'year', 'month', name='uq_creator_year_month'),
        Index('idx_creator_year_month', 'creator_id', 'year', 'month'),
    )


class DBCreatorAccount(Base):
    """Modèle de compte créatrice en base de données."""
    __tablename__ = 'creator_accounts'
    
    creator_id = Column(String(100), primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    stripe_account_id = Column(String(255), unique=True, nullable=False)
    account_status = Column(Enum(AccountStatus), nullable=False, default=AccountStatus.INCOMPLETE)
    charges_enabled = Column(Boolean, nullable=False, default=False)
    payouts_enabled = Column(Boolean, nullable=False, default=False)
    details_submitted = Column(Boolean, nullable=False, default=False)
    country = Column(String(2), nullable=False, default='FR')
    currency = Column(String(3), nullable=False, default='EUR')
    onboarding_completed = Column(Boolean, nullable=False, default=False)
    requirements = Column(JSONB, default={})
    metadata = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_email', 'email'),
        Index('idx_stripe_account', 'stripe_account_id'),
    )


class DBAuditLog(Base):
    """Modèle pour les logs d'audit."""
    __tablename__ = 'audit_logs'
    
    id = Column(String(50), primary_key=True, default=lambda: f"audit_{uuid.uuid4().hex[:16]}")
    user_id = Column(String(100), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(50), nullable=False)
    resource_id = Column(String(100), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    request_data = Column(JSONB, default={})
    response_status = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_user_created', 'user_id', 'created_at'),
        Index('idx_action_created', 'action', 'created_at'),
    )


class DatabaseService:
    """Service de gestion de la base de données."""
    
    def __init__(self, database_url: Optional[str] = None):
        """
        Initialise le service de base de données.
        
        Args:
            database_url: URL de connexion à la base de données
        """
        self.database_url = database_url or os.getenv('DATABASE_URL', 'sqlite:///payments.db')
        
        # Configuration du moteur selon le type de base
        if self.database_url.startswith('sqlite'):
            # SQLite avec mode WAL pour meilleure concurrence
            self.engine = create_engine(
                self.database_url,
                connect_args={'check_same_thread': False},
                pool_pre_ping=True
            )
        else:
            # PostgreSQL ou MySQL avec pool de connexions
            self.engine = create_engine(
                self.database_url,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
                pool_recycle=3600
            )
        
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
    
    def init_db(self):
        """Initialise les tables de la base de données."""
        Base.metadata.create_all(bind=self.engine)
    
    @contextmanager
    def get_session(self) -> Session:
        """Context manager pour obtenir une session de base de données."""
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
    
    def get_monthly_revenue(self, creator_id: str, year: int, month: int) -> int:
        """
        Récupère le revenu mensuel cumulé en centimes.
        
        Args:
            creator_id: ID de la créatrice
            year: Année
            month: Mois
            
        Returns:
            Revenu total en centimes
        """
        with self.get_session() as session:
            revenue = session.query(DBMonthlyRevenue).filter_by(
                creator_id=creator_id,
                year=year,
                month=month
            ).first()
            
            return revenue.total_revenue_cents if revenue else 0
    
    def update_monthly_revenue(self, creator_id: str, year: int, month: int, 
                             amount_cents: int, fee_cents: int):
        """
        Met à jour le revenu mensuel après une transaction confirmée.
        
        Args:
            creator_id: ID de la créatrice
            year: Année
            month: Mois
            amount_cents: Montant de la transaction en centimes
            fee_cents: Commission prélevée en centimes
        """
        with self.get_session() as session:
            revenue = session.query(DBMonthlyRevenue).filter_by(
                creator_id=creator_id,
                year=year,
                month=month
            ).with_for_update().first()
            
            if revenue:
                # Mise à jour du revenu existant
                revenue.total_revenue_cents += amount_cents
                revenue.total_fees_cents += fee_cents
                revenue.net_revenue_cents += (amount_cents - fee_cents)
                revenue.transaction_count += 1
                revenue.updated_at = datetime.now(timezone.utc)
            else:
                # Création d'un nouveau revenu mensuel
                revenue = DBMonthlyRevenue(
                    creator_id=creator_id,
                    year=year,
                    month=month,
                    total_revenue_cents=amount_cents,
                    total_fees_cents=fee_cents,
                    net_revenue_cents=(amount_cents - fee_cents),
                    transaction_count=1
                )
                session.add(revenue)
    
    def save_transaction(self, transaction_data: Dict[str, Any]) -> DBTransaction:
        """
        Sauvegarde une nouvelle transaction.
        
        Args:
            transaction_data: Données de la transaction
            
        Returns:
            Transaction créée
        """
        with self.get_session() as session:
            transaction = DBTransaction(**transaction_data)
            session.add(transaction)
            session.flush()
            return transaction
    
    def get_transaction(self, transaction_id: str) -> Optional[DBTransaction]:
        """
        Récupère une transaction par son ID.
        
        Args:
            transaction_id: ID de la transaction
            
        Returns:
            Transaction ou None
        """
        with self.get_session() as session:
            return session.query(DBTransaction).filter_by(id=transaction_id).first()
    
    def get_transaction_by_payment_intent(self, payment_intent_id: str) -> Optional[DBTransaction]:
        """
        Récupère une transaction par son ID Stripe.
        
        Args:
            payment_intent_id: ID du PaymentIntent Stripe
            
        Returns:
            Transaction ou None
        """
        with self.get_session() as session:
            return session.query(DBTransaction).filter_by(
                stripe_payment_intent_id=payment_intent_id
            ).first()
    
    def update_transaction_status(self, transaction_id: str, status: TransactionStatus,
                                metadata_update: Optional[Dict[str, Any]] = None):
        """
        Met à jour le statut d'une transaction.
        
        Args:
            transaction_id: ID de la transaction
            status: Nouveau statut
            metadata_update: Métadonnées additionnelles à ajouter
        """
        with self.get_session() as session:
            transaction = session.query(DBTransaction).filter_by(id=transaction_id).with_for_update().first()
            
            if transaction:
                transaction.status = status
                transaction.updated_at = datetime.now(timezone.utc)
                
                if metadata_update:
                    current_metadata = transaction.metadata or {}
                    current_metadata.update(metadata_update)
                    transaction.metadata = current_metadata
    
    def get_creator_account(self, creator_id: str) -> Optional[DBCreatorAccount]:
        """
        Récupère un compte créatrice.
        
        Args:
            creator_id: ID de la créatrice
            
        Returns:
            Compte créatrice ou None
        """
        with self.get_session() as session:
            return session.query(DBCreatorAccount).filter_by(creator_id=creator_id).first()
    
    def save_creator_account(self, account_data: Dict[str, Any]) -> DBCreatorAccount:
        """
        Sauvegarde un compte créatrice.
        
        Args:
            account_data: Données du compte
            
        Returns:
            Compte créé
        """
        with self.get_session() as session:
            account = DBCreatorAccount(**account_data)
            session.add(account)
            session.flush()
            return account
    
    def update_creator_account(self, creator_id: str, updates: Dict[str, Any]):
        """
        Met à jour un compte créatrice.
        
        Args:
            creator_id: ID de la créatrice
            updates: Champs à mettre à jour
        """
        with self.get_session() as session:
            account = session.query(DBCreatorAccount).filter_by(creator_id=creator_id).with_for_update().first()
            
            if account:
                for key, value in updates.items():
                    if hasattr(account, key):
                        setattr(account, key, value)
                account.updated_at = datetime.now(timezone.utc)
    
    def log_audit(self, audit_data: Dict[str, Any]):
        """
        Enregistre une entrée dans les logs d'audit.
        
        Args:
            audit_data: Données d'audit
        """
        with self.get_session() as session:
            audit_log = DBAuditLog(**audit_data)
            session.add(audit_log)
    
    def get_creator_transactions(self, creator_id: str, limit: int = 100, 
                                offset: int = 0, status: Optional[TransactionStatus] = None) -> List[DBTransaction]:
        """
        Récupère les transactions d'une créatrice.
        
        Args:
            creator_id: ID de la créatrice
            limit: Nombre maximum de résultats
            offset: Décalage pour la pagination
            status: Filtrer par statut (optionnel)
            
        Returns:
            Liste des transactions
        """
        with self.get_session() as session:
            query = session.query(DBTransaction).filter_by(creator_id=creator_id)
            
            if status:
                query = query.filter_by(status=status)
            
            return query.order_by(DBTransaction.created_at.desc()).limit(limit).offset(offset).all()
    
    def get_revenue_history(self, creator_id: str, limit: int = 12) -> List[DBMonthlyRevenue]:
        """
        Récupère l'historique des revenus mensuels d'une créatrice.
        
        Args:
            creator_id: ID de la créatrice
            limit: Nombre de mois à récupérer
            
        Returns:
            Liste des revenus mensuels
        """
        with self.get_session() as session:
            return session.query(DBMonthlyRevenue).filter_by(
                creator_id=creator_id
            ).order_by(
                DBMonthlyRevenue.year.desc(),
                DBMonthlyRevenue.month.desc()
            ).limit(limit).all()
    
    def cleanup_old_audit_logs(self, days: int = 90):
        """
        Supprime les logs d'audit anciens.
        
        Args:
            days: Nombre de jours à conserver
        """
        with self.get_session() as session:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
            session.query(DBAuditLog).filter(
                DBAuditLog.created_at < cutoff_date
            ).delete()


# Instance globale du service de base de données
db_service = None


def init_database(app):
    """Initialise le service de base de données avec l'application Flask."""
    global db_service
    db_service = DatabaseService(app.config.get('DATABASE_URL'))
    db_service.init_db()
    return db_service


if __name__ == "__main__":
    # Test de la base de données
    service = DatabaseService()
    service.init_db()
    
    print("Base de données initialisée avec succès")
    
    # Test de création de transaction
    with service.get_session() as session:
        # Compte test
        if not service.get_creator_account("creator_test"):
            account_data = {
                'creator_id': 'creator_test',
                'email': 'test@example.com',
                'stripe_account_id': 'acct_test123',
                'account_status': AccountStatus.ACTIVE,
                'charges_enabled': True,
                'payouts_enabled': True
            }
            service.save_creator_account(account_data)
            print("Compte test créé")
        
        # Transaction test
        transaction_data = {
            'fan_id': 'fan_test',
            'creator_id': 'creator_test',
            'amount_cents': 25000,  # 250€
            'fee_cents': 3750,      # 37.50€
            'net_amount_cents': 21250,
            'stripe_payment_intent_id': f'pi_test_{uuid.uuid4().hex[:8]}',
            'stripe_connected_account_id': 'acct_test123',
            'monthly_revenue_before_cents': 150000
        }
        
        transaction = service.save_transaction(transaction_data)
        print(f"Transaction créée: {transaction.id}")
        
        # Test du revenu mensuel
        now = datetime.now(timezone.utc)
        revenue = service.get_monthly_revenue('creator_test', now.year, now.month)
        print(f"Revenu mensuel actuel: {revenue/100:.2f}€")