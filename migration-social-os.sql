-- Migration Social OS - Integration with existing system
-- Apply this after your existing schema

-- Add Stripe fields to users table if not exists
DO $$ 
BEGIN
    -- Add stripe_account_id if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'stripe_account_id'
    ) THEN
        ALTER TABLE users ADD COLUMN stripe_account_id VARCHAR(255);
    END IF;
    
    -- Add stripe_onboarding_complete if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'stripe_onboarding_complete'
    ) THEN
        ALTER TABLE users ADD COLUMN stripe_onboarding_complete BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Add updated_at if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Create indexes for Stripe fields
CREATE INDEX IF NOT EXISTS idx_users_stripe_account_id ON users(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_onboarding ON users(stripe_onboarding_complete);

-- Ensure social_publisher schema exists (from previous migration)
-- Just verify the tables exist
DO $$ 
BEGIN
    -- Check if schema exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata 
        WHERE schema_name = 'social_publisher'
    ) THEN
        RAISE EXCEPTION 'Schema social_publisher does not exist. Please run schema.sql first.';
    END IF;
    
    -- Check if tables exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'social_publisher' 
        AND table_name = 'platform_accounts'
    ) THEN
        RAISE EXCEPTION 'Table social_publisher.platform_accounts does not exist. Please run schema.sql first.';
    END IF;
END $$;

-- Add any missing columns to platform_accounts
ALTER TABLE social_publisher.platform_accounts 
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;

-- Add any missing columns to scheduled_posts
ALTER TABLE social_publisher.scheduled_posts 
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;

-- Create view for user dashboard
CREATE OR REPLACE VIEW social_publisher.user_social_stats AS
SELECT 
    u.id as user_id,
    u.email,
    u.stripe_account_id,
    u.stripe_onboarding_complete,
    COUNT(DISTINCT pa.id) as connected_accounts,
    COUNT(DISTINCT pa.platform) as connected_platforms,
    COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'SUCCEEDED') as successful_posts,
    COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'FAILED') as failed_posts,
    COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'PENDING') as pending_posts,
    MAX(sp.created_at) as last_post_at
FROM users u
LEFT JOIN social_publisher.platform_accounts pa ON u.id = pa.user_id
LEFT JOIN social_publisher.scheduled_posts sp ON u.id = sp.owner_id
GROUP BY u.id, u.email, u.stripe_account_id, u.stripe_onboarding_complete;

-- Grant permissions (adjust based on your user)
GRANT SELECT ON social_publisher.user_social_stats TO PUBLIC;

-- Add helper function to check social features access
CREATE OR REPLACE FUNCTION social_publisher.can_use_social_features(p_user_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_stripe_complete BOOLEAN;
BEGIN
    -- Check if user has completed Stripe onboarding
    SELECT stripe_onboarding_complete 
    INTO v_stripe_complete
    FROM users 
    WHERE id = p_user_id;
    
    -- Add more business logic here (subscription status, etc.)
    RETURN COALESCE(v_stripe_complete, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Sample data for testing (optional)
-- INSERT INTO users (id, email, stripe_onboarding_complete) 
-- VALUES (1, 'test@example.com', true) 
-- ON CONFLICT (id) DO NOTHING;