"""
SQLAlchemy models for onboarding system

Implements secure token-based email verification, creator profiles,
and onboarding session tracking for the pre-connection flow.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

# Use existing base from payment system
try:
    from marketing.backend.api.src.database import Base
except ImportError:
    Base = declarative_base()


class VerificationToken(Base):
    """
    Secure email verification tokens with TTL and single-use enforcement
    
    Follows OWASP recommendations:
    - Short TTL (30 minutes)
    - Cryptographically secure token generation
    - Single-use enforcement
    - Hash storage (not plaintext)
    """
    __tablename__ = "verification_tokens"
    
    id = Column(String(64), primary_key=True)  # SHA256 hash of raw token
    user_id = Column(String(50), ForeignKey("users.id"), nullable=False)
    purpose = Column(String(32), nullable=False, default="email_verify")
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def is_expired(self) -> bool:
        """Check if token has expired"""
        return datetime.utcnow() > self.expires_at
    
    def is_valid(self) -> bool:
        """Check if token is valid (not used and not expired)"""
        return not self.used and not self.is_expired()


class CreatorProfile(Base):
    """
    Creator profile with auto-detected locale and Stripe integration
    
    Marketing data populated post-activation:
    - OnlyFans handle (manual connection later)
    - Account size (auto-computed from stats)
    - Pricing tier (auto-computed from performance)
    - Language (auto-detected from Accept-Language header)
    - Timezone (auto-detected from JS Intl API)
    """
    __tablename__ = "creator_profiles"
    
    id = Column(String(50), primary_key=True, default=lambda: f"cp_{uuid.uuid4().hex[:12]}")
    user_id = Column(String(50), ForeignKey("users.id"), unique=True, nullable=False)
    
    # Public profile information
    public_name = Column(String(100), nullable=True)  # Nom public affiché
    description = Column(String(500), nullable=True)  # Bio ou description courte
    
    # OnlyFans connection (populated later)
    onlyfans_handle = Column(String(100), nullable=True)
    onlyfans_connected_at = Column(DateTime, nullable=True)
    
    # Auto-computed marketing data
    account_size = Column(String(20), nullable=True)  # "small", "medium", "large"
    pricing_tier = Column(String(20), nullable=True)  # "entry", "mid", "premium"
    content_categories = Column(JSON, default=list)
    
    # Auto-detected locale
    language = Column(String(5), nullable=True)  # ISO 639-1 (e.g., "fr", "en")
    timezone = Column(String(50), default="Europe/Paris")  # IANA timezone
    
    # Stripe Connect integration
    stripe_account_id = Column(String(100), nullable=True)
    stripe_onboarding_completed = Column(Boolean, default=False)
    stripe_charges_enabled = Column(Boolean, default=False)
    stripe_payouts_enabled = Column(Boolean, default=False)
    
    # Onboarding state
    onboarding_completed = Column(Boolean, default=False)
    activated_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def is_stripe_ready(self) -> bool:
        """Check if Stripe account is fully set up for transactions"""
        return (self.stripe_charges_enabled and 
                self.stripe_payouts_enabled and 
                self.stripe_onboarding_completed)
    
    def complete_activation(self):
        """Mark profile as fully activated"""
        self.onboarding_completed = True
        self.activated_at = datetime.utcnow()


class OnboardingSession(Base):
    """
    Tracks user progress through onboarding steps
    
    Steps:
    1. registered - User created, email sent
    2. email_verified - Email verification completed
    3. terms_accepted - CGU accepted
    4. stripe_started - Stripe Connect onboarding initiated
    5. stripe_completed - Stripe onboarding finished
    6. completed - Full onboarding complete
    """
    __tablename__ = "onboarding_sessions"
    
    id = Column(String(50), primary_key=True, default=lambda: f"onb_{uuid.uuid4().hex[:16]}")
    user_id = Column(String(50), ForeignKey("users.id"), nullable=False)
    
    # State tracking
    current_step = Column(String(50), default="registered")
    completed = Column(Boolean, default=False)
    
    # Step completion tracking
    email_verified_at = Column(DateTime, nullable=True)
    terms_accepted_at = Column(DateTime, nullable=True)
    stripe_started_at = Column(DateTime, nullable=True)
    stripe_completed_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # URLs for Stripe Connect flow
    return_url = Column(Text, nullable=True)
    refresh_url = Column(Text, nullable=True)
    
    # Metadata
    started_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def advance_to_step(self, step: str):
        """Advance to next onboarding step"""
        self.current_step = step
        self.updated_at = datetime.utcnow()
        
        # Set completion timestamps
        if step == "email_verified":
            self.email_verified_at = datetime.utcnow()
        elif step == "terms_accepted":
            self.terms_accepted_at = datetime.utcnow()
        elif step == "stripe_started":
            self.stripe_started_at = datetime.utcnow()
        elif step == "stripe_completed":
            self.stripe_completed_at = datetime.utcnow()
        elif step == "completed":
            self.completed = True
            self.completed_at = datetime.utcnow()
    
    def get_progress_percentage(self) -> int:
        """Calculate onboarding progress as percentage"""
        steps = ["registered", "email_verified", "terms_accepted", 
                "stripe_started", "stripe_completed", "completed"]
        try:
            current_index = steps.index(self.current_step)
            return int((current_index / (len(steps) - 1)) * 100)
        except ValueError:
            return 0


# User model extensions (if needed)
# Assumes existing User model has these fields added:
# - email_verified: Boolean (default=False)  
# - accepted_terms: Boolean (default=False)
# - accepted_terms_at: DateTime (nullable=True)