-- OFM Internal Operations - Audit and RBAC Tables
-- Migration 010: Add audit logging and role-based access control

-- Audit logs table for comprehensive operation tracking
CREATE TABLE IF NOT EXISTS audit_logs(
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  actor_sub TEXT,           -- OIDC subject identifier
  actor_email TEXT,         -- User email from OIDC
  action TEXT NOT NULL,     -- Action performed (e.g., "canary_promote", "audit_view")
  resource TEXT NOT NULL,   -- Resource affected (e.g., "rollout", "audit_logs")
  meta JSONB,              -- Additional metadata
  ip INET,                 -- Client IP address
  ua TEXT,                 -- User agent string
  
  -- Indexes for efficient querying
  CONSTRAINT audit_logs_action_check CHECK (action != ''),
  CONSTRAINT audit_logs_resource_check CHECK (resource != '')
);

-- Indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs (actor_email) WHERE actor_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource);
CREATE INDEX IF NOT EXISTS idx_audit_logs_meta_gin ON audit_logs USING GIN (meta);

-- RBAC roles override table
-- This allows overriding OIDC-provided roles with local assignments
CREATE TABLE IF NOT EXISTS rbac_roles(
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  roles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,         -- Who assigned these roles
  notes TEXT,              -- Optional notes about role assignment
  
  CONSTRAINT rbac_roles_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT rbac_roles_roles_check CHECK (array_length(roles, 1) >= 0)
);

-- Index for RBAC roles
CREATE INDEX IF NOT EXISTS idx_rbac_roles_email ON rbac_roles (email);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for rbac_roles updated_at
CREATE TRIGGER update_rbac_roles_updated_at 
    BEFORE UPDATE ON rbac_roles 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- View for audit log summary statistics
CREATE OR REPLACE VIEW audit_logs_daily_summary AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_operations,
    COUNT(DISTINCT actor_email) as unique_users,
    COUNT(DISTINCT action) as unique_actions,
    COUNT(DISTINCT resource) as unique_resources,
    COUNT(*) FILTER (WHERE action LIKE 'canary_%') as canary_operations,
    COUNT(*) FILTER (WHERE action LIKE 'audit_%') as audit_operations,
    COUNT(*) FILTER (WHERE action LIKE 'ops_%') as ops_operations
FROM audit_logs 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Insert initial admin role for setup
-- This should be updated with actual admin email after deployment
-- INSERT INTO rbac_roles (email, roles, created_by, notes) 
-- VALUES (
--     'admin@ofm.social', 
--     ARRAY['admin'], 
--     'system', 
--     'Initial admin user for OFM Internal Operations'
-- ) ON CONFLICT (email) DO NOTHING;

-- Add sample audit log entry for migration
INSERT INTO audit_logs (action, resource, meta, actor_email) 
VALUES (
    'migration_executed', 
    'database', 
    '{"migration": "010_audit_and_rbac", "version": "1.0.0"}',
    'system@ofm.social'
);

-- Comments for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all internal operations';
COMMENT ON TABLE rbac_roles IS 'Role-based access control overrides for OIDC users';
COMMENT ON VIEW audit_logs_daily_summary IS 'Daily summary statistics for audit log analysis';

COMMENT ON COLUMN audit_logs.actor_sub IS 'OIDC subject identifier for user tracking';
COMMENT ON COLUMN audit_logs.action IS 'Standardized action name (e.g., canary_promote, audit_view)';
COMMENT ON COLUMN audit_logs.resource IS 'Resource being acted upon (e.g., rollout, audit_logs)';
COMMENT ON COLUMN audit_logs.meta IS 'Additional context and parameters as JSON';

COMMENT ON COLUMN rbac_roles.roles IS 'Array of roles: admin, operator, viewer (hierarchical)';
COMMENT ON COLUMN rbac_roles.notes IS 'Human-readable notes about why roles were assigned';