-- Migration pour la personnalisation avancée en temps réel
-- Ajoute les tables pour le suivi d'activité, les affinités et l'A/B testing

-- Table pour l'historique de connexion des fans
CREATE TABLE IF NOT EXISTS chatting.fan_login_history (
    id SERIAL PRIMARY KEY,
    fan_id VARCHAR(255) NOT NULL,
    login_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_duration INTEGER, -- en minutes
    platform VARCHAR(50), -- web, mobile, etc.
    activity_level VARCHAR(20) DEFAULT 'medium', -- low, medium, high
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table pour l'historique des achats
CREATE TABLE IF NOT EXISTS chatting.fan_purchases (
    id SERIAL PRIMARY KEY,
    fan_id VARCHAR(255) NOT NULL,
    product_id VARCHAR(255),
    product_type VARCHAR(50), -- photo_set, video, custom, tip, etc.
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    purchase_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payment_method VARCHAR(50),
    status VARCHAR(20) DEFAULT 'completed', -- completed, refunded, disputed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les affinités et préférences des fans
CREATE TABLE IF NOT EXISTS chatting.fan_affinities (
    id SERIAL PRIMARY KEY,
    fan_id VARCHAR(255) NOT NULL,
    topic VARCHAR(100) NOT NULL, -- photography, fitness, travel, etc.
    score DECIMAL(5,3) NOT NULL CHECK (score >= 0 AND score <= 1), -- 0.000 à 1.000
    confidence DECIMAL(5,3) DEFAULT 0.5,
    source VARCHAR(50) DEFAULT 'messages', -- messages, purchases, interactions
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fan_id, topic)
);

-- Table pour les variantes de messages (A/B testing)
CREATE TABLE IF NOT EXISTS chatting.message_variants (
    id SERIAL PRIMARY KEY,
    variant_id VARCHAR(255) UNIQUE NOT NULL,
    personality_type VARCHAR(50) NOT NULL, -- Emotional, Conqueror
    phase VARCHAR(50) NOT NULL, -- intrigue, rapport, attraction, submission
    template_text TEXT NOT NULL,
    variant_name VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table pour les métriques des variantes
CREATE TABLE IF NOT EXISTS chatting.variant_metrics (
    id SERIAL PRIMARY KEY,
    variant_id VARCHAR(255) NOT NULL REFERENCES chatting.message_variants(variant_id),
    fan_type VARCHAR(50) NOT NULL,
    phase VARCHAR(50) NOT NULL,
    send_count INTEGER DEFAULT 0,
    conversion_count INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,4) DEFAULT 0.0000,
    response_count INTEGER DEFAULT 0,
    response_rate DECIMAL(5,4) DEFAULT 0.0000,
    avg_response_time_hours DECIMAL(8,2),
    revenue_generated DECIMAL(10,2) DEFAULT 0.00,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(variant_id, fan_type, phase)
);

-- Table pour l'analyse émotionnelle
CREATE TABLE IF NOT EXISTS chatting.fan_emotions (
    id SERIAL PRIMARY KEY,
    fan_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255),
    emotions JSONB NOT NULL, -- {"joy": 0.8, "sadness": 0.1, "anger": 0.05, ...}
    dominant_emotion VARCHAR(50),
    confidence DECIMAL(5,3),
    message_count INTEGER DEFAULT 1,
    analysis_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table pour le tracking des sessions d'agents
CREATE TABLE IF NOT EXISTS chatting.agent_sessions (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    fans_processed INTEGER DEFAULT 0,
    messages_generated INTEGER DEFAULT 0,
    successful_sends INTEGER DEFAULT 0,
    agent_version VARCHAR(50),
    configuration JSONB,
    status VARCHAR(20) DEFAULT 'active' -- active, inactive, error
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_fan_login_history_fan_time ON chatting.fan_login_history(fan_id, login_time DESC);
CREATE INDEX IF NOT EXISTS idx_fan_purchases_fan_time ON chatting.fan_purchases(fan_id, purchase_time DESC);
CREATE INDEX IF NOT EXISTS idx_fan_affinities_fan_score ON chatting.fan_affinities(fan_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_message_variants_type_phase ON chatting.message_variants(personality_type, phase);
CREATE INDEX IF NOT EXISTS idx_variant_metrics_performance ON chatting.variant_metrics(conversion_rate DESC, response_rate DESC);
CREATE INDEX IF NOT EXISTS idx_fan_emotions_fan_time ON chatting.fan_emotions(fan_id, analysis_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_time ON chatting.agent_sessions(agent_id, start_time DESC);

-- Fonctions utilitaires
CREATE OR REPLACE FUNCTION chatting.update_variant_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Mise à jour automatique des métriques lors d'ajout de résultats
    UPDATE chatting.variant_metrics 
    SET last_updated = CURRENT_TIMESTAMP
    WHERE variant_id = NEW.variant_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mise à jour automatique
DROP TRIGGER IF EXISTS update_variant_metrics_trigger ON chatting.variant_metrics;
CREATE TRIGGER update_variant_metrics_trigger
    AFTER UPDATE ON chatting.variant_metrics
    FOR EACH ROW
    EXECUTE FUNCTION chatting.update_variant_metrics();

-- Données initiales pour les variantes de test
INSERT INTO chatting.message_variants (variant_id, personality_type, phase, template_text, variant_name, description) VALUES
-- Variantes Emotional - Intrigue
('emo_intrigue_v1', 'Emotional', 'intrigue', 'Hey sweetie! 💕 I''ve been thinking about you... want to hear something personal?', 'Emotional Intrigue V1', 'Personal and intimate approach'),
('emo_intrigue_v2', 'Emotional', 'intrigue', 'Hi love 🌹 I have something special to share, but first... how was your day?', 'Emotional Intrigue V2', 'Caring and question-based'),
('emo_intrigue_v3', 'Emotional', 'intrigue', 'Hello darling 💖 I noticed you''ve been quiet... everything okay?', 'Emotional Intrigue V3', 'Concern and attention-focused'),

-- Variantes Conqueror - Intrigue  
('con_intrigue_v1', 'Conqueror', 'intrigue', '🔥 Ready for an exclusive opportunity? Only my VIPs get this offer...', 'Conqueror Intrigue V1', 'Exclusivity and VIP status'),
('con_intrigue_v2', 'Conqueror', 'intrigue', '👑 You caught my attention as a top supporter. Want to level up?', 'Conqueror Intrigue V2', 'Recognition and progression'),
('con_intrigue_v3', 'Conqueror', 'intrigue', '🏆 I have a challenge for my elite fans... are you up for it?', 'Conqueror Intrigue V3', 'Challenge and competition'),

-- Variantes Emotional - Attraction
('emo_attraction_v1', 'Emotional', 'attraction', 'I created something intimate just for you... want a sneak peek? 😘 {offer_link}', 'Emotional Attraction V1', 'Intimate and exclusive'),
('emo_attraction_v2', 'Emotional', 'attraction', 'You''ve been so sweet to me... I want to give you exclusive access to {offer_link} 💕', 'Emotional Attraction V2', 'Gratitude-based offering'),

-- Variantes Conqueror - Attraction
('con_attraction_v1', 'Conqueror', 'attraction', '🚀 EXCLUSIVE DROP: {offer_link} - Only for my top 1% fans like you', 'Conqueror Attraction V1', 'Elite status and exclusivity'),
('con_attraction_v2', 'Conqueror', 'attraction', '💎 VIP ACCESS: Get {offer_link} before anyone else sees it', 'Conqueror Attraction V2', 'First access privilege');

-- Initialisation des métriques pour les variantes
INSERT INTO chatting.variant_metrics (variant_id, fan_type, phase) 
SELECT variant_id, personality_type, phase 
FROM chatting.message_variants 
WHERE variant_id NOT IN (SELECT variant_id FROM chatting.variant_metrics);

-- Vues utiles pour l'analyse
CREATE OR REPLACE VIEW chatting.fan_activity_summary AS
SELECT 
    f.fan_id,
    COUNT(DISTINCT fh.id) as login_count_7d,
    AVG(fh.session_duration) as avg_session_duration,
    COUNT(DISTINCT fp.id) as purchase_count_30d,
    COALESCE(SUM(fp.amount), 0) as total_spent_30d,
    ARRAY_AGG(DISTINCT fa.topic ORDER BY fa.score DESC) FILTER (WHERE fa.score > 0.5) as top_interests
FROM chatting.fan_profiles f
LEFT JOIN chatting.fan_login_history fh ON f.fan_id = fh.fan_id 
    AND fh.login_time > CURRENT_TIMESTAMP - INTERVAL '7 days'
LEFT JOIN chatting.fan_purchases fp ON f.fan_id = fp.fan_id 
    AND fp.purchase_time > CURRENT_TIMESTAMP - INTERVAL '30 days'
LEFT JOIN chatting.fan_affinities fa ON f.fan_id = fa.fan_id
GROUP BY f.fan_id;

CREATE OR REPLACE VIEW chatting.variant_performance_summary AS
SELECT 
    mv.variant_id,
    mv.personality_type,
    mv.phase,
    mv.variant_name,
    vm.send_count,
    vm.conversion_count,
    vm.conversion_rate,
    vm.response_rate,
    vm.revenue_generated,
    RANK() OVER (PARTITION BY mv.personality_type, mv.phase ORDER BY vm.conversion_rate DESC) as performance_rank
FROM chatting.message_variants mv
JOIN chatting.variant_metrics vm ON mv.variant_id = vm.variant_id
WHERE mv.is_active = true
ORDER BY mv.personality_type, mv.phase, vm.conversion_rate DESC;