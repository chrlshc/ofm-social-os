#!/bin/bash
# Run all database migrations

set -e

echo "Running database migrations..."

# Marketing migrations
echo "Running marketing migrations..."
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/001_initial_schema.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/002_temporal_migration.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/003_llm_budgets.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/004_bootstrap_runtime.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/005_security_hardening.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/006_webhook_events.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/007_media_pipeline.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/008_multi_account_scaling.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/009_backup_dr_slos_gdpr.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_marketing -f /migrations/marketing/010_audit_and_rbac.sql

# KPI migrations
echo "Running KPI migrations..."
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_kpi -f /migrations/kpi/adaptive_windows.sql

# Outreach migrations
echo "Running outreach migrations..."
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_outreach -f /migrations/outreach/001_production_improvements.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_outreach -f /migrations/outreach/002_backpressure_per_account.sql
PGPASSWORD=$POSTGRES_PASSWORD psql -h postgres -U $POSTGRES_USER -d ofm_outreach -f /migrations/outreach/003_instagram_sessions.sql

echo "All migrations completed successfully!"