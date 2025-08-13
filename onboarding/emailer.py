"""
Email service for onboarding verification and notifications

Provides secure email delivery for verification tokens and onboarding
progress updates with multi-language support and template rendering.
"""

import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)


class EmailError(Exception):
    """Raised when email operations fail"""
    pass


class EmailService:
    """
    Service for sending onboarding-related emails
    
    Supports multiple email providers and template rendering
    with automatic language detection and secure token delivery.
    """
    
    def __init__(self):
        self.template_env = Environment(
            loader=FileSystemLoader(os.path.join(os.path.dirname(__file__), 'templates')),
            autoescape=select_autoescape(['html', 'xml'])
        )
        
        # Configure email provider (implement with your preferred service)
        self.email_provider = self._get_email_provider()
    
    def _get_email_provider(self):
        """
        Initialize email provider based on configuration
        
        Returns configured email provider instance
        """
        provider_type = os.getenv("EMAIL_PROVIDER", "sendgrid")
        
        if provider_type == "sendgrid":
            return self._init_sendgrid()
        elif provider_type == "ses":
            return self._init_ses()
        elif provider_type == "smtp":
            return self._init_smtp()
        else:
            logger.warning(f"Unknown email provider: {provider_type}, using mock")
            return MockEmailProvider()
    
    def _init_sendgrid(self):
        """Initialize SendGrid email provider"""
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail
            
            api_key = os.getenv("SENDGRID_API_KEY")
            if not api_key:
                raise EmailError("SENDGRID_API_KEY not configured")
            
            return SendGridProvider(api_key)
        except ImportError:
            logger.error("SendGrid not available - install python-sendgrid")
            return MockEmailProvider()
    
    def _init_ses(self):
        """Initialize AWS SES email provider"""
        try:
            import boto3
            
            return SESProvider(boto3.client('ses'))
        except ImportError:
            logger.error("AWS SDK not available - install boto3")
            return MockEmailProvider()
    
    def _init_smtp(self):
        """Initialize SMTP email provider"""
        smtp_config = {
            "host": os.getenv("SMTP_HOST"),
            "port": int(os.getenv("SMTP_PORT", "587")),
            "username": os.getenv("SMTP_USERNAME"),
            "password": os.getenv("SMTP_PASSWORD"),
            "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() == "true"
        }
        
        return SMTPProvider(**smtp_config)
    
    def send_verification_email(
        self, 
        user_email: str, 
        verification_token: str, 
        user_id: str,
        language: str = "en"
    ) -> bool:
        """
        Send email verification message
        
        Args:
            user_email: Recipient email address
            verification_token: Verification token (do not log)
            user_id: User ID for verification
            language: User's preferred language
            
        Returns:
            True if email was sent successfully
        """
        try:
            # Generate verification URL
            base_url = os.getenv("FRONTEND_URL", "https://app.ofm.com")
            verification_url = f"{base_url}/verify-email?token={verification_token}&user_id={user_id}"
            
            # Render email template
            template = self.template_env.get_template(f"email_verification_{language}.html")
            html_content = template.render(
                verification_url=verification_url,
                user_email=user_email,
                expires_minutes=30,
                current_year=datetime.now().year
            )
            
            # Get plain text version
            text_content = self._html_to_text(html_content)
            
            # Send email
            success = self.email_provider.send_email(
                to_email=user_email,
                subject=self._get_subject("verification", language),
                html_content=html_content,
                text_content=text_content
            )
            
            if success:
                logger.info(f"Verification email sent to {user_email}")
            else:
                logger.error(f"Failed to send verification email to {user_email}")
            
            return success
            
        except Exception as e:
            logger.error(f"Email verification sending failed for {user_email}: {str(e)}")
            return False
    
    def send_onboarding_progress_email(
        self,
        user_email: str,
        step: str,
        language: str = "en"
    ) -> bool:
        """
        Send onboarding progress notification
        
        Args:
            user_email: Recipient email address
            step: Current onboarding step
            language: User's preferred language
            
        Returns:
            True if email was sent successfully
        """
        try:
            template = self.template_env.get_template(f"onboarding_progress_{language}.html")
            
            # Step-specific content
            step_content = self._get_step_content(step, language)
            
            html_content = template.render(
                step=step,
                step_title=step_content["title"],
                step_message=step_content["message"],
                next_action=step_content.get("next_action"),
                dashboard_url=f"{os.getenv('FRONTEND_URL', 'https://app.ofm.com')}/dashboard"
            )
            
            text_content = self._html_to_text(html_content)
            
            success = self.email_provider.send_email(
                to_email=user_email,
                subject=self._get_subject("progress", language, step=step),
                html_content=html_content,
                text_content=text_content
            )
            
            return success
            
        except Exception as e:
            logger.error(f"Progress email sending failed for {user_email}: {str(e)}")
            return False
    
    def send_welcome_email(
        self,
        user_email: str,
        user_name: str = None,
        language: str = "en"
    ) -> bool:
        """
        Send welcome email after successful onboarding
        
        Args:
            user_email: Recipient email address
            user_name: User's name (optional)
            language: User's preferred language
            
        Returns:
            True if email was sent successfully
        """
        try:
            template = self.template_env.get_template(f"welcome_{language}.html")
            
            html_content = template.render(
                user_name=user_name or user_email.split('@')[0],
                dashboard_url=f"{os.getenv('FRONTEND_URL', 'https://app.ofm.com')}/dashboard",
                support_email=os.getenv("SUPPORT_EMAIL", "support@ofm.com"),
                current_year=datetime.now().year
            )
            
            text_content = self._html_to_text(html_content)
            
            success = self.email_provider.send_email(
                to_email=user_email,
                subject=self._get_subject("welcome", language),
                html_content=html_content,
                text_content=text_content
            )
            
            return success
            
        except Exception as e:
            logger.error(f"Welcome email sending failed for {user_email}: {str(e)}")
            return False
    
    def _get_subject(self, email_type: str, language: str, **kwargs) -> str:
        """Get localized email subject"""
        subjects = {
            "en": {
                "verification": "Verify your OFM account",
                "progress": "Your OFM onboarding progress",
                "welcome": "Welcome to OFM - You're all set!"
            },
            "fr": {
                "verification": "Vérifiez votre compte OFM",
                "progress": "Votre progression d'intégration OFM",
                "welcome": "Bienvenue chez OFM - Vous êtes prêt(e) !"
            },
            "es": {
                "verification": "Verifica tu cuenta OFM",
                "progress": "Tu progreso de incorporación OFM",
                "welcome": "¡Bienvenido a OFM - Todo listo!"
            }
        }
        
        return subjects.get(language, subjects["en"]).get(email_type, "OFM Notification")
    
    def _get_step_content(self, step: str, language: str) -> Dict[str, str]:
        """Get localized content for onboarding steps"""
        content = {
            "en": {
                "email_verified": {
                    "title": "Email Verified",
                    "message": "Great! Your email has been verified. Next, please review and accept our terms.",
                    "next_action": "Accept Terms & Conditions"
                },
                "terms_accepted": {
                    "title": "Terms Accepted",
                    "message": "Thank you for accepting our terms. Now let's set up your payment account.",
                    "next_action": "Complete Stripe Setup"
                },
                "stripe_completed": {
                    "title": "Payment Setup Complete",
                    "message": "Excellent! Your payment account is ready. You can now start earning with OFM.",
                    "next_action": "Explore Dashboard"
                }
            },
            "fr": {
                "email_verified": {
                    "title": "E-mail vérifié",
                    "message": "Parfait ! Votre e-mail a été vérifié. Veuillez maintenant accepter nos conditions.",
                    "next_action": "Accepter les CGU"
                },
                "terms_accepted": {
                    "title": "Conditions acceptées",
                    "message": "Merci d'avoir accepté nos conditions. Configurons maintenant votre compte de paiement.",
                    "next_action": "Finaliser Stripe"
                },
                "stripe_completed": {
                    "title": "Paiements configurés",
                    "message": "Excellent ! Votre compte de paiement est prêt. Vous pouvez maintenant gagner avec OFM.",
                    "next_action": "Découvrir le tableau de bord"
                }
            }
        }
        
        return content.get(language, content["en"]).get(step, {
            "title": "Update",
            "message": "Your onboarding is progressing.",
            "next_action": "Continue"
        })
    
    def _html_to_text(self, html: str) -> str:
        """Convert HTML to plain text (basic implementation)"""
        try:
            from html2text import html2text
            return html2text(html)
        except ImportError:
            # Fallback: strip HTML tags (very basic)
            import re
            clean = re.compile('<.*?>')
            return re.sub(clean, '', html)


# Email Provider Implementations

class MockEmailProvider:
    """Mock email provider for testing"""
    
    def send_email(self, to_email: str, subject: str, html_content: str, text_content: str) -> bool:
        logger.info(f"MOCK EMAIL - To: {to_email}, Subject: {subject}")
        logger.debug(f"MOCK EMAIL Content: {text_content[:100]}...")
        return True


class SendGridProvider:
    """SendGrid email provider"""
    
    def __init__(self, api_key: str):
        import sendgrid
        from sendgrid.helpers.mail import Mail, Email, To, Content
        
        self.sg = sendgrid.SendGridAPIClient(api_key=api_key)
        self.from_email = Email(os.getenv("FROM_EMAIL", "noreply@ofm.com"))
        
    def send_email(self, to_email: str, subject: str, html_content: str, text_content: str) -> bool:
        try:
            from sendgrid.helpers.mail import Mail, To, Content
            
            mail = Mail(
                from_email=self.from_email,
                to_emails=To(to_email),
                subject=subject,
                html_content=Content("text/html", html_content)
            )
            
            response = self.sg.send(mail)
            return response.status_code < 300
            
        except Exception as e:
            logger.error(f"SendGrid email failed: {str(e)}")
            return False


class SESProvider:
    """AWS SES email provider"""
    
    def __init__(self, ses_client):
        self.ses = ses_client
        self.from_email = os.getenv("FROM_EMAIL", "noreply@ofm.com")
    
    def send_email(self, to_email: str, subject: str, html_content: str, text_content: str) -> bool:
        try:
            response = self.ses.send_email(
                Source=self.from_email,
                Destination={'ToAddresses': [to_email]},
                Message={
                    'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                    'Body': {
                        'Text': {'Data': text_content, 'Charset': 'UTF-8'},
                        'Html': {'Data': html_content, 'Charset': 'UTF-8'}
                    }
                }
            )
            return True
            
        except Exception as e:
            logger.error(f"SES email failed: {str(e)}")
            return False


class SMTPProvider:
    """SMTP email provider"""
    
    def __init__(self, host: str, port: int, username: str, password: str, use_tls: bool = True):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_tls = use_tls
        self.from_email = os.getenv("FROM_EMAIL", "noreply@ofm.com")
    
    def send_email(self, to_email: str, subject: str, html_content: str, text_content: str) -> bool:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.from_email
            msg['To'] = to_email
            
            text_part = MIMEText(text_content, 'plain')
            html_part = MIMEText(html_content, 'html')
            
            msg.attach(text_part)
            msg.attach(html_part)
            
            with smtplib.SMTP(self.host, self.port) as server:
                if self.use_tls:
                    server.starttls()
                if self.username and self.password:
                    server.login(self.username, self.password)
                server.send_message(msg)
            
            return True
            
        except Exception as e:
            logger.error(f"SMTP email failed: {str(e)}")
            return False