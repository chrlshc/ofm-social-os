#!/usr/bin/env python3
"""
Advanced ML-based fan classification using transformer models
"""

import logging
import numpy as np
from typing import Dict, List, Tuple, Optional
import json
import pickle
import os
from pathlib import Path

try:
    from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

from config_manager import config
from database import db

logger = logging.getLogger(__name__)

class AdvancedFanClassifier:
    """Advanced ML-based fan personality classifier using transformer models"""
    
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or config.get('ml', 'model_path', default='cardiffnlp/twitter-roberta-base-sentiment-latest')
        self.custom_model_path = Path(__file__).parent / 'models' / 'fan_classifier'
        self.fallback_classifier = None
        
        # Classification labels
        self.personality_labels = ["Emotional", "Conqueror"]
        self.engagement_labels = ["low", "medium", "high"]
        self.spending_labels = ["low_spender", "medium_spender", "high_spender"]
        
        self._load_models()
    
    def _load_models(self):
        """Load ML models for classification"""
        if not TRANSFORMERS_AVAILABLE:
            logger.warning("Transformers library not available. Using fallback classifier.")
            self._load_fallback_model()
            return
        
        try:
            # Try to load custom trained model first
            if self.custom_model_path.exists():
                logger.info(f"Loading custom model from {self.custom_model_path}")
                self.tokenizer = AutoTokenizer.from_pretrained(str(self.custom_model_path))
                self.model = AutoModelForSequenceClassification.from_pretrained(str(self.custom_model_path))
                self.is_custom_model = True
            else:
                # Fall back to pre-trained sentiment model
                logger.info(f"Loading pre-trained model: {self.model_path}")
                self.sentiment_pipeline = pipeline(
                    "sentiment-analysis", 
                    model=self.model_path,
                    tokenizer=self.model_path
                )
                self.is_custom_model = False
                
        except Exception as e:
            logger.error(f"Failed to load transformer model: {e}")
            self._load_fallback_model()
    
    def _load_fallback_model(self):
        """Load simple scikit-learn fallback model"""
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.naive_bayes import MultinomialNB
            from sklearn.pipeline import Pipeline
            
            fallback_model_path = Path(__file__).parent / 'models' / 'fallback_classifier.pkl'
            
            if fallback_model_path.exists():
                with open(fallback_model_path, 'rb') as f:
                    self.fallback_classifier = pickle.load(f)
                logger.info("Loaded fallback scikit-learn model")
            else:
                # Create a basic model if none exists
                self.fallback_classifier = Pipeline([
                    ('tfidf', TfidfVectorizer(max_features=1000)),
                    ('classifier', MultinomialNB())
                ])
                logger.warning("Using untrained fallback model")
                
        except ImportError:
            logger.error("Neither transformers nor scikit-learn available")
            self.fallback_classifier = None
    
    def classify_personality(self, messages: List[str]) -> Tuple[str, float, Dict]:
        """
        Classify fan personality type using advanced ML
        
        Returns:
            Tuple of (personality_type, confidence, analysis_details)
        """
        if not messages:
            return "Emotional", 0.5, {"method": "default"}
        
        text = " ".join(messages)
        
        try:
            if self.is_custom_model and hasattr(self, 'model'):
                return self._classify_with_custom_model(text)
            elif hasattr(self, 'sentiment_pipeline'):
                return self._classify_with_sentiment_model(text, messages)
            elif self.fallback_classifier:
                return self._classify_with_fallback(text)
            else:
                return self._classify_with_heuristics(messages)
                
        except Exception as e:
            logger.error(f"Classification failed: {e}")
            return self._classify_with_heuristics(messages)
    
    def _classify_with_custom_model(self, text: str) -> Tuple[str, float, Dict]:
        """Classify using custom trained model"""
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            probabilities = torch.softmax(outputs.logits, dim=1).numpy()[0]
        
        predicted_idx = probabilities.argmax()
        personality = self.personality_labels[predicted_idx]
        confidence = float(probabilities[predicted_idx])
        
        analysis_details = {
            "method": "custom_transformer",
            "probabilities": {
                label: float(prob) for label, prob in zip(self.personality_labels, probabilities)
            }
        }
        
        return personality, confidence, analysis_details
    
    def _classify_with_sentiment_model(self, text: str, messages: List[str]) -> Tuple[str, float, Dict]:
        """Classify using pre-trained sentiment model + heuristics"""
        # Get sentiment analysis
        sentiment_result = self.sentiment_pipeline(text[:512])  # Limit text length
        sentiment_score = sentiment_result[0]['score']
        sentiment_label = sentiment_result[0]['label']
        
        # Analyze message patterns
        emotional_indicators = self._count_emotional_indicators(messages)
        conqueror_indicators = self._count_conqueror_indicators(messages)
        
        # Combine sentiment with pattern analysis
        emotional_score = emotional_indicators['score']
        conqueror_score = conqueror_indicators['score']
        
        # Adjust scores based on sentiment
        if sentiment_label in ['POSITIVE', 'POS']:
            emotional_score += sentiment_score * 0.3
        elif sentiment_label in ['NEGATIVE', 'NEG']:
            conqueror_score += sentiment_score * 0.2
        
        # Determine personality
        if emotional_score > conqueror_score:
            personality = "Emotional"
            confidence = emotional_score / (emotional_score + conqueror_score)
        else:
            personality = "Conqueror"
            confidence = conqueror_score / (emotional_score + conqueror_score)
        
        analysis_details = {
            "method": "sentiment_plus_heuristics",
            "sentiment": sentiment_result[0],
            "emotional_indicators": emotional_indicators,
            "conqueror_indicators": conqueror_indicators,
            "scores": {"emotional": emotional_score, "conqueror": conqueror_score}
        }
        
        return personality, confidence, analysis_details
    
    def _classify_with_fallback(self, text: str) -> Tuple[str, float, Dict]:
        """Classify using scikit-learn fallback model"""
        try:
            if hasattr(self.fallback_classifier, 'predict_proba'):
                probabilities = self.fallback_classifier.predict_proba([text])[0]
                predicted_idx = probabilities.argmax()
                personality = self.personality_labels[predicted_idx]
                confidence = float(probabilities[predicted_idx])
            else:
                prediction = self.fallback_classifier.predict([text])[0]
                personality = prediction if prediction in self.personality_labels else "Emotional"
                confidence = 0.6
            
            analysis_details = {
                "method": "fallback_sklearn",
                "model_type": type(self.fallback_classifier).__name__
            }
            
        except Exception as e:
            logger.error(f"Fallback classification failed: {e}")
            return self._classify_with_heuristics([text])
        
        return personality, confidence, analysis_details
    
    def _classify_with_heuristics(self, messages: List[str]) -> Tuple[str, float, Dict]:
        """Fallback to original heuristic method"""
        from fan_analyzer import FanAnalyzer
        
        analyzer = FanAnalyzer()
        result = analyzer.analyze_personality_type(messages)
        
        analysis_details = {
            "method": "heuristic_fallback",
            "emotional_score": result.get('emotional_score', 0),
            "conqueror_score": result.get('conqueror_score', 0)
        }
        
        return result['type'], result.get('confidence', 0.5), analysis_details
    
    def _count_emotional_indicators(self, messages: List[str]) -> Dict:
        """Count emotional language indicators with context"""
        emotional_patterns = {
            'need_connection': ['need', 'connect', 'understand', 'lonely', 'alone'],
            'emotional_language': ['feel', 'heart', 'soul', 'touch', 'care', 'love'],
            'vulnerability': ['hurt', 'pain', 'sad', 'miss', 'support', 'comfort'],
            'intimacy': ['close', 'intimate', 'personal', 'special', 'private']
        }
        
        text = " ".join(messages).lower()
        scores = {}
        total_score = 0
        
        for category, words in emotional_patterns.items():
            score = sum(1 for word in words if word in text)
            scores[category] = score
            total_score += score
        
        return {"score": total_score, "categories": scores}
    
    def _count_conqueror_indicators(self, messages: List[str]) -> Dict:
        """Count conqueror language indicators with context"""
        conqueror_patterns = {
            'status_seeking': ['vip', 'exclusive', 'premium', 'elite', 'top', 'best'],
            'competitive': ['first', 'winner', 'champion', 'leader', 'rank'],
            'power_language': ['power', 'control', 'dominate', 'master', 'boss'],
            'achievement': ['success', 'achieve', 'goal', 'target', 'accomplish']
        }
        
        text = " ".join(messages).lower()
        scores = {}
        total_score = 0
        
        for category, words in conqueror_patterns.items():
            score = sum(1 for word in words if word in text)
            scores[category] = score
            total_score += score
        
        return {"score": total_score, "categories": scores}
    
    def classify_engagement_level(self, messages: List[str], conversation_metadata: Dict = None) -> Tuple[str, float]:
        """Classify fan engagement level using multiple signals"""
        indicators = {
            'message_frequency': 1.0,  # From metadata
            'message_length': np.mean([len(msg) for msg in messages]) / 100,
            'enthusiasm_markers': self._count_enthusiasm_markers(messages),
            'question_ratio': sum(1 for msg in messages if '?' in msg) / len(messages),
            'emotional_investment': self._count_emotional_indicators(messages)['score']
        }
        
        if conversation_metadata:
            indicators['time_span_days'] = conversation_metadata.get('time_span_days', 1)
            indicators['response_time_avg'] = 1.0 / (conversation_metadata.get('avg_response_time_hours', 24) / 24)
        
        # Weighted scoring
        engagement_score = (
            indicators['message_frequency'] * 0.3 +
            min(indicators['message_length'], 2.0) * 0.2 +
            indicators['enthusiasm_markers'] * 0.2 +
            indicators['question_ratio'] * 0.15 +
            min(indicators['emotional_investment'], 5) / 5 * 0.15
        )
        
        if engagement_score > 2.0:
            return "high", min(engagement_score / 3.0, 1.0)
        elif engagement_score > 1.0:
            return "medium", engagement_score / 2.0
        else:
            return "low", engagement_score
    
    def _count_enthusiasm_markers(self, messages: List[str]) -> float:
        """Count enthusiasm markers in messages"""
        text = " ".join(messages)
        
        markers = {
            '!': text.count('!') * 0.5,
            'caps_words': sum(1 for word in text.split() if word.isupper() and len(word) > 2) * 0.8,
            'positive_words': sum(1 for word in ['amazing', 'incredible', 'awesome', 'perfect', 'love', 'adore'] 
                                if word in text.lower()) * 1.0,
            'emojis': sum(1 for char in text if ord(char) > 127) * 0.3
        }
        
        return sum(markers.values())
    
    def update_model_with_feedback(self, fan_id: str, messages: List[str], 
                                  true_personality: str, true_engagement: str):
        """Update model with user feedback (for future training)"""
        feedback_data = {
            'fan_id': fan_id,
            'messages': messages,
            'true_personality': true_personality,
            'true_engagement': true_engagement,
            'timestamp': db.get_current_timestamp() if hasattr(db, 'get_current_timestamp') else None
        }
        
        # Save feedback for future model training
        feedback_file = Path(__file__).parent / 'data' / 'feedback.jsonl'
        feedback_file.parent.mkdir(exist_ok=True)
        
        with open(feedback_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(feedback_data) + '\n')
        
        logger.info(f"Saved feedback for fan {fan_id}")

# Global ML classifier instance
ml_classifier = AdvancedFanClassifier() if TRANSFORMERS_AVAILABLE else None