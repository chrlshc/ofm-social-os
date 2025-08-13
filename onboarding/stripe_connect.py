"""
Stripe Connect Express integration service

Provides hosted onboarding via Account Links and Express Dashboard access.
Follows Stripe Connect best practices for minimal friction onboarding.

References:
- Stripe Connect Onboarding: https://docs.stripe.com/connect/onboarding
- Express Dashboard Integration: https://docs.stripe.com/connect/integrate-express-dashboard
- Account Links: https://docs.stripe.com/api/account_links
"""

import os
import logging
from typing import Dict, Optional, Tuple
import stripe

# Configure Stripe API
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

logger = logging.getLogger(__name__)


class StripeConnectError(Exception):
    """Raised when Stripe Connect operations fail"""
    pass


class StripeConnectService:
    """
    Service for managing Stripe Connect Express accounts
    
    Handles account creation, hosted onboarding via Account Links,
    and Express Dashboard access for creator accounts.
    """
    
    @staticmethod
    def create_express_account(user_email: str, country: str = "FR") -> str:
        """
        Create a new Stripe Express account for creator
        
        Args:
            user_email: Creator's email address
            country: Country code (default: FR for France)
            
        Returns:
            Stripe account ID
            
        Raises:
            StripeConnectError: If account creation fails
        """
        try:
            account = stripe.Account.create(
                type="express",
                email=user_email,
                country=country,
                capabilities={
                    "transfers": {"requested": True},
                    "card_payments": {"requested": True}
                }
            )
            
            logger.info(f"Created Stripe Express account {account.id} for {user_email}")
            return account.id
            
        except stripe.StripeError as e:
            logger.error(f"Failed to create Stripe Express account for {user_email}: {str(e)}")
            raise StripeConnectError(f"Account creation failed: {str(e)}")
    
    @staticmethod
    def create_onboarding_link(
        account_id: str, 
        return_url: str, 
        refresh_url: str
    ) -> str:
        """
        Create hosted onboarding link for Express account
        
        Args:
            account_id: Stripe Express account ID
            return_url: URL to redirect after successful onboarding
            refresh_url: URL to redirect if link expires
            
        Returns:
            Account Link URL for hosted onboarding
            
        Raises:
            StripeConnectError: If link creation fails
        """
        try:
            account_link = stripe.AccountLink.create(
                account=account_id,
                refresh_url=refresh_url,
                return_url=return_url,
                type="account_onboarding",
                collect="eventually_due"  # Collect all required information
            )
            
            logger.info(f"Created onboarding link for account {account_id}")
            return account_link.url
            
        except stripe.StripeError as e:
            logger.error(f"Failed to create onboarding link for {account_id}: {str(e)}")
            raise StripeConnectError(f"Onboarding link creation failed: {str(e)}")
    
    @staticmethod
    def create_account_update_link(
        account_id: str,
        return_url: str,
        refresh_url: str
    ) -> str:
        """
        Create link to update existing Express account details
        
        Args:
            account_id: Stripe Express account ID
            return_url: URL to redirect after update
            refresh_url: URL to redirect if link expires
            
        Returns:
            Account Link URL for account updates
        """
        try:
            account_link = stripe.AccountLink.create(
                account=account_id,
                refresh_url=refresh_url,
                return_url=return_url,
                type="account_update"
            )
            
            return account_link.url
            
        except stripe.StripeError as e:
            raise StripeConnectError(f"Account update link creation failed: {str(e)}")
    
    @staticmethod
    def create_dashboard_login_link(account_id: str) -> str:
        """
        Create login link to Express Dashboard
        
        Note: For test mode accounts only. Live accounts can access
        the Express Dashboard directly via stripe.com.
        
        Args:
            account_id: Stripe Express account ID
            
        Returns:
            Login link URL to Express Dashboard
            
        Raises:
            StripeConnectError: If login link creation fails
        """
        try:
            login_link = stripe.Account.create_login_link(account_id)
            
            logger.info(f"Created dashboard login link for account {account_id}")
            return login_link.url
            
        except stripe.StripeError as e:
            logger.error(f"Failed to create dashboard login link for {account_id}: {str(e)}")
            raise StripeConnectError(f"Dashboard login link creation failed: {str(e)}")
    
    @staticmethod
    def get_account_status(account_id: str) -> Dict:
        """
        Get comprehensive account status and requirements
        
        Args:
            account_id: Stripe Express account ID
            
        Returns:
            Dict containing account status information:
            - charges_enabled: Can process payments
            - payouts_enabled: Can receive payouts  
            - details_submitted: Required details provided
            - requirements: Outstanding requirements
            - capabilities: Account capabilities status
            
        Raises:
            StripeConnectError: If status retrieval fails
        """
        try:
            account = stripe.Account.retrieve(account_id)
            
            # Extract key status information
            status = {
                "charges_enabled": account.charges_enabled,
                "payouts_enabled": account.payouts_enabled,
                "details_submitted": account.details_submitted,
                "requirements": {
                    "currently_due": account.requirements.currently_due or [],
                    "eventually_due": account.requirements.eventually_due or [],
                    "past_due": account.requirements.past_due or [],
                    "pending_verification": account.requirements.pending_verification or [],
                    "disabled_reason": account.requirements.disabled_reason
                },
                "capabilities": {}
            }
            
            # Extract capability status
            if hasattr(account, 'capabilities'):
                for capability, details in account.capabilities.items():
                    status["capabilities"][capability] = details.status
            
            return status
            
        except stripe.StripeError as e:
            logger.error(f"Failed to get account status for {account_id}: {str(e)}")
            raise StripeConnectError(f"Account status retrieval failed: {str(e)}")
    
    @staticmethod
    def is_onboarding_complete(account_id: str) -> bool:
        """
        Check if Express account onboarding is complete
        
        Args:
            account_id: Stripe Express account ID
            
        Returns:
            True if onboarding is complete and account can process payments
        """
        try:
            status = StripeConnectService.get_account_status(account_id)
            return (
                status["charges_enabled"] and
                status["payouts_enabled"] and
                status["details_submitted"]
            )
        except StripeConnectError:
            return False
    
    @staticmethod
    def get_onboarding_progress(account_id: str) -> Tuple[int, str]:
        """
        Get onboarding progress percentage and status message
        
        Args:
            account_id: Stripe Express account ID
            
        Returns:
            Tuple of (progress_percentage, status_message)
        """
        try:
            status = StripeConnectService.get_account_status(account_id)
            
            # Calculate progress based on completion status
            if status["charges_enabled"] and status["payouts_enabled"]:
                return 100, "Onboarding complete - ready to accept payments"
            elif status["details_submitted"]:
                return 75, "Details submitted - verification in progress"
            elif len(status["requirements"]["currently_due"]) == 0:
                return 50, "Initial setup complete"
            else:
                return 25, "Additional information required"
                
        except StripeConnectError:
            return 0, "Unable to determine progress"
    
    @staticmethod
    def handle_webhook_account_updated(account_id: str, db_session) -> bool:
        """
        Handle account.updated webhook to sync status changes
        
        Args:
            account_id: Updated Stripe account ID
            db_session: Database session for updates
            
        Returns:
            True if update was processed successfully
        """
        try:
            from .models import CreatorProfile
            
            # Get current account status
            status = StripeConnectService.get_account_status(account_id)
            
            # Update creator profile with current status
            profile = db_session.query(CreatorProfile).filter_by(
                stripe_account_id=account_id
            ).first()
            
            if profile:
                profile.stripe_charges_enabled = status["charges_enabled"]
                profile.stripe_payouts_enabled = status["payouts_enabled"]
                profile.stripe_onboarding_completed = StripeConnectService.is_onboarding_complete(account_id)
                db_session.commit()
                
                logger.info(f"Updated creator profile for Stripe account {account_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Failed to handle account updated webhook for {account_id}: {str(e)}")
            db_session.rollback()
            return False


class WebhookHandler:
    """Handler for Stripe Connect webhooks"""
    
    @staticmethod
    def verify_webhook_signature(payload: bytes, signature: str) -> bool:
        """
        Verify webhook signature using Stripe webhook secret
        
        Args:
            payload: Raw webhook payload
            signature: Stripe-Signature header value
            
        Returns:
            True if signature is valid
        """
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        if not webhook_secret:
            logger.error("STRIPE_WEBHOOK_SECRET not configured")
            return False
        
        try:
            stripe.Webhook.construct_event(payload, signature, webhook_secret)
            return True
        except (stripe.SignatureVerificationError, ValueError) as e:
            logger.error(f"Webhook signature verification failed: {str(e)}")
            return False
    
    @staticmethod
    def handle_webhook_event(event_type: str, event_data: dict, db_session) -> bool:
        """
        Handle various Stripe Connect webhook events
        
        Args:
            event_type: Stripe event type
            event_data: Event data payload
            db_session: Database session
            
        Returns:
            True if event was processed successfully
        """
        try:
            if event_type == "account.updated":
                account_id = event_data["object"]["id"]
                return StripeConnectService.handle_webhook_account_updated(account_id, db_session)
            
            # Add handling for other relevant events:
            # - capability.updated
            # - person.created, person.updated
            # - account.external_account.created
            
            logger.info(f"Unhandled webhook event type: {event_type}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to handle webhook event {event_type}: {str(e)}")
            return False