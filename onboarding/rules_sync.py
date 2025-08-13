"""
Business rules synchronization service

Provides Redis pub/sub mechanism to synchronize business rules
across multiple worker instances in a distributed environment.
"""

import json
import logging
import threading
from typing import Dict, Any, Callable, Optional
from datetime import datetime
import redis
from redis.client import PubSub

logger = logging.getLogger(__name__)


class RulesSyncService:
    """
    Service for synchronizing business rules across distributed workers
    
    Uses Redis pub/sub to broadcast rule updates and ensure all
    instances have the latest configuration without restart.
    """
    
    CHANNEL_PREFIX = "ofm:rules:sync:"
    CHANNELS = {
        "update": "ofm:rules:sync:update",
        "refresh": "ofm:rules:sync:refresh",
        "rollback": "ofm:rules:sync:rollback"
    }
    
    def __init__(self, redis_client: redis.Redis, rules_engine=None):
        """
        Initialize sync service
        
        Args:
            redis_client: Redis connection
            rules_engine: BusinessRulesEngine instance to sync
        """
        self.redis = redis_client
        self.rules_engine = rules_engine
        self.pubsub: Optional[PubSub] = None
        self.listener_thread: Optional[threading.Thread] = None
        self.is_running = False
        self.callbacks: Dict[str, Callable] = {}
        
        # Register default callbacks
        self._register_default_callbacks()
    
    def _register_default_callbacks(self):
        """Register default message handlers"""
        self.callbacks["update"] = self._handle_rules_update
        self.callbacks["refresh"] = self._handle_rules_refresh
        self.callbacks["rollback"] = self._handle_rules_rollback
    
    def start(self):
        """Start listening for sync messages"""
        if self.is_running:
            logger.warning("Rules sync service already running")
            return
        
        try:
            # Create pubsub instance
            self.pubsub = self.redis.pubsub()
            
            # Subscribe to channels
            for channel in self.CHANNELS.values():
                self.pubsub.subscribe(channel)
            
            # Start listener thread
            self.is_running = True
            self.listener_thread = threading.Thread(
                target=self._listen_for_messages,
                daemon=True
            )
            self.listener_thread.start()
            
            logger.info("Rules sync service started")
            
        except Exception as e:
            logger.error(f"Failed to start rules sync service: {str(e)}")
            self.is_running = False
    
    def stop(self):
        """Stop listening for sync messages"""
        if not self.is_running:
            return
        
        self.is_running = False
        
        if self.pubsub:
            self.pubsub.unsubscribe()
            self.pubsub.close()
        
        if self.listener_thread and self.listener_thread.is_alive():
            self.listener_thread.join(timeout=5)
        
        logger.info("Rules sync service stopped")
    
    def _listen_for_messages(self):
        """Listen for messages in background thread"""
        try:
            for message in self.pubsub.listen():
                if not self.is_running:
                    break
                
                # Skip subscription confirmations
                if message['type'] not in ['message', 'pmessage']:
                    continue
                
                self._process_message(message)
                
        except Exception as e:
            logger.error(f"Error in rules sync listener: {str(e)}")
            self.is_running = False
    
    def _process_message(self, message: dict):
        """Process incoming sync message"""
        try:
            channel = message['channel'].decode() if isinstance(message['channel'], bytes) else message['channel']
            data = message['data']
            
            # Parse JSON data
            if isinstance(data, bytes):
                data = data.decode()
            
            payload = json.loads(data)
            
            # Determine message type
            message_type = None
            for msg_type, chan in self.CHANNELS.items():
                if channel == chan:
                    message_type = msg_type
                    break
            
            if message_type and message_type in self.callbacks:
                self.callbacks[message_type](payload)
            else:
                logger.warning(f"Unknown message type for channel {channel}")
                
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in sync message: {data}")
        except Exception as e:
            logger.error(f"Error processing sync message: {str(e)}")
    
    def _handle_rules_update(self, payload: dict):
        """Handle rules update notification"""
        try:
            rule_type = payload.get('rule_type')
            version = payload.get('version')
            timestamp = payload.get('timestamp')
            initiator = payload.get('initiator')
            
            logger.info(f"Received rules update: type={rule_type}, version={version}, from={initiator}")
            
            if self.rules_engine:
                # Refresh specific rule type from database
                self.rules_engine.refresh_rules(rule_type)
                logger.info(f"Refreshed {rule_type} rules to version {version}")
            
        except Exception as e:
            logger.error(f"Error handling rules update: {str(e)}")
    
    def _handle_rules_refresh(self, payload: dict):
        """Handle full rules refresh request"""
        try:
            initiator = payload.get('initiator')
            reason = payload.get('reason', 'manual')
            
            logger.info(f"Received rules refresh request from {initiator}: {reason}")
            
            if self.rules_engine:
                # Reload all rules from database
                self.rules_engine._load_all_rules()
                logger.info("Completed full rules refresh")
            
        except Exception as e:
            logger.error(f"Error handling rules refresh: {str(e)}")
    
    def _handle_rules_rollback(self, payload: dict):
        """Handle rules rollback notification"""
        try:
            rule_type = payload.get('rule_type')
            target_version = payload.get('target_version')
            initiator = payload.get('initiator')
            
            logger.info(f"Received rollback request: type={rule_type}, target={target_version}, from={initiator}")
            
            if self.rules_engine:
                # Load specific version from backup
                success = self.rules_engine.rollback_to_version(rule_type, target_version)
                if success:
                    logger.info(f"Rolled back {rule_type} to version {target_version}")
                else:
                    logger.error(f"Failed to rollback {rule_type} to version {target_version}")
            
        except Exception as e:
            logger.error(f"Error handling rules rollback: {str(e)}")
    
    def broadcast_update(self, rule_type: str, version: str, initiator: str = "system"):
        """
        Broadcast rules update notification to all workers
        
        Args:
            rule_type: Type of rules updated
            version: New version number
            initiator: Who initiated the update
        """
        try:
            payload = {
                "rule_type": rule_type,
                "version": version,
                "timestamp": datetime.utcnow().isoformat(),
                "initiator": initiator
            }
            
            self.redis.publish(
                self.CHANNELS["update"],
                json.dumps(payload)
            )
            
            logger.info(f"Broadcasted rules update: {rule_type} v{version}")
            
        except Exception as e:
            logger.error(f"Failed to broadcast rules update: {str(e)}")
    
    def request_refresh(self, reason: str = "manual", initiator: str = "system"):
        """
        Request all workers to refresh their rules
        
        Args:
            reason: Reason for refresh
            initiator: Who initiated the refresh
        """
        try:
            payload = {
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat(),
                "initiator": initiator
            }
            
            self.redis.publish(
                self.CHANNELS["refresh"],
                json.dumps(payload)
            )
            
            logger.info(f"Requested rules refresh: {reason}")
            
        except Exception as e:
            logger.error(f"Failed to request rules refresh: {str(e)}")
    
    def broadcast_rollback(self, rule_type: str, target_version: str, initiator: str = "system"):
        """
        Broadcast rollback notification to all workers
        
        Args:
            rule_type: Type of rules to rollback
            target_version: Version to rollback to
            initiator: Who initiated the rollback
        """
        try:
            payload = {
                "rule_type": rule_type,
                "target_version": target_version,
                "timestamp": datetime.utcnow().isoformat(),
                "initiator": initiator
            }
            
            self.redis.publish(
                self.CHANNELS["rollback"],
                json.dumps(payload)
            )
            
            logger.info(f"Broadcasted rollback: {rule_type} to v{target_version}")
            
        except Exception as e:
            logger.error(f"Failed to broadcast rollback: {str(e)}")
    
    def register_callback(self, message_type: str, callback: Callable):
        """
        Register custom callback for message type
        
        Args:
            message_type: Type of message (update, refresh, rollback)
            callback: Function to call with payload
        """
        self.callbacks[message_type] = callback
        logger.info(f"Registered callback for {message_type} messages")
    
    def get_sync_status(self) -> dict:
        """Get current sync service status"""
        return {
            "is_running": self.is_running,
            "subscribed_channels": list(self.CHANNELS.values()),
            "has_rules_engine": self.rules_engine is not None,
            "listener_alive": self.listener_thread.is_alive() if self.listener_thread else False
        }


# Integration with BusinessRulesEngine
def enhance_rules_engine_with_sync(rules_engine, redis_client: redis.Redis):
    """
    Add synchronization capabilities to existing rules engine
    
    Args:
        rules_engine: BusinessRulesEngine instance
        redis_client: Redis connection
    """
    # Create sync service
    sync_service = RulesSyncService(redis_client, rules_engine)
    
    # Add refresh method to rules engine
    def refresh_rules(rule_type: str = None):
        """Refresh rules from database"""
        if rule_type:
            # Refresh specific rule type
            if rule_type == "commission":
                rules_engine._load_commission_rules(rules_engine.db_session_factory())
            elif rule_type == "marketing":
                rules_engine._load_marketing_strategies(rules_engine.db_session_factory())
            elif rule_type == "feature_flags":
                rules_engine._load_feature_flags(rules_engine.db_session_factory())
        else:
            # Refresh all rules
            rules_engine._load_all_rules()
    
    # Monkey patch the refresh method
    rules_engine.refresh_rules = refresh_rules
    
    # Override update_rules to broadcast changes
    original_update_rules = rules_engine.update_rules
    
    def update_rules_with_sync(rule_type, rules_data, admin_user_id):
        # Call original method
        success = original_update_rules(rule_type, rules_data, admin_user_id)
        
        if success:
            # Broadcast update to other workers
            sync_service.broadcast_update(
                rule_type.value,
                rules_engine.get_rules_version(),
                f"admin:{admin_user_id}"
            )
        
        return success
    
    rules_engine.update_rules = update_rules_with_sync
    
    # Store sync service reference
    rules_engine._sync_service = sync_service
    
    # Start sync service
    sync_service.start()
    
    logger.info("Enhanced rules engine with synchronization capabilities")
    
    return sync_service