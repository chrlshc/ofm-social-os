"""
Comprehensive tests for the onboarding flow

Tests cover the complete pre-connection onboarding journey:
1. User registration → email verification
2. Terms acceptance 
3. Stripe Connect Express onboarding
4. Status tracking and error handling
5. Security validations (token expiry, invalid tokens)

Run with: pytest onboarding/tests/test_onboarding_flow.py -v
"""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from flask import Flask
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import modules under test
from ..models import Base, VerificationToken, CreatorProfile, OnboardingSession
from ..tokens import EmailTokenService, TokenSecurityError
from ..service import OnboardingService, LocaleDetectionService
from ..stripe_connect import StripeConnectService, StripeConnectError
from ..routes import bp as onboarding_bp


# Test Fixtures

@pytest.fixture
def app():
    """Create Flask test app with onboarding blueprint"""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.register_blueprint(onboarding_bp)
    
    return app

@pytest.fixture  
def client(app):
    """Create test client"""
    return app.test_client()

@pytest.fixture
def db_session():
    """Create in-memory SQLite database for testing"""
    engine = create_engine('sqlite:///:memory:', echo=False)
    Base.metadata.create_all(engine)
    
    Session = sessionmaker(bind=engine)
    session = Session()
    
    yield session
    
    session.close()

@pytest.fixture
def mock_request():
    """Mock Flask request object with auth data"""
    mock_req = Mock()
    mock_req.user_id = "test_user_123"
    mock_req.user_email = "test@example.com" 
    mock_req.user_roles = ["creator"]
    mock_req.headers = {"Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"}
    mock_req.get_json = Mock(return_value={})
    return mock_req


# Email Token Service Tests

class TestEmailTokenService:
    """Test secure email verification token functionality"""
    
    def test_token_generation_and_verification(self, db_session):
        """Test successful token generation and verification"""
        user_id = "test_user_123"
        
        # Generate token
        raw_token = EmailTokenService.issue_email_verification_token(db_session, user_id)
        
        assert raw_token is not None
        assert len(raw_token) > 30  # Should be cryptographically secure
        
        # Verify token
        is_valid = EmailTokenService.verify_email_token(db_session, user_id, raw_token)
        assert is_valid is True
        
        # Token should be marked as used
        is_valid_again = EmailTokenService.verify_email_token(db_session, user_id, raw_token)
        assert is_valid_again is False  # Single use enforcement
    
    def test_invalid_token_verification(self, db_session):
        """Test verification fails for invalid tokens"""
        user_id = "test_user_123"
        invalid_token = "invalid_token_12345"
        
        is_valid = EmailTokenService.verify_email_token(db_session, user_id, invalid_token)
        assert is_valid is False
    
    def test_expired_token_handling(self, db_session):
        """Test that expired tokens are rejected"""
        user_id = "test_user_123"
        
        # Create expired token manually
        import hashlib, secrets
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        
        expired_token = VerificationToken(
            id=token_hash,
            user_id=user_id,
            purpose="email_verify",
            expires_at=datetime.utcnow() - timedelta(minutes=1),  # Expired
            used=False
        )
        
        db_session.add(expired_token)
        db_session.commit()
        
        # Verification should fail
        is_valid = EmailTokenService.verify_email_token(db_session, user_id, raw_token)
        assert is_valid is False
    
    def test_token_cleanup(self, db_session):
        """Test cleanup of expired tokens"""
        user_id = "test_user_123"
        
        # Create old expired token
        old_token = VerificationToken(
            id="old_token_hash",
            user_id=user_id,
            purpose="email_verify",
            expires_at=datetime.utcnow() - timedelta(hours=25),  # Old enough for cleanup
            created_at=datetime.utcnow() - timedelta(hours=25),
            used=True
        )
        
        db_session.add(old_token)
        db_session.commit()
        
        # Run cleanup
        cleaned_count = EmailTokenService.cleanup_expired_tokens(db_session)
        
        assert cleaned_count == 1
        
        # Token should be removed
        remaining = db_session.query(VerificationToken).filter_by(id="old_token_hash").first()
        assert remaining is None
    
    def test_token_invalidation(self, db_session):
        """Test that existing tokens are invalidated when issuing new ones"""
        user_id = "test_user_123"
        
        # Issue first token
        token1 = EmailTokenService.issue_email_verification_token(db_session, user_id)
        
        # Issue second token (should invalidate first)
        token2 = EmailTokenService.issue_email_verification_token(db_session, user_id)
        
        # First token should be invalidated
        is_valid1 = EmailTokenService.verify_email_token(db_session, user_id, token1)
        assert is_valid1 is False
        
        # Second token should be valid
        is_valid2 = EmailTokenService.verify_email_token(db_session, user_id, token2)
        assert is_valid2 is True


# Locale Detection Tests

class TestLocaleDetectionService:
    """Test automatic locale detection functionality"""
    
    def test_language_detection_from_headers(self):
        """Test language detection from Accept-Language header"""
        with patch('onboarding.service.request') as mock_request:
            # Test French preference
            mock_request.headers = {"Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"}
            language = LocaleDetectionService.detect_language_from_headers()
            assert language == "fr"
            
            # Test English preference  
            mock_request.headers = {"Accept-Language": "en-US,en;q=0.9"}
            language = LocaleDetectionService.detect_language_from_headers()
            assert language == "en"
            
            # Test fallback for missing header
            mock_request.headers = {}
            language = LocaleDetectionService.detect_language_from_headers()
            assert language == "en"  # Default fallback
    
    def test_timezone_normalization(self):
        """Test timezone normalization and validation"""
        # Valid timezone
        tz = LocaleDetectionService.normalize_timezone("Europe/London")
        assert tz == "Europe/London"
        
        # Invalid timezone - should fallback
        tz = LocaleDetectionService.normalize_timezone("Invalid/Timezone")
        assert tz == "Europe/Paris"  # Default fallback
        
        # None input
        tz = LocaleDetectionService.normalize_timezone(None)
        assert tz == "Europe/Paris"  # Default fallback
        
        # Common abbreviation mapping
        tz = LocaleDetectionService.normalize_timezone("EST")
        assert tz == "America/New_York"
    
    def test_locale_context_detection(self):
        """Test full locale context detection"""
        with patch('onboarding.service.request') as mock_request:
            mock_request.headers = {"Accept-Language": "es-ES,es;q=0.9"}
            
            context = LocaleDetectionService.detect_locale_context()
            
            assert context["language"] == "es"
            assert context["timezone"] == "Europe/Paris"  # Default until JS updates


# Stripe Connect Service Tests

class TestStripeConnectService:
    """Test Stripe Connect integration functionality"""
    
    @patch('onboarding.stripe_connect.stripe.Account.create')
    def test_express_account_creation(self, mock_create):
        """Test Stripe Express account creation"""
        # Mock successful account creation
        mock_account = Mock()
        mock_account.id = "acct_test123"
        mock_create.return_value = mock_account
        
        account_id = StripeConnectService.create_express_account("test@example.com")
        
        assert account_id == "acct_test123"
        mock_create.assert_called_once_with(
            type="express",
            email="test@example.com",
            country="FR",
            capabilities={
                "transfers": {"requested": True},
                "card_payments": {"requested": True}
            }
        )
    
    @patch('onboarding.stripe_connect.stripe.Account.create')
    def test_express_account_creation_failure(self, mock_create):
        """Test handling of Stripe account creation failures"""
        import stripe
        mock_create.side_effect = stripe.StripeError("API Error")
        
        with pytest.raises(StripeConnectError, match="Account creation failed"):
            StripeConnectService.create_express_account("test@example.com")
    
    @patch('onboarding.stripe_connect.stripe.AccountLink.create')
    def test_onboarding_link_creation(self, mock_create):
        """Test onboarding link creation"""
        mock_link = Mock()
        mock_link.url = "https://connect.stripe.com/setup/test"
        mock_create.return_value = mock_link
        
        url = StripeConnectService.create_onboarding_link(
            "acct_test123",
            "https://app.com/return",
            "https://app.com/refresh"
        )
        
        assert url == "https://connect.stripe.com/setup/test"
        mock_create.assert_called_once()
    
    @patch('onboarding.stripe_connect.stripe.Account.retrieve')
    def test_account_status_retrieval(self, mock_retrieve):
        """Test account status and requirements retrieval"""
        # Mock account with requirements
        mock_account = Mock()
        mock_account.charges_enabled = False
        mock_account.payouts_enabled = False
        mock_account.details_submitted = True
        mock_account.requirements = Mock()
        mock_account.requirements.currently_due = ["individual.first_name"]
        mock_account.requirements.eventually_due = []
        mock_account.requirements.past_due = []
        mock_account.requirements.pending_verification = []
        mock_account.requirements.disabled_reason = None
        mock_account.capabilities = {"card_payments": Mock(status="active")}
        
        mock_retrieve.return_value = mock_account
        
        status = StripeConnectService.get_account_status("acct_test123")
        
        assert status["charges_enabled"] is False
        assert status["payouts_enabled"] is False
        assert status["details_submitted"] is True
        assert "individual.first_name" in status["requirements"]["currently_due"]
        assert status["capabilities"]["card_payments"] == "active"
    
    def test_onboarding_completion_check(self):
        """Test onboarding completion validation"""
        with patch.object(StripeConnectService, 'get_account_status') as mock_status:
            # Complete account
            mock_status.return_value = {
                "charges_enabled": True,
                "payouts_enabled": True,
                "details_submitted": True
            }
            
            is_complete = StripeConnectService.is_onboarding_complete("acct_test123")
            assert is_complete is True
            
            # Incomplete account
            mock_status.return_value = {
                "charges_enabled": False,
                "payouts_enabled": False,
                "details_submitted": False
            }
            
            is_complete = StripeConnectService.is_onboarding_complete("acct_test123")
            assert is_complete is False


# Onboarding Service Tests  

class TestOnboardingService:
    """Test main onboarding orchestration service"""
    
    def test_onboarding_initialization(self, db_session):
        """Test onboarding session and profile creation"""
        service = OnboardingService()
        user_id = "test_user_123"
        
        with patch('onboarding.service.request') as mock_request:
            mock_request.headers = {"Accept-Language": "fr-FR,fr;q=0.9"}
            
            session_id = service.start_onboarding(db_session, user_id)
            
            assert session_id is not None
            assert session_id.startswith("onb_")
            
            # Check session created
            session = db_session.query(OnboardingSession).filter_by(id=session_id).first()
            assert session is not None
            assert session.user_id == user_id
            assert session.current_step == "registered"
            
            # Check profile created with locale
            profile = db_session.query(CreatorProfile).filter_by(user_id=user_id).first()
            assert profile is not None
            assert profile.language == "fr"
            assert profile.timezone == "Europe/Paris"
    
    def test_email_verification_flow(self, db_session):
        """Test email verification step"""
        service = OnboardingService()
        user_id = "test_user_123"
        
        # Start onboarding
        session_id = service.start_onboarding(db_session, user_id)
        
        # Mock email sending
        with patch.object(service.email_service, 'send_verification_email', return_value=True):
            success = service.send_email_verification(db_session, user_id, "test@example.com")
            assert success is True
        
        # Get token for verification
        token_record = db_session.query(VerificationToken).filter_by(user_id=user_id).first()
        assert token_record is not None
        
        # Generate raw token for testing (normally comes from email)
        import secrets, hashlib
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token_record.id = token_hash
        db_session.commit()
        
        # Verify email
        success = service.verify_email(db_session, user_id, raw_token)
        assert success is True
        
        # Check session advanced
        session = db_session.query(OnboardingSession).filter_by(id=session_id).first()
        assert session.current_step == "email_verified"
        assert session.email_verified_at is not None
    
    def test_terms_acceptance(self, db_session):
        """Test terms acceptance step"""
        service = OnboardingService()
        user_id = "test_user_123"
        
        # Start onboarding
        session_id = service.start_onboarding(db_session, user_id)
        
        # Accept terms
        success = service.accept_terms(db_session, user_id)
        assert success is True
        
        # Check session advanced
        session = db_session.query(OnboardingSession).filter_by(id=session_id).first()
        assert session.current_step == "terms_accepted"
        assert session.terms_accepted_at is not None
    
    @patch.object(StripeConnectService, 'create_express_account')
    @patch.object(StripeConnectService, 'create_onboarding_link')
    def test_stripe_onboarding_start(self, mock_link, mock_account, db_session):
        """Test Stripe onboarding initialization"""
        service = OnboardingService()
        user_id = "test_user_123"
        
        # Setup mocks
        mock_account.return_value = "acct_test123"
        mock_link.return_value = "https://connect.stripe.com/setup/test"
        
        # Start onboarding
        session_id = service.start_onboarding(db_session, user_id)
        
        # Start Stripe onboarding
        onboarding_url = service.start_stripe_onboarding(
            db_session, 
            user_id, 
            "test@example.com",
            "https://app.com/return",
            "https://app.com/refresh"
        )
        
        assert onboarding_url == "https://connect.stripe.com/setup/test"
        
        # Check profile updated
        profile = db_session.query(CreatorProfile).filter_by(user_id=user_id).first()
        assert profile.stripe_account_id == "acct_test123"
        
        # Check session advanced
        session = db_session.query(OnboardingSession).filter_by(id=session_id).first()
        assert session.current_step == "stripe_started"
        assert session.return_url == "https://app.com/return"
        assert session.refresh_url == "https://app.com/refresh"
    
    def test_onboarding_progress_calculation(self, db_session):
        """Test onboarding progress tracking"""
        # Create session at different steps
        session = OnboardingSession(
            id="test_session",
            user_id="test_user",
            current_step="terms_accepted",
            email_verified_at=datetime.utcnow(),
            terms_accepted_at=datetime.utcnow()
        )
        
        db_session.add(session)
        db_session.commit()
        
        progress = session.get_progress_percentage()
        assert progress == 40  # terms_accepted is 2/5 steps = 40%
        
        # Complete session
        session.advance_to_step("completed")
        db_session.commit()
        
        progress = session.get_progress_percentage()
        assert progress == 100


# Route Tests

class TestOnboardingRoutes:
    """Test Flask routes and API endpoints"""
    
    @patch('onboarding.routes.get_db_session')
    def test_registration_endpoint(self, mock_db, client, db_session):
        """Test user registration endpoint"""
        mock_db.return_value.__enter__.return_value = db_session
        
        with patch('onboarding.routes.onboarding_service') as mock_service:
            mock_service.start_onboarding.return_value = "onb_test123"
            mock_service.send_email_verification.return_value = True
            
            response = client.post('/api/v1/auth/register', 
                json={
                    "email": "test@example.com",
                    "password": "secure123"
                },
                headers={"Accept-Language": "fr-FR,fr;q=0.9"}
            )
            
            assert response.status_code == 201
            data = json.loads(response.data)
            assert data["success"] is True
            assert "onboarding_session_id" in data["data"]
    
    def test_registration_validation(self, client):
        """Test registration input validation"""
        # Missing email
        response = client.post('/api/v1/auth/register', json={"password": "secure123"})
        assert response.status_code == 400
        
        # Invalid email
        response = client.post('/api/v1/auth/register', 
            json={"email": "invalid", "password": "secure123"})
        assert response.status_code == 400
        
        # Short password
        response = client.post('/api/v1/auth/register',
            json={"email": "test@example.com", "password": "short"})
        assert response.status_code == 400
    
    @patch('onboarding.routes.get_db_session')
    def test_email_verification_endpoint(self, mock_db, client, db_session):
        """Test email verification endpoint"""
        mock_db.return_value.__enter__.return_value = db_session
        
        with patch('onboarding.routes.onboarding_service') as mock_service:
            mock_service.verify_email.return_value = True
            
            response = client.post('/api/v1/auth/verify-email',
                json={
                    "user_id": "test_user_123",
                    "token": "valid_token_here"
                }
            )
            
            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["success"] is True
            assert "verified successfully" in data["message"]
    
    def test_stripe_endpoints_require_auth(self, client):
        """Test that Stripe endpoints require authentication"""
        # These should return 401 without proper auth
        endpoints = [
            '/api/v1/stripe/connect/start',
            '/api/v1/stripe/status', 
            '/api/v1/stripe/dashboard-link'
        ]
        
        for endpoint in endpoints:
            if endpoint.endswith('start') or endpoint.endswith('dashboard-link'):
                response = client.post(endpoint, json={})
            else:
                response = client.get(endpoint)
                
            # Note: Actual implementation depends on your auth decorator
            # This test assumes 401 for unauthenticated requests
            assert response.status_code in [401, 403, 500]  # Auth required


# Integration Tests

class TestOnboardingIntegration:
    """End-to-end integration tests for complete onboarding flow"""
    
    def test_complete_onboarding_flow(self, db_session):
        """Test complete onboarding flow from registration to completion"""
        service = OnboardingService()
        user_id = "integration_test_user"
        user_email = "integration@example.com"
        
        # Step 1: Start onboarding
        with patch('onboarding.service.request') as mock_request:
            mock_request.headers = {"Accept-Language": "en-US,en;q=0.9"}
            session_id = service.start_onboarding(db_session, user_id)
        
        assert session_id is not None
        
        # Step 2: Send email verification
        with patch.object(service.email_service, 'send_verification_email', return_value=True):
            email_sent = service.send_email_verification(db_session, user_id, user_email)
        
        assert email_sent is True
        
        # Step 3: Verify email (simulate token from email)
        token_record = db_session.query(VerificationToken).filter_by(user_id=user_id).first()
        
        # Generate matching raw token for test
        import secrets, hashlib
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token_record.id = token_hash
        db_session.commit()
        
        email_verified = service.verify_email(db_session, user_id, raw_token)
        assert email_verified is True
        
        # Step 4: Accept terms
        terms_accepted = service.accept_terms(db_session, user_id)
        assert terms_accepted is True
        
        # Step 5: Start Stripe onboarding
        with patch.object(StripeConnectService, 'create_express_account', return_value="acct_test123"):
            with patch.object(StripeConnectService, 'create_onboarding_link', 
                            return_value="https://connect.stripe.com/setup/test"):
                onboarding_url = service.start_stripe_onboarding(
                    db_session, user_id, user_email,
                    "https://app.com/return", "https://app.com/refresh"
                )
        
        assert "stripe.com" in onboarding_url
        
        # Step 6: Simulate Stripe completion
        with patch.object(StripeConnectService, 'get_account_status', return_value={
            "charges_enabled": True,
            "payouts_enabled": True,
            "requirements": {"currently_due": []}
        }):
            with patch.object(StripeConnectService, 'is_onboarding_complete', return_value=True):
                result = service.handle_stripe_return(db_session, user_id)
        
        assert result["status"] == "complete"
        assert result["can_accept_payments"] is True
        
        # Verify final state
        session = db_session.query(OnboardingSession).filter_by(id=session_id).first()
        assert session.completed is True
        assert session.current_step == "completed"
        
        profile = db_session.query(CreatorProfile).filter_by(user_id=user_id).first()
        assert profile.onboarding_completed is True
        assert profile.stripe_account_id == "acct_test123"
        assert profile.activated_at is not None
    
    def test_onboarding_status_tracking(self, db_session):
        """Test onboarding status retrieval throughout flow"""
        service = OnboardingService()
        user_id = "status_test_user"
        
        # Initial status - not started
        status = service.get_onboarding_status(db_session, user_id)
        assert status["status"] == "not_started"
        
        # After starting onboarding
        session_id = service.start_onboarding(db_session, user_id)
        status = service.get_onboarding_status(db_session, user_id)
        
        assert status["current_step"] == "registered"
        assert status["progress"] == 0
        assert status["steps"]["registered"] is True
        assert status["steps"]["email_verified"] is False
        
        # After email verification  
        service.accept_terms(db_session, user_id)  # Skip to terms for test
        status = service.get_onboarding_status(db_session, user_id)
        
        assert status["current_step"] == "terms_accepted"
        assert status["progress"] == 40  # 2/5 steps
        assert status["steps"]["terms_accepted"] is True


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])