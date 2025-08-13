"""
SQLAlchemy models for business rules persistence

Provides database storage for dynamic business rules configuration
to enable hot-reload without code deployment.
"""

import uuid
import json
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, DateTime, JSON, Text, Integer
from sqlalchemy.ext.declarative import declarative_base

# Use existing base from payment system
try:
    from payment.src.database import Base
except ImportError:
    Base = declarative_base()


class CommissionRuleModel(Base):
    """Database model for commission rules"""
    __tablename__ = 'business_rules_commission'
    
    id = Column(String(50), primary_key=True, default=lambda: f"cr_{uuid.uuid4().hex[:12]}")
    tier_name = Column(String(20), nullable=False, unique=True)  # entry, mid, premium
    base_rate = Column(Float, nullable=False)  # Base commission rate (0.20 = 20%)
    min_rate = Column(Float, nullable=False)   # Minimum rate floor
    max_rate = Column(Float, nullable=False)   # Maximum rate ceiling
    
    # Volume thresholds stored as JSON array
    # Format: [{"threshold": 1000, "rate": 0.18}, ...]
    volume_thresholds = Column(JSON, nullable=False, default=list)
    
    # Validity period
    effective_date = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_date = Column(DateTime, nullable=True)
    
    # Audit fields
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Version control
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)


class MarketingStrategyModel(Base):
    """Database model for marketing strategies"""
    __tablename__ = 'business_rules_marketing'
    
    id = Column(String(50), primary_key=True, default=lambda: f"ms_{uuid.uuid4().hex[:12]}")
    account_size = Column(String(20), nullable=False, unique=True)  # micro, small, medium, large
    
    # Pricing suggestions as JSON
    # Format: {"entry": [5.0, 15.0], "mid": [10.0, 20.0], ...}
    pricing_suggestions = Column(JSON, nullable=False)
    
    # Content schedule as JSON
    # Format: {"instagram": 5, "tiktok": 3, ...}
    content_schedule = Column(JSON, nullable=False)
    
    # Target categories and tactics as JSON arrays
    target_categories = Column(JSON, default=list)
    engagement_tactics = Column(JSON, default=list)
    
    # Priority for resource allocation
    priority_score = Column(Float, default=1.0)
    
    # Audit fields
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Version control
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)


class FeatureFlagModel(Base):
    """Database model for feature flags"""
    __tablename__ = 'business_rules_feature_flags'
    
    id = Column(String(50), primary_key=True, default=lambda: f"ff_{uuid.uuid4().hex[:12]}")
    feature_name = Column(String(100), nullable=False, unique=True)
    is_enabled = Column(Boolean, nullable=False, default=False)
    
    # Optional A/B testing configuration
    ab_test_enabled = Column(Boolean, default=False)
    rollout_percentage = Column(Integer, default=100)  # 0-100
    
    # Description for documentation
    description = Column(Text, nullable=True)
    
    # Audit fields
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_by = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Version control
    version = Column(Integer, default=1)


class RulesAuditLog(Base):
    """Audit log for all business rules changes"""
    __tablename__ = 'business_rules_audit'
    
    id = Column(String(50), primary_key=True, default=lambda: f"ra_{uuid.uuid4().hex[:12]}")
    rule_type = Column(String(50), nullable=False)  # commission, marketing, feature_flags
    rule_id = Column(String(50), nullable=False)
    action = Column(String(20), nullable=False)  # create, update, delete, rollback
    
    # Store complete before/after state
    previous_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    
    # Change metadata
    change_reason = Column(Text, nullable=True)
    performed_by = Column(String(50), nullable=False)
    performed_at = Column(DateTime, default=datetime.utcnow)
    
    # Version tracking
    from_version = Column(Integer, nullable=True)
    to_version = Column(Integer, nullable=True)