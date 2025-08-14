-- Production Improvements Migration
-- Run this after npm run enhanced:db-init

-- 1. Add unique constraint for idempotence
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_campaign_user'
  ) THEN
    ALTER TABLE dm_outreach_logs 
    ADD CONSTRAINT uniq_campaign_user UNIQUE (campaign_id, username);
  END IF;
END$$;

-- 2. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON dm_outreach_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_outreach_account ON dm_outreach_logs(account);
CREATE INDEX IF NOT EXISTS idx_replies_reply_at ON dm_replies(reply_at);
CREATE INDEX IF NOT EXISTS idx_replies_sentiment ON dm_replies(sentiment);

-- 3. Add account performance tracking columns
ALTER TABLE account_performance 
ADD COLUMN IF NOT EXISTS hourly_sent INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_sent INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_hour TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_reset_day DATE;

-- 4. Create view for quick stats
CREATE OR REPLACE VIEW dm_stats AS
SELECT 
  COUNT(DISTINCT o.username) as total_contacted,
  COUNT(DISTINCT r.username) as total_replied,
  ROUND(100.0 * COUNT(DISTINCT r.username) / NULLIF(COUNT(DISTINCT o.username), 0), 2) as reply_rate_pct,
  COUNT(DISTINCT CASE WHEN r.sentiment = 'positive' THEN r.username END) as positive_replies,
  COUNT(DISTINCT CASE WHEN r.sentiment = 'negative' THEN r.username END) as negative_replies
FROM dm_outreach_logs o
LEFT JOIN dm_replies r ON r.outreach_log_id = o.id
WHERE o.sent_at > NOW() - INTERVAL '7 days';

GRANT SELECT ON dm_stats TO PUBLIC;
