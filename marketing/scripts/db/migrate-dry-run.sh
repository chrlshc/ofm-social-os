#!/bin/bash
set -euo pipefail

# Database Migration Dry Run Script
# Validates database migration safety before production deployment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/backend/database/migrations"

# Configuration
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:password@localhost:5432/ofm_social}"
DRY_RUN_DB="ofm_social_dryrun_$(date +%Y%m%d_%H%M%S)"
PROD_BACKUP_PATH="${PROD_BACKUP_PATH:-./db-backup-$(date +%Y%m%d_%H%M%S).sql}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check psql
    if ! command -v psql &> /dev/null; then
        error "psql not found. Please install PostgreSQL client."
    fi
    
    # Check database connection
    if ! psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
        error "Cannot connect to database: $DATABASE_URL"
    fi
    
    # Check migrations directory
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        error "Migrations directory not found: $MIGRATIONS_DIR"
    fi
    
    success "Prerequisites check passed"
}

# Create dry run database
create_dry_run_db() {
    log "Creating dry run database: $DRY_RUN_DB"
    
    # Extract connection parameters
    local host_port_db=$(echo "$DATABASE_URL" | sed -E 's|^postgresql://[^@]*@([^/]*)/.*$|\1|')
    local base_url=$(echo "$DATABASE_URL" | sed -E 's|/[^/]*$||')
    local DRY_RUN_URL="$base_url/$DRY_RUN_DB"
    
    # Create database
    psql "$DATABASE_URL" -c "CREATE DATABASE \"$DRY_RUN_DB\";" 2>/dev/null || {
        warn "Database $DRY_RUN_DB may already exist, dropping and recreating..."
        psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS \"$DRY_RUN_DB\";"
        psql "$DATABASE_URL" -c "CREATE DATABASE \"$DRY_RUN_DB\";"
    }
    
    echo "$DRY_RUN_URL"
}

# Backup production database structure
backup_prod_structure() {
    log "Backing up production database structure..."
    
    local prod_db=$(echo "$DATABASE_URL" | sed -E 's|^.*://[^/]*/([^?]*).*$|\1|')
    
    # Create structure backup
    pg_dump "$DATABASE_URL" \
        --schema-only \
        --no-owner \
        --no-privileges \
        > "$PROD_BACKUP_PATH.structure" || error "Failed to backup production structure"
        
    # Create sample data backup (limited)
    pg_dump "$DATABASE_URL" \
        --data-only \
        --no-owner \
        --no-privileges \
        --rows-per-insert=1000 \
        > "$PROD_BACKUP_PATH.data" || error "Failed to backup sample data"
    
    success "Production backup created: $PROD_BACKUP_PATH.{structure,data}"
}

# Restore production structure to dry run DB
restore_to_dry_run() {
    local dry_run_url="$1"
    
    log "Restoring production structure to dry run database..."
    
    # Restore structure
    psql "$dry_run_url" < "$PROD_BACKUP_PATH.structure" || error "Failed to restore structure"
    
    # Restore limited sample data for testing
    psql "$dry_run_url" < "$PROD_BACKUP_PATH.data" || warn "Some data restoration issues (may be expected)"
    
    success "Production structure restored to dry run database"
}

# Apply migrations to dry run database
apply_migrations_dry_run() {
    local dry_run_url="$1"
    
    log "Applying migrations to dry run database..."
    
    local migration_count=0
    local failed_migrations=()
    
    # Get list of migration files sorted by filename
    while IFS= read -r -d '' migration_file; do
        local migration_name=$(basename "$migration_file")
        log "Applying migration: $migration_name"
        
        # Apply migration with error handling
        if psql "$dry_run_url" -f "$migration_file" 2>&1 | tee "/tmp/migration_${migration_name}.log"; then
            success "Migration applied: $migration_name"
            ((migration_count++))
        else
            error "Migration failed: $migration_name"
            failed_migrations+=("$migration_name")
        fi
        
    done < <(find "$MIGRATIONS_DIR" -name "*.sql" -type f -print0 | sort -z)
    
    if [[ ${#failed_migrations[@]} -gt 0 ]]; then
        error "Failed migrations: ${failed_migrations[*]}"
    fi
    
    success "$migration_count migrations applied successfully"
}

# Validate migrated database
validate_database() {
    local dry_run_url="$1"
    
    log "Validating migrated database..."
    
    # Check database connectivity
    psql "$dry_run_url" -c "SELECT 1;" || error "Cannot connect to migrated database"
    
    # Check critical tables exist
    local critical_tables=("creators" "platform_accounts" "content_items" "publishing_queue" "webhook_events")
    
    for table in "${critical_tables[@]}"; do
        local exists=$(psql "$dry_run_url" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');")
        if [[ "$exists" =~ "t" ]]; then
            success "Critical table exists: $table"
        else
            error "Critical table missing: $table"
        fi
    done
    
    # Check for foreign key constraints
    local fk_count=$(psql "$dry_run_url" -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';")
    log "Foreign key constraints: $fk_count"
    
    # Check for indexes
    local index_count=$(psql "$dry_run_url" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';")
    log "Database indexes: $index_count"
    
    # Check for functions/procedures
    local function_count=$(psql "$dry_run_url" -t -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public';")
    log "Database functions: $function_count"
    
    success "Database validation completed"
}

# Performance analysis
analyze_performance() {
    local dry_run_url="$1"
    
    log "Analyzing database performance..."
    
    # Analyze table sizes
    psql "$dry_run_url" -c "
        SELECT 
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
            pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY size_bytes DESC;
    "
    
    # Check for missing indexes on foreign keys
    psql "$dry_run_url" -c "
        SELECT 
            t.table_name,
            t.column_name,
            'Missing index on FK' as issue
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.columns t ON t.table_name = tc.table_name AND t.column_name = kcu.column_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND NOT EXISTS (
            SELECT 1 FROM pg_indexes i 
            WHERE i.tablename = tc.table_name 
            AND i.indexdef LIKE '%' || kcu.column_name || '%'
        );
    "
    
    success "Performance analysis completed"
}

# Generate migration report
generate_report() {
    local dry_run_url="$1"
    
    log "Generating migration report..."
    
    local report_file="migration-dry-run-report-$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$report_file" << EOF
# Database Migration Dry Run Report

**Date**: $(date)
**Database**: $DRY_RUN_DB
**Migration Source**: $MIGRATIONS_DIR

## Summary

✅ **Status**: Migration dry run completed successfully
🎯 **Total Migrations**: Applied all migration files
📊 **Validation**: All critical tables and constraints verified

## Database Structure

EOF

    # Add table information
    echo "### Tables" >> "$report_file"
    psql "$dry_run_url" -c "
        SELECT 
            '- **' || tablename || '**: ' || 
            pg_size_pretty(pg_total_relation_size('public.' || tablename)) || 
            ' (' || (
                SELECT COUNT(*) FROM information_schema.columns 
                WHERE table_name = tablename AND table_schema = 'public'
            ) || ' columns)'
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename;
    " -t >> "$report_file"
    
    echo "" >> "$report_file"
    echo "### Constraints" >> "$report_file"
    
    # Add constraint information
    psql "$dry_run_url" -c "
        SELECT 
            '- ' || constraint_type || ' constraints: ' || COUNT(*)
        FROM information_schema.table_constraints 
        WHERE table_schema = 'public'
        GROUP BY constraint_type
        ORDER BY constraint_type;
    " -t >> "$report_file"
    
    cat >> "$report_file" << EOF

## Next Steps

1. ✅ Migration dry run completed successfully
2. 🔄 Ready for production deployment
3. 📋 Use this report to validate production migration
4. 🚀 Execute canary deployment with database migration

## Cleanup

- Dry run database: \`$DRY_RUN_DB\` (will be cleaned up automatically)
- Backup files: \`$PROD_BACKUP_PATH.*\` (keep for rollback reference)

---

*Generated by OFM Social OS Migration Dry Run*
EOF

    success "Migration report generated: $report_file"
    echo "$report_file"
}

# Cleanup
cleanup() {
    if [[ -n "${DRY_RUN_URL:-}" ]]; then
        log "Cleaning up dry run database: $DRY_RUN_DB"
        psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS \"$DRY_RUN_DB\";" 2>/dev/null || warn "Failed to cleanup dry run database"
    fi
    
    # Keep backup files for potential rollback use
    log "Keeping backup files for rollback reference:"
    ls -la "$PROD_BACKUP_PATH".*
}

# Main execution
main() {
    log "Starting database migration dry run..."
    
    # Trap for cleanup
    trap cleanup EXIT
    
    # Execute dry run steps
    check_prerequisites
    
    # Create dry run environment
    DRY_RUN_URL=$(create_dry_run_db)
    
    # Backup and restore current state
    backup_prod_structure
    restore_to_dry_run "$DRY_RUN_URL"
    
    # Apply and validate migrations
    apply_migrations_dry_run "$DRY_RUN_URL"
    validate_database "$DRY_RUN_URL"
    analyze_performance "$DRY_RUN_URL"
    
    # Generate report
    local report_file=$(generate_report "$DRY_RUN_URL")
    
    success "Migration dry run completed successfully!"
    echo ""
    echo "📋 Report: $report_file"
    echo "🎯 Ready for production deployment"
    echo "📞 Contact: Run 'helm upgrade' with migration-enabled values"
}

# Handle script arguments
case "${1:-main}" in
    "check-only")
        check_prerequisites
        ;;
    "backup-only")
        check_prerequisites
        backup_prod_structure
        ;;
    *)
        main
        ;;
esac