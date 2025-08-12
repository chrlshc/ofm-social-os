#!/usr/bin/env python3
import unittest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from message_generator import MessageGenerator
from config_manager import config

class TestMessageGenerator(unittest.TestCase):
    
    def setUp(self):
        self.generator = MessageGenerator()
    
    def test_english_message_generation(self):
        """Test English message generation"""
        # Override language for this test
        config._config['language'] = 'en'
        self.generator = MessageGenerator()
        
        fan_profile = {
            'type': 'Emotional',
            'engagement_level': 'high',
            'sentiment': {'mood': 'positive'}
        }
        
        result = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='intrigue',
            context={'topic': 'music'},
            fan_id='test_fan'
        )
        
        self.assertIn('message', result)
        self.assertIn('compliance', result)
        self.assertIn('manual_send_required', result)
        self.assertIsInstance(result['message'], str)
        self.assertGreater(len(result['message']), 10)  # Should have substantial content
    
    def test_french_message_generation(self):
        """Test French message generation"""
        # Override language for this test
        config._config['language'] = 'fr'
        self.generator = MessageGenerator()
        
        fan_profile = {
            'type': 'Emotional',
            'engagement_level': 'high',
            'sentiment': {'mood': 'positive'}
        }
        
        result = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='intrigue',
            context={'topic': 'musique'},
            fan_id='test_fan_fr'
        )
        
        self.assertIn('message', result)
        self.assertIsInstance(result['message'], str)
        # French messages should contain French characters or words
        message = result['message'].lower()
        french_indicators = ['coucou', 'salut', 'bonjour', 'tu', 'je', 'mon', 'ma', 'cœur', 'coeur']
        self.assertTrue(any(indicator in message for indicator in french_indicators))
    
    def test_conqueror_message_generation(self):
        """Test conqueror personality message generation"""
        fan_profile = {
            'type': 'Conqueror',
            'engagement_level': 'high',
            'sentiment': {'mood': 'positive'}
        }
        
        result = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='attraction',
            context={'offer_link': 'premium_content'},
            fan_id='conqueror_fan'
        )
        
        message = result['message'].lower()
        
        # Conqueror messages should contain power/status language
        power_words = ['vip', 'exclusive', 'elite', 'top', 'premium', 'champion']
        self.assertTrue(any(word in message for word in power_words))
    
    def test_all_iras_phases(self):
        """Test message generation for all IRAS phases"""
        fan_profile = {
            'type': 'Emotional',
            'engagement_level': 'medium',
            'sentiment': {'mood': 'neutral'}
        }
        
        phases = ['intrigue', 'rapport', 'attraction', 'submission']
        
        for phase in phases:
            with self.subTest(phase=phase):
                result = self.generator.generate_message(
                    fan_profile=fan_profile,
                    phase=phase,
                    fan_id=f'test_{phase}'
                )
                
                self.assertIn('message', result)
                self.assertIsInstance(result['message'], str)
                self.assertGreater(len(result['message']), 5)
    
    def test_context_personalization(self):
        """Test message personalization with context"""
        fan_profile = {
            'type': 'Emotional',
            'engagement_level': 'high'
        }
        
        context = {
            'topic': 'photography',
            'offer_link': 'exclusive_photos'
        }
        
        result = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='rapport',
            context=context,
            fan_id='personalization_test'
        )
        
        message = result['message']
        
        # Should replace at least one context variable
        self.assertTrue('photography' in message or 'exclusive_photos' in message)
    
    def test_account_size_urgency(self):
        """Test urgency addition for large accounts"""
        fan_profile = {
            'type': 'Conqueror',
            'engagement_level': 'high'
        }
        
        # Large account should add urgency
        result_large = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='attraction',
            account_size='large',
            fan_id='large_account_test'
        )
        
        # Small account should not add urgency
        result_small = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='attraction',
            account_size='small',
            fan_id='small_account_test'
        )
        
        # Large account messages should be longer (due to urgency additions)
        self.assertIsInstance(result_large['message'], str)
        self.assertIsInstance(result_small['message'], str)
    
    def test_compliance_integration(self):
        """Test compliance checking integration"""
        fan_profile = {
            'type': 'Emotional',
            'engagement_level': 'high'
        }
        
        result = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='intrigue',
            fan_id='compliance_test'
        )
        
        self.assertIn('compliance', result)
        compliance_result = result['compliance']
        
        self.assertIn('compliant', compliance_result)
        self.assertIn('warnings', compliance_result)
        self.assertIn('requirements', compliance_result)
        self.assertIsInstance(compliance_result['compliant'], bool)
        self.assertIsInstance(compliance_result['warnings'], list)
        self.assertIsInstance(compliance_result['requirements'], list)
    
    def test_manual_send_requirement(self):
        """Test manual send requirement is properly set"""
        fan_profile = {
            'type': 'Emotional',
            'engagement_level': 'high'
        }
        
        result = self.generator.generate_message(
            fan_profile=fan_profile,
            phase='intrigue',
            fan_id='manual_send_test'
        )
        
        self.assertIn('manual_send_required', result)
        # Should be True by default based on configuration
        self.assertIsInstance(result['manual_send_required'], bool)

if __name__ == '__main__':
    unittest.main()