# 🔧 Guide d'Intégration - OFM Onboarding System

## 🎯 Vue d'Ensemble de l'Intégration

Le système d'onboarding s'intègre avec votre infrastructure existante via 4 points principaux :

1. **Authentication System** - JWT decorators
2. **Database Layer** - SQLAlchemy session factory  
3. **Task Queue** - Celery/RQ pour background tasks
4. **Email Service** - Provider configuration

---

## 🔗 Points d'Intégration Détaillés

### 1. **Authentication System Integration**

#### **Current State** (Placeholder)
```python
# onboarding/routes.py - ACTUEL
def require_auth(roles=None):
    """Placeholder - implement with your auth system"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not hasattr(request, 'user_id'):
                return error_response("Authentication required", 401)
            return f(*args, **kwargs)
        return decorated_function
    return decorator
```

#### **Integration Required** 
```python
# À remplacer par votre système existant
from marketing.backend.api.src.middleware.auth import jwt_required, get_current_user

def require_auth(roles=None):
    """Integration avec système JWT existant"""
    def decorator(f):
        @wraps(f)
        @jwt_required
        def decorated_function(*args, **kwargs):
            current_user = get_current_user()
            
            # Set request attributes for onboarding service
            request.user_id = current_user.id
            request.user_email = current_user.email
            request.user_roles = current_user.roles
            
            # Role validation
            if roles and not any(role in current_user.roles for role in roles):
                return error_response("Insufficient permissions", 403)
                
            return f(*args, **kwargs)
        return decorated_function
    return decorator
```

### 2. **Database Session Integration**

#### **Current State** (Placeholder)
```python
# onboarding/routes.py - ACTUEL
def get_db_session() -> Session:
    """Get database session - integrate with your existing DB service"""
    raise NotImplementedError("Implement database session factory")
```

#### **Integration Required**
```python
# À remplacer par votre factory DB existant
from marketing.backend.api.src.database import db_service
from contextlib import contextmanager

@contextmanager
def get_db_session():
    """Intégration avec votre service DB existant"""
    session = db_service.get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

# Usage dans routes
@bp.route("/auth/register", methods=["POST"])
def register():
    with get_db_session() as db:
        session_id = onboarding_service.start_onboarding(db, user_id)
        # ...
```

### 3. **Database Models Integration**

#### **Migration Required**
```sql
-- onboarding/migrations/001_onboarding_tables.sql
-- À ajouter à votre système de migrations existant

-- 1. Extend users table (if needed)
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN accepted_terms BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN accepted_terms_at TIMESTAMP;

-- 2. Create onboarding tables
CREATE TABLE verification_tokens (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(32) NOT NULL DEFAULT 'email_verify',
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verification_tokens_user_id ON verification_tokens(user_id);
CREATE INDEX idx_verification_tokens_expires_at ON verification_tokens(expires_at);

CREATE TABLE creator_profiles (
    id VARCHAR(50) PRIMARY KEY DEFAULT ('cp_' || substring(gen_random_uuid()::text, 1, 12)),
    user_id VARCHAR(50) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    onlyfans_handle VARCHAR(100),
    onlyfans_connected_at TIMESTAMP,
    account_size VARCHAR(20),
    pricing_tier VARCHAR(20), 
    content_categories JSONB DEFAULT '[]',
    language VARCHAR(5),
    timezone VARCHAR(50) DEFAULT 'Europe/Paris',
    stripe_account_id VARCHAR(100),
    stripe_onboarding_completed BOOLEAN DEFAULT FALSE,
    stripe_charges_enabled BOOLEAN DEFAULT FALSE,
    stripe_payouts_enabled BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    activated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_creator_profiles_user_id ON creator_profiles(user_id);
CREATE INDEX idx_creator_profiles_stripe_account ON creator_profiles(stripe_account_id);

CREATE TABLE onboarding_sessions (
    id VARCHAR(50) PRIMARY KEY DEFAULT ('onb_' || substring(gen_random_uuid()::text, 1, 16)),
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    current_step VARCHAR(50) DEFAULT 'registered',
    completed BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP,
    terms_accepted_at TIMESTAMP,
    stripe_started_at TIMESTAMP,
    stripe_completed_at TIMESTAMP,
    completed_at TIMESTAMP,
    return_url TEXT,
    refresh_url TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_onboarding_sessions_user_id ON onboarding_sessions(user_id);
```

### 4. **Task Queue Integration**

#### **Current State** (Placeholder)
```python
# onboarding/tasks/marketing_auto.py - ACTUEL
def schedule_account_size_analysis(user_id: str):
    """Placeholder - implement with your task queue"""
    logger.info(f"Would schedule account size analysis for user {user_id}")
```

#### **Celery Integration**
```python
# À décommenter et configurer dans marketing_auto.py
from celery import Celery
from marketing.backend.api.src.temporal.marketingClient import celery_app

@celery_app.task(bind=True, max_retries=3)
def schedule_account_size_analysis(self, user_id: str):
    """
    Celery task pour analyse taille compte OnlyFans
    """
    try:
        service = MarketingAutomationService(get_db_session_factory())
        success = service.process_new_creator(user_id)
        
        if not success:
            raise MarketingAnalysisError("Account analysis failed")
            
        logger.info(f"Account size analysis completed for user {user_id}")
        
    except Exception as e:
        logger.error(f"Account analysis failed for user {user_id}: {str(e)}")
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))

# Registration dans onboarding/service.py
def _schedule_marketing_automation(self, user_id: str):
    """Schedule background tasks après activation Stripe"""
    try:
        from .tasks.marketing_auto import (
            schedule_account_size_analysis,
            schedule_pricing_tier_calculation,
            schedule_content_category_detection
        )
        
        # Schedule avec delay pour éviter surcharge
        schedule_account_size_analysis.delay(user_id)
        schedule_pricing_tier_calculation.apply_async(args=[user_id], countdown=300)  # 5min delay
        schedule_content_category_detection.apply_async(args=[user_id], countdown=600)  # 10min delay
        
    except ImportError:
        logger.warning("Task queue not available - implement Celery integration")
```

### 5. **Email Service Integration**

#### **SendGrid Configuration** (Recommandé)
```python
# .env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your_sendgrid_api_key_here
FROM_EMAIL=noreply@ofm.com
SUPPORT_EMAIL=support@ofm.com

# Vérifier templates SendGrid
# 1. Créer template "email-verification" 
# 2. Configurer variables: {{verification_url}}, {{user_email}}, {{expires_minutes}}
```

#### **Alternative AWS SES**
```python
# .env  
EMAIL_PROVIDER=ses
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_DEFAULT_REGION=eu-west-1
FROM_EMAIL=noreply@ofm.com

# IAM Policy required:
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        }
    ]
}
```

### 6. **Flask App Integration**

#### **Blueprint Registration**
```python
# app.py ou main.py - À ajouter
from onboarding import onboarding_bp

app = Flask(__name__)

# Register onboarding blueprint
app.register_blueprint(onboarding_bp)

# Ensure CORS is configured for onboarding endpoints
from flask_cors import CORS
CORS(app, origins=["https://app.ofm.com", "http://localhost:3000"])
```

---

## 🔧 Configuration Environment

### **Environment Variables Required**
```bash
# Database (utilise votre config existante)
DATABASE_URL=postgresql://user:pass@localhost/ofm_database

# Stripe Connect (NOUVEAU - onboarding)
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Frontend URLs (NOUVEAU)
FRONTEND_URL=https://app.ofm.com
FRONTEND_RETURN_URL=https://app.ofm.com/onboarding/stripe-return
FRONTEND_REFRESH_URL=https://app.ofm.com/onboarding/stripe-refresh

# Email Service (NOUVEAU)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your_sendgrid_api_key
FROM_EMAIL=noreply@ofm.com
SUPPORT_EMAIL=support@ofm.com

# JWT (utilise votre config existante)  
JWT_SECRET=your-existing-jwt-secret

# Feature Flags (NOUVEAU)
FEATURE_EMAIL_VERIFICATION=true
FEATURE_STRIPE_CONNECT=true
FEATURE_MARKETING_AUTOMATION=true
```

### **Stripe Webhook Configuration**
```bash
# 1. Créer webhook endpoint dans Stripe Dashboard
# URL: https://api.ofm.com/api/v1/webhooks/stripe
# Events: account.updated, capability.updated, person.created

# 2. Copier webhook secret dans .env
STRIPE_WEBHOOK_SECRET=whsec_...

# 3. Test webhook
curl -X POST https://api.ofm.com/api/v1/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=..." \
  -d '{...}'
```

---

## 🧪 Tests d'Intégration

### **Test Environment Setup**
```bash
# 1. Install test dependencies
pip install pytest pytest-mock sqlalchemy-utils

# 2. Create test database
createdb ofm_test

# 3. Set test environment variables
export TEST_DATABASE_URL=postgresql://user:pass@localhost/ofm_test
export USE_MOCK_EMAIL=true
export USE_MOCK_STRIPE=true

# 4. Run migrations sur test DB
python -c "
from onboarding.models import Base
from sqlalchemy import create_engine
engine = create_engine(os.getenv('TEST_DATABASE_URL'))
Base.metadata.create_all(engine)
"

# 5. Run tests
pytest onboarding/tests/ -v --cov=onboarding --cov-report=html
```

### **Integration Test Example**
```python
# tests/test_integration.py - À créer
import pytest
from flask import Flask
from onboarding import onboarding_bp

@pytest.fixture
def app():
    """Flask app with onboarding integration"""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['DATABASE_URL'] = os.getenv('TEST_DATABASE_URL')
    
    # Register blueprint
    app.register_blueprint(onboarding_bp)
    
    # Mock auth decorator
    def mock_require_auth(roles=None):
        def decorator(f):
            @wraps(f)
            def decorated(*args, **kwargs):
                request.user_id = "test_user_123" 
                request.user_email = "test@example.com"
                request.user_roles = ["creator"]
                return f(*args, **kwargs)
            return decorated
        return decorator
    
    # Patch auth decorator
    onboarding.routes.require_auth = mock_require_auth
    
    return app

def test_complete_onboarding_integration(client, db_session):
    """Test complet d'intégration avec votre système"""
    
    # 1. Registration
    response = client.post('/api/v1/auth/register', json={
        "email": "integration@example.com",
        "password": "securepassword123"
    })
    assert response.status_code == 201
    
    # 2. Email verification
    # ... simulate email verification
    
    # 3. Stripe onboarding
    response = client.post('/api/v1/stripe/connect/start', json={
        "return_url": "https://app.ofm.com/return",
        "refresh_url": "https://app.ofm.com/refresh"
    })
    assert response.status_code == 200
    assert "onboarding_url" in response.json["data"]
```

---

## 🚀 Deployment Steps

### **Phase 1: Database Setup**
```bash
# 1. Run migrations
alembic upgrade head  # ou votre système migration

# 2. Verify tables created
psql $DATABASE_URL -c "\dt" | grep -E "(verification_tokens|creator_profiles|onboarding_sessions)"

# 3. Create indexes if needed
psql $DATABASE_URL -f onboarding/migrations/001_onboarding_tables.sql
```

### **Phase 2: Environment Configuration**
```bash
# 1. Update production .env
cp .env.example .env.production
# Edit with production values

# 2. Test Stripe connection
python -c "
import stripe, os
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
print('Stripe connection:', stripe.Account.list(limit=1))
"

# 3. Test email service
python -c "
from onboarding.emailer import EmailService
service = EmailService()
success = service.send_verification_email('test@example.com', 'test_token', 'test_user')
print('Email test:', success)
"
```

### **Phase 3: Application Deployment**
```bash
# 1. Build Docker image (si applicable)
docker build -t ofm-onboarding:latest .

# 2. Deploy avec rolling update
kubectl set image deployment/ofm-api ofm-api=ofm-onboarding:latest

# 3. Verify health
curl https://api.ofm.com/health
curl https://api.ofm.com/api/v1/onboarding/status -H "Authorization: Bearer $JWT_TOKEN"
```

### **Phase 4: Monitoring Setup**
```bash
# 1. Import Grafana dashboard
# File: analysis-report/grafana-dashboard.json

# 2. Configure alertes
# File: analysis-report/prometheus-alerts.yml

# 3. Test metrics endpoint
curl https://api.ofm.com/metrics | grep ofm_onboarding
```

---

## ⚠️ Checklist de Validation

### **Pre-Production Checklist**

#### **🔐 Security**
- [ ] JWT auth integration tested
- [ ] Stripe webhook signatures verified
- [ ] Email tokens cryptographically secure
- [ ] Rate limiting configured
- [ ] CORS origins restricted
- [ ] HTTPS enforced

#### **🗄️ Database**
- [ ] All migrations applied
- [ ] Indexes created and optimized
- [ ] Backup strategy configured
- [ ] Connection pooling optimized

#### **📧 Email Service**
- [ ] Provider configured (SendGrid/SES)
- [ ] Templates tested in multiple languages
- [ ] Delivery rates monitored
- [ ] Bounce handling configured

#### **💳 Stripe Integration**
- [ ] Express accounts creation tested
- [ ] Onboarding links generation working
- [ ] Webhook events processed correctly
- [ ] Account status sync verified

#### **🎯 Background Tasks**
- [ ] Celery/task queue configured
- [ ] Marketing automation tasks scheduled
- [ ] Error handling and retries working
- [ ] Monitoring and logging active

#### **📊 Monitoring**
- [ ] Prometheus metrics exposed
- [ ] Grafana dashboards imported
- [ ] Alerts configured
- [ ] Log aggregation setup

#### **🧪 Testing**
- [ ] Unit tests passing (95%+ coverage)
- [ ] Integration tests verified
- [ ] Load testing completed
- [ ] End-to-end scenarios validated

---

## 📞 Support et Troubleshooting

### **Common Issues**

#### **Database Connection**
```python
# Error: "relation verification_tokens does not exist"
# Solution: Run migrations
alembic upgrade head
```

#### **Stripe API Errors**
```python  
# Error: "No such account: acct_..."
# Solution: Check Stripe keys environment
import stripe, os
print("Stripe mode:", stripe.api_key[:7])  # Should be sk_live or sk_test
```

#### **Email Delivery Issues**
```python
# Error: "SENDGRID_API_KEY not configured"
# Solution: Check email provider config
from onboarding.emailer import EmailService
service = EmailService()
print("Email provider:", type(service.email_provider).__name__)
```

### **Logging Configuration**
```python
# Enhanced logging pour debugging
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/ofm/onboarding.log'),
        logging.StreamHandler()
    ]
)

# Specific onboarding logger
onboarding_logger = logging.getLogger('onboarding')
onboarding_logger.setLevel(logging.DEBUG)
```

---

**🎯 Cette intégration transforme votre système existant en ajoutant un onboarding friction-free avec toutes les bonnes pratiques security et UX.**