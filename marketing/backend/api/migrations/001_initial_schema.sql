-- Migration 001: Initial Schema Setup
-- This creates the base tables for the marketing system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Users table (if not exists from main schema)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create updated_at trigger for users
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Content plans table
CREATE TABLE IF NOT EXISTS content_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID,
    content_ref VARCHAR(255),
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'twitter', 'reddit')),
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    caption TEXT,
    hashtags TEXT[],
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'POSTED', 'FAILED')),
    metadata JSONB DEFAULT '{}',
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for content_plans
CREATE INDEX idx_content_plans_user_scheduled ON content_plans(user_id, scheduled_time);
CREATE INDEX idx_content_plans_platform_status ON content_plans(platform, status);
CREATE INDEX idx_content_plans_scheduled_time ON content_plans(scheduled_time);

-- Create updated_at trigger for content_plans
CREATE TRIGGER update_content_plans_updated_at BEFORE UPDATE ON content_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Top profiles table
CREATE TABLE IF NOT EXISTS top_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform VARCHAR(50) NOT NULL,
    username VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    bio TEXT,
    profile_pic_url TEXT,
    followers_count INTEGER,
    following_count INTEGER,
    posts_count INTEGER,
    likes_count BIGINT,
    category VARCHAR(100),
    cluster INTEGER,
    metadata JSONB DEFAULT '{}',
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, username)
);

-- Indexes for top_profiles
CREATE INDEX idx_top_profiles_category ON top_profiles(category);
CREATE INDEX idx_top_profiles_cluster ON top_profiles(cluster);
CREATE INDEX idx_top_profiles_followers ON top_profiles(followers_count);

-- Create updated_at trigger for top_profiles
CREATE TRIGGER update_top_profiles_updated_at BEFORE UPDATE ON top_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ML models metadata table
CREATE TABLE IF NOT EXISTS ml_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(255) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    version INTEGER DEFAULT 1,
    parameters JSONB DEFAULT '{}',
    performance_metrics JSONB DEFAULT '{}',
    model_data TEXT, -- Base64 encoded model data or S3 reference
    is_active BOOLEAN DEFAULT true,
    trained_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create updated_at trigger for ml_models
CREATE TRIGGER update_ml_models_updated_at BEFORE UPDATE ON ml_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Scraping history table
CREATE TABLE IF NOT EXISTS scraping_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    platforms_scraped JSONB DEFAULT '{}',
    profiles_success INTEGER DEFAULT 0,
    profiles_failed INTEGER DEFAULT 0,
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Record this migration
INSERT INTO schema_migrations (version) VALUES ('001_initial_schema.sql');