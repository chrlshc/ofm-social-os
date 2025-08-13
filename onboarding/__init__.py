"""
OFM Onboarding Module

Pre-connection onboarding system with minimal friction:
1. Register (email + password)
2. Verify email via short-lived token
3. Accept terms
4. Stripe Connect Express onboarding
5. Auto-detect locale/timezone
6. Background marketing automation (post-activation)
"""

from .routes import bp as onboarding_bp

__all__ = ['onboarding_bp']