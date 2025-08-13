"""
Secure email verification token service

Implements OWASP Authentication Cheat Sheet recommendations:
- Cryptographically secure random token generation
- Short TTL (30 minutes) to reduce attack surface
- Single-use tokens with immediate invalidation
- Hash storage (never store plaintext tokens)
- Proper cleanup of expired tokens

References:
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
"""

import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from .models import VerificationToken

# Security configuration
TOKEN_TTL_MINUTES = 30  # Short-lived tokens per OWASP recommendations
TOKEN_BYTE_LENGTH = 32  # 256 bits of entropy
CLEANUP_THRESHOLD_HOURS = 24  # Clean up expired tokens older than this


class TokenSecurityError(Exception):
    """Raised when token operations fail due to security violations"""
    pass


class EmailTokenService:
    """
    Secure token service for email verification
    
    Provides cryptographically secure token generation, verification,
    and automatic cleanup following OWASP security guidelines.
    """
    
    @staticmethod
    def _generate_token_pair() -> tuple[str, str]:
        """
        Generate secure token pair: (raw_token, hashed_token_id)
        
        Returns:
            Tuple of (raw token to send via email, hashed ID for database)
        """
        # Generate cryptographically secure random token
        raw_token = secrets.token_urlsafe(TOKEN_BYTE_LENGTH)
        
        # Create hash for database storage (never store plaintext)
        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        
        return raw_token, token_hash
    
    @staticmethod
    def issue_email_verification_token(db: Session, user_id: str) -> str:
        """
        Issue new email verification token for user
        
        Args:
            db: Database session
            user_id: User ID to generate token for
            
        Returns:
            Raw token to send via email (do not log or store)
            
        Raises:
            TokenSecurityError: If token generation fails
        """
        try:
            # Invalidate any existing tokens for this user (single active token)
            EmailTokenService._invalidate_user_tokens(db, user_id, "email_verify")
            
            # Generate secure token pair
            raw_token, token_hash = EmailTokenService._generate_token_pair()
            
            # Store hashed token with expiration
            verification_token = VerificationToken(
                id=token_hash,
                user_id=user_id,
                purpose="email_verify",
                expires_at=datetime.utcnow() + timedelta(minutes=TOKEN_TTL_MINUTES),
                used=False
            )
            
            db.add(verification_token)
            db.commit()
            
            return raw_token
            
        except Exception as e:
            db.rollback()
            raise TokenSecurityError(f"Token generation failed: {str(e)}")
    
    @staticmethod
    def verify_email_token(db: Session, user_id: str, raw_token: str) -> bool:
        """
        Verify and consume email verification token
        
        Args:
            db: Database session
            user_id: User ID to verify token for
            raw_token: Raw token from email link
            
        Returns:
            True if token is valid and consumed, False otherwise
        """
        try:
            # Hash the provided token to match against database
            token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
            
            # Find matching unused token
            token_record = db.query(VerificationToken).filter(
                VerificationToken.id == token_hash,
                VerificationToken.user_id == user_id,
                VerificationToken.purpose == "email_verify",
                VerificationToken.used == False
            ).first()
            
            # Validate token exists and is not expired
            if not token_record or not token_record.is_valid():
                return False
            
            # Mark token as used (single-use enforcement)
            token_record.used = True
            db.commit()
            
            return True
            
        except Exception:
            # Fail securely - don't reveal internal errors
            db.rollback()
            return False
    
    @staticmethod
    def _invalidate_user_tokens(db: Session, user_id: str, purpose: str):
        """Invalidate all existing tokens for user and purpose"""
        db.query(VerificationToken).filter(
            VerificationToken.user_id == user_id,
            VerificationToken.purpose == purpose,
            VerificationToken.used == False
        ).update({"used": True})
    
    @staticmethod
    def cleanup_expired_tokens(db: Session) -> int:
        """
        Clean up expired verification tokens
        
        Should be run periodically to prevent database bloat.
        Removes tokens older than CLEANUP_THRESHOLD_HOURS.
        
        Returns:
            Number of tokens cleaned up
        """
        cleanup_cutoff = datetime.utcnow() - timedelta(hours=CLEANUP_THRESHOLD_HOURS)
        
        deleted_count = db.query(VerificationToken).filter(
            VerificationToken.created_at < cleanup_cutoff
        ).delete()
        
        db.commit()
        return deleted_count
    
    @staticmethod
    def get_token_info(db: Session, user_id: str) -> Optional[dict]:
        """
        Get information about active verification tokens for user
        
        Returns None if no active tokens, otherwise returns dict with:
        - expires_at: Token expiration time
        - created_at: Token creation time
        - time_remaining: Minutes until expiration
        """
        token = db.query(VerificationToken).filter(
            VerificationToken.user_id == user_id,
            VerificationToken.purpose == "email_verify",
            VerificationToken.used == False
        ).first()
        
        if not token or not token.is_valid():
            return None
        
        time_remaining = (token.expires_at - datetime.utcnow()).total_seconds() / 60
        
        return {
            "expires_at": token.expires_at.isoformat(),
            "created_at": token.created_at.isoformat(),
            "time_remaining_minutes": max(0, int(time_remaining))
        }
    
    @staticmethod
    def generate_email_verification_url(base_url: str, token: str, user_id: str) -> str:
        """
        Generate secure email verification URL
        
        Args:
            base_url: Frontend base URL
            token: Raw verification token
            user_id: User ID for verification
            
        Returns:
            Complete verification URL for email
        """
        return f"{base_url}/verify-email?token={token}&user_id={user_id}"


def create_cleanup_task():
    """
    Factory function to create periodic cleanup task
    
    Usage with background task runner (Celery, etc.):
    
    @periodic_task(run_every=crontab(minute=0))  # Run hourly
    def cleanup_expired_tokens():
        with get_db_session() as db:
            count = EmailTokenService.cleanup_expired_tokens(db)
            logger.info(f"Cleaned up {count} expired verification tokens")
    """
    def cleanup_task(db_session_factory):
        with db_session_factory() as db:
            return EmailTokenService.cleanup_expired_tokens(db)
    
    return cleanup_task