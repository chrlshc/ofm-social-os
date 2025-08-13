#!/usr/bin/env python3
"""
Advanced emotion analysis for fan message tone adaptation
Integrates with transformers for sophisticated emotional understanding
"""

import logging
from typing import Dict, List, Optional, Tuple
import re
from datetime import datetime

# Try to import transformers for advanced emotion analysis
try:
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

# Fallback emotion detection using TextBlob and keyword analysis
try:
    from textblob import TextBlob
    TEXTBLOB_AVAILABLE = True
except ImportError:
    TEXTBLOB_AVAILABLE = False

from database import db
from config_manager import config

logger = logging.getLogger(__name__)

class EmotionAnalyzer:
    """
    Analyzes emotional content in fan messages to adapt response tone
    Uses transformer models when available, with fallback to keyword analysis
    """
    
    def __init__(self):
        self.transformer_model = None
        self.emotion_pipeline = None
        self.sentiment_pipeline = None
        
        # Emotional keywords for fallback analysis
        self.emotion_keywords = {
            'joy': {
                'keywords': ['happy', 'excited', 'amazing', 'love', 'wonderful', 'fantastic', 
                           'great', 'awesome', 'perfect', 'beautiful', '😄', '😊', '🥰', '💕'],
                'weight': 1.0
            },
            'sadness': {
                'keywords': ['sad', 'lonely', 'miss', 'depressed', 'down', 'hurt', 'pain',
                           'sorry', 'disappointed', 'cry', '😢', '😭', '💔'],
                'weight': 0.8
            },
            'anger': {
                'keywords': ['angry', 'mad', 'annoyed', 'frustrated', 'hate', 'stupid',
                           'annoying', 'pissed', 'furious', '😠', '😡', '🤬'],
                'weight': 0.9
            },
            'fear': {
                'keywords': ['scared', 'afraid', 'worried', 'nervous', 'anxious', 'panic',
                           'concerned', 'stress', 'frightened', '😰', '😨'],
                'weight': 0.7
            },
            'surprise': {
                'keywords': ['wow', 'amazing', 'incredible', 'unbelievable', 'shocking',
                           'unexpected', 'surprised', '😮', '😲', '🤯'],
                'weight': 0.6
            },
            'love': {
                'keywords': ['love', 'adore', 'cherish', 'treasure', 'devoted', 'romantic',
                           'passion', 'affection', 'darling', '❤️', '💖', '💘'],
                'weight': 1.2
            },
            'desire': {
                'keywords': ['want', 'need', 'crave', 'desire', 'wish', 'hope', 'dream',
                           'fantasize', 'long', '🔥', '💋', '😘'],
                'weight': 1.1
            },
            'trust': {
                'keywords': ['trust', 'believe', 'faith', 'confident', 'reliable', 'honest',
                           'genuine', 'sincere', 'loyal'],
                'weight': 0.8
            }
        }
        
        # Tone adaptations based on emotions
        self.tone_adaptations = {
            'joy': {
                'approach': 'enthusiastic',
                'modifiers': ['upbeat', 'energetic', 'celebrating'],
                'emoji_style': 'happy'
            },
            'sadness': {
                'approach': 'empathetic',
                'modifiers': ['comforting', 'understanding', 'supportive'],
                'emoji_style': 'caring'
            },
            'anger': {
                'approach': 'calming',
                'modifiers': ['gentle', 'patient', 'understanding'],
                'emoji_style': 'peaceful'
            },
            'fear': {
                'approach': 'reassuring',
                'modifiers': ['protective', 'secure', 'confident'],
                'emoji_style': 'comforting'
            },
            'love': {
                'approach': 'romantic',
                'modifiers': ['intimate', 'affectionate', 'devoted'],
                'emoji_style': 'romantic'
            },
            'desire': {
                'approach': 'seductive',
                'modifiers': ['alluring', 'teasing', 'captivating'],
                'emoji_style': 'flirty'
            },
            'trust': {
                'approach': 'genuine',
                'modifiers': ['honest', 'reliable', 'authentic'],
                'emoji_style': 'sincere'
            }
        }
        
        self._initialize_models()
    
    def _initialize_models(self):
        """Initialize emotion analysis models"""
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Transformers not available, using fallback emotion analysis")
            return
        
        try:
            # Initialize emotion classification pipeline
            emotion_model = config.get('emotion_analysis', 'model', 
                                     default='bhadresh-savani/distilbert-base-uncased-emotion')
            
            self.emotion_pipeline = pipeline(
                "text-classification",
                model=emotion_model,
                return_all_scores=True
            )
            
            # Initialize sentiment analysis pipeline for additional context
            self.sentiment_pipeline = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                return_all_scores=True
            )
            
            logger.info("Emotion analysis models initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize emotion models: {e}")
            self.emotion_pipeline = None
            self.sentiment_pipeline = None
    
    def detect_emotions(self, messages: List[str]) -> Dict[str, float]:
        """
        Detect emotions in fan messages
        Returns a dictionary of emotions with confidence scores
        """
        if not messages:
            return {}
        
        # Combine all messages for analysis
        text = " ".join(messages).strip()
        
        if not text:
            return {}
        
        # Try transformer-based analysis first
        if self.emotion_pipeline:
            try:
                return self._analyze_with_transformers(text)
            except Exception as e:
                logger.warning(f"Transformer emotion analysis failed: {e}")
        
        # Fallback to keyword-based analysis
        return self._analyze_with_keywords(text)
    
    def _analyze_with_transformers(self, text: str) -> Dict[str, float]:
        """Analyze emotions using transformer models"""
        # Get emotion predictions
        emotion_results = self.emotion_pipeline(text)[0]
        emotions = {item['label'].lower(): item['score'] for item in emotion_results}
        
        # Get sentiment for additional context
        if self.sentiment_pipeline:
            sentiment_results = self.sentiment_pipeline(text)[0]
            sentiments = {item['label'].lower(): item['score'] for item in sentiment_results}
            
            # Enhance emotion scores with sentiment context
            if 'positive' in sentiments and sentiments['positive'] > 0.7:
                emotions['joy'] = emotions.get('joy', 0) + 0.2
                emotions['love'] = emotions.get('love', 0) + 0.15
            elif 'negative' in sentiments and sentiments['negative'] > 0.7:
                emotions['sadness'] = emotions.get('sadness', 0) + 0.2
                emotions['anger'] = emotions.get('anger', 0) + 0.15
        
        # Normalize scores
        total_score = sum(emotions.values())
        if total_score > 0:
            emotions = {k: v / total_score for k, v in emotions.items()}
        
        return emotions
    
    def _analyze_with_keywords(self, text: str) -> Dict[str, float]:
        """Fallback emotion analysis using keyword matching"""
        text_lower = text.lower()
        emotion_scores = {}
        
        for emotion, config in self.emotion_keywords.items():
            score = 0.0
            keyword_count = 0
            
            for keyword in config['keywords']:
                if keyword in text_lower:
                    # Count occurrences and apply weight
                    count = text_lower.count(keyword)
                    score += count * config['weight']
                    keyword_count += count
            
            # Normalize by text length to avoid bias toward longer messages
            if keyword_count > 0:
                text_length = len(text.split())
                emotion_scores[emotion] = min(score / max(text_length, 1), 1.0)
        
        # Add TextBlob sentiment if available
        if TEXTBLOB_AVAILABLE:
            try:
                blob = TextBlob(text)
                polarity = blob.sentiment.polarity
                
                if polarity > 0.3:
                    emotion_scores['joy'] = emotion_scores.get('joy', 0) + polarity * 0.5
                elif polarity < -0.3:
                    emotion_scores['sadness'] = emotion_scores.get('sadness', 0) + abs(polarity) * 0.5
                    
            except Exception as e:
                logger.debug(f"TextBlob analysis failed: {e}")
        
        # Normalize scores
        if emotion_scores:
            max_score = max(emotion_scores.values())
            if max_score > 0:
                emotion_scores = {k: v / max_score for k, v in emotion_scores.items()}
        
        return emotion_scores
    
    def get_dominant_emotion(self, emotions: Dict[str, float]) -> Tuple[str, float]:
        """Get the dominant emotion and its confidence"""
        if not emotions:
            return "neutral", 0.0
        
        dominant_emotion = max(emotions.items(), key=lambda x: x[1])
        return dominant_emotion[0], dominant_emotion[1]
    
    def select_tonality(self, emotions: Dict[str, float], fan_personality: str = None) -> Dict[str, str]:
        """
        Select appropriate message tonality based on emotions and personality
        """
        if not emotions:
            return {"approach": "neutral", "modifiers": [], "emoji_style": "friendly"}
        
        dominant_emotion, confidence = self.get_dominant_emotion(emotions)
        
        # Get base tone adaptation
        tone_config = self.tone_adaptations.get(dominant_emotion, {
            'approach': 'neutral',
            'modifiers': ['friendly'],
            'emoji_style': 'friendly'
        })
        
        # Adjust based on fan personality
        if fan_personality:
            tone_config = self._adjust_for_personality(tone_config, fan_personality, dominant_emotion)
        
        # Add confidence level
        tone_config['confidence'] = confidence
        tone_config['dominant_emotion'] = dominant_emotion
        
        return tone_config
    
    def _adjust_for_personality(self, tone_config: Dict, personality: str, emotion: str) -> Dict:
        """Adjust tone based on fan personality type"""
        adjusted_config = tone_config.copy()
        
        if personality.lower() == "emotional":
            # Emotional types prefer more intimate and caring approaches
            if emotion in ['sadness', 'fear']:
                adjusted_config['modifiers'].extend(['nurturing', 'protective'])
            elif emotion in ['joy', 'love']:
                adjusted_config['modifiers'].extend(['intimate', 'personal'])
            
        elif personality.lower() == "conqueror":
            # Conqueror types prefer more direct and confident approaches
            if emotion in ['anger', 'frustration']:
                adjusted_config['approach'] = 'confident'
                adjusted_config['modifiers'] = ['strong', 'decisive', 'leadership']
            elif emotion in ['joy', 'excitement']:
                adjusted_config['modifiers'].extend(['victorious', 'accomplished'])
        
        return adjusted_config
    
    def analyze_and_save(self, fan_id: str, messages: List[str], 
                        conversation_id: str = None) -> Dict[str, any]:
        """
        Analyze emotions and save to database
        Returns comprehensive emotional analysis
        """
        emotions = self.detect_emotions(messages)
        
        if not emotions:
            return {"error": "No emotions detected"}
        
        # Save to database
        db.save_fan_emotions(
            fan_id=fan_id,
            emotions=emotions,
            conversation_id=conversation_id,
            message_count=len(messages)
        )
        
        # Get dominant emotion and tonality
        dominant_emotion, confidence = self.get_dominant_emotion(emotions)
        
        # Get historical emotional profile
        emotional_profile = db.get_fan_emotional_profile(fan_id)
        
        return {
            "emotions": emotions,
            "dominant_emotion": dominant_emotion,
            "confidence": confidence,
            "emotional_profile": emotional_profile,
            "analysis_timestamp": datetime.now().isoformat()
        }
    
    def get_emotion_insights(self, fan_id: str, days: int = 30) -> Dict[str, any]:
        """Get comprehensive emotion insights for a fan"""
        try:
            emotional_profile = db.get_fan_emotional_profile(fan_id, days)
            
            if not emotional_profile:
                return {"insights": "No emotional data available"}
            
            # Generate insights based on emotional patterns
            insights = []
            
            primary_emotion = emotional_profile.get("primary_emotion")
            confidence = emotional_profile.get("confidence", 0)
            
            if primary_emotion and confidence > 0.6:
                if primary_emotion in ['joy', 'love']:
                    insights.append("Fan shows positive emotional engagement - good rapport building opportunity")
                elif primary_emotion in ['sadness', 'loneliness']:
                    insights.append("Fan may need emotional support - use empathetic approach")
                elif primary_emotion == 'desire':
                    insights.append("Fan shows strong interest - opportunity for premium content offers")
                elif primary_emotion == 'trust':
                    insights.append("Fan shows high trust level - good for deeper engagement")
            
            # Analyze emotion distribution for patterns
            emotion_distribution = emotional_profile.get("emotion_distribution", [])
            if len(emotion_distribution) > 1:
                insights.append(f"Fan shows {len(emotion_distribution)} different emotional states - adapt messaging style accordingly")
            
            return {
                "emotional_profile": emotional_profile,
                "insights": insights,
                "recommendation": self._get_messaging_recommendation(primary_emotion, confidence)
            }
            
        except Exception as e:
            logger.error(f"Failed to get emotion insights for {fan_id}: {e}")
            return {"error": str(e)}
    
    def _get_messaging_recommendation(self, primary_emotion: str, confidence: float) -> Dict[str, str]:
        """Get specific messaging recommendations based on emotional state"""
        if confidence < 0.5:
            return {
                "approach": "neutral",
                "message": "Use balanced approach - emotional signals unclear"
            }
        
        recommendations = {
            'joy': {
                "approach": "enthusiastic",
                "message": "Match their positive energy with upbeat, celebratory messages"
            },
            'sadness': {
                "approach": "supportive",
                "message": "Offer comfort and understanding, avoid overly cheerful content"
            },
            'love': {
                "approach": "romantic",
                "message": "Use intimate language and romantic themes"
            },
            'desire': {
                "approach": "seductive",
                "message": "Perfect time for exclusive content offers and teasers"
            },
            'anger': {
                "approach": "calming",
                "message": "Use patient, understanding tone to defuse tension"
            },
            'trust': {
                "approach": "genuine",
                "message": "Build on trust with authentic, personal communication"
            }
        }
        
        return recommendations.get(primary_emotion, {
            "approach": "adaptive",
            "message": "Adjust messaging style based on fan responses"
        })

# Global emotion analyzer instance
emotion_analyzer = EmotionAnalyzer()