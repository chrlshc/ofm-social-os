"""
OnlyFans questionnaire service for manual data collection

Provides a fallback mechanism when API access is not available
or when users prefer to manually input their statistics.
"""

import logging
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class AccountSizeCategory(Enum):
    """Account size categories based on follower count"""
    MICRO = "micro"      # < 1,000 followers
    SMALL = "small"      # 1,000 - 10,000 followers  
    MEDIUM = "medium"    # 10,000 - 50,000 followers
    LARGE = "large"      # > 50,000 followers


class PricingTierCategory(Enum):
    """Pricing tier categories based on subscription price"""
    ENTRY = "entry"      # $5-15/month
    MID = "mid"          # $15-30/month
    PREMIUM = "premium"  # $30+/month


@dataclass
class QuestionnaireData:
    """Validated questionnaire data structure"""
    follower_count: int
    subscription_price: float
    average_tip_amount: float
    posts_per_week: int
    ppv_messages_per_month: int
    average_ppv_price: float
    content_categories: list[str]
    months_active: int
    daily_new_fans: int
    churn_rate_percent: float


class OnlyFansQuestionnaire:
    """
    Service for analyzing creator metrics from manual questionnaire input
    
    Provides heuristics-based analysis when API access is not available
    or when creators prefer manual data entry.
    """
    
    # Thresholds for account size classification
    SIZE_THRESHOLDS = {
        AccountSizeCategory.MICRO: (0, 1000),
        AccountSizeCategory.SMALL: (1000, 10000),
        AccountSizeCategory.MEDIUM: (10000, 50000),
        AccountSizeCategory.LARGE: (50000, float('inf'))
    }
    
    # Pricing tier thresholds
    PRICING_THRESHOLDS = {
        PricingTierCategory.ENTRY: (0, 15),
        PricingTierCategory.MID: (15, 30),
        PricingTierCategory.PREMIUM: (30, float('inf'))
    }
    
    # Content category mappings
    VALID_CATEGORIES = {
        'lifestyle', 'fitness', 'adult', 'fashion', 'art', 
        'music', 'gaming', 'education', 'comedy', 'other'
    }
    
    @classmethod
    def validate_questionnaire(cls, data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Validate questionnaire input data
        
        Args:
            data: Raw questionnaire data
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            # Required fields validation
            required_fields = [
                'follower_count', 'subscription_price', 'average_tip_amount',
                'posts_per_week', 'content_categories'
            ]
            
            for field in required_fields:
                if field not in data:
                    return False, f"Champ requis manquant: {field}"
            
            # Numeric validation
            if not isinstance(data['follower_count'], (int, float)) or data['follower_count'] < 0:
                return False, "Nombre de followers invalide"
            
            if not isinstance(data['subscription_price'], (int, float)) or data['subscription_price'] < 0:
                return False, "Prix d'abonnement invalide"
            
            if not isinstance(data['posts_per_week'], (int, float)) or data['posts_per_week'] < 0:
                return False, "Nombre de posts par semaine invalide"
            
            # Category validation
            categories = data.get('content_categories', [])
            if not isinstance(categories, list) or not categories:
                return False, "Catégories de contenu requises"
            
            invalid_categories = set(categories) - cls.VALID_CATEGORIES
            if invalid_categories:
                return False, f"Catégories invalides: {invalid_categories}"
            
            # Range validation
            if data['follower_count'] > 10000000:  # 10M max
                return False, "Nombre de followers irréaliste"
            
            if data['subscription_price'] > 200:  # $200 max
                return False, "Prix d'abonnement irréaliste"
            
            if data['posts_per_week'] > 100:
                return False, "Nombre de posts par semaine irréaliste"
            
            return True, None
            
        except Exception as e:
            logger.error(f"Erreur validation questionnaire: {str(e)}")
            return False, "Données invalides"
    
    @classmethod
    def parse_questionnaire(cls, data: Dict[str, Any]) -> QuestionnaireData:
        """
        Parse and normalize questionnaire data
        
        Args:
            data: Validated questionnaire data
            
        Returns:
            Structured questionnaire data
        """
        return QuestionnaireData(
            follower_count=int(data['follower_count']),
            subscription_price=float(data['subscription_price']),
            average_tip_amount=float(data.get('average_tip_amount', 0)),
            posts_per_week=int(data.get('posts_per_week', 3)),
            ppv_messages_per_month=int(data.get('ppv_messages_per_month', 0)),
            average_ppv_price=float(data.get('average_ppv_price', 0)),
            content_categories=data.get('content_categories', []),
            months_active=int(data.get('months_active', 0)),
            daily_new_fans=int(data.get('daily_new_fans', 0)),
            churn_rate_percent=float(data.get('churn_rate_percent', 5.0))
        )
    
    @classmethod
    def analyze_from_questionnaire(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze creator metrics from questionnaire data
        
        Args:
            data: Raw questionnaire data
            
        Returns:
            Analysis results with account size, pricing tier, and recommendations
        """
        # Validate input
        is_valid, error = cls.validate_questionnaire(data)
        if not is_valid:
            raise ValueError(f"Questionnaire invalide: {error}")
        
        # Parse data
        q_data = cls.parse_questionnaire(data)
        
        # Determine account size
        account_size = cls._classify_account_size(q_data.follower_count)
        
        # Determine pricing tier
        pricing_tier = cls._classify_pricing_tier(q_data.subscription_price)
        
        # Calculate estimated monthly revenue
        estimated_revenue = cls._estimate_monthly_revenue(q_data)
        
        # Generate growth score
        growth_score = cls._calculate_growth_score(q_data)
        
        # Generate recommendations
        recommendations = cls._generate_recommendations(q_data, account_size, pricing_tier)
        
        return {
            "account_size": account_size.value,
            "pricing_tier": pricing_tier.value,
            "follower_count": q_data.follower_count,
            "estimated_monthly_revenue": round(estimated_revenue, 2),
            "growth_score": growth_score,
            "content_categories": q_data.content_categories,
            "recommendations": recommendations,
            "analysis_method": "questionnaire",
            "analyzed_at": datetime.utcnow().isoformat()
        }
    
    @classmethod
    def _classify_account_size(cls, follower_count: int) -> AccountSizeCategory:
        """Classify account size based on follower count"""
        for category, (min_val, max_val) in cls.SIZE_THRESHOLDS.items():
            if min_val <= follower_count < max_val:
                return category
        return AccountSizeCategory.MICRO
    
    @classmethod
    def _classify_pricing_tier(cls, subscription_price: float) -> PricingTierCategory:
        """Classify pricing tier based on subscription price"""
        for category, (min_val, max_val) in cls.PRICING_THRESHOLDS.items():
            if min_val <= subscription_price < max_val:
                return category
        return PricingTierCategory.ENTRY
    
    @classmethod
    def _estimate_monthly_revenue(cls, data: QuestionnaireData) -> float:
        """
        Estimate monthly revenue based on questionnaire data
        
        Formula considers:
        - Subscription revenue (with churn)
        - Tip revenue
        - PPV message revenue
        """
        # Active subscribers (accounting for churn)
        retention_rate = (100 - data.churn_rate_percent) / 100
        active_subscribers = data.follower_count * retention_rate * 0.1  # Assume 10% conversion
        
        # Subscription revenue
        subscription_revenue = active_subscribers * data.subscription_price
        
        # Tip revenue (estimate based on averages)
        tip_frequency = 0.05  # 5% of subscribers tip per month
        tip_revenue = active_subscribers * tip_frequency * data.average_tip_amount
        
        # PPV revenue
        ppv_conversion = 0.02  # 2% buy PPV messages
        ppv_revenue = active_subscribers * ppv_conversion * data.ppv_messages_per_month * data.average_ppv_price
        
        total_revenue = subscription_revenue + tip_revenue + ppv_revenue
        
        return total_revenue
    
    @classmethod
    def _calculate_growth_score(cls, data: QuestionnaireData) -> float:
        """
        Calculate growth potential score (0-100)
        
        Factors:
        - Content frequency
        - Fan acquisition rate
        - Account age vs size
        - Content diversity
        """
        score = 0.0
        
        # Content frequency score (max 25 points)
        if data.posts_per_week >= 7:
            score += 25
        elif data.posts_per_week >= 4:
            score += 20
        elif data.posts_per_week >= 2:
            score += 15
        else:
            score += 10
        
        # Fan acquisition score (max 25 points)
        if data.daily_new_fans >= 50:
            score += 25
        elif data.daily_new_fans >= 20:
            score += 20
        elif data.daily_new_fans >= 5:
            score += 15
        else:
            score += 10
        
        # Growth trajectory score (max 25 points)
        if data.months_active > 0:
            monthly_growth_rate = data.follower_count / max(data.months_active, 1)
            if monthly_growth_rate >= 1000:
                score += 25
            elif monthly_growth_rate >= 500:
                score += 20
            elif monthly_growth_rate >= 100:
                score += 15
            else:
                score += 10
        
        # Content diversity score (max 25 points)
        category_count = len(data.content_categories)
        if category_count >= 3:
            score += 25
        elif category_count >= 2:
            score += 20
        else:
            score += 15
        
        return min(score, 100.0)
    
    @classmethod
    def _generate_recommendations(
        cls, 
        data: QuestionnaireData, 
        account_size: AccountSizeCategory,
        pricing_tier: PricingTierCategory
    ) -> Dict[str, Any]:
        """Generate personalized recommendations based on analysis"""
        recommendations = {
            "pricing": [],
            "content": [],
            "marketing": [],
            "revenue": []
        }
        
        # Pricing recommendations
        if account_size in [AccountSizeCategory.MEDIUM, AccountSizeCategory.LARGE] and pricing_tier == PricingTierCategory.ENTRY:
            recommendations["pricing"].append({
                "action": "increase_price",
                "reason": "Votre base de fans justifie un prix plus élevé",
                "suggested_range": "$20-30"
            })
        
        if data.subscription_price > 50 and account_size == AccountSizeCategory.MICRO:
            recommendations["pricing"].append({
                "action": "decrease_price",
                "reason": "Prix trop élevé pour votre taille de compte",
                "suggested_range": "$10-15"
            })
        
        # Content recommendations
        if data.posts_per_week < 3:
            recommendations["content"].append({
                "action": "increase_frequency",
                "reason": "Augmentez la fréquence pour améliorer l'engagement",
                "target": "5-7 posts par semaine"
            })
        
        if len(data.content_categories) == 1:
            recommendations["content"].append({
                "action": "diversify_content",
                "reason": "Diversifiez pour attirer une audience plus large",
                "suggestion": "Ajoutez du contenu lifestyle ou behind-the-scenes"
            })
        
        # Marketing recommendations
        if data.daily_new_fans < 10:
            recommendations["marketing"].append({
                "action": "boost_acquisition",
                "reason": "Acquisition de fans faible",
                "tactics": ["Collaborations", "Promotions croisées", "Contenu teasers gratuit"]
            })
        
        # Revenue optimization
        if data.ppv_messages_per_month == 0:
            recommendations["revenue"].append({
                "action": "start_ppv",
                "reason": "Source de revenus inexploitée",
                "potential": "Peut augmenter les revenus de 20-40%"
            })
        
        if data.average_tip_amount < 5:
            recommendations["revenue"].append({
                "action": "incentivize_tips",
                "reason": "Montant moyen des tips faible",
                "tactics": ["Tip menus", "Objectifs de tips", "Contenu exclusif pour tippers"]
            })
        
        return recommendations