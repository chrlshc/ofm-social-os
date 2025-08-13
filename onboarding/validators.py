"""
Input validators for onboarding system

Provides secure validation for user inputs with XSS prevention,
length constraints, and format validation.
"""

import re
import logging
from typing import Tuple, Optional, List
import html
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class ProfileValidator:
    """
    Validator for creator profile fields
    
    Implements strict validation to prevent XSS, SQL injection,
    and ensure data quality.
    """
    
    # Constants for field constraints
    PUBLIC_NAME_MIN_LENGTH = 2
    PUBLIC_NAME_MAX_LENGTH = 100
    DESCRIPTION_MAX_LENGTH = 500
    
    # Regex patterns
    PUBLIC_NAME_PATTERN = re.compile(r'^[\w\s\-\.\']+$', re.UNICODE)
    DANGEROUS_PATTERNS = [
        re.compile(r'<script', re.IGNORECASE),
        re.compile(r'javascript:', re.IGNORECASE),
        re.compile(r'on\w+\s*=', re.IGNORECASE),  # onclick, onload, etc.
        re.compile(r'<iframe', re.IGNORECASE),
        re.compile(r'<object', re.IGNORECASE),
        re.compile(r'<embed', re.IGNORECASE)
    ]
    
    # Forbidden words for public names
    FORBIDDEN_WORDS = {
        'admin', 'administrator', 'moderator', 'support', 
        'official', 'onlyfans', 'system', 'root', 'superuser'
    }
    
    @classmethod
    def validate_public_name(cls, name: str) -> Tuple[bool, Optional[str], str]:
        """
        Validate public name field
        
        Args:
            name: Public name to validate
            
        Returns:
            Tuple of (is_valid, error_message, sanitized_name)
        """
        if not name:
            return False, "Le nom public est requis", ""
        
        # Basic length validation
        name = name.strip()
        if len(name) < cls.PUBLIC_NAME_MIN_LENGTH:
            return False, f"Le nom doit contenir au moins {cls.PUBLIC_NAME_MIN_LENGTH} caractères", ""
        
        if len(name) > cls.PUBLIC_NAME_MAX_LENGTH:
            return False, f"Le nom ne peut pas dépasser {cls.PUBLIC_NAME_MAX_LENGTH} caractères", ""
        
        # Check for dangerous patterns
        for pattern in cls.DANGEROUS_PATTERNS:
            if pattern.search(name):
                return False, "Le nom contient des caractères non autorisés", ""
        
        # Check forbidden words
        name_lower = name.lower()
        for forbidden in cls.FORBIDDEN_WORDS:
            if forbidden in name_lower:
                return False, f"Le nom ne peut pas contenir '{forbidden}'", ""
        
        # Check allowed characters
        if not cls.PUBLIC_NAME_PATTERN.match(name):
            return False, "Le nom ne peut contenir que lettres, chiffres, espaces, tirets, points et apostrophes", ""
        
        # Sanitize by escaping HTML entities
        sanitized_name = html.escape(name)
        
        # Additional check for consecutive spaces
        if '  ' in sanitized_name:
            sanitized_name = ' '.join(sanitized_name.split())
        
        return True, None, sanitized_name
    
    @classmethod
    def validate_description(cls, description: str) -> Tuple[bool, Optional[str], str]:
        """
        Validate description field
        
        Args:
            description: Description to validate
            
        Returns:
            Tuple of (is_valid, error_message, sanitized_description)
        """
        if not description:
            # Description is optional
            return True, None, ""
        
        # Length validation
        description = description.strip()
        if len(description) > cls.DESCRIPTION_MAX_LENGTH:
            return False, f"La description ne peut pas dépasser {cls.DESCRIPTION_MAX_LENGTH} caractères", ""
        
        # Check for dangerous patterns
        for pattern in cls.DANGEROUS_PATTERNS:
            if pattern.search(description):
                return False, "La description contient du contenu non autorisé", ""
        
        # Allow more characters in description but still sanitize
        sanitized_description = html.escape(description)
        
        # Preserve line breaks by converting them to <br>
        sanitized_description = sanitized_description.replace('\n', '<br>')
        
        # Remove excessive line breaks
        while '<br><br><br>' in sanitized_description:
            sanitized_description = sanitized_description.replace('<br><br><br>', '<br><br>')
        
        return True, None, sanitized_description
    
    @classmethod
    def validate_url(cls, url: str, allowed_domains: List[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Validate URL for safety
        
        Args:
            url: URL to validate
            allowed_domains: Optional list of allowed domains
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not url:
            return False, "URL requise"
        
        try:
            parsed = urlparse(url)
            
            # Check scheme
            if parsed.scheme not in ['http', 'https']:
                return False, "Seuls les protocoles HTTP et HTTPS sont autorisés"
            
            # Check domain if allowed list provided
            if allowed_domains and parsed.netloc not in allowed_domains:
                return False, f"Domaine non autorisé. Domaines permis: {', '.join(allowed_domains)}"
            
            # Check for suspicious patterns
            suspicious_patterns = ['javascript:', 'data:', 'vbscript:', 'file:']
            for pattern in suspicious_patterns:
                if pattern in url.lower():
                    return False, "URL contient un schéma non autorisé"
            
            return True, None
            
        except Exception as e:
            logger.error(f"URL validation error: {str(e)}")
            return False, "URL invalide"
    
    @classmethod
    def validate_profile_completion(
        cls, 
        public_name: str, 
        description: str = ""
    ) -> Tuple[bool, Optional[str], dict]:
        """
        Validate complete profile data
        
        Args:
            public_name: Public name
            description: Profile description (optional)
            
        Returns:
            Tuple of (is_valid, error_message, sanitized_data)
        """
        errors = []
        sanitized_data = {}
        
        # Validate public name
        name_valid, name_error, sanitized_name = cls.validate_public_name(public_name)
        if not name_valid:
            errors.append(f"Nom public: {name_error}")
        else:
            sanitized_data['public_name'] = sanitized_name
        
        # Validate description
        desc_valid, desc_error, sanitized_desc = cls.validate_description(description)
        if not desc_valid:
            errors.append(f"Description: {desc_error}")
        else:
            sanitized_data['description'] = sanitized_desc
        
        if errors:
            return False, " | ".join(errors), {}
        
        return True, None, sanitized_data


class EmailValidator:
    """Email validation utilities"""
    
    EMAIL_PATTERN = re.compile(
        r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    )
    
    # Common temporary email domains to block
    BLOCKED_DOMAINS = {
        'tempmail.com', 'throwaway.email', 'guerrillamail.com',
        'mailinator.com', '10minutemail.com', 'trashmail.com'
    }
    
    @classmethod
    def validate_email(cls, email: str) -> Tuple[bool, Optional[str]]:
        """
        Validate email address
        
        Args:
            email: Email to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not email:
            return False, "Email requis"
        
        email = email.strip().lower()
        
        # Check format
        if not cls.EMAIL_PATTERN.match(email):
            return False, "Format d'email invalide"
        
        # Check length
        if len(email) > 255:
            return False, "Email trop long"
        
        # Check blocked domains
        domain = email.split('@')[1]
        if domain in cls.BLOCKED_DOMAINS:
            return False, "Domaine email temporaire non autorisé"
        
        return True, None


class ContentCategoryValidator:
    """Validator for content categories"""
    
    VALID_CATEGORIES = {
        'lifestyle', 'fitness', 'adult', 'fashion', 'art',
        'music', 'gaming', 'education', 'comedy', 'food',
        'travel', 'beauty', 'technology', 'sports', 'other'
    }
    
    MAX_CATEGORIES = 5
    
    @classmethod
    def validate_categories(cls, categories: List[str]) -> Tuple[bool, Optional[str], List[str]]:
        """
        Validate content categories
        
        Args:
            categories: List of category names
            
        Returns:
            Tuple of (is_valid, error_message, valid_categories)
        """
        if not categories:
            return False, "Au moins une catégorie requise", []
        
        if not isinstance(categories, list):
            return False, "Les catégories doivent être une liste", []
        
        if len(categories) > cls.MAX_CATEGORIES:
            return False, f"Maximum {cls.MAX_CATEGORIES} catégories autorisées", []
        
        # Validate each category
        valid_categories = []
        invalid_categories = []
        
        for category in categories:
            if not isinstance(category, str):
                continue
            
            category = category.strip().lower()
            if category in cls.VALID_CATEGORIES:
                valid_categories.append(category)
            else:
                invalid_categories.append(category)
        
        if invalid_categories:
            return False, f"Catégories invalides: {', '.join(invalid_categories)}", []
        
        if not valid_categories:
            return False, "Aucune catégorie valide fournie", []
        
        # Remove duplicates
        valid_categories = list(set(valid_categories))
        
        return True, None, valid_categories