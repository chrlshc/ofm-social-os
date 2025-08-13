"""
API Flask pour le système de paiement OFM avec commission dégressive.
Fournit les endpoints pour créer des paiements, gérer les webhooks et consulter les statistiques.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from uuid import uuid4

from flask import Flask, request, jsonify, abort
from flask_cors import CORS
import stripe

from .stripe_service import StripePaymentService, format_stripe_error
from .commission_calculator import CommissionCalculator
from .models import (
    PaymentRequest, PaymentResponse, Transaction, TransactionStatus,
    CreatorAccount, AccountStatus, create_transaction_id
)


# Configuration de l'application Flask
def create_app(config: Optional[Dict[str, Any]] = None) -> Flask:
    """Factory pour créer l'application Flask."""
    
    app = Flask(__name__)
    
    # Configuration par défaut
    app.config.update({
        'SECRET_KEY': os.getenv('FLASK_SECRET_KEY', 'dev-secret-key'),
        'STRIPE_SECRET_KEY': os.getenv('STRIPE_SECRET_KEY'),
        'STRIPE_WEBHOOK_SECRET': os.getenv('STRIPE_WEBHOOK_SECRET'),
        'DATABASE_URL': os.getenv('DATABASE_URL', 'sqlite:///payments.db'),
        'DEBUG': os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    })
    
    if config:
        app.config.update(config)
    
    # Configuration CORS
    CORS(app, origins=['http://localhost:3000', 'https://votre-domain.com'])
    
    # Vérification des variables d'environnement requises
    if not app.config['STRIPE_SECRET_KEY']:
        raise ValueError("STRIPE_SECRET_KEY est requis")
    
    if not app.config['STRIPE_WEBHOOK_SECRET']:
        app.logger.warning("STRIPE_WEBHOOK_SECRET non défini - les webhooks ne fonctionneront pas")
    
    return app


app = create_app()

# Services
stripe_service = StripePaymentService(app.config['STRIPE_SECRET_KEY'])
commission_calculator = CommissionCalculator()

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Base de données simulée (à remplacer par une vraie DB)
# TODO: Remplacer par SQLAlchemy ou un autre ORM
class MockDatabase:
    """Base de données simulée pour les tests."""
    
    def __init__(self):
        self.transactions = {}
        self.monthly_revenues = {}
        self.creator_accounts = {}
    
    def get_monthly_revenue(self, creator_id: str, year: int, month: int) -> int:
        """Récupère le revenu mensuel en centimes."""
        key = f"{creator_id}_{year:04d}_{month:02d}"
        return self.monthly_revenues.get(key, 0)
    
    def update_monthly_revenue(self, creator_id: str, year: int, month: int, amount_cents: int):
        """Met à jour le revenu mensuel."""
        key = f"{creator_id}_{year:04d}_{month:02d}"
        self.monthly_revenues[key] = self.monthly_revenues.get(key, 0) + amount_cents
    
    def save_transaction(self, transaction: Transaction):
        """Sauvegarde une transaction."""
        self.transactions[transaction.id] = transaction
    
    def get_transaction(self, transaction_id: str) -> Optional[Transaction]:
        """Récupère une transaction."""
        return self.transactions.get(transaction_id)
    
    def get_creator_account(self, creator_id: str) -> Optional[CreatorAccount]:
        """Récupère un compte créatrice."""
        return self.creator_accounts.get(creator_id)
    
    def save_creator_account(self, account: CreatorAccount):
        """Sauvegarde un compte créatrice."""
        self.creator_accounts[account.creator_id] = account


db = MockDatabase()


# Endpoints API
@app.route('/health', methods=['GET'])
def health_check():
    """Vérification de santé de l'API."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'version': '1.0.0'
    })


@app.route('/payments', methods=['POST'])
def create_payment():
    """
    Crée un nouveau paiement avec commission dégressive.
    
    Body:
    {
        "fan_id": "fan_123",
        "creator_id": "creator_456",
        "amount_euros": 250.0,
        "currency": "eur",
        "metadata": {}
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Body JSON requis'}), 400
        
        # Validation de la demande
        payment_request = PaymentRequest(
            fan_id=data.get('fan_id'),
            creator_id=data.get('creator_id'),
            amount_euros=float(data.get('amount_euros', 0)),
            currency=data.get('currency', 'eur'),
            metadata=data.get('metadata', {})
        )
        
        validation_errors = payment_request.validate()
        if validation_errors:
            return jsonify({
                'error': 'Données invalides',
                'details': validation_errors
            }), 400
        
        # Vérification du compte créatrice
        creator_account = db.get_creator_account(payment_request.creator_id)
        if not creator_account:
            return jsonify({
                'error': 'Compte créatrice non trouvé',
                'creator_id': payment_request.creator_id
            }), 404
        
        if not creator_account.is_active:
            return jsonify({
                'error': 'Compte créatrice inactif',
                'creator_id': payment_request.creator_id,
                'account_status': creator_account.account_status.value
            }), 400
        
        # Récupération du revenu mensuel actuel
        now = datetime.now(timezone.utc)
        monthly_revenue_cents = db.get_monthly_revenue(
            payment_request.creator_id, 
            now.year, 
            now.month
        )
        
        # Création du PaymentIntent via Stripe
        payment_result = stripe_service.create_payment_intent(
            amount_euros=payment_request.amount_euros,
            connected_account_id=creator_account.stripe_account_id,
            fan_id=payment_request.fan_id,
            monthly_revenue_cents=monthly_revenue_cents,
            currency=payment_request.currency,
            metadata={
                **payment_request.metadata,
                'creator_id': payment_request.creator_id
            }
        )
        
        # Création de la transaction locale
        transaction = Transaction(
            id=create_transaction_id(),
            fan_id=payment_request.fan_id,
            creator_id=payment_request.creator_id,
            amount_cents=payment_result['amount_cents'],
            fee_cents=payment_result['fee_cents'],
            net_amount_cents=payment_result['net_amount_cents'],
            currency=payment_request.currency,
            status=TransactionStatus.PENDING,
            stripe_payment_intent_id=payment_result['payment_intent_id'],
            stripe_connected_account_id=creator_account.stripe_account_id,
            monthly_revenue_before_cents=monthly_revenue_cents,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            metadata=payment_request.metadata
        )
        
        db.save_transaction(transaction)
        
        logger.info(
            f"Paiement créé: {transaction.id}, "
            f"Montant: {payment_request.amount_euros}€, "
            f"Commission: {payment_result['fee_euros']:.2f}€"
        )
        
        # Réponse
        response = PaymentResponse(
            success=True,
            payment_intent_id=payment_result['payment_intent_id'],
            client_secret=payment_result['client_secret'],
            amount_cents=payment_result['amount_cents'],
            fee_cents=payment_result['fee_cents'],
            net_amount_cents=payment_result['net_amount_cents'],
            commission_breakdown=payment_result['commission_breakdown']
        )
        
        return jsonify(response.to_dict()), 201
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur Stripe: {e}")
        return jsonify({
            'error': 'Erreur de paiement',
            'details': format_stripe_error(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Erreur lors de la création du paiement: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


@app.route('/payments/<payment_intent_id>', methods=['GET'])
def get_payment(payment_intent_id: str):
    """Récupère les détails d'un paiement."""
    try:
        # Recherche de la transaction locale
        transaction = None
        for t in db.transactions.values():
            if t.stripe_payment_intent_id == payment_intent_id:
                transaction = t
                break
        
        if not transaction:
            return jsonify({'error': 'Transaction non trouvée'}), 404
        
        # Récupération des détails Stripe
        stripe_details = stripe_service.retrieve_payment_intent(payment_intent_id)
        
        # Mise à jour du statut si nécessaire
        stripe_status = stripe_details['status']
        if stripe_status == 'succeeded' and transaction.status != TransactionStatus.SUCCEEDED:
            transaction.status = TransactionStatus.SUCCEEDED
            transaction.updated_at = datetime.now(timezone.utc)
            db.save_transaction(transaction)
            
            # Mise à jour du revenu mensuel
            now = datetime.now(timezone.utc)
            db.update_monthly_revenue(
                transaction.creator_id,
                now.year,
                now.month,
                transaction.amount_cents
            )
        
        return jsonify({
            'transaction': transaction.to_dict(),
            'stripe_details': stripe_details
        }), 200
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur Stripe: {e}")
        return jsonify({
            'error': 'Erreur lors de la récupération du paiement',
            'details': format_stripe_error(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du paiement: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


@app.route('/payments/<payment_intent_id>/cancel', methods=['POST'])
def cancel_payment(payment_intent_id: str):
    """Annule un paiement."""
    try:
        # Annulation via Stripe
        cancellation_result = stripe_service.cancel_payment_intent(payment_intent_id)
        
        # Mise à jour de la transaction locale
        for transaction in db.transactions.values():
            if transaction.stripe_payment_intent_id == payment_intent_id:
                transaction.status = TransactionStatus.CANCELED
                transaction.updated_at = datetime.now(timezone.utc)
                db.save_transaction(transaction)
                break
        
        return jsonify(cancellation_result), 200
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur Stripe lors de l'annulation: {e}")
        return jsonify({
            'error': 'Erreur lors de l\'annulation',
            'details': format_stripe_error(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Erreur lors de l'annulation: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


@app.route('/webhook/stripe', methods=['POST'])
def stripe_webhook():
    """Gère les webhooks Stripe."""
    payload = request.data
    signature = request.headers.get('Stripe-Signature')
    
    if not app.config['STRIPE_WEBHOOK_SECRET']:
        logger.warning("Webhook secret non configuré")
        return jsonify({'error': 'Webhook non configuré'}), 400
    
    try:
        event = stripe.Webhook.construct_event(
            payload, 
            signature, 
            app.config['STRIPE_WEBHOOK_SECRET']
        )
        
        logger.info(f"Webhook reçu: {event['type']}")
        
        # Traitement des événements
        if event['type'] == 'payment_intent.succeeded':
            payment_intent = event['data']['object']
            
            # Mise à jour de la transaction
            for transaction in db.transactions.values():
                if transaction.stripe_payment_intent_id == payment_intent['id']:
                    transaction.status = TransactionStatus.SUCCEEDED
                    transaction.updated_at = datetime.now(timezone.utc)
                    db.save_transaction(transaction)
                    
                    # Mise à jour du revenu mensuel
                    now = datetime.now(timezone.utc)
                    db.update_monthly_revenue(
                        transaction.creator_id,
                        now.year,
                        now.month,
                        transaction.amount_cents
                    )
                    
                    logger.info(f"Transaction confirmée: {transaction.id}")
                    break
        
        elif event['type'] == 'payment_intent.payment_failed':
            payment_intent = event['data']['object']
            
            # Mise à jour de la transaction
            for transaction in db.transactions.values():
                if transaction.stripe_payment_intent_id == payment_intent['id']:
                    transaction.status = TransactionStatus.FAILED
                    transaction.updated_at = datetime.now(timezone.utc)
                    db.save_transaction(transaction)
                    
                    logger.info(f"Transaction échouée: {transaction.id}")
                    break
        
        return jsonify({'status': 'success'}), 200
        
    except stripe.error.SignatureVerificationError:
        logger.error("Signature webhook invalide")
        return jsonify({'error': 'Signature invalide'}), 400
        
    except Exception as e:
        logger.error(f"Erreur lors du traitement du webhook: {e}")
        return jsonify({'error': 'Erreur interne'}), 500


@app.route('/creators/<creator_id>/account', methods=['POST'])
def create_creator_account(creator_id: str):
    """Crée un compte Stripe Connect pour une créatrice."""
    try:
        data = request.get_json()
        if not data or not data.get('email'):
            return jsonify({'error': 'Email requis'}), 400
        
        email = data['email']
        country = data.get('country', 'FR')
        
        # Vérification si le compte existe déjà
        existing_account = db.get_creator_account(creator_id)
        if existing_account:
            return jsonify({
                'error': 'Compte déjà existant',
                'account': existing_account.to_dict()
            }), 409
        
        # Création du compte Stripe
        stripe_account = stripe_service.create_connected_account(email, country)
        
        # Création du compte local
        account = CreatorAccount(
            creator_id=creator_id,
            email=email,
            stripe_account_id=stripe_account['account_id'],
            account_status=AccountStatus.INCOMPLETE,
            charges_enabled=stripe_account['charges_enabled'],
            payouts_enabled=stripe_account['payouts_enabled'],
            details_submitted=stripe_account['details_submitted'],
            country=country,
            currency='eur',
            onboarding_completed=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        db.save_creator_account(account)
        
        logger.info(f"Compte créé pour {creator_id}: {stripe_account['account_id']}")
        
        return jsonify({
            'account': account.to_dict(),
            'stripe_details': stripe_account
        }), 201
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur Stripe: {e}")
        return jsonify({
            'error': 'Erreur lors de la création du compte',
            'details': format_stripe_error(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Erreur lors de la création du compte: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


@app.route('/creators/<creator_id>/revenue/<int:year>/<int:month>', methods=['GET'])
def get_monthly_revenue(creator_id: str, year: int, month: int):
    """Récupère le revenu mensuel d'une créatrice."""
    try:
        revenue_cents = db.get_monthly_revenue(creator_id, year, month)
        
        # Calcul des statistiques
        estimation = commission_calculator.estimate_monthly_fees(revenue_cents)
        
        return jsonify({
            'creator_id': creator_id,
            'year': year,
            'month': month,
            'revenue_cents': revenue_cents,
            'revenue_euros': revenue_cents / 100,
            'estimated_fees': estimation
        }), 200
        
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du revenu: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


@app.route('/commission/estimate', methods=['POST'])
def estimate_commission():
    """Estime la commission pour un montant donné."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Body JSON requis'}), 400
        
        amount_euros = float(data.get('amount_euros', 0))
        monthly_revenue_euros = float(data.get('monthly_revenue_euros', 0))
        
        if amount_euros <= 0:
            return jsonify({'error': 'Montant invalide'}), 400
        
        amount_cents = int(amount_euros * 100)
        monthly_revenue_cents = int(monthly_revenue_euros * 100)
        
        fee_cents = commission_calculator.calculate_fee(amount_cents, monthly_revenue_cents)
        breakdown = commission_calculator.get_tier_breakdown(amount_cents, monthly_revenue_cents)
        
        return jsonify({
            'amount_euros': amount_euros,
            'monthly_revenue_euros': monthly_revenue_euros,
            'fee_cents': fee_cents,
            'fee_euros': fee_cents / 100,
            'net_amount_euros': amount_euros - (fee_cents / 100),
            'effective_rate': (fee_cents / amount_cents * 100) if amount_cents > 0 else 0,
            'tier_breakdown': breakdown
        }), 200
        
    except ValueError:
        return jsonify({'error': 'Montants invalides'}), 400
        
    except Exception as e:
        logger.error(f"Erreur lors de l'estimation: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


# Gestion des erreurs
@app.errorhandler(404)
def not_found(error):
    """Gestion des erreurs 404."""
    return jsonify({
        'error': 'Endpoint non trouvé',
        'path': request.path
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Gestion des erreurs 500."""
    logger.error(f"Erreur interne: {error}")
    return jsonify({
        'error': 'Erreur interne du serveur'
    }), 500


if __name__ == '__main__':
    # Configuration pour le développement
    app.run(
        debug=app.config['DEBUG'],
        host='0.0.0.0',
        port=int(os.getenv('PORT', 5000))
    )