#!/usr/bin/env python3
import unittest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fan_analyzer import FanAnalyzer
from config_manager import config

class TestFanAnalyzer(unittest.TestCase):
    
    def setUp(self):
        self.analyzer = FanAnalyzer()
    
    def test_emotional_personality_detection_english(self):
        """Test emotional personality detection with English messages"""
        # Override language for this test
        config._config['language'] = 'en'
        self.analyzer = FanAnalyzer()
        
        emotional_messages = [
            "I really need to connect with someone",
            "You make me feel so special and understood",
            "I'm feeling lonely and need some comfort"
        ]
        
        result = self.analyzer.analyze_personality_type(emotional_messages)
        
        self.assertEqual(result['type'], 'Emotional')
        self.assertGreater(result['emotional_score'], result['conqueror_score'])
        self.assertIn('sentiment', result)
    
    def test_conqueror_personality_detection_english(self):
        """Test conqueror personality detection with English messages"""
        # Override language for this test
        config._config['language'] = 'en'
        self.analyzer = FanAnalyzer()
        
        conqueror_messages = [
            "I want to be your top supporter",
            "Show me the exclusive VIP content",
            "I'm the best fan you'll ever have"
        ]
        
        result = self.analyzer.analyze_personality_type(conqueror_messages)
        
        self.assertEqual(result['type'], 'Conqueror')
        self.assertGreater(result['conqueror_score'], result['emotional_score'])
    
    def test_emotional_personality_detection_french(self):
        """Test emotional personality detection with French messages"""
        # Override language for this test
        config._config['language'] = 'fr'
        self.analyzer = FanAnalyzer()
        
        emotional_messages = [
            "J'ai vraiment besoin de me connecter avec quelqu'un",
            "Tu me fais sentir si spéciale et comprise",
            "Je me sens seule et j'ai besoin de réconfort"
        ]
        
        result = self.analyzer.analyze_personality_type(emotional_messages)
        
        self.assertEqual(result['type'], 'Emotional')
        self.assertGreater(result['emotional_score'], result['conqueror_score'])
    
    def test_conqueror_personality_detection_french(self):
        """Test conqueror personality detection with French messages"""
        # Override language for this test
        config._config['language'] = 'fr'
        self.analyzer = FanAnalyzer()
        
        conqueror_messages = [
            "Je veux être ton meilleur supporter",
            "Montre-moi le contenu VIP exclusif",
            "Je suis le meilleur fan que tu auras jamais"
        ]
        
        result = self.analyzer.analyze_personality_type(conqueror_messages)
        
        self.assertEqual(result['type'], 'Conqueror')
        self.assertGreater(result['conqueror_score'], result['emotional_score'])
    
    def test_conversation_phase_detection(self):
        """Test IRAS conversation phase detection"""
        # Test intrigue phase (1-2 messages)
        short_messages = ["Hello"]
        phase = self.analyzer.analyze_conversation_phase(short_messages)
        self.assertEqual(phase, 'intrigue')
        
        # Test rapport phase (3-5 messages)
        medium_messages = ["Hello", "How are you?", "I like your content", "You seem nice"]
        phase = self.analyzer.analyze_conversation_phase(medium_messages)
        self.assertEqual(phase, 'rapport')
        
        # Test attraction phase (6-10 messages)
        longer_messages = ["Hello"] * 8
        phase = self.analyzer.analyze_conversation_phase(longer_messages)
        self.assertEqual(phase, 'attraction')
        
        # Test submission phase (11+ messages)
        long_messages = ["Hello"] * 15
        phase = self.analyzer.analyze_conversation_phase(long_messages)
        self.assertEqual(phase, 'submission')
    
    def test_spending_potential_analysis(self):
        """Test spending potential analysis"""
        high_spender_messages = [
            "Money is no object for exclusive content",
            "I'll buy everything you have",
            "I want all your premium stuff"
        ]
        
        result = self.analyzer.calculate_spending_potential(high_spender_messages)
        self.assertEqual(result['potential'], 'high_spender')
        
        low_spender_messages = [
            "I can't afford much right now",
            "Looking for free content",
            "Budget is tight this month"
        ]
        
        result = self.analyzer.calculate_spending_potential(low_spender_messages)
        self.assertEqual(result['potential'], 'low_spender')
    
    def test_engagement_level_detection(self):
        """Test engagement level detection"""
        # Override language for this test
        config._config['language'] = 'en'
        self.analyzer = FanAnalyzer()
        
        high_engagement_messages = [
            "I'm always checking for your content",
            "You're amazing, I can't wait for more",
            "This is incredible, absolutely perfect"
        ]
        
        result = self.analyzer.analyze_personality_type(high_engagement_messages)
        self.assertEqual(result['engagement_level'], 'high')
    
    def test_interests_extraction(self):
        """Test interests extraction from messages"""
        if not self.analyzer.nlp:
            self.skipTest("spaCy model not available")
        
        messages = [
            "I love photography and travel",
            "Gaming is my passion, especially RPGs",
            "Working out at the gym keeps me busy"
        ]
        
        interests = self.analyzer.extract_interests(messages)
        self.assertIsInstance(interests, list)
        # Should extract some interests
        self.assertGreater(len(interests), 0)

if __name__ == '__main__':
    unittest.main()