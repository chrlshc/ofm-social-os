-- Instagram Session Management Tables
-- Run after 002_backpressure_per_account.sql

-- Session status tracking
CREATE TABLE IF NOT EXISTS instagram_session_status (
  username VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL CHECK (status IN ('valid', 'expired', 'failed', 'needs_2fa')),
  last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  health_score INT DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  error_count INT DEFAULT 0,
  challenge_count INT DEFAULT 0,
  last_error TEXT
);

-- Session data storage (encrypted)
CREATE TABLE IF NOT EXISTS instagram_sessions (
  account_id VARCHAR(255) PRIMARY KEY,
  session_data JSONB NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  health_score INT DEFAULT 100
);

-- Manual 2FA queue
CREATE TABLE IF NOT EXISTS manual_2fa_queue (
  username VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  completed_at TIMESTAMPTZ,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  notes TEXT
);

-- Session activity log
CREATE TABLE IF NOT EXISTS instagram_session_activity (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  success BOOLEAN NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_status_checked ON instagram_session_status(last_checked);
CREATE INDEX IF NOT EXISTS idx_session_status_health ON instagram_session_status(health_score);
CREATE INDEX IF NOT EXISTS idx_2fa_queue_status ON manual_2fa_queue(status, processed);
CREATE INDEX IF NOT EXISTS idx_session_activity_user ON instagram_session_activity(username, created_at DESC);

-- Comments
COMMENT ON TABLE instagram_session_status IS 'Track Instagram session health and status';
COMMENT ON TABLE instagram_sessions IS 'Store encrypted session data including cookies';
COMMENT ON TABLE manual_2fa_queue IS 'Queue for accounts requiring manual 2FA intervention';
COMMENT ON TABLE instagram_session_activity IS 'Log all session-related activities for debugging';

-- View for session overview
CREATE OR REPLACE VIEW instagram_session_overview AS
SELECT 
  s.username,
  s.status,
  s.health_score,
  s.last_checked,
  s.error_count,
  s.challenge_count,
  CASE 
    WHEN q.status = 'pending' THEN 'Awaiting 2FA'
    WHEN q.status = 'completed' AND q.processed = FALSE THEN '2FA Ready'
    ELSE NULL
  END as two_fa_status,
  (
    SELECT COUNT(*) 
    FROM instagram_session_activity a 
    WHERE a.username = s.username 
    AND a.created_at > NOW() - INTERVAL '24 hours'
  ) as activities_24h
FROM instagram_session_status s
LEFT JOIN manual_2fa_queue q ON q.username = s.username
ORDER BY s.health_score DESC, s.last_checked DESC;

-- Grant permissions
GRANT SELECT ON instagram_session_overview TO PUBLIC;