-- OFM Social OS Database Schema
-- PostgreSQL multi-tenant architecture with creator_id isolation
-- Single database, shared tables with tenant isolation

-- Core entities
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE creators(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name TEXT NOT NULL,
  niche TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('poster', 'repurposer', 'analyst', 'engagement')),
  engine TEXT NOT NULL CHECK (engine IN ('claude', 'gpt-4', 'gemini', 'llama')),
  config JSONB NOT NULL DEFAULT '{}',
  memory JSONB NOT NULL DEFAULT '{}', -- Agent state and learned patterns
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
  last_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- OAuth and platform accounts
CREATE TABLE tokens(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'x', 'reddit')),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  scopes TEXT[],
  expires_at TIMESTAMPTZ,
  last_refresh TIMESTAMPTZ,
  rate_limit_remaining INT,
  rate_limit_reset TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE accounts(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'x', 'reddit')),
  handle TEXT NOT NULL,
  token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}', -- {page_id, ig_user_id, tiktok_user_id, subreddits[]}
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id, platform, handle)
);

-- Content management
CREATE TABLE assets(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'image', 'carousel')),
  s3_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_ms INT,
  width INT NOT NULL,
  height INT NOT NULL,
  aspect_ratio TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN width::float/height::float > 1.7 THEN '16:9'
      WHEN width::float/height::float < 0.6 THEN '9:16'
      ELSE '1:1'
    END
  ) STORED,
  file_size_bytes BIGINT,
  transcript TEXT,
  transcript_language TEXT,
  sha256 TEXT UNIQUE NOT NULL,
  metadata JSONB DEFAULT '{}', -- {tags[], detected_objects[], sentiment}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE variants(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('9x16', '1x1', '16x9', 'original')),
  s3_url TEXT NOT NULL,
  subs_srt_url TEXT,
  subs_style JSONB DEFAULT '{}', -- {font, size, color, position}
  micro_edits JSONB DEFAULT '[]', -- [{type: 'crop', params: {}}, {type: 'filter', params: {}}]
  generated_by UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Publishing and scheduling
CREATE TABLE posts(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES variants(id),
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'publishing', 'live', 'failed', 'deleted')),
  caption TEXT,
  hashtags TEXT[],
  mentions TEXT[],
  location JSONB, -- {lat, lng, place_id}
  container_ref TEXT, -- IG container_id / TikTok upload_id
  remote_id TEXT, -- Platform's post ID
  remote_url TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  error_code TEXT,
  retry_count INT DEFAULT 0,
  is_repost BOOLEAN DEFAULT false,
  original_post_id UUID REFERENCES posts(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Metrics and analytics
CREATE TABLE metrics(
  id BIGSERIAL PRIMARY KEY,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  impressions INT DEFAULT 0,
  reach INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  saves INT DEFAULT 0,
  link_clicks INT DEFAULT 0,
  profile_visits INT DEFAULT 0,
  follows INT DEFAULT 0,
  video_views INT DEFAULT 0,
  avg_watch_time_ms INT,
  completion_rate FLOAT
);

-- KPI calculations
CREATE TABLE kpi_snapshots(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  velocity_48h FLOAT, -- (likes + comments + shares) / hours_since_post
  engagement_rate FLOAT, -- (likes + comments + shares + saves) / impressions
  ctr_bio FLOAT, -- profile_visits / impressions
  sentiment_score FLOAT, -- -1 to 1 based on comment analysis
  should_repost BOOLEAN DEFAULT false,
  should_boost_format BOOLEAN DEFAULT false
);

-- Job queue
CREATE TABLE jobs(
  id BIGSERIAL PRIMARY KEY,
  token_id UUID REFERENCES tokens(id),
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  priority INT DEFAULT 5,
  run_after TIMESTAMPTZ DEFAULT now(),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Webhooks
CREATE TABLE webhook_subscriptions(
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL,
  topic TEXT NOT NULL, -- 'post.published', 'comment.created', 'video.processed'
  callback_url TEXT NOT NULL,
  secret TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  last_delivery TIMESTAMPTZ,
  failure_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE webhook_events(
  id BIGSERIAL PRIMARY KEY,
  subscription_id UUID REFERENCES webhook_subscriptions(id),
  platform TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  processed BOOLEAN DEFAULT false,
  received_at TIMESTAMPTZ DEFAULT now()
);


-- Audit and compliance
CREATE TABLE events(
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID,
  platform TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_agents_creator ON agents(creator_id);
CREATE INDEX idx_accounts_creator ON accounts(creator_id);
CREATE INDEX idx_assets_creator ON assets(creator_id);
CREATE INDEX idx_posts_creator ON posts(creator_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_scheduled ON posts(scheduled_at) WHERE status = 'queued';
CREATE INDEX idx_metrics_post ON metrics(post_id);
CREATE INDEX idx_metrics_ts ON metrics(ts);
CREATE INDEX idx_jobs_status ON jobs(status, run_after);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed, received_at);

-- Updated at triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_creators_updated_at BEFORE UPDATE ON creators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();