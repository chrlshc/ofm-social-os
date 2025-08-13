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
    """Get current feature flags configuration"""
    try:
        rules_engine = get_rules_engine()
        
        # Get common feature flags
        common_flags = [
            "email_verification", "stripe_connect", "marketing_automation",
            "onlyfans_scraping", "mobile_optimizations", "advanced_analytics", 
            "beta_features"
        ]
        
        flags = {}
        for flag in common_flags:
            flags[flag] = rules_engine.is_feature_enabled(flag)
        
        return jsonify({
            "success": True,
            "data": {
                "feature_flags": flags,
                "version": rules_engine.get_rules_version()
            }
        })
        
    except Exception as e:
        logger.error(f"Failed to get feature flags: {str(e)}")
        return jsonify({"error": "Failed to retrieve feature flags"}), 500


@admin_bp.route("/feature-flags", methods=["PUT"])
@require_admin_auth  
def update_feature_flags():
    """Update feature flags configuration"""
    try:
        data = request.get_json()
        if not data or "flags" not in data:
            return jsonify({"error": "Flags data required"}), 400
        
        rules_engine = get_rules_engine()
        
        # Validate flags data
        flags = data["flags"]
        if not isinstance(flags, dict):
            return jsonify({"error": "Flags must be a dictionary"}), 400
        
        if not all(isinstance(v, bool) for v in flags.values()):
            return jsonify({"error": "All flag values must be boolean"}), 400
        
        # Update rules
        success = rules_engine.update_rules(
            RuleType.FEATURE_FLAGS,
            flags,
            request.admin_user["user_id"]
        )
        
        if success:
            return jsonify({
                "success": True,
                "message": "Feature flags updated successfully",
                "version": rules_engine.get_rules_version()
            })
        else:
            return jsonify({"error": "Failed to update feature flags"}), 500
            
    except Exception as e:
        logger.error(f"Failed to update feature flags: {str(e)}")
        return jsonify({"error": "Failed to update feature flags"}), 500


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