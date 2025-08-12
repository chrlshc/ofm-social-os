-- Migration: Add Temporal workflow support and backfill from BullMQ
-- This migration enables dual-write phase for BullMQ -> Temporal migration

BEGIN;

-- Add workflow tracking columns
ALTER TABLE posts 
  ADD COLUMN IF NOT EXISTS workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS workflow_run_id TEXT,
  ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS migration_source TEXT DEFAULT 'temporal' -- 'bullmq' or 'temporal'
;

-- Create workflow events table for audit
CREATE TABLE IF NOT EXISTS workflow_events (
  id BIGSERIAL PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_run_id TEXT,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_id 
  ON workflow_events(workflow_id, created_at DESC);

-- Create table for tracking migration progress
CREATE TABLE IF NOT EXISTS migration_status (
  id SERIAL PRIMARY KEY,
  migration_name TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress',
  stats JSONB DEFAULT '{}',
  notes TEXT
);

-- Insert migration tracking record
INSERT INTO migration_status (migration_name, status, notes) 
VALUES (
  'bullmq_to_temporal', 
  'started', 
  'Adding Temporal support with dual-write capability'
) ON CONFLICT (migration_name) DO UPDATE SET
  started_at = NOW(),
  status = 'started',
  notes = EXCLUDED.notes;

-- Backfill workflow_id from existing job_id (BullMQ format)
-- Convert BullMQ job IDs to Temporal workflow IDs
UPDATE posts 
SET workflow_id = CASE 
  WHEN job_id IS NOT NULL AND workflow_id IS NULL THEN
    'pub:' || platform || ':' || account_id || ':' || id
  ELSE workflow_id
END,
migration_source = 'bullmq'
WHERE job_id IS NOT NULL AND workflow_id IS NULL;

-- Add unique constraint for content deduplication (idempotency)
-- Only one live post per account+content+variant combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_idempotency 
  ON posts(account_id, content_hash, COALESCE(variant_id, ''))
  WHERE status IN ('live', 'publishing', 'queued');

-- Add workflow status index for queries
CREATE INDEX IF NOT EXISTS idx_posts_workflow_status 
  ON posts(workflow_status, created_at DESC)
  WHERE workflow_id IS NOT NULL;

-- Create view for migration monitoring
CREATE OR REPLACE VIEW v_migration_stats AS
SELECT 
  migration_source,
  status,
  COUNT(*) as post_count,
  COUNT(CASE WHEN workflow_id IS NOT NULL THEN 1 END) as with_workflow_id,
  COUNT(CASE WHEN job_id IS NOT NULL THEN 1 END) as with_job_id,
  MIN(created_at) as oldest_post,
  MAX(created_at) as newest_post,
  AVG(EXTRACT(EPOCH FROM (published_at - created_at))) as avg_publish_time_seconds
FROM posts 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY migration_source, status
ORDER BY migration_source, status;

-- Add rate budget reservations table for Temporal activities
CREATE TABLE IF NOT EXISTS rate_budget_reservations (
  id TEXT PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  platform TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 1,
  reserved_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
  workflow_id TEXT,
  consumed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_rate_reservations_account 
  ON rate_budget_reservations(account_id, platform, expires_at)
  WHERE NOT consumed;

CREATE INDEX IF NOT EXISTS idx_rate_reservations_cleanup 
  ON rate_budget_reservations(expires_at)
  WHERE NOT consumed;

-- Cleanup old reservations (runs every hour via cron)
-- Can be run manually: DELETE FROM rate_budget_reservations WHERE expires_at < NOW() AND NOT consumed;

-- Add helper function to get current rate budget
CREATE OR REPLACE FUNCTION get_rate_budget(
  p_account_id UUID,
  p_platform TEXT,
  p_window_hours INTEGER DEFAULT 1
) RETURNS TABLE(
  used_count BIGINT,
  reserved_count BIGINT,
  available_count INTEGER
) AS $$
DECLARE
  platform_limits JSONB := '{
    "instagram": {"hour": 25, "day": 100},
    "tiktok": {"hour": 10, "day": 50}, 
    "x": {"hour": 50, "day": 300},
    "reddit": {"hour": 10, "day": 100}
  }'::jsonb;
  limit_count INTEGER;
BEGIN
  -- Get platform limit
  limit_count := COALESCE(
    (platform_limits->p_platform->CASE WHEN p_window_hours = 1 THEN 'hour' ELSE 'day' END)::INTEGER,
    10
  );
  
  -- Count used posts in window
  SELECT COUNT(*) INTO used_count
  FROM posts 
  WHERE account_id = p_account_id 
    AND platform = p_platform
    AND status = 'live'
    AND published_at > NOW() - (p_window_hours || ' hours')::INTERVAL;
  
  -- Count active reservations
  SELECT COUNT(*) INTO reserved_count
  FROM rate_budget_reservations
  WHERE account_id = p_account_id
    AND platform = p_platform
    AND expires_at > NOW()
    AND NOT consumed;
    
  -- Calculate available
  available_count := GREATEST(0, limit_count - used_count - reserved_count);
  
  RETURN QUERY SELECT used_count, reserved_count, available_count;
END;
$$ LANGUAGE plpgsql;

-- Add workflow management functions
CREATE OR REPLACE FUNCTION workflow_stats(
  days_back INTEGER DEFAULT 7
) RETURNS TABLE(
  platform TEXT,
  workflow_status TEXT,
  count BIGINT,
  avg_duration_minutes NUMERIC,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.platform,
    COALESCE(p.workflow_status, 'unknown') as workflow_status,
    COUNT(*) as count,
    ROUND(AVG(EXTRACT(EPOCH FROM (p.published_at - p.created_at)) / 60), 2) as avg_duration_minutes,
    ROUND(
      COUNT(CASE WHEN p.status = 'live' THEN 1 END)::NUMERIC / 
      NULLIF(COUNT(*), 0) * 100, 
      2
    ) as success_rate
  FROM posts p
  WHERE p.created_at > NOW() - (days_back || ' days')::INTERVAL
    AND p.workflow_id IS NOT NULL
  GROUP BY p.platform, p.workflow_status
  ORDER BY p.platform, count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create cleanup job for old workflow events
CREATE OR REPLACE FUNCTION cleanup_old_workflow_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Keep workflow events for 30 days
  DELETE FROM workflow_events 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  INSERT INTO migration_status (migration_name, status, stats) 
  VALUES (
    'workflow_events_cleanup_' || to_char(NOW(), 'YYYY_MM_DD'),
    'completed',
    jsonb_build_object('deleted_count', deleted_count)
  ) ON CONFLICT DO NOTHING;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Update migration status
UPDATE migration_status 
SET 
  completed_at = NOW(),
  status = 'completed',
  stats = jsonb_build_object(
    'posts_with_workflow_id', (SELECT COUNT(*) FROM posts WHERE workflow_id IS NOT NULL),
    'posts_with_job_id', (SELECT COUNT(*) FROM posts WHERE job_id IS NOT NULL),
    'reservations_table_created', true
  )
WHERE migration_name = 'bullmq_to_temporal';

COMMIT;

-- Post-migration verification queries (run manually):
/*
-- Check migration progress
SELECT * FROM migration_status WHERE migration_name = 'bullmq_to_temporal';

-- View current stats
SELECT * FROM v_migration_stats;

-- Test rate budget function
SELECT * FROM get_rate_budget('your-account-id'::uuid, 'instagram', 1);

-- View workflow stats
SELECT * FROM workflow_stats(7);

-- Count posts ready for Temporal
SELECT 
  platform,
  COUNT(*) as total,
  COUNT(CASE WHEN workflow_id IS NOT NULL THEN 1 END) as with_workflow_id,
  COUNT(CASE WHEN job_id IS NOT NULL THEN 1 END) as with_job_id
FROM posts 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY platform;
*/