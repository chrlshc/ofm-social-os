-- =========================================
-- Base de données : ofm_site
-- Description : Gestion du site web public et pages de destination
-- =========================================

-- Table des pages du site
CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    meta_description TEXT,
    meta_keywords TEXT[],
    
    -- Contenu
    content JSONB DEFAULT '{}', -- Structure de blocs de contenu
    hero_image_url TEXT,
    
    -- SEO
    og_title VARCHAR(500),
    og_description TEXT,
    og_image_url TEXT,
    canonical_url TEXT,
    
    -- Configuration
    template VARCHAR(100) DEFAULT 'default',
    layout VARCHAR(50) DEFAULT 'standard',
    is_published BOOLEAN DEFAULT false,
    is_indexed BOOLEAN DEFAULT true,
    
    -- Dates
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des articles de blog
CREATE TABLE IF NOT EXISTS blog_posts (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    
    -- Métadonnées
    author_id INTEGER,
    author_name VARCHAR(255),
    category VARCHAR(100),
    tags TEXT[],
    
    -- Images
    featured_image_url TEXT,
    featured_image_alt TEXT,
    
    -- SEO
    meta_title VARCHAR(500),
    meta_description TEXT,
    
    -- État
    status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'published', 'archived'
    
    -- Statistiques
    view_count INTEGER DEFAULT 0,
    read_time_minutes INTEGER,
    
    -- Dates
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des témoignages
CREATE TABLE IF NOT EXISTS testimonials (
    id SERIAL PRIMARY KEY,
    creator_name VARCHAR(255) NOT NULL,
    creator_username VARCHAR(100),
    creator_avatar_url TEXT,
    
    -- Contenu
    title VARCHAR(500),
    content TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    
    -- Métriques affichées
    revenue_increase VARCHAR(50),
    fan_growth VARCHAR(50),
    time_saved VARCHAR(50),
    
    -- Configuration
    is_featured BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des FAQ
CREATE TABLE IF NOT EXISTS faq_items (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    
    -- Organisation
    display_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    
    -- Statistiques
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des formulaires de contact
CREATE TABLE IF NOT EXISTS contact_submissions (
    id SERIAL PRIMARY KEY,
    
    -- Informations de contact
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    company VARCHAR(255),
    
    -- Message
    subject VARCHAR(500),
    message TEXT NOT NULL,
    form_type VARCHAR(50) DEFAULT 'contact', -- 'contact', 'demo', 'support'
    
    -- Tracking
    source_page VARCHAR(255),
    referrer_url TEXT,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    -- État
    status VARCHAR(20) DEFAULT 'new', -- 'new', 'in_progress', 'resolved', 'spam'
    assigned_to VARCHAR(255),
    notes TEXT,
    
    -- Métadonnées
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE
);

-- Table des demandes de démo
CREATE TABLE IF NOT EXISTS demo_requests (
    id SERIAL PRIMARY KEY,
    
    -- Informations du prospect
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    
    -- Profil OnlyFans
    onlyfans_username VARCHAR(100),
    monthly_revenue_range VARCHAR(50),
    subscriber_count_range VARCHAR(50),
    
    -- Besoins
    main_challenges TEXT[],
    interested_features TEXT[],
    preferred_demo_time VARCHAR(100),
    timezone VARCHAR(50),
    
    -- État
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'scheduled', 'completed', 'no_show'
    demo_scheduled_at TIMESTAMP WITH TIME ZONE,
    demo_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Suivi
    lead_score INTEGER DEFAULT 0,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des ressources téléchargeables
CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY,
    
    title VARCHAR(500) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50), -- 'ebook', 'guide', 'template', 'checklist'
    
    -- Fichiers
    file_url TEXT NOT NULL,
    file_size_bytes INTEGER,
    thumbnail_url TEXT,
    
    -- Gate de contenu
    requires_email BOOLEAN DEFAULT true,
    
    -- Statistiques
    download_count INTEGER DEFAULT 0,
    
    -- État
    is_published BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des téléchargements de ressources
CREATE TABLE IF NOT EXISTS resource_downloads (
    id SERIAL PRIMARY KEY,
    resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
    
    -- Informations du téléchargeur
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    
    -- Tracking
    download_url TEXT,
    ip_address INET,
    
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table de configuration du site
CREATE TABLE IF NOT EXISTS site_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50), -- 'string', 'number', 'boolean', 'json'
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des redirections
CREATE TABLE IF NOT EXISTS redirects (
    id SERIAL PRIMARY KEY,
    source_path VARCHAR(500) NOT NULL,
    destination_path VARCHAR(500) NOT NULL,
    redirect_type INTEGER DEFAULT 301, -- 301 ou 302
    is_active BOOLEAN DEFAULT true,
    hit_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_path)
);

-- Table des intégrations OAuth
CREATE TABLE IF NOT EXISTS oauth_integrations (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL, -- 'instagram', 'tiktok', 'reddit'
    
    -- URLs OAuth
    auth_url TEXT NOT NULL,
    token_url TEXT NOT NULL,
    callback_url TEXT NOT NULL,
    
    -- Identifiants
    client_id VARCHAR(255),
    client_secret_encrypted TEXT,
    
    -- Configuration
    scopes TEXT[],
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider)
);

-- Table d'analytics du site
CREATE TABLE IF NOT EXISTS site_analytics (
    id SERIAL PRIMARY KEY,
    
    -- Page vue
    page_path VARCHAR(500) NOT NULL,
    page_title VARCHAR(500),
    
    -- Visiteur
    visitor_id UUID,
    session_id UUID,
    
    -- Informations
    referrer_url TEXT,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    -- Dispositif
    device_type VARCHAR(20), -- 'desktop', 'mobile', 'tablet'
    browser VARCHAR(50),
    os VARCHAR(50),
    country VARCHAR(2),
    city VARCHAR(100),
    
    -- Comportement
    time_on_page_seconds INTEGER,
    bounce BOOLEAN DEFAULT false,
    
    -- Conversion
    conversion_event VARCHAR(100),
    conversion_value DECIMAL(10, 2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX idx_pages_slug ON pages(slug);
CREATE INDEX idx_pages_published ON pages(is_published, published_at DESC);
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON blog_posts(status, published_at DESC);
CREATE INDEX idx_blog_posts_category ON blog_posts(category);
CREATE INDEX idx_testimonials_published ON testimonials(is_published, display_order);
CREATE INDEX idx_faq_items_category ON faq_items(category, display_order);
CREATE INDEX idx_contact_submissions_status ON contact_submissions(status, created_at DESC);
CREATE INDEX idx_demo_requests_status ON demo_requests(status);
CREATE INDEX idx_demo_requests_email ON demo_requests(email);
CREATE INDEX idx_resources_type ON resources(resource_type);
CREATE INDEX idx_resource_downloads_email ON resource_downloads(email);
CREATE INDEX idx_site_settings_key ON site_settings(setting_key);
CREATE INDEX idx_redirects_source ON redirects(source_path);
CREATE INDEX idx_site_analytics_page ON site_analytics(page_path, created_at DESC);
CREATE INDEX idx_site_analytics_visitor ON site_analytics(visitor_id);

-- Données initiales pour les pages principales
INSERT INTO pages (slug, title, meta_description, template, is_published) VALUES
('home', 'OFM IA - Automatisez votre OnlyFans avec l''IA', 'Maximisez vos revenus OnlyFans avec notre plateforme d''automatisation IA', 'home', true),
('features', 'Fonctionnalités - OFM IA', 'Découvrez toutes les fonctionnalités de notre plateforme d''automatisation OnlyFans', 'features', true),
('pricing', 'Tarifs - OFM IA', 'Plans et tarifs adaptés à tous les créateurs OnlyFans', 'pricing', true),
('about', 'À propos - OFM IA', 'Découvrez l''équipe et la mission d''OFM IA', 'about', true),
('contact', 'Contact - OFM IA', 'Contactez notre équipe pour toute question', 'contact', true),
('privacy', 'Politique de confidentialité - OFM IA', 'Notre engagement pour la protection de vos données', 'legal', true),
('terms', 'Conditions d''utilisation - OFM IA', 'Conditions générales d''utilisation de la plateforme OFM IA', 'legal', true);

-- Données initiales pour les paramètres du site
INSERT INTO site_settings (setting_key, setting_value, setting_type, description) VALUES
('site_name', '"OFM IA"', 'string', 'Nom du site'),
('tagline', '"Automatisez votre OnlyFans avec l''IA"', 'string', 'Slogan du site'),
('contact_email', '"contact@huntaze.com"', 'string', 'Email de contact principal'),
('social_links', '{"instagram": "https://instagram.com/ofm_ia", "twitter": "https://twitter.com/ofm_ia"}', 'json', 'Liens vers les réseaux sociaux');

-- Triggers pour updated_at
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_testimonials_updated_at BEFORE UPDATE ON testimonials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faq_items_updated_at BEFORE UPDATE ON faq_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_demo_requests_updated_at BEFORE UPDATE ON demo_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON site_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_integrations_updated_at BEFORE UPDATE ON oauth_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();