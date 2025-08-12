-- Multi-Account Scaling: Rate limiting, queuing, and fair-share scheduling
-- Supports token-based partitioning with Redis sliding windows

BEGIN;

-- =============================================
-- Rate Limit Events Table
-- =============================================

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'twitter', 'reddit')),
  endpoint TEXT NOT NULL, -- 'publish', 'upload', 'comment', etc.
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retry_after_seconds INTEGER, -- Recommended retry delay from platform
  response_code INTEGER, -- HTTP status code (429, 503, etc.)
  rate_limit_type TEXT, -- 'per_minute', 'per_hour', 'per_day', 'burst'
  remaining_quota INTEGER, -- Remaining calls from response headers
  reset_at TIMESTAMPTZ, -- When quota resets
  metadata JSONB DEFAULT '{}', -- Platform-specific rate limit info
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for rate limit events
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_token_platform ON rate_limit_events(token_id, platform, hit_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_endpoint ON rate_limit_events(platform, endpoint, hit_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_cleanup ON rate_limit_events(hit_at) WHERE hit_at < now() - INTERVAL '7 days';

-- =============================================
-- Queue Statistics Table
-- =============================================

CREATE TABLE IF NOT EXISTS queue_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL, -- format: publish:{platform}:{token_id}
  token_id UUID NOT NULL,
  platform TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0, -- Current queue depth
  throughput_per_minute DECIMAL(8,2) DEFAULT 0, -- Jobs processed per minute
  avg_processing_time_ms INTEGER DEFAULT 0,
  error_rate DECIMAL(5,4) DEFAULT 0, -- Error rate (0.0-1.0)
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  circuit_breaker_state TEXT DEFAULT 'closed' CHECK (circuit_breaker_state IN ('closed', 'open', 'half_open')),
  circuit_breaker_failures INTEGER DEFAULT 0,
  circuit_breaker_last_failure TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique queue per token+platform
  UNIQUE(token_id, platform)
);

-- Indexes for queue statistics
CREATE INDEX IF NOT EXISTS idx_queue_statistics_queue_name ON queue_statistics(queue_name);
CREATE INDEX IF NOT EXISTS idx_queue_statistics_platform ON queue_statistics(platform, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_statistics_circuit_breaker ON queue_statistics(circuit_breaker_state) WHERE circuit_breaker_state != 'closed';

-- =============================================
-- Token Scheduling Table (for fair-share)
-- =============================================

CREATE TABLE IF NOT EXISTS token_scheduling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL,
  platform TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5, -- 1=highest, 10=lowest
  weight DECIMAL(4,2) NOT NULL DEFAULT 1.0, -- Relative scheduling weight
  last_scheduled_at TIMESTAMPTZ, -- Last time this token was scheduled
  total_jobs_scheduled BIGINT DEFAULT 0,
  total_jobs_completed BIGINT DEFAULT 0,
  total_jobs_failed BIGINT DEFAULT 0,
  avg_job_duration_ms INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true, -- Whether token is actively publishing
  cooldown_until TIMESTAMPTZ, -- Token in cooldown (circuit breaker)
  jitter_offset_ms INTEGER DEFAULT 0, -- Random offset for human-like posting
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique scheduling per token+platform
  UNIQUE(token_id, platform)
);

-- Indexes for token scheduling
CREATE INDEX IF NOT EXISTS idx_token_scheduling_active ON token_scheduling(platform, is_active, priority, last_scheduled_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_token_scheduling_cooldown ON token_scheduling(cooldown_until) WHERE cooldown_until IS NOT NULL;

-- =============================================
-- Platform Rate Limits Configuration
-- =============================================

CREATE TABLE IF NOT EXISTS platform_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  limit_per_minute INTEGER,
  limit_per_hour INTEGER,
  limit_per_day INTEGER,
  burst_limit INTEGER, -- Maximum burst requests
  burst_window_seconds INTEGER DEFAULT 60, -- Burst window duration
  backoff_multiplier DECIMAL(3,2) DEFAULT 1.5, -- Exponential backoff multiplier
  max_backoff_seconds INTEGER DEFAULT 300, -- Maximum backoff (5 minutes)
  jitter_min_ms INTEGER DEFAULT 1800000, -- 30 minutes
  jitter_max_ms INTEGER DEFAULT 5400000, -- 90 minutes
  circuit_breaker_threshold INTEGER DEFAULT 5, -- Failures before opening circuit
  circuit_breaker_timeout_seconds INTEGER DEFAULT 300, -- 5 minutes
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}', -- Platform-specific configuration
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique configuration per platform+endpoint
  UNIQUE(platform, endpoint)
);

-- Insert default rate limit configurations
INSERT INTO platform_rate_limits (platform, endpoint, limit_per_minute, limit_per_hour, limit_per_day, burst_limit, metadata) VALUES
-- TikTok Content Posting API
('tiktok', 'publish', 1, 100, 1000, 2, '{"sliding_window": true, "strict_enforcement": true}'),
('tiktok', 'upload', 5, 200, 2000, 10, '{"max_file_size_mb": 128}'),
('tiktok', 'query', 10, 1000, 10000, 20, '{"batch_supported": true}'),

-- Instagram Basic Display API + Graph API
('instagram', 'publish', 5, 200, 1440, 10, '{"requires_review": true, "business_only": false}'),
('instagram', 'upload', 10, 500, 5000, 20, '{"max_file_size_mb": 100}'),
('instagram', 'comment', 15, 300, 2000, 30, '{"auto_moderation": true}'),

-- Twitter API v2
('twitter', 'publish', 300, 300, 300, 300, '{"user_context": true, "app_context": false}'),
('twitter', 'upload', 300, 300, 300, 300, '{"max_file_size_mb": 512}'),
('twitter', 'delete', 300, 300, 300, 300, '{"own_tweets_only": true}'),

-- Reddit PRAW
('reddit', 'submit', 1, 10, 100, 1, '{"auto_throttle": true, "respect_api_rules": true}'),
('reddit', 'comment', 10, 100, 1000, 15, '{"rate_limit_seconds": 10}'),
('reddit', 'vote', 30, 1000, 10000, 50, '{"no_rate_limit_logged_in": false}');

-- Indexes for platform rate limits
CREATE INDEX IF NOT EXISTS idx_platform_rate_limits_platform ON platform_rate_limits(platform, is_active);

-- =============================================
-- Functions
-- =============================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_scaling_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
DROP TRIGGER IF EXISTS queue_statistics_updated_at_trigger ON queue_statistics;
CREATE TRIGGER queue_statistics_updated_at_trigger
  BEFORE UPDATE ON queue_statistics
  FOR EACH ROW
  EXECUTE FUNCTION update_scaling_timestamp();

DROP TRIGGER IF EXISTS token_scheduling_updated_at_trigger ON token_scheduling;
CREATE TRIGGER token_scheduling_updated_at_trigger
  BEFORE UPDATE ON token_scheduling
  FOR EACH ROW
  EXECUTE FUNCTION update_scaling_timestamp();

DROP TRIGGER IF EXISTS platform_rate_limits_updated_at_trigger ON platform_rate_limits;
CREATE TRIGGER platform_rate_limits_updated_at_trigger
  BEFORE UPDATE ON platform_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_scaling_timestamp();

-- Function to calculate queue name
CREATE OR REPLACE FUNCTION generate_queue_name(platform_name TEXT, token_uuid UUID) RETURNS TEXT AS $$
BEGIN
  RETURN 'publish:' || platform_name || ':' || token_uuid::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update queue statistics
CREATE OR REPLACE FUNCTION update_queue_stats(
  queue_name_param TEXT,
  depth_delta INTEGER DEFAULT 0,
  processing_time_ms INTEGER DEFAULT NULL,
  is_error BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
DECLARE
  current_stats RECORD;
  new_error_rate DECIMAL(5,4);
  new_avg_time INTEGER;
BEGIN
  -- Get current statistics
  SELECT * INTO current_stats 
  FROM queue_statistics 
  WHERE queue_name = queue_name_param;

  IF NOT FOUND THEN
    -- Initialize new queue statistics
    INSERT INTO queue_statistics (queue_name, token_id, platform, depth)
    SELECT 
      queue_name_param,
      split_part(queue_name_param, ':', 3)::UUID,
      split_part(queue_name_param, ':', 2),
      GREATEST(depth_delta, 0)
    WHERE split_part(queue_name_param, ':', 1) = 'publish';
    RETURN;
  END IF;

  -- Calculate new metrics
  IF processing_time_ms IS NOT NULL THEN
    new_avg_time := (COALESCE(current_stats.avg_processing_time_ms, 0) + processing_time_ms) / 2;
  ELSE
    new_avg_time := current_stats.avg_processing_time_ms;
  END IF;

  IF is_error THEN
    new_error_rate := LEAST((COALESCE(current_stats.error_rate, 0) * 0.9) + (0.1), 1.0);
  ELSE
    new_error_rate := GREATEST(COALESCE(current_stats.error_rate, 0) * 0.95, 0.0);
  END IF;

  -- Update statistics
  UPDATE queue_statistics
  SET 
    depth = GREATEST(depth + depth_delta, 0),
    avg_processing_time_ms = new_avg_time,
    error_rate = new_error_rate,
    last_activity_at = now(),
    updated_at = now()
  WHERE queue_name = queue_name_param;
END;
$$ LANGUAGE plpgsql;

-- Function to get next token for fair scheduling
CREATE OR REPLACE FUNCTION get_next_scheduled_token(platform_name TEXT) RETURNS UUID AS $$
DECLARE
  selected_token UUID;
BEGIN
  -- Select token using round-robin with priority weighting
  SELECT token_id INTO selected_token
  FROM token_scheduling
  WHERE platform = platform_name
    AND is_active = true
    AND (cooldown_until IS NULL OR cooldown_until < now())
  ORDER BY 
    priority ASC,
    (last_scheduled_at IS NULL) DESC, -- Prioritize never-scheduled tokens
    last_scheduled_at ASC NULLS FIRST, -- Round-robin on last scheduled
    weight DESC, -- Higher weight = more frequent scheduling
    random() -- Final tiebreaker
  LIMIT 1;

  -- Update last scheduled time
  IF selected_token IS NOT NULL THEN
    UPDATE token_scheduling
    SET 
      last_scheduled_at = now(),
      total_jobs_scheduled = total_jobs_scheduled + 1,
      updated_at = now()
    WHERE token_id = selected_token AND platform = platform_name;
  END IF;

  RETURN selected_token;
END;
$$ LANGUAGE plpgsql;

-- Function to record rate limit hit
CREATE OR REPLACE FUNCTION record_rate_limit_hit(
  token_uuid UUID,
  platform_name TEXT,
  endpoint_name TEXT,
  retry_after INTEGER DEFAULT NULL,
  response_status INTEGER DEFAULT 429,
  remaining INTEGER DEFAULT NULL,
  reset_timestamp TIMESTAMPTZ DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO rate_limit_events (
    token_id, platform, endpoint, hit_at, retry_after_seconds,
    response_code, remaining_quota, reset_at
  ) VALUES (
    token_uuid, platform_name, endpoint_name, now(), retry_after,
    response_status, remaining, reset_timestamp
  );

  -- Update circuit breaker if needed
  UPDATE token_scheduling
  SET 
    circuit_breaker_failures = circuit_breaker_failures + 1,
    circuit_breaker_last_failure = now(),
    circuit_breaker_state = CASE 
      WHEN circuit_breaker_failures + 1 >= 5 THEN 'open'
      ELSE circuit_breaker_state
    END,
    cooldown_until = CASE
      WHEN circuit_breaker_failures + 1 >= 5 THEN now() + INTERVAL '5 minutes'
      ELSE cooldown_until
    END,
    updated_at = now()
  WHERE token_id = token_uuid AND platform = platform_name;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old rate limit events
CREATE OR REPLACE FUNCTION cleanup_old_rate_limit_events() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_events
  WHERE hit_at < now() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Views for monitoring and analytics
-- =============================================

-- Queue health overview
CREATE OR REPLACE VIEW queue_health_overview AS
SELECT 
  q.platform,
  COUNT(*) as total_queues,
  COUNT(*) FILTER (WHERE q.circuit_breaker_state = 'open') as circuit_breaker_open,
  COUNT(*) FILTER (WHERE q.last_activity_at > now() - INTERVAL '5 minutes') as active_queues,
  AVG(q.depth) as avg_queue_depth,
  MAX(q.depth) as max_queue_depth,
  AVG(q.throughput_per_minute) as avg_throughput,
  AVG(q.error_rate) as avg_error_rate,
  AVG(q.avg_processing_time_ms) as avg_processing_time_ms
FROM queue_statistics q
GROUP BY q.platform;

-- Rate limit hits by platform and hour
CREATE OR REPLACE VIEW rate_limit_hits_hourly AS
SELECT 
  platform,
  endpoint,
  date_trunc('hour', hit_at) as hour,
  COUNT(*) as total_hits,
  COUNT(*) FILTER (WHERE response_code = 429) as rate_limit_hits,
  AVG(retry_after_seconds) as avg_retry_after,
  COUNT(DISTINCT token_id) as affected_tokens
FROM rate_limit_events
WHERE hit_at > now() - INTERVAL '24 hours'
GROUP BY platform, endpoint, date_trunc('hour', hit_at)
ORDER BY hour DESC, platform, endpoint;

-- Token performance metrics
CREATE OR REPLACE VIEW token_performance_metrics AS
SELECT 
  ts.token_id,
  ts.platform,
  ts.priority,
  ts.weight,
  ts.total_jobs_scheduled,
  ts.total_jobs_completed,
  ts.total_jobs_failed,
  CASE 
    WHEN ts.total_jobs_scheduled > 0 
    THEN ROUND((ts.total_jobs_completed::DECIMAL / ts.total_jobs_scheduled) * 100, 2)
    ELSE 0
  END as completion_rate_percent,
  ts.avg_job_duration_ms,
  ts.circuit_breaker_state,
  ts.last_scheduled_at,
  q.depth as current_queue_depth,
  q.error_rate as current_error_rate,
  COUNT(rle.id) as rate_limit_hits_24h
FROM token_scheduling ts
LEFT JOIN queue_statistics q ON ts.token_id = q.token_id AND ts.platform = q.platform
LEFT JOIN rate_limit_events rle ON ts.token_id = rle.token_id 
  AND ts.platform = rle.platform 
  AND rle.hit_at > now() - INTERVAL '24 hours'
GROUP BY ts.token_id, ts.platform, ts.priority, ts.weight, ts.total_jobs_scheduled,
         ts.total_jobs_completed, ts.total_jobs_failed, ts.avg_job_duration_ms,
         ts.circuit_breaker_state, ts.last_scheduled_at, q.depth, q.error_rate;

-- =============================================
-- Grants and Permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_events TO authenticated;
GRANT USAGE ON SEQUENCE rate_limit_events_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON queue_statistics TO authenticated;
GRANT USAGE ON SEQUENCE queue_statistics_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON token_scheduling TO authenticated;
GRANT USAGE ON SEQUENCE token_scheduling_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON platform_rate_limits TO authenticated;
GRANT USAGE ON SEQUENCE platform_rate_limits_id_seq TO authenticated;

-- Views
GRANT SELECT ON queue_health_overview TO authenticated;
GRANT SELECT ON rate_limit_hits_hourly TO authenticated;
GRANT SELECT ON token_performance_metrics TO authenticated;

-- Functions
GRANT EXECUTE ON FUNCTION generate_queue_name TO authenticated;
GRANT EXECUTE ON FUNCTION update_queue_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_scheduled_token TO authenticated;
GRANT EXECUTE ON FUNCTION record_rate_limit_hit TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_rate_limit_events TO authenticated;

COMMIT;