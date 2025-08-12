import random
from typing import Dict, List, Optional
from datetime import datetime
import json

class MessageGenerator:
    def __init__(self):
        self.templates = self._load_templates()
        self.cialdini_principles = {
            "reciprocity": ["I prepared something special just for you", "Since you've been so supportive"],
            "scarcity": ["Only available for the next 24 hours", "Limited spots remaining"],
            "social_proof": ["My top fans are loving this", "Join 500+ fans who already have this"],
            "authority": ["As a verified creator", "With my years of experience"],
            "liking": ["I really enjoy our chats", "You make me smile"],
            "commitment": ["You've been with me since", "As one of my loyal fans"]
        }
    
    def _load_templates(self) -> Dict:
        """
        Loads message templates for different personality types and phases
        """
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
    
    def generate_message(self, 
                        fan_profile: Dict,
                        phase: str,
                        context: Optional[Dict] = None,
                        account_size: str = "small") -> str:
        """
        Generates a personalized message based on fan profile and IRAS phase
        """
        personality_type = fan_profile["type"]
        templates = self.templates[personality_type][phase]
        
        base_message = random.choice(templates)
        
        if context:
            base_message = self._personalize_message(base_message, context)
        
        principle = self._select_cialdini_principle(fan_profile, phase)
        if principle and random.random() > 0.5:
            addon = random.choice(self.cialdini_principles[principle])
            base_message = f"{base_message} {addon}"
        
        if account_size == "large" and phase in ["attraction", "submission"]:
            base_message = self._add_urgency(base_message)
        
        return base_message
    
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