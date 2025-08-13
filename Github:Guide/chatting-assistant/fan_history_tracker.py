#!/usr/bin/env python3
"""
Comprehensive fan history tracking and analytics
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import statistics
import json

from database import db
from config_manager import config

logger = logging.getLogger(__name__)

class FanHistoryTracker:
    """Tracks comprehensive fan interaction history and behavioral patterns"""
    
    def __init__(self):
        self.cache = {}
        self.cache_ttl = timedelta(minutes=30)
    
    def track_interaction(self, fan_id: str, interaction_data: Dict) -> bool:
        """
        Track a new fan interaction
        
        interaction_data should include:
        - message_sent: str
        - message_received: str (optional)
        - phase: str
        - response_time_seconds: float (optional)
        - spending_amount: float (optional)
        - interaction_type: str (message, purchase, tip, etc.)
        """
        try:
            # Save to conversation history
            db.save_conversation(
                fan_id=fan_id,
                message_sent=interaction_data.get('message_sent'),
                message_received=interaction_data.get('message_received'),
                phase=interaction_data.get('phase')
            )
            
            # Update fan profile with latest interaction data
            self._update_fan_metrics(fan_id, interaction_data)
            
            # Invalidate cache for this fan
            if fan_id in self.cache:
                del self.cache[fan_id]
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to track interaction for fan {fan_id}: {e}")
            return False
    
    def get_fan_analytics(self, fan_id: str, use_cache: bool = True) -> Dict:
        """Get comprehensive analytics for a specific fan"""
        
        # Check cache first
        if use_cache and fan_id in self.cache:
            cached_data, timestamp = self.cache[fan_id]
            if datetime.now() - timestamp < self.cache_ttl:
                return cached_data
        
        try:
            analytics = self._calculate_fan_analytics(fan_id)
            
            # Cache the result
            self.cache[fan_id] = (analytics, datetime.now())
            
            return analytics
            
        except Exception as e:
            logger.error(f"Failed to get analytics for fan {fan_id}: {e}")
            return {}
    
    def _calculate_fan_analytics(self, fan_id: str) -> Dict:
        """Calculate comprehensive fan analytics"""
        
        # Get fan profile
        fan_profile = db.get_fan_profile(fan_id)
        
        # Get conversation history
        conversations = db.get_conversation_history(fan_id, limit=200)
        
        # Get compliance history
        compliance_history = db.get_compliance_history(fan_id, limit=100)
        
        if not conversations:
            return self._get_default_analytics(fan_id)
        
        # Calculate metrics
        analytics = {
            'fan_id': fan_id,
            'profile_summary': self._get_profile_summary(fan_profile),
            'engagement_metrics': self._calculate_engagement_metrics(conversations),
            'communication_patterns': self._analyze_communication_patterns(conversations),
            'spending_behavior': self._analyze_spending_behavior(conversations, fan_profile),
            'compliance_score': self._calculate_compliance_score(compliance_history),
            'recommendations': self._generate_recommendations(fan_id, conversations, fan_profile),
            'last_updated': datetime.now().isoformat()
        }
        
        return analytics
    
    def _get_profile_summary(self, fan_profile: Optional[Dict]) -> Dict:
        """Get summary of fan profile"""
        if not fan_profile:
            return {
                'personality_type': 'Unknown',
                'engagement_level': 'Unknown',
                'spending_potential': 'Unknown',
                'member_since': None,
                'last_analyzed': None
            }
        
        return {
            'personality_type': fan_profile.get('personality_type', 'Unknown'),
            'engagement_level': fan_profile.get('engagement_level', 'Unknown'),
            'spending_potential': fan_profile.get('spending_potential', 'Unknown'),
            'member_since': fan_profile.get('created_at'),
            'last_analyzed': fan_profile.get('last_analyzed'),
            'interests': fan_profile.get('interests', [])
        }
    
    def _calculate_engagement_metrics(self, conversations: List[Dict]) -> Dict:
        """Calculate engagement metrics from conversation history"""
        if not conversations:
            return {}
        
        # Sort by timestamp
        sorted_conversations = sorted(conversations, key=lambda x: x['timestamp'])
        
        # Calculate metrics
        total_messages = len(conversations)
        date_range = self._get_date_range(sorted_conversations)
        
        # Message frequency
        if date_range > 0:
            messages_per_day = total_messages / date_range
        else:
            messages_per_day = total_messages
        
        # Response patterns
        response_times = self._calculate_response_times(sorted_conversations)
        
        # Phase distribution
        phase_distribution = self._calculate_phase_distribution(conversations)
        
        # Recent activity
        recent_activity = self._calculate_recent_activity(sorted_conversations)
        
        return {
            'total_messages': total_messages,
            'date_range_days': date_range,
            'messages_per_day': round(messages_per_day, 2),
            'avg_response_time_hours': round(statistics.mean(response_times), 2) if response_times else None,
            'phase_distribution': phase_distribution,
            'recent_activity': recent_activity,
            'consistency_score': self._calculate_consistency_score(sorted_conversations)
        }
    
    def _analyze_communication_patterns(self, conversations: List[Dict]) -> Dict:
        """Analyze communication patterns and preferences"""
        
        # Time-based patterns
        hourly_activity = self._analyze_hourly_activity(conversations)
        daily_activity = self._analyze_daily_activity(conversations)
        
        # Message characteristics
        message_lengths = []
        emoji_usage = 0
        question_frequency = 0
        
        for conv in conversations:
            if conv.get('message_received'):
                msg = conv['message_received']
                message_lengths.append(len(msg))
                emoji_usage += sum(1 for char in msg if ord(char) > 127)
                if '?' in msg:
                    question_frequency += 1
        
        return {
            'preferred_hours': hourly_activity,
            'preferred_days': daily_activity,
            'avg_message_length': round(statistics.mean(message_lengths), 1) if message_lengths else 0,
            'emoji_usage_rate': round(emoji_usage / len(conversations), 2) if conversations else 0,
            'question_frequency': round(question_frequency / len(conversations), 2) if conversations else 0
        }
    
    def _analyze_spending_behavior(self, conversations: List[Dict], fan_profile: Optional[Dict]) -> Dict:
        """Analyze spending behavior and potential"""
        
        # Extract spending indicators from conversations
        spending_keywords = ['buy', 'purchase', 'tip', 'paid', 'money', 'price', '$']
        high_value_keywords = ['premium', 'exclusive', 'vip', 'custom']
        
        spending_mentions = 0
        high_value_interest = 0
        
        for conv in conversations:
            if conv.get('message_received'):
                msg = conv['message_received'].lower()
                spending_mentions += sum(1 for keyword in spending_keywords if keyword in msg)
                high_value_interest += sum(1 for keyword in high_value_keywords if keyword in msg)
        
        # Calculate spending potential score
        spending_score = min(100, (spending_mentions * 10) + (high_value_interest * 15))
        
        return {
            'spending_potential': fan_profile.get('spending_potential') if fan_profile else 'Unknown',
            'spending_mentions': spending_mentions,
            'high_value_interest': high_value_interest,
            'spending_score': spending_score,
            'recommended_price_tier': self._recommend_price_tier(spending_score)
        }
    
    def _calculate_compliance_score(self, compliance_history: List[Dict]) -> Dict:
        """Calculate compliance score based on history"""
        if not compliance_history:
            return {'score': 100, 'issues': 0, 'warnings': 0}
        
        total_checks = len(compliance_history)
        compliant_checks = sum(1 for check in compliance_history 
                             if check.get('compliance_check', {}).get('compliant', True))
        
        total_warnings = sum(len(check.get('compliance_check', {}).get('warnings', [])) 
                           for check in compliance_history)
        
        compliance_rate = (compliant_checks / total_checks) * 100 if total_checks > 0 else 100
        
        return {
            'score': round(compliance_rate, 1),
            'total_checks': total_checks,
            'compliant_checks': compliant_checks,
            'total_warnings': total_warnings
        }
    
    def _generate_recommendations(self, fan_id: str, conversations: List[Dict], 
                                fan_profile: Optional[Dict]) -> List[Dict]:
        """Generate personalized recommendations for fan engagement"""
        recommendations = []
        
        if not conversations:
            recommendations.append({
                'type': 'engagement',
                'priority': 'high',
                'action': 'Send introductory message',
                'reason': 'No conversation history found'
            })
            return recommendations
        
        # Analyze recent activity
        recent_conversations = [c for c in conversations 
                              if self._is_recent(c['timestamp'], days=7)]
        
        if not recent_conversations:
            recommendations.append({
                'type': 're_engagement',
                'priority': 'high',
                'action': 'Send re-engagement message',
                'reason': 'No recent activity in the last 7 days'
            })
        
        # Analyze engagement patterns
        engagement_metrics = self._calculate_engagement_metrics(conversations)
        
        if engagement_metrics.get('messages_per_day', 0) > 5:
            recommendations.append({
                'type': 'upsell',
                'priority': 'medium',
                'action': 'Offer premium content',
                'reason': 'High engagement level detected'
            })
        
        # Spending behavior recommendations
        spending_behavior = self._analyze_spending_behavior(conversations, fan_profile)
        
        if spending_behavior.get('spending_score', 0) > 50:
            recommendations.append({
                'type': 'monetization',
                'priority': 'high',
                'action': f"Offer {spending_behavior['recommended_price_tier']} tier content",
                'reason': 'High spending potential detected'
            })
        
        return recommendations
    
    def _get_date_range(self, sorted_conversations: List[Dict]) -> float:
        """Calculate date range in days"""
        if len(sorted_conversations) < 2:
            return 1
        
        first_date = sorted_conversations[0]['timestamp']
        last_date = sorted_conversations[-1]['timestamp']
        
        if isinstance(first_date, str):
            first_date = datetime.fromisoformat(first_date.replace('Z', '+00:00'))
        if isinstance(last_date, str):
            last_date = datetime.fromisoformat(last_date.replace('Z', '+00:00'))
        
        return (last_date - first_date).days + 1
    
    def _calculate_response_times(self, sorted_conversations: List[Dict]) -> List[float]:
        """Calculate response times between messages"""
        response_times = []
        
        for i in range(1, len(sorted_conversations)):
            prev_time = sorted_conversations[i-1]['timestamp']
            curr_time = sorted_conversations[i]['timestamp']
            
            if isinstance(prev_time, str):
                prev_time = datetime.fromisoformat(prev_time.replace('Z', '+00:00'))
            if isinstance(curr_time, str):
                curr_time = datetime.fromisoformat(curr_time.replace('Z', '+00:00'))
            
            time_diff = (curr_time - prev_time).total_seconds() / 3600  # Convert to hours
            response_times.append(time_diff)
        
        return response_times
    
    def _calculate_phase_distribution(self, conversations: List[Dict]) -> Dict:
        """Calculate distribution of IRAS phases"""
        phase_counts = {}
        
        for conv in conversations:
            phase = conv.get('phase', 'unknown')
            phase_counts[phase] = phase_counts.get(phase, 0) + 1
        
        total = len(conversations)
        return {phase: round((count / total) * 100, 1) 
                for phase, count in phase_counts.items()}
    
    def _calculate_recent_activity(self, sorted_conversations: List[Dict], days: int = 7) -> Dict:
        """Calculate recent activity metrics"""
        cutoff_date = datetime.now() - timedelta(days=days)
        
        recent_conversations = [c for c in sorted_conversations 
                              if self._is_recent(c['timestamp'], days)]
        
        return {
            'recent_messages': len(recent_conversations),
            'days_analyzed': days,
            'activity_level': 'high' if len(recent_conversations) > days else 
                            'medium' if len(recent_conversations) > days/2 else 'low'
        }
    
    def _calculate_consistency_score(self, sorted_conversations: List[Dict]) -> float:
        """Calculate consistency score based on regular interaction patterns"""
        if len(sorted_conversations) < 7:  # Need at least a week of data
            return 0.5
        
        # Calculate daily message counts
        daily_counts = {}
        for conv in sorted_conversations:
            timestamp = conv['timestamp']
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            
            date_key = timestamp.date()
            daily_counts[date_key] = daily_counts.get(date_key, 0) + 1
        
        # Calculate coefficient of variation (lower = more consistent)
        if len(daily_counts) < 2:
            return 0.5
        
        counts = list(daily_counts.values())
        mean_count = statistics.mean(counts)
        std_dev = statistics.stdev(counts) if len(counts) > 1 else 0
        
        if mean_count == 0:
            return 0.0
        
        cv = std_dev / mean_count
        consistency_score = max(0, 1 - cv)  # Higher score = more consistent
        
        return round(consistency_score, 2)
    
    def _analyze_hourly_activity(self, conversations: List[Dict]) -> List[int]:
        """Analyze activity by hour of day"""
        hourly_counts = [0] * 24
        
        for conv in conversations:
            timestamp = conv['timestamp']
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            
            hour = timestamp.hour
            hourly_counts[hour] += 1
        
        return hourly_counts
    
    def _analyze_daily_activity(self, conversations: List[Dict]) -> List[int]:
        """Analyze activity by day of week (0=Monday)"""
        daily_counts = [0] * 7
        
        for conv in conversations:
            timestamp = conv['timestamp']
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            
            day = timestamp.weekday()
            daily_counts[day] += 1
        
        return daily_counts
    
    def _recommend_price_tier(self, spending_score: int) -> str:
        """Recommend price tier based on spending score"""
        if spending_score >= 70:
            return 'premium'
        elif spending_score >= 40:
            return 'mid'
        else:
            return 'entry'
    
    def _is_recent(self, timestamp, days: int) -> bool:
        """Check if timestamp is within the last N days"""
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        
        cutoff = datetime.now() - timedelta(days=days)
        return timestamp >= cutoff
    
    def _get_default_analytics(self, fan_id: str) -> Dict:
        """Get default analytics for fans with no history"""
        return {
            'fan_id': fan_id,
            'profile_summary': {
                'personality_type': 'Unknown',
                'engagement_level': 'Unknown',
                'spending_potential': 'Unknown'
            },
            'engagement_metrics': {},
            'communication_patterns': {},
            'spending_behavior': {'spending_score': 0},
            'compliance_score': {'score': 100},
            'recommendations': [{
                'type': 'first_contact',
                'priority': 'high',
                'action': 'Send welcome message',
                'reason': 'New fan with no interaction history'
            }],
            'last_updated': datetime.now().isoformat()
        }
    
    def get_cohort_analytics(self, cohort_criteria: Dict) -> Dict:
        """Get analytics for a cohort of fans based on criteria"""
        # This would involve more complex database queries
        # Implementation would depend on specific cohort requirements
        pass
    
    def predict_churn_risk(self, fan_id: str) -> Dict:
        """Predict churn risk for a specific fan"""
        analytics = self.get_fan_analytics(fan_id)
        
        # Simple churn risk calculation based on recent activity
        recent_activity = analytics.get('engagement_metrics', {}).get('recent_activity', {})
        recent_messages = recent_activity.get('recent_messages', 0)
        
        if recent_messages == 0:
            risk_level = 'high'
            risk_score = 0.8
        elif recent_messages < 3:
            risk_level = 'medium'
            risk_score = 0.5
        else:
            risk_level = 'low'
            risk_score = 0.2
        
        return {
            'fan_id': fan_id,
            'churn_risk_level': risk_level,
            'churn_risk_score': risk_score,
            'factors': {
                'recent_activity': recent_messages,
                'engagement_consistency': analytics.get('engagement_metrics', {}).get('consistency_score', 0.5)
            },
            'recommended_actions': self._get_churn_prevention_actions(risk_level)
        }
    
    def _get_churn_prevention_actions(self, risk_level: str) -> List[str]:
        """Get recommended actions for churn prevention"""
        if risk_level == 'high':
            return [
                'Send personalized re-engagement message',
                'Offer special discount or exclusive content',
                'Ask for feedback on preferences'
            ]
        elif risk_level == 'medium':
            return [
                'Increase interaction frequency',
                'Share behind-the-scenes content',
                'Send appreciation message'
            ]
        else:
            return [
                'Continue current engagement strategy',
                'Occasional check-in messages'
            ]

# Global fan history tracker
fan_tracker = FanHistoryTracker()