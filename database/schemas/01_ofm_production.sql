-- =========================================
-- Base de données : ofm_production
-- Description : Données principales des utilisateurs et créateurs
-- =========================================

-- Table des utilisateurs (créateurs de contenu)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    bio TEXT,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    stripe_customer_id VARCHAR(255),
    stripe_connect_account_id VARCHAR(255),
    onboarding_completed BOOLEAN DEFAULT false
);

-- Table des profils de créateurs
CREATE TABLE IF NOT EXISTS creator_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(255),
    description TEXT,
    subscription_price DECIMAL(10, 2) DEFAULT 0,
    content_categories TEXT[],
    social_links JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    is_ai_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des fans/abonnés
CREATE TABLE IF NOT EXISTS fans (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des abonnements (relation créateur-fan)
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    fan_id INTEGER REFERENCES fans(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active', -- active, cancelled, expired
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    stripe_subscription_id VARCHAR(255),
    UNIQUE(creator_id, fan_id)
);

-- Table des messages
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    sender_type VARCHAR(20) NOT NULL, -- 'creator', 'fan', 'ai'
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    media_urls TEXT[],
    is_read BOOLEAN DEFAULT false,
    is_ai_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    fan_id INTEGER REFERENCES fans(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id, fan_id)
);

-- Table des contenus publiés
CREATE TABLE IF NOT EXISTS content_posts (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500),
    description TEXT,
    content_type VARCHAR(50), -- 'photo', 'video', 'text', 'audio'
    media_urls TEXT[],
    is_premium BOOLEAN DEFAULT false,
    is_ai_generated BOOLEAN DEFAULT false,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,
    scheduled_at TIMESTAMP WITH TIME ZONE
);

-- Table des configurations IA
CREATE TABLE IF NOT EXISTS ai_configurations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tone INTEGER DEFAULT 50, -- 0-100 (formel à décontracté)
    persona TEXT,
    auto_post_frequency INTEGER DEFAULT 3, -- posts par semaine
    active_hours JSONB DEFAULT '{}',
    blocked_topics TEXT[],
    humor_level INTEGER DEFAULT 30, -- 0-100
    response_length VARCHAR(20) DEFAULT 'medium', -- short, medium, long
    language_style VARCHAR(20) DEFAULT 'casual', -- formal, casual, flirty
    guidelines_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des logs d'activité
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX idx_subscriptions_creator ON subscriptions(creator_id);
CREATE INDEX idx_subscriptions_fan ON subscriptions(fan_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_conversations_creator_fan ON conversations(creator_id, fan_id);
CREATE INDEX idx_content_posts_creator ON content_posts(creator_id);
CREATE INDEX idx_content_posts_published ON content_posts(published_at DESC);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_creator_profiles_updated_at BEFORE UPDATE ON creator_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_posts_updated_at BEFORE UPDATE ON content_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_configurations_updated_at BEFORE UPDATE ON ai_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();