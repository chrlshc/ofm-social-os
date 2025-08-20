-- Schema for OFM Social Publishing System
-- PostgreSQL 14+

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS social_publisher;
SET search_path TO social_publisher, public;

-- Platform accounts (OAuth tokens, encrypted)
CREATE TABLE IF NOT EXISTS platform_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('reddit', 'instagram', 'tiktok')),
  username VARCHAR(255) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, platform, external_id)
);

-- Scheduled posts
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('reddit', 'instagram', 'tiktok')),
  caption TEXT NOT NULL,
  media_url TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  external_post_id VARCHAR(255),
  external_post_url TEXT,
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  platform_account_id INTEGER REFERENCES platform_accounts(id) ON DELETE SET NULL,
  meta_json JSONB DEFAULT '{}',
  dedupe_key VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Post logs for debugging
CREATE TABLE IF NOT EXISTS post_logs (
  id SERIAL PRIMARY KEY,
  scheduled_post_id INTEGER REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  level VARCHAR(10) NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_accounts_user_platform ON platform_accounts(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_scheduled ON scheduled_posts(status, scheduled_at) WHERE status IN ('PENDING', 'RUNNING');
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_owner_created ON scheduled_posts(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_logs_scheduled_post ON post_logs(scheduled_post_id, created_at DESC);

-- Unique constraint for deduplication
ALTER TABLE scheduled_posts 
  DROP CONSTRAINT IF EXISTS uq_scheduled_posts_dedupe,
  ADD CONSTRAINT uq_scheduled_posts_dedupe UNIQUE (dedupe_key);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_platform_accounts_updated_at ON platform_accounts;
CREATE TRIGGER update_platform_accounts_updated_at 
  BEFORE UPDATE ON platform_accounts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduled_posts_updated_at ON scheduled_posts;
CREATE TRIGGER update_scheduled_posts_updated_at 
  BEFORE UPDATE ON scheduled_posts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
-- GRANT ALL ON SCHEMA social_publisher TO your_app_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA social_publisher TO your_app_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA social_publisher TO your_app_user;