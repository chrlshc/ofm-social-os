#!/usr/bin/env python3
import json
import os
from typing import Dict, Any, Optional
from pathlib import Path
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

class ConfigManager:
    _instance = None
    _config = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._config is None:
            self._config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from config.json and environment variables"""
        config_path = Path(__file__).parent / "config.json"
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except FileNotFoundError:
            logger.error(f"Configuration file not found: {config_path}")
            config = self._get_default_config()
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in config file: {e}")
            config = self._get_default_config()
        
        # Override with environment variables
        config = self._apply_env_overrides(config)
        
        return config
    
    def _get_default_config(self) -> Dict[str, Any]:
        """Default configuration fallback"""
        return {
            "account_settings": {
                "small_account": {"daily_fans": 50, "focus": "relationship_building"},
                "large_account": {"daily_fans": 200, "focus": "efficiency"}
            },
            "iras_phases": {
                "intrigue": {"duration_messages": [1, 2]},
                "rapport": {"duration_messages": [3, 5]},
                "attraction": {"duration_messages": [6, 10]},
                "submission": {"duration_messages": [11, None]}
            },
            "compliance_settings": {
                "manual_send_required": True,
                "ai_disclosure": False,
                "content_guidelines": {
                    "no_automated_sending": True,
                    "human_review_required": True
                }
            }
        }
    
    def _apply_env_overrides(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Apply environment variable overrides"""
        env_mappings = {
            'CHATTING_ACCOUNT_SIZE': ['account_size'],
            'CHATTING_MANUAL_SEND': ['compliance_settings', 'manual_send_required'],
            'CHATTING_LANGUAGE': ['language'],
            'DATABASE_URL': ['database', 'url'],
            'REDIS_URL': ['cache', 'redis_url'],
            'SPACY_MODEL': ['nlp', 'spacy_model']
        }
        
        for env_var, config_path in env_mappings.items():
            value = os.getenv(env_var)
            if value is not None:
                # Convert string boolean values
                if value.lower() in ('true', 'false'):
                    value = value.lower() == 'true'
                
                # Navigate to the config location
                current = config
                for key in config_path[:-1]:
                    if key not in current:
                        current[key] = {}
                    current = current[key]
                
                current[config_path[-1]] = value
        
        return config
    
    def get(self, *keys, default=None) -> Any:
        """Get configuration value using dot notation"""
        current = self._config
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return default
        return current
    
    def get_account_size(self) -> str:
        """Get account size from config or environment"""
        return os.getenv('CHATTING_ACCOUNT_SIZE', self.get('account_size', 'small'))
    
    def get_language(self) -> str:
        """Get language for NLP processing"""
        return os.getenv('CHATTING_LANGUAGE', self.get('language', 'en'))
    
    def get_spacy_model(self) -> str:
        """Get spaCy model based on language"""
        language = self.get_language()
        model_map = {
            'en': 'en_core_web_sm',
            'fr': 'fr_core_news_sm',
            'es': 'es_core_news_sm',
            'de': 'de_core_news_sm'
        }
        return os.getenv('SPACY_MODEL', model_map.get(language, 'en_core_web_sm'))
    
    def get_database_config(self) -> Optional[Dict[str, str]]:
        """Get database configuration"""
        db_url = os.getenv('DATABASE_URL')
        if db_url:
            return {'url': db_url}
        
        return self.get('database', default=None)
    
    def is_manual_send_required(self) -> bool:
        """Check if manual sending is required for compliance"""
        return self.get('compliance_settings', 'manual_send_required', default=True)
    
    def get_pricing_tier(self, spending_potential: str) -> Dict[str, Any]:
        """Get pricing configuration for spending potential"""
        return self.get('pricing_tiers', spending_potential, default=self.get('pricing_tiers', 'entry'))
    
    def get_phase_duration(self, phase: str) -> list:
        """Get message count range for IRAS phase"""
        return self.get('iras_phases', phase, 'duration_messages', default=[1, 5])
    
    def get_optimal_hours(self, day_type: str = 'weekday') -> list:
        """Get optimal messaging hours"""
        return self.get('message_timing', 'optimal_hours', day_type, default=['12:00', '19:00'])
    
    def get_emoji_set(self, personality_type: str, emotion_type: str = 'positive') -> list:
        """Get emoji set for personality type"""
        personality_key = personality_type.lower()
        return self.get('emoji_usage', personality_key, emotion_type, default=['😊', '💕'])
    
    def reload(self):
        """Reload configuration from file"""
        self._config = self._load_config()
        logger.info("Configuration reloaded")

# Global config instance
config = ConfigManager()