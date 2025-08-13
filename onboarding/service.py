"""
Main onboarding orchestration service

Coordinates the complete pre-connection onboarding flow with automatic
locale detection and background marketing automation scheduling.

Flow:
1. User registration → email verification
2. Terms acceptance
3. Stripe Connect Express onboarding (hosted)
4. Auto-locale detection (language/timezone)
5. Background tasks: OnlyFans stats analysis, pricing tier calculation

References:
- Accept-Language header parsing: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language
- JavaScript Intl API: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions
"""

import uuid
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from flask import request

from .models import OnboardingSession, CreatorProfile, VerificationToken
from .tokens import EmailTokenService
from .stripe_connect import StripeConnectService, StripeConnectError
from .emailer import EmailService
from .business_rules import get_rules_engine, RuleType

logger = logging.getLogger(__name__)


class OnboardingError(Exception):
    """Raised when onboarding operations fail"""
    pass


class LocaleDetectionService:
    """
    Service for automatic locale detection from browser/client data
    
    Detects language from Accept-Language header and timezone from
    JavaScript Intl API without requiring user input.
    """
    
    @staticmethod
    def detect_language_from_headers() -> str:
        """
        Parse Accept-Language header to detect preferred language
        
        Returns:
            ISO 639-1 language code (e.g., 'fr', 'en', 'es')
        """
        accept_language = request.headers.get("Accept-Language", "en")
        
        # Parse "fr-FR,fr;q=0.9,en;q=0.8" format
        # Take first language preference
        try:
            primary_lang = accept_language.split(",")[0].split("-")[0].split(";")[0]
            return primary_lang.lower() if primary_lang else "en"
        except (IndexError, AttributeError):
            return "en"  # Fallback to English
    
    @staticmethod
    def normalize_timezone(client_timezone: Optional[str]) -> str:
        """
        Normalize client-provided timezone to valid IANA timezone
        
        Args:
            client_timezone: Timezone from JS Intl.DateTimeFormat().resolvedOptions().timeZone
            
        Returns:
            Valid IANA timezone string
        """
        if not client_timezone:
            return "Europe/Paris"  # Default for French market
        
        # Validate against common IANA timezones
        valid_timezones = {
            "Europe/Paris", "Europe/London", "America/New_York", 
            "America/Los_Angeles", "Europe/Berlin", "Europe/Madrid",
            "America/Toronto", "Australia/Sydney", "Asia/Tokyo"
        }
        
        if client_timezone in valid_timezones:
            return client_timezone
        
        # Try to map common variations
        timezone_mappings = {
            "EST": "America/New_York",
            "PST": "America/Los_Angeles", 
            "GMT": "Europe/London",
            "CET": "Europe/Paris"
        }
        
        return timezone_mappings.get(client_timezone, "Europe/Paris")
    
    @staticmethod
    def detect_locale_context() -> Dict[str, str]:
        """
        Detect full locale context from request
        
        Returns:
            Dict with 'language' and suggested 'timezone'
        """
        return {
            "language": LocaleDetectionService.detect_language_from_headers(),
            "timezone": "Europe/Paris"  # Will be updated by client-side JS
        }


class OnboardingService:
    """
    Main orchestrator for the onboarding flow
    
    Handles step-by-step progression through registration, verification,
    terms acceptance, and Stripe onboarding with automatic locale detection.
    """
    
    def __init__(self):
        self.email_service = EmailService()
    
    def start_onboarding(self, db: Session, user_id: str) -> str:
        """
        Initialize onboarding session for new user
        
        Args:
            db: Database session
            user_id: User ID from registration
            
        Returns:
            Onboarding session ID
            
        Raises:
            OnboardingError: If session creation fails
        """
        try:
            # Create onboarding session
            session_id = f"onb_{uuid.uuid4().hex[:16]}"
            onboarding_session = OnboardingSession(
                id=session_id,
                user_id=user_id,
                current_step="registered"
            )
            
            # Create creator profile with auto-detected locale
            locale_context = LocaleDetectionService.detect_locale_context()
            profile = CreatorProfile(
                user_id=user_id,
                language=locale_context["language"],
                timezone=locale_context["timezone"]
            )
            
            db.add(onboarding_session)
            db.add(profile)
            db.commit()
            
            logger.info(f"Started onboarding session {session_id} for user {user_id}")
            return session_id
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to start onboarding for user {user_id}: {str(e)}")
            raise OnboardingError(f"Onboarding initialization failed: {str(e)}")
    
    def send_email_verification(self, db: Session, user_id: str, user_email: str) -> bool:
        """
        Send email verification token to user
        
        Args:
            db: Database session
            user_id: User ID
            user_email: User's email address
            
        Returns:
            True if email was sent successfully
        """
        try:
            # Generate secure verification token
            raw_token = EmailTokenService.issue_email_verification_token(db, user_id)
            
            # Send verification email
            success = self.email_service.send_verification_email(
                user_email, raw_token, user_id
            )
            
            if success:
                logger.info(f"Verification email sent to {user_email}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to send verification email to {user_email}: {str(e)}")
            return False
    
    def verify_email(self, db: Session, user_id: str, token: str) -> bool:
        """
        Verify email with provided token and advance onboarding
        
        Args:
            db: Database session
            user_id: User ID
            token: Verification token from email
            
        Returns:
            True if verification successful
        """
        try:
            # Verify token
            if not EmailTokenService.verify_email_token(db, user_id, token):
                return False
            
            # Update onboarding session
            session = db.query(OnboardingSession).filter_by(user_id=user_id).first()
            if session:
                session.advance_to_step("email_verified")
                db.commit()
            
            logger.info(f"Email verified for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Email verification failed for user {user_id}: {str(e)}")
            db.rollback()
            return False
    
    def accept_terms(self, db: Session, user_id: str, terms_version: str = "v1.0") -> bool:
        """
        Record terms acceptance and advance onboarding
        
        Args:
            db: Database session
            user_id: User ID
            terms_version: Version of terms accepted
            
        Returns:
            True if terms acceptance recorded
        """
        try:
            # Import User model from payment system
            from payment.src.user_management import DBUser
            
            # Update user's terms acceptance
            user = db.query(DBUser).filter_by(id=user_id).first()
            if user:
                user.accepted_terms = True
                user.accepted_terms_at = datetime.utcnow()
            
            # Update onboarding session
            session = db.query(OnboardingSession).filter_by(user_id=user_id).first()
            if session:
                session.advance_to_step("terms_accepted")
                
                db.commit()
                logger.info(f"Terms accepted for user {user_id} at {user.accepted_terms_at}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Terms acceptance failed for user {user_id}: {str(e)}")
            db.rollback()
            return False
    
    def start_stripe_onboarding(
        self, 
        db: Session, 
        user_id: str, 
        user_email: str,
        return_url: str, 
        refresh_url: str
    ) -> str:
        """
        Initialize Stripe Connect Express onboarding
        
        Args:
            db: Database session
            user_id: User ID
            user_email: User's email for Stripe account
            return_url: URL to redirect after successful onboarding
            refresh_url: URL to redirect if link expires
            
        Returns:
            Account Link URL for hosted onboarding
            
        Raises:
            OnboardingError: If Stripe onboarding setup fails
        """
        try:
            profile = db.query(CreatorProfile).filter_by(user_id=user_id).first()
            if not profile:
                raise OnboardingError("Creator profile not found")
            
            # Create Stripe Express account if not exists
            if not profile.stripe_account_id:
                profile.stripe_account_id = StripeConnectService.create_express_account(
                    user_email
                )
                db.commit()
            
            # Create hosted onboarding link
            onboarding_url = StripeConnectService.create_onboarding_link(
                profile.stripe_account_id, 
                return_url, 
                refresh_url
            )
            
            # Update onboarding session
            session = db.query(OnboardingSession).filter_by(user_id=user_id).first()
            if session:
                session.advance_to_step("stripe_started")
                session.return_url = return_url
                session.refresh_url = refresh_url
                db.commit()
            
            logger.info(f"Stripe onboarding started for user {user_id}")
            return onboarding_url
            
        except StripeConnectError as e:
            raise OnboardingError(f"Stripe onboarding failed: {str(e)}")
        except Exception as e:
            db.rollback()
            logger.error(f"Stripe onboarding setup failed for user {user_id}: {str(e)}")
            raise OnboardingError(f"Onboarding setup failed: {str(e)}")
    
    def handle_stripe_return(self, db: Session, user_id: str) -> Dict[str, Any]:
        """
        Handle return from Stripe onboarding flow
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Dict with onboarding status and next steps
        """
        try:
            profile = db.query(CreatorProfile).filter_by(user_id=user_id).first()
            if not profile or not profile.stripe_account_id:
                return {"status": "error", "message": "Stripe account not found"}
            
            # Check current account status
            account_status = StripeConnectService.get_account_status(profile.stripe_account_id)
            
            # Update profile with current status
            profile.stripe_charges_enabled = account_status["charges_enabled"]
            profile.stripe_payouts_enabled = account_status["payouts_enabled"]
            
            # Check if onboarding is complete
            if StripeConnectService.is_onboarding_complete(profile.stripe_account_id):
                profile.stripe_onboarding_completed = True
                
                # Update onboarding session
                session = db.query(OnboardingSession).filter_by(user_id=user_id).first()
                if session:
                    session.advance_to_step("stripe_completed")
                
                # Complete full onboarding
                self._complete_onboarding(db, user_id)
                
                db.commit()
                
                return {
                    "status": "complete",
                    "message": "Onboarding completed successfully",
                    "can_accept_payments": True
                }
            else:
                # Still need more information
                progress, message = StripeConnectService.get_onboarding_progress(
                    profile.stripe_account_id
                )
                
                db.commit()
                
                return {
                    "status": "incomplete",
                    "message": message,
                    "progress": progress,
                    "requirements": account_status["requirements"]
                }
                
        except Exception as e:
            logger.error(f"Stripe return handling failed for user {user_id}: {str(e)}")
            db.rollback()
            return {"status": "error", "message": "Failed to process return"}
    
    def update_client_timezone(self, db: Session, user_id: str, client_timezone: str):
        """
        Update timezone from client-side JavaScript detection
        
        Args:
            db: Database session
            user_id: User ID
            client_timezone: Timezone from Intl.DateTimeFormat().resolvedOptions().timeZone
        """
        try:
            profile = db.query(CreatorProfile).filter_by(user_id=user_id).first()
            if profile:
                profile.timezone = LocaleDetectionService.normalize_timezone(client_timezone)
                db.commit()
                logger.info(f"Updated timezone to {profile.timezone} for user {user_id}")
                
        except Exception as e:
            logger.error(f"Failed to update timezone for user {user_id}: {str(e)}")
            db.rollback()
    
    def get_onboarding_status(self, db: Session, user_id: str) -> Dict[str, Any]:
        """
        Get current onboarding status and progress
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Dict with complete onboarding status
        """
        try:
            session = db.query(OnboardingSession).filter_by(user_id=user_id).first()
            profile = db.query(CreatorProfile).filter_by(user_id=user_id).first()
            
            if not session:
                return {"status": "not_started"}
            
            status = {
                "session_id": session.id,
                "current_step": session.current_step,
                "completed": session.completed,
                "progress": session.get_progress_percentage(),
                "steps": {
                    "registered": True,
                    "email_verified": session.email_verified_at is not None,
                    "terms_accepted": session.terms_accepted_at is not None,
                    "stripe_started": session.stripe_started_at is not None,
                    "stripe_completed": session.stripe_completed_at is not None
                }
            }
            
            # Add Stripe-specific status if available
            if profile and profile.stripe_account_id:
                try:
                    stripe_status = StripeConnectService.get_account_status(profile.stripe_account_id)
                    status["stripe"] = {
                        "account_id": profile.stripe_account_id,
                        "charges_enabled": stripe_status["charges_enabled"],
                        "payouts_enabled": stripe_status["payouts_enabled"],
                        "requirements": stripe_status["requirements"]
                    }
                except StripeConnectError:
                    status["stripe"] = {"error": "Unable to fetch Stripe status"}
            
            return status
            
        except Exception as e:
            logger.error(f"Failed to get onboarding status for user {user_id}: {str(e)}")
            return {"status": "error", "message": "Unable to fetch status"}
    
    def _complete_onboarding(self, db: Session, user_id: str):
        """
        Complete onboarding and trigger background marketing tasks
        
        Args:
            db: Database session
            user_id: User ID
        """
        try:
            # Update onboarding session
            session = db.query(OnboardingSession).filter_by(user_id=user_id).first()
            if session:
                session.advance_to_step("completed")
            
            # Update creator profile with business rules
            profile = db.query(CreatorProfile).filter_by(user_id=user_id).first()
            if profile:
                profile.complete_activation()
                
                # Apply business rules for initial tier assignment
                self._apply_initial_business_rules(db, profile)
            
            # Schedule background marketing automation tasks
            self._schedule_marketing_automation(user_id)
            
            logger.info(f"Completed onboarding for user {user_id}")
            
        except Exception as e:
            logger.error(f"Failed to complete onboarding for user {user_id}: {str(e)}")
    
    def _apply_initial_business_rules(self, db: Session, profile: CreatorProfile):
        """
        Apply initial business rules for new creator
        
        Args:
            db: Database session
            profile: Creator profile to configure
        """
        try:
            rules_engine = get_rules_engine()
            
            # Set default tier if not already set
            if not profile.pricing_tier:
                profile.pricing_tier = "entry"  # Default for new creators
            
            # Set default account size if not already set  
            if not profile.account_size:
                profile.account_size = "micro"  # Default for new creators
            
            # Get marketing strategy for initial configuration
            strategy = rules_engine.get_marketing_strategy(
                profile.account_size,
                profile.content_categories or []
            )
            
            if strategy:
                # Store initial pricing suggestions in profile metadata
                pricing_suggestions = strategy.pricing_suggestions.get(profile.pricing_tier, (10.0, 20.0))
                logger.info(f"Initial pricing suggestion for user {profile.user_id}: ${pricing_suggestions[0]}-${pricing_suggestions[1]}")
            
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to apply business rules for profile {profile.id}: {str(e)}")
            db.rollback()
    
    def _schedule_marketing_automation(self, user_id: str):
        """
        Schedule background tasks for marketing automation
        
        Args:
            user_id: User ID to process
        """
        try:
            # Import here to avoid circular dependencies
            from .tasks.marketing_auto import (
                schedule_account_size_analysis,
                schedule_pricing_tier_calculation,
                schedule_content_category_detection
            )
            
            # Schedule background tasks (implement with your task queue)
            # These run after successful Stripe onboarding
            schedule_account_size_analysis.delay(user_id)
            schedule_pricing_tier_calculation.delay(user_id)  
            schedule_content_category_detection.delay(user_id)
            
            logger.info(f"Scheduled marketing automation tasks for user {user_id}")
            
        except ImportError:
            logger.warning("Marketing automation tasks not available - implement task queue")
        except Exception as e:
            logger.error(f"Failed to schedule marketing tasks for user {user_id}: {str(e)}")