-- =========================================
-- Base de données : ofm_kpi
-- Description : Métriques, analytics et tableaux de bord
-- =========================================

-- Table des métriques quotidiennes par créateur
CREATE TABLE IF NOT EXISTS daily_creator_metrics (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    date DATE NOT NULL,
    
    -- Métriques de revenus
    revenue_total DECIMAL(10, 2) DEFAULT 0,
    revenue_subscriptions DECIMAL(10, 2) DEFAULT 0,
    revenue_tips DECIMAL(10, 2) DEFAULT 0,
    revenue_content DECIMAL(10, 2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    
    -- Métriques d'audience
    total_fans INTEGER DEFAULT 0,
    new_fans INTEGER DEFAULT 0,
    churned_fans INTEGER DEFAULT 0,
    active_fans INTEGER DEFAULT 0, -- Fans ayant interagi
    
    -- Métriques d'engagement
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    ai_messages_sent INTEGER DEFAULT 0,
    avg_response_time_minutes INTEGER,
    
    -- Métriques de contenu
    posts_created INTEGER DEFAULT 0,
    posts_published INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    engagement_rate DECIMAL(5, 2),
    
    -- Métriques sociales
    social_posts_published INTEGER DEFAULT 0,
    social_reach INTEGER DEFAULT 0,
    social_engagement INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id, date)
);

-- Table des métriques horaires (pour analyses détaillées)
CREATE TABLE IF NOT EXISTS hourly_metrics (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    hour INTEGER NOT NULL, -- 0-23
    
    active_users INTEGER DEFAULT 0,
    messages_count INTEGER DEFAULT 0,
    revenue DECIMAL(10, 2) DEFAULT 0,
    page_views INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id, timestamp)
);

-- Table des performances des fans
CREATE TABLE IF NOT EXISTS fan_lifetime_value (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    fan_id INTEGER NOT NULL,
    
    -- Valeur vie client
    total_spent DECIMAL(10, 2) DEFAULT 0,
    subscription_months INTEGER DEFAULT 0,
    avg_monthly_spend DECIMAL(10, 2) DEFAULT 0,
    
    -- Engagement
    messages_sent INTEGER DEFAULT 0,
    content_purchased INTEGER DEFAULT 0,
    tips_count INTEGER DEFAULT 0,
    
    -- Dates importantes
    first_subscription_date DATE,
    last_activity_date DATE,
    churn_date DATE,
    
    -- Scoring
    engagement_score INTEGER DEFAULT 0, -- 0-100
    retention_risk VARCHAR(20), -- 'low', 'medium', 'high'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id, fan_id)
);

-- Table des performances de contenu
CREATE TABLE IF NOT EXISTS content_performance (
    id SERIAL PRIMARY KEY,
    content_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,
    
    -- Métriques d'engagement
    view_count INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    save_count INTEGER DEFAULT 0,
    
    -- Métriques de monétisation
    revenue_generated DECIMAL(10, 2) DEFAULT 0,
    purchases_count INTEGER DEFAULT 0,
    
    -- Métriques temporelles
    avg_view_duration_seconds INTEGER,
    peak_concurrent_viewers INTEGER,
    
    -- Analyse
    engagement_rate DECIMAL(5, 2),
    virality_score INTEGER DEFAULT 0, -- 0-100
    
    measured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_id, creator_id)
);

-- Table des benchmarks de l'industrie
CREATE TABLE IF NOT EXISTS industry_benchmarks (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    
    -- Valeurs de référence
    min_value DECIMAL(10, 2),
    avg_value DECIMAL(10, 2),
    median_value DECIMAL(10, 2),
    max_value DECIMAL(10, 2),
    percentile_25 DECIMAL(10, 2),
    percentile_75 DECIMAL(10, 2),
    
    sample_size INTEGER,
    last_updated DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, metric_name)
);

-- Table des objectifs et cibles
CREATE TABLE IF NOT EXISTS creator_goals (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    goal_type VARCHAR(50) NOT NULL, -- 'revenue', 'fans', 'engagement'
    
    target_value DECIMAL(10, 2) NOT NULL,
    current_value DECIMAL(10, 2) DEFAULT 0,
    period VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
    
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'achieved', 'failed', 'cancelled'
    achieved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des rapports personnalisés
CREATE TABLE IF NOT EXISTS custom_reports (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    report_name VARCHAR(255) NOT NULL,
    report_type VARCHAR(50), -- 'dashboard', 'export', 'scheduled'
    
    -- Configuration du rapport
    metrics TEXT[], -- Liste des métriques à inclure
    filters JSONB DEFAULT '{}',
    grouping VARCHAR(50), -- 'daily', 'weekly', 'monthly'
    visualization_type VARCHAR(50), -- 'table', 'chart', 'mixed'
    
    -- Planification
    is_scheduled BOOLEAN DEFAULT false,
    schedule_cron VARCHAR(100),
    last_generated_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des alertes KPI
CREATE TABLE IF NOT EXISTS kpi_alerts (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    alert_name VARCHAR(255) NOT NULL,
    
    -- Conditions d'alerte
    metric_type VARCHAR(100) NOT NULL,
    condition_type VARCHAR(20), -- 'above', 'below', 'equals', 'change'
    threshold_value DECIMAL(10, 2),
    comparison_period VARCHAR(20), -- 'previous_day', 'previous_week', etc.
    
    -- État
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    
    -- Notifications
    notification_channels TEXT[], -- 'email', 'sms', 'in_app'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des événements de conversion
CREATE TABLE IF NOT EXISTS conversion_events (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    fan_id INTEGER,
    
    event_type VARCHAR(50) NOT NULL, -- 'visitor_to_fan', 'free_to_paid', 'reactivation'
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Attribution
    source VARCHAR(50), -- 'organic', 'social_media', 'referral', 'campaign'
    campaign_id INTEGER,
    referrer_url TEXT,
    
    -- Valeur
    conversion_value DECIMAL(10, 2),
    
    -- Contexte
    device_type VARCHAR(20),
    browser VARCHAR(50),
    country VARCHAR(2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table de cache des calculs coûteux
CREATE TABLE IF NOT EXISTS metrics_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    creator_id INTEGER,
    
    metric_data JSONB NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    is_stale BOOLEAN DEFAULT false
);

-- Vue matérialisée pour les métriques mensuelles
CREATE MATERIALIZED VIEW monthly_creator_summary AS
SELECT 
    creator_id,
    DATE_TRUNC('month', date) as month,
    
    -- Revenus
    SUM(revenue_total) as total_revenue,
    AVG(revenue_total) as avg_daily_revenue,
    
    -- Fans
    MAX(total_fans) as end_month_fans,
    SUM(new_fans) as total_new_fans,
    SUM(churned_fans) as total_churned_fans,
    
    -- Engagement
    SUM(messages_sent + messages_received) as total_messages,
    AVG(engagement_rate) as avg_engagement_rate,
    
    -- Contenu
    SUM(posts_published) as total_posts,
    SUM(total_views) as total_views,
    
    COUNT(DISTINCT date) as active_days
FROM daily_creator_metrics
GROUP BY creator_id, DATE_TRUNC('month', date);

-- Index pour améliorer les performances
CREATE INDEX idx_daily_metrics_creator_date ON daily_creator_metrics(creator_id, date DESC);
CREATE INDEX idx_hourly_metrics_creator_timestamp ON hourly_metrics(creator_id, timestamp DESC);
CREATE INDEX idx_fan_ltv_creator ON fan_lifetime_value(creator_id);
CREATE INDEX idx_fan_ltv_value ON fan_lifetime_value(total_spent DESC);
CREATE INDEX idx_content_performance_creator ON content_performance(creator_id);
CREATE INDEX idx_creator_goals_creator_status ON creator_goals(creator_id, status);
CREATE INDEX idx_kpi_alerts_creator_active ON kpi_alerts(creator_id, is_active);
CREATE INDEX idx_conversion_events_creator_type ON conversion_events(creator_id, event_type);
CREATE INDEX idx_conversion_events_timestamp ON conversion_events(event_timestamp DESC);
CREATE INDEX idx_metrics_cache_key ON metrics_cache(cache_key);
CREATE INDEX idx_metrics_cache_expires ON metrics_cache(expires_at);

-- Fonction pour calculer le taux de rétention
CREATE OR REPLACE FUNCTION calculate_retention_rate(creator_id_param INTEGER, period_days INTEGER)
RETURNS DECIMAL(5, 2) AS $$
DECLARE
    total_fans_start INTEGER;
    retained_fans INTEGER;
BEGIN
    -- Fans au début de la période
    SELECT total_fans INTO total_fans_start
    FROM daily_creator_metrics
    WHERE creator_id = creator_id_param
        AND date = CURRENT_DATE - INTERVAL '1 day' * period_days;
    
    -- Fans toujours actifs
    SELECT COUNT(DISTINCT fan_id) INTO retained_fans
    FROM fan_lifetime_value
    WHERE creator_id = creator_id_param
        AND first_subscription_date <= CURRENT_DATE - INTERVAL '1 day' * period_days
        AND (churn_date IS NULL OR churn_date > CURRENT_DATE);
    
    IF total_fans_start = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN (retained_fans::DECIMAL / total_fans_start) * 100;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour calculer la valeur vie client moyenne
CREATE OR REPLACE FUNCTION calculate_avg_ltv(creator_id_param INTEGER)
RETURNS DECIMAL(10, 2) AS $$
BEGIN
    RETURN (
        SELECT AVG(total_spent)
        FROM fan_lifetime_value
        WHERE creator_id = creator_id_param
            AND total_spent > 0
    );
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_daily_creator_metrics_updated_at BEFORE UPDATE ON daily_creator_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fan_lifetime_value_updated_at BEFORE UPDATE ON fan_lifetime_value
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_creator_goals_updated_at BEFORE UPDATE ON creator_goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_reports_updated_at BEFORE UPDATE ON custom_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kpi_alerts_updated_at BEFORE UPDATE ON kpi_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();