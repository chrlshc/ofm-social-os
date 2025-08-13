"""
Service d'intégration Stripe Connect pour le système de paiement OFM.
Gère la création de PaymentIntents avec application de commissions dégressives.
"""

import os
import logging
from typing import Dict, Optional, Any
from datetime import datetime, timezone
import stripe

from .commission_calculator import CommissionCalculator
from .retry_service import with_payment_retry, with_connect_retry, RetryService


class StripePaymentService:
    """Service de gestion des paiements via Stripe Connect."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialise le service Stripe.
        
        Args:
            api_key: Clé API Stripe (utilise STRIPE_SECRET_KEY par défaut)
        """
        self.api_key = api_key or os.getenv('STRIPE_SECRET_KEY')
        if not self.api_key:
            raise ValueError("Clé API Stripe manquante. Définissez STRIPE_SECRET_KEY.")
        
        stripe.api_key = self.api_key
        self.commission_calculator = CommissionCalculator()
        self.logger = logging.getLogger(__name__)
        self.retry_service = RetryService()
    
    @with_payment_retry
    def create_payment_intent(
        self,
        amount_euros: float,
        connected_account_id: str,
        fan_id: str,
        monthly_revenue_cents: int = 0,
        currency: str = 'eur',
        metadata: Optional[Dict[str, str]] = None,
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Crée un PaymentIntent avec commission dégressive.
        
        Args:
            amount_euros: Montant en euros
            connected_account_id: ID du compte Stripe Connect de la créatrice
            fan_id: ID du fan effectuant le paiement
            monthly_revenue_cents: Revenu mensuel déjà généré en centimes
            currency: Devise (défaut: EUR)
            metadata: Métadonnées additionnelles
            idempotency_key: Clé d'idempotence pour éviter les doublons
            
        Returns:
            Dictionnaire avec les détails du PaymentIntent
        """
        try:
            # Validation des entrées
            if amount_euros <= 0:
                raise ValueError("Le montant doit être positif")
            
            if not connected_account_id or not connected_account_id.startswith('acct_'):
                raise ValueError("ID de compte Connect invalide")
            
            amount_cents = int(amount_euros * 100)
            
            # Calcul de la commission
            fee_cents = self.commission_calculator.calculate_fee(
                amount_cents, 
                monthly_revenue_cents
            )
            
            # Métadonnées par défaut
            payment_metadata = {
                'fan_id': fan_id,
                'monthly_revenue_before': str(monthly_revenue_cents),
                'calculated_fee': str(fee_cents),
                'service': 'ofm_payment',
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            if metadata:
                payment_metadata.update(metadata)
            
            # Générer une clé d'idempotence si non fournie
            if not idempotency_key:
                import uuid
                idempotency_key = f"pi_{uuid.uuid4().hex[:16]}_{fan_id}_{int(datetime.now().timestamp())}"
            
            # Paramètres pour PaymentIntent avec idempotency et SCA
            create_params = {
                'amount': amount_cents,
                'currency': currency,
                'payment_method_types': ['card'],
                'application_fee_amount': fee_cents,
                'transfer_data': {
                    'destination': connected_account_id
                },
                'metadata': payment_metadata,
                'description': f"Paiement OFM - Fan {fan_id}",
                # Configuration SCA/3D Secure pour l'Europe
                'confirmation_method': 'manual',
                'capture_method': 'automatic',
                'setup_future_usage': 'off_session',  # Pour futurs paiements sans présence
            }
            
            # Création du PaymentIntent avec idempotency
            payment_intent = stripe.PaymentIntent.create(
                **create_params,
                idempotency_key=idempotency_key
            )
            
            # Détail de la commission pour transparence
            commission_breakdown = self.commission_calculator.get_tier_breakdown(
                amount_cents, 
                monthly_revenue_cents
            )
            
            self.logger.info(
                f"PaymentIntent créé: {payment_intent.id}, "
                f"Montant: {amount_euros}€, Commission: {fee_cents/100:.2f}€"
            )
            
            return {
                'payment_intent_id': payment_intent.id,
                'client_secret': payment_intent.client_secret,
                'amount_cents': amount_cents,
                'amount_euros': amount_euros,
                'fee_cents': fee_cents,
                'fee_euros': fee_cents / 100,
                'net_amount_cents': amount_cents - fee_cents,
                'net_amount_euros': (amount_cents - fee_cents) / 100,
                'connected_account': connected_account_id,
                'commission_breakdown': commission_breakdown,
                'status': payment_intent.status,
                'idempotency_key': idempotency_key,
                'requires_action': payment_intent.status == 'requires_action',
                'next_action': payment_intent.next_action
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de la création du PaymentIntent: {e}")
            raise
        except Exception as e:
            self.logger.error(f"Erreur lors de la création du PaymentIntent: {e}")
            raise
    
    def confirm_payment_intent(
        self,
        payment_intent_id: str,
        payment_method_id: Optional[str] = None,
        return_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Confirme un PaymentIntent avec gestion SCA/3D Secure.
        
        Args:
            payment_intent_id: ID du PaymentIntent à confirmer
            payment_method_id: ID de la méthode de paiement (optionnel si déjà attachée)
            return_url: URL de retour après 3D Secure
            
        Returns:
            Statut de confirmation avec actions requises si applicable
        """
        try:
            confirm_params = {}
            
            if payment_method_id:
                confirm_params['payment_method'] = payment_method_id
            
            if return_url:
                confirm_params['return_url'] = return_url
            
            # Confirmation du PaymentIntent
            payment_intent = stripe.PaymentIntent.confirm(
                payment_intent_id,
                **confirm_params
            )
            
            result = {
                'payment_intent_id': payment_intent.id,
                'status': payment_intent.status,
                'requires_action': payment_intent.status == 'requires_action',
                'client_secret': payment_intent.client_secret
            }
            
            # Gestion des actions requises (3D Secure, etc.)
            if payment_intent.status == 'requires_action':
                if payment_intent.next_action.type == 'use_stripe_sdk':
                    result['next_action'] = {
                        'type': 'use_stripe_sdk',
                        'use_stripe_sdk': payment_intent.next_action.use_stripe_sdk
                    }
                elif payment_intent.next_action.type == 'redirect_to_url':
                    result['next_action'] = {
                        'type': 'redirect_to_url',
                        'redirect_to_url': payment_intent.next_action.redirect_to_url
                    }
            
            # Paiement réussi
            elif payment_intent.status == 'succeeded':
                result['charge_id'] = payment_intent.charges.data[0].id if payment_intent.charges.data else None
                result['receipt_url'] = payment_intent.charges.data[0].receipt_url if payment_intent.charges.data else None
            
            # Paiement échoué
            elif payment_intent.status in ['requires_payment_method', 'canceled']:
                result['last_payment_error'] = payment_intent.last_payment_error
            
            self.logger.info(f"PaymentIntent confirmé: {payment_intent_id}, status: {payment_intent.status}")
            
            return result
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de la confirmation du PaymentIntent: {e}")
            raise
    
    def handle_off_session_payment(
        self,
        amount_euros: float,
        connected_account_id: str,
        customer_id: str,
        payment_method_id: str,
        monthly_revenue_cents: int = 0,
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Gère un paiement off-session (sans présence du client).
        Utilisé pour les abonnements ou paiements récurrents.
        
        Args:
            amount_euros: Montant en euros
            connected_account_id: ID du compte Stripe Connect
            customer_id: ID du customer Stripe
            payment_method_id: ID de la méthode de paiement sauvegardée
            monthly_revenue_cents: Revenu mensuel pour calcul commission
            idempotency_key: Clé d'idempotence
            
        Returns:
            Résultat du paiement off-session
        """
        try:
            amount_cents = int(amount_euros * 100)
            
            # Calcul de la commission
            fee_cents = self.commission_calculator.calculate_fee(
                amount_cents, 
                monthly_revenue_cents
            )
            
            # Générer une clé d'idempotence si non fournie
            if not idempotency_key:
                import uuid
                idempotency_key = f"off_{uuid.uuid4().hex[:16]}_{customer_id}_{int(datetime.now().timestamp())}"
            
            # Création PaymentIntent off-session
            payment_intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency='eur',
                customer=customer_id,
                payment_method=payment_method_id,
                application_fee_amount=fee_cents,
                transfer_data={'destination': connected_account_id},
                confirmation_method='automatic',
                confirm=True,
                off_session=True,  # Paiement sans présence client
                metadata={
                    'type': 'off_session',
                    'customer_id': customer_id,
                    'monthly_revenue_before': str(monthly_revenue_cents),
                    'calculated_fee': str(fee_cents),
                    'timestamp': datetime.now(timezone.utc).isoformat()
                },
                idempotency_key=idempotency_key
            )
            
            result = {
                'payment_intent_id': payment_intent.id,
                'status': payment_intent.status,
                'amount_cents': amount_cents,
                'fee_cents': fee_cents,
                'idempotency_key': idempotency_key,
                'off_session': True
            }
            
            if payment_intent.status == 'succeeded':
                result['charge_id'] = payment_intent.charges.data[0].id
                self.logger.info(f"Paiement off-session réussi: {payment_intent.id}")
            else:
                result['requires_action'] = True
                result['client_secret'] = payment_intent.client_secret
                self.logger.warning(f"Paiement off-session nécessite une action: {payment_intent.id}")
            
            return result
            
        except stripe.error.CardError as e:
            # Carte refusée - gestion spécifique
            self.logger.warning(f"Carte refusée pour paiement off-session: {e}")
            return {
                'status': 'failed',
                'error_type': 'card_error',
                'error_code': e.code,
                'error_message': e.user_message,
                'decline_code': e.decline_code
            }
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe paiement off-session: {e}")
            raise
    
    def retrieve_payment_intent(self, payment_intent_id: str) -> Dict[str, Any]:
        """
        Récupère les détails d'un PaymentIntent.
        
        Args:
            payment_intent_id: ID du PaymentIntent
            
        Returns:
            Détails du PaymentIntent
        """
        try:
            payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            
            return {
                'id': payment_intent.id,
                'amount_cents': payment_intent.amount,
                'amount_euros': payment_intent.amount / 100,
                'fee_cents': payment_intent.application_fee_amount or 0,
                'fee_euros': (payment_intent.application_fee_amount or 0) / 100,
                'status': payment_intent.status,
                'currency': payment_intent.currency,
                'metadata': payment_intent.metadata,
                'created': payment_intent.created,
                'charges': [
                    {
                        'id': charge.id,
                        'status': charge.status,
                        'paid': charge.paid,
                        'amount': charge.amount,
                        'fee_details': charge.application_fee_amount
                    }
                    for charge in payment_intent.charges.data
                ]
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de la récupération du PaymentIntent: {e}")
            raise
    
    def cancel_payment_intent(self, payment_intent_id: str) -> Dict[str, Any]:
        """
        Annule un PaymentIntent.
        
        Args:
            payment_intent_id: ID du PaymentIntent à annuler
            
        Returns:
            Statut de l'annulation
        """
        try:
            payment_intent = stripe.PaymentIntent.cancel(payment_intent_id)
            
            self.logger.info(f"PaymentIntent annulé: {payment_intent_id}")
            
            return {
                'id': payment_intent.id,
                'status': payment_intent.status,
                'cancellation_reason': payment_intent.cancellation_reason
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de l'annulation du PaymentIntent: {e}")
            raise
    
    @with_connect_retry
    def create_connected_account(
        self,
        email: str,
        country: str = 'FR',
        account_type: str = 'express'
    ) -> Dict[str, Any]:
        """
        Crée un compte Stripe Connect pour une créatrice.
        
        Args:
            email: Email de la créatrice
            country: Code pays (défaut: FR)
            account_type: Type de compte (express, standard, custom)
            
        Returns:
            Détails du compte créé
        """
        try:
            account = stripe.Account.create(
                type=account_type,
                country=country,
                email=email,
                capabilities={
                    'card_payments': {'requested': True},
                    'transfers': {'requested': True}
                }
            )
            
            self.logger.info(f"Compte Connect créé: {account.id} pour {email}")
            
            return {
                'account_id': account.id,
                'email': email,
                'country': country,
                'type': account_type,
                'charges_enabled': account.charges_enabled,
                'payouts_enabled': account.payouts_enabled,
                'details_submitted': account.details_submitted
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de la création du compte Connect: {e}")
            raise
    
    def create_account_link(
        self,
        account_id: str,
        refresh_url: str,
        return_url: str,
        link_type: str = 'account_onboarding'
    ) -> str:
        """
        Crée un lien d'onboarding pour un compte Connect.
        
        Args:
            account_id: ID du compte Connect
            refresh_url: URL de rafraîchissement
            return_url: URL de retour après onboarding
            link_type: Type de lien
            
        Returns:
            URL d'onboarding
        """
        try:
            account_link = stripe.AccountLink.create(
                account=account_id,
                refresh_url=refresh_url,
                return_url=return_url,
                type=link_type
            )
            
            return account_link.url
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de la création du lien d'onboarding: {e}")
            raise
    
    def get_account_status(self, account_id: str) -> Dict[str, Any]:
        """
        Récupère le statut d'un compte Connect.
        
        Args:
            account_id: ID du compte Connect
            
        Returns:
            Statut du compte
        """
        try:
            account = stripe.Account.retrieve(account_id)
            
            return {
                'account_id': account.id,
                'charges_enabled': account.charges_enabled,
                'payouts_enabled': account.payouts_enabled,
                'details_submitted': account.details_submitted,
                'requirements': {
                    'currently_due': account.requirements.currently_due,
                    'eventually_due': account.requirements.eventually_due,
                    'past_due': account.requirements.past_due,
                    'pending_verification': account.requirements.pending_verification
                } if account.requirements else None
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de la récupération du statut du compte: {e}")
            raise
    
    def configure_payout_schedule(
        self,
        account_id: str,
        interval: str = 'weekly',  # 'daily', 'weekly', 'monthly'
        weekly_anchor: Optional[str] = None,  # 'monday', 'tuesday', etc.
        monthly_anchor: Optional[int] = None  # 1-31 for monthly
    ) -> Dict[str, Any]:
        """
        Configure le planning de virements pour un compte Connect.
        
        Args:
            account_id: ID du compte Connect
            interval: Fréquence des virements ('daily', 'weekly', 'monthly')
            weekly_anchor: Jour de la semaine pour interval='weekly'
            monthly_anchor: Jour du mois pour interval='monthly'
            
        Returns:
            Configuration des virements
        """
        try:
            settings = {
                'interval': interval
            }
            
            if interval == 'weekly' and weekly_anchor:
                settings['weekly_anchor'] = weekly_anchor
            elif interval == 'monthly' and monthly_anchor:
                settings['monthly_anchor'] = monthly_anchor
            
            # Mise à jour du compte avec les paramètres de virement
            account = stripe.Account.modify(
                account_id,
                settings={
                    'payouts': {
                        'schedule': settings
                    }
                }
            )
            
            self.logger.info(f"Payout schedule configuré pour {account_id}: {interval}")
            
            return {
                'account_id': account_id,
                'payout_schedule': {
                    'interval': settings['interval'],
                    'weekly_anchor': settings.get('weekly_anchor'),
                    'monthly_anchor': settings.get('monthly_anchor')
                },
                'status': 'configured'
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur configuration payout schedule: {e}")
            raise
    
    def get_payout_schedule(self, account_id: str) -> Dict[str, Any]:
        """
        Récupère la configuration actuelle des virements.
        
        Args:
            account_id: ID du compte Connect
            
        Returns:
            Configuration actuelle des virements
        """
        try:
            account = stripe.Account.retrieve(account_id)
            
            payout_settings = account.settings.payouts if account.settings else None
            
            if payout_settings and payout_settings.schedule:
                schedule = payout_settings.schedule
                return {
                    'account_id': account_id,
                    'interval': schedule.interval,
                    'weekly_anchor': getattr(schedule, 'weekly_anchor', None),
                    'monthly_anchor': getattr(schedule, 'monthly_anchor', None),
                    'delay_days': getattr(schedule, 'delay_days', None)
                }
            else:
                return {
                    'account_id': account_id,
                    'interval': 'default',  # Géré par Stripe Express Dashboard
                    'message': 'Schedule géré par le créateur via Dashboard Express'
                }
                
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur récupération payout schedule: {e}")
            raise
    
    @with_payment_retry
    def create_checkout_session(
        self,
        amount_euros: float,
        connected_account_id: str,
        success_url: str,
        cancel_url: str,
        customer_email: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Crée une session Checkout avec idempotency pour éviter les doublons.
        
        Args:
            amount_euros: Montant en euros
            connected_account_id: ID du compte Connect de destination
            success_url: URL de succès
            cancel_url: URL d'annulation
            customer_email: Email du client (optionnel)
            metadata: Métadonnées additionnelles
            idempotency_key: Clé d'idempotence
            
        Returns:
            Détails de la session Checkout
        """
        try:
            amount_cents = int(amount_euros * 100)
            
            # Calcul de la commission (supposons revenu moyen)
            fee_cents = self.commission_calculator.calculate_fee(amount_cents, 0)
            
            # Générer une clé d'idempotence si non fournie
            if not idempotency_key:
                import uuid
                idempotency_key = f"cs_{uuid.uuid4().hex[:16]}_{int(datetime.now().timestamp())}"
            
            # Métadonnées par défaut
            checkout_metadata = {
                'service': 'ofm_checkout',
                'calculated_fee': str(fee_cents),
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            if metadata:
                checkout_metadata.update(metadata)
            
            # Paramètres pour Checkout Session
            session_params = {
                'payment_method_types': ['card'],
                'line_items': [{
                    'price_data': {
                        'currency': 'eur',
                        'product_data': {
                            'name': 'Contenu Premium OFM'
                        },
                        'unit_amount': amount_cents,
                    },
                    'quantity': 1,
                }],
                'mode': 'payment',
                'success_url': success_url,
                'cancel_url': cancel_url,
                'payment_intent_data': {
                    'application_fee_amount': fee_cents,
                    'transfer_data': {
                        'destination': connected_account_id
                    },
                    'metadata': checkout_metadata
                },
                'metadata': checkout_metadata
            }
            
            if customer_email:
                session_params['customer_email'] = customer_email
            
            # Création de la session avec idempotency
            session = stripe.checkout.Session.create(
                **session_params,
                idempotency_key=idempotency_key
            )
            
            self.logger.info(f"Checkout session créée: {session.id}, montant: {amount_euros}€")
            
            return {
                'checkout_session_id': session.id,
                'checkout_url': session.url,
                'amount_cents': amount_cents,
                'amount_euros': amount_euros,
                'fee_cents': fee_cents,
                'fee_euros': fee_cents / 100,
                'connected_account': connected_account_id,
                'idempotency_key': idempotency_key,
                'expires_at': session.expires_at
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur création Checkout session: {e}")
            raise


# Fonction utilitaire pour formater les erreurs Stripe
def format_stripe_error(error: stripe.error.StripeError) -> Dict[str, Any]:
    """
    Formate une erreur Stripe pour l'API.
    
    Args:
        error: Exception Stripe
        
    Returns:
        Dictionnaire formaté de l'erreur
    """
    return {
        'type': error.__class__.__name__,
        'code': getattr(error, 'code', None),
        'param': getattr(error, 'param', None),
        'message': str(error),
        'user_message': getattr(error, 'user_message', None)
    }


# Configuration du logging
def setup_logging():
    """Configure le logging pour le service Stripe."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )


if __name__ == "__main__":
    # Test du service (nécessite une clé API Stripe valide)
    setup_logging()
    
    try:
        service = StripePaymentService()
        print("Service Stripe initialisé avec succès")
        
        # Test de calcul de commission
        calculator = CommissionCalculator()
        fee = calculator.calculate_fee(300_000, 150_000)  # 3000€ avec 1500€ déjà généré
        print(f"Commission calculée: {fee/100:.2f}€")
        
    except Exception as e:
        print(f"Erreur lors du test: {e}")