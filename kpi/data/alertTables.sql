-- Tables pour la gestion des alertes personnalisées

-- Table des règles d'alerte configurables
CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  comparison TEXT CHECK (comparison IN ('lt', 'gt', 'eq', 'lte', 'gte')) NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')) NOT NULL,
  message TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX idx_alert_rules_model_name ON alert_rules(model_name);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX idx_alert_rules_severity ON alert_rules(severity);

-- Table des canaux de notification
CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT CHECK (type IN ('email', 'slack', 'webhook', 'teams', 'discord')) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  config JSONB NOT NULL, -- Configuration spécifique au type (webhooks, tokens, etc.)
  severity_filter TEXT[] DEFAULT NULL, -- Filtrer par sévérité ['warning', 'critical']
  model_filter TEXT[] DEFAULT NULL, -- Filtrer par modèle ['marketing', 'onboarding']
  schedule JSONB DEFAULT NULL, -- Horaires, quiet hours, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table de liaison entre règles et canaux
CREATE TABLE IF NOT EXISTS channel_rules (
  id SERIAL PRIMARY KEY,
  channel_id TEXT REFERENCES notification_channels(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES alert_rules(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(channel_id, rule_id)
);

-- Table des templates de message
CREATE TABLE IF NOT EXISTS alert_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variables JSONB DEFAULT '{}', -- Variables disponibles dans le template
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table de l'historique des notifications envoyées
CREATE TABLE IF NOT EXISTS notification_history (
  id SERIAL PRIMARY KEY,
  channel_id TEXT REFERENCES notification_channels(id),
  rule_id TEXT REFERENCES alert_rules(id),
  insight_id INTEGER REFERENCES kpi_insights(id),
  status TEXT CHECK (status IN ('sent', 'failed', 'skipped')) NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Index pour l'historique
CREATE INDEX idx_notification_history_sent_at ON notification_history(sent_at);
CREATE INDEX idx_notification_history_status ON notification_history(status);
CREATE INDEX idx_notification_history_channel_id ON notification_history(channel_id);

-- Table des préférences utilisateur pour les alertes
CREATE TABLE IF NOT EXISTS user_alert_preferences (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL, -- À lier avec votre système d'auth
  model_name TEXT,
  channel_preferences JSONB DEFAULT '{}', -- Préférences par canal
  quiet_hours JSONB DEFAULT NULL, -- Heures de silence personnalisées
  digest_frequency TEXT CHECK (digest_frequency IN ('never', 'hourly', 'daily', 'weekly')) DEFAULT 'daily',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, model_name)
);

-- Fonctions utilitaires

-- Fonction pour calculer si on est dans les heures de silence
CREATE OR REPLACE FUNCTION is_quiet_hours(
  schedule_config JSONB,
  check_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS BOOLEAN AS $$
DECLARE
  quiet_start TIME;
  quiet_end TIME;
  current_time TIME;
  current_day TEXT;
  allowed_days TEXT[];
BEGIN
  -- Vérifier s'il y a une configuration de planning
  IF schedule_config IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Extraire les heures de silence
  quiet_start := (schedule_config->>'quiet_hours'->>'start')::TIME;
  quiet_end := (schedule_config->>'quiet_hours'->>'end')::TIME;
  
  -- Si pas d'heures de silence configurées
  IF quiet_start IS NULL OR quiet_end IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Convertir l'heure actuelle
  current_time := check_time::TIME;
  current_day := LOWER(TO_CHAR(check_time, 'Day'));
  
  -- Vérifier les jours autorisés
  allowed_days := ARRAY(SELECT jsonb_array_elements_text(schedule_config->'days'));
  IF allowed_days IS NOT NULL AND NOT (current_day = ANY(allowed_days)) THEN
    RETURN TRUE; -- Pas un jour autorisé = quiet hours
  END IF;
  
  -- Vérifier si on est dans les heures de silence
  IF quiet_start <= quiet_end THEN
    -- Cas normal (ex: 22:00 à 08:00 le jour suivant)
    RETURN current_time >= quiet_start AND current_time <= quiet_end;
  ELSE
    -- Cas qui traverse minuit
    RETURN current_time >= quiet_start OR current_time <= quiet_end;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour formater un message d'alerte
CREATE OR REPLACE FUNCTION format_alert_message(
  template_text TEXT,
  rule_data JSONB,
  trigger_data JSONB
) RETURNS TEXT AS $$
DECLARE
  formatted_message TEXT;
BEGIN
  formatted_message := template_text;
  
  -- Remplacer les variables communes
  formatted_message := REPLACE(formatted_message, '{{rule.name}}', rule_data->>'name');
  formatted_message := REPLACE(formatted_message, '{{rule.severity}}', rule_data->>'severity');
  formatted_message := REPLACE(formatted_message, '{{rule.message}}', rule_data->>'message');
  formatted_message := REPLACE(formatted_message, '{{rule.threshold}}', rule_data->>'threshold');
  formatted_message := REPLACE(formatted_message, '{{model.name}}', rule_data->>'modelName');
  formatted_message := REPLACE(formatted_message, '{{metric.name}}', rule_data->>'metricName');
  
  -- Variables du trigger
  formatted_message := REPLACE(formatted_message, '{{trigger.value}}', trigger_data->>'currentValue');
  formatted_message := REPLACE(formatted_message, '{{trigger.timestamp}}', trigger_data->>'triggeredAt');
  
  RETURN formatted_message;
END;
$$ LANGUAGE plpgsql;

-- Vue pour les statistiques des règles
CREATE OR REPLACE VIEW alert_rules_stats AS
SELECT 
  r.id,
  r.name,
  r.model_name,
  r.metric_name,
  r.severity,
  r.enabled,
  COUNT(i.id) as total_triggers,
  COUNT(CASE WHEN i.created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as triggers_24h,
  COUNT(CASE WHEN i.created_at > NOW() - INTERVAL '7 days' THEN 1 END) as triggers_7d,
  MAX(i.created_at) as last_triggered,
  AVG(CASE WHEN i.metadata->>'triggered' = 'true' THEN 1 ELSE 0 END) as trigger_rate
FROM alert_rules r
LEFT JOIN kpi_insights i ON i.metadata->>'ruleId' = r.id
GROUP BY r.id, r.name, r.model_name, r.metric_name, r.severity, r.enabled;

-- Insérer quelques templates par défaut
INSERT INTO alert_templates (id, name, channel_type, subject_template, body_template, variables) VALUES
('email_basic', 'Email Basic Alert', 'email', 'Alerte {{rule.severity}} - {{model.name}}', 
 'Une alerte {{rule.severity}} a été déclenchée pour le modèle {{model.name}}.

Règle: {{rule.name}}
Métrique: {{metric.name}}
Valeur actuelle: {{trigger.value}}
Seuil configuré: {{rule.threshold}}
Message: {{rule.message}}

Déclenché le: {{trigger.timestamp}}',
 '{"rule": ["name", "severity", "message", "threshold"], "model": ["name"], "metric": ["name"], "trigger": ["value", "timestamp"]}'
),

('slack_card', 'Slack Card Alert', 'slack', null,
 '{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Alerte {{rule.severity}}* - {{model.name}}\n{{rule.message}}"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Métrique:*\n{{metric.name}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Valeur:*\n{{trigger.value}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Seuil:*\n{{rule.threshold}}"
        },
        {
          "type": "mrkdwn",
          "text": "*Déclenché:*\n{{trigger.timestamp}}"
        }
      ]
    }
  ]
}',
 '{"rule": ["name", "severity", "message", "threshold"], "model": ["name"], "metric": ["name"], "trigger": ["value", "timestamp"]}'
),

('webhook_json', 'Webhook JSON Alert', 'webhook', null,
 '{
  "alert": {
    "rule": "{{rule.name}}",
    "severity": "{{rule.severity}}",
    "model": "{{model.name}}",
    "metric": "{{metric.name}}",
    "threshold": {{rule.threshold}},
    "currentValue": {{trigger.value}},
    "message": "{{rule.message}}",
    "timestamp": "{{trigger.timestamp}}"
  }
}',
 '{"rule": ["name", "severity", "message", "threshold"], "model": ["name"], "metric": ["name"], "trigger": ["value", "timestamp"]}'
)

ON CONFLICT (id) DO NOTHING;