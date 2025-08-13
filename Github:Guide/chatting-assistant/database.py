#!/usr/bin/env python3
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from psycopg2.pool import ThreadedConnectionPool
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import json
import os
from contextlib import contextmanager

from config_manager import config

logger = logging.getLogger(__name__)

class DatabaseManager:
    _instance = None
    _pool = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._pool is None:
            self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize connection pool"""
        db_config = config.get_database_config()
        
        if not db_config or not db_config.get('url'):
            logger.warning("No database configuration found. Using in-memory storage.")
            self._pool = None
            return
        
        try:
            self._pool = ThreadedConnectionPool(
                1, 20,  # min and max connections
                db_config['url'],
                cursor_factory=RealDictCursor
            )
            logger.info("Database connection pool initialized")
            self._create_tables()
        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            self._pool = None
    
    @contextmanager
    def get_connection(self):
        """Get database connection from pool"""
        if not self._pool:
            raise Exception("Database not configured")
        
        conn = None
        try:
            conn = self._pool.getconn()
            yield conn
        finally:
            if conn:
                self._pool.putconn(conn)
    
    def _create_tables(self):
        """Create necessary tables if they don't exist"""
        create_schema_sql = """
        CREATE SCHEMA IF NOT EXISTS chatting;
        
        CREATE TABLE IF NOT EXISTS chatting.fan_profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            fan_id VARCHAR(255) UNIQUE NOT NULL,
            personality_type VARCHAR(50),
            engagement_level VARCHAR(50),
            spending_potential VARCHAR(50),
            interests JSONB,
            last_analyzed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            profile_data JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS chatting.conversation_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            fan_id VARCHAR(255) NOT NULL,
            message_sent TEXT,
            message_received TEXT,
            phase VARCHAR(50),
            effectiveness_score FLOAT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS chatting.message_performance (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id UUID,
            fan_type VARCHAR(50),
            phase VARCHAR(50),
            open_rate FLOAT,
            response_rate FLOAT,
            conversion_rate FLOAT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_fan_profiles_fan_id ON chatting.fan_profiles(fan_id);
        CREATE INDEX IF NOT EXISTS idx_conversation_history_fan_id ON chatting.conversation_history(fan_id);
        CREATE INDEX IF NOT EXISTS idx_conversation_history_timestamp ON chatting.conversation_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_message_performance_fan_type_phase ON chatting.message_performance(fan_type, phase);
        """
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(create_schema_sql)
                    conn.commit()
                    logger.info("Database tables created/verified")
        except Exception as e:
            logger.error(f"Failed to create tables: {e}")
    
    def save_fan_profile(self, fan_id: str, profile_data: Dict[str, Any]) -> bool:
        """Save or update fan profile"""
        if not self._pool:
            logger.warning("Database not available, skipping save")
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    INSERT INTO chatting.fan_profiles 
                    (fan_id, personality_type, engagement_level, spending_potential, interests, profile_data, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (fan_id) 
                    DO UPDATE SET 
                        personality_type = EXCLUDED.personality_type,
                        engagement_level = EXCLUDED.engagement_level,
                        spending_potential = EXCLUDED.spending_potential,
                        interests = EXCLUDED.interests,
                        profile_data = EXCLUDED.profile_data,
                        updated_at = EXCLUDED.updated_at,
                        last_analyzed = CURRENT_TIMESTAMP
                    """
                    
                    cur.execute(sql, (
                        fan_id,
                        profile_data.get('type'),
                        profile_data.get('engagement_level'),
                        profile_data.get('spending_potential', {}).get('potential'),
                        Json(profile_data.get('interests', [])),
                        Json(profile_data),
                        datetime.now()
                    ))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to save fan profile: {e}")
            return False
    
    def get_fan_profile(self, fan_id: str) -> Optional[Dict[str, Any]]:
        """Get fan profile by ID"""
        if not self._pool:
            return None
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT * FROM chatting.fan_profiles WHERE fan_id = %s",
                        (fan_id,)
                    )
                    result = cur.fetchone()
                    return dict(result) if result else None
        except Exception as e:
            logger.error(f"Failed to get fan profile: {e}")
            return None
    
    def save_conversation(self, fan_id: str, message_sent: str = None, 
                         message_received: str = None, phase: str = None) -> bool:
        """Save conversation history"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    INSERT INTO chatting.conversation_history 
                    (fan_id, message_sent, message_received, phase)
                    VALUES (%s, %s, %s, %s)
                    """
                    cur.execute(sql, (fan_id, message_sent, message_received, phase))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to save conversation: {e}")
            return False
    
    def get_conversation_history(self, fan_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get conversation history for a fan"""
        if not self._pool:
            return []
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT * FROM chatting.conversation_history 
                        WHERE fan_id = %s 
                        ORDER BY timestamp DESC 
                        LIMIT %s
                    """, (fan_id, limit))
                    return [dict(row) for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get conversation history: {e}")
            return []
    
    def save_compliance_audit(self, fan_id: str, compliance_check: Dict[str, Any], 
                             manual_send_required: bool = True) -> bool:
        """Save compliance audit record"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    INSERT INTO chatting.compliance_audit 
                    (fan_id, compliance_check, manual_send_required)
                    VALUES (%s, %s, %s)
                    """
                    cur.execute(sql, (fan_id, Json(compliance_check), manual_send_required))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to save compliance audit: {e}")
            return False
    
    def get_compliance_history(self, fan_id: str = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Get compliance audit history"""
        if not self._pool:
            return []
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    if fan_id:
                        sql = """
                        SELECT * FROM chatting.compliance_audit 
                        WHERE fan_id = %s 
                        ORDER BY timestamp DESC 
                        LIMIT %s
                        """
                        cur.execute(sql, (fan_id, limit))
                    else:
                        sql = """
                        SELECT * FROM chatting.compliance_audit 
                        ORDER BY timestamp DESC 
                        LIMIT %s
                        """
                        cur.execute(sql, (limit,))
                    
                    return [dict(row) for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get compliance history: {e}")
            return []
    
    def mark_message_sent_manually(self, audit_id: str) -> bool:
        """Mark that a message was sent manually for compliance"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    UPDATE chatting.compliance_audit 
                    SET sent_manually = true 
                    WHERE id = %s
                    """
                    cur.execute(sql, (audit_id,))
                    conn.commit()
                    return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Failed to mark message as sent manually: {e}")
            return False
    
    def get_compliance_stats(self) -> Dict[str, Any]:
        """Get compliance statistics"""
        if not self._pool:
            return {}
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    SELECT 
                        COUNT(*) as total_audits,
                        COUNT(*) FILTER (WHERE (compliance_check->>'compliant')::boolean = true) as compliant_count,
                        COUNT(*) FILTER (WHERE manual_send_required = true) as manual_send_required_count,
                        COUNT(*) FILTER (WHERE sent_manually = true) as sent_manually_count,
                        AVG(CASE WHEN (compliance_check->'warnings') IS NOT NULL 
                            THEN jsonb_array_length(compliance_check->'warnings') 
                            ELSE 0 END) as avg_warnings_per_message
                    FROM chatting.compliance_audit 
                    WHERE timestamp >= NOW() - INTERVAL '30 days'
                    """
                    cur.execute(sql)
                    result = cur.fetchone()
                    
                    if result:
                        return {
                            "total_audits": result[0],
                            "compliance_rate": result[1] / result[0] if result[0] > 0 else 0,
                            "manual_send_rate": result[2] / result[0] if result[0] > 0 else 0,
                            "manual_completion_rate": result[3] / result[2] if result[2] > 0 else 0,
                            "avg_warnings_per_message": float(result[4]) if result[4] else 0,
                            "period": "last_30_days"
                        }
                    
                    return {}
        except Exception as e:
            logger.error(f"Failed to get compliance stats: {e}")
            return {}

    def save_message_performance(self, fan_type: str, phase: str, 
                                open_rate: float = None, response_rate: float = None,
                                conversion_rate: float = None) -> bool:
        """Save message performance metrics"""
        if not self._pool:
            return False
    
    # Nouvelles méthodes pour la personnalisation avancée
    def get_fan_activity(self, fan_id: str) -> Dict[str, Any]:
        """Retourne les heures de connexion récentes et les derniers achats"""
        if not self._pool:
            return {"logins": [], "purchases": [], "affinities": []}
        
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Récupérer les dernières connexions
                    cur.execute("""
                        SELECT login_time, session_duration, activity_level
                        FROM chatting.fan_login_history
                        WHERE fan_id = %s
                        ORDER BY login_time DESC
                        LIMIT 5
                    """, (fan_id,))
                    logins = cur.fetchall()

                    # Récupérer les derniers achats
                    cur.execute("""
                        SELECT product_id, product_type, amount, purchase_time, currency
                        FROM chatting.fan_purchases
                        WHERE fan_id = %s
                        ORDER BY purchase_time DESC
                        LIMIT 10
                    """, (fan_id,))
                    purchases = cur.fetchall()

                    # Récupérer les affinités
                    cur.execute("""
                        SELECT topic, score, confidence, source
                        FROM chatting.fan_affinities
                        WHERE fan_id = %s
                        ORDER BY score DESC
                        LIMIT 5
                    """, (fan_id,))
                    affinities = cur.fetchall()

                    return {
                        "logins": [dict(row) for row in logins],
                        "purchases": [dict(row) for row in purchases],
                        "affinities": [dict(row) for row in affinities]
                    }
        except Exception as e:
            logger.error(f"Failed to get fan activity for {fan_id}: {e}")
            return {"logins": [], "purchases": [], "affinities": []}
    
    def record_fan_login(self, fan_id: str, session_duration: int = None, 
                        platform: str = "web", activity_level: str = "medium") -> bool:
        """Enregistre une connexion de fan"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    INSERT INTO chatting.fan_login_history 
                    (fan_id, session_duration, platform, activity_level)
                    VALUES (%s, %s, %s, %s)
                    """
                    cur.execute(sql, (fan_id, session_duration, platform, activity_level))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to record fan login for {fan_id}: {e}")
            return False
    
    def record_fan_purchase(self, fan_id: str, product_type: str, amount: float,
                           product_id: str = None, currency: str = "USD") -> bool:
        """Enregistre un achat de fan"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    INSERT INTO chatting.fan_purchases 
                    (fan_id, product_id, product_type, amount, currency)
                    VALUES (%s, %s, %s, %s, %s)
                    """
                    cur.execute(sql, (fan_id, product_id, product_type, amount, currency))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to record fan purchase for {fan_id}: {e}")
            return False
    
    def update_fan_affinities(self, fan_id: str, affinities: Dict[str, float], 
                             source: str = "messages") -> bool:
        """Met à jour les affinités d'un fan"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    for topic, score in affinities.items():
                        sql = """
                        INSERT INTO chatting.fan_affinities (fan_id, topic, score, source)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (fan_id, topic)
                        DO UPDATE SET 
                            score = EXCLUDED.score,
                            source = EXCLUDED.source,
                            last_updated = CURRENT_TIMESTAMP
                        """
                        cur.execute(sql, (fan_id, topic, score, source))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to update fan affinities for {fan_id}: {e}")
            return False
    
    def select_variant(self, fan_type: str, phase: str) -> Dict[str, Any]:
        """Retourne la variante avec le meilleur taux de conversion ou choisit aléatoirement"""
        if not self._pool:
            return {}
        
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Chercher la meilleure variante
                    cur.execute("""
                        SELECT mv.variant_id, mv.template_text, mv.variant_name,
                               vm.conversion_rate, vm.send_count
                        FROM chatting.message_variants mv
                        JOIN chatting.variant_metrics vm ON mv.variant_id = vm.variant_id
                        WHERE mv.personality_type = %s AND mv.phase = %s 
                              AND mv.is_active = true
                        ORDER BY vm.conversion_rate DESC, vm.send_count DESC
                        LIMIT 1
                    """, (fan_type, phase))
                    best = cur.fetchone()
                    
                    if best and best['send_count'] > 5:  # Minimum de données pour être fiable
                        return dict(best)
                    
                    # Fallback : prendre une variante aléatoire pour exploration
                    cur.execute("""
                        SELECT mv.variant_id, mv.template_text, mv.variant_name
                        FROM chatting.message_variants mv
                        WHERE mv.personality_type = %s AND mv.phase = %s 
                              AND mv.is_active = true
                        ORDER BY RANDOM()
                        LIMIT 1
                    """, (fan_type, phase))
                    random_variant = cur.fetchone()
                    
                    return dict(random_variant) if random_variant else {}
        except Exception as e:
            logger.error(f"Failed to select variant for {fan_type}/{phase}: {e}")
            return {}
    
    def record_ab_result(self, variant_id: str, converted: bool, responded: bool = False,
                        response_time_hours: float = None, revenue: float = 0.0) -> bool:
        """Met à jour la performance d'une variante après un envoi"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    UPDATE chatting.variant_metrics
                    SET send_count = send_count + 1,
                        conversion_count = conversion_count + %s,
                        response_count = response_count + %s,
                        revenue_generated = revenue_generated + %s,
                        conversion_rate = (conversion_count + %s)::DECIMAL / (send_count + 1),
                        response_rate = (response_count + %s)::DECIMAL / (send_count + 1),
                        avg_response_time_hours = CASE 
                            WHEN %s IS NOT NULL AND response_count > 0 THEN
                                (COALESCE(avg_response_time_hours, 0) * response_count + %s) / (response_count + %s)
                            ELSE avg_response_time_hours
                        END,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE variant_id = %s
                    """
                    conversion_val = 1 if converted else 0
                    response_val = 1 if responded else 0
                    
                    cur.execute(sql, (
                        conversion_val, response_val, revenue, conversion_val, response_val,
                        response_time_hours, response_time_hours, response_val, variant_id
                    ))
                    conn.commit()
                    return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Failed to record A/B result for {variant_id}: {e}")
            return False
    
    def save_fan_emotions(self, fan_id: str, emotions: Dict[str, float], 
                         conversation_id: str = None, message_count: int = 1) -> bool:
        """Sauvegarde l'analyse émotionnelle d'un fan"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    # Trouver l'émotion dominante
                    dominant_emotion = max(emotions.items(), key=lambda x: x[1])[0]
                    confidence = emotions[dominant_emotion]
                    
                    sql = """
                    INSERT INTO chatting.fan_emotions 
                    (fan_id, conversation_id, emotions, dominant_emotion, confidence, message_count)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """
                    cur.execute(sql, (
                        fan_id, conversation_id, Json(emotions), 
                        dominant_emotion, confidence, message_count
                    ))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to save fan emotions for {fan_id}: {e}")
            return False
    
    def get_fan_emotional_profile(self, fan_id: str, days: int = 30) -> Dict[str, Any]:
        """Récupère le profil émotionnel récent d'un fan"""
        if not self._pool:
            return {}
        
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("""
                        SELECT 
                            dominant_emotion,
                            AVG(confidence) as avg_confidence,
                            COUNT(*) as occurrence_count,
                            MAX(analysis_timestamp) as last_analysis
                        FROM chatting.fan_emotions
                        WHERE fan_id = %s 
                              AND analysis_timestamp > CURRENT_TIMESTAMP - INTERVAL '%s days'
                        GROUP BY dominant_emotion
                        ORDER BY occurrence_count DESC, avg_confidence DESC
                    """, (fan_id, days))
                    
                    emotions = cur.fetchall()
                    
                    if emotions:
                        return {
                            "primary_emotion": emotions[0]["dominant_emotion"],
                            "confidence": emotions[0]["avg_confidence"],
                            "emotion_distribution": [dict(row) for row in emotions],
                            "last_analysis": emotions[0]["last_analysis"]
                        }
                    
                    return {}
        except Exception as e:
            logger.error(f"Failed to get emotional profile for {fan_id}: {e}")
            return {}
    
    def get_variant_performance_summary(self, days: int = 30) -> List[Dict[str, Any]]:
        """Récupère un résumé des performances des variantes"""
        if not self._pool:
            return []
        
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("""
                        SELECT * FROM chatting.variant_performance_summary
                        ORDER BY personality_type, phase, performance_rank
                    """)
                    
                    return [dict(row) for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get variant performance summary: {e}")
            return []
    
    def get_all_fan_profiles(self) -> List[Dict[str, Any]]:
        """Retourne tous les profils de fans pour l'entraînement ML"""
        if not self._pool:
            return []
        
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    sql = """
                    SELECT 
                        fan_id,
                        personality_type,
                        engagement_level,
                        spending_potential,
                        interests,
                        created_at,
                        last_analyzed
                    FROM chatting.fan_profiles
                    WHERE personality_type IS NOT NULL
                    ORDER BY last_analyzed DESC NULLS LAST
                    """
                    cur.execute(sql)
                    profiles = cur.fetchall()
                    
                    return [dict(row) for row in profiles]
                    
        except Exception as e:
            logger.error(f"Failed to fetch all fan profiles: {e}")
            return []
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    sql = """
                    INSERT INTO chatting.message_performance 
                    (fan_type, phase, open_rate, response_rate, conversion_rate)
                    VALUES (%s, %s, %s, %s, %s)
                    """
                    cur.execute(sql, (fan_type, phase, open_rate, response_rate, conversion_rate))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to save message performance: {e}")
            return False
    
    def get_templates(self, language: str = 'en') -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
        """Retrieve message templates from database"""
        if not self._pool:
            return {}
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT id, personality_type, phase, template_text, effectiveness_score, usage_count
                        FROM chatting.message_templates
                        WHERE personality_type IS NOT NULL AND phase IS NOT NULL
                        ORDER BY effectiveness_score DESC, usage_count DESC
                    """)
                    
                    templates = {}
                    for row in cur.fetchall():
                        template_id, p_type, phase, text, effectiveness, usage = row
                        
                        if p_type not in templates:
                            templates[p_type] = {}
                        if phase not in templates[p_type]:
                            templates[p_type][phase] = []
                        
                        templates[p_type][phase].append({
                            'id': template_id,
                            'text': text,
                            'effectiveness_score': effectiveness or 0.0,
                            'usage_count': usage or 0
                        })
                    
                    return templates
        except Exception as e:
            logger.error(f"Failed to get templates: {e}")
            return {}
    
    def add_template(self, personality_type: str, phase: str, template_text: str, 
                    language: str = 'en', effectiveness_score: float = 0.0) -> bool:
        """Add new message template"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO chatting.message_templates 
                        (personality_type, phase, template_text, effectiveness_score)
                        VALUES (%s, %s, %s, %s)
                    """, (personality_type, phase, template_text, effectiveness_score))
                    conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Failed to add template: {e}")
            return False
    
    def update_template_effectiveness(self, template_id: str, effectiveness_score: float, 
                                    increment_usage: bool = True) -> bool:
        """Update template effectiveness score and usage count"""
        if not self._pool:
            return False
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    if increment_usage:
                        cur.execute("""
                            UPDATE chatting.message_templates 
                            SET effectiveness_score = %s, 
                                usage_count = usage_count + 1,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = %s
                        """, (effectiveness_score, template_id))
                    else:
                        cur.execute("""
                            UPDATE chatting.message_templates 
                            SET effectiveness_score = %s,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = %s
                        """, (effectiveness_score, template_id))
                    
                    conn.commit()
                    return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Failed to update template effectiveness: {e}")
            return False
    
    def get_template_performance(self, days: int = 30) -> List[Dict[str, Any]]:
        """Get template performance statistics"""
        if not self._pool:
            return []
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 
                            t.id,
                            t.personality_type,
                            t.phase,
                            t.template_text,
                            t.effectiveness_score,
                            t.usage_count,
                            COUNT(ch.id) as conversations_using_template
                        FROM chatting.message_templates t
                        LEFT JOIN chatting.conversation_history ch ON ch.message_sent LIKE '%' || t.template_text || '%'
                            AND ch.timestamp >= NOW() - INTERVAL '%s days'
                        GROUP BY t.id, t.personality_type, t.phase, t.template_text, t.effectiveness_score, t.usage_count
                        ORDER BY t.effectiveness_score DESC, t.usage_count DESC
                    """, (days,))
                    
                    return [dict(row) for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get template performance: {e}")
            return []
    
    def get_performance_stats(self, fan_type: str = None, phase: str = None) -> List[Dict[str, Any]]:
        """Get performance statistics"""
        if not self._pool:
            return []
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    where_clauses = []
                    params = []
                    
                    if fan_type:
                        where_clauses.append("fan_type = %s")
                        params.append(fan_type)
                    
                    if phase:
                        where_clauses.append("phase = %s")
                        params.append(phase)
                    
                    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
                    
                    sql = f"""
                    SELECT 
                        fan_type,
                        phase,
                        AVG(open_rate) as avg_open_rate,
                        AVG(response_rate) as avg_response_rate,
                        AVG(conversion_rate) as avg_conversion_rate,
                        COUNT(*) as sample_count
                    FROM chatting.message_performance 
                    {where_sql}
                    GROUP BY fan_type, phase
                    ORDER BY avg_conversion_rate DESC
                    """
                    
                    cur.execute(sql, params)
                    return [dict(row) for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"Failed to get performance stats: {e}")
            return []
    
    def close(self):
        """Close connection pool"""
        if self._pool:
            self._pool.closeall()
            self._pool = None

# Global database instance
db = DatabaseManager()