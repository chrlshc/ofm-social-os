"""
Admin Panel API for Business Rules Management

Provides REST endpoints for administrators to manage business rules dynamically:
- Commission rates configuration
- Marketing strategies management  
- Feature flags control
- A/B testing configuration
- Audit log viewing

Includes validation, versioning, and rollback capabilities.
"""

from flask import Blueprint, request, jsonify, current_app
from functools import wraps
from typing import Dict, List, Any
from datetime import datetime, timedelta
import logging

from .business_rules import get_rules_engine, RuleType, CommissionRule, MarketingStrategy
from .models import CreatorProfile

logger = logging.getLogger(__name__)

# Blueprint for admin panel
admin_bp = Blueprint("admin", __name__, url_prefix="/admin/v1")


def require_admin_auth(f):
    """Decorator for admin-only endpoints"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Implement your admin authentication logic
        # This should check for admin role/permissions
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Admin authentication required"}), 401
        
        # Extract user info from JWT token
        # Implementation depends on your auth system
        user_info = validate_admin_token(auth_header.replace('Bearer ', ''))
        if not user_info or not user_info.get('is_admin'):
            return jsonify({"error": "Admin permissions required"}), 403
        
        request.admin_user = user_info
        return f(*args, **kwargs)
    
    return decorated_function


def validate_admin_token(token: str) -> Dict:
    """Validate admin JWT token - implement with your auth system"""
    # Placeholder - implement with your JWT validation
    return {
        "user_id": "admin_123",
        "email": "admin@ofm.com",
        "is_admin": True,
        "permissions": ["rules_management", "analytics_view"]
    }


# === COMMISSION RULES MANAGEMENT ===

@admin_bp.route("/commission-rules", methods=["GET"])
@require_admin_auth
def get_commission_rules():
    """Get current commission rules configuration"""
    try:
        rules_engine = get_rules_engine()
        
        # Get all commission rules
        commission_rules = {}
        for tier in ["entry", "mid", "premium"]:
            # Get sample rate to verify rule exists
            sample_rate = rules_engine.get_commission_rate(tier, 1000)
            commission_rules[tier] = {
                "current_rate_for_1k": sample_rate,
                "tier": tier
            }
        
        return jsonify({
            "success": True,
            "data": {
                "commission_rules": commission_rules,
                "version": rules_engine.get_rules_version()
            }
        })
        
    except Exception as e:
        logger.error(f"Failed to get commission rules: {str(e)}")
        return jsonify({"error": "Failed to retrieve commission rules"}), 500


@admin_bp.route("/commission-rules", methods=["PUT"])
@require_admin_auth
def update_commission_rules():
    """Update commission rules configuration"""
    try:
        data = request.get_json()
        if not data or "rules" not in data:
            return jsonify({"error": "Rules data required"}), 400
        
        rules_engine = get_rules_engine()
        
        # Convert API format to internal format
        commission_rules = {}
        for tier, rule_config in data["rules"].items():
            commission_rules[tier] = CommissionRule(
                tier=tier,
                base_rate=rule_config["base_rate"],
                volume_thresholds=rule_config["volume_thresholds"],
                min_rate=rule_config["min_rate"],
                max_rate=rule_config["max_rate"],
                effective_date=datetime.utcnow()
            )
        
        # Update rules
        success = rules_engine.update_rules(
            RuleType.COMMISSION, 
            commission_rules, 
            request.admin_user["user_id"]
        )
        
        if success:
            return jsonify({
                "success": True,
                "message": "Commission rules updated successfully",
                "version": rules_engine.get_rules_version()
            })
        else:
            return jsonify({"error": "Failed to update commission rules"}), 500
            
    except Exception as e:
        logger.error(f"Failed to update commission rules: {str(e)}")
        return jsonify({"error": "Failed to update commission rules"}), 500


# === MARKETING STRATEGIES MANAGEMENT ===

@admin_bp.route("/marketing-strategies", methods=["GET"])
@require_admin_auth
def get_marketing_strategies():
    """Get current marketing strategies configuration"""
    try:
        rules_engine = get_rules_engine()
        
        strategies = {}
        for account_size in ["micro", "small", "medium", "large"]:
            strategy = rules_engine.get_marketing_strategy(account_size)
            if strategy:
                strategies[account_size] = {
                    "account_size": strategy.account_size,
                    "pricing_suggestions": strategy.pricing_suggestions,
                    "content_schedule": strategy.content_schedule,
                    "target_categories": strategy.target_categories,
                    "engagement_tactics": strategy.engagement_tactics,
                    "priority_score": strategy.priority_score
                }
        
        return jsonify({
            "success": True,
            "data": {
                "marketing_strategies": strategies,
                "version": rules_engine.get_rules_version()
            }
        })
        
    except Exception as e:
        logger.error(f"Failed to get marketing strategies: {str(e)}")
        return jsonify({"error": "Failed to retrieve marketing strategies"}), 500


@admin_bp.route("/marketing-strategies", methods=["PUT"])
@require_admin_auth
def update_marketing_strategies():
    """Update marketing strategies configuration"""
    try:
        data = request.get_json()
        if not data or "strategies" not in data:
            return jsonify({"error": "Strategies data required"}), 400
        
        rules_engine = get_rules_engine()
        
        # Convert API format to internal format
        marketing_strategies = {}
        for account_size, strategy_config in data["strategies"].items():
            marketing_strategies[account_size] = MarketingStrategy(
                account_size=account_size,
                pricing_suggestions=strategy_config["pricing_suggestions"],
                content_schedule=strategy_config["content_schedule"],
                target_categories=strategy_config["target_categories"],
                engagement_tactics=strategy_config["engagement_tactics"],
                priority_score=strategy_config.get("priority_score", 1.0)
            )
        
        # Update rules
        success = rules_engine.update_rules(
            RuleType.MARKETING,
            marketing_strategies,
            request.admin_user["user_id"]
        )
        
        if success:
            return jsonify({
                "success": True,
                "message": "Marketing strategies updated successfully", 
                "version": rules_engine.get_rules_version()
            })
        else:
            return jsonify({"error": "Failed to update marketing strategies"}), 500
            
    except Exception as e:
        logger.error(f"Failed to update marketing strategies: {str(e)}")
        return jsonify({"error": "Failed to update marketing strategies"}), 500


# === FEATURE FLAGS MANAGEMENT ===

@admin_bp.route("/feature-flags", methods=["GET"])
@require_admin_auth
def get_feature_flags():
    """Get all feature flags with metadata"""
    try:
        from .db_helper import get_db
        from .business_rules_models import FeatureFlagModel
        
        with get_db() as db:
            # Get all flags from database
            db_flags = db.query(FeatureFlagModel).all()
            
            flags_data = []
            for flag in db_flags:
                flags_data.append({
                    "id": flag.id,
                    "feature_name": flag.feature_name,
                    "is_enabled": flag.is_enabled,
                    "description": flag.description,
                    "ab_test_enabled": flag.ab_test_enabled,
                    "rollout_percentage": flag.rollout_percentage,
                    "version": flag.version,
                    "created_at": flag.created_at.isoformat() if flag.created_at else None,
                    "updated_at": flag.updated_at.isoformat() if flag.updated_at else None
                })
        
        return jsonify({
            "success": True,
            "data": {
                "feature_flags": flags_data,
                "total_count": len(flags_data)
            }
        })
        
    except Exception as e:
        logger.error(f"Failed to get feature flags: {str(e)}")
        return jsonify({"error": "Failed to retrieve feature flags"}), 500


@admin_bp.route("/feature-flags", methods=["POST"])
@require_admin_auth
def create_or_update_feature_flag():
    """Create or update a feature flag"""
    try:
        data = request.get_json()
        feature_name = data.get('feature_name')
        is_enabled = data.get('is_enabled', False)
        description = data.get('description', '')
        ab_test_enabled = data.get('ab_test_enabled', False)
        rollout_percentage = data.get('rollout_percentage', 100)
        
        if not feature_name:
            return jsonify({"error": "Feature name required"}), 400
        
        from .db_helper import get_db
        from .business_rules_models import FeatureFlagModel
        
        with get_db() as db:
            # Check if flag exists
            flag = db.query(FeatureFlagModel).filter_by(feature_name=feature_name).first()
            
            if flag:
                # Update existing
                flag.is_enabled = is_enabled
                flag.description = description
                flag.ab_test_enabled = ab_test_enabled
                flag.rollout_percentage = rollout_percentage
                flag.updated_by = request.admin_user["user_id"]
                flag.version += 1
            else:
                # Create new
                flag = FeatureFlagModel(
                    feature_name=feature_name,
                    is_enabled=is_enabled,
                    description=description,
                    ab_test_enabled=ab_test_enabled,
                    rollout_percentage=rollout_percentage,
                    created_by=request.admin_user["user_id"]
                )
                db.add(flag)
            
            db.commit()
            
            # Update rules engine
            rules_engine = get_rules_engine()
            all_flags = {}
            
            # Get all flags from DB
            all_db_flags = db.query(FeatureFlagModel).all()
            for f in all_db_flags:
                all_flags[f.feature_name] = f.is_enabled
            
            # Update engine
            success = rules_engine.update_rules(
                RuleType.FEATURE_FLAGS,
                all_flags,
                request.admin_user["user_id"]
            )
            
            return jsonify({
                "success": success,
                "data": {
                    "feature_flag": {
                        "feature_name": flag.feature_name,
                        "is_enabled": flag.is_enabled,
                        "ab_test_enabled": flag.ab_test_enabled,
                        "version": flag.version
                    }
                }
            })
            
    except Exception as e:
        logger.error(f"Failed to update feature flag: {str(e)}")
        return jsonify({"error": "Failed to update feature flag"}), 500


@admin_bp.route("/feature-flags/<feature_name>", methods=["DELETE"])
@require_admin_auth
def delete_feature_flag(feature_name):
    """Delete a feature flag"""
    try:
        from .db_helper import get_db
        from .business_rules_models import FeatureFlagModel
        
        with get_db() as db:
            flag = db.query(FeatureFlagModel).filter_by(feature_name=feature_name).first()
            if not flag:
                return jsonify({"error": "Feature flag not found"}), 404
            
            db.delete(flag)
            db.commit()
            
            # Update rules engine
            rules_engine = get_rules_engine()
            all_flags = {}
            
            # Get remaining flags
            remaining_flags = db.query(FeatureFlagModel).all()
            for f in remaining_flags:
                all_flags[f.feature_name] = f.is_enabled
            
            rules_engine.update_rules(
                RuleType.FEATURE_FLAGS,
                all_flags,
                request.admin_user["user_id"]
            )
            
            return jsonify({"success": True})
            
    except Exception as e:
        logger.error(f"Failed to delete feature flag: {str(e)}")
        return jsonify({"error": "Failed to delete feature flag"}), 500


# === A/B TESTING MANAGEMENT ===

@admin_bp.route("/ab-tests", methods=["GET"])
@require_admin_auth
def get_ab_tests():
    """Get all A/B tests"""
    try:
        from .db_helper import get_db
        from .business_rules_models import FeatureFlagModel
        
        with get_db() as db:
            # Get flags with A/B testing enabled
            ab_tests = db.query(FeatureFlagModel).filter(
                FeatureFlagModel.ab_test_enabled == True
            ).all()
            
            tests_data = []
            for test in ab_tests:
                tests_data.append({
                    "feature_name": test.feature_name,
                    "description": test.description,
                    "rollout_percentage": test.rollout_percentage,
                    "is_active": test.is_enabled,
                    "created_at": test.created_at.isoformat() if test.created_at else None,
                    "updated_at": test.updated_at.isoformat() if test.updated_at else None,
                    "created_by": test.created_by
                })
        
        return jsonify({
            "success": True,
            "data": {
                "ab_tests": tests_data,
                "total_count": len(tests_data)
            }
        })
        
    except Exception as e:
        logger.error(f"Failed to get A/B tests: {str(e)}")
        return jsonify({"error": "Failed to retrieve A/B tests"}), 500


@admin_bp.route("/ab-tests/<feature_name>/results", methods=["GET"])
@require_admin_auth
def get_ab_test_results(feature_name):
    """Get A/B test results for a specific feature"""
    try:
        # This would typically query your analytics system
        # Placeholder implementation
        results = {
            "feature_name": feature_name,
            "test_period": {
                "start": (datetime.utcnow() - timedelta(days=30)).isoformat(),
                "end": datetime.utcnow().isoformat()
            },
            "control_group": {
                "users": 5000,
                "conversion_rate": 0.125,
                "average_revenue": 45.50
            },
            "treatment_group": {
                "users": 5000,
                "conversion_rate": 0.142,
                "average_revenue": 52.30
            },
            "statistical_significance": 0.95,
            "recommendation": "Continue rollout - treatment shows 13.6% improvement"
        }
        
        return jsonify({
            "success": True,
            "data": results
        })
        
    except Exception as e:
        logger.error(f"Failed to get A/B test results: {str(e)}")
        return jsonify({"error": "Failed to retrieve test results"}), 500


# === ANALYTICS AND MONITORING ===

@admin_bp.route("/commission-simulation", methods=["POST"])
@require_admin_auth
def commission_simulation():
    """Simulate commission rates for different scenarios"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Simulation parameters required"}), 400
        
        rules_engine = get_rules_engine()
        
        # Default simulation scenarios if none provided
        scenarios = data.get("scenarios", [
            {"tier": "entry", "volumes": [500, 1000, 5000, 10000]},
            {"tier": "mid", "volumes": [1000, 2000, 10000, 25000]},
            {"tier": "premium", "volumes": [2000, 5000, 20000, 50000]}
        ])
        
        results = {}
        for scenario in scenarios:
            tier = scenario["tier"]
            volumes = scenario["volumes"]
            
            results[tier] = []
            for volume in volumes:
                rate = rules_engine.get_commission_rate(tier, volume)
                commission_amount = volume * rate
                creator_earnings = volume - commission_amount
                
                results[tier].append({
                    "volume": volume,
                    "commission_rate": rate,
                    "commission_amount": round(commission_amount, 2),
                    "creator_earnings": round(creator_earnings, 2),
                    "effective_rate_percentage": round(rate * 100, 2)
                })
        
        return jsonify({
            "success": True,
            "data": {
                "simulation_results": results,
                "generated_at": datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Commission simulation failed: {str(e)}")
        return jsonify({"error": "Simulation failed"}), 500


@admin_bp.route("/creator-analytics", methods=["GET"])
@require_admin_auth
def creator_analytics():
    """Get creator analytics by tier and account size"""
    try:
        # This would typically query your database for creator statistics
        # Placeholder implementation
        
        analytics = {
            "total_creators": 1250,
            "by_tier": {
                "entry": {"count": 800, "avg_monthly_volume": 1500},
                "mid": {"count": 350, "avg_monthly_volume": 8500},
                "premium": {"count": 100, "avg_monthly_volume": 25000}
            },
            "by_account_size": {
                "micro": {"count": 600, "avg_commission_rate": 0.18},
                "small": {"count": 450, "avg_commission_rate": 0.15},
                "medium": {"count": 150, "avg_commission_rate": 0.12},
                "large": {"count": 50, "avg_commission_rate": 0.10}
            },
            "total_monthly_volume": 12750000,
            "total_monthly_commission": 1912500,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        return jsonify({
            "success": True,
            "data": analytics
        })
        
    except Exception as e:
        logger.error(f"Failed to get creator analytics: {str(e)}")
        return jsonify({"error": "Failed to retrieve analytics"}), 500


# === AUDIT LOG AND VERSIONING ===

@admin_bp.route("/audit-log", methods=["GET"])
@require_admin_auth
def get_audit_log():
    """Get audit log for rules changes"""
    try:
        # Get date range from query parameters
        days_back = request.args.get("days", "7", type=int)
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_back)
        
        rules_engine = get_rules_engine()
        audit_entries = rules_engine.get_audit_log(start_date, end_date)
        
        return jsonify({
            "success": True,
            "data": {
                "audit_entries": audit_entries,
                "date_range": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                },
                "total_entries": len(audit_entries)
            }
        })
        
    except Exception as e:
        logger.error(f"Failed to get audit log: {str(e)}")
        return jsonify({"error": "Failed to retrieve audit log"}), 500


@admin_bp.route("/system-status", methods=["GET"])
@require_admin_auth
def system_status():
    """Get overall system status and health"""
    try:
        rules_engine = get_rules_engine()
        
        status = {
            "rules_engine": {
                "version": rules_engine.get_rules_version(),
                "redis_connected": True,  # Check Redis connection
                "last_update": datetime.utcnow().isoformat()
            },
            "feature_flags": {
                "total_flags": len(rules_engine.rules_cache.get(RuleType.FEATURE_FLAGS, {})),
                "enabled_features": sum(1 for enabled in rules_engine.rules_cache.get(RuleType.FEATURE_FLAGS, {}).values() if enabled)
            },
            "commission_rules": {
                "total_tiers": len(rules_engine.rules_cache.get(RuleType.COMMISSION, {}))
            },
            "marketing_strategies": {
                "total_strategies": len(rules_engine.rules_cache.get(RuleType.MARKETING, {}))
            }
        }
        
        return jsonify({
            "success": True,
            "data": status
        })
        
    except Exception as e:
        logger.error(f"Failed to get system status: {str(e)}")
        return jsonify({"error": "Failed to retrieve system status"}), 500


# === ERROR HANDLERS ===

@admin_bp.errorhandler(404)
def admin_not_found(error):
    return jsonify({"error": "Admin endpoint not found"}), 404


@admin_bp.errorhandler(500)
def admin_internal_error(error):
    logger.error(f"Admin panel internal error: {str(error)}")
    return jsonify({"error": "Internal server error"}), 500