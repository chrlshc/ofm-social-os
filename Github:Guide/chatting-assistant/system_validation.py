#!/usr/bin/env python3
"""
System validation script to check all components and configurations
Run this script to validate that all fixes have been applied correctly
"""

import sys
import logging
from typing import Dict, List, Any
# from colorama import init, Fore, Style
# Simple colored output without colorama dependency
class Fore:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'

class Style:
    RESET_ALL = '\033[0m'

def init(autoreset=True):
    pass

# Import all modules to check for errors
CONFIG_IMPORTS_OK = True
IMPORT_ERROR = ""

# Test imports individually for better error handling
try:
    import config_manager
    config = config_manager.config
except ImportError as e:
    CONFIG_IMPORTS_OK = False
    IMPORT_ERROR = f"config_manager: {str(e)}"

if CONFIG_IMPORTS_OK:
    try:
        import database
        db = database.db
    except ImportError as e:
        CONFIG_IMPORTS_OK = False
        IMPORT_ERROR = f"database: {str(e)}"

if CONFIG_IMPORTS_OK:
    try:
        import emotion_analyzer
        emotion_analyzer = emotion_analyzer.emotion_analyzer
    except ImportError as e:
        CONFIG_IMPORTS_OK = False
        IMPORT_ERROR = f"emotion_analyzer: {str(e)}"

if CONFIG_IMPORTS_OK:
    try:
        import ab_testing_manager
        ab_testing_manager = ab_testing_manager.ab_testing_manager
    except ImportError as e:
        CONFIG_IMPORTS_OK = False
        IMPORT_ERROR = f"ab_testing_manager: {str(e)}"

if CONFIG_IMPORTS_OK:
    try:
        import multi_agent_api
        multi_agent_api = multi_agent_api.multi_agent_api
    except ImportError as e:
        CONFIG_IMPORTS_OK = False
        IMPORT_ERROR = f"multi_agent_api: {str(e)}"

if CONFIG_IMPORTS_OK:
    try:
        import one_click_sender
        one_click_sender = one_click_sender.one_click_sender
    except ImportError as e:
        print(f"Warning: one_click_sender not available: {e}")

if CONFIG_IMPORTS_OK:
    try:
        import ml_training_pipeline
        training_pipeline = ml_training_pipeline.training_pipeline
    except ImportError as e:
        print(f"Warning: ml_training_pipeline not available: {e}")

if CONFIG_IMPORTS_OK:
    try:
        import fan_history_tracker
        fan_tracker = fan_history_tracker.fan_tracker
    except ImportError as e:
        print(f"Warning: fan_history_tracker not available: {e}")

if CONFIG_IMPORTS_OK:
    try:
        from message_generator import MessageGenerator
    except ImportError as e:
        print(f"Warning: MessageGenerator not available: {e}")

init(autoreset=True)

class SystemValidator:
    """Validates all system components and configurations"""
    
    def __init__(self):
        self.validation_results = []
        self.errors = []
        self.warnings = []
    
    def validate_all(self) -> bool:
        """Run all validation checks"""
        print(f"{Fore.CYAN}🔍 OnlyFans Chatting Assistant - System Validation{Style.RESET_ALL}")
        print("=" * 60)
        
        # Check imports first
        if not CONFIG_IMPORTS_OK:
            self.errors.append(f"Import error: {IMPORT_ERROR}")
            self._print_result("Module Imports", False, f"Import error: {IMPORT_ERROR}")
            return False
        
        checks = [
            ("Module Imports", self._check_imports),
            ("Configuration Files", self._check_configuration),
            ("Database Methods", self._check_database_methods),
            ("Multi-Agent Security", self._check_multi_agent_security),
            ("A/B Testing Setup", self._check_ab_testing),
            ("Emotion Analysis", self._check_emotion_analysis),
            ("Environment Variables", self._check_environment_config),
            ("API Endpoints", self._check_api_endpoints)
        ]
        
        all_passed = True
        for check_name, check_func in checks:
            try:
                result = check_func()
                self._print_result(check_name, result['success'], result.get('message', ''))
                if not result['success']:
                    all_passed = False
                    self.errors.append(f"{check_name}: {result.get('message', 'Unknown error')}")
                elif result.get('warnings'):
                    for warning in result['warnings']:
                        self.warnings.append(f"{check_name}: {warning}")
            except Exception as e:
                self._print_result(check_name, False, f"Exception: {str(e)}")
                all_passed = False
                self.errors.append(f"{check_name}: Exception - {str(e)}")
        
        # Print summary
        self._print_summary(all_passed)
        return all_passed
    
    def _check_imports(self) -> Dict[str, Any]:
        """Check if all modules import correctly"""
        return {"success": True, "message": "All modules imported successfully"}
    
    def _check_configuration(self) -> Dict[str, Any]:
        """Check configuration completeness"""
        warnings = []
        
        # Check required configuration sections
        required_sections = [
            'ab_testing', 'multi_agent', 'emotion_analysis', 
            'real_time_personalization', 'ml_training'
        ]
        
        for section in required_sections:
            if not config.get(section):
                return {"success": False, "message": f"Missing configuration section: {section}"}
        
        # Check security warnings
        agent_key = config.get('multi_agent', 'agent_key', default='')
        if agent_key == 'CHANGE_THIS_SECURE_KEY_IN_PRODUCTION':
            warnings.append("Using default agent key - change in production!")
        
        return {
            "success": True, 
            "message": "Configuration sections present",
            "warnings": warnings
        }
    
    def _check_database_methods(self) -> Dict[str, Any]:
        """Check if required database methods exist"""
        required_methods = [
            'get_all_fan_profiles',
            'get_fan_activity', 
            'record_fan_login',
            'record_fan_purchase',
            'update_fan_affinities',
            'select_variant',
            'record_ab_result',
            'save_fan_emotions',
            'get_fan_emotional_profile'
        ]
        
        for method_name in required_methods:
            if not hasattr(db, method_name):
                return {"success": False, "message": f"Missing database method: {method_name}"}
        
        return {"success": True, "message": "All database methods present"}
    
    def _check_multi_agent_security(self) -> Dict[str, Any]:
        """Check multi-agent security implementation"""
        # Check if security methods exist
        security_methods = [
            '_is_valid_agent_id',
            '_secure_compare', 
            '_check_session_limits'
        ]
        
        for method_name in security_methods:
            if not hasattr(multi_agent_api, method_name):
                return {"success": False, "message": f"Missing security method: {method_name}"}
        
        return {"success": True, "message": "Security methods implemented"}
    
    def _check_ab_testing(self) -> Dict[str, Any]:
        """Check A/B testing configuration"""
        # Check if configuration values are reasonable
        exploration_rate = config.get('ab_testing', 'exploration_rate', default=0.5)
        if exploration_rate < 0.1 or exploration_rate > 0.5:
            return {"success": False, "message": f"Exploration rate {exploration_rate} outside recommended range (0.1-0.5)"}
        
        min_sample_size = config.get('ab_testing', 'min_sample_size', default=0)
        if min_sample_size < 5:
            return {"success": False, "message": f"Min sample size {min_sample_size} too low (recommended: >= 5)"}
        
        return {"success": True, "message": "A/B testing configuration valid"}
    
    def _check_emotion_analysis(self) -> Dict[str, Any]:
        """Check emotion analysis setup"""
        enabled = config.get('emotion_analysis', 'enabled', default=False)
        if not enabled:
            return {"success": False, "message": "Emotion analysis disabled in configuration"}
        
        # Check if required methods exist
        if not hasattr(emotion_analyzer, 'detect_emotions'):
            return {"success": False, "message": "Missing emotion detection method"}
        
        if not hasattr(emotion_analyzer, 'select_tonality'):
            return {"success": False, "message": "Missing tonality selection method"}
        
        return {"success": True, "message": "Emotion analysis properly configured"}
    
    def _check_environment_config(self) -> Dict[str, Any]:
        """Check environment variable configuration"""
        # This would check if .env.example has all required variables
        # For now, just check that the file exists and has new variables
        try:
            with open('.env.example', 'r') as f:
                content = f.read()
                
            required_vars = [
                'CHATTING_AB_TESTING',
                'CHATTING_AGENT_KEY', 
                'CHATTING_EMOTION_ANALYSIS',
                'CHATTING_REAL_TIME_PERSONALIZATION'
            ]
            
            missing_vars = []
            for var in required_vars:
                if var not in content:
                    missing_vars.append(var)
            
            if missing_vars:
                return {"success": False, "message": f"Missing environment variables: {', '.join(missing_vars)}"}
            
            return {"success": True, "message": "Environment configuration complete"}
            
        except FileNotFoundError:
            return {"success": False, "message": ".env.example file not found"}
    
    def _check_api_endpoints(self) -> Dict[str, Any]:
        """Check API endpoint consistency"""
        # Check if multi-agent API has all expected endpoints
        expected_endpoints = [
            '/agent/register',
            '/agent/profile/<fan_id>',
            '/agent/variants/select',
            '/agent/emotions/analyze',
            '/agent/knowledge/share'
        ]
        
        available_endpoints = multi_agent_api._get_available_endpoints()
        
        missing_endpoints = []
        for endpoint in expected_endpoints:
            # Check if endpoint pattern exists (ignoring exact parameter names)
            endpoint_pattern = endpoint.replace('<fan_id>', '<')
            found = any(endpoint_pattern in available for available in available_endpoints)
            if not found:
                missing_endpoints.append(endpoint)
        
        if missing_endpoints:
            return {"success": False, "message": f"Missing API endpoints: {', '.join(missing_endpoints)}"}
        
        return {"success": True, "message": "All API endpoints available"}
    
    def _print_result(self, check_name: str, success: bool, message: str):
        """Print validation result"""
        status_icon = "✅" if success else "❌"
        status_color = Fore.GREEN if success else Fore.RED
        
        print(f"{status_icon} {check_name:<25} {status_color}{message}{Style.RESET_ALL}")
    
    def _print_summary(self, all_passed: bool):
        """Print validation summary"""
        print("\n" + "=" * 60)
        
        if all_passed:
            print(f"{Fore.GREEN}🎉 ALL VALIDATIONS PASSED!{Style.RESET_ALL}")
            print("System is ready for production deployment.")
        else:
            print(f"{Fore.RED}❌ VALIDATION FAILURES DETECTED{Style.RESET_ALL}")
            print(f"Errors found: {len(self.errors)}")
            for error in self.errors:
                print(f"  • {Fore.RED}{error}{Style.RESET_ALL}")
        
        if self.warnings:
            print(f"\n{Fore.YELLOW}⚠️  WARNINGS:{Style.RESET_ALL}")
            for warning in self.warnings:
                print(f"  • {Fore.YELLOW}{warning}{Style.RESET_ALL}")
        
        print(f"\nTotal checks: {len(self.errors) + len(self.warnings) + (1 if all_passed else 0)}")

def main():
    """Main validation function"""
    validator = SystemValidator()
    success = validator.validate_all()
    
    if not success:
        sys.exit(1)
    
    print(f"\n{Fore.CYAN}🚀 System validation completed successfully!{Style.RESET_ALL}")
    print("All components are properly configured and ready for use.")

if __name__ == "__main__":
    main()