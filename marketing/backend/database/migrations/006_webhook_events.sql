-- Webhook events table for reliable idempotent processing
-- Supports TikTok Content Posting API and Meta/Instagram Graph API webhooks

BEGIN;

-- =============================================
-- Webhook Events Table
-- =============================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('tiktok', 'meta', 'instagram')),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT, -- post_success, post_failed, comment_received, etc.
  account_ref TEXT, -- Platform account identifier
  signature TEXT,
  signature_verified BOOLEAN DEFAULT false,
  timestamp BIGINT, -- Unix timestamp from webhook (for TikTok signature verification)
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'dlq')),
  processing_error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for webhook processing
CREATE INDEX IF NOT EXISTS idx_webhook_provider_received ON webhook_events(provider, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_status_provider ON webhook_events(status, provider) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_webhook_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_account_ref ON webhook_events(account_ref) WHERE account_ref IS NOT NULL;

-- TTL cleanup index (webhooks older than 30 days)
CREATE INDEX IF NOT EXISTS idx_webhook_cleanup ON webhook_events(received_at) WHERE status = 'completed';

-- =============================================
-- Webhook Mappings (event to post/account)
-- =============================================

CREATE TABLE IF NOT EXISTS webhook_mappings (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  platform_id TEXT NOT NULL, -- TikTok video_id, Instagram media_id
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('post_status', 'comment', 'mention')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, platform_id, mapping_type)
);

CREATE INDEX IF NOT EXISTS idx_webhook_mapping_post ON webhook_mappings(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_mapping_account ON webhook_mappings(account_id);
CREATE INDEX IF NOT EXISTS idx_webhook_mapping_platform ON webhook_mappings(provider, platform_id);

-- =============================================
-- Functions for webhook processing
-- =============================================

-- Function to check if webhook is within acceptable time window (5 minutes)
CREATE OR REPLACE FUNCTION is_webhook_timestamp_valid(
  webhook_timestamp BIGINT,
  tolerance_seconds INTEGER DEFAULT 300
) RETURNS BOOLEAN AS $$
BEGIN
  -- Convert webhook timestamp to timestamptz and check if within tolerance
  RETURN ABS(EXTRACT(EPOCH FROM now()) - webhook_timestamp) <= tolerance_seconds;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to move webhook to DLQ after max retries
CREATE OR REPLACE FUNCTION move_webhook_to_dlq() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.retry_count >= NEW.max_retries AND NEW.status = 'failed' THEN
    NEW.status := 'dlq';
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-move to DLQ
DROP TRIGGER IF EXISTS webhook_dlq_trigger ON webhook_events;
CREATE TRIGGER webhook_dlq_trigger
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW
  WHEN (NEW.status = 'failed' AND NEW.retry_count >= NEW.max_retries)
  EXECUTE FUNCTION move_webhook_to_dlq();

-- Function to update webhook event timestamp
CREATE OR REPLACE FUNCTION update_webhook_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS webhook_updated_at_trigger ON webhook_events;
CREATE TRIGGER webhook_updated_at_trigger
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_timestamp();

-- =============================================
-- Webhook Processing Stats View
-- =============================================

CREATE OR REPLACE VIEW webhook_processing_stats AS
SELECT 
  provider,
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (processed_at - received_at))) as avg_processing_time_seconds,
  MAX(EXTRACT(EPOCH FROM (processed_at - received_at))) as max_processing_time_seconds,
  MIN(received_at) as oldest_event,
  MAX(received_at) as newest_event
FROM webhook_events
WHERE received_at > now() - INTERVAL '24 hours'
GROUP BY provider, status;

-- =============================================
-- Grants and Permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE ON webhook_events TO authenticated;
GRANT USAGE ON SEQUENCE webhook_events_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_mappings TO authenticated;
GRANT USAGE ON SEQUENCE webhook_mappings_id_seq TO authenticated;

GRANT SELECT ON webhook_processing_stats TO authenticated;

COMMIT;