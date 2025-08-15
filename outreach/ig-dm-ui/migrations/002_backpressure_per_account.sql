-- Production++ Migration: Per-account backpressure
-- Run after 001_production_improvements.sql

-- Per-account reply stats for individual backpressure decisions
CREATE TABLE IF NOT EXISTS account_reply_stats (
  account TEXT PRIMARY KEY,
  reply_rate_30m DOUBLE PRECISION NOT NULL DEFAULT 0,
  sent_30m INT NOT NULL DEFAULT 0,
  replied_30m INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient updates
CREATE INDEX IF NOT EXISTS idx_account_reply_stats_updated 
ON account_reply_stats(updated_at);

-- Add comment
COMMENT ON TABLE account_reply_stats IS 
'Real-time reply statistics per account for individual tempo adjustment';

-- Grant permissions (adjust as needed)
GRANT SELECT ON account_reply_stats TO PUBLIC;