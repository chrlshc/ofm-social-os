-- Bootstrap runtime tables and columns
-- This migration adds missing columns and tables referenced by the application

BEGIN;

-- Add missing columns to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS variant_id UUID NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Add index for content hash lookups (idempotency)
CREATE INDEX IF NOT EXISTS idx_posts_content_hash 
ON posts(account_id, content_hash, published_at DESC);

-- Add index for workflow tracking
CREATE INDEX IF NOT EXISTS idx_posts_workflow_id 
ON posts(workflow_id) WHERE workflow_id IS NOT NULL;

-- DM history table for Instagram private replies
CREATE TABLE IF NOT EXISTS dm_history (
  id BIGSERIAL PRIMARY KEY,
  trigger_id UUID,
  post_id UUID REFERENCES posts(id),
  comment_id TEXT NOT NULL,
  recipient_username TEXT,
  message_sent TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'x', 'reddit')),
  response_data JSONB,
  account_id UUID NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for DM lookups
CREATE INDEX IF NOT EXISTS idx_dm_history_account_platform 
ON dm_history(account_id, platform, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_history_post_id 
ON dm_history(post_id) WHERE post_id IS NOT NULL;

-- LLM pricing table for cost calculation
CREATE TABLE IF NOT EXISTS llm_pricing (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'custom')),
  model TEXT NOT NULL,
  input_cost_per_1m_tokens NUMERIC(10,6) NOT NULL,
  output_cost_per_1m_tokens NUMERIC(10,6) NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, model, effective_date)
);

-- Seed basic pricing data
INSERT INTO llm_pricing (provider, model, input_cost_per_1m_tokens, output_cost_per_1m_tokens) 
VALUES 
  ('openai', 'gpt-4', 30.0, 60.0),
  ('openai', 'gpt-4-turbo', 10.0, 30.0),
  ('openai', 'gpt-3.5-turbo', 0.5, 1.5),
  ('anthropic', 'claude-3-opus', 15.0, 75.0),
  ('anthropic', 'claude-3-sonnet', 3.0, 15.0),
  ('anthropic', 'claude-3-haiku', 0.25, 1.25)
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- LLM budgets table (enhanced from existing)
CREATE TABLE IF NOT EXISTS llm_budgets (
  creator_id UUID NOT NULL,
  month TEXT NOT NULL, -- YYYY-MM format
  usd_limit NUMERIC(10,2) NOT NULL CHECK (usd_limit > 0),
  soft_pct INT DEFAULT 80 CHECK (soft_pct BETWEEN 1 AND 100),
  hard_stop BOOLEAN DEFAULT true,
  model_caps JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (creator_id, month)
);

-- LLM usage tracking
CREATE TABLE IF NOT EXISTS llm_usage (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL,
  agent_id UUID,
  post_id UUID REFERENCES posts(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens BIGINT DEFAULT 0,
  output_tokens BIGINT DEFAULT 0,
  cached_tokens BIGINT DEFAULT 0,
  total_cost NUMERIC(10,6) NOT NULL,
  operation_type TEXT, -- 'content_generation', 'repurpose', 'analytics', etc
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for LLM usage analytics
CREATE INDEX IF NOT EXISTS idx_llm_usage_creator_month 
ON llm_usage(creator_id, date_trunc('month', created_at));

CREATE INDEX IF NOT EXISTS idx_llm_usage_provider_model 
ON llm_usage(provider, model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_post_id 
ON llm_usage(post_id) WHERE post_id IS NOT NULL;

-- Rate limiting tracking table
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'x', 'reddit')),
  account_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_duration INTERVAL NOT NULL,
  requests_count INT DEFAULT 0,
  requests_limit INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, account_id, window_start)
);

-- Index for rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_platform_account_window 
ON rate_limits(platform, account_id, window_start DESC);

-- Webhook events table for audit
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  verified BOOLEAN DEFAULT false,
  processed BOOLEAN DEFAULT false,
  account_id UUID,
  post_id UUID REFERENCES posts(id),
  processing_error TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Index for webhook processing
CREATE INDEX IF NOT EXISTS idx_webhook_events_processing 
ON webhook_events(platform, processed, received_at) 
WHERE NOT processed;

-- Row Level Security policies

-- Enable RLS on new tables
ALTER TABLE dm_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- DM history policies
DROP POLICY IF EXISTS dm_history_creator_isolation ON dm_history;
CREATE POLICY dm_history_creator_isolation ON dm_history
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = dm_history.account_id 
      AND accounts.creator_id = auth.creator_id()
    )
  );

-- LLM budgets policies
DROP POLICY IF EXISTS llm_budgets_creator_isolation ON llm_budgets;
CREATE POLICY llm_budgets_creator_isolation ON llm_budgets
  FOR ALL TO authenticated
  USING (creator_id = auth.creator_id());

-- LLM usage policies
DROP POLICY IF EXISTS llm_usage_creator_isolation ON llm_usage;
CREATE POLICY llm_usage_creator_isolation ON llm_usage
  FOR ALL TO authenticated
  USING (creator_id = auth.creator_id());

-- Rate limits policies
DROP POLICY IF EXISTS rate_limits_creator_isolation ON rate_limits;
CREATE POLICY rate_limits_creator_isolation ON rate_limits
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = rate_limits.account_id 
      AND accounts.creator_id = auth.creator_id()
    )
  );

-- Webhook events policies
DROP POLICY IF EXISTS webhook_events_creator_isolation ON webhook_events;
CREATE POLICY webhook_events_creator_isolation ON webhook_events
  FOR ALL TO authenticated
  USING (
    account_id IS NULL OR
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = webhook_events.account_id 
      AND accounts.creator_id = auth.creator_id()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON dm_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON llm_budgets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON llm_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO authenticated;
GRANT SELECT ON llm_pricing TO authenticated;

GRANT USAGE ON SEQUENCE dm_history_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE llm_pricing_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE llm_usage_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE rate_limits_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE webhook_events_id_seq TO authenticated;

COMMIT;