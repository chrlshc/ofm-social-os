#!/usr/bin/env python3
"""
Dynamic template management system for OnlyFans chatting assistant
"""

import logging
import random
from typing import Dict, List, Optional, Tuple
import re
from datetime import datetime, timedelta

from config_manager import config
from database import db

logger = logging.getLogger(__name__)

class DynamicTemplateManager:
    """Manages message templates dynamically from database with A/B testing"""
    
    def __init__(self):
        self.templates_cache = {}
        self.cache_timestamp = None
        self.cache_ttl = timedelta(minutes=15)  # Cache templates for 15 minutes
        self.effectiveness_threshold = 0.3  # Minimum effectiveness to keep using template
        
    def get_templates(self, language: str = None) -> Dict[str, Dict[str, List[Dict]]]:
        """Get templates from database with caching"""
        language = language or config.get_language()
        
        # Check cache validity
        if (self.cache_timestamp and 
            datetime.now() - self.cache_timestamp < self.cache_ttl and
            self.templates_cache):
            return self.templates_cache
        
        # Fetch from database
        db_templates = db.get_templates(language)
        
        if db_templates:
            self.templates_cache = db_templates
            self.cache_timestamp = datetime.now()
            logger.info(f"Loaded {self._count_templates(db_templates)} templates from database")
        else:
            # Fallback to hardcoded templates
            logger.warning("No templates in database, using fallback")
            self.templates_cache = self._get_fallback_templates(language)
        
        return self.templates_cache
    
    def _count_templates(self, templates: Dict) -> int:
        """Count total number of templates"""
        count = 0
        for personality in templates.values():
            for phase in personality.values():
                count += len(phase)
        return count
    
    def select_template(self, personality_type: str, phase: str, 
                       context: Optional[Dict] = None, 
                       account_size: str = "small") -> Tuple[str, Optional[str]]:
        """
        Select best template based on effectiveness and A/B testing
        
        Returns:
            Tuple of (template_text, template_id)
        """
        templates = self.get_templates()
        
        if personality_type not in templates or phase not in templates[personality_type]:
            logger.warning(f"No templates found for {personality_type}/{phase}")
            return self._get_fallback_message(personality_type, phase), None
        
        available_templates = templates[personality_type][phase]
        
        if not available_templates:
            return self._get_fallback_message(personality_type, phase), None
        
        # Filter templates by effectiveness threshold
        effective_templates = [
            t for t in available_templates 
            if t.get('effectiveness_score', 0) >= self.effectiveness_threshold
        ]
        
        # If no effective templates, use all available
        if not effective_templates:
            effective_templates = available_templates
        
        # Select template based on weighted effectiveness
        selected_template = self._weighted_template_selection(effective_templates)
        
        # Personalize template
        template_text = self._personalize_template(
            selected_template['text'], 
            context, 
            account_size
        )
        
        # Update usage count
        if selected_template.get('id'):
            db.update_template_effectiveness(
                selected_template['id'], 
                selected_template.get('effectiveness_score', 0.0),
                increment_usage=True
            )
        
        return template_text, selected_template.get('id')
    
    def _weighted_template_selection(self, templates: List[Dict]) -> Dict:
        """Select template using weighted random selection based on effectiveness"""
        if len(templates) == 1:
            return templates[0]
        
        # Calculate weights based on effectiveness score and recency
        weights = []
        for template in templates:
            effectiveness = template.get('effectiveness_score', 0.0)
            usage_count = template.get('usage_count', 0)
            
            # Boost newer templates (lower usage count) for exploration
            exploration_bonus = max(0, 1.0 - (usage_count / 100.0)) * 0.2
            
            # Weight = effectiveness + exploration bonus + small random factor
            weight = max(0.1, effectiveness + exploration_bonus + random.uniform(0, 0.1))
            weights.append(weight)
        
        # Weighted random selection
        total_weight = sum(weights)
        if total_weight == 0:
            return random.choice(templates)
        
        weights = [w / total_weight for w in weights]
        return random.choices(templates, weights=weights)[0]
    
    def _personalize_template(self, template: str, context: Optional[Dict], 
                            account_size: str) -> str:
        """Personalize template with context variables"""
        if not context:
            context = {}
        
        # Default context values
        default_context = {
            'topic': 'our conversation',
            'offer_link': 'exclusive content',
            'rank': 'top supporters'
        }
        
        # Merge with provided context
        full_context = {**default_context, **context}
        
        # Replace placeholders
        personalized = template
        for key, value in full_context.items():
            placeholder = f"{{{key}}}"
            if placeholder in personalized:
                personalized = personalized.replace(placeholder, str(value))
        
        # Add urgency for large accounts
        if account_size == "large" and random.random() > 0.7:
            urgency_phrases = [
                " ⏰ (Limited time!)",
                " 🔥 (Don't miss out!)",
                " ⚡ (Act fast!)"
            ]
            personalized += random.choice(urgency_phrases)
        
        return personalized
    
    def add_template(self, personality_type: str, phase: str, template_text: str,
                    effectiveness_score: float = 0.5, language: str = None) -> bool:
        """Add new template to database and update cache"""
        language = language or config.get_language()
        
        success = db.add_template(
            personality_type=personality_type,
            phase=phase,
            template_text=template_text,
            language=language,
            effectiveness_score=effectiveness_score
        )
        
        if success:
            # Invalidate cache to force reload
            self.cache_timestamp = None
            logger.info(f"Added new template for {personality_type}/{phase}")
        
        return success
    
    def update_template_effectiveness(self, template_id: str, 
                                    effectiveness_score: float) -> bool:
        """Update template effectiveness based on performance data"""
        success = db.update_template_effectiveness(
            template_id=template_id,
            effectiveness_score=effectiveness_score,
            increment_usage=False
        )
        
        if success:
            # Invalidate cache to force reload with updated scores
            self.cache_timestamp = None
            logger.info(f"Updated template {template_id} effectiveness to {effectiveness_score}")
        
        return success
    
    def analyze_template_performance(self, days: int = 30) -> List[Dict]:
        """Analyze template performance over specified period"""
        return db.get_template_performance(days)
    
    def optimize_templates(self) -> Dict[str, int]:
        """Optimize template collection by removing low-performing templates"""
        performance_data = self.analyze_template_performance()
        
        optimization_results = {
            'templates_analyzed': len(performance_data),
            'low_performing_identified': 0,
            'templates_updated': 0
        }
        
        for template_data in performance_data:
            template_id = template_data['id']
            effectiveness = template_data['effectiveness_score']
            usage_count = template_data['usage_count']
            
            # Identify low-performing templates
            if usage_count > 10 and effectiveness < self.effectiveness_threshold:
                optimization_results['low_performing_identified'] += 1
                
                # Reduce effectiveness further to deprioritize
                new_effectiveness = max(0.0, effectiveness * 0.8)
                
                if self.update_template_effectiveness(template_id, new_effectiveness):
                    optimization_results['templates_updated'] += 1
        
        logger.info(f"Template optimization complete: {optimization_results}")
        return optimization_results
    
    def suggest_new_templates(self, personality_type: str, phase: str) -> List[str]:
        """Suggest new template variations based on high-performing templates"""
        templates = self.get_templates()
        
        if (personality_type not in templates or 
            phase not in templates[personality_type]):
            return []
        
        # Get high-performing templates
        high_performers = [
            t for t in templates[personality_type][phase]
            if t.get('effectiveness_score', 0) > 0.7
        ]
        
        if not high_performers:
            return []
        
        # Generate variations
        suggestions = []
        for template in high_performers[:3]:  # Top 3 performers
            variations = self._generate_template_variations(template['text'])
            suggestions.extend(variations)
        
        return suggestions[:5]  # Return top 5 suggestions
    
    def _generate_template_variations(self, original_template: str) -> List[str]:
        """Generate variations of a successful template"""
        variations = []
        
        # Emoji variations
        if '💕' in original_template:
            variations.append(original_template.replace('💕', '💖'))
        if '🔥' in original_template:
            variations.append(original_template.replace('🔥', '⚡'))
        
        # Tone variations
        if 'Hey' in original_template:
            variations.append(original_template.replace('Hey', 'Hi'))
        if 'exclusive' in original_template.lower():
            variations.append(original_template.replace('exclusive', 'special'))
        
        # Question/statement variations
        if '?' not in original_template and not original_template.endswith('...'):
            variations.append(original_template + '?')
        
        return variations
    
    def _get_fallback_templates(self, language: str) -> Dict:
        """Get fallback templates when database is unavailable"""
        if language == 'fr':
            return {
                "Emotional": {
                    "intrigue": [{"text": "Salut mon cœur ! 💕 Comment ça va ?", "id": None}],
                    "rapport": [{"text": "J'ai pensé à toi aujourd'hui 💖", "id": None}],
                    "attraction": [{"text": "J'ai quelque chose de spécial pour toi 😘", "id": None}],
                    "submission": [{"text": "Tu me manques... 💕", "id": None}]
                },
                "Conqueror": {
                    "intrigue": [{"text": "🔥 Prêt pour du contenu exclusif ?", "id": None}],
                    "rapport": [{"text": "Tu es dans mon top 10% ! 🏆", "id": None}],
                    "attraction": [{"text": "Accès VIP disponible maintenant ! 💎", "id": None}],
                    "submission": [{"text": "Les champions méritent le meilleur 👑", "id": None}]
                }
            }
        else:
            return {
                "Emotional": {
                    "intrigue": [{"text": "Hey sweetie! 💕 How are you doing?", "id": None}],
                    "rapport": [{"text": "I was thinking about you today 💖", "id": None}],
                    "attraction": [{"text": "I have something special for you 😘", "id": None}],
                    "submission": [{"text": "I miss you... 💕", "id": None}]
                },
                "Conqueror": {
                    "intrigue": [{"text": "🔥 Ready for exclusive content?", "id": None}],
                    "rapport": [{"text": "You're in my top 10%! 🏆", "id": None}],
                    "attraction": [{"text": "VIP access available now! 💎", "id": None}],
                    "submission": [{"text": "Champions deserve the best 👑", "id": None}]
                }
            }
    
    def _get_fallback_message(self, personality_type: str, phase: str) -> str:
        """Get fallback message when no templates available"""
        fallback_templates = self._get_fallback_templates(config.get_language())
        
        if (personality_type in fallback_templates and 
            phase in fallback_templates[personality_type]):
            return fallback_templates[personality_type][phase][0]['text']
        
        return "Hi! How are you today? 😊"
    
    def get_template_statistics(self) -> Dict:
        """Get comprehensive template statistics"""
        templates = self.get_templates()
        
        stats = {
            'total_templates': self._count_templates(templates),
            'by_personality': {},
            'by_phase': {},
            'effectiveness_distribution': {
                'high': 0,  # > 0.7
                'medium': 0,  # 0.3 - 0.7
                'low': 0  # < 0.3
            }
        }
        
        for personality, phases in templates.items():
            stats['by_personality'][personality] = 0
            for phase, template_list in phases.items():
                stats['by_personality'][personality] += len(template_list)
                stats['by_phase'][phase] = stats['by_phase'].get(phase, 0) + len(template_list)
                
                for template in template_list:
                    effectiveness = template.get('effectiveness_score', 0)
                    if effectiveness > 0.7:
                        stats['effectiveness_distribution']['high'] += 1
                    elif effectiveness >= 0.3:
                        stats['effectiveness_distribution']['medium'] += 1
                    else:
                        stats['effectiveness_distribution']['low'] += 1
        
        return stats

# Global dynamic template manager
template_manager = DynamicTemplateManager()