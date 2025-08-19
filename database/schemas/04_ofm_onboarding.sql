-- =========================================
-- Base de données : ofm_onboarding
-- Description : Gestion du processus d'onboarding des créateurs
-- =========================================

-- Table des étapes d'onboarding
CREATE TABLE IF NOT EXISTS onboarding_steps (
    id SERIAL PRIMARY KEY,
    step_key VARCHAR(100) UNIQUE NOT NULL,
    step_order INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT true,
    icon VARCHAR(100),
    estimated_time_minutes INTEGER,
    help_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table de progression d'onboarding par utilisateur
CREATE TABLE IF NOT EXISTS user_onboarding_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    step_id INTEGER REFERENCES onboarding_steps(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'skipped'
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    data JSONB DEFAULT '{}', -- Données spécifiques à l'étape
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, step_id)
);

-- Table des sessions d'onboarding
CREATE TABLE IF NOT EXISTS onboarding_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    session_id UUID DEFAULT gen_random_uuid(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_duration_seconds INTEGER,
    completion_percentage INTEGER DEFAULT 0,
    device_info JSONB DEFAULT '{}',
    ip_address INET,
    abandoned BOOLEAN DEFAULT false,
    abandoned_at_step INTEGER REFERENCES onboarding_steps(id)
);

-- Table des formulaires d'onboarding
CREATE TABLE IF NOT EXISTS onboarding_forms (
    id SERIAL PRIMARY KEY,
    step_id INTEGER REFERENCES onboarding_steps(id) ON DELETE CASCADE,
    form_key VARCHAR(100) UNIQUE NOT NULL,
    form_schema JSONB NOT NULL, -- JSON Schema du formulaire
    validation_rules JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des réponses aux formulaires
CREATE TABLE IF NOT EXISTS form_responses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    form_id INTEGER REFERENCES onboarding_forms(id) ON DELETE CASCADE,
    responses JSONB NOT NULL,
    is_valid BOOLEAN DEFAULT true,
    validation_errors JSONB DEFAULT '{}',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table de vérification d'identité
CREATE TABLE IF NOT EXISTS identity_verifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    verification_type VARCHAR(50), -- 'id_card', 'passport', 'driver_license'
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'approved', 'rejected'
    provider VARCHAR(50), -- 'stripe_identity', 'onfido', 'manual'
    provider_verification_id VARCHAR(255),
    document_front_url TEXT,
    document_back_url TEXT,
    selfie_url TEXT,
    rejection_reason TEXT,
    verified_data JSONB DEFAULT '{}',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE,
    expires_at DATE
);

-- Table de consentement OnlyFans
CREATE TABLE IF NOT EXISTS onlyfans_consent (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    has_onlyfans_account BOOLEAN DEFAULT false,
    onlyfans_username VARCHAR(255),
    onlyfans_url TEXT,
    consent_given BOOLEAN DEFAULT false,
    consent_text TEXT,
    ip_address INET,
    user_agent TEXT,
    consented_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table de configuration du profil créateur
CREATE TABLE IF NOT EXISTS creator_profile_setup (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    stage VARCHAR(50) DEFAULT 'basic_info', -- 'basic_info', 'content_preferences', 'pricing', 'ai_setup'
    profile_data JSONB DEFAULT '{}',
    content_categories TEXT[],
    target_audience JSONB DEFAULT '{}',
    pricing_tier VARCHAR(50),
    subscription_price DECIMAL(10, 2),
    ai_personality_configured BOOLEAN DEFAULT false,
    social_links_added BOOLEAN DEFAULT false,
    profile_photo_uploaded BOOLEAN DEFAULT false,
    bio_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des invitations et parrainages
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_user_id INTEGER,
    referred_email VARCHAR(255) NOT NULL,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'signed_up', 'completed', 'expired'
    referred_user_id INTEGER,
    reward_type VARCHAR(50), -- 'percentage', 'fixed_amount', 'free_month'
    reward_value DECIMAL(10, 2),
    signed_up_at TIMESTAMP WITH TIME ZONE,
    onboarding_completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des tutoriels et guides
CREATE TABLE IF NOT EXISTS onboarding_tutorials (
    id SERIAL PRIMARY KEY,
    step_id INTEGER REFERENCES onboarding_steps(id) ON DELETE CASCADE,
    tutorial_type VARCHAR(50), -- 'video', 'interactive', 'article'
    title VARCHAR(255) NOT NULL,
    content TEXT,
    video_url TEXT,
    duration_seconds INTEGER,
    order_index INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table de suivi des tutoriels vus
CREATE TABLE IF NOT EXISTS tutorial_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    tutorial_id INTEGER REFERENCES onboarding_tutorials(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    completion_percentage INTEGER DEFAULT 0,
    last_position_seconds INTEGER DEFAULT 0,
    UNIQUE(user_id, tutorial_id)
);

-- Table des notifications d'onboarding
CREATE TABLE IF NOT EXISTS onboarding_notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    notification_type VARCHAR(50), -- 'reminder', 'tip', 'achievement', 'warning'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN DEFAULT false,
    is_dismissed BOOLEAN DEFAULT false,
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des métriques d'onboarding
CREATE TABLE IF NOT EXISTS onboarding_metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    metric_type VARCHAR(50), -- 'time_to_complete', 'abandonment_rate', 'step_duration'
    metric_value DECIMAL(10, 2),
    step_id INTEGER REFERENCES onboarding_steps(id),
    measured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX idx_user_onboarding_progress_user ON user_onboarding_progress(user_id);
CREATE INDEX idx_user_onboarding_progress_status ON user_onboarding_progress(status);
CREATE INDEX idx_onboarding_sessions_user ON onboarding_sessions(user_id);
CREATE INDEX idx_form_responses_user ON form_responses(user_id);
CREATE INDEX idx_identity_verifications_user ON identity_verifications(user_id);
CREATE INDEX idx_identity_verifications_status ON identity_verifications(status);
CREATE INDEX idx_onlyfans_consent_user ON onlyfans_consent(user_id);
CREATE INDEX idx_creator_profile_setup_user ON creator_profile_setup(user_id);
CREATE INDEX idx_referrals_code ON referrals(referral_code);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX idx_tutorial_progress_user ON tutorial_progress(user_id);
CREATE INDEX idx_onboarding_notifications_user ON onboarding_notifications(user_id);
CREATE INDEX idx_onboarding_notifications_read ON onboarding_notifications(is_read);
CREATE INDEX idx_onboarding_metrics_user ON onboarding_metrics(user_id);

-- Fonction pour calculer le pourcentage de complétion
CREATE OR REPLACE FUNCTION calculate_onboarding_completion(user_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
    total_required_steps INTEGER;
    completed_required_steps INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_required_steps
    FROM onboarding_steps
    WHERE is_required = true;
    
    SELECT COUNT(*) INTO completed_required_steps
    FROM user_onboarding_progress uop
    JOIN onboarding_steps os ON uop.step_id = os.id
    WHERE uop.user_id = user_id_param
        AND uop.status = 'completed'
        AND os.is_required = true;
    
    IF total_required_steps = 0 THEN
        RETURN 100;
    END IF;
    
    RETURN (completed_required_steps * 100) / total_required_steps;
END;
$$ LANGUAGE plpgsql;

-- Données initiales pour les étapes d'onboarding
INSERT INTO onboarding_steps (step_key, step_order, title, description, is_required, estimated_time_minutes) VALUES
('account_creation', 1, 'Création du compte', 'Créez votre compte avec email et mot de passe', true, 2),
('email_verification', 2, 'Vérification email', 'Confirmez votre adresse email', true, 1),
('profile_basics', 3, 'Informations de base', 'Nom, photo de profil et bio', true, 5),
('content_preferences', 4, 'Préférences de contenu', 'Choisissez vos catégories de contenu', true, 3),
('onlyfans_consent', 5, 'Consentement OnlyFans', 'Confirmez votre compte OnlyFans existant', false, 2),
('identity_verification', 6, 'Vérification d''identité', 'Vérifiez votre identité pour les paiements', true, 10),
('stripe_setup', 7, 'Configuration Stripe', 'Configurez votre compte pour recevoir des paiements', true, 15),
('pricing_setup', 8, 'Tarification', 'Définissez vos prix d''abonnement', true, 5),
('ai_configuration', 9, 'Configuration IA', 'Personnalisez votre assistant IA', false, 10),
('social_accounts', 10, 'Réseaux sociaux', 'Connectez vos comptes sociaux', false, 5),
('welcome_tutorial', 11, 'Tutoriel de bienvenue', 'Apprenez à utiliser la plateforme', false, 15);

-- Triggers pour updated_at
CREATE TRIGGER update_onboarding_steps_updated_at BEFORE UPDATE ON onboarding_steps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_onboarding_progress_updated_at BEFORE UPDATE ON user_onboarding_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_form_responses_updated_at BEFORE UPDATE ON form_responses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_creator_profile_setup_updated_at BEFORE UPDATE ON creator_profile_setup
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();