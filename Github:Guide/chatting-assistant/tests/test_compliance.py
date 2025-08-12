#!/usr/bin/env python3
import unittest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from compliance import ComplianceManager

class TestComplianceManager(unittest.TestCase):
    
    def setUp(self):
        self.compliance = ComplianceManager()
    
    def test_compliant_message_validation(self):
        """Test validation of a compliant message"""
        message = "Hey! I hope you're having a great day 😊"
        result = self.compliance.validate_message_generation("test_fan", message)
        
        self.assertIn('compliant', result)
        self.assertIn('warnings', result)
        self.assertIn('requirements', result)
        self.assertIsInstance(result['compliant'], bool)
        self.assertIsInstance(result['warnings'], list)
        self.assertIsInstance(result['requirements'], list)
    
    def test_manual_send_requirement(self):
        """Test manual send requirement is added"""
        message = "Test message"
        result = self.compliance.validate_message_generation("test_fan", message)
        
        # Should have manual send requirement
        manual_req = next((req for req in result['requirements'] 
                          if req['type'] == 'manual_send'), None)
        self.assertIsNotNone(manual_req)
        self.assertEqual(manual_req['type'], 'manual_send')
    
    def test_automated_language_detection(self):
        """Test detection of automated language"""
        automated_message = "This is an automatically generated response from our bot"
        result = self.compliance.validate_message_generation("test_fan", automated_message)
        
        # Should warn about automated language
        automated_warning = next((w for w in result['warnings'] 
                                if w['type'] == 'automated_language'), None)
        self.assertIsNotNone(automated_warning)
    
    def test_message_length_check(self):
        """Test message length validation"""
        # Very long message should trigger warning
        long_message = "A" * 2000  # Exceeds typical limits
        result = self.compliance.validate_message_generation("test_fan", long_message)
        
        # Should warn about message length
        length_warning = next((w for w in result['warnings'] 
                              if w['type'] == 'message_length'), None)
        self.assertIsNotNone(length_warning)
    
    def test_spam_indicators_detection(self):
        """Test detection of spam indicators"""
        spam_message = "URGENT!!! ACT NOW!!! LIMITED TIME!!!"
        result = self.compliance.validate_message_generation("test_fan", spam_message)
        
        # Should warn about spam indicators
        spam_warning = next((w for w in result['warnings'] 
                            if w['type'] == 'spam_indicators'), None)
        self.assertIsNotNone(spam_warning)
    
    def test_excessive_emojis_detection(self):
        """Test detection of excessive emoji usage"""
        emoji_message = "Hello 😀😃😄😁😆😅😂🤣☺️😊😇🙂🙃😉😌"
        result = self.compliance.validate_message_generation("test_fan", emoji_message)
        
        # Should warn about excessive emojis
        emoji_warning = next((w for w in result['warnings'] 
                             if w['type'] == 'excessive_emojis'), None)
        self.assertIsNotNone(emoji_warning)
    
    def test_compliance_summary(self):
        """Test compliance summary generation"""
        summary = self.compliance.get_compliance_summary()
        
        self.assertIn('manual_send_required', summary)
        self.assertIn('ai_disclosure_required', summary)
        self.assertIn('platform', summary)
        self.assertIn('compliance_version', summary)
        self.assertEqual(summary['platform'], 'OnlyFans')
    
    def test_format_message_for_manual_send(self):
        """Test formatting message for manual sending"""
        message = "Test message"
        validation_result = self.compliance.validate_message_generation("test_fan", message)
        
        formatted = self.compliance.format_message_for_manual_send(message, validation_result)
        
        self.assertIn("COMPLIANCE-CHECKED MESSAGE", formatted)
        self.assertIn(message, formatted)
        self.assertIn("REQUIREMENTS:", formatted)
        self.assertIn("Compliance Status:", formatted)
    
    def test_critical_vs_non_critical_warnings(self):
        """Test different warning severity levels"""
        # Regular message should be compliant
        normal_message = "Hello! How are you today?"
        result = self.compliance.validate_message_generation("test_fan", normal_message)
        self.assertTrue(result['compliant'])
        
        # Message with warnings but no critical issues should still be compliant
        warning_message = "Hello!!!"  # Some urgency but not critical
        result = self.compliance.validate_message_generation("test_fan", warning_message)
        
        # Check that compliance status is based on critical warnings only
        critical_warnings = [w for w in result['warnings'] if w.get('severity') == 'critical']
        expected_compliance = len(critical_warnings) == 0
        self.assertEqual(result['compliant'], expected_compliance)

if __name__ == '__main__':
    unittest.main()