-- Table de stockage des métriques brutes
CREATE TABLE IF NOT EXISTS kpi_metrics (
  id SERIAL PRIMARY KEY,
  model_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  platform TEXT,
  campaign_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour optimiser les requêtes
CREATE INDEX idx_kpi_metrics_model_name ON kpi_metrics(model_name);
CREATE INDEX idx_kpi_metrics_metric_name ON kpi_metrics(metric_name);
CREATE INDEX idx_kpi_metrics_created_at ON kpi_metrics(created_at);
CREATE INDEX idx_kpi_metrics_platform ON kpi_metrics(platform);

-- Table des insights générés par les modèles
CREATE TABLE IF NOT EXISTS kpi_insights (
  id SERIAL PRIMARY KEY,
  model_name TEXT NOT NULL,
  insight TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les insights
CREATE INDEX idx_kpi_insights_model_name ON kpi_insights(model_name);
CREATE INDEX idx_kpi_insights_created_at ON kpi_insights(created_at);

-- Table pour stocker les recommandations IA
CREATE TABLE IF NOT EXISTS kpi_recommendations (
  id SERIAL PRIMARY KEY,
  model_name TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT CHECK (status IN ('pending', 'applied', 'rejected')) DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table pour le cross-learning entre modèles
CREATE TABLE IF NOT EXISTS kpi_model_learnings (
  id SERIAL PRIMARY KEY,
  source_model TEXT NOT NULL,
  target_model TEXT NOT NULL,
  learning TEXT NOT NULL,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vue pour les métriques agrégées
CREATE OR REPLACE VIEW kpi_metrics_aggregated AS
SELECT 
  model_name,
  metric_name,
  platform,
  DATE_TRUNC('hour', created_at) as hour,
  AVG(value) as avg_value,
  MIN(value) as min_value,
  MAX(value) as max_value,
  COUNT(*) as count,
  STDDEV(value) as stddev_value
FROM kpi_metrics
GROUP BY model_name, metric_name, platform, DATE_TRUNC('hour', created_at);