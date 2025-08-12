-- OnlyFans Chatting Assistant Database Schema
-- Migration 001: Create chatting tables

-- Create chatting schema
CREATE SCHEMA IF NOT EXISTS chatting;

-- Fan profiles table
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

-- Conversation history table
CREATE TABLE IF NOT EXISTS chatting.conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fan_id VARCHAR(255) NOT NULL,
    message_sent TEXT,
    message_received TEXT,
    phase VARCHAR(50),
    effectiveness_score FLOAT,
    compliance_check JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message performance tracking
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

-- Message templates
CREATE TABLE IF NOT EXISTS chatting.message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personality_type VARCHAR(50) NOT NULL,
    phase VARCHAR(50) NOT NULL,
    template_text TEXT NOT NULL,
    effectiveness_score FLOAT DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Compliance audit log
CREATE TABLE IF NOT EXISTS chatting.compliance_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fan_id VARCHAR(255),
    message_id UUID,
    compliance_check JSONB NOT NULL,
    manual_send_required BOOLEAN DEFAULT TRUE,
    sent_manually BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fan_profiles_fan_id ON chatting.fan_profiles(fan_id);
CREATE INDEX IF NOT EXISTS idx_fan_profiles_personality_type ON chatting.fan_profiles(personality_type);
CREATE INDEX IF NOT EXISTS idx_fan_profiles_last_analyzed ON chatting.fan_profiles(last_analyzed);

CREATE INDEX IF NOT EXISTS idx_conversation_history_fan_id ON chatting.conversation_history(fan_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_timestamp ON chatting.conversation_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_conversation_history_phase ON chatting.conversation_history(phase);

CREATE INDEX IF NOT EXISTS idx_message_performance_fan_type_phase ON chatting.message_performance(fan_type, phase);
CREATE INDEX IF NOT EXISTS idx_message_performance_created_at ON chatting.message_performance(created_at);

CREATE INDEX IF NOT EXISTS idx_message_templates_personality_phase ON chatting.message_templates(personality_type, phase);
CREATE INDEX IF NOT EXISTS idx_message_templates_effectiveness ON chatting.message_templates(effectiveness_score DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_fan_id ON chatting.compliance_audit(fan_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_timestamp ON chatting.compliance_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_manual_send ON chatting.compliance_audit(manual_send_required, sent_manually);

-- Comments for documentation
COMMENT ON SCHEMA chatting IS 'OnlyFans AI Chatting Assistant data schema';
COMMENT ON TABLE chatting.fan_profiles IS 'Fan personality profiles and analysis results';
COMMENT ON TABLE chatting.conversation_history IS 'Message exchange history between creator and fans';
COMMENT ON TABLE chatting.message_performance IS 'Performance metrics for different message types';
COMMENT ON TABLE chatting.message_templates IS 'Template library with effectiveness tracking';
COMMENT ON TABLE chatting.compliance_audit IS 'Compliance checking audit trail';

-- Insert default message templates
INSERT INTO chatting.message_templates (personality_type, phase, template_text) VALUES
-- Emotional type templates
('Emotional', 'intrigue', 'Hey sweetie! 💕 I''ve been thinking about you... want to hear something personal?'),
('Emotional', 'rapport', 'I really loved what you said about {topic} 💕 It made me feel so understood'),
('Emotional', 'attraction', 'I created something intimate just for you... want a sneak peek? 😘 {offer_link}'),
('Emotional', 'submission', 'The connection we have is so special... maybe one day we could take this further? 💕'),

-- Conqueror type templates  
('Conqueror', 'intrigue', '🔥 Ready for an exclusive opportunity? Only my VIPs get this offer...'),
('Conqueror', 'rapport', 'You''re ranking #{rank} among my supporters! 🏆 That''s seriously impressive'),
('Conqueror', 'attraction', '🚀 EXCLUSIVE DROP: {offer_link} - Only for my top 1% fans like you'),
('Conqueror', 'submission', 'Keep climbing and you''ll unlock experiences money can''t usually buy 🏆')
ON CONFLICT DO NOTHING;