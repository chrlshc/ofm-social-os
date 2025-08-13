"""
Business Rules Engine for OFM Onboarding

Provides dynamic configuration of business logic without code deployment:
- Commission rates and degressive scales
- Marketing strategies by creator tier
- Onboarding flow customization
- Feature flags and A/B testing rules

Supports hot-reload and real-time rule updates via admin dashboard.
"""

import json
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import redis
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class RuleType(Enum):
    """Types of business rules supported"""
    COMMISSION = "commission"
    MARKETING = "marketing"
    ONBOARDING = "onboarding" 
    FEATURE_FLAGS = "feature_flags"
    A_B_TESTING = "ab_testing"


@dataclass
class CommissionRule:
    """Commission calculation rule"""
    tier: str  # entry, mid, premium
    base_rate: float  # Base commission rate (e.g., 0.20 = 20%)
    volume_thresholds: List[Dict[str, float]]  # [{"threshold": 1000, "rate": 0.18}, ...]
    min_rate: float  # Minimum commission rate (floor)
    max_rate: float  # Maximum commission rate (ceiling)
    effective_date: datetime
    expires_date: Optional[datetime] = None


@dataclass  
class MarketingStrategy:
    """Marketing strategy configuration"""
    account_size: str  # micro, small, medium, large
    pricing_suggestions: Dict[str, Tuple[float, float]]  # tier -> (min, max) price
    content_schedule: Dict[str, int]  # platform -> posts_per_week
    target_categories: List[str]
    engagement_tactics: List[str]
    priority_score: float  # For resource allocation


@dataclass
class OnboardingRule:
    """Onboarding flow customization"""
    user_segment: str  # new_creator, experienced, verified, etc.
    required_steps: List[str]
    optional_steps: List[str]
    skip_conditions: Dict[str, Any]
    custom_messaging: Dict[str, str]
    time_limits: Dict[str, int]  # step -> minutes


class BusinessRulesEngine:
    """
    Central engine for managing all business rules
    
    Features:
    - Hot-reload configuration without restart
    - Redis caching for performance
    - Versioning and rollback capability
    - A/B testing support
    - Audit logging for compliance
    """
    
    def __init__(self, db_session_factory, redis_client: Optional[redis.Redis] = None):
        self.db_session_factory = db_session_factory
        self.redis = redis_client or redis.Redis.from_url("redis://localhost:6379/2")
        self.cache_ttl = 300  # 5 minutes cache
        self.rules_cache = {}
        self.version = self._get_current_version()
        
        # Load initial rules
        self._load_all_rules()
    
    def _get_cache_key(self, rule_type: RuleType, identifier: str = "") -> str:
        """Generate Redis cache key"""
        base_key = f"ofm:rules:{rule_type.value}"
        return f"{base_key}:{identifier}" if identifier else base_key
    
    def _get_current_version(self) -> str:
        """Get current rules version for cache invalidation"""
        try:
            version = self.redis.get("ofm:rules:version")
            return version.decode() if version else "1.0.0"
        except:
            return "1.0.0"
    
    def _load_all_rules(self):
        """Load all rules from database and cache"""
        try:
            with self.db_session_factory() as db:
                # Load from rules configuration table
                self._load_commission_rules(db)
                self._load_marketing_strategies(db) 
                self._load_onboarding_rules(db)
                self._load_feature_flags(db)
                
            logger.info(f"Loaded business rules version {self.version}")
            
        except Exception as e:
            logger.error(f"Failed to load business rules: {str(e)}")
            self._load_default_rules()
    
    def _load_default_rules(self):
        """Load sensible default rules when database is unavailable"""
        logger.warning("Loading default business rules as fallback")
        
        # Default commission rules
        self.rules_cache[RuleType.COMMISSION] = {
            "entry": CommissionRule(
                tier="entry",
                base_rate=0.20,  # 20% base commission
                volume_thresholds=[
                    {"threshold": 1000, "rate": 0.18},
                    {"threshold": 5000, "rate": 0.15},
                    {"threshold": 10000, "rate": 0.12}
                ],
                min_rate=0.10,
                max_rate=0.25,
                effective_date=datetime.utcnow()
            ),
            "mid": CommissionRule(
                tier="mid", 
                base_rate=0.18,
                volume_thresholds=[
                    {"threshold": 2000, "rate": 0.15},
                    {"threshold": 10000, "rate": 0.12},
                    {"threshold": 25000, "rate": 0.10}
                ],
                min_rate=0.08,
                max_rate=0.20,
                effective_date=datetime.utcnow()
            ),
            "premium": CommissionRule(
                tier="premium",
                base_rate=0.15,
                volume_thresholds=[
                    {"threshold": 5000, "rate": 0.12},
                    {"threshold": 20000, "rate": 0.10},
                    {"threshold": 50000, "rate": 0.08}
                ],
                min_rate=0.05,
                max_rate=0.18,
                effective_date=datetime.utcnow()
            )
        }
        
        # Default marketing strategies
        self.rules_cache[RuleType.MARKETING] = {
            "micro": MarketingStrategy(
                account_size="micro",
                pricing_suggestions={
                    "entry": (5.0, 15.0),
                    "mid": (10.0, 20.0), 
                    "premium": (15.0, 25.0)
                },
                content_schedule={
                    "instagram": 5,
                    "tiktok": 3,
                    "twitter": 7,
                    "onlyfans": 4
                },
                target_categories=["lifestyle", "fitness"],
                engagement_tactics=["polls", "q_and_a", "behind_scenes"],
                priority_score=1.0
            ),
            "small": MarketingStrategy(
                account_size="small",
                pricing_suggestions={
                    "entry": (10.0, 25.0),
                    "mid": (20.0, 40.0),
                    "premium": (30.0, 60.0)
                },
                content_schedule={
                    "instagram": 7,
                    "tiktok": 5,
                    "twitter": 10,
                    "onlyfans": 6
                },
                target_categories=["lifestyle", "fitness", "fashion"],
                engagement_tactics=["live_streams", "collaborations", "contests"],
                priority_score=2.0
            )
        }
        
        # Default feature flags
        self.rules_cache[RuleType.FEATURE_FLAGS] = {
            "email_verification": True,
            "stripe_connect": True,
            "marketing_automation": True,
            "onlyfans_scraping": False,  # Disabled by default for compliance
            "mobile_optimizations": True,
            "advanced_analytics": False,
            "beta_features": False
        }
    
    def get_commission_rate(self, creator_tier: str, monthly_volume: float) -> float:
        """
        Calculate commission rate based on tier and volume
        
        Args:
            creator_tier: entry, mid, or premium
            monthly_volume: Creator's monthly revenue volume
            
        Returns:
            Commission rate as decimal (0.15 = 15%)
        """
        try:
            cache_key = self._get_cache_key(RuleType.COMMISSION, creator_tier)
            cached = self.redis.get(cache_key)
            
            if cached:
                rule_data = json.loads(cached)
                rule = CommissionRule(**rule_data)
            else:
                rules = self.rules_cache.get(RuleType.COMMISSION, {})
                rule = rules.get(creator_tier)
                
                if not rule:
                    logger.warning(f"No commission rule found for tier {creator_tier}, using default")
                    return 0.20  # Default 20%
                
                # Cache the rule
                self.redis.setex(cache_key, self.cache_ttl, json.dumps(asdict(rule), default=str))
            
            # Apply degressive scale
            rate = rule.base_rate
            
            for threshold_rule in sorted(rule.volume_thresholds, key=lambda x: x["threshold"]):
                if monthly_volume >= threshold_rule["threshold"]:
                    rate = threshold_rule["rate"]
                else:
                    break
            
            # Apply min/max constraints
            rate = max(rule.min_rate, min(rule.max_rate, rate))
            
            logger.debug(f"Commission rate for {creator_tier} (${monthly_volume}): {rate:.2%}")
            return rate
            
        except Exception as e:
            logger.error(f"Error calculating commission rate: {str(e)}")
            return 0.20  # Safe default
    
    def get_marketing_strategy(self, account_size: str, creator_categories: List[str] = None) -> Optional[MarketingStrategy]:
        """
        Get marketing strategy for creator based on account size and categories
        
        Args:
            account_size: micro, small, medium, or large
            creator_categories: List of content categories
            
        Returns:
            MarketingStrategy object or None
        """
        try:
            cache_key = self._get_cache_key(RuleType.MARKETING, account_size)
            cached = self.redis.get(cache_key)
            
            if cached:
                strategy_data = json.loads(cached)
                strategy = MarketingStrategy(**strategy_data)
            else:
                strategies = self.rules_cache.get(RuleType.MARKETING, {})
                strategy = strategies.get(account_size)
                
                if not strategy:
                    logger.warning(f"No marketing strategy found for account size {account_size}")
                    return None
                
                # Cache the strategy
                self.redis.setex(cache_key, self.cache_ttl, json.dumps(asdict(strategy), default=str))
            
            # Customize based on creator categories if provided
            if creator_categories:
                strategy = self._customize_strategy_for_categories(strategy, creator_categories)
            
            return strategy
            
        except Exception as e:
            logger.error(f"Error getting marketing strategy: {str(e)}")
            return None
    
    def _customize_strategy_for_categories(self, base_strategy: MarketingStrategy, categories: List[str]) -> MarketingStrategy:
        """Customize marketing strategy based on creator's content categories"""
        
        # Category-specific adjustments
        category_adjustments = {
            "fitness": {
                "content_schedule": {"instagram": +2, "tiktok": +1},
                "engagement_tactics": ["workout_challenges", "transformation_posts"]
            },
            "lifestyle": {
                "content_schedule": {"instagram": +1, "twitter": +2},
                "engagement_tactics": ["day_in_life", "product_reviews"]
            },
            "adult": {
                "content_schedule": {"onlyfans": +3},
                "engagement_tactics": ["exclusive_content", "personalized_messages"]
            }
        }
        
        # Apply adjustments
        customized = MarketingStrategy(**asdict(base_strategy))
        
        for category in categories:
            if category in category_adjustments:
                adjustments = category_adjustments[category]
                
                # Adjust content schedule
                for platform, adjustment in adjustments.get("content_schedule", {}).items():
                    if platform in customized.content_schedule:
                        customized.content_schedule[platform] += adjustment
                
                # Add engagement tactics
                customized.engagement_tactics.extend(adjustments.get("engagement_tactics", []))
        
        # Remove duplicates and ensure reasonable limits
        customized.engagement_tactics = list(set(customized.engagement_tactics))
        
        for platform in customized.content_schedule:
            customized.content_schedule[platform] = min(customized.content_schedule[platform], 20)  # Max 20 posts/week
        
        return customized
    
    def is_feature_enabled(self, feature_name: str, user_id: str = None) -> bool:
        """
        Check if a feature is enabled, with optional user-specific A/B testing
        
        Args:
            feature_name: Name of the feature flag
            user_id: Optional user ID for A/B testing
            
        Returns:
            True if feature is enabled for this user
        """
        try:
            cache_key = self._get_cache_key(RuleType.FEATURE_FLAGS)
            cached = self.redis.get(cache_key)
            
            if cached:
                flags = json.loads(cached)
            else:
                flags = self.rules_cache.get(RuleType.FEATURE_FLAGS, {})
                self.redis.setex(cache_key, self.cache_ttl, json.dumps(flags))
            
            base_enabled = flags.get(feature_name, False)
            
            # Check for A/B testing rules
            if user_id and base_enabled:
                ab_result = self._get_ab_test_result(feature_name, user_id)
                return ab_result
            
            return base_enabled
            
        except Exception as e:
            logger.error(f"Error checking feature flag {feature_name}: {str(e)}")
            return False
    
    def _get_ab_test_result(self, feature_name: str, user_id: str) -> bool:
        """Determine A/B test result for user and feature"""
        
        # Simple hash-based A/B testing
        # In production, use more sophisticated A/B testing service
        hash_value = hash(f"{feature_name}:{user_id}") % 100
        
        # Get A/B testing configuration
        ab_config = self.rules_cache.get(RuleType.A_B_TESTING, {}).get(feature_name, {})
        rollout_percentage = ab_config.get("rollout_percentage", 100)
        
        return hash_value < rollout_percentage
    
    def update_rules(self, rule_type: RuleType, rules_data: Dict[str, Any], admin_user_id: str) -> bool:
        """
        Update business rules dynamically without restart
        
        Args:
            rule_type: Type of rules to update
            rules_data: New rules configuration
            admin_user_id: ID of admin making the change
            
        Returns:
            True if update successful
        """
        try:
            # Validate rules data
            if not self._validate_rules_data(rule_type, rules_data):
                logger.error(f"Invalid rules data for {rule_type}")
                return False
            
            # Create backup of current rules
            self._backup_current_rules(rule_type, admin_user_id)
            
            # Update rules cache
            self.rules_cache[rule_type] = rules_data
            
            # Clear Redis cache to force reload
            pattern = self._get_cache_key(rule_type, "*")
            keys = self.redis.keys(pattern)
            if keys:
                self.redis.delete(*keys)
            
            # Update version
            new_version = f"{self.version.split('.')[0]}.{int(self.version.split('.')[1]) + 1}.0"
            self.redis.set("ofm:rules:version", new_version)
            self.version = new_version
            
            # Persist to database
            self._persist_rules_to_db(rule_type, rules_data)
            
            # Audit log
            self._log_rules_update(rule_type, admin_user_id, new_version)
            
            logger.info(f"Successfully updated {rule_type.value} rules to version {new_version}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update rules: {str(e)}")
            return False
    
    def _validate_rules_data(self, rule_type: RuleType, rules_data: Dict[str, Any]) -> bool:
        """Validate rules data structure and values"""
        
        if rule_type == RuleType.COMMISSION:
            for tier, rule_data in rules_data.items():
                if not isinstance(rule_data, dict):
                    return False
                
                required_fields = ["base_rate", "volume_thresholds", "min_rate", "max_rate"]
                if not all(field in rule_data for field in required_fields):
                    return False
                
                # Validate rate ranges
                if not (0 <= rule_data["base_rate"] <= 1):
                    return False
                if not (0 <= rule_data["min_rate"] <= rule_data["max_rate"] <= 1):
                    return False
        
        elif rule_type == RuleType.FEATURE_FLAGS:
            if not isinstance(rules_data, dict):
                return False
            
            # All feature flags should be boolean
            if not all(isinstance(v, bool) for v in rules_data.values()):
                return False
        
        return True
    
    def _backup_current_rules(self, rule_type: RuleType, admin_user_id: str):
        """Create backup of current rules before update"""
        backup_key = f"ofm:rules:backup:{rule_type.value}:{datetime.utcnow().isoformat()}"
        current_rules = self.rules_cache.get(rule_type, {})
        
        backup_data = {
            "rules": current_rules,
            "version": self.version,
            "admin_user_id": admin_user_id,
            "backup_time": datetime.utcnow().isoformat()
        }
        
        self.redis.setex(backup_key, 86400 * 7, json.dumps(backup_data, default=str))  # 7 days retention
    
    def _persist_rules_to_db(self, rule_type: RuleType, rules_data: Dict[str, Any]):
        """Persist rules to database for durability"""
        try:
            with self.db_session_factory() as db:
                if rule_type == RuleType.COMMISSION:
                    from .business_rules_models import CommissionRuleModel
                    
                    for tier_name, rule_data in rules_data.items():
                        existing = db.query(CommissionRuleModel).filter_by(tier_name=tier_name).first()
                        
                        if existing:
                            # Update existing rule
                            existing.base_rate = rule_data['base_rate']
                            existing.volume_thresholds = rule_data['volume_thresholds']
                            existing.min_rate = rule_data['min_rate']
                            existing.max_rate = rule_data['max_rate']
                            existing.version += 1
                            existing.updated_at = datetime.utcnow()
                        else:
                            # Create new rule
                            new_rule = CommissionRuleModel(
                                tier_name=tier_name,
                                base_rate=rule_data['base_rate'],
                                volume_thresholds=rule_data['volume_thresholds'],
                                min_rate=rule_data['min_rate'],
                                max_rate=rule_data['max_rate'],
                                created_by='admin'  # Should come from context
                            )
                            db.add(new_rule)
                
                elif rule_type == RuleType.MARKETING:
                    from .business_rules_models import MarketingStrategyModel
                    
                    for account_size, strategy_data in rules_data.items():
                        existing = db.query(MarketingStrategyModel).filter_by(account_size=account_size).first()
                        
                        if existing:
                            # Update existing strategy
                            existing.pricing_suggestions = strategy_data['pricing_suggestions']
                            existing.content_schedule = strategy_data['content_schedule']
                            existing.target_categories = strategy_data['target_categories']
                            existing.engagement_tactics = strategy_data['engagement_tactics']
                            existing.priority_score = strategy_data['priority_score']
                            existing.version += 1
                            existing.updated_at = datetime.utcnow()
                        else:
                            # Create new strategy
                            new_strategy = MarketingStrategyModel(
                                account_size=account_size,
                                pricing_suggestions=strategy_data['pricing_suggestions'],
                                content_schedule=strategy_data['content_schedule'],
                                target_categories=strategy_data['target_categories'],
                                engagement_tactics=strategy_data['engagement_tactics'],
                                priority_score=strategy_data['priority_score'],
                                created_by='admin'  # Should come from context
                            )
                            db.add(new_strategy)
                
                elif rule_type == RuleType.FEATURE_FLAGS:
                    from .business_rules_models import FeatureFlagModel
                    
                    for feature_name, is_enabled in rules_data.items():
                        existing = db.query(FeatureFlagModel).filter_by(feature_name=feature_name).first()
                        
                        if existing:
                            existing.is_enabled = is_enabled
                            existing.version += 1
                            existing.updated_at = datetime.utcnow()
                        else:
                            new_flag = FeatureFlagModel(
                                feature_name=feature_name,
                                is_enabled=is_enabled,
                                created_by='admin'  # Should come from context
                            )
                            db.add(new_flag)
                
                db.commit()
                logger.info(f"Persisted {rule_type.value} rules to database")
                
        except Exception as e:
            logger.error(f"Failed to persist rules to database: {str(e)}")
            raise
    
    def _load_commission_rules(self, db: Session):
        """Load commission rules from database"""
        try:
            from .business_rules_models import CommissionRuleModel
            
            rules = db.query(CommissionRuleModel).filter_by(is_active=True).all()
            self.rules_cache[RuleType.COMMISSION] = {}
            
            for rule in rules:
                commission_rule = CommissionRule(
                    tier=rule.tier_name,
                    base_rate=rule.base_rate,
                    volume_thresholds=rule.volume_thresholds,
                    min_rate=rule.min_rate,
                    max_rate=rule.max_rate,
                    effective_date=rule.effective_date,
                    expires_date=rule.expires_date
                )
                self.rules_cache[RuleType.COMMISSION][rule.tier_name] = commission_rule
                
            logger.info(f"Loaded {len(rules)} commission rules from database")
            
        except Exception as e:
            logger.error(f"Failed to load commission rules from DB: {str(e)}")
            # Fall back to defaults loaded earlier
    
    def _load_marketing_strategies(self, db: Session):
        """Load marketing strategies from database"""
        try:
            from .business_rules_models import MarketingStrategyModel
            
            strategies = db.query(MarketingStrategyModel).filter_by(is_active=True).all()
            self.rules_cache[RuleType.MARKETING] = {}
            
            for strategy in strategies:
                marketing_strategy = MarketingStrategy(
                    account_size=strategy.account_size,
                    pricing_suggestions=strategy.pricing_suggestions,
                    content_schedule=strategy.content_schedule,
                    target_categories=strategy.target_categories,
                    engagement_tactics=strategy.engagement_tactics,
                    priority_score=strategy.priority_score
                )
                self.rules_cache[RuleType.MARKETING][strategy.account_size] = marketing_strategy
                
            logger.info(f"Loaded {len(strategies)} marketing strategies from database")
            
        except Exception as e:
            logger.error(f"Failed to load marketing strategies from DB: {str(e)}")
            # Fall back to defaults loaded earlier
    
    def _load_onboarding_rules(self, db: Session):
        """Load onboarding rules from database"""
        # Not yet implemented - using defaults for now
        pass
    
    def _load_feature_flags(self, db: Session):
        """Load feature flags from database"""
        try:
            from .business_rules_models import FeatureFlagModel
            
            flags = db.query(FeatureFlagModel).all()
            self.rules_cache[RuleType.FEATURE_FLAGS] = {}
            
            for flag in flags:
                self.rules_cache[RuleType.FEATURE_FLAGS][flag.feature_name] = flag.is_enabled
                
                # Store A/B test config if enabled
                if flag.ab_test_enabled:
                    if RuleType.A_B_TESTING not in self.rules_cache:
                        self.rules_cache[RuleType.A_B_TESTING] = {}
                    
                    self.rules_cache[RuleType.A_B_TESTING][flag.feature_name] = {
                        "rollout_percentage": flag.rollout_percentage
                    }
                    
            logger.info(f"Loaded {len(flags)} feature flags from database")
            
        except Exception as e:
            logger.error(f"Failed to load feature flags from DB: {str(e)}")
            # Fall back to defaults loaded earlier
    
    def _log_rules_update(self, rule_type: RuleType, admin_user_id: str, new_version: str):
        """Log rules update for audit trail"""
        audit_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "rule_type": rule_type.value,
            "admin_user_id": admin_user_id,
            "version": new_version,
            "action": "update_rules"
        }
        
        # Store in audit log (Redis + Database)
        audit_key = f"ofm:audit:rules:{datetime.utcnow().strftime('%Y%m%d')}"
        self.redis.lpush(audit_key, json.dumps(audit_entry))
        self.redis.expire(audit_key, 86400 * 365)  # 1 year retention
        
        logger.info(f"Audit logged: {audit_entry}")
    
    def get_rules_version(self) -> str:
        """Get current rules version"""
        return self.version
    
    def get_audit_log(self, start_date: datetime, end_date: datetime) -> List[Dict]:
        """Get audit log entries for date range"""
        audit_entries = []
        
        current_date = start_date
        while current_date <= end_date:
            audit_key = f"ofm:audit:rules:{current_date.strftime('%Y%m%d')}"
            daily_entries = self.redis.lrange(audit_key, 0, -1)
            
            for entry_json in daily_entries:
                entry = json.loads(entry_json)
                entry_time = datetime.fromisoformat(entry["timestamp"])
                
                if start_date <= entry_time <= end_date:
                    audit_entries.append(entry)
            
            current_date += timedelta(days=1)
        
        return sorted(audit_entries, key=lambda x: x["timestamp"])


# Singleton instance for application use
rules_engine = None

def get_rules_engine(db_session_factory=None, redis_client=None) -> BusinessRulesEngine:
    """Get singleton rules engine instance"""
    global rules_engine
    
    if rules_engine is None:
        if not db_session_factory:
            raise ValueError("db_session_factory required for first initialization")
        
        rules_engine = BusinessRulesEngine(db_session_factory, redis_client)
    
    return rules_engine


def init_rules_engine(db_session_factory, redis_client=None):
    """Initialize rules engine at application startup"""
    global rules_engine
    rules_engine = BusinessRulesEngine(db_session_factory, redis_client)
    return rules_engine