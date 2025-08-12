import spacy
from textblob import TextBlob
import numpy as np
from typing import Dict, List, Tuple
import re
from collections import Counter
import logging

from config_manager import config

logger = logging.getLogger(__name__)

class FanAnalyzer:
    def __init__(self):
        # Load spaCy model based on configuration
        model_name = config.get_spacy_model()
        try:
            self.nlp = spacy.load(model_name)
            logger.info(f"Loaded spaCy model: {model_name}")
        except Exception as e:
            logger.error(f"Failed to load spaCy model {model_name}: {e}")
            # Fallback to English model
            try:
                self.nlp = spacy.load("en_core_web_sm")
                logger.warning("Fallback to English model")
            except:
                logger.error("No spaCy model available")
                self.nlp = None
        
        # Load keywords based on language
        language = config.get_language()
        self.emotional_keywords, self.conqueror_keywords = self._load_keywords(language)
        
        self.engagement_indicators = self._load_engagement_keywords(language)
    
    def _load_keywords(self, language: str) -> tuple:
        """Load personality keywords based on language"""
        keywords_map = {
            'en': {
                'emotional': {
                    "need", "feel", "heart", "touch", "care", "love", "miss", 
                    "lonely", "special", "connect", "understand", "support",
                    "comfort", "warm", "close", "intimate", "personal", "emotional",
                    "feelings", "soul", "hurt", "pain", "gentle", "soft", "sweet"
                },
                'conqueror': {
                    "best", "top", "vip", "exclusive", "rank", "winner", 
                    "success", "achieve", "goal", "premium", "elite", "status",
                    "champion", "leader", "first", "power", "dominate", "control",
                    "master", "boss", "superior", "dominant", "alpha", "king"
                }
            },
            'fr': {
                'emotional': {
                    "besoin", "sentir", "cœur", "coeur", "toucher", "soin", "amour", "manquer",
                    "seul", "seule", "solitude", "spécial", "spéciale", "connecter", "comprendre", "soutien",
                    "réconfort", "chaleur", "proche", "intime", "personnel", "personnelle", "émotionnel",
                    "sentiments", "âme", "ame", "blessé", "blessée", "douleur", "doux", "douce", "tendre"
                },
                'conqueror': {
                    "meilleur", "meilleure", "top", "vip", "exclusif", "exclusive", "rang", "gagnant", "gagnante",
                    "succès", "réussir", "objectif", "but", "premium", "élite", "elite", "statut", "status",
                    "champion", "championne", "leader", "chef", "premier", "première", "pouvoir", "dominer",
                    "contrôle", "maitre", "maître", "boss", "supérieur", "supérieure", "dominant", "dominante", "alpha", "roi", "reine"
                }
            }
        }
        
        # Get keywords for the specified language, fallback to English
        lang_keywords = keywords_map.get(language, keywords_map['en'])
        emotional = lang_keywords['emotional']
        conqueror = lang_keywords['conqueror']
        
        # If language is not English, merge with English keywords for better coverage
        if language != 'en':
            emotional.update(keywords_map['en']['emotional'])
            conqueror.update(keywords_map['en']['conqueror'])
        
        return emotional, conqueror
    
    def _load_engagement_keywords(self, language: str) -> dict:
        """Load engagement indicator keywords based on language"""
        engagement_map = {
            'en': {
                "high": ["always", "everyday", "can't wait", "obsessed", "amazing", "incredible", "fantastic", "perfect"],
                "medium": ["sometimes", "nice", "good", "like", "enjoy", "pretty", "cool"],
                "low": ["maybe", "perhaps", "okay", "fine", "whatever", "meh", "alright"]
            },
            'fr': {
                "high": ["toujours", "tous les jours", "j'ai hâte", "obsédé", "obsédée", "incroyable", "fantastique", "parfait", "parfaite"],
                "medium": ["parfois", "sympa", "bien", "j'aime", "j'adore", "plutôt", "cool"],
                "low": ["peut-être", "peut être", "ok", "ça va", "peu importe", "bof", "correct"]
            }
        }
        
        # Get engagement keywords for the specified language, fallback to English
        return engagement_map.get(language, engagement_map['en'])
    
    def analyze_personality_type(self, messages: List[str]) -> Dict[str, any]:
        """
        Analyzes fan messages to determine personality type (Emotional vs Conqueror)
        """
        full_text = " ".join(messages).lower()
        
        emotional_score = sum(1 for word in self.emotional_keywords if word in full_text)
        conqueror_score = sum(1 for word in self.conqueror_keywords if word in full_text)
        
        sentiment = self._analyze_sentiment(full_text)
        engagement_level = self._determine_engagement_level(full_text)
        
        personality_type = "Emotional" if emotional_score >= conqueror_score else "Conqueror"
        
        confidence = abs(emotional_score - conqueror_score) / max(emotional_score + conqueror_score, 1)
        
        return {
            "type": personality_type,
            "confidence": min(confidence, 1.0),
            "emotional_score": emotional_score,
            "conqueror_score": conqueror_score,
            "sentiment": sentiment,
            "engagement_level": engagement_level,
            "message_count": len(messages),
            "avg_message_length": np.mean([len(msg) for msg in messages])
        }
    
    def _analyze_sentiment(self, text: str) -> Dict[str, float]:
        """
        Analyzes sentiment using TextBlob
        """
        try:
            blob = TextBlob(text)
            return {
                "polarity": blob.sentiment.polarity,  # -1 to 1
                "subjectivity": blob.sentiment.subjectivity,  # 0 to 1
                "mood": self._classify_mood(blob.sentiment.polarity)
            }
        except:
            return {
                "polarity": 0.0,
                "subjectivity": 0.5,
                "mood": "neutral"
            }
    
    def _classify_mood(self, polarity: float) -> str:
        """
        Classifies mood based on polarity score
        """
        if polarity > 0.5:
            return "very_positive"
        elif polarity > 0.1:
            return "positive"
        elif polarity < -0.5:
            return "very_negative"
        elif polarity < -0.1:
            return "negative"
        else:
            return "neutral"
    
    def _determine_engagement_level(self, text: str) -> str:
        """
        Determines fan engagement level based on message content
        """
        high_count = sum(1 for word in self.engagement_indicators["high"] if word in text)
        medium_count = sum(1 for word in self.engagement_indicators["medium"] if word in text)
        low_count = sum(1 for word in self.engagement_indicators["low"] if word in text)
        
        scores = {"high": high_count, "medium": medium_count, "low": low_count}
        return max(scores, key=scores.get) if any(scores.values()) else "medium"
    
    def analyze_conversation_phase(self, messages: List[str], timestamps: List[str] = None) -> str:
        """
        Determines which IRAS phase the conversation is in
        """
        message_count = len(messages)
        
        if message_count <= 2:
            return "intrigue"
        elif message_count <= 5:
            return "rapport"
        elif message_count <= 10:
            return "attraction"
        else:
            return "submission"
    
    def extract_interests(self, messages: List[str]) -> List[str]:
        """
        Extracts potential interests and topics from messages
        """
        if not self.nlp:
            return []
        
        full_text = " ".join(messages)
        doc = self.nlp(full_text)
        
        interests = []
        for ent in doc.ents:
            if ent.label_ in ["PERSON", "ORG", "PRODUCT", "EVENT"]:
                interests.append(ent.text.lower())
        
        noun_phrases = [chunk.text.lower() for chunk in doc.noun_chunks 
                       if len(chunk.text.split()) <= 3]
        
        interests.extend(noun_phrases)
        
        return list(set(interests))[:10]
    
    def calculate_spending_potential(self, messages: List[str]) -> Dict[str, any]:
        """
        Estimates spending potential based on message patterns
        """
        indicators = {
            "high_spender": [
                r"\$\d{3,}",  # Mentions of $100+
                r"vip|exclusive|premium",
                r"buy.*everything|all.*content",
                r"money.*no.*object|price.*doesn't.*matter"
            ],
            "medium_spender": [
                r"\$\d{2}",  # Mentions of $10-99
                r"some|few|couple",
                r"maybe.*buy|thinking.*about"
            ],
            "low_spender": [
                r"free|cheap|discount",
                r"can't.*afford|too.*expensive",
                r"budget|save|money"
            ]
        }
        
        full_text = " ".join(messages).lower()
        
        scores = {}
        for category, patterns in indicators.items():
            score = sum(1 for pattern in patterns if re.search(pattern, full_text))
            scores[category] = score
        
        potential = max(scores, key=scores.get)
        confidence = scores[potential] / sum(scores.values()) if sum(scores.values()) > 0 else 0
        
        return {
            "potential": potential,
            "confidence": confidence,
            "indicators_found": sum(scores.values())
        }