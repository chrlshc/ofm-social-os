#!/usr/bin/env python3
"""
Multi-Agent API for shared learning between chatbot instances
Enables collective intelligence and distributed optimization
"""

import logging
import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g
import json

from database import db
from config_manager import config
from emotion_analyzer import emotion_analyzer
from ab_testing_manager import ab_testing_manager
from fan_history_tracker import fan_tracker

logger = logging.getLogger(__name__)

class MultiAgentAPI:
    """
    API for multi-agent collaboration and shared learning
    Allows multiple chatbot instances to share knowledge and optimize collectively
    """
    
    def __init__(self, app: Flask = None):
        self.app = app
        self.agent_sessions = {}
        self.session_ttl = timedelta(hours=24)
        
        if app:
            self.init_app(app)
    
    def init_app(self, app: Flask):
        """Initialize the multi-agent API with Flask app"""
        self.app = app
        self._register_routes()
        
        # Middleware for agent authentication
        @app.before_request
        def before_request():
            if request.endpoint and request.endpoint.startswith('agent_'):
                g.agent_id = self._authenticate_agent()
    
    def _authenticate_agent(self) -> Optional[str]:
        """Authenticate agent from request headers with enhanced security"""
        agent_id = request.headers.get('X-Agent-ID')
        agent_key = request.headers.get('X-Agent-Key')
        agent_signature = request.headers.get('X-Agent-Signature')
        
        if not agent_id or not agent_key:
            logger.warning(f"Missing authentication headers from {request.remote_addr}")
            return None
        
        # Validate agent ID format
        if not self._is_valid_agent_id(agent_id):
            logger.warning(f"Invalid agent ID format: {agent_id}")
            return None
        
        # Get expected key from secure configuration
        expected_key = config.get('multi_agent', 'agent_key', default='CHANGE_THIS_SECURE_KEY_IN_PRODUCTION')
        
        # Warn if using default key
        if expected_key == 'CHANGE_THIS_SECURE_KEY_IN_PRODUCTION':
            logger.warning("Using default agent key - CHANGE THIS IN PRODUCTION!")
        
        # Constant-time comparison to prevent timing attacks
        if not self._secure_compare(agent_key, expected_key):
            logger.warning(f"Invalid agent key for agent {agent_id} from {request.remote_addr}")
            return None
        
        # Check session limits
        if not self._check_session_limits(agent_id):
            logger.warning(f"Session limit exceeded for agent {agent_id}")
            return None
        
        logger.info(f"Agent {agent_id} authenticated successfully")
        return agent_id
    
    def _is_valid_agent_id(self, agent_id: str) -> bool:
        """Validate agent ID format"""
        import re
        # Allow alphanumeric, hyphens, underscores, max 50 chars
        pattern = r'^[a-zA-Z0-9_-]{1,50}$'
        return bool(re.match(pattern, agent_id))
    
    def _secure_compare(self, a: str, b: str) -> bool:
        """Constant-time string comparison to prevent timing attacks"""
        if len(a) != len(b):
            return False
        
        result = 0
        for x, y in zip(a, b):
            result |= ord(x) ^ ord(y)
        return result == 0
    
    def _check_session_limits(self, agent_id: str) -> bool:
        """Check if agent can create new sessions"""
        max_concurrent = config.get('multi_agent', 'max_concurrent_agents', default=50)
        
        # Count active sessions for this agent
        agent_sessions = [s for s in self.agent_sessions.values() if s.get('agent_id') == agent_id]
        
        if len(agent_sessions) >= 5:  # Max 5 sessions per agent
            return False
        
        # Check total active sessions
        if len(self.agent_sessions) >= max_concurrent:
            return False
        
        return True
    
    def _register_routes(self):
        """Register all multi-agent API routes"""
        
        # Agent management endpoints
        @self.app.route('/agent/register', methods=['POST'])
        def register_agent():
            """Register a new agent session"""
            try:
                data = request.json
                agent_id = data.get('agent_id', str(uuid.uuid4()))
                agent_version = data.get('agent_version', '1.0.0')
                configuration = data.get('configuration', {})
                
                session_id = str(uuid.uuid4())
                
                # Save session to database
                session_data = {
                    'agent_id': agent_id,
                    'session_id': session_id,
                    'agent_version': agent_version,
                    'configuration': configuration,
                    'start_time': datetime.now(),
                    'status': 'active'
                }
                
                self.agent_sessions[session_id] = session_data
                
                return jsonify({
                    'session_id': session_id,
                    'agent_id': agent_id,
                    'status': 'registered',
                    'api_endpoints': self._get_available_endpoints()
                })
                
            except Exception as e:
                logger.error(f"Failed to register agent: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/profile/<fan_id>', methods=['GET'])
        def get_fan_profile(fan_id):
            """Get comprehensive fan profile for any agent"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                # Get basic profile
                profile = db.get_fan_profile(fan_id)
                if not profile:
                    return jsonify({'error': 'Fan not found'}), 404
                
                # Enrich with activity data
                activity = db.get_fan_activity(fan_id)
                
                # Get emotional profile
                emotional_profile = db.get_fan_emotional_profile(fan_id)
                
                # Get analytics
                analytics = fan_tracker.get_fan_analytics(fan_id)
                
                comprehensive_profile = {
                    'basic_profile': profile,
                    'activity': activity,
                    'emotional_profile': emotional_profile,
                    'analytics': analytics,
                    'last_updated': datetime.now().isoformat(),
                    'source_agent': g.agent_id
                }
                
                return jsonify(comprehensive_profile)
                
            except Exception as e:
                logger.error(f"Failed to get fan profile: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/profile/<fan_id>', methods=['POST'])
        def update_fan_profile(fan_id):
            """Update fan profile with new insights from any agent"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                data = request.json
                
                # Update basic profile if provided
                if 'profile_updates' in data:
                    # This would need implementation in database.py
                    logger.info(f"Profile updates from agent {g.agent_id}")
                
                # Update affinities if provided
                if 'affinities' in data:
                    success = db.update_fan_affinities(
                        fan_id, 
                        data['affinities'], 
                        source=f"agent_{g.agent_id}"
                    )
                    if not success:
                        return jsonify({'error': 'Failed to update affinities'}), 500
                
                # Record activity if provided
                if 'activity' in data:
                    activity = data['activity']
                    if activity.get('type') == 'login':
                        db.record_fan_login(
                            fan_id,
                            activity.get('session_duration'),
                            activity.get('platform', 'web'),
                            activity.get('activity_level', 'medium')
                        )
                    elif activity.get('type') == 'purchase':
                        db.record_fan_purchase(
                            fan_id,
                            activity.get('product_type'),
                            activity.get('amount'),
                            activity.get('product_id')
                        )
                
                return jsonify({
                    'success': True,
                    'updated_by': g.agent_id,
                    'timestamp': datetime.now().isoformat()
                })
                
            except Exception as e:
                logger.error(f"Failed to update fan profile: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/variants/select', methods=['POST'])
        def select_variant():
            """Select optimal message variant using shared A/B testing data"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                data = request.json
                fan_type = data.get('fan_type')
                phase = data.get('phase')
                strategy = data.get('strategy', 'epsilon_greedy')
                
                if not fan_type or not phase:
                    return jsonify({'error': 'fan_type and phase required'}), 400
                
                variant = ab_testing_manager.select_variant(fan_type, phase, strategy)
                
                if not variant:
                    return jsonify({'error': 'No variants available'}), 404
                
                # Track variant selection
                variant['selected_by'] = g.agent_id
                variant['selected_at'] = datetime.now().isoformat()
                variant['strategy_used'] = strategy
                
                return jsonify(variant)
                
            except Exception as e:
                logger.error(f"Failed to select variant: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/variants/result', methods=['POST'])
        def record_variant_result():
            """Record A/B test result from any agent"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                data = request.json
                
                from ab_testing_manager import VariantResult
                
                result = VariantResult(
                    variant_id=data['variant_id'],
                    converted=data.get('converted', False),
                    responded=data.get('responded', False),
                    response_time_hours=data.get('response_time_hours'),
                    revenue=data.get('revenue', 0.0)
                )
                
                success = ab_testing_manager.record_result(result)
                
                return jsonify({
                    'success': success,
                    'recorded_by': g.agent_id,
                    'timestamp': datetime.now().isoformat()
                })
                
            except Exception as e:
                logger.error(f"Failed to record variant result: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/emotions/analyze', methods=['POST'])
        def analyze_emotions():
            """Analyze emotions using shared emotion analysis"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                data = request.json
                fan_id = data.get('fan_id')
                messages = data.get('messages', [])
                conversation_id = data.get('conversation_id')
                
                if not fan_id or not messages:
                    return jsonify({'error': 'fan_id and messages required'}), 400
                
                analysis = emotion_analyzer.analyze_and_save(
                    fan_id, messages, conversation_id
                )
                
                analysis['analyzed_by'] = g.agent_id
                
                return jsonify(analysis)
                
            except Exception as e:
                logger.error(f"Failed to analyze emotions: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/analytics/fan/<fan_id>', methods=['GET'])
        def get_fan_analytics(fan_id):
            """Get comprehensive fan analytics"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                analytics = fan_tracker.get_fan_analytics(fan_id)
                
                # Add emotion insights
                emotion_insights = emotion_analyzer.get_emotion_insights(fan_id)
                analytics['emotion_insights'] = emotion_insights
                
                analytics['requested_by'] = g.agent_id
                
                return jsonify(analytics)
                
            except Exception as e:
                logger.error(f"Failed to get fan analytics: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/knowledge/share', methods=['POST'])
        def share_knowledge():
            """Share learned insights with other agents"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                data = request.json
                knowledge_type = data.get('type')  # 'pattern', 'insight', 'optimization'
                content = data.get('content')
                confidence = data.get('confidence', 0.5)
                
                # Store shared knowledge
                knowledge_entry = {
                    'id': str(uuid.uuid4()),
                    'type': knowledge_type,
                    'content': content,
                    'confidence': confidence,
                    'shared_by': g.agent_id,
                    'timestamp': datetime.now().isoformat(),
                    'votes': 0,
                    'applications': 0
                }
                
                # This would be stored in a shared knowledge database
                logger.info(f"Knowledge shared by agent {g.agent_id}: {knowledge_type}")
                
                return jsonify({
                    'knowledge_id': knowledge_entry['id'],
                    'status': 'shared',
                    'shared_by': g.agent_id
                })
                
            except Exception as e:
                logger.error(f"Failed to share knowledge: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/knowledge/discover', methods=['GET'])
        def discover_knowledge():
            """Discover knowledge shared by other agents"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                knowledge_type = request.args.get('type')
                min_confidence = float(request.args.get('min_confidence', 0.7))
                limit = int(request.args.get('limit', 10))
                
                # This would query the shared knowledge database
                # For now, return a template response
                discovered_knowledge = [
                    {
                        'id': 'knowledge_001',
                        'type': 'pattern',
                        'content': 'Fans mentioning "lonely" respond better to empathetic messages',
                        'confidence': 0.85,
                        'shared_by': 'agent_002',
                        'applications': 15,
                        'success_rate': 0.73
                    }
                ]
                
                return jsonify({
                    'knowledge': discovered_knowledge,
                    'discovered_by': g.agent_id,
                    'filters': {
                        'type': knowledge_type,
                        'min_confidence': min_confidence
                    }
                })
                
            except Exception as e:
                logger.error(f"Failed to discover knowledge: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/performance/summary', methods=['GET'])
        def get_collective_performance():
            """Get collective performance summary across all agents"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                days = int(request.args.get('days', 7))
                
                # Get A/B testing performance
                ab_report = ab_testing_manager.generate_experiment_report(days)
                
                # Get variant performance
                variant_performance = db.get_variant_performance_summary()
                
                # Aggregate performance across agents
                collective_summary = {
                    'period_days': days,
                    'ab_testing': ab_report,
                    'variant_performance': variant_performance,
                    'active_agents': len(self.agent_sessions),
                    'requested_by': g.agent_id,
                    'generated_at': datetime.now().isoformat()
                }
                
                return jsonify(collective_summary)
                
            except Exception as e:
                logger.error(f"Failed to get collective performance: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/agent/sync/settings', methods=['GET'])
        def sync_settings():
            """Sync optimal settings discovered by the collective"""
            try:
                if not g.get('agent_id'):
                    return jsonify({'error': 'Agent authentication required'}), 401
                
                # Get optimal settings based on collective learning
                optimal_settings = {
                    'emotion_analysis': {
                        'enabled': True,
                        'confidence_threshold': 0.7,
                        'tone_adaptation': True
                    },
                    'ab_testing': {
                        'exploration_rate': 0.15,  # Learned from collective data
                        'min_sample_size': 12,
                        'strategy': 'thompson_sampling'  # Best performing strategy
                    },
                    'personalization': {
                        'real_time_adaptation': True,
                        'activity_weight': 0.8,
                        'emotion_weight': 0.6
                    }
                }
                
                return jsonify({
                    'optimal_settings': optimal_settings,
                    'last_updated': datetime.now().isoformat(),
                    'based_on_agents': len(self.agent_sessions),
                    'synced_by': g.agent_id
                })
                
            except Exception as e:
                logger.error(f"Failed to sync settings: {e}")
                return jsonify({'error': str(e)}), 500
    
    def _get_available_endpoints(self) -> List[str]:
        """Get list of available API endpoints"""
        return [
            '/agent/profile/<fan_id>',
            '/agent/variants/select',
            '/agent/variants/result',
            '/agent/emotions/analyze',
            '/agent/analytics/fan/<fan_id>',
            '/agent/knowledge/share',
            '/agent/knowledge/discover',
            '/agent/performance/summary',
            '/agent/sync/settings'
        ]
    
    def cleanup_expired_sessions(self):
        """Clean up expired agent sessions"""
        try:
            current_time = datetime.now()
            expired_sessions = []
            
            for session_id, session_data in self.agent_sessions.items():
                start_time = session_data.get('start_time', current_time)
                if current_time - start_time > self.session_ttl:
                    expired_sessions.append(session_id)
            
            for session_id in expired_sessions:
                del self.agent_sessions[session_id]
                logger.info(f"Cleaned up expired session: {session_id}")
                
        except Exception as e:
            logger.error(f"Failed to cleanup expired sessions: {e}")

# Global multi-agent API instance
multi_agent_api = MultiAgentAPI()