-- Script to ensure proper migration order
-- Run this if you have migration ordering issues

-- First, check what migrations exist
SELECT version, applied_at 
FROM schema_migrations 
ORDER BY version;

-- If missing entries, manually insert them in order:

-- Base schema (from existing system)
INSERT INTO schema_migrations (version) 
VALUES ('000_base_schema.sql')
ON CONFLICT (version) DO NOTHING;

-- Marketing initial schema
INSERT INTO schema_migrations (version) 
VALUES ('001_initial_schema.sql')
ON CONFLICT (version) DO NOTHING;

-- Temporal tables
INSERT INTO schema_migrations (version) 
VALUES ('002_temporal_schema.sql')
ON CONFLICT (version) DO NOTHING;

-- LLM budgets
INSERT INTO schema_migrations (version) 
VALUES ('003_llm_budgets.sql')
ON CONFLICT (version) DO NOTHING;

-- Content storage
INSERT INTO schema_migrations (version) 
VALUES ('004_content_storage.sql')
ON CONFLICT (version) DO NOTHING;

-- Platform auth
INSERT INTO schema_migrations (version) 
VALUES ('005_platform_auth.sql')
ON CONFLICT (version) DO NOTHING;

-- Webhook events
INSERT INTO schema_migrations (version) 
VALUES ('006_webhook_events.sql')
ON CONFLICT (version) DO NOTHING;

-- Rate limits
INSERT INTO schema_migrations (version) 
VALUES ('007_rate_limits.sql')
ON CONFLICT (version) DO NOTHING;

-- Reddit integration
INSERT INTO schema_migrations (version) 
VALUES ('008_reddit_integration.sql')
ON CONFLICT (version) DO NOTHING;

-- Analytics
INSERT INTO schema_migrations (version) 
VALUES ('009_analytics.sql')
ON CONFLICT (version) DO NOTHING;

-- Verify final state
SELECT version, applied_at 
FROM schema_migrations 
ORDER BY version;