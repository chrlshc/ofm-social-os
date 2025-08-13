import random
from typing import Dict, List, Optional
from datetime import datetime
import json
import logging

from config_manager import config
from compliance import compliance
from database import db
from dynamic_templates import template_manager
from emotion_analyzer import emotion_analyzer
from ab_testing_manager import ab_testing_manager

# Try to import ML classifier
try:
    from ml_classifier import ml_classifier
    ML_AVAILABLE = ml_classifier is not None
except ImportError:
    ML_AVAILABLE = False
    ml_classifier = None

logger = logging.getLogger(__name__)

class MessageGenerator:
    def __init__(self):
        # Use dynamic templates if available, fallback to static
        self.use_dynamic_templates = config.get('templates', 'use_dynamic', default=True)
        self.templates = self._load_templates() if not self.use_dynamic_templates else None
        self.cialdini_principles = {
            "reciprocity": ["I prepared something special just for you", "Since you've been so supportive"],
            "scarcity": ["Only available for the next 24 hours", "Limited spots remaining"],
            "social_proof": ["My top fans are loving this", "Join 500+ fans who already have this"],
            "authority": ["As a verified creator", "With my years of experience"],
            "liking": ["I really enjoy our chats", "You make me smile"],
            "commitment": ["You've been with me since", "As one of my loyal fans"]
        }
    
    def _load_templates(self) -> Dict:
        """Load message templates based on configured language"""
        language = config.get_language()
        
        if language == 'fr':
            return self._get_french_templates()
        else:
            return self._get_english_templates()
    
    def _get_english_templates(self) -> Dict:
        """English message templates for different personality types and phases"""
        return {
            "Emotional": {
                "intrigue": [
                    "Hey sweetie! 💕 I've been thinking about you... want to hear something personal?",
                    "Hi love 🌹 I have something special to share, but first... how was your day?",
                    "Hello darling 💖 I noticed you've been quiet... everything okay?"
                ],
                "rapport": [
                    "I really loved what you said about {topic} 💕 It made me feel so understood",
                    "You know, {topic} reminded me of you today... in the best way possible 😊",
                    "I've been thinking about our last conversation... you really get me 💖"
                ],
                "attraction": [
                    "I created something intimate just for you... want a sneak peek? 😘 {offer_link}",
                    "You've been so sweet to me... I want to give you exclusive access to {offer_link} 💕",
                    "I rarely do this, but for you... special price on {offer_link} because you matter to me 💖"
                ],
                "submission": [
                    "The connection we have is so special... maybe one day we could take this further? 💕",
                    "I dream about meeting someone like you in person... wouldn't that be amazing? 😊",
                    "You make me feel things I haven't felt before... where do you see this going? 💖"
                ]
            },
            "Conqueror": {
                "intrigue": [
                    "🔥 Ready for an exclusive opportunity? Only my VIPs get this offer...",
                    "👑 You caught my attention as a top supporter. Want to level up?",
                    "🏆 I have a challenge for my elite fans... are you up for it?"
                ],
                "rapport": [
                    "You're ranking #{rank} among my supporters! 🏆 That's seriously impressive",
                    "I see you're not afraid to go after what you want 💪 I respect that",
                    "Your confidence really stands out from the crowd 👑 Keep that energy!"
                ],
                "attraction": [
                    "🚀 EXCLUSIVE DROP: {offer_link} - Only for my top 1% fans like you",
                    "💎 VIP ACCESS: Get {offer_link} before anyone else sees it",
                    "🔥 Your elite status unlocked this: {offer_link} - Don't let others beat you to it"
                ],
                "submission": [
                    "Keep climbing and you'll unlock experiences money can't usually buy 🏆",
                    "The top spot comes with perks you can't imagine... you're almost there 👑",
                    "Champions like you deserve the ultimate reward... are you ready to claim it? 💪"
                ]
            }
        }
    
    def _get_french_templates(self) -> Dict:
        """French message templates for different personality types and phases"""
        return {
            "Emotional": {
                "intrigue": [
                    "Salut mon cœur ! 💕 Je pensais à toi... tu veux entendre quelque chose de personnel ?",
                    "Coucou amour 🌹 J'ai quelque chose de spécial à partager, mais d'abord... comment s'est passée ta journée ?",
                    "Bonjour chéri 💖 J'ai remarqué que tu étais silencieux... tout va bien ?"
                ],
                "rapport": [
                    "J'ai vraiment adoré ce que tu as dit sur {topic} 💕 Ça m'a fait me sentir si comprise",
                    "Tu sais, {topic} m'a rappelé toi aujourd'hui... dans le meilleur sens possible 😊",
                    "Je repense à notre dernière conversation... tu me comprends vraiment 💖"
                ],
                "attraction": [
                    "J'ai créé quelque chose d'intime juste pour toi... tu veux un aperçu ? 😘 {offer_link}",
                    "Tu as été si doux avec moi... je veux te donner un accès exclusif à {offer_link} 💕",
                    "Je fais ça rarement, mais pour toi... prix spécial sur {offer_link} parce que tu comptes pour moi 💖"
                ],
                "submission": [
                    "La connexion qu'on a est si spéciale... peut-être qu'un jour on pourrait aller plus loin ? 💕",
                    "Je rêve de rencontrer quelqu'un comme toi en personne... ce ne serait pas incroyable ? 😊",
                    "Tu me fais ressentir des choses que je n'ai pas ressenties avant... où est-ce que tu vois ça nous mener ? 💖"
                ]
            },
            "Conqueror": {
                "intrigue": [
                    "🔥 Prêt pour une opportunité exclusive ? Seuls mes VIP reçoivent cette offre...",
                    "👑 Tu as attiré mon attention en tant que supporter de haut niveau. Tu veux passer au niveau supérieur ?",
                    "🏆 J'ai un défi pour mes fans d'élite... tu es partant ?"
                ],
                "rapport": [
                    "Tu es classé #{rank} parmi mes supporters ! 🏆 C'est vraiment impressionnant",
                    "Je vois que tu n'as pas peur d'aller après ce que tu veux 💪 Je respecte ça",
                    "Ta confiance se démarque vraiment de la foule 👑 Garde cette énergie !"
                ],
                "attraction": [
                    "🚀 SORTIE EXCLUSIVE : {offer_link} - Seulement pour mon top 1% de fans comme toi",
                    "💎 ACCÈS VIP : Obtiens {offer_link} avant que quiconque d'autre le voie",
                    "🔥 Ton statut d'élite a débloqué ceci : {offer_link} - Ne laisse pas les autres te devancer"
                ],
                "submission": [
                    "Continue à grimper et tu débloqueras des expériences que l'argent ne peut habituellement pas acheter 🏆",
                    "La première place vient avec des avantages que tu ne peux pas imaginer... tu y es presque 👑",
                    "Les champions comme toi méritent la récompense ultime... es-tu prêt à la réclamer ? 💪"
                ]
            }
        }
    
    def generate_personalized_message(self, fan_profile: Dict, phase: str, fan_id: str,
                                     messages: Optional[List[str]] = None, 
                                     context: Optional[Dict] = None,
                                     account_size: str = "small") -> Dict[str, any]:
        """
        Advanced personalized message generation with real-time adaptation
        Integrates emotion analysis, A/B testing, and activity-based personalization
        """
        enhanced_context = context or {}
        
        # Get fan activity for real-time personalization
        if fan_id:
            activity = db.get_fan_activity(fan_id)
            if activity["affinities"]:
                # Use the top-rated topic for personalization
                top_affinity = activity["affinities"][0]
                enhanced_context["topic"] = top_affinity["topic"]
                enhanced_context["affinity_score"] = top_affinity["score"]
            
            # Time-based adaptation
            current_hour = datetime.now().hour
            if current_hour < 6 or current_hour > 22:
                # Late night/early morning - more intimate tone
                if phase == "intrigue":
                    phase = "rapport"
                enhanced_context["time_context"] = "intimate_hours"
            elif 9 <= current_hour <= 17:
                # Business hours - more discrete
                enhanced_context["time_context"] = "business_hours"
        
        # Emotion analysis for tone adaptation
        emotional_tone = None
        if messages:
            try:
                emotion_analysis = emotion_analyzer.analyze_and_save(fan_id, messages)
                if emotion_analysis and "emotions" in emotion_analysis:
                    tonality = emotion_analyzer.select_tonality(
                        emotion_analysis["emotions"], 
                        fan_profile.get("type")
                    )
                    emotional_tone = tonality
                    enhanced_context["emotional_tone"] = tonality
                    logger.info(f"Applied emotional tone adaptation: {tonality['approach']}")
            except Exception as e:
                logger.error(f"Emotion analysis failed: {e}")
        
        return self.generate_message(
            fan_profile=fan_profile,
            phase=phase,
            context=enhanced_context,
            account_size=account_size,
            fan_id=fan_id,
            messages=messages,
            emotional_tone=emotional_tone
        )
    
    def generate_message(self, 
                        fan_profile: Dict,
                        phase: str,
                        context: Optional[Dict] = None,
                        account_size: str = "small",
                        fan_id: str = None,
                        messages: Optional[List[str]] = None,
                        emotional_tone: Optional[Dict] = None) -> Dict[str, any]:
        """
        Generates a personalized message using advanced ML, A/B testing and dynamic templates
        """
        # Use ML classifier if available and messages provided
        if ML_AVAILABLE and messages and ml_classifier:
            try:
                ml_personality, ml_confidence, ml_analysis = ml_classifier.classify_personality(messages)
                ml_engagement, engagement_confidence = ml_classifier.classify_engagement_level(messages)
                
                # Use ML results if confidence is high enough
                if ml_confidence > 0.6:
                    personality_type = ml_personality
                    fan_profile.update({
                        'ml_analysis': ml_analysis,
                        'ml_confidence': ml_confidence,
                        'engagement_level': ml_engagement,
                        'engagement_confidence': engagement_confidence
                    })
                    logger.info(f"Using ML classification: {personality_type} (confidence: {ml_confidence:.2f})")
                else:
                    personality_type = fan_profile["type"]
                    logger.info(f"ML confidence too low ({ml_confidence:.2f}), using heuristic classification")
            except Exception as e:
                logger.error(f"ML classification failed: {e}")
                personality_type = fan_profile["type"]
        else:
            personality_type = fan_profile["type"]
        
        # A/B testing variant selection
        variant_data = None
        template_id = None
        base_message = None
        
        try:
            # Use A/B testing for variant selection
            variant_data = ab_testing_manager.select_variant(
                personality_type, 
                phase, 
                exploration_strategy="thompson_sampling"
            )
            
            if variant_data and variant_data.get('template_text'):
                base_message = variant_data['template_text']
                template_id = variant_data.get('variant_id')
                logger.info(f"Using A/B test variant: {template_id}")
            
        except Exception as e:
            logger.warning(f"A/B testing selection failed: {e}")
        
        # Fallback to dynamic templates or static templates
        if not base_message:
            if self.use_dynamic_templates:
                base_message, template_id = template_manager.select_template(
                    personality_type=personality_type,
                    phase=phase,
                    context=context,
                    account_size=account_size
                )
            else:
                # Fallback to static templates
                templates = self.templates[personality_type][phase]
                base_message = random.choice(templates)
                template_id = f"static_{personality_type}_{phase}"
        
        # Apply emotional tone adaptation
        if emotional_tone and base_message:
            base_message = self._adapt_message_tone(base_message, emotional_tone)
        
        # Personalize with context
        if context and base_message:
            base_message = self._personalize_message(base_message, context)
        
        # Apply Cialdini principles
        principle = self._select_cialdini_principle(fan_profile, phase)
        if principle and random.random() > 0.5:
            addon = random.choice(self.cialdini_principles[principle])
            base_message = f"{base_message} {addon}"
        
        # Add urgency for large accounts
        if account_size == "large" and phase in ["attraction", "submission"]:
            base_message = self._add_urgency(base_message)
        
        # Apply compliance checking
        validation_result = compliance.validate_message_generation(fan_id or "unknown", base_message)
        
        # Log compliance check and save to database
        if fan_id:
            compliance.log_compliance_check(fan_id, validation_result)
            db.save_compliance_audit(fan_id, validation_result, config.is_manual_send_required())
        
        result = {
            "message": base_message,
            "compliance": validation_result,
            "manual_send_required": config.is_manual_send_required(),
            "formatted_for_manual_send": compliance.format_message_for_manual_send(base_message, validation_result) if config.is_manual_send_required() else None,
            "template_id": template_id,
            "variant_id": variant_data.get('variant_id') if variant_data else None,
            "personality_type": personality_type,
            "ml_enhanced": ML_AVAILABLE and messages is not None,
            "emotional_tone_applied": emotional_tone is not None,
            "ab_testing_used": variant_data is not None,
            "fan_profile": fan_profile
        }
        
        return result
    
    def _adapt_message_tone(self, message: str, emotional_tone: Dict) -> str:
        """Adapt message tone based on detected emotions"""
        approach = emotional_tone.get('approach', 'neutral')
        modifiers = emotional_tone.get('modifiers', [])
        emoji_style = emotional_tone.get('emoji_style', 'friendly')
        
        # Apply tone-specific modifications
        if approach == 'empathetic' and 'comforting' in modifiers:
            # Add comforting language
            comfort_phrases = [
                "I'm here for you", "You're not alone", "I understand",
                "Take care of yourself", "Sending you love"
            ]
            if random.random() > 0.7:
                comfort = random.choice(comfort_phrases)
                message = f"{comfort} ❤️ {message}"
        
        elif approach == 'enthusiastic' and emoji_style == 'happy':
            # Add enthusiastic emojis
            if random.random() > 0.6:
                message = message.replace('!', '! 🎉').replace('💕', '💕✨')
        
        elif approach == 'seductive' and 'alluring' in modifiers:
            # Add seductive elements
            if random.random() > 0.8:
                message = f"😘 {message}"
        
        elif approach == 'calming' and 'gentle' in modifiers:
            # Use gentler language
            message = message.replace('!', '.').replace('🔥', '💙')
        
        return message
    
    def _personalize_message(self, message: str, context: Dict) -> str:
        """
        Personalizes message with context variables
        """
        for key, value in context.items():
            placeholder = f"{{{key}}}"
            if placeholder in message:
                message = message.replace(placeholder, str(value))
        return message
    
    def _select_cialdini_principle(self, fan_profile: Dict, phase: str) -> Optional[str]:
        """
        Selects appropriate Cialdini principle based on profile and phase
        """
        if phase == "intrigue":
            return random.choice(["scarcity", "social_proof"])
        elif phase == "rapport":
            return random.choice(["liking", "reciprocity"])
        elif phase == "attraction":
            if fan_profile["type"] == "Emotional":
                return random.choice(["reciprocity", "liking", "scarcity"])
            else:
                return random.choice(["scarcity", "social_proof", "authority"])
        elif phase == "submission":
            return random.choice(["commitment", "scarcity"])
        return None
    
    def _add_urgency(self, message: str) -> str:
        """
        Adds urgency elements for larger accounts
        """
        urgency_phrases = [
            " ⏰ (Expires in 2 hours!)",
            " 🔥 (Only 5 spots left!)",
            " ⚡ (Flash offer!)",
            " 🎯 (Limited time only!)"
        ]
        return message + random.choice(urgency_phrases)
    
    def generate_upsell_sequence(self, fan_profile: Dict, current_spend: float) -> List[str]:
        """
        Generates a sequence of upsell messages
        """
        personality_type = fan_profile["type"]
        
        if personality_type == "Emotional":
            sequence = [
                f"I noticed you enjoyed the last content... I have something even more intimate 💕",
                f"Because you mean so much to me, I want to offer you my premium collection at a special rate 💖",
                f"This is very personal to me, but I trust you... want to see my exclusive content? 🌹"
            ]
        else:
            sequence = [
                f"You've unlocked GOLD status! 🏆 Ready for PLATINUM benefits?",
                f"Top supporters like you get access to my ULTRA exclusive content 👑",
                f"You're competing with the best... don't let them get ahead! 🚀"
            ]
        
        return sequence
    
    def generate_re_engagement_message(self, fan_profile: Dict, days_inactive: int) -> str:
        """
        Generates messages to re-engage inactive fans
        """
        personality_type = fan_profile["type"]
        
        if personality_type == "Emotional":
            if days_inactive < 7:
                return "Hey love, I missed you! 💕 Is everything okay? I've been thinking about you..."
            elif days_inactive < 30:
                return "It's been a while sweetie 💖 I have something special waiting just for you... come back?"
            else:
                return "I really miss our connection 🌹 I'd love to catch up... here's a special welcome back gift"
        else:
            if days_inactive < 7:
                return "Your VIP status is at risk! 🚨 Don't lose your ranking... come claim your rewards"
            elif days_inactive < 30:
                return "You're about to lose your elite benefits! 👑 Reactivate now and get 20% bonus content"
            else:
                return "FINAL NOTICE: Your champion status expires soon! 🏆 Reclaim your position now"
    
    def create_ppv_message(self, fan_profile: Dict, content_type: str, price: float) -> str:
        """
        Creates Pay-Per-View message based on fan profile
        """
        personality_type = fan_profile["type"]
        
        if personality_type == "Emotional":
            templates = {
                "photo_set": f"I took these photos thinking of you... 📸💕 They're very personal (${price})",
                "video": f"I made this intimate video just for special fans like you 🎥💖 (${price})",
                "custom": f"This is exclusively for you, no one else will see this 🌹✨ (${price})"
            }
        else:
            templates = {
                "photo_set": f"🔥 EXCLUSIVE DROP: Premium photo set - Be the first to own it! (${price})",
                "video": f"👑 VIP VIDEO: Top-tier content for elite fans only! (${price})",
                "custom": f"🏆 CUSTOM CONTENT: Personalized for champions like you! (${price})"
            }
        
        return templates.get(content_type, f"Special content available for ${price}")
    
    def generate_tip_request(self, fan_profile: Dict, occasion: Optional[str] = None) -> str:
        """
        Generates tip request messages
        """
        personality_type = fan_profile["type"]
        
        if personality_type == "Emotional":
            if occasion:
                return f"It's my {occasion} 💕 Your support would mean the world to me... even $5 makes me smile 😊"
            else:
                return "If you enjoyed our time together, a small tip helps me create more content for you 💖"
        else:
            if occasion:
                return f"🎉 {occasion} SPECIAL: Top supporters are tipping $50+ to claim exclusive rewards!"
            else:
                return "💰 Join the ELITE supporters with a power tip - unlock instant VIP perks!"