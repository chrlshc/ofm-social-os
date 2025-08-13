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
    
    def create_payment_intent(
        self,
        amount_euros: float,
        connected_account_id: str,
        fan_id: str,
        monthly_revenue_cents: int = 0,
        currency: str = 'eur',
        metadata: Optional[Dict[str, str]] = None
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
            
        Returns:
            Dictionnaire avec les détails du PaymentIntent
        """
        try:
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
            
            # Création du PaymentIntent
            payment_intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency,
                payment_method_types=['card'],
                application_fee_amount=fee_cents,
                transfer_data={
                    'destination': connected_account_id
                },
                metadata=payment_metadata,
                description=f"Paiement OFM - Fan {fan_id}"
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
                'status': payment_intent.status
            }
            
        except stripe.error.StripeError as e:
            self.logger.error(f"Erreur Stripe lors de la création du PaymentIntent: {e}")
            raise
        except Exception as e:
            self.logger.error(f"Erreur lors de la création du PaymentIntent: {e}")
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