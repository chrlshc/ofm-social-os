-- =========================================
-- Base de données : ofm_marketing
-- Description : Gestion des campagnes marketing et réseaux sociaux
-- =========================================

-- Table des comptes réseaux sociaux
CREATE TABLE IF NOT EXISTS social_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    platform VARCHAR(50) NOT NULL, -- 'instagram', 'tiktok', 'reddit', 'x'
    account_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    profile_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, platform, account_id)
);

-- Table des campagnes marketing
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    campaign_type VARCHAR(50), -- 'dm_outreach', 'content_promotion', 'growth'
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
    target_audience JSONB DEFAULT '{}',
    budget DECIMAL(10, 2),
    start_date DATE,
    end_date DATE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des publications sur les réseaux sociaux
CREATE TABLE IF NOT EXISTS social_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    social_account_id INTEGER REFERENCES social_accounts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_urls TEXT[],
    hashtags TEXT[],
    mentions TEXT[],
    post_type VARCHAR(50), -- 'post', 'story', 'reel', 'video'
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'scheduled', 'published', 'failed'
    scheduled_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    platform_post_id VARCHAR(255),
    engagement_data JSONB DEFAULT '{}', -- likes, comments, shares, views
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table pour Instagram DM outreach
CREATE TABLE IF NOT EXISTS instagram_dm_campaigns (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    account_username VARCHAR(255) NOT NULL,
    account_password_encrypted TEXT NOT NULL,
    target_criteria JSONB DEFAULT '{}', -- followers_min, followers_max, keywords, etc.
    message_template TEXT NOT NULL,
    daily_limit INTEGER DEFAULT 50,
    total_sent INTEGER DEFAULT 0,
    total_responses INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des contacts DM
CREATE TABLE IF NOT EXISTS dm_contacts (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES instagram_dm_campaigns(id) ON DELETE CASCADE,
    instagram_username VARCHAR(255) NOT NULL,
    instagram_user_id VARCHAR(255),
    full_name VARCHAR(255),
    bio TEXT,
    followers_count INTEGER,
    following_count INTEGER,
    posts_count INTEGER,
    is_verified BOOLEAN DEFAULT false,
    is_business BOOLEAN DEFAULT false,
    contact_info JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'messaged', 'responded', 'converted', 'blocked'
    message_sent_at TIMESTAMP WITH TIME ZONE,
    response_received_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des messages DM envoyés
CREATE TABLE IF NOT EXISTS dm_messages (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES dm_contacts(id) ON DELETE CASCADE,
    message_type VARCHAR(20) DEFAULT 'outbound', -- 'outbound', 'inbound'
    content TEXT NOT NULL,
    is_automated BOOLEAN DEFAULT true,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- Table des webhooks entrants (Meta, TikTok, etc.)
CREATE TABLE IF NOT EXISTS webhook_events (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255),
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des templates de contenu
CREATE TABLE IF NOT EXISTS content_templates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(50),
    template_type VARCHAR(50), -- 'post', 'story', 'dm', 'caption'
    content TEXT NOT NULL,
    variables JSONB DEFAULT '{}', -- placeholders like {name}, {offer}, etc.
    media_urls TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des hashtags performants
CREATE TABLE IF NOT EXISTS hashtag_analytics (
    id SERIAL PRIMARY KEY,
    hashtag VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    usage_count INTEGER DEFAULT 0,
    avg_engagement_rate DECIMAL(5, 2),
    last_analyzed_at TIMESTAMP WITH TIME ZONE,
    trending_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hashtag, platform)
);

-- Table des prospects Reddit
CREATE TABLE IF NOT EXISTS reddit_prospects (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    subreddits TEXT[],
    karma_score INTEGER,
    account_age_days INTEGER,
    interests TEXT[],
    contact_status VARCHAR(50) DEFAULT 'identified', -- 'identified', 'messaged', 'responded'
    message_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table d'analyse de contenu
CREATE TABLE IF NOT EXISTS content_analysis (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
    sentiment_score DECIMAL(3, 2), -- -1 to 1
    engagement_rate DECIMAL(5, 2),
    reach INTEGER,
    impressions INTEGER,
    clicks INTEGER,
    conversions INTEGER,
    best_posting_time TIME,
    audience_demographics JSONB DEFAULT '{}',
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX idx_social_accounts_user ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_platform ON social_accounts(platform);
CREATE INDEX idx_campaigns_user ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_social_posts_user ON social_posts(user_id);
CREATE INDEX idx_social_posts_platform ON social_posts(platform);
CREATE INDEX idx_social_posts_status ON social_posts(status);
CREATE INDEX idx_social_posts_scheduled ON social_posts(scheduled_at);
CREATE INDEX idx_dm_contacts_campaign ON dm_contacts(campaign_id);
CREATE INDEX idx_dm_contacts_status ON dm_contacts(status);
CREATE INDEX idx_dm_messages_contact ON dm_messages(contact_id);
CREATE INDEX idx_webhook_events_platform ON webhook_events(platform);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_content_templates_user ON content_templates(user_id);
CREATE INDEX idx_hashtag_analytics_platform ON hashtag_analytics(platform);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers pour updated_at
CREATE TRIGGER update_social_accounts_updated_at BEFORE UPDATE ON social_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_posts_updated_at BEFORE UPDATE ON social_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instagram_dm_campaigns_updated_at BEFORE UPDATE ON instagram_dm_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dm_contacts_updated_at BEFORE UPDATE ON dm_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_templates_updated_at BEFORE UPDATE ON content_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hashtag_analytics_updated_at BEFORE UPDATE ON hashtag_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reddit_prospects_updated_at BEFORE UPDATE ON reddit_prospects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();