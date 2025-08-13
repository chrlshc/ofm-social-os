"""
Tests for Business Rules Engine

Comprehensive testing of:
- Commission rate calculations with degressive scaling
- Marketing strategy retrieval and customization  
- Feature flags and A/B testing
- Rules updates and versioning
- Admin panel functionality
"""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

from onboarding.business_rules import (
    BusinessRulesEngine, RuleType, CommissionRule, MarketingStrategy,
    get_rules_engine, init_rules_engine
)


@pytest.fixture
def mock_redis():
    """Mock Redis client for testing"""
    redis_mock = Mock()
    redis_mock.get.return_value = None
    redis_mock.setex.return_value = True
    redis_mock.delete.return_value = 1
    redis_mock.keys.return_value = []
    redis_mock.set.return_value = True
    redis_mock.lpush.return_value = 1
    redis_mock.expire.return_value = True
    redis_mock.lrange.return_value = []
    return redis_mock


@pytest.fixture
def mock_db_session():
    """Mock database session factory"""
    session_mock = Mock()
    session_factory = Mock(return_value=session_mock)
    session_factory.__enter__ = Mock(return_value=session_mock)
    session_factory.__exit__ = Mock(return_value=None)
    return session_factory


@pytest.fixture
def rules_engine(mock_db_session, mock_redis):
    """Create rules engine instance for testing"""
    return BusinessRulesEngine(mock_db_session, mock_redis)


class TestCommissionRules:
    """Test commission rate calculations"""
    
    def test_basic_commission_calculation(self, rules_engine):
        """Test basic commission rate calculation"""
        # Test entry tier with low volume
        rate = rules_engine.get_commission_rate("entry", 500)
        assert rate == 0.20  # Base rate for entry tier
        
        # Test mid tier with medium volume
        rate = rules_engine.get_commission_rate("mid", 5000)
        assert rate == 0.15  # Should hit first threshold
        
        # Test premium tier with high volume
        rate = rules_engine.get_commission_rate("premium", 30000)
        assert rate == 0.10  # Should hit second threshold
    
    def test_degressive_scaling(self, rules_engine):
        """Test degressive commission scaling"""
        # Entry tier progression
        assert rules_engine.get_commission_rate("entry", 500) == 0.20    # Base rate
        assert rules_engine.get_commission_rate("entry", 1500) == 0.18   # First threshold
        assert rules_engine.get_commission_rate("entry", 7500) == 0.15   # Second threshold
        assert rules_engine.get_commission_rate("entry", 15000) == 0.12  # Third threshold
    
    def test_commission_rate_limits(self, rules_engine):
        """Test commission rate min/max constraints"""
        # Test minimum rate constraint
        very_high_volume = 1000000
        rate = rules_engine.get_commission_rate("entry", very_high_volume)
        assert rate >= 0.10  # Should not go below min_rate
        
        # Test that rate doesn't exceed max_rate (shouldn't happen with current logic)
        rate = rules_engine.get_commission_rate("entry", 0)
        assert rate <= 0.25  # Should not exceed max_rate
    
    def test_invalid_tier_handling(self, rules_engine):
        """Test handling of invalid creator tiers"""
        rate = rules_engine.get_commission_rate("invalid_tier", 1000)
        assert rate == 0.20  # Should return default rate
    
    def test_commission_with_redis_cache(self, rules_engine, mock_redis):
        """Test commission calculation with Redis caching"""
        # First call - should cache the result
        rules_engine.get_commission_rate("entry", 1000)
        
        # Verify Redis setex was called for caching
        mock_redis.setex.assert_called()
        
        # Second call with cached data
        cached_rule = json.dumps({
            "tier": "entry",
            "base_rate": 0.20,
            "volume_thresholds": [{"threshold": 1000, "rate": 0.18}],
            "min_rate": 0.10,
            "max_rate": 0.25,
            "effective_date": datetime.utcnow().isoformat()
        })
        mock_redis.get.return_value = cached_rule.encode()
        
        rate = rules_engine.get_commission_rate("entry", 1000)
        assert rate == 0.18  # Should use cached threshold rate


class TestMarketingStrategies:
    """Test marketing strategy functionality"""
    
    def test_basic_marketing_strategy_retrieval(self, rules_engine):
        """Test basic marketing strategy retrieval"""
        strategy = rules_engine.get_marketing_strategy("micro")
        
        assert strategy is not None
        assert strategy.account_size == "micro"
        assert "entry" in strategy.pricing_suggestions
        assert "instagram" in strategy.content_schedule
        assert isinstance(strategy.target_categories, list)
        assert isinstance(strategy.engagement_tactics, list)
    
    def test_strategy_customization_for_categories(self, rules_engine):
        """Test strategy customization based on content categories"""
        # Test fitness category customization
        base_strategy = rules_engine.get_marketing_strategy("small")
        fitness_strategy = rules_engine.get_marketing_strategy("small", ["fitness"])
        
        # Fitness creators should have increased Instagram/TikTok posting
        assert fitness_strategy.content_schedule["instagram"] >= base_strategy.content_schedule["instagram"]
        assert "workout_challenges" in fitness_strategy.engagement_tactics
    
    def test_strategy_with_multiple_categories(self, rules_engine):
        """Test strategy with multiple content categories"""
        strategy = rules_engine.get_marketing_strategy("medium", ["fitness", "lifestyle"])
        
        # Should include tactics from both categories
        assert any("workout" in tactic.lower() or "fitness" in tactic.lower() for tactic in strategy.engagement_tactics)
        assert any("life" in tactic.lower() or "day" in tactic.lower() for tactic in strategy.engagement_tactics)
    
    def test_invalid_account_size_handling(self, rules_engine):
        """Test handling of invalid account sizes"""
        strategy = rules_engine.get_marketing_strategy("invalid_size")
        assert strategy is None
    
    def test_content_schedule_limits(self, rules_engine):
        """Test that content schedule has reasonable limits"""
        # Test with many categories that might increase posting frequency
        strategy = rules_engine.get_marketing_strategy("large", ["fitness", "lifestyle", "adult"])
        
        # Ensure no platform exceeds maximum posts per week
        for platform, posts_per_week in strategy.content_schedule.items():
            assert posts_per_week <= 20, f"Platform {platform} exceeds maximum posts limit"


class TestFeatureFlags:
    """Test feature flags functionality"""
    
    def test_basic_feature_flag_check(self, rules_engine):
        """Test basic feature flag checking"""
        # Test enabled feature
        assert rules_engine.is_feature_enabled("email_verification") is True
        
        # Test disabled feature
        assert rules_engine.is_feature_enabled("onlyfans_scraping") is False
        
        # Test non-existent feature
        assert rules_engine.is_feature_enabled("non_existent_feature") is False
    
    def test_feature_flags_with_user_ab_testing(self, rules_engine):
        """Test feature flags with user-specific A/B testing"""
        # Mock A/B testing configuration
        rules_engine.rules_cache[RuleType.A_B_TESTING] = {
            "beta_features": {"rollout_percentage": 50}
        }
        
        # Test same user gets consistent result
        user_id = "test_user_123"
        result1 = rules_engine.is_feature_enabled("beta_features", user_id)
        result2 = rules_engine.is_feature_enabled("beta_features", user_id)
        assert result1 == result2  # Should be consistent for same user
    
    def test_feature_flags_with_redis_cache(self, rules_engine, mock_redis):
        """Test feature flags with Redis caching"""
        # Mock cached feature flags
        cached_flags = json.dumps({
            "email_verification": True,
            "stripe_connect": True,
            "marketing_automation": False
        })
        mock_redis.get.return_value = cached_flags.encode()
        
        assert rules_engine.is_feature_enabled("email_verification") is True
        assert rules_engine.is_feature_enabled("marketing_automation") is False


class TestRulesUpdates:
    """Test dynamic rules updates"""
    
    def test_commission_rules_update(self, rules_engine):
        """Test updating commission rules"""
        new_rules = {
            "entry": CommissionRule(
                tier="entry",
                base_rate=0.25,  # Increased base rate
                volume_thresholds=[{"threshold": 2000, "rate": 0.20}],
                min_rate=0.15,
                max_rate=0.30,
                effective_date=datetime.utcnow()
            )
        }
        
        success = rules_engine.update_rules(
            RuleType.COMMISSION,
            new_rules,
            "admin_123"
        )
        
        assert success is True
        
        # Verify rule was updated
        rate = rules_engine.get_commission_rate("entry", 1000)
        assert rate == 0.25  # Should use new base rate
    
    def test_feature_flags_update(self, rules_engine):
        """Test updating feature flags"""
        new_flags = {
            "email_verification": True,
            "stripe_connect": True,
            "marketing_automation": True,
            "onlyfans_scraping": True,  # Enable previously disabled feature
            "beta_features": True
        }
        
        success = rules_engine.update_rules(
            RuleType.FEATURE_FLAGS,
            new_flags,
            "admin_123"
        )
        
        assert success is True
        
        # Verify flag was updated
        assert rules_engine.is_feature_enabled("onlyfans_scraping") is True
    
    def test_invalid_rules_validation(self, rules_engine):
        """Test validation of invalid rules data"""
        # Test invalid commission rule (rate > 1.0)
        invalid_commission_rules = {
            "entry": {
                "base_rate": 1.5,  # Invalid: > 1.0
                "volume_thresholds": [],
                "min_rate": 0.1,
                "max_rate": 0.3
            }
        }
        
        success = rules_engine.update_rules(
            RuleType.COMMISSION,
            invalid_commission_rules,
            "admin_123"
        )
        
        assert success is False
    
    def test_rules_versioning(self, rules_engine):
        """Test rules versioning system"""
        initial_version = rules_engine.get_rules_version()
        
        # Update rules
        new_flags = {"test_flag": True}
        rules_engine.update_rules(RuleType.FEATURE_FLAGS, new_flags, "admin_123")
        
        # Version should have incremented
        new_version = rules_engine.get_rules_version()
        assert new_version != initial_version
    
    def test_rules_backup_creation(self, rules_engine, mock_redis):
        """Test that rules backup is created before update"""
        new_flags = {"test_flag": True}
        rules_engine.update_rules(RuleType.FEATURE_FLAGS, new_flags, "admin_123")
        
        # Verify backup was created (setex called for backup)
        backup_calls = [call for call in mock_redis.setex.call_args_list 
                       if 'backup' in str(call)]
        assert len(backup_calls) > 0


class TestAuditLogging:
    """Test audit logging functionality"""
    
    def test_audit_log_creation(self, rules_engine, mock_redis):
        """Test that audit log entries are created"""
        new_flags = {"test_flag": True}
        rules_engine.update_rules(RuleType.FEATURE_FLAGS, new_flags, "admin_123")
        
        # Verify audit log entry was created
        mock_redis.lpush.assert_called()
        mock_redis.expire.assert_called()
    
    def test_audit_log_retrieval(self, rules_engine, mock_redis):
        """Test audit log retrieval"""
        # Mock audit log entries
        mock_entries = [
            json.dumps({
                "timestamp": datetime.utcnow().isoformat(),
                "rule_type": "feature_flags",
                "admin_user_id": "admin_123", 
                "version": "1.1.0",
                "action": "update_rules"
            })
        ]
        mock_redis.lrange.return_value = mock_entries
        
        start_date = datetime.utcnow() - timedelta(days=1)
        end_date = datetime.utcnow()
        
        audit_entries = rules_engine.get_audit_log(start_date, end_date)
        
        assert len(audit_entries) == 1
        assert audit_entries[0]["admin_user_id"] == "admin_123"


class TestRulesEngineIntegration:
    """Test integration scenarios"""
    
    def test_full_creator_onboarding_scenario(self, rules_engine):
        """Test complete creator onboarding with rules engine"""
        # Simulate new creator onboarding
        creator_data = {
            "tier": "entry",
            "account_size": "micro",
            "monthly_volume": 800,
            "categories": ["lifestyle", "fitness"]
        }
        
        # Get commission rate
        commission_rate = rules_engine.get_commission_rate(
            creator_data["tier"], 
            creator_data["monthly_volume"]
        )
        assert 0.05 <= commission_rate <= 0.30  # Reasonable range
        
        # Get marketing strategy
        strategy = rules_engine.get_marketing_strategy(
            creator_data["account_size"],
            creator_data["categories"]
        )
        assert strategy is not None
        assert strategy.account_size == creator_data["account_size"]
        
        # Check feature access
        has_marketing_automation = rules_engine.is_feature_enabled("marketing_automation")
        assert isinstance(has_marketing_automation, bool)
    
    def test_high_volume_creator_scenario(self, rules_engine):
        """Test scenario with high-volume premium creator"""
        creator_data = {
            "tier": "premium", 
            "account_size": "large",
            "monthly_volume": 75000,
            "categories": ["adult", "lifestyle"]
        }
        
        # Should get lowest commission rate due to high volume
        commission_rate = rules_engine.get_commission_rate(
            creator_data["tier"],
            creator_data["monthly_volume"]
        )
        assert commission_rate <= 0.10  # Should be at minimum rate for premium
        
        # Should get sophisticated marketing strategy
        strategy = rules_engine.get_marketing_strategy(
            creator_data["account_size"],
            creator_data["categories"]
        )
        assert strategy.priority_score >= 2.0  # High priority
        assert strategy.content_schedule["onlyfans"] >= 6  # High OnlyFans posting


class TestErrorHandling:
    """Test error handling scenarios"""
    
    def test_redis_connection_failure(self, mock_db_session):
        """Test handling of Redis connection failures"""
        # Create rules engine with failing Redis
        failing_redis = Mock()
        failing_redis.get.side_effect = Exception("Redis connection failed")
        
        rules_engine = BusinessRulesEngine(mock_db_session, failing_redis)
        
        # Should still work with in-memory fallback
        rate = rules_engine.get_commission_rate("entry", 1000)
        assert isinstance(rate, float)
        assert 0 <= rate <= 1
    
    def test_database_connection_failure(self, mock_redis):
        """Test handling of database connection failures"""
        # Create rules engine with failing database
        failing_db = Mock()
        failing_db.side_effect = Exception("Database connection failed")
        
        rules_engine = BusinessRulesEngine(failing_db, mock_redis)
        
        # Should load default rules
        rate = rules_engine.get_commission_rate("entry", 1000)
        assert isinstance(rate, float)
        assert rate > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])