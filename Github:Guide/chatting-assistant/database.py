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