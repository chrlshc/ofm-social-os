-- =========================================
-- Base de données : ofm_payment
-- Description : Gestion des paiements et transactions Stripe
-- =========================================

-- Table des comptes Stripe Connect
CREATE TABLE IF NOT EXISTS stripe_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    stripe_account_id VARCHAR(255) UNIQUE NOT NULL,
    account_type VARCHAR(50) DEFAULT 'express', -- 'express', 'standard', 'custom'
    charges_enabled BOOLEAN DEFAULT false,
    payouts_enabled BOOLEAN DEFAULT false,
    details_submitted BOOLEAN DEFAULT false,
    country VARCHAR(2),
    currency VARCHAR(3) DEFAULT 'EUR',
    business_type VARCHAR(50),
    company_name VARCHAR(255),
    requirements JSONB DEFAULT '{}',
    capabilities JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des clients Stripe
CREATE TABLE IF NOT EXISTS stripe_customers (
    id SERIAL PRIMARY KEY,
    fan_id INTEGER NOT NULL UNIQUE,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    name VARCHAR(255),
    default_payment_method VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des méthodes de paiement
CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    stripe_customer_id VARCHAR(255) REFERENCES stripe_customers(stripe_customer_id),
    stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50), -- 'card', 'sepa_debit', 'ideal', etc.
    brand VARCHAR(50), -- 'visa', 'mastercard', etc.
    last4 VARCHAR(4),
    exp_month INTEGER,
    exp_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des abonnements Stripe
CREATE TABLE IF NOT EXISTS stripe_subscriptions (
    id SERIAL PRIMARY KEY,
    subscription_id VARCHAR(255) UNIQUE NOT NULL,
    creator_stripe_account_id VARCHAR(255) REFERENCES stripe_accounts(stripe_account_id),
    customer_stripe_id VARCHAR(255) REFERENCES stripe_customers(stripe_customer_id),
    status VARCHAR(50), -- 'active', 'past_due', 'canceled', 'incomplete', etc.
    price_id VARCHAR(255),
    amount DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    interval VARCHAR(20), -- 'month', 'year'
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des transactions/paiements
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    transaction_id UUID DEFAULT gen_random_uuid(),
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    creator_id INTEGER NOT NULL,
    fan_id INTEGER,
    type VARCHAR(50) NOT NULL, -- 'subscription', 'tip', 'content_purchase', 'message_unlock'
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'succeeded', 'failed', 'refunded'
    platform_fee DECIMAL(10, 2),
    creator_earnings DECIMAL(10, 2),
    stripe_fee DECIMAL(10, 2),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    failure_reason TEXT,
    refund_reason TEXT,
    refunded_amount DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des factures
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    stripe_invoice_id VARCHAR(255) UNIQUE,
    subscription_id VARCHAR(255) REFERENCES stripe_subscriptions(subscription_id),
    customer_stripe_id VARCHAR(255) REFERENCES stripe_customers(stripe_customer_id),
    invoice_number VARCHAR(100),
    amount_due DECIMAL(10, 2),
    amount_paid DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(50), -- 'draft', 'open', 'paid', 'void', 'uncollectible'
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    invoice_pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des soldes de paiement des créateurs
CREATE TABLE IF NOT EXISTS creator_balances (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL UNIQUE,
    available_balance DECIMAL(10, 2) DEFAULT 0,
    pending_balance DECIMAL(10, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'EUR',
    last_payout_date DATE,
    next_payout_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des versements (payouts)
CREATE TABLE IF NOT EXISTS payouts (
    id SERIAL PRIMARY KEY,
    stripe_payout_id VARCHAR(255) UNIQUE,
    creator_id INTEGER NOT NULL,
    stripe_account_id VARCHAR(255) REFERENCES stripe_accounts(stripe_account_id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(50), -- 'pending', 'in_transit', 'paid', 'failed', 'canceled'
    arrival_date DATE,
    method VARCHAR(50) DEFAULT 'standard', -- 'standard', 'instant'
    destination_type VARCHAR(50), -- 'bank_account', 'card'
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des remboursements
CREATE TABLE IF NOT EXISTS refunds (
    id SERIAL PRIMARY KEY,
    stripe_refund_id VARCHAR(255) UNIQUE,
    transaction_id INTEGER REFERENCES transactions(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    reason VARCHAR(100), -- 'duplicate', 'fraudulent', 'requested_by_customer'
    status VARCHAR(50), -- 'pending', 'succeeded', 'failed', 'canceled'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des webhooks Stripe
CREATE TABLE IF NOT EXISTS stripe_webhooks (
    id SERIAL PRIMARY KEY,
    stripe_event_id VARCHAR(255) UNIQUE,
    type VARCHAR(100) NOT NULL,
    livemode BOOLEAN DEFAULT false,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des prix/tarifs
CREATE TABLE IF NOT EXISTS pricing_plans (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    stripe_price_id VARCHAR(255) UNIQUE,
    stripe_product_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    interval VARCHAR(20) DEFAULT 'month', -- 'month', 'year'
    interval_count INTEGER DEFAULT 1,
    trial_days INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    features JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table des coupons de réduction
CREATE TABLE IF NOT EXISTS discount_coupons (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL,
    stripe_coupon_id VARCHAR(255) UNIQUE,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255),
    percent_off INTEGER, -- OU amount_off, un des deux
    amount_off DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    duration VARCHAR(20), -- 'once', 'repeating', 'forever'
    duration_in_months INTEGER,
    max_redemptions INTEGER,
    times_redeemed INTEGER DEFAULT 0,
    valid BOOLEAN DEFAULT true,
    redeem_by DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX idx_stripe_accounts_user ON stripe_accounts(user_id);
CREATE INDEX idx_stripe_customers_fan ON stripe_customers(fan_id);
CREATE INDEX idx_payment_methods_customer ON payment_methods(stripe_customer_id);
CREATE INDEX idx_stripe_subscriptions_account ON stripe_subscriptions(creator_stripe_account_id);
CREATE INDEX idx_stripe_subscriptions_customer ON stripe_subscriptions(customer_stripe_id);
CREATE INDEX idx_stripe_subscriptions_status ON stripe_subscriptions(status);
CREATE INDEX idx_transactions_creator ON transactions(creator_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_stripe_id);
CREATE INDEX idx_payouts_creator ON payouts(creator_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_refunds_transaction ON refunds(transaction_id);
CREATE INDEX idx_stripe_webhooks_type ON stripe_webhooks(type);
CREATE INDEX idx_stripe_webhooks_processed ON stripe_webhooks(processed);
CREATE INDEX idx_pricing_plans_creator ON pricing_plans(creator_id);

-- Fonction pour calculer les revenus
CREATE OR REPLACE FUNCTION calculate_creator_revenue(creator_id_param INTEGER, start_date DATE, end_date DATE)
RETURNS TABLE(
    total_revenue DECIMAL(10, 2),
    total_fees DECIMAL(10, 2),
    net_revenue DECIMAL(10, 2),
    transaction_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COALESCE(SUM(platform_fee + stripe_fee), 0) as total_fees,
        COALESCE(SUM(creator_earnings), 0) as net_revenue,
        COUNT(*) as transaction_count
    FROM transactions
    WHERE creator_id = creator_id_param
        AND status = 'succeeded'
        AND created_at >= start_date
        AND created_at <= end_date;
END;
$$ LANGUAGE plpgsql;

-- Triggers pour updated_at
CREATE TRIGGER update_stripe_accounts_updated_at BEFORE UPDATE ON stripe_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_customers_updated_at BEFORE UPDATE ON stripe_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_subscriptions_updated_at BEFORE UPDATE ON stripe_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_creator_balances_updated_at BEFORE UPDATE ON creator_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_plans_updated_at BEFORE UPDATE ON pricing_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();