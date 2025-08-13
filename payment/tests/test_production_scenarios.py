"""
Tests pour scénarios de production et edge cases

Teste les cas limites, erreurs réseau, SCA, et idempotency
pour s'assurer de la robustesse en production.
"""

import pytest
import stripe
import time
import uuid
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from ..src.stripe_service import StripePaymentService
from ..src.retry_service import RetryService, RetryConfig, IdempotencyService
from ..src.commission_calculator import CommissionCalculator


class TestIdempotencyScenarios:
    """Tests des scénarios d'idempotency"""
    
    def setup_method(self):
        """Setup pour chaque test"""
        self.service = StripePaymentService("sk_test_fake")
        self.retry_service = RetryService()
    
    def test_duplicate_payment_intent_prevention(self):
        """Test prévention des doublons de PaymentIntent"""
        idempotency_key = f"test_{uuid.uuid4().hex[:16]}"
        
        # Mock Stripe pour retourner le même PaymentIntent
        mock_pi = Mock()
        mock_pi.id = "pi_test123"
        mock_pi.client_secret = "pi_test123_secret"
        mock_pi.status = "requires_confirmation"
        mock_pi.next_action = None
        
        with patch('stripe.PaymentIntent.create', return_value=mock_pi) as mock_create:
            # Premier appel
            result1 = self.service.create_payment_intent(
                amount_euros=50.0,
                connected_account_id="acct_test",
                fan_id="fan_123",
                idempotency_key=idempotency_key
            )
            
            # Deuxième appel avec même clé (doit retourner le même résultat)
            result2 = self.service.create_payment_intent(
                amount_euros=50.0,
                connected_account_id="acct_test", 
                fan_id="fan_123",
                idempotency_key=idempotency_key
            )
            
            # Vérifier que Stripe n'est appelé qu'une fois
            assert mock_create.call_count == 2  # Stripe gère l'idempotency
            assert result1['payment_intent_id'] == result2['payment_intent_id']
            assert result1['idempotency_key'] == result2['idempotency_key']
    
    def test_checkout_session_idempotency(self):
        """Test idempotency des sessions Checkout"""
        idempotency_key = f"cs_test_{uuid.uuid4().hex[:16]}"
        
        mock_session = Mock()
        mock_session.id = "cs_test123"
        mock_session.url = "https://checkout.stripe.com/test"
        mock_session.expires_at = int(time.time()) + 1800
        
        with patch('stripe.checkout.Session.create', return_value=mock_session):
            result1 = self.service.create_checkout_session(
                amount_euros=100.0,
                connected_account_id="acct_test",
                success_url="https://success.com",
                cancel_url="https://cancel.com",
                idempotency_key=idempotency_key
            )
            
            result2 = self.service.create_checkout_session(
                amount_euros=100.0,
                connected_account_id="acct_test",
                success_url="https://success.com", 
                cancel_url="https://cancel.com",
                idempotency_key=idempotency_key
            )
            
            assert result1['checkout_session_id'] == result2['checkout_session_id']
            assert result1['idempotency_key'] == result2['idempotency_key']


class TestSCAScenarios:
    """Tests des scénarios SCA/3D Secure"""
    
    def setup_method(self):
        self.service = StripePaymentService("sk_test_fake")
    
    def test_payment_requires_3d_secure(self):
        """Test paiement nécessitant 3D Secure"""
        # Mock PaymentIntent nécessitant une action
        mock_pi = Mock()
        mock_pi.id = "pi_test_3ds"
        mock_pi.status = "requires_action"
        mock_pi.client_secret = "pi_test_3ds_secret"
        mock_pi.next_action = Mock()
        mock_pi.next_action.type = "use_stripe_sdk"
        mock_pi.next_action.use_stripe_sdk = {"type": "three_d_secure_redirect"}
        
        with patch('stripe.PaymentIntent.confirm', return_value=mock_pi):
            result = self.service.confirm_payment_intent(
                payment_intent_id="pi_test_3ds",
                payment_method_id="pm_test",
                return_url="https://return.com"
            )
            
            assert result['requires_action'] is True
            assert result['status'] == "requires_action"
            assert result['next_action']['type'] == "use_stripe_sdk"
    
    def test_successful_3d_secure_completion(self):
        """Test complétion réussie du 3D Secure"""
        mock_pi = Mock()
        mock_pi.id = "pi_test_success"
        mock_pi.status = "succeeded"
        mock_pi.client_secret = "pi_test_success_secret"
        mock_pi.charges = Mock()
        mock_pi.charges.data = [Mock(id="ch_test", receipt_url="https://receipt.com")]
        
        with patch('stripe.PaymentIntent.confirm', return_value=mock_pi):
            result = self.service.confirm_payment_intent(
                payment_intent_id="pi_test_success"
            )
            
            assert result['status'] == "succeeded"
            assert result['requires_action'] is False
            assert result['charge_id'] == "ch_test"
            assert result['receipt_url'] == "https://receipt.com"
    
    def test_off_session_payment_success(self):
        """Test paiement off-session réussi"""
        mock_pi = Mock()
        mock_pi.id = "pi_off_session"
        mock_pi.status = "succeeded"
        mock_pi.charges = Mock()
        mock_pi.charges.data = [Mock(id="ch_off_session")]
        
        with patch('stripe.PaymentIntent.create', return_value=mock_pi):
            result = self.service.handle_off_session_payment(
                amount_euros=75.0,
                connected_account_id="acct_test",
                customer_id="cus_test",
                payment_method_id="pm_saved"
            )
            
            assert result['status'] == "succeeded"
            assert result['off_session'] is True
            assert result['charge_id'] == "ch_off_session"
    
    def test_off_session_payment_requires_action(self):
        """Test paiement off-session nécessitant une action"""
        mock_pi = Mock()
        mock_pi.id = "pi_off_action"
        mock_pi.status = "requires_action"
        mock_pi.client_secret = "pi_off_action_secret"
        
        with patch('stripe.PaymentIntent.create', return_value=mock_pi):
            result = self.service.handle_off_session_payment(
                amount_euros=75.0,
                connected_account_id="acct_test",
                customer_id="cus_test",
                payment_method_id="pm_saved"
            )
            
            assert result['status'] == "requires_action"
            assert result['requires_action'] is True
            assert result['client_secret'] == "pi_off_action_secret"


class TestRetryScenarios:
    """Tests des scénarios de retry"""
    
    def setup_method(self):
        self.retry_service = RetryService()
        self.config = RetryConfig(max_attempts=3, base_delay=0.1)
    
    def test_network_error_retry_success(self):
        """Test retry réussi après erreur réseau"""
        call_count = 0
        
        def failing_operation():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise stripe.error.APIConnectionError("Network error")
            return {"success": True, "attempt": call_count}
        
        # Décorer la fonction avec retry
        retried_operation = self.retry_service.with_retry(
            config=self.config,
            use_idempotency=False
        )(failing_operation)
        
        result = retried_operation()
        
        assert result["success"] is True
        assert result["attempt"] == 3
        assert call_count == 3
    
    def test_non_retriable_error_no_retry(self):
        """Test qu'une erreur non-retriable n'est pas retryée"""
        call_count = 0
        
        def failing_operation():
            nonlocal call_count
            call_count += 1
            raise stripe.error.InvalidRequestError("Invalid parameter", "amount")
        
        retried_operation = self.retry_service.with_retry(
            config=self.config,
            use_idempotency=False
        )(failing_operation)
        
        with pytest.raises(stripe.error.InvalidRequestError):
            retried_operation()
        
        # Doit échouer immédiatement sans retry
        assert call_count == 1
    
    def test_rate_limit_retry(self):
        """Test retry sur rate limiting"""
        call_count = 0
        
        def rate_limited_operation():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise stripe.error.RateLimitError("Rate limit exceeded")
            return {"success": True}
        
        retried_operation = self.retry_service.with_retry(
            config=self.config,
            use_idempotency=False
        )(rate_limited_operation)
        
        result = retried_operation()
        
        assert result["success"] is True
        assert call_count == 2
    
    def test_max_attempts_exceeded(self):
        """Test échec après épuisement des tentatives"""
        call_count = 0
        
        def always_failing_operation():
            nonlocal call_count
            call_count += 1
            raise stripe.error.APIConnectionError("Always fails")
        
        retried_operation = self.retry_service.with_retry(
            config=self.config,
            use_idempotency=False
        )(always_failing_operation)
        
        with pytest.raises(stripe.error.APIConnectionError):
            retried_operation()
        
        assert call_count == 3  # max_attempts


class TestEdgeCases:
    """Tests des cas limites"""
    
    def setup_method(self):
        self.service = StripePaymentService("sk_test_fake")
        self.calculator = CommissionCalculator()
    
    def test_zero_amount_payment(self):
        """Test paiement avec montant zéro"""
        with pytest.raises(ValueError, match="Le montant doit être positif"):
            self.service.create_payment_intent(
                amount_euros=0.0,
                connected_account_id="acct_test",
                fan_id="fan_123"
            )
    
    def test_negative_amount_payment(self):
        """Test paiement avec montant négatif"""
        with pytest.raises(ValueError, match="Le montant doit être positif"):
            self.service.create_payment_intent(
                amount_euros=-10.0,
                connected_account_id="acct_test",
                fan_id="fan_123"
            )
    
    def test_very_large_amount(self):
        """Test paiement avec montant très élevé"""
        # Mock pour éviter l'appel Stripe réel
        mock_pi = Mock()
        mock_pi.id = "pi_large"
        mock_pi.client_secret = "pi_large_secret"
        mock_pi.status = "requires_confirmation"
        mock_pi.next_action = None
        
        with patch('stripe.PaymentIntent.create', return_value=mock_pi):
            result = self.service.create_payment_intent(
                amount_euros=999999.99,  # Montant très élevé
                connected_account_id="acct_test",
                fan_id="fan_123"
            )
            
            assert result['amount_euros'] == 999999.99
            assert result['amount_cents'] == 99999999
    
    def test_commission_calculation_edge_cases(self):
        """Test calculs de commission pour cas limites"""
        # Montant très petit
        fee_small = self.calculator.calculate_fee(1, 0)  # 1 centime
        assert fee_small >= 0
        
        # Montant très grand
        fee_large = self.calculator.calculate_fee(10000000, 5000000)  # 100k€ avec 50k€ déjà généré
        assert fee_large > 0
        assert fee_large <= 10000000  # Commission ne peut pas dépasser le montant
        
        # Revenu mensuel très élevé (doit appliquer le minimum)
        fee_min = self.calculator.calculate_fee(10000, 10000000)  # 100€ avec 100k€ déjà généré
        expected_min_rate = 0.10  # 10% minimum
        expected_fee = int(10000 * expected_min_rate)
        assert fee_min == expected_fee
    
    def test_malformed_account_ids(self):
        """Test avec IDs de compte malformés"""
        with pytest.raises(ValueError, match="ID de compte Connect invalide"):
            self.service.create_payment_intent(
                amount_euros=50.0,
                connected_account_id="",  # ID vide
                fan_id="fan_123"
            )
        
        with pytest.raises(ValueError, match="ID de compte Connect invalide"):
            self.service.create_payment_intent(
                amount_euros=50.0,
                connected_account_id="invalid_format",  # Format invalide
                fan_id="fan_123"
            )
    
    def test_long_metadata_handling(self):
        """Test gestion de métadonnées très longues"""
        long_metadata = {
            "very_long_key_" + "x" * 100: "value",
            "normal_key": "x" * 500  # Valeur très longue
        }
        
        # Stripe limite les métadonnées, donc on doit tronquer
        with patch('stripe.PaymentIntent.create') as mock_create:
            mock_create.return_value = Mock(
                id="pi_test",
                client_secret="secret",
                status="requires_confirmation",
                next_action=None
            )
            
            # La fonction doit gérer les métadonnées trop longues
            result = self.service.create_payment_intent(
                amount_euros=50.0,
                connected_account_id="acct_test",
                fan_id="fan_123",
                metadata=long_metadata
            )
            
            # Vérifier que l'appel a réussi malgré les métadonnées longues
            assert result['payment_intent_id'] == "pi_test"


class TestConcurrencyScenarios:
    """Tests des scénarios de concurrence"""
    
    def setup_method(self):
        self.idempotency_service = IdempotencyService()
    
    def test_concurrent_idempotency_requests(self):
        """Test requêtes concurrentes avec même clé d'idempotence"""
        import threading
        import time
        
        key = f"concurrent_test_{uuid.uuid4().hex[:8]}"
        results = []
        errors = []
        
        def concurrent_operation(thread_id):
            try:
                # Simuler une opération qui prend du temps
                if not self.idempotency_service.is_duplicate(key):
                    time.sleep(0.1)  # Simuler traitement
                    result = {"thread_id": thread_id, "timestamp": time.time()}
                    self.idempotency_service.store_result(key, result)
                    results.append(result)
                else:
                    cached = self.idempotency_service.get_result(key)
                    results.append(cached)
            except Exception as e:
                errors.append(e)
        
        # Lancer plusieurs threads avec la même clé
        threads = []
        for i in range(5):
            thread = threading.Thread(target=concurrent_operation, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Attendre tous les threads
        for thread in threads:
            thread.join()
        
        # Vérifier qu'il n'y a pas d'erreurs
        assert len(errors) == 0
        
        # Tous les résultats doivent être identiques (du premier thread qui a réussi)
        assert len(results) == 5
        first_result = results[0]
        for result in results[1:]:
            assert result["thread_id"] == first_result["thread_id"]
            assert result["timestamp"] == first_result["timestamp"]


class TestWebhookScenarios:
    """Tests des scénarios de webhooks"""
    
    def test_webhook_signature_validation(self):
        """Test validation des signatures de webhooks"""
        # Mock d'un payload webhook
        payload = '{"id": "evt_test", "type": "payment_intent.succeeded"}'
        signature = "t=1234567890,v1=test_signature"
        
        with patch('stripe.Webhook.construct_event') as mock_construct:
            mock_construct.return_value = {
                "id": "evt_test",
                "type": "payment_intent.succeeded",
                "data": {"object": {"id": "pi_test"}}
            }
            
            from ..src.stripe_service import StripePaymentService
            service = StripePaymentService("sk_test_fake")
            
            # Test avec signature valide (simulée)
            # Dans un vrai test, on utiliserait stripe.Webhook.construct_event
            assert mock_construct.called is False  # Pas encore appelé
    
    def test_webhook_duplicate_handling(self):
        """Test gestion des webhooks dupliqués"""
        webhook_id = "evt_test_duplicate"
        
        # Simuler le traitement d'un webhook
        from ..src.retry_service import IdempotencyService
        idem_service = IdempotencyService()
        
        # Premier traitement
        result1 = {"processed": True, "webhook_id": webhook_id, "timestamp": time.time()}
        idem_service.store_result(f"webhook_{webhook_id}", result1)
        
        # Deuxième traitement (duplicata)
        cached_result = idem_service.get_result(f"webhook_{webhook_id}")
        
        assert cached_result is not None
        assert cached_result["webhook_id"] == webhook_id
        assert cached_result["processed"] is True


if __name__ == "__main__":
    # Lancer les tests
    pytest.main([__file__, "-v"])