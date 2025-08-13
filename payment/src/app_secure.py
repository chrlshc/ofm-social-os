"""
API Flask sécurisée pour le système de paiement OFM avec commission dégressive.
Intègre toutes les améliorations de sécurité identifiées lors de l'audit.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from decimal import Decimal

from flask import Flask, request, jsonify, abort
from dotenv import load_dotenv
import stripe

from .stripe_service import StripePaymentService, format_stripe_error
from .commission_calculator import CommissionCalculator
from .models import (
    PaymentRequest, PaymentResponse, TransactionStatus,
    AccountStatus, validate_monetary_amount
)
from .database import init_database, db_service
from .auth import init_auth, auth_service, require_auth, require_creator_access, create_auth_endpoints
from .security import (
    WebhookSecurity, SecurityUtils, get_rate_limiter, 
    require_secure_webhook, audit_log, setup_secure_cors, setup_security_headers
)

# Chargement des variables d'environnement
load_dotenv()


def create_secure_app(config: Optional[Dict[str, Any]] = None) -> Flask:
    """Factory sécurisée pour créer l'application Flask."""
    
    app = Flask(__name__)
    
    # Configuration sécurisée
    app.config.update({
        # Clés de sécurité
        'SECRET_KEY': os.getenv('FLASK_SECRET_KEY'),
        'JWT_SECRET_KEY': os.getenv('JWT_SECRET_KEY'),
        'STRIPE_SECRET_KEY': os.getenv('STRIPE_SECRET_KEY'),
        'STRIPE_WEBHOOK_SECRET': os.getenv('STRIPE_WEBHOOK_SECRET'),
        
        # Base de données
        'DATABASE_URL': os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/payments_db'),
        
        # Configuration sécurisée
        'ENV': os.getenv('FLASK_ENV', 'production'),
        'DEBUG': False,  # Toujours False en production
        'TESTING': False,
        
        # URLs autorisées
        'FRONTEND_URL': os.getenv('FRONTEND_URL', 'https://your-domain.com'),
        'ALLOWED_ORIGINS': [
            os.getenv('FRONTEND_URL', 'https://your-domain.com'),
            os.getenv('ADMIN_URL', 'https://admin.your-domain.com')
        ]
    })
    
    # Override avec configuration personnalisée
    if config:
        app.config.update(config)
    
    # Validation de la configuration en production
    if app.config['ENV'] == 'production':
        required_keys = [
            'SECRET_KEY', 'JWT_SECRET_KEY', 'STRIPE_SECRET_KEY', 
            'STRIPE_WEBHOOK_SECRET', 'DATABASE_URL'
        ]
        
        for key in required_keys:
            if not app.config.get(key) or app.config[key] == 'dev-secret-key-change-in-production':
                raise ValueError(f"Configuration de production invalide: {key} manquant ou non sécurisé")
    
    return app


# Création de l'application
app = create_secure_app()

# Configuration de la sécurité
setup_security_headers(app)
setup_secure_cors(app, app.config['ALLOWED_ORIGINS'])

# Initialisation des services
stripe_service = StripePaymentService(app.config['STRIPE_SECRET_KEY'])
commission_calculator = CommissionCalculator()
webhook_security = WebhookSecurity(app.config['STRIPE_WEBHOOK_SECRET'])
limiter = get_rate_limiter(app)

# Configuration du logging sécurisé
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('logs/payment_service.log') if os.path.exists('logs') else logging.NullHandler()
    ]
)
logger = logging.getLogger(__name__)

# Masquer les informations sensibles dans les logs
logging.getLogger('stripe').setLevel(logging.WARNING)

# Initialisation de la base de données et de l'authentification
with app.app_context():
    init_database(app)
    init_auth(app)
    create_auth_endpoints(app)


# Middleware de sécurité pour masquer les données sensibles
@app.before_request
def log_request_info():
    """Log sécurisé des requêtes."""
    if request.endpoint and request.endpoint != 'health':
        masked_data = SecurityUtils.mask_sensitive_data(request.get_json() or {})
        logger.info(
            f"Request {request.method} {request.path} from {request.remote_addr} "
            f"User-Agent: {request.headers.get('User-Agent', 'Unknown')[:100]}"
        )


# Endpoints publics (non authentifiés)
@app.route('/health', methods=['GET'])
def health_check():
    """Vérification de santé de l'API."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'version': '2.0.0'
    })


# Endpoints protégés
@app.route('/payments', methods=['POST'])
@limiter.limit("10 per minute")  # Rate limiting
@require_auth(['user', 'creator'])  # Authentification requise
@audit_log('create', 'payment')  # Log d'audit
def create_payment():
    """
    Crée un nouveau paiement avec commission dégressive.
    
    Sécurisé avec authentification JWT, validation stricte et audit.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Body JSON requis'}), 400
        
        # Validation sécurisée des données
        try:
            payment_request = PaymentRequest(
                fan_id=SecurityUtils.sanitize_input(data.get('fan_id', '')),
                creator_id=SecurityUtils.sanitize_input(data.get('creator_id', '')),
                amount_euros=validate_monetary_amount(data.get('amount_euros')),
                currency=SecurityUtils.sanitize_input(data.get('currency', 'eur')).lower(),
                metadata=data.get('metadata', {})
            )
        except Exception as e:
            logger.warning(f"Validation échouée pour create_payment: {e}")
            return jsonify({'error': f'Données invalides: {str(e)}'}), 400
        
        validation_errors = payment_request.validate()
        if validation_errors:
            return jsonify({
                'error': 'Données invalides',
                'details': validation_errors
            }), 400
        
        # Vérification des permissions (utilisateur peut payer pour n'importe quelle créatrice)
        # mais doit être authentifié
        
        # Vérification du compte créatrice
        creator_account = db_service.get_creator_account(payment_request.creator_id)
        if not creator_account:
            return jsonify({
                'error': 'Compte créatrice non trouvé',
                'creator_id': payment_request.creator_id
            }), 404
        
        if creator_account.account_status != AccountStatus.ACTIVE or not creator_account.charges_enabled:
            return jsonify({
                'error': 'Compte créatrice inactif',
                'creator_id': payment_request.creator_id
            }), 400
        
        # Récupération sécurisée du revenu mensuel
        now = datetime.now(timezone.utc)
        monthly_revenue_cents = db_service.get_monthly_revenue(
            payment_request.creator_id, 
            now.year, 
            now.month
        )
        
        # Création du paiement via Stripe avec métadonnées sécurisées
        secure_metadata = {
            'creator_id': payment_request.creator_id,
            'fan_id': payment_request.fan_id[:50],  # Limiter la longueur
            'service': 'ofm_payment_v2',
            'request_ip': request.remote_addr,
            'user_id': request.user_id
        }
        secure_metadata.update(payment_request.metadata)
        
        payment_result = stripe_service.create_payment_intent(
            amount_euros=float(payment_request.amount_euros),
            connected_account_id=creator_account.stripe_account_id,
            fan_id=payment_request.fan_id,
            monthly_revenue_cents=monthly_revenue_cents,
            currency=payment_request.currency,
            metadata=secure_metadata
        )
        
        # Création de la transaction en base de données
        transaction_data = {
            'fan_id': payment_request.fan_id,
            'creator_id': payment_request.creator_id,
            'amount_cents': payment_result['amount_cents'],
            'fee_cents': payment_result['fee_cents'],
            'net_amount_cents': payment_result['net_amount_cents'],
            'currency': payment_request.currency.upper(),
            'status': TransactionStatus.PENDING,
            'stripe_payment_intent_id': payment_result['payment_intent_id'],
            'stripe_connected_account_id': creator_account.stripe_account_id,
            'monthly_revenue_before_cents': monthly_revenue_cents,
            'metadata': secure_metadata
        }
        
        transaction = db_service.save_transaction(transaction_data)
        
        logger.info(
            f"Paiement créé par {request.user_id}: {transaction.id}, "
            f"Montant: {payment_request.amount_euros}€, "
            f"Commission: {payment_result['fee_euros']:.2f}€"
        )
        
        # Réponse sans données sensibles
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
        logger.error(f"Erreur Stripe pour utilisateur {request.user_id}: {e}")
        return jsonify({
            'error': 'Erreur de traitement du paiement',
            'details': format_stripe_error(e)
        }), 400
        
    except Exception as e:
        logger.error(f"Erreur lors de la création du paiement pour {request.user_id}: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


@app.route('/payments/<payment_intent_id>', methods=['GET'])
@limiter.limit("30 per minute")
@require_auth(['user', 'creator', 'admin'])
@audit_log('read', 'payment')
def get_payment(payment_intent_id: str):
    """Récupère les détails d'un paiement avec vérification d'autorisation."""
    try:
        # Sanitization de l'ID
        payment_intent_id = SecurityUtils.sanitize_input(payment_intent_id, 255)
        
        # Récupération de la transaction
        transaction = db_service.get_transaction_by_payment_intent(payment_intent_id)
        if not transaction:
            return jsonify({'error': 'Transaction non trouvée'}), 404
        
        # Vérification des autorisations
        user_role = request.user_role
        user_id = request.user_id
        
        # Les admins voient tout
        if user_role != 'admin':
            # Les créatrices ne voient que leurs transactions
            if user_role == 'creator' and transaction.creator_id != user_id:
                return jsonify({'error': 'Accès refusé'}), 403
            
            # Les utilisateurs ne voient que leurs propres paiements
            if user_role == 'user' and transaction.fan_id != user_id:
                return jsonify({'error': 'Accès refusé'}), 403
        
        # Récupération des détails Stripe (avec gestion d'erreur)
        try:
            stripe_details = stripe_service.retrieve_payment_intent(payment_intent_id)
        except stripe.error.StripeError:
            stripe_details = {'status': 'unavailable'}
        
        # Mise à jour du statut si nécessaire
        if stripe_details.get('status') == 'succeeded' and transaction.status != TransactionStatus.SUCCEEDED:
            db_service.update_transaction_status(transaction.id, TransactionStatus.SUCCEEDED)
            
            # Mise à jour du revenu mensuel
            now = datetime.now(timezone.utc)
            db_service.update_monthly_revenue(
                transaction.creator_id,
                now.year,
                now.month,
                transaction.amount_cents,
                transaction.fee_cents
            )
        
        # Réponse avec données masquées selon le rôle
        response_data = {
            'id': transaction.id,
            'amount_cents': transaction.amount_cents,
            'amount_euros': transaction.amount_cents / 100,
            'fee_cents': transaction.fee_cents,
            'fee_euros': transaction.fee_cents / 100,
            'net_amount_euros': transaction.net_amount_cents / 100,
            'currency': transaction.currency,
            'status': transaction.status.value,
            'created_at': transaction.created_at.isoformat(),
            'stripe_status': stripe_details.get('status', 'unknown')
        }
        
        # Ajout de détails selon le rôle
        if user_role in ['admin']:
            response_data.update({
                'fan_id': transaction.fan_id,
                'creator_id': transaction.creator_id,
                'stripe_payment_intent_id': transaction.stripe_payment_intent_id,
                'metadata': transaction.metadata
            })
        elif user_role == 'creator':
            response_data.update({
                'fan_id': transaction.fan_id[:8] + '***',  # Masqué partiellement
                'creator_id': transaction.creator_id
            })
        
        return jsonify(response_data), 200
        
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du paiement {payment_intent_id}: {e}")
        return jsonify({
            'error': 'Erreur interne du serveur'
        }), 500


@app.route('/payments/<payment_intent_id>/cancel', methods=['POST'])
@limiter.limit("5 per minute")
@require_auth(['user', 'creator', 'admin'])
@audit_log('cancel', 'payment')
def cancel_payment(payment_intent_id: str):
    """Annule un paiement avec vérification d'autorisation stricte."""
    try:
        payment_intent_id = SecurityUtils.sanitize_input(payment_intent_id, 255)
        
        # Vérification de la transaction
        transaction = db_service.get_transaction_by_payment_intent(payment_intent_id)
        if not transaction:
            return jsonify({'error': 'Transaction non trouvée'}), 404
        
        # Seuls les admins et le fan qui a initié le paiement peuvent annuler
        if request.user_role != 'admin' and transaction.fan_id != request.user_id:
            return jsonify({'error': 'Accès refusé'}), 403
        
        # Vérifier que la transaction peut être annulée
        if transaction.status not in [TransactionStatus.PENDING]:
            return jsonify({
                'error': 'Transaction ne peut pas être annulée',
                'status': transaction.status.value
            }), 400
        
        # Annulation via Stripe
        cancellation_result = stripe_service.cancel_payment_intent(payment_intent_id)
        
        # Mise à jour en base
        db_service.update_transaction_status(
            transaction.id, 
            TransactionStatus.CANCELED,
            {'cancelled_by': request.user_id, 'cancelled_at': datetime.now(timezone.utc).isoformat()}
        )
        
        logger.info(f"Paiement {payment_intent_id} annulé par {request.user_id}")
        
        return jsonify(cancellation_result), 200
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur Stripe lors de l'annulation de {payment_intent_id}: {e}")
        return jsonify({
            'error': 'Erreur lors de l\'annulation',
            'details': format_stripe_error(e)
        }), 400


@app.route('/webhook/stripe', methods=['POST'])
@limiter.limit("100 per minute")  # Limite élevée pour les webhooks
@require_secure_webhook
def stripe_webhook():
    """Gestion sécurisée des webhooks Stripe."""
    try:
        event = request.webhook_event  # Injecté par le décorateur
        
        logger.info(f"Webhook reçu: {event['type']} - {event['id']}")
        
        if event['type'] == 'payment_intent.succeeded':
            payment_intent = event['data']['object']
            
            transaction = db_service.get_transaction_by_payment_intent(payment_intent['id'])
            if transaction:
                # Mise à jour atomique du statut
                db_service.update_transaction_status(
                    transaction.id, 
                    TransactionStatus.SUCCEEDED,
                    {'webhook_processed_at': datetime.now(timezone.utc).isoformat()}
                )
                
                # Mise à jour du revenu mensuel
                now = datetime.now(timezone.utc)
                db_service.update_monthly_revenue(
                    transaction.creator_id,
                    now.year,
                    now.month,
                    transaction.amount_cents,
                    transaction.fee_cents
                )
                
                logger.info(f"Transaction confirmée: {transaction.id}")
        
        elif event['type'] == 'payment_intent.payment_failed':
            payment_intent = event['data']['object']
            
            transaction = db_service.get_transaction_by_payment_intent(payment_intent['id'])
            if transaction:
                db_service.update_transaction_status(
                    transaction.id, 
                    TransactionStatus.FAILED,
                    {
                        'failure_reason': payment_intent.get('last_payment_error', {}).get('message', 'Unknown'),
                        'webhook_processed_at': datetime.now(timezone.utc).isoformat()
                    }
                )
                
                logger.info(f"Transaction échouée: {transaction.id}")
        
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        logger.error(f"Erreur lors du traitement du webhook {event.get('id', 'unknown')}: {e}")
        return jsonify({'error': 'Erreur de traitement'}), 500


@app.route('/creators/<creator_id>/account', methods=['POST'])
@limiter.limit("3 per minute")
@require_auth(['admin'])  # Seuls les admins peuvent créer des comptes
@audit_log('create', 'creator_account')
def create_creator_account(creator_id: str):
    """Crée un compte Stripe Connect pour une créatrice."""
    try:
        creator_id = SecurityUtils.sanitize_input(creator_id)
        data = request.get_json()
        
        if not data or not data.get('email'):
            return jsonify({'error': 'Email requis'}), 400
        
        email = SecurityUtils.sanitize_input(data['email'])
        country = SecurityUtils.sanitize_input(data.get('country', 'FR'))
        
        # Validation email basique
        if '@' not in email or len(email) > 255:
            return jsonify({'error': 'Email invalide'}), 400
        
        # Vérification de l'existence
        existing_account = db_service.get_creator_account(creator_id)
        if existing_account:
            return jsonify({
                'error': 'Compte déjà existant',
                'account_id': existing_account.creator_id
            }), 409
        
        # Création du compte Stripe
        stripe_account = stripe_service.create_connected_account(email, country)
        
        # Sauvegarde en base
        account_data = {
            'creator_id': creator_id,
            'email': email,
            'stripe_account_id': stripe_account['account_id'],
            'account_status': AccountStatus.INCOMPLETE,
            'charges_enabled': stripe_account['charges_enabled'],
            'payouts_enabled': stripe_account['payouts_enabled'],
            'details_submitted': stripe_account['details_submitted'],
            'country': country.upper(),
            'currency': 'EUR',
            'onboarding_completed': False
        }
        
        account = db_service.save_creator_account(account_data)
        
        logger.info(f"Compte créé pour {creator_id} par {request.user_id}: {stripe_account['account_id']}")
        
        return jsonify({
            'creator_id': account.creator_id,
            'email': account.email,
            'stripe_account_id': account.stripe_account_id,
            'status': account.account_status.value
        }), 201
        
    except stripe.error.StripeError as e:
        logger.error(f"Erreur Stripe lors de la création du compte {creator_id}: {e}")
        return jsonify({
            'error': 'Erreur lors de la création du compte',
            'details': format_stripe_error(e)
        }), 400


@app.route('/creators/<creator_id>/revenue/<int:year>/<int:month>', methods=['GET'])
@limiter.limit("20 per minute")
@require_creator_access('creator_id')  # Vérification d'accès spécifique
@audit_log('read', 'revenue')
def get_monthly_revenue(creator_id: str, year: int, month: int):
    """Récupère le revenu mensuel avec contrôle d'accès strict."""
    try:
        creator_id = SecurityUtils.sanitize_input(creator_id)
        
        # Validation des paramètres
        if not (2020 <= year <= 2030) or not (1 <= month <= 12):
            return jsonify({'error': 'Période invalide'}), 400
        
        revenue_cents = db_service.get_monthly_revenue(creator_id, year, month)
        
        # Calcul des estimations
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
        logger.error(f"Erreur lors de la récupération du revenu {creator_id}/{year}/{month}: {e}")
        return jsonify({'error': 'Erreur interne du serveur'}), 500


@app.route('/commission/estimate', methods=['POST'])
@limiter.limit("30 per minute")
def estimate_commission():
    """Estime la commission pour un montant donné (endpoint public)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Body JSON requis'}), 400
        
        amount_euros = validate_monetary_amount(data.get('amount_euros'))
        monthly_revenue_euros = validate_monetary_amount(data.get('monthly_revenue_euros', 0))
        
        amount_cents = int(amount_euros * 100)
        monthly_revenue_cents = int(monthly_revenue_euros * 100)
        
        fee_cents = commission_calculator.calculate_fee(amount_cents, monthly_revenue_cents)
        breakdown = commission_calculator.get_tier_breakdown(amount_cents, monthly_revenue_cents)
        
        return jsonify({
            'amount_euros': float(amount_euros),
            'monthly_revenue_euros': float(monthly_revenue_euros),
            'fee_cents': fee_cents,
            'fee_euros': fee_cents / 100,
            'net_amount_euros': float(amount_euros) - (fee_cents / 100),
            'effective_rate': (fee_cents / amount_cents * 100) if amount_cents > 0 else 0,
            'tier_breakdown': breakdown
        }), 200
        
    except ValueError as e:
        return jsonify({'error': f'Validation échouée: {str(e)}'}), 400
        
    except Exception as e:
        logger.error(f"Erreur lors de l'estimation de commission: {e}")
        return jsonify({'error': 'Erreur interne du serveur'}), 500


# Gestion d'erreurs sécurisée
@app.errorhandler(404)
def not_found(error):
    """Gestion sécurisée des erreurs 404."""
    return jsonify({
        'error': 'Endpoint non trouvé'
    }), 404


@app.errorhandler(429)
def rate_limit_exceeded(error):
    """Gestion des erreurs de rate limiting."""
    return jsonify({
        'error': 'Trop de requêtes',
        'message': 'Veuillez réessayer plus tard'
    }), 429


@app.errorhandler(500)
def internal_error(error):
    """Gestion sécurisée des erreurs 500."""
    error_id = SecurityUtils.generate_secure_token(8)
    logger.error(f"Erreur interne [{error_id}]: {error}")
    
    return jsonify({
        'error': 'Erreur interne du serveur',
        'error_id': error_id
    }), 500


if __name__ == '__main__':
    # Démarrage sécurisé
    if app.config['ENV'] == 'production':
        logger.info("Démarrage en mode production")
        # En production, utiliser un serveur WSGI comme Gunicorn
        port = int(os.getenv('PORT', 5000))
        app.run(host='0.0.0.0', port=port, debug=False)
    else:
        logger.info("Démarrage en mode développement")
        app.run(debug=True, host='127.0.0.1', port=5000)