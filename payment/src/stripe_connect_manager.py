"""
Module de gestion avancée des comptes Stripe Connect.
Améliore la gestion des statuts, onboarding et mise à jour des comptes créatrices.
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List, Tuple
from enum import Enum
from dataclasses import dataclass

import stripe
from sqlalchemy.orm import Session

from .database import db_service
from .models import AccountStatus
from .security import SecurityUtils
from .error_handling import PaymentAPIError, ErrorCode, raise_stripe_error

logger = logging.getLogger(__name__)


class OnboardingStatus(Enum):
    """Statuts d'onboarding Stripe Connect."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    RESTRICTED = "restricted"
    REJECTED = "rejected"


class RequirementType(Enum):
    """Types de requirements Stripe."""
    CURRENTLY_DUE = "currently_due"
    EVENTUALLY_DUE = "eventually_due"
    PAST_DUE = "past_due"
    PENDING_VERIFICATION = "pending_verification"


@dataclass
class AccountCapabilities:
    """Capacités d'un compte Stripe."""
    card_payments: str
    transfers: str
    
    @property
    def can_receive_payments(self) -> bool:
        """Vérifie si le compte peut recevoir des paiements."""
        return self.card_payments == 'active'
    
    @property
    def can_receive_transfers(self) -> bool:
        """Vérifie si le compte peut recevoir des transferts."""
        return self.transfers == 'active'


@dataclass
class AccountRequirements:
    """Requirements d'un compte Stripe."""
    currently_due: List[str]
    eventually_due: List[str]
    past_due: List[str]
    pending_verification: List[str]
    
    @property
    def has_blocking_requirements(self) -> bool:
        """Vérifie si le compte a des requirements bloquants."""
        return len(self.currently_due) > 0 or len(self.past_due) > 0
    
    @property
    def total_requirements(self) -> int:
        """Nombre total de requirements."""
        return (len(self.currently_due) + len(self.eventually_due) + 
                len(self.past_due) + len(self.pending_verification))


class StripeConnectManager:
    """Gestionnaire avancé des comptes Stripe Connect."""
    
    def __init__(self, stripe_api_key: Optional[str] = None):
        """
        Initialise le gestionnaire Stripe Connect.
        
        Args:
            stripe_api_key: Clé API Stripe (utilise STRIPE_SECRET_KEY par défaut)
        """
        self.api_key = stripe_api_key or os.getenv('STRIPE_SECRET_KEY')
        if not self.api_key:
            raise ValueError("Clé API Stripe manquante")
        
        stripe.api_key = self.api_key
        self.logger = logging.getLogger(__name__)
    
    def create_express_account(self, email: str, country: str = 'FR', 
                             business_profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Crée un compte Express optimisé pour les créatrices.
        
        Args:
            email: Email de la créatrice
            country: Code pays (ISO 2 lettres)
            business_profile: Profil métier optionnel
            
        Returns:
            Informations du compte créé
        """
        try:
            # Configuration par défaut pour créatrices
            default_business_profile = {
                'mcc': '7372',  # Computer Programming Services
                'product_description': 'Services de création de contenu digital',
                'support_email': email,
                'url': os.getenv('FRONTEND_URL', 'https://your-domain.com')
            }
            
            if business_profile:
                default_business_profile.update(business_profile)
            
            account = stripe.Account.create(
                type='express',
                country=country.upper(),
                email=email,
                capabilities={
                    'card_payments': {'requested': True},
                    'transfers': {'requested': True}
                },
                business_profile=default_business_profile,
                settings={
                    'payouts': {
                        'schedule': {
                            'interval': 'weekly',  # Paiements hebdomadaires par défaut
                            'weekly_anchor': 'friday'
                        }
                    }
                },
                metadata={
                    'platform': 'ofm-payment-system',
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'account_type': 'creator'
                }
            )
            
            self.logger.info(f"Compte Express créé: {account.id} pour {email}")
            
            return self._format_account_data(account)
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur création compte Express pour {email}: {e}")
            raise_stripe_error(e, "create_express_account")
    
    def get_account_status(self, account_id: str) -> Dict[str, Any]:
        """
        Récupère le statut détaillé d'un compte Stripe.
        
        Args:
            account_id: ID du compte Stripe
            
        Returns:
            Statut détaillé du compte
        """
        try:
            account = stripe.Account.retrieve(account_id)
            
            # Analyse des capabilities
            capabilities = AccountCapabilities(
                card_payments=account.capabilities.get('card_payments', 'inactive'),
                transfers=account.capabilities.get('transfers', 'inactive')
            )
            
            # Analyse des requirements
            requirements = AccountRequirements(
                currently_due=account.requirements.currently_due or [],
                eventually_due=account.requirements.eventually_due or [],
                past_due=account.requirements.past_due or [],
                pending_verification=account.requirements.pending_verification or []
            )
            
            # Détermination du statut d'onboarding
            onboarding_status = self._determine_onboarding_status(account, requirements)
            
            return {
                'account_id': account.id,
                'email': account.email,
                'details_submitted': account.details_submitted,
                'charges_enabled': account.charges_enabled,
                'payouts_enabled': account.payouts_enabled,
                'capabilities': {
                    'card_payments': capabilities.card_payments,
                    'transfers': capabilities.transfers,
                    'can_receive_payments': capabilities.can_receive_payments,
                    'can_receive_transfers': capabilities.can_receive_transfers
                },
                'requirements': {
                    'currently_due': requirements.currently_due,
                    'eventually_due': requirements.eventually_due,
                    'past_due': requirements.past_due,
                    'pending_verification': requirements.pending_verification,
                    'has_blocking_requirements': requirements.has_blocking_requirements,
                    'total_requirements': requirements.total_requirements
                },
                'onboarding_status': onboarding_status.value,
                'business_profile': account.business_profile,
                'settings': account.settings,
                'created': account.created,
                'metadata': account.metadata
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur récupération statut compte {account_id}: {e}")
            raise_stripe_error(e, "get_account_status")
    
    def create_onboarding_link(self, account_id: str, return_url: Optional[str] = None,
                             refresh_url: Optional[str] = None) -> str:
        """
        Crée un lien d'onboarding personnalisé.
        
        Args:
            account_id: ID du compte Stripe
            return_url: URL de retour après onboarding
            refresh_url: URL de rafraîchissement du lien
            
        Returns:
            URL d'onboarding
        """
        try:
            base_url = os.getenv('FRONTEND_URL', 'https://your-domain.com')
            
            default_return_url = return_url or f"{base_url}/onboarding/complete"
            default_refresh_url = refresh_url or f"{base_url}/onboarding/refresh"
            
            account_link = stripe.AccountLink.create(
                account=account_id,
                return_url=default_return_url,
                refresh_url=default_refresh_url,
                type='account_onboarding'
            )
            
            self.logger.info(f"Lien d'onboarding créé pour {account_id}")
            
            return account_link.url
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur création lien onboarding {account_id}: {e}")
            raise_stripe_error(e, "create_onboarding_link")
    
    def create_dashboard_link(self, account_id: str) -> str:
        """
        Crée un lien vers le dashboard Express.
        
        Args:
            account_id: ID du compte Stripe
            
        Returns:
            URL du dashboard
        """
        try:
            login_link = stripe.Account.create_login_link(account_id)
            
            self.logger.info(f"Lien dashboard créé pour {account_id}")
            
            return login_link.url
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur création lien dashboard {account_id}: {e}")
            raise_stripe_error(e, "create_dashboard_link")
    
    def update_account_in_database(self, account_id: str) -> bool:
        """
        Met à jour les informations du compte en base de données.
        
        Args:
            account_id: ID du compte Stripe
            
        Returns:
            True si la mise à jour a réussi
        """
        try:
            # Récupérer le statut actuel
            status = self.get_account_status(account_id)
            
            # Trouver le compte en base
            with db_service.get_session() as session:
                from .database import DBCreatorAccount
                account = session.query(DBCreatorAccount).filter_by(
                    stripe_account_id=account_id
                ).with_for_update().first()
                
                if not account:
                    self.logger.warning(f"Compte non trouvé en base: {account_id}")
                    return False
                
                # Déterminer le nouveau statut
                new_status = self._map_stripe_status_to_db(status)
                
                # Mise à jour des champs
                account.account_status = new_status
                account.charges_enabled = status['charges_enabled']
                account.payouts_enabled = status['payouts_enabled']
                account.details_submitted = status['details_submitted']
                account.requirements = status['requirements']
                account.onboarding_completed = (status['onboarding_status'] == OnboardingStatus.COMPLETED.value)
                account.updated_at = datetime.now(timezone.utc)
                
                self.logger.info(f"Compte mis à jour en base: {account_id} -> {new_status.value}")
                
                return True
                
        except Exception as e:
            self.logger.error(f"Erreur mise à jour compte en base {account_id}: {e}")
            return False
    
    def process_account_updated_webhook(self, account_data: Dict[str, Any]) -> bool:
        """
        Traite un webhook account.updated de Stripe.
        
        Args:
            account_data: Données du compte depuis le webhook
            
        Returns:
            True si le traitement a réussi
        """
        try:
            account_id = account_data.get('id')
            if not account_id:
                self.logger.error("ID compte manquant dans webhook account.updated")
                return False
            
            # Mise à jour en base
            success = self.update_account_in_database(account_id)
            
            if success:
                # Log d'audit
                db_service.log_audit({
                    'action': 'stripe_account_updated',
                    'resource_type': 'stripe_account',
                    'resource_id': account_id,
                    'request_data': SecurityUtils.mask_sensitive_data(account_data)
                })
                
                self.logger.info(f"Webhook account.updated traité: {account_id}")
            
            return success
            
        except Exception as e:
            self.logger.error(f"Erreur traitement webhook account.updated: {e}")
            return False
    
    def get_payout_schedule(self, account_id: str) -> Dict[str, Any]:
        """
        Récupère la planification des virements.
        
        Args:
            account_id: ID du compte Stripe
            
        Returns:
            Informations sur la planification
        """
        try:
            account = stripe.Account.retrieve(account_id)
            payout_settings = account.settings.payouts
            
            return {
                'schedule': {
                    'interval': payout_settings.schedule.interval,
                    'weekly_anchor': getattr(payout_settings.schedule, 'weekly_anchor', None),
                    'monthly_anchor': getattr(payout_settings.schedule, 'monthly_anchor', None),
                    'delay_days': payout_settings.schedule.delay_days
                },
                'statement_descriptor': payout_settings.statement_descriptor,
                'debit_negative_balances': payout_settings.debit_negative_balances
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur récupération planning virements {account_id}: {e}")
            raise_stripe_error(e, "get_payout_schedule")
    
    def update_payout_schedule(self, account_id: str, interval: str = 'weekly',
                             weekly_anchor: str = 'friday') -> bool:
        """
        Met à jour la planification des virements.
        
        Args:
            account_id: ID du compte Stripe
            interval: Fréquence (daily, weekly, monthly)
            weekly_anchor: Jour de la semaine pour weekly
            
        Returns:
            True si la mise à jour a réussi
        """
        try:
            update_data = {
                'settings': {
                    'payouts': {
                        'schedule': {
                            'interval': interval
                        }
                    }
                }
            }
            
            if interval == 'weekly':
                update_data['settings']['payouts']['schedule']['weekly_anchor'] = weekly_anchor
            
            stripe.Account.modify(account_id, **update_data)
            
            self.logger.info(f"Planning virements mis à jour: {account_id} -> {interval}")
            
            return True
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur mise à jour planning {account_id}: {e}")
            raise_stripe_error(e, "update_payout_schedule")
    
    def get_account_balance(self, account_id: str) -> Dict[str, Any]:
        """
        Récupère le solde d'un compte.
        
        Args:
            account_id: ID du compte Stripe
            
        Returns:
            Informations sur le solde
        """
        try:
            balance = stripe.Balance.retrieve(stripe_account=account_id)
            
            available_balance = sum(b.amount for b in balance.available)
            pending_balance = sum(b.amount for b in balance.pending)
            
            return {
                'available': {
                    'total_cents': available_balance,
                    'total_euros': available_balance / 100,
                    'by_currency': [
                        {
                            'currency': b.currency,
                            'amount_cents': b.amount,
                            'amount_euros': b.amount / 100
                        }
                        for b in balance.available
                    ]
                },
                'pending': {
                    'total_cents': pending_balance,
                    'total_euros': pending_balance / 100,
                    'by_currency': [
                        {
                            'currency': b.currency,
                            'amount_cents': b.amount,
                            'amount_euros': b.amount / 100
                        }
                        for b in balance.pending
                    ]
                }
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur récupération solde {account_id}: {e}")
            raise_stripe_error(e, "get_account_balance")
    
    def _format_account_data(self, account) -> Dict[str, Any]:
        """Formate les données d'un compte Stripe."""
        return {
            'account_id': account.id,
            'email': account.email,
            'country': account.country,
            'type': account.type,
            'details_submitted': account.details_submitted,
            'charges_enabled': account.charges_enabled,
            'payouts_enabled': account.payouts_enabled,
            'capabilities': dict(account.capabilities),
            'requirements': {
                'currently_due': account.requirements.currently_due or [],
                'eventually_due': account.requirements.eventually_due or [],
                'past_due': account.requirements.past_due or [],
                'pending_verification': account.requirements.pending_verification or []
            },
            'created': account.created,
            'metadata': dict(account.metadata)
        }
    
    def _determine_onboarding_status(self, account, requirements: AccountRequirements) -> OnboardingStatus:
        """Détermine le statut d'onboarding basé sur l'état du compte."""
        if not account.details_submitted:
            return OnboardingStatus.NOT_STARTED
        
        if requirements.has_blocking_requirements:
            if requirements.past_due:
                return OnboardingStatus.RESTRICTED
            else:
                return OnboardingStatus.IN_PROGRESS
        
        if account.charges_enabled and account.payouts_enabled:
            return OnboardingStatus.COMPLETED
        
        return OnboardingStatus.IN_PROGRESS
    
    def _map_stripe_status_to_db(self, stripe_status: Dict[str, Any]) -> AccountStatus:
        """Mappe le statut Stripe vers le statut en base de données."""
        onboarding_status = stripe_status['onboarding_status']
        
        if onboarding_status == OnboardingStatus.COMPLETED.value:
            return AccountStatus.ACTIVE
        elif onboarding_status == OnboardingStatus.RESTRICTED.value:
            return AccountStatus.RESTRICTED
        elif onboarding_status == OnboardingStatus.REJECTED.value:
            return AccountStatus.SUSPENDED
        else:
            return AccountStatus.PENDING


# Tâches de maintenance périodiques
class ConnectMaintenanceTasks:
    """Tâches de maintenance pour les comptes Connect."""
    
    def __init__(self, connect_manager: StripeConnectManager):
        """Initialise avec un gestionnaire Connect."""
        self.connect_manager = connect_manager
        self.logger = logging.getLogger(__name__)
    
    def sync_all_accounts(self) -> Dict[str, int]:
        """
        Synchronise tous les comptes avec Stripe.
        
        Returns:
            Statistiques de synchronisation
        """
        stats = {'updated': 0, 'errors': 0, 'total': 0}
        
        try:
            with db_service.get_session() as session:
                from .database import DBCreatorAccount
                accounts = session.query(DBCreatorAccount).all()
                stats['total'] = len(accounts)
                
                for account in accounts:
                    try:
                        success = self.connect_manager.update_account_in_database(
                            account.stripe_account_id
                        )
                        if success:
                            stats['updated'] += 1
                        else:
                            stats['errors'] += 1
                    except Exception as e:
                        self.logger.error(f"Erreur sync compte {account.stripe_account_id}: {e}")
                        stats['errors'] += 1
                
                self.logger.info(f"Synchronisation terminée: {stats}")
                return stats
                
        except Exception as e:
            self.logger.error(f"Erreur synchronisation globale: {e}")
            stats['errors'] = stats['total']
            return stats
    
    def check_incomplete_onboardings(self) -> List[Dict[str, Any]]:
        """
        Identifie les comptes avec onboarding incomplet.
        
        Returns:
            Liste des comptes à problèmes
        """
        incomplete_accounts = []
        
        try:
            with db_service.get_session() as session:
                from .database import DBCreatorAccount
                accounts = session.query(DBCreatorAccount).filter_by(
                    onboarding_completed=False
                ).all()
                
                for account in accounts:
                    try:
                        status = self.connect_manager.get_account_status(account.stripe_account_id)
                        
                        if status['requirements']['has_blocking_requirements']:
                            incomplete_accounts.append({
                                'creator_id': account.creator_id,
                                'stripe_account_id': account.stripe_account_id,
                                'email': account.email,
                                'requirements': status['requirements'],
                                'created_at': account.created_at.isoformat()
                            })
                    except Exception as e:
                        self.logger.error(f"Erreur vérification compte {account.stripe_account_id}: {e}")
                
                return incomplete_accounts
                
        except Exception as e:
            self.logger.error(f"Erreur vérification onboardings: {e}")
            return []


# Instance globale du gestionnaire
connect_manager = None


def init_stripe_connect_manager(app):
    """Initialise le gestionnaire Stripe Connect."""
    global connect_manager
    connect_manager = StripeConnectManager(app.config.get('STRIPE_SECRET_KEY'))
    return connect_manager


if __name__ == "__main__":
    # Tests du gestionnaire Stripe Connect
    manager = StripeConnectManager()
    
    print("=== Tests du gestionnaire Stripe Connect ===\n")
    
    # Test de création de compte (nécessite une vraie clé Stripe)
    try:
        account_data = manager.create_express_account(
            email="creator.test@example.com",
            country="FR"
        )
        print(f"Compte créé: {account_data['account_id']}")
        
        # Test de récupération du statut
        status = manager.get_account_status(account_data['account_id'])
        print(f"Statut: {status['onboarding_status']}")
        print(f"Requirements: {status['requirements']['total_requirements']}")
        
    except Exception as e:
        print(f"Erreur lors des tests: {e}")