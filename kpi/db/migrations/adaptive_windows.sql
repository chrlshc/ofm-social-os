-- Migration pour les fenêtres adaptatives et benchmarks intelligents
-- À exécuter sur la base de données PostgreSQL

-- Table pour stocker les configurations de fenêtres adaptatives
CREATE TABLE IF NOT EXISTS kpi_adaptive_windows (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    default_window INTEGER NOT NULL, -- en heures
    min_window INTEGER NOT NULL,
    max_window INTEGER NOT NULL,
    adaptive_enabled BOOLEAN DEFAULT true,
    confidence DECIMAL(3,2) DEFAULT 0.5,
    last_calculated TIMESTAMP DEFAULT NOW(),
    variability_profile JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT uk_adaptive_windows_model_metric UNIQUE (model_name, metric_name),
    CONSTRAINT chk_window_range CHECK (min_window <= default_window AND default_window <= max_window),
    CONSTRAINT chk_confidence_range CHECK (confidence >= 0 AND confidence <= 1)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_adaptive_windows_model ON kpi_adaptive_windows (model_name);
CREATE INDEX IF NOT EXISTS idx_adaptive_windows_metric ON kpi_adaptive_windows (metric_name);
CREATE INDEX IF NOT EXISTS idx_adaptive_windows_enabled ON kpi_adaptive_windows (adaptive_enabled);
CREATE INDEX IF NOT EXISTS idx_adaptive_windows_last_calc ON kpi_adaptive_windows (last_calculated);

-- Table pour l'historique des ajustements de fenêtres
CREATE TABLE IF NOT EXISTS kpi_window_adjustments (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    old_window INTEGER NOT NULL,
    new_window INTEGER NOT NULL,
    adjustment_reason TEXT,
    confidence DECIMAL(3,2),
    applied_by VARCHAR(20) NOT NULL, -- 'automatic' ou 'manual'
    applied_at TIMESTAMP DEFAULT NOW(),
    impact_level VARCHAR(10), -- 'low', 'medium', 'high'
    
    CONSTRAINT chk_adjustment_applied_by CHECK (applied_by IN ('automatic', 'manual')),
    CONSTRAINT chk_adjustment_impact CHECK (impact_level IN ('low', 'medium', 'high'))
);

-- Index pour l'historique
CREATE INDEX IF NOT EXISTS idx_window_adjustments_model_metric ON kpi_window_adjustments (model_name, metric_name);
CREATE INDEX IF NOT EXISTS idx_window_adjustments_applied_at ON kpi_window_adjustments (applied_at);
CREATE INDEX IF NOT EXISTS idx_window_adjustments_applied_by ON kpi_window_adjustments (applied_by);

-- Table pour stocker les profils de variabilité calculés
CREATE TABLE IF NOT EXISTS kpi_variability_profiles (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    analysis_period INTEGER NOT NULL, -- en jours
    sample_size INTEGER NOT NULL,
    mean_interval DECIMAL(10,2), -- en minutes
    coefficient_of_variation DECIMAL(6,4),
    data_frequency DECIMAL(6,2), -- points par heure
    seasonality_strength DECIMAL(4,3),
    trend_strength DECIMAL(6,4),
    optimal_window INTEGER, -- en heures
    confidence DECIMAL(3,2),
    analysis_timestamp TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT uk_variability_profiles UNIQUE (model_name, metric_name, analysis_timestamp),
    CONSTRAINT chk_variability_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Index pour les profils de variabilité
CREATE INDEX IF NOT EXISTS idx_variability_profiles_model_metric ON kpi_variability_profiles (model_name, metric_name);
CREATE INDEX IF NOT EXISTS idx_variability_profiles_timestamp ON kpi_variability_profiles (analysis_timestamp);

-- Table pour les benchmarks contextuels
CREATE TABLE IF NOT EXISTS kpi_contextual_benchmarks (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    model_name VARCHAR(50) NOT NULL,
    benchmark_timestamp TIMESTAMP DEFAULT NOW(),
    time_window VARCHAR(20) NOT NULL,
    context_filters JSONB, -- platform, timeOfDay, dayOfWeek, etc.
    average_value DECIMAL(12,4) NOT NULL,
    z_score DECIMAL(6,3),
    rank_position INTEGER,
    sample_size INTEGER NOT NULL,
    data_quality DECIMAL(3,2),
    adaptive_window BOOLEAN DEFAULT false,
    
    CONSTRAINT chk_contextual_benchmarks_quality CHECK (data_quality >= 0 AND data_quality <= 1)
);

-- Index pour les benchmarks contextuels
CREATE INDEX IF NOT EXISTS idx_contextual_benchmarks_metric ON kpi_contextual_benchmarks (metric_name);
CREATE INDEX IF NOT EXISTS idx_contextual_benchmarks_model ON kpi_contextual_benchmarks (model_name);
CREATE INDEX IF NOT EXISTS idx_contextual_benchmarks_timestamp ON kpi_contextual_benchmarks (benchmark_timestamp);
CREATE INDEX IF NOT EXISTS idx_contextual_benchmarks_context ON kpi_contextual_benchmarks USING GIN (context_filters);

-- Table pour les opportunités d'apprentissage intelligentes
CREATE TABLE IF NOT EXISTS kpi_smart_opportunities (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    target_model VARCHAR(50) NOT NULL,
    source_model VARCHAR(50) NOT NULL,
    potential_gain DECIMAL(6,2) NOT NULL, -- en pourcentage
    base_confidence DECIMAL(3,2) NOT NULL,
    context_match DECIMAL(3,2) NOT NULL,
    time_relevance DECIMAL(3,2) NOT NULL,
    adaptive_confidence DECIMAL(3,2) NOT NULL,
    priority VARCHAR(10) NOT NULL,
    estimated_impact TEXT,
    implementation_timeframe VARCHAR(50),
    dependencies JSONB,
    suggestion TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'dismissed'
    
    CONSTRAINT chk_smart_opportunities_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT chk_smart_opportunities_status CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed')),
    CONSTRAINT chk_smart_opportunities_confidence CHECK (
        base_confidence >= 0 AND base_confidence <= 1 AND
        context_match >= 0 AND context_match <= 1 AND
        time_relevance >= 0 AND time_relevance <= 1 AND
        adaptive_confidence >= 0 AND adaptive_confidence <= 1
    )
);

-- Index pour les opportunités intelligentes
CREATE INDEX IF NOT EXISTS idx_smart_opportunities_target ON kpi_smart_opportunities (target_model);
CREATE INDEX IF NOT EXISTS idx_smart_opportunities_metric ON kpi_smart_opportunities (metric_name);
CREATE INDEX IF NOT EXISTS idx_smart_opportunities_priority ON kpi_smart_opportunities (priority);
CREATE INDEX IF NOT EXISTS idx_smart_opportunities_status ON kpi_smart_opportunities (status);
CREATE INDEX IF NOT EXISTS idx_smart_opportunities_created ON kpi_smart_opportunities (created_at);

-- Table pour l'audit des analyses adaptatives
CREATE TABLE IF NOT EXISTS kpi_adaptive_audit (
    id SERIAL PRIMARY KEY,
    operation_type VARCHAR(50) NOT NULL, -- 'window_analysis', 'benchmark_calculation', 'opportunity_detection'
    model_name VARCHAR(50),
    metric_name VARCHAR(100),
    operation_params JSONB,
    execution_time INTEGER, -- en millisecondes
    success BOOLEAN NOT NULL,
    error_message TEXT,
    results_summary JSONB,
    executed_at TIMESTAMP DEFAULT NOW(),
    executed_by VARCHAR(50) -- 'system', 'user_id', etc.
);

-- Index pour l'audit
CREATE INDEX IF NOT EXISTS idx_adaptive_audit_operation ON kpi_adaptive_audit (operation_type);
CREATE INDEX IF NOT EXISTS idx_adaptive_audit_model_metric ON kpi_adaptive_audit (model_name, metric_name);
CREATE INDEX IF NOT EXISTS idx_adaptive_audit_executed_at ON kpi_adaptive_audit (executed_at);
CREATE INDEX IF NOT EXISTS idx_adaptive_audit_success ON kpi_adaptive_audit (success);

-- Vue pour les métriques de performance des fenêtres adaptatives
CREATE OR REPLACE VIEW vw_adaptive_windows_performance AS
SELECT 
    aw.model_name,
    aw.metric_name,
    aw.default_window,
    aw.confidence,
    aw.adaptive_enabled,
    vp.coefficient_of_variation,
    vp.data_frequency,
    vp.optimal_window,
    vp.analysis_timestamp as last_analysis,
    CASE 
        WHEN aw.confidence >= 0.8 THEN 'High'
        WHEN aw.confidence >= 0.6 THEN 'Medium'
        ELSE 'Low'
    END as confidence_level,
    CASE
        WHEN vp.coefficient_of_variation < 0.2 THEN 'Very Stable'
        WHEN vp.coefficient_of_variation < 0.5 THEN 'Stable'
        WHEN vp.coefficient_of_variation < 1.0 THEN 'Moderate'
        ELSE 'Highly Variable'
    END as stability_level
FROM kpi_adaptive_windows aw
LEFT JOIN LATERAL (
    SELECT *
    FROM kpi_variability_profiles vp
    WHERE vp.model_name = aw.model_name 
      AND vp.metric_name = aw.metric_name
    ORDER BY vp.analysis_timestamp DESC
    LIMIT 1
) vp ON true;

-- Vue pour le tableau de bord des opportunités
CREATE OR REPLACE VIEW vw_opportunities_dashboard AS
SELECT 
    so.metric_name,
    so.target_model,
    so.source_model,
    so.potential_gain,
    so.adaptive_confidence,
    so.priority,
    so.status,
    so.created_at,
    EXTRACT(DAYS FROM NOW() - so.created_at) as days_pending,
    CASE 
        WHEN so.status = 'pending' AND so.priority IN ('high', 'critical') AND EXTRACT(DAYS FROM NOW() - so.created_at) > 7 THEN true
        ELSE false
    END as needs_attention
FROM kpi_smart_opportunities so
WHERE so.status IN ('pending', 'in_progress')
ORDER BY 
    CASE so.priority 
        WHEN 'critical' THEN 4
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        ELSE 1
    END DESC,
    so.adaptive_confidence DESC,
    so.created_at ASC;

-- Fonction pour calculer automatiquement les statistiques de performance
CREATE OR REPLACE FUNCTION calculate_adaptive_window_stats()
RETURNS TABLE (
    total_metrics INTEGER,
    adaptive_enabled INTEGER,
    high_confidence INTEGER,
    avg_confidence DECIMAL(4,3),
    pending_opportunities INTEGER,
    critical_opportunities INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_metrics,
        COUNT(*) FILTER (WHERE adaptive_enabled = true)::INTEGER as adaptive_enabled,
        COUNT(*) FILTER (WHERE confidence >= 0.8)::INTEGER as high_confidence,
        AVG(confidence)::DECIMAL(4,3) as avg_confidence,
        (SELECT COUNT(*)::INTEGER FROM kpi_smart_opportunities WHERE status = 'pending') as pending_opportunities,
        (SELECT COUNT(*)::INTEGER FROM kpi_smart_opportunities WHERE status = 'pending' AND priority = 'critical') as critical_opportunities
    FROM kpi_adaptive_windows;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_adaptive_windows_updated_at
    BEFORE UPDATE ON kpi_adaptive_windows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insertion des données par défaut pour les configurations de fenêtres
INSERT INTO kpi_adaptive_windows (model_name, metric_name, default_window, min_window, max_window) VALUES
-- Marketing metrics
('marketing', 'ctr', 6, 1, 24),
('marketing', 'cpl', 12, 2, 48),
('marketing', 'engagement_rate', 4, 1, 12),
('marketing', 'reach', 24, 6, 72),
('marketing', 'conversion_rate', 12, 4, 48),

-- Payment metrics  
('payment', 'conversion_rate', 24, 6, 168),
('payment', 'payment_success', 12, 2, 72),
('payment', 'churn_rate', 168, 24, 720),
('payment', 'arpu', 168, 24, 720),
('payment', 'ltv', 720, 168, 2160),

-- Onboarding metrics
('onboarding', 'completion_rate', 48, 12, 168),
('onboarding', 'retention_rate', 168, 24, 720),
('onboarding', 'activation_rate', 24, 6, 168),
('onboarding', 'drop_off_rate', 24, 6, 168)

ON CONFLICT (model_name, metric_name) DO NOTHING;

-- Commenter les performances
COMMENT ON TABLE kpi_adaptive_windows IS 'Configuration des fenêtres temporelles adaptatives pour chaque métrique';
COMMENT ON TABLE kpi_window_adjustments IS 'Historique des ajustements de fenêtres temporelles';
COMMENT ON TABLE kpi_variability_profiles IS 'Profils de variabilité calculés pour optimiser les fenêtres';
COMMENT ON TABLE kpi_contextual_benchmarks IS 'Benchmarks calculés avec contexte et fenêtres adaptatives';
COMMENT ON TABLE kpi_smart_opportunities IS 'Opportunités d''apprentissage intelligentes entre modèles';
COMMENT ON TABLE kpi_adaptive_audit IS 'Audit des opérations d''analyse adaptative';

COMMENT ON COLUMN kpi_adaptive_windows.variability_profile IS 'Profil de variabilité stocké en JSON pour cette métrique';
COMMENT ON COLUMN kpi_contextual_benchmarks.context_filters IS 'Filtres contextuels appliqués (platform, timeOfDay, etc.)';
COMMENT ON COLUMN kpi_smart_opportunities.dependencies IS 'Liste des dépendances pour implémenter l''opportunité';