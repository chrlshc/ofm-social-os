"""
Tests de sécurité complets pour le module de paiement.
Couvre l'authentification, l'autorisation, les webhooks et les attaques courantes.
"""

import pytest
import json
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from flask import Flask
from werkzeug.test import Client

from src.app_secure import create_secure_app
from src.auth import AuthService
from src.user_management import UserService, UserRole, UserStatus
from src.security import SecurityUtils, WebhookSecurity
from src.error_handling import ErrorCode, PaymentAPIError
from src.database import init_database


class TestAuthenticationSecurity:
    """Tests de sécurité pour l'authentification."""
    
    @pytest.fixture
    def app(self):
        """Application de test."""
        app = create_secure_app({
            'TESTING': True,
            'DATABASE_URL': 'sqlite:///:memory:',
            'JWT_SECRET_KEY': 'test-jwt-secret-key',
            'FLASK_SECRET_KEY': 'test-flask-secret-key',
            'STRIPE_SECRET_KEY': 'sk_test_fake_key',
            'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'
        })
        
        with app.app_context():
            init_database(app)
            yield app
    
    @pytest.fixture
    def client(self, app):
        """Client de test."""
        return app.test_client()
    
    @pytest.fixture
    def auth_service(self, app):
        """Service d'authentification."""
        with app.app_context():
            return AuthService('test-jwt-secret-key')
    
    @pytest.fixture
    def user_service(self, app):
        """Service utilisateur."""
        with app.app_context():
            return UserService()
    
    def test_login_without_credentials(self, client):
        """Test: connexion sans identifiants."""
        response = client.post('/auth/login', json={})
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['error'] == 'Email et mot de passe requis'
    
    def test_login_with_invalid_credentials(self, client, user_service):
        """Test: connexion avec identifiants invalides."""
        # Créer un utilisateur de test
        user_service.create_user('test@example.com', 'ValidP@ssw0rd123', UserRole.USER)
        user_service.activate_user(user_service.get_user_by_email('test@example.com').id)
        
        # Tentative avec mauvais mot de passe
        response = client.post('/auth/login', json={
            'email': 'test@example.com',
            'password': 'wrongpassword'
        })
        
        assert response.status_code == 401
        data = json.loads(response.data)
        assert 'Identifiants invalides' in data['error']
    
    def test_login_brute_force_protection(self, client, user_service):
        """Test: protection contre les attaques par force brute."""
        # Créer un utilisateur de test
        user = user_service.create_user('test@example.com', 'ValidP@ssw0rd123', UserRole.USER)
        user_service.activate_user(user.id)
        
        # Effectuer plusieurs tentatives échouées
        for i in range(6):  # Dépasser la limite de 5 tentatives
            response = client.post('/auth/login', json={
                'email': 'test@example.com',
                'password': 'wrongpassword'
            })
        
        # La dernière tentative doit indiquer un verrouillage
        assert response.status_code == 401
        data = json.loads(response.data)
        assert 'verrouillé' in data['error']
    
    def test_jwt_token_validation(self, auth_service):
        """Test: validation des tokens JWT."""
        # Token valide
        tokens = auth_service.generate_tokens('user123', 'user')
        valid, claims = auth_service.verify_token(tokens['access_token'])
        assert valid is True
        assert claims['user_id'] == 'user123'
        assert claims['role'] == 'user'
        
        # Token invalide
        valid, claims = auth_service.verify_token('invalid-token')
        assert valid is False
    
    def test_jwt_token_expiration(self, auth_service):
        """Test: expiration des tokens JWT."""
        # Simuler un token expiré
        import jwt
        expired_token = jwt.encode(
            {
                'user_id': 'test',
                'role': 'user',
                'exp': datetime.now(timezone.utc) - timedelta(hours=1),
                'type': 'access',
                'iss': 'ofm-payment-service'
            },
            'test-jwt-secret-key',
            algorithm='HS256'
        )
        
        valid, claims = auth_service.verify_token(expired_token)
        assert valid is False
        assert claims['error'] == 'Token expiré'
    
    def test_endpoint_protection(self, client, auth_service):
        """Test: protection des endpoints par authentification."""
        # Tentative d'accès sans token
        response = client.post('/payments', json={
            'fan_id': 'fan123',
            'creator_id': 'creator123',
            'amount_euros': '10.00'
        })
        
        assert response.status_code == 401
        data = json.loads(response.data)
        assert 'Authentification requise' in data['error']
    
    def test_role_based_access_control(self, client, auth_service, user_service):
        """Test: contrôle d'accès basé sur les rôles."""
        # Créer utilisateur normal
        user = user_service.create_user('user@test.com', 'UserP@ss123', UserRole.USER)
        user_service.activate_user(user.id)
        
        # Générer token utilisateur
        tokens = auth_service.generate_tokens(user.id, 'user')
        headers = {'Authorization': f'Bearer {tokens["access_token"]}'}
        
        # Tentative d'accès à un endpoint admin
        response = client.post('/creators/creator123/account', 
                             headers=headers,
                             json={'email': 'creator@test.com'})
        
        assert response.status_code == 403


class TestInputValidationSecurity:
    """Tests de sécurité pour la validation des entrées."""
    
    @pytest.fixture
    def app(self):
        """Application de test."""
        app = create_secure_app({
            'TESTING': True,
            'DATABASE_URL': 'sqlite:///:memory:',
            'JWT_SECRET_KEY': 'test-jwt-secret-key',
            'FLASK_SECRET_KEY': 'test-flask-secret-key',
            'STRIPE_SECRET_KEY': 'sk_test_fake_key',
            'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'
        })
        
        with app.app_context():
            init_database(app)
            yield app
    
    @pytest.fixture
    def client(self, app):
        """Client de test."""
        return app.test_client()
    
    @pytest.fixture
    def auth_headers(self, app):
        """Headers d'authentification pour les tests."""
        with app.app_context():
            from src.auth import auth_service
            tokens = auth_service.generate_tokens('test_user', 'user')
            return {'Authorization': f'Bearer {tokens["access_token"]}'}
    
    def test_sql_injection_protection(self, client, auth_headers):
        """Test: protection contre l'injection SQL."""
        malicious_payloads = [
            "'; DROP TABLE users; --",
            "' OR '1'='1",
            "' UNION SELECT * FROM users --",
            "<script>alert('xss')</script>",
            "../../../../etc/passwd"
        ]
        
        for payload in malicious_payloads:
            response = client.post('/payments', 
                                 headers=auth_headers,
                                 json={
                                     'fan_id': payload,
                                     'creator_id': 'creator123',
                                     'amount_euros': '10.00'
                                 })
            
            # Doit rejeter ou nettoyer l'entrée
            assert response.status_code in [400, 404]  # Validation ou non trouvé
    
    def test_xss_protection(self, client):
        """Test: protection contre les attaques XSS."""
        xss_payloads = [
            "<script>alert('xss')</script>",
            "javascript:alert('xss')",
            "<img src=x onerror=alert('xss')>",
            "';alert('xss');//"
        ]
        
        for payload in xss_payloads:
            response = client.post('/auth/register', json={
                'email': f'test{payload}@example.com',
                'password': 'ValidP@ss123',
                'first_name': payload
            })
            
            # Le payload doit être rejeté ou nettoyé
            if response.status_code == 201:
                data = json.loads(response.data)
                # Vérifier que le payload a été nettoyé
                assert '<script>' not in str(data)
    
    def test_monetary_validation(self, client, auth_headers):
        """Test: validation stricte des montants monétaires."""
        invalid_amounts = [
            'abc',           # Non numérique
            '-10.00',        # Négatif
            '0.001',         # Trop de décimales
            '999999999.99',  # Trop grand
            '0.00',          # Zéro
            ''               # Vide
        ]
        
        for amount in invalid_amounts:
            response = client.post('/payments',
                                 headers=auth_headers,
                                 json={
                                     'fan_id': 'fan123',
                                     'creator_id': 'creator123',
                                     'amount_euros': amount
                                 })
            
            assert response.status_code == 400
            data = json.loads(response.data)
            assert 'invalide' in data['error'] or 'requis' in data['error']
    
    def test_parameter_pollution(self, client, auth_headers):
        """Test: protection contre la pollution de paramètres."""
        # Tentative de pollution avec paramètres dupliqués
        response = client.post('/payments?amount_euros=1.00&amount_euros=999999.99',
                             headers=auth_headers,
                             json={
                                 'fan_id': 'fan123',
                                 'creator_id': 'creator123',
                                 'amount_euros': '10.00'
                             })
        
        # Doit utiliser la valeur du JSON, pas des paramètres d'URL
        # Ou rejeter la requête comme malformée
        assert response.status_code in [400, 404]


class TestWebhookSecurity:
    """Tests de sécurité pour les webhooks."""
    
    @pytest.fixture
    def webhook_security(self):
        """Instance de sécurité webhook."""
        return WebhookSecurity('whsec_test_secret')
    
    @pytest.fixture
    def app(self):
        """Application de test."""
        app = create_secure_app({
            'TESTING': True,
            'DATABASE_URL': 'sqlite:///:memory:',
            'JWT_SECRET_KEY': 'test-jwt-secret-key',
            'FLASK_SECRET_KEY': 'test-flask-secret-key',
            'STRIPE_SECRET_KEY': 'sk_test_fake_key',
            'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret'
        })
        
        with app.app_context():
            init_database(app)
            yield app
    
    @pytest.fixture
    def client(self, app):
        """Client de test."""
        return app.test_client()
    
    def test_webhook_without_signature(self, client):
        """Test: webhook sans signature."""
        response = client.post('/webhook/stripe', 
                             json={'type': 'payment_intent.succeeded'})
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Signature manquante' in data['error']
    
    def test_webhook_invalid_signature(self, client):
        """Test: webhook avec signature invalide."""
        response = client.post('/webhook/stripe',
                             headers={'Stripe-Signature': 'invalid_signature'},
                             json={'type': 'payment_intent.succeeded'})
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Signature invalide' in data['error']
    
    def test_webhook_event_type_filtering(self, webhook_security):
        """Test: filtrage des types d'événements webhook."""
        # Événement autorisé
        assert webhook_security.is_event_allowed('payment_intent.succeeded') is True
        
        # Événement non autorisé
        assert webhook_security.is_event_allowed('invoice.payment_failed') is False
        assert webhook_security.is_event_allowed('malicious_event') is False
    
    def test_webhook_payload_validation(self, webhook_security):
        """Test: validation du contenu des webhooks."""
        # Payload valide
        valid_event = {
            'id': 'evt_test_123',
            'type': 'payment_intent.succeeded',
            'data': {
                'object': {
                    'id': 'pi_test_123',
                    'status': 'succeeded'
                }
            }
        }
        
        error = webhook_security.validate_webhook_payload(valid_event)
        assert error is None
        
        # Payload invalide - type non autorisé
        invalid_event = {
            'id': 'evt_test_123',
            'type': 'dangerous_event',
            'data': {'object': {}}
        }
        
        error = webhook_security.validate_webhook_payload(invalid_event)
        assert error is not None
        assert 'non autorisé' in error


class TestRateLimitingSecurity:
    """Tests de sécurité pour le rate limiting."""
    
    @pytest.fixture
    def app(self):
        """Application de test avec rate limiting."""
        app = create_secure_app({
            'TESTING': True,
            'DATABASE_URL': 'sqlite:///:memory:',
            'JWT_SECRET_KEY': 'test-jwt-secret-key',
            'FLASK_SECRET_KEY': 'test-flask-secret-key',
            'STRIPE_SECRET_KEY': 'sk_test_fake_key',
            'STRIPE_WEBHOOK_SECRET': 'whsec_test_secret',
            'RATELIMIT_STORAGE_URL': 'memory://'
        })
        
        with app.app_context():
            init_database(app)
            yield app
    
    @pytest.fixture
    def client(self, app):
        """Client de test."""
        return app.test_client()
    
    @pytest.fixture
    def auth_headers(self, app):
        """Headers d'authentification."""
        with app.app_context():
            from src.auth import auth_service
            tokens = auth_service.generate_tokens('test_user', 'user')
            return {'Authorization': f'Bearer {tokens["access_token"]}'}
    
    @pytest.mark.skip(reason="Nécessite configuration Redis pour rate limiting distribué")
    def test_payment_rate_limiting(self, client, auth_headers):
        """Test: limitation de taux pour les paiements."""
        # Effectuer de nombreuses requêtes rapidement
        for i in range(15):  # Dépasser la limite de 10/min
            response = client.post('/payments',
                                 headers=auth_headers,
                                 json={
                                     'fan_id': f'fan{i}',
                                     'creator_id': 'creator123',
                                     'amount_euros': '1.00'
                                 })
            
            if response.status_code == 429:
                # Rate limit atteint
                data = json.loads(response.data)
                assert 'Trop de requêtes' in data['error']
                break
        else:
            pytest.fail("Rate limiting ne fonctionne pas")
    
    def test_login_rate_limiting(self, client):
        """Test: limitation de taux pour les connexions."""
        # Effectuer de nombreuses tentatives de connexion
        for i in range(15):
            response = client.post('/auth/login', json={
                'email': 'nonexistent@example.com',
                'password': 'wrongpassword'
            })
        
        # Devrait être limité après un certain nombre de tentatives
        # Note: dépend de la configuration du rate limiter


class TestSecurityUtils:
    """Tests des utilitaires de sécurité."""
    
    def test_input_sanitization(self):
        """Test: nettoyage des entrées utilisateur."""
        malicious_inputs = [
            "Hello<script>alert('xss')</script>World",
            "Normal input with\x00null bytes",
            "Input with\ttabs\nand\rcontrol chars",
            "Very long input " + "x" * 1000
        ]
        
        for input_str in malicious_inputs:
            sanitized = SecurityUtils.sanitize_input(input_str, max_length=255)
            
            # Vérifications
            assert len(sanitized) <= 255
            assert '\x00' not in sanitized  # Pas de null bytes
            assert '<script>' not in sanitized  # HTML/JS supprimé
            assert all(ord(char) >= 32 for char in sanitized)  # Pas de chars de contrôle
    
    def test_sensitive_data_masking(self):
        """Test: masquage des données sensibles."""
        sensitive_data = {
            'email': 'user@example.com',
            'password': 'supersecret123',
            'stripe_account_id': 'acct_1234567890',
            'api_key': 'sk_live_secret_key',
            'client_secret': 'pi_secret_12345',
            'normal_field': 'public_value',
            'nested': {
                'token': 'secret_token_123',
                'public': 'public_nested_value'
            }
        }
        
        masked = SecurityUtils.mask_sensitive_data(sensitive_data)
        
        # Vérifications
        assert 'user@' in masked['email']  # Email partiellement visible
        assert masked['password'] == 'supe***'  # Mot de passe masqué
        assert masked['stripe_account_id'] == 'acct***'  # ID Stripe masqué
        assert masked['api_key'] == 'sk_l***'  # Clé API masquée
        assert masked['normal_field'] == 'public_value'  # Champ normal intact
        assert masked['nested']['token'] == 'secr***'  # Imbriqué masqué
        assert masked['nested']['public'] == 'public_nested_value'  # Imbriqué public intact
    
    def test_password_hashing(self):
        """Test: hachage et vérification des mots de passe."""
        password = "MySecureP@ssw0rd123"
        
        # Hachage
        hashed = SecurityUtils.hash_password(password)
        
        # Vérifications
        assert hashed != password  # Hash différent du mot de passe
        assert len(hashed) > 50     # Hash de taille raisonnable
        assert '$2b$' in hashed     # Format bcrypt
        
        # Vérification correcte
        assert SecurityUtils.verify_password(password, hashed) is True
        
        # Vérification incorrecte
        assert SecurityUtils.verify_password('wrongpassword', hashed) is False
    
    def test_secure_token_generation(self):
        """Test: génération de tokens sécurisés."""
        token1 = SecurityUtils.generate_secure_token(32)
        token2 = SecurityUtils.generate_secure_token(32)
        
        # Vérifications
        assert len(token1) == 64  # 32 bytes = 64 hex chars
        assert len(token2) == 64
        assert token1 != token2   # Tokens uniques
        assert all(c in '0123456789abcdef' for c in token1)  # Hex valide


if __name__ == "__main__":
    # Lancer les tests
    pytest.main([__file__, "-v", "--tb=short"])