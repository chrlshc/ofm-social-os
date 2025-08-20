-- Add idempotence constraint to scheduled_posts
-- First check if constraint exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_scheduled_posts_dedupe'
    ) THEN
        ALTER TABLE social_publisher.scheduled_posts 
        ADD CONSTRAINT uq_scheduled_posts_dedupe UNIQUE (dedupe_key);
        RAISE NOTICE 'Constraint uq_scheduled_posts_dedupe added successfully';
    ELSE
        RAISE NOTICE 'Constraint uq_scheduled_posts_dedupe already exists';
    END IF;
END $$;