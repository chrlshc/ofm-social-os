-- Security hardening: RLS policies, audit logs, webhook events
-- This migration enhances security with comprehensive audit trails and access controls

BEGIN;

-- =============================================
-- Audit Log System (Immutable, Append-Only)
-- =============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'webhook', 'agent')),
  actor_id TEXT, -- user_id, system_component, webhook_source, etc.
  action TEXT NOT NULL, -- login, publish, delete_data, token_refresh, etc.
  resource_type TEXT, -- post, account, token, etc.
  resource_id TEXT, -- specific resource identifier
  details JSONB, -- PII-redacted details
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  correlation_id TEXT, -- for tracing requests across services
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation ON audit_logs(correlation_id) WHERE correlation_id IS NOT NULL;

-- Prevent modifications to audit logs (append-only)
CREATE OR REPLACE RULE no_audit_log_updates AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_audit_log_deletes AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- =============================================
-- Enhanced Webhook Events Table
-- =============================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'x', 'reddit')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT, -- HMAC signature for verification
  verified BOOLEAN DEFAULT false,
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for webhook processing
CREATE INDEX IF NOT EXISTS idx_webhook_events_processing 
ON webhook_events(platform, processed, received_at) WHERE NOT processed;

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id 
ON webhook_events(event_id);

-- TTL cleanup (optional, can be handled by application or pg_cron)
CREATE INDEX IF NOT EXISTS idx_webhook_events_cleanup 
ON webhook_events(received_at) WHERE processed = true;

-- =============================================
-- Idempotency Keys Table
-- =============================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL, -- SHA256 hash of the idempotency key
  creator_id UUID NOT NULL,
  operation_type TEXT NOT NULL, -- 'publish', 'delete', etc.
  request_payload_hash TEXT, -- Hash of request payload for verification
  response_data JSONB, -- Cached response for duplicate requests
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Index for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_hash ON idempotency_keys(key_hash, expires_at);

-- Clean up expired keys
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_cleanup ON idempotency_keys(expires_at) WHERE expires_at < now();

-- =============================================
-- Enhanced Row Level Security (RLS)
-- =============================================

-- Enable RLS on existing tables if not already enabled
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_budgets ENABLE ROW LEVEL SECURITY;

-- Function to get current creator ID from JWT or session
CREATE OR REPLACE FUNCTION auth.current_creator_id() RETURNS UUID AS $$
BEGIN
  -- This would be implemented based on your authentication system
  -- For now, we'll use a session variable that should be set by the application
  RETURN COALESCE(
    current_setting('auth.creator_id', true)::UUID,
    '00000000-0000-0000-0000-000000000000'::UUID
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced RLS policies with audit logging

-- Posts table policies
DROP POLICY IF EXISTS posts_creator_isolation ON posts;
CREATE POLICY posts_creator_isolation ON posts
  FOR ALL TO authenticated
  USING (creator_id = auth.current_creator_id());

-- Accounts table policies  
DROP POLICY IF EXISTS accounts_creator_isolation ON accounts;
CREATE POLICY accounts_creator_isolation ON accounts
  FOR ALL TO authenticated
  USING (creator_id = auth.current_creator_id());

-- DM history policies
DROP POLICY IF EXISTS dm_history_creator_isolation ON dm_history;
CREATE POLICY dm_history_creator_isolation ON dm_history
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounts 
      WHERE accounts.id = dm_history.account_id 
      AND accounts.creator_id = auth.current_creator_id()
    )
  );

-- LLM usage policies
DROP POLICY IF EXISTS llm_usage_creator_isolation ON llm_usage;
CREATE POLICY llm_usage_creator_isolation ON llm_usage
  FOR ALL TO authenticated
  USING (creator_id = auth.current_creator_id());

-- LLM budgets policies
DROP POLICY IF EXISTS llm_budgets_creator_isolation ON llm_budgets;
CREATE POLICY llm_budgets_creator_isolation ON llm_budgets
  FOR ALL TO authenticated
  USING (creator_id = auth.current_creator_id());

-- =============================================
-- Audit Logging Functions
-- =============================================

-- Function to log user actions
CREATE OR REPLACE FUNCTION audit.log_action(
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_correlation_id TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO audit_logs (
    actor_type, actor_id, action, resource_type, resource_id,
    details, ip_address, user_agent, session_id, correlation_id
  ) VALUES (
    p_actor_type, p_actor_id, p_action, p_resource_type, p_resource_id,
    p_details, p_ip_address, p_user_agent, p_session_id, p_correlation_id
  ) RETURNING event_id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to redact PII from audit details
CREATE OR REPLACE FUNCTION audit.redact_pii(details JSONB) RETURNS JSONB AS $$
BEGIN
  -- Remove sensitive fields from audit details
  RETURN jsonb_strip_nulls(details - ARRAY[
    'access_token', 'refresh_token', 'password', 'secret',
    'email', 'phone', 'ssn', 'credit_card', 'api_key'
  ]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================
-- Triggers for Automatic Audit Logging
-- =============================================

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit.audit_trigger() RETURNS TRIGGER AS $$
DECLARE
  audit_details JSONB;
  resource_id TEXT;
BEGIN
  -- Determine resource ID based on table
  resource_id := COALESCE(
    NEW.id::TEXT, 
    OLD.id::TEXT,
    NEW.account_id::TEXT,
    OLD.account_id::TEXT
  );
  
  -- Build audit details (PII-redacted)
  audit_details := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'old_values', audit.redact_pii(to_jsonb(OLD)),
    'new_values', audit.redact_pii(to_jsonb(NEW))
  );
  
  -- Log the action
  PERFORM audit.log_action(
    'system',
    'database_trigger',
    lower(TG_OP),
    TG_TABLE_NAME,
    resource_id,
    audit_details
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
DROP TRIGGER IF EXISTS posts_audit_trigger ON posts;
CREATE TRIGGER posts_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

DROP TRIGGER IF EXISTS accounts_audit_trigger ON accounts;
CREATE TRIGGER accounts_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

DROP TRIGGER IF EXISTS tokens_audit_trigger ON tokens;
CREATE TRIGGER tokens_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON tokens
  FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

-- =============================================
-- Security Views (for safe data access)
-- =============================================

-- View for posts without sensitive data
CREATE OR REPLACE VIEW safe_posts AS
SELECT 
  id, creator_id, account_id, variant_id, workflow_id,
  status, caption, hashtags, platform, media_type,
  published_at, created_at, updated_at,
  -- Exclude: access tokens, internal IDs, etc.
  CASE 
    WHEN length(remote_id) > 20 THEN substring(remote_id from 1 for 10) || '...'
    ELSE remote_id
  END as remote_id_masked
FROM posts;

-- View for accounts without tokens
CREATE OR REPLACE VIEW safe_accounts AS
SELECT 
  id, creator_id, platform, platform_account_id, username,
  status, created_at, updated_at,
  -- Exclude: access_token, metadata with secrets
  metadata - ARRAY['access_token', 'refresh_token', 'secret'] as safe_metadata
FROM accounts;

-- =============================================
-- Grant Permissions
-- =============================================

-- Grant permissions for application roles
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE ON webhook_events TO authenticated;
GRANT USAGE ON SEQUENCE webhook_events_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE ON idempotency_keys TO authenticated;
GRANT USAGE ON SEQUENCE idempotency_keys_id_seq TO authenticated;

-- Views
GRANT SELECT ON safe_posts TO authenticated;
GRANT SELECT ON safe_accounts TO authenticated;

-- Audit schema permissions
GRANT USAGE ON SCHEMA audit TO authenticated;
GRANT EXECUTE ON FUNCTION audit.log_action TO authenticated;
GRANT EXECUTE ON FUNCTION audit.redact_pii TO authenticated;

-- Auth schema permissions
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.current_creator_id TO authenticated;

COMMIT;