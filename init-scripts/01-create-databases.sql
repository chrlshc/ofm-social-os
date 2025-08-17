-- Create databases for all services
CREATE DATABASE IF NOT EXISTS ofm_production;
CREATE DATABASE IF NOT EXISTS ofm_marketing;
CREATE DATABASE IF NOT EXISTS ofm_payment;
CREATE DATABASE IF NOT EXISTS ofm_onboarding;
CREATE DATABASE IF NOT EXISTS ofm_kpi;
CREATE DATABASE IF NOT EXISTS ofm_outreach;

-- Create user if not exists
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_user
      WHERE  usename = 'ofm_prod') THEN

      CREATE USER ofm_prod WITH ENCRYPTED PASSWORD 'changeme';
   END IF;
END
$do$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE ofm_production TO ofm_prod;
GRANT ALL PRIVILEGES ON DATABASE ofm_marketing TO ofm_prod;
GRANT ALL PRIVILEGES ON DATABASE ofm_payment TO ofm_prod;
GRANT ALL PRIVILEGES ON DATABASE ofm_onboarding TO ofm_prod;
GRANT ALL PRIVILEGES ON DATABASE ofm_kpi TO ofm_prod;
GRANT ALL PRIVILEGES ON DATABASE ofm_outreach TO ofm_prod;

-- Enable required extensions
\c ofm_production
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c ofm_marketing
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c ofm_payment
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c ofm_onboarding
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\c ofm_kpi
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

\c ofm_outreach
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";