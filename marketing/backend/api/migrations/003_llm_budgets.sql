-- Migration: LLM Budget System with Hard Caps
-- Comprehensive cost tracking and budget enforcement for AI agents

BEGIN;

-- LLM budget configuration per creator
CREATE TABLE llm_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- Format: YYYY-MM
  usd_limit DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  soft_limit_pct INTEGER NOT NULL DEFAULT 80, -- Alert at 80%
  hard_stop BOOLEAN NOT NULL DEFAULT true,
  model_caps JSONB NOT NULL DEFAULT '{}', -- Per-model limits
  rollover_unused BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(creator_id, month_year)
);

-- LLM usage tracking with detailed breakdown
CREATE TABLE llm_usage (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  
  -- Provider and model info
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'gemini', etc.
  model TEXT NOT NULL, -- 'gpt-4', 'claude-3-sonnet', etc.
  
  -- Token usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0, -- For providers that support caching
  
  -- Cost calculation
  input_cost_per_token DECIMAL(12,8), -- Store rate at time of use
  output_cost_per_token DECIMAL(12,8),
  total_usd_cost DECIMAL(10,6) NOT NULL,
  
  -- Context
  operation_type TEXT NOT NULL, -- 'caption_generation', 'hashtag_suggestion', 'policy_check', etc.
  request_id TEXT, -- For tracing
  workflow_id TEXT, -- Link to Temporal workflow if applicable
  
  -- Metadata
  prompt_hash TEXT, -- For deduplication/caching
  response_cached BOOLEAN DEFAULT false,
  estimated BOOLEAN DEFAULT false, -- vs actual cost from provider
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_llm_usage_creator_month ON llm_usage(creator_id, date_trunc('month', created_at));
CREATE INDEX idx_llm_usage_agent ON llm_usage(agent_id, created_at DESC);
CREATE INDEX idx_llm_usage_provider_model ON llm_usage(provider, model, created_at DESC);
CREATE INDEX idx_llm_usage_operation ON llm_usage(operation_type, created_at DESC);
CREATE INDEX idx_llm_budgets_creator_month ON llm_budgets(creator_id, month_year);

-- LLM budget reservations (short-lived locks)
CREATE TABLE llm_usage_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  estimated_usd_cost DECIMAL(10,6) NOT NULL,
  operation_type TEXT NOT NULL,
  request_id TEXT,
  reserved_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes'),
  consumed BOOLEAN DEFAULT FALSE,
  actual_usage_id BIGINT REFERENCES llm_usage(id)
);

CREATE INDEX idx_llm_reservations_creator ON llm_usage_reservations(creator_id, expires_at)
  WHERE NOT consumed;

-- LLM price table (updated regularly from provider APIs)
CREATE TABLE llm_pricing (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_cost_per_1m_tokens DECIMAL(10,6) NOT NULL,
  output_cost_per_1m_tokens DECIMAL(10,6) NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_url TEXT, -- Documentation reference
  notes TEXT,
  
  UNIQUE(provider, model, effective_date)
);

-- Insert initial pricing (from official docs as of Jan 2025)
INSERT INTO llm_pricing (provider, model, input_cost_per_1m_tokens, output_cost_per_1m_tokens, source_url) VALUES
-- OpenAI pricing (https://openai.com/api/pricing/)
('openai', 'gpt-4o', 2.50, 10.00, 'https://openai.com/api/pricing/'),
('openai', 'gpt-4o-mini', 0.15, 0.60, 'https://openai.com/api/pricing/'),
('openai', 'gpt-4-turbo', 10.00, 30.00, 'https://openai.com/api/pricing/'),
('openai', 'gpt-3.5-turbo', 0.50, 1.50, 'https://openai.com/api/pricing/'),

-- Anthropic pricing (https://docs.anthropic.com/en/docs/about-claude/pricing)
('anthropic', 'claude-3-5-sonnet-20241022', 3.00, 15.00, 'https://docs.anthropic.com/en/docs/about-claude/pricing'),
('anthropic', 'claude-3-haiku-20240307', 0.25, 1.25, 'https://docs.anthropic.com/en/docs/about-claude/pricing'),
('anthropic', 'claude-3-sonnet-20240229', 3.00, 15.00, 'https://docs.anthropic.com/en/docs/about-claude/pricing'),

-- Add more providers as needed
('gemini', 'gemini-1.5-pro', 1.25, 5.00, 'https://ai.google.dev/pricing'),
('gemini', 'gemini-1.5-flash', 0.075, 0.30, 'https://ai.google.dev/pricing');

-- Materialized view for monthly usage summary (refreshed hourly)
CREATE MATERIALIZED VIEW v_llm_usage_monthly AS
SELECT 
  creator_id,
  date_trunc('month', created_at) as month,
  provider,
  model,
  operation_type,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_usd_cost) as total_usd_cost,
  AVG(total_usd_cost) as avg_cost_per_request,
  COUNT(CASE WHEN response_cached THEN 1 END) as cached_responses,
  MIN(created_at) as first_request,
  MAX(created_at) as last_request
FROM llm_usage
GROUP BY creator_id, date_trunc('month', created_at), provider, model, operation_type;

CREATE UNIQUE INDEX idx_llm_monthly_summary 
  ON v_llm_usage_monthly(creator_id, month, provider, model, operation_type);

-- Function to get current budget status
CREATE OR REPLACE FUNCTION get_llm_budget_status(
  p_creator_id UUID,
  p_month_year TEXT DEFAULT NULL
) RETURNS TABLE(
  budget_limit DECIMAL(10,2),
  current_usage DECIMAL(10,6),
  reserved_amount DECIMAL(10,6),
  available_budget DECIMAL(10,6),
  usage_percentage DECIMAL(5,2),
  soft_limit_reached BOOLEAN,
  hard_limit_reached BOOLEAN,
  top_models JSONB
) AS $$
DECLARE
  current_month TEXT;
  budget_row llm_budgets%ROWTYPE;
  usage_amount DECIMAL(10,6);
  reserved_amount DECIMAL(10,6);
BEGIN
  -- Default to current month
  current_month := COALESCE(p_month_year, to_char(NOW(), 'YYYY-MM'));
  
  -- Get budget
  SELECT * INTO budget_row
  FROM llm_budgets 
  WHERE creator_id = p_creator_id AND month_year = current_month;
  
  -- Create default budget if none exists
  IF NOT FOUND THEN
    INSERT INTO llm_budgets (creator_id, month_year, usd_limit)
    VALUES (p_creator_id, current_month, 100.00)
    RETURNING * INTO budget_row;
  END IF;
  
  -- Calculate current usage
  SELECT COALESCE(SUM(total_usd_cost), 0) INTO usage_amount
  FROM llm_usage
  WHERE creator_id = p_creator_id 
    AND date_trunc('month', created_at) = (current_month || '-01')::DATE;
  
  -- Calculate active reservations
  SELECT COALESCE(SUM(estimated_usd_cost), 0) INTO reserved_amount
  FROM llm_usage_reservations
  WHERE creator_id = p_creator_id
    AND expires_at > NOW()
    AND NOT consumed;
  
  -- Return status
  RETURN QUERY SELECT
    budget_row.usd_limit as budget_limit,
    usage_amount as current_usage,
    reserved_amount,
    GREATEST(0, budget_row.usd_limit - usage_amount - reserved_amount) as available_budget,
    ROUND((usage_amount / budget_row.usd_limit * 100), 2) as usage_percentage,
    (usage_amount >= budget_row.usd_limit * budget_row.soft_limit_pct / 100.0) as soft_limit_reached,
    (budget_row.hard_stop AND (usage_amount + reserved_amount) >= budget_row.usd_limit) as hard_limit_reached,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'model', provider || '/' || model,
          'cost', total_cost,
          'requests', request_count
        )
      )
      FROM (
        SELECT 
          provider, model,
          SUM(total_usd_cost) as total_cost,
          COUNT(*) as request_count
        FROM llm_usage
        WHERE creator_id = p_creator_id 
          AND date_trunc('month', created_at) = (current_month || '-01')::DATE
        GROUP BY provider, model
        ORDER BY total_cost DESC
        LIMIT 5
      ) top_usage
    ) as top_models;
END;
$$ LANGUAGE plpgsql;

-- Function to estimate cost for a request
CREATE OR REPLACE FUNCTION estimate_llm_cost(
  p_provider TEXT,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER DEFAULT 0
) RETURNS DECIMAL(10,6) AS $$
DECLARE
  pricing_row llm_pricing%ROWTYPE;
  input_cost DECIMAL(10,6);
  output_cost DECIMAL(10,6);
BEGIN
  -- Get latest pricing
  SELECT * INTO pricing_row
  FROM llm_pricing
  WHERE provider = p_provider AND model = p_model
  ORDER BY effective_date DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- Default fallback pricing
    input_cost := p_input_tokens * 0.000005; -- $5 per 1M tokens
    output_cost := p_output_tokens * 0.000015; -- $15 per 1M tokens
  ELSE
    input_cost := p_input_tokens * (pricing_row.input_cost_per_1m_tokens / 1000000.0);
    output_cost := p_output_tokens * (pricing_row.output_cost_per_1m_tokens / 1000000.0);
  END IF;
  
  RETURN input_cost + output_cost;
END;
$$ LANGUAGE plpgsql;

-- Function to reserve budget
CREATE OR REPLACE FUNCTION reserve_llm_budget(
  p_creator_id UUID,
  p_estimated_cost DECIMAL(10,6),
  p_operation_type TEXT,
  p_request_id TEXT DEFAULT NULL
) RETURNS TABLE(
  reservation_id UUID,
  approved BOOLEAN,
  reason TEXT,
  budget_status JSONB
) AS $$
DECLARE
  reservation_uuid UUID;
  budget_status_row RECORD;
  hard_limit_reached BOOLEAN;
BEGIN
  -- Get current budget status
  SELECT * INTO budget_status_row
  FROM get_llm_budget_status(p_creator_id);
  
  hard_limit_reached := budget_status_row.hard_limit_reached OR 
                       (budget_status_row.available_budget < p_estimated_cost);
  
  IF hard_limit_reached THEN
    RETURN QUERY SELECT
      NULL::UUID as reservation_id,
      FALSE as approved,
      'Budget exceeded or insufficient funds' as reason,
      row_to_json(budget_status_row)::JSONB as budget_status;
    RETURN;
  END IF;
  
  -- Create reservation
  reservation_uuid := uuid_generate_v4();
  INSERT INTO llm_usage_reservations (
    id, creator_id, estimated_usd_cost, operation_type, request_id
  ) VALUES (
    reservation_uuid, p_creator_id, p_estimated_cost, p_operation_type, p_request_id
  );
  
  RETURN QUERY SELECT
    reservation_uuid as reservation_id,
    TRUE as approved,
    'Budget reserved successfully' as reason,
    row_to_json(budget_status_row)::JSONB as budget_status;
END;
$$ LANGUAGE plpgsql;

-- Function to consume reservation (after actual API call)
CREATE OR REPLACE FUNCTION consume_llm_reservation(
  p_reservation_id UUID,
  p_actual_usage_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE llm_usage_reservations
  SET consumed = TRUE, actual_usage_id = p_actual_usage_id
  WHERE id = p_reservation_id AND NOT consumed;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for expired reservations
CREATE OR REPLACE FUNCTION cleanup_expired_llm_reservations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM llm_usage_reservations
  WHERE expires_at < NOW() AND NOT consumed;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Budget alerts table
CREATE TABLE llm_budget_alerts (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'soft_limit', 'hard_limit', 'overage'
  month_year TEXT NOT NULL,
  current_usage DECIMAL(10,6),
  budget_limit DECIMAL(10,2),
  threshold_pct INTEGER,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  webhook_sent BOOLEAN DEFAULT FALSE,
  webhook_url TEXT,
  webhook_response JSONB
);

CREATE INDEX idx_llm_alerts_creator ON llm_budget_alerts(creator_id, triggered_at DESC);
CREATE INDEX idx_llm_alerts_pending_webhook ON llm_budget_alerts(webhook_sent, triggered_at)
  WHERE NOT webhook_sent;

-- Trigger function to check budget and send alerts
CREATE OR REPLACE FUNCTION check_llm_budget_alerts()
RETURNS TRIGGER AS $$
DECLARE
  budget_status_row RECORD;
  month_str TEXT;
BEGIN
  month_str := to_char(NEW.created_at, 'YYYY-MM');
  
  -- Get budget status after this usage
  SELECT * INTO budget_status_row
  FROM get_llm_budget_status(NEW.creator_id, month_str);
  
  -- Check soft limit
  IF budget_status_row.soft_limit_reached AND 
     NOT EXISTS (
       SELECT 1 FROM llm_budget_alerts 
       WHERE creator_id = NEW.creator_id 
         AND month_year = month_str 
         AND alert_type = 'soft_limit'
     ) THEN
    
    INSERT INTO llm_budget_alerts (
      creator_id, alert_type, month_year, current_usage, 
      budget_limit, threshold_pct
    ) VALUES (
      NEW.creator_id, 'soft_limit', month_str,
      budget_status_row.current_usage, budget_status_row.budget_limit, 80
    );
  END IF;
  
  -- Check hard limit
  IF budget_status_row.hard_limit_reached AND 
     NOT EXISTS (
       SELECT 1 FROM llm_budget_alerts 
       WHERE creator_id = NEW.creator_id 
         AND month_year = month_str 
         AND alert_type = 'hard_limit'
     ) THEN
    
    INSERT INTO llm_budget_alerts (
      creator_id, alert_type, month_year, current_usage, 
      budget_limit, threshold_pct
    ) VALUES (
      NEW.creator_id, 'hard_limit', month_str,
      budget_status_row.current_usage, budget_status_row.budget_limit, 100
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_llm_budget_alerts
  AFTER INSERT ON llm_usage
  FOR EACH ROW
  EXECUTE FUNCTION check_llm_budget_alerts();

-- Auto-refresh materialized view (requires pg_cron extension)
-- SELECT cron.schedule('refresh-llm-usage-monthly', '0 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY v_llm_usage_monthly;');

-- Default budgets for existing creators
INSERT INTO llm_budgets (creator_id, month_year, usd_limit)
SELECT 
  id, 
  to_char(NOW(), 'YYYY-MM'),
  100.00 -- Default $100/month
FROM creators
WHERE NOT EXISTS (
  SELECT 1 FROM llm_budgets lb 
  WHERE lb.creator_id = creators.id 
    AND lb.month_year = to_char(NOW(), 'YYYY-MM')
);

COMMIT;

-- Post-migration queries for verification:
/*
-- Check budget status for all creators
SELECT c.display_name, b.* 
FROM get_llm_budget_status(c.id) b
JOIN creators c ON true
ORDER BY current_usage DESC;

-- View pricing table
SELECT * FROM llm_pricing ORDER BY provider, model, effective_date DESC;

-- Test cost estimation
SELECT estimate_llm_cost('openai', 'gpt-4o', 1000, 500);

-- Test budget reservation
SELECT * FROM reserve_llm_budget(
  'your-creator-id'::uuid, 
  0.05, 
  'caption_generation', 
  'test-request-123'
);
*/