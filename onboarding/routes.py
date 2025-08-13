"""
Flask routes for onboarding API endpoints

Provides secure JWT-protected endpoints for the complete onboarding flow:
- User registration and email verification
- Terms acceptance
- Stripe Connect Express onboarding
- Status tracking and progress monitoring

All routes implement proper error handling, rate limiting, and security validation.
"""

import logging
from typing import Dict, Any
from flask import Blueprint, request, jsonify, current_app
from functools import wraps
from sqlalchemy.orm import Session

from .service import OnboardingService, OnboardingError
from .stripe_connect import StripeConnectService, StripeConnectError, WebhookHandler
from .tokens import EmailTokenService
from .business_rules import get_rules_engine

# Blueprint setup
bp = Blueprint("onboarding", __name__, url_prefix="/api/v1")
onboarding_service = OnboardingService()
logger = logging.getLogger(__name__)

# Error response helpers
def error_response(message: str, code: int = 400, details: Dict = None) -> tuple:
    """Standard error response format"""
    response = {"error": message, "success": False}
    if details:
        response["details"] = details
    return jsonify(response), code

def success_response(data: Dict = None, message: str = "Success") -> Dict:
    """Standard success response format"""
    response = {"success": True, "message": message}
    if data:
        response["data"] = data
    return jsonify(response)

# Authentication decorator (placeholder - implement with your auth system)
def require_auth(roles=None):
    """
    JWT authentication decorator
    
    Assumes your existing auth system provides:
    - request.user_id: Authenticated user ID
    - request.user_email: User email
    - request.user_roles: User roles list
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Implement JWT validation here
            # This is a placeholder - integrate with your existing auth system
            if not hasattr(request, 'user_id'):
                return error_response("Authentication required", 401)
            
            if roles and not any(role in getattr(request, 'user_roles', []) for role in roles):
                return error_response("Insufficient permissions", 403)
                
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Database session helper (placeholder - implement with your DB service)
def get_db_session() -> Session:
    """Get database session - integrate with your existing DB service"""
    # This is a placeholder - replace with your database session factory
    # from marketing.backend.api.src.database import db_service
    # return db_service.get_session()
    raise NotImplementedError("Implement database session factory")


# === AUTHENTICATION ROUTES ===

@bp.route("/auth/register", methods=["POST"])
def register():
    """
    Register new user and start onboarding
    
    Body:
        email: User email address
        password: User password
        
    Returns:
        201: Registration successful, verification email sent
        400: Validation errors
        409: User already exists
    """
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")
        
        # Validation
        if not email or "@" not in email:
            return error_response("Valid email address required")
        if len(password) < 8:
            return error_response("Password must be at least 8 characters")
        
        with get_db_session() as db:
            # Check if user exists (implement with your User model)
            # existing_user = db.query(User).filter_by(email=email).first()
            # if existing_user:
            #     return error_response("User already exists", 409)
            
            # Create user account (implement with your User model)
            # user = User(email=email, password=hash_password(password))
            # db.add(user)
            # db.commit()
            
            # For now, simulate user creation
            user_id = f"user_{email.split('@')[0]}"  # Placeholder
            
            # Start onboarding process
            session_id = onboarding_service.start_onboarding(db, user_id)
            
            # Send verification email
            email_sent = onboarding_service.send_email_verification(db, user_id, email)
            
            response_data = {
                "user_id": user_id,
                "onboarding_session_id": session_id,
                "email_verification_sent": email_sent
            }
            
            return success_response(response_data, "Registration successful"), 201
            
    except Exception as e:
        logger.error(f"Registration failed: {str(e)}")
        return error_response("Registration failed", 500)


@bp.route("/auth/verify-email", methods=["POST"])
def verify_email():
    """
    Verify email address with token
    
    Body:
        user_id: User ID
        token: Verification token from email
        
    Returns:
        200: Email verified successfully
        400: Invalid or expired token
    """
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        user_id = data.get("user_id")
        token = data.get("token")
        
        if not user_id or not token:
            return error_response("User ID and token required")
        
        with get_db_session() as db:
            success = onboarding_service.verify_email(db, user_id, token)
            
            if success:
                return success_response(message="Email verified successfully")
            else:
                return error_response("Invalid or expired verification token", 400)
                
    except Exception as e:
        logger.error(f"Email verification failed: {str(e)}")
        return error_response("Email verification failed", 500)


@bp.route("/auth/resend-verification", methods=["POST"])
@require_auth()
def resend_verification():
    """
    Resend email verification token
    
    Returns:
        200: Verification email sent
        429: Too many requests (if rate limited)
    """
    try:
        with get_db_session() as db:
            # Check if user already has valid token
            token_info = EmailTokenService.get_token_info(db, request.user_id)
            if token_info and token_info["time_remaining_minutes"] > 5:
                return error_response(
                    f"Verification email already sent. Please wait {token_info['time_remaining_minutes']} minutes.",
                    429
                )
            
            # Send new verification email
            email_sent = onboarding_service.send_email_verification(
                db, request.user_id, request.user_email
            )
            
            if email_sent:
                return success_response(message="Verification email sent")
            else:
                return error_response("Failed to send verification email", 500)
                
    except Exception as e:
        logger.error(f"Resend verification failed: {str(e)}")
        return error_response("Failed to resend verification", 500)


@bp.route("/auth/accept-terms", methods=["POST"])
@require_auth()
def accept_terms():
    """
    Accept terms and conditions
    
    Body:
        terms_version: Version of terms accepted (optional)
        
    Returns:
        200: Terms accepted successfully
    """
    try:
        data = request.get_json() or {}
        terms_version = data.get("terms_version", "v1.0")
        
        with get_db_session() as db:
            success = onboarding_service.accept_terms(db, request.user_id, terms_version)
            
            if success:
                return success_response(message="Terms accepted successfully")
            else:
                return error_response("Failed to accept terms", 500)
                
    except Exception as e:
        logger.error(f"Terms acceptance failed: {str(e)}")
        return error_response("Terms acceptance failed", 500)


# === STRIPE CONNECT ROUTES ===

@bp.route("/stripe/connect/start", methods=["POST"])
@require_auth(["creator"])
def stripe_connect_start():
    """
    Start Stripe Connect Express onboarding
    
    Body:
        return_url: URL to redirect after successful onboarding
        refresh_url: URL to redirect if link expires
        
    Returns:
        200: Onboarding URL created
        400: Missing required parameters
    """
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        return_url = data.get("return_url")
        refresh_url = data.get("refresh_url")
        
        if not return_url or not refresh_url:
            return error_response("return_url and refresh_url required")
        
        with get_db_session() as db:
            onboarding_url = onboarding_service.start_stripe_onboarding(
                db, request.user_id, request.user_email, return_url, refresh_url
            )
            
            response_data = {
                "onboarding_url": onboarding_url,
                "expires_in_minutes": 60  # Account Links expire in 60 minutes
            }
            
            return success_response(response_data, "Stripe onboarding started")
            
    except OnboardingError as e:
        return error_response(str(e), 400)
    except Exception as e:
        logger.error(f"Stripe onboarding start failed: {str(e)}")
        return error_response("Failed to start Stripe onboarding", 500)


@bp.route("/stripe/connect/refresh", methods=["POST"])
@require_auth(["creator"])
def stripe_connect_refresh():
    """
    Refresh expired Stripe onboarding link
    
    Body:
        return_url: URL to redirect after successful onboarding
        refresh_url: URL to redirect if link expires
        
    Returns:
        200: New onboarding URL created
    """
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        return_url = data.get("return_url")
        refresh_url = data.get("refresh_url") 
        
        if not return_url or not refresh_url:
            return error_response("return_url and refresh_url required")
        
        with get_db_session() as db:
            # Get existing Stripe account ID
            from .models import CreatorProfile
            profile = db.query(CreatorProfile).filter_by(user_id=request.user_id).first()
            
            if not profile or not profile.stripe_account_id:
                return error_response("Stripe account not found", 404)
            
            # Create new account link
            onboarding_url = StripeConnectService.create_onboarding_link(
                profile.stripe_account_id, return_url, refresh_url
            )
            
            response_data = {"onboarding_url": onboarding_url}
            return success_response(response_data, "Onboarding link refreshed")
            
    except StripeConnectError as e:
        return error_response(f"Stripe error: {str(e)}", 400)
    except Exception as e:
        logger.error(f"Stripe refresh failed: {str(e)}")
        return error_response("Failed to refresh onboarding link", 500)


@bp.route("/stripe/connect/return", methods=["POST"])
@require_auth(["creator"])
def stripe_connect_return():
    """
    Handle return from Stripe onboarding flow
    
    Returns:
        200: Onboarding status and next steps
    """
    try:
        with get_db_session() as db:
            result = onboarding_service.handle_stripe_return(db, request.user_id)
            return success_response(result)
            
    except Exception as e:
        logger.error(f"Stripe return handling failed: {str(e)}")
        return error_response("Failed to process Stripe return", 500)


@bp.route("/stripe/status", methods=["GET"])
@require_auth(["creator"])
def stripe_status():
    """
    Get current Stripe account status
    
    Returns:
        200: Account status and capabilities
        404: Stripe account not found
    """
    try:
        with get_db_session() as db:
            from .models import CreatorProfile
            profile = db.query(CreatorProfile).filter_by(user_id=request.user_id).first()
            
            if not profile or not profile.stripe_account_id:
                return error_response("Stripe account not found", 404)
            
            status = StripeConnectService.get_account_status(profile.stripe_account_id)
            progress, message = StripeConnectService.get_onboarding_progress(profile.stripe_account_id)
            
            response_data = {
                "account_id": profile.stripe_account_id,
                "status": status,
                "progress": progress,
                "progress_message": message,
                "is_complete": StripeConnectService.is_onboarding_complete(profile.stripe_account_id)
            }
            
            return success_response(response_data)
            
    except StripeConnectError as e:
        return error_response(f"Stripe error: {str(e)}", 400)
    except Exception as e:
        logger.error(f"Stripe status failed: {str(e)}")
        return error_response("Failed to get Stripe status", 500)


@bp.route("/stripe/dashboard-link", methods=["POST"])
@require_auth(["creator"])
def stripe_dashboard_link():
    """
    Create login link to Stripe Express Dashboard
    
    Returns:
        200: Dashboard login URL
        404: Stripe account not found
    """
    try:
        with get_db_session() as db:
            from .models import CreatorProfile
            profile = db.query(CreatorProfile).filter_by(user_id=request.user_id).first()
            
            if not profile or not profile.stripe_account_id:
                return error_response("Stripe account not found", 404)
            
            dashboard_url = StripeConnectService.create_dashboard_login_link(
                profile.stripe_account_id
            )
            
            response_data = {
                "dashboard_url": dashboard_url,
                "expires_in_seconds": 300  # Login links expire in 5 minutes
            }
            
            return success_response(response_data, "Dashboard link created")
            
    except StripeConnectError as e:
        return error_response(f"Stripe error: {str(e)}", 400)
    except Exception as e:
        logger.error(f"Dashboard link creation failed: {str(e)}")
        return error_response("Failed to create dashboard link", 500)


# === ONBOARDING STATUS AND LOCALE ROUTES ===

@bp.route("/onboarding/status", methods=["GET"])
@require_auth()
def onboarding_status():
    """
    Get complete onboarding status and progress
    
    Returns:
        200: Detailed onboarding status
    """
    try:
        with get_db_session() as db:
            status = onboarding_service.get_onboarding_status(db, request.user_id)
            return success_response(status)
            
    except Exception as e:
        logger.error(f"Get onboarding status failed: {str(e)}")
        return error_response("Failed to get onboarding status", 500)


@bp.route("/onboarding/update-timezone", methods=["POST"])
@require_auth()
def update_timezone():
    """
    Update timezone from client-side JavaScript detection
    
    Body:
        timezone: IANA timezone from Intl.DateTimeFormat().resolvedOptions().timeZone
        
    Returns:
        200: Timezone updated
    """
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        client_timezone = data.get("timezone")
        if not client_timezone:
            return error_response("Timezone required")
        
        with get_db_session() as db:
            onboarding_service.update_client_timezone(db, request.user_id, client_timezone)
            return success_response(message="Timezone updated")
            
    except Exception as e:
        logger.error(f"Timezone update failed: {str(e)}")
        return error_response("Failed to update timezone", 500)


@bp.route("/onboarding/<session_id>/timezone", methods=["POST"])
@require_auth(['creator'])
def update_timezone_by_session(session_id):
    """
    Update timezone from client-side for specific onboarding session
    
    Path:
        session_id: Onboarding session ID
        
    Body:
        timezone: IANA timezone from Intl.DateTimeFormat().resolvedOptions().timeZone
        
    Returns:
        200: Timezone updated successfully
        404: Session not found
    """
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        client_timezone = data.get("timezone")
        if not client_timezone:
            return error_response("Timezone required")
        
        with get_db_session() as db:
            from .models import OnboardingSession, CreatorProfile
            
            # Verify session belongs to user
            session = db.query(OnboardingSession).filter_by(
                id=session_id,
                user_id=request.user_id
            ).first()
            
            if not session:
                return error_response("Onboarding session not found", 404)
            
            # Update creator profile timezone
            profile = db.query(CreatorProfile).filter_by(user_id=request.user_id).first()
            if profile:
                profile.timezone = onboarding_service.LocaleDetectionService.normalize_timezone(client_timezone)
                db.commit()
                
                return success_response({
                    "timezone": profile.timezone,
                    "normalized": True
                }, "Timezone updated successfully")
            else:
                return error_response("Creator profile not found", 404)
            
    except Exception as e:
        logger.error(f"Timezone update failed for session {session_id}: {str(e)}")
        return error_response("Failed to update timezone", 500)


@bp.route("/pricing-suggestions", methods=["GET"])
@require_auth(["creator"])
def get_pricing_suggestions():
    """
    Get personalized pricing suggestions based on creator tier and account size
    
    Returns:
        200: Pricing suggestions based on business rules
    """
    try:
        with get_db_session() as db:
            from .models import CreatorProfile
            
            profile = db.query(CreatorProfile).filter_by(user_id=request.user_id).first()
            if not profile:
                return error_response("Creator profile not found", 404)
            
            rules_engine = get_rules_engine()
            strategy = rules_engine.get_marketing_strategy(
                profile.account_size or "micro",
                profile.content_categories or []
            )
            
            if strategy:
                pricing_suggestions = strategy.pricing_suggestions
                content_schedule = strategy.content_schedule
                
                response_data = {
                    "account_size": profile.account_size,
                    "pricing_tier": profile.pricing_tier,
                    "pricing_suggestions": pricing_suggestions,
                    "content_schedule": content_schedule,
                    "engagement_tactics": strategy.engagement_tactics,
                    "target_categories": strategy.target_categories
                }
                
                return success_response(response_data, "Pricing suggestions retrieved")
            else:
                return error_response("No marketing strategy found", 404)
                
    except Exception as e:
        logger.error(f"Failed to get pricing suggestions: {str(e)}")
        return error_response("Failed to get pricing suggestions", 500)


@bp.route("/commission-rate", methods=["GET"]) 
@require_auth(["creator"])
def get_commission_rate():
    """
    Get current commission rate for creator based on tier and volume
    
    Query Parameters:
        monthly_volume: Optional monthly volume for calculation
        
    Returns:
        200: Current commission rate information
    """
    try:
        monthly_volume = request.args.get("monthly_volume", 0, type=float)
        
        with get_db_session() as db:
            from .models import CreatorProfile
            
            profile = db.query(CreatorProfile).filter_by(user_id=request.user_id).first()
            if not profile:
                return error_response("Creator profile not found", 404)
            
            rules_engine = get_rules_engine()
            commission_rate = rules_engine.get_commission_rate(
                profile.pricing_tier or "entry",
                monthly_volume
            )
            
            # Calculate example earnings
            if monthly_volume > 0:
                commission_amount = monthly_volume * commission_rate
                creator_earnings = monthly_volume - commission_amount
            else:
                commission_amount = 0
                creator_earnings = 0
            
            response_data = {
                "pricing_tier": profile.pricing_tier,
                "commission_rate": commission_rate,
                "commission_percentage": round(commission_rate * 100, 2),
                "monthly_volume": monthly_volume,
                "commission_amount": round(commission_amount, 2),
                "creator_earnings": round(creator_earnings, 2)
            }
            
            return success_response(response_data, "Commission rate retrieved")
            
    except Exception as e:
        logger.error(f"Failed to get commission rate: {str(e)}")
        return error_response("Failed to get commission rate", 500)


# === WEBHOOK ROUTES ===

@bp.route("/webhooks/stripe", methods=["POST"])
def stripe_webhook():
    """
    Handle Stripe Connect webhooks
    
    Processes account.updated and other relevant events to sync
    onboarding status with Stripe account changes.
    
    Returns:
        200: Webhook processed
        400: Invalid signature or payload
    """
    try:
        payload = request.get_data()
        signature = request.headers.get("Stripe-Signature")
        
        if not signature:
            return error_response("Missing Stripe signature", 400)
        
        # Verify webhook signature
        if not WebhookHandler.verify_webhook_signature(payload, signature):
            return error_response("Invalid webhook signature", 400)
        
        # Parse webhook event
        import json
        import stripe
        
        try:
            event = stripe.Event.construct_from(
                json.loads(payload), stripe.api_key
            )
        except ValueError:
            return error_response("Invalid payload", 400)
        
        # Process event
        with get_db_session() as db:
            success = WebhookHandler.handle_webhook_event(
                event.type, event.data, db
            )
            
            if success:
                return jsonify({"received": True})
            else:
                return error_response("Webhook processing failed", 500)
                
    except Exception as e:
        logger.error(f"Webhook processing failed: {str(e)}")
        return error_response("Webhook processing failed", 500)


# === ONLYFANS QUESTIONNAIRE ROUTES ===

@bp.route("/onlyfans/questionnaire", methods=["POST"])
@require_auth(["creator"])
def submit_onlyfans_questionnaire():
    """
    Submit OnlyFans statistics via manual questionnaire
    
    Body:
        follower_count: int - Number of followers
        subscription_price: float - Monthly subscription price
        average_tip_amount: float - Average tip amount
        posts_per_week: int - Number of posts per week
        content_categories: List[str] - Content categories
        ppv_messages_per_month: int - Pay-per-view messages per month (optional)
        average_ppv_price: float - Average PPV price (optional)
        months_active: int - Months active on platform (optional)
        daily_new_fans: int - Average new fans per day (optional)
        churn_rate_percent: float - Monthly churn rate (optional)
        
    Returns:
        200: Analysis results with recommendations
        400: Invalid questionnaire data
    """
    try:
        from .onlyfans_questionnaire import OnlyFansQuestionnaire
        
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        # Validate questionnaire
        is_valid, error_msg = OnlyFansQuestionnaire.validate_questionnaire(data)
        if not is_valid:
            return error_response(error_msg, 400)
        
        # Analyze data
        analysis_results = OnlyFansQuestionnaire.analyze_from_questionnaire(data)
        
        # Update creator profile with results
        with get_db_session() as db:
            from .models import CreatorProfile
            
            profile = db.query(CreatorProfile).filter_by(user_id=request.user_id).first()
            if profile:
                profile.account_size = analysis_results["account_size"]
                profile.pricing_tier = analysis_results["pricing_tier"]
                profile.content_categories = analysis_results["content_categories"]
                db.commit()
                
                logger.info(f"Updated profile from questionnaire for user {request.user_id}")
            
        return success_response(analysis_results, "Questionnaire analyzed successfully")
        
    except ValueError as e:
        return error_response(str(e), 400)
    except Exception as e:
        logger.error(f"Questionnaire submission failed: {str(e)}")
        return error_response("Failed to process questionnaire", 500)


@bp.route("/profile/complete", methods=["POST"])
@require_auth(["creator"])
def complete_profile():
    """
    Complete creator profile with public name and description
    
    Body:
        public_name: str - Public display name (required, 2-100 chars)
        description: str - Profile description (optional, max 500 chars)
        
    Returns:
        200: Profile updated successfully
        400: Validation errors
    """
    try:
        data = request.get_json()
        if not data:
            return error_response("Request body required")
        
        with get_db_session() as db:
            result = onboarding_service.complete_profile(db, request.user_id, data)
            
            if result["success"]:
                return success_response(result["profile"], "Profile completed successfully")
            else:
                return error_response(result["error"], 400)
                
    except Exception as e:
        logger.error(f"Profile completion failed: {str(e)}")
        return error_response("Failed to complete profile", 500)


@bp.route("/onlyfans/questionnaire/template", methods=["GET"])
@require_auth(["creator"])
def get_questionnaire_template():
    """
    Get questionnaire template with field descriptions
    
    Returns:
        200: Questionnaire template and metadata
    """
    try:
        from .onlyfans_questionnaire import OnlyFansQuestionnaire
        
        template = {
            "required_fields": {
                "follower_count": {
                    "type": "integer",
                    "description": "Nombre total d'abonnés",
                    "min": 0,
                    "max": 10000000
                },
                "subscription_price": {
                    "type": "float",
                    "description": "Prix d'abonnement mensuel en USD",
                    "min": 0,
                    "max": 200
                },
                "average_tip_amount": {
                    "type": "float",
                    "description": "Montant moyen des pourboires reçus",
                    "min": 0
                },
                "posts_per_week": {
                    "type": "integer",
                    "description": "Nombre de posts par semaine",
                    "min": 0,
                    "max": 100
                },
                "content_categories": {
                    "type": "array",
                    "description": "Catégories de contenu",
                    "allowed_values": list(OnlyFansQuestionnaire.VALID_CATEGORIES)
                }
            },
            "optional_fields": {
                "ppv_messages_per_month": {
                    "type": "integer",
                    "description": "Messages payants par mois",
                    "default": 0
                },
                "average_ppv_price": {
                    "type": "float",
                    "description": "Prix moyen des messages payants",
                    "default": 0
                },
                "months_active": {
                    "type": "integer",
                    "description": "Mois d'activité sur OnlyFans",
                    "default": 0
                },
                "daily_new_fans": {
                    "type": "integer",
                    "description": "Nouveaux fans par jour en moyenne",
                    "default": 0
                },
                "churn_rate_percent": {
                    "type": "float",
                    "description": "Taux de désabonnement mensuel (%)",
                    "default": 5.0
                }
            }
        }
        
        return success_response(template, "Questionnaire template retrieved")
        
    except Exception as e:
        logger.error(f"Failed to get questionnaire template: {str(e)}")
        return error_response("Failed to retrieve template", 500)


# === ERROR HANDLERS ===

@bp.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return error_response("Endpoint not found", 404)

@bp.errorhandler(405)
def method_not_allowed(error):
    """Handle 405 errors"""
    return error_response("Method not allowed", 405)

@bp.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {str(error)}")
    return error_response("Internal server error", 500)