#!/bin/bash
set -euo pipefail

# Point-in-Time Recovery (PITR) using pgBackRest
# This script restores PostgreSQL to a specific point in time

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/pgbackrest.conf"
LOG_LEVEL="${LOG_LEVEL:-info}"
RESTORE_ID="pitr-$(date +%Y%m%d-%H%M%S)"
START_TIME=$(date +%s%3N)

# Default values
DEFAULT_TARGET_TIME=""
DEFAULT_TARGET_NAME=""
DEFAULT_TARGET_LSN=""
DEFAULT_DATA_DIR="/var/lib/postgresql/data_restore"
DEFAULT_PORT="5433"

# Load environment variables
if [[ -f "${SCRIPT_DIR}/../../.env" ]]; then
    set -a
    source "${SCRIPT_DIR}/../../.env"
    set +a
fi

# Parse command line arguments
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Point-in-Time Recovery options:
    --to-time TIMESTAMP     Restore to specific timestamp (ISO 8601)
    --to-name NAME          Restore to named recovery point
    --to-lsn LSN           Restore to specific LSN
    --latest               Restore to latest available point
    --data-dir DIR         Target directory for restored data (default: $DEFAULT_DATA_DIR)
    --port PORT            PostgreSQL port for restored instance (default: $DEFAULT_PORT)
    --verify-only          Only verify backup without performing restore
    --dry-run              Show what would be restored without doing it
    
Examples:
    $0 --to-time "2025-08-12T10:30:00Z"
    $0 --to-name "before_migration"
    $0 --latest
    $0 --verify-only

EOF
    exit 1
}

# Parse arguments
TARGET_TIME="$DEFAULT_TARGET_TIME"
TARGET_NAME="$DEFAULT_TARGET_NAME"
TARGET_LSN="$DEFAULT_TARGET_LSN"
DATA_DIR="$DEFAULT_DATA_DIR"
PORT="$DEFAULT_PORT"
VERIFY_ONLY=false
DRY_RUN=false
RESTORE_LATEST=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --to-time)
            TARGET_TIME="$2"
            shift 2
            ;;
        --to-name)
            TARGET_NAME="$2"
            shift 2
            ;;
        --to-lsn)
            TARGET_LSN="$2"
            shift 2
            ;;
        --latest)
            RESTORE_LATEST=true
            shift
            ;;
        --data-dir)
            DATA_DIR="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --verify-only)
            VERIFY_ONLY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Required environment variables
: "${PGBACKREST_REPO1_S3_BUCKET:?PGBACKREST_REPO1_S3_BUCKET must be set}"
: "${PGBACKREST_REPO1_S3_REGION:?PGBACKREST_REPO1_S3_REGION must be set}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$1] $2" >&2
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log "ERROR" "Restore failed with exit code $exit_code"
        record_restore_failure "$RESTORE_ID" "$exit_code" "Restore script failed"
    fi
    exit $exit_code
}

trap cleanup EXIT ERR

# Function to record restore start in database
record_restore_start() {
    local restore_id="$1"
    local target_time="$2"
    local target_name="$3"
    local target_lsn="$4"
    
    psql "$DATABASE_URL" -c "
        INSERT INTO dr_exercises (
            exercise_id, exercise_type, scenario, started_at,
            target_rto_ms, target_rpo_ms, restore_point_time
        ) VALUES (
            '$restore_id', 'manual', 'PITR Restore', now(),
            1800000, 900000, $(if [[ -n "$target_time" ]]; then echo "'$target_time'"; else echo "NULL"; fi)
        );
    " > /dev/null
}

# Function to record restore completion
record_restore_completion() {
    local restore_id="$1"
    local duration_ms="$2"
    local result="$3"
    local notes="$4"
    
    psql "$DATABASE_URL" -c "
        UPDATE dr_exercises
        SET 
            completed_at = now(),
            actual_rto_ms = $duration_ms,
            result = '$result',
            success_criteria_met = $(if [[ "$result" == "success" ]]; then echo "true"; else echo "false"; fi),
            notes = '$notes'::jsonb
        WHERE exercise_id = '$restore_id';
    " > /dev/null
}

# Function to record restore failure
record_restore_failure() {
    local restore_id="$1"
    local exit_code="$2"
    local error_msg="$3"
    
    psql "$DATABASE_URL" -c "
        UPDATE dr_exercises
        SET 
            completed_at = now(),
            result = 'failed',
            success_criteria_met = false,
            notes = jsonb_build_object('exit_code', $exit_code, 'error', '$error_msg')
        WHERE exercise_id = '$restore_id';
    " > /dev/null 2>&1 || true
}

# Function to validate restore target
validate_restore_target() {
    local target_count=0
    
    [[ -n "$TARGET_TIME" ]] && ((target_count++))
    [[ -n "$TARGET_NAME" ]] && ((target_count++))
    [[ -n "$TARGET_LSN" ]] && ((target_count++))
    [[ "$RESTORE_LATEST" == true ]] && ((target_count++))
    
    if [[ $target_count -eq 0 ]]; then
        log "ERROR" "No restore target specified. Use --to-time, --to-name, --to-lsn, or --latest"
        exit 1
    elif [[ $target_count -gt 1 ]]; then
        log "ERROR" "Multiple restore targets specified. Choose only one."
        exit 1
    fi
    
    # Validate timestamp format if provided
    if [[ -n "$TARGET_TIME" ]]; then
        if ! date -d "$TARGET_TIME" &>/dev/null; then
            log "ERROR" "Invalid timestamp format: $TARGET_TIME"
            log "INFO" "Use ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ"
            exit 1
        fi
    fi
}

# Function to check available backups
check_available_backups() {
    log "INFO" "Checking available backups..."
    
    local info_output
    info_output=$(pgbackrest \
        --config="$CONFIG_FILE" \
        --log-level-console=error \
        info \
        --output=json 2>/dev/null || echo '[]')
    
    if command -v jq &> /dev/null; then
        local backup_count
        backup_count=$(echo "$info_output" | jq -r '.[0].backup // [] | length' 2>/dev/null || echo "0")
        
        if [[ "$backup_count" -eq 0 ]]; then
            log "ERROR" "No backups found in repository"
            exit 1
        fi
        
        log "INFO" "Found $backup_count backup(s) in repository"
        
        # Show backup details
        echo "$info_output" | jq -r '
            .[0].backup // [] | 
            sort_by(.timestamp.stop) | 
            reverse | 
            .[] | 
            "  " + .type + " backup: " + .label + " (completed: " + .timestamp.stop + ")"
        ' 2>/dev/null || true
        
        # Check if target time is within available range
        if [[ -n "$TARGET_TIME" ]]; then
            local earliest_backup
            local latest_backup
            earliest_backup=$(echo "$info_output" | jq -r '.[0].backup // [] | sort_by(.timestamp.start) | .[0].timestamp.start // ""' 2>/dev/null || echo "")
            latest_backup=$(echo "$info_output" | jq -r '.[0].backup // [] | sort_by(.timestamp.stop) | .[-1].timestamp.stop // ""' 2>/dev/null || echo "")
            
            if [[ -n "$earliest_backup" && -n "$latest_backup" ]]; then
                log "INFO" "Available backup range: $earliest_backup to $latest_backup"
                
                # Simple timestamp comparison (works for ISO 8601)
                if [[ "$TARGET_TIME" < "$earliest_backup" ]]; then
                    log "ERROR" "Target time $TARGET_TIME is before earliest backup $earliest_backup"
                    exit 1
                fi
                
                if [[ "$TARGET_TIME" > "$latest_backup" ]]; then
                    log "WARN" "Target time $TARGET_TIME is after latest backup $latest_backup"
                    log "WARN" "Will restore to latest available point and replay WAL"
                fi
            fi
        fi
    else
        log "WARN" "jq not found. Cannot parse backup information."
    fi
}

# Function to prepare data directory
prepare_data_directory() {
    log "INFO" "Preparing data directory: $DATA_DIR"
    
    # Check if directory exists and is not empty
    if [[ -d "$DATA_DIR" ]]; then
        if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
            log "WARN" "Data directory $DATA_DIR is not empty"
            
            if [[ "$DRY_RUN" == true ]]; then
                log "INFO" "[DRY RUN] Would remove contents of $DATA_DIR"
                return 0
            fi
            
            read -p "Remove contents of $DATA_DIR? (y/N): " -r
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log "INFO" "Removing contents of $DATA_DIR"
                rm -rf "${DATA_DIR:?}"/*
            else
                log "ERROR" "Cannot proceed with non-empty data directory"
                exit 1
            fi
        fi
    else
        log "INFO" "Creating data directory: $DATA_DIR"
        if [[ "$DRY_RUN" == false ]]; then
            mkdir -p "$DATA_DIR"
        fi
    fi
    
    # Set appropriate permissions
    if [[ "$DRY_RUN" == false ]]; then
        chmod 700 "$DATA_DIR"
        
        # Change ownership to postgres user if running as root
        if [[ $EUID -eq 0 ]] && id postgres &>/dev/null; then
            chown postgres:postgres "$DATA_DIR"
        fi
    fi
}

# Function to build restore command
build_restore_command() {
    local restore_cmd="pgbackrest"
    restore_cmd+=" --config=\"$CONFIG_FILE\""
    restore_cmd+=" --log-level-console=\"$LOG_LEVEL\""
    restore_cmd+=" --log-level-file=detail"
    restore_cmd+=" --log-path=\"/var/log/pgbackrest\""
    restore_cmd+=" --pg1-path=\"$DATA_DIR\""
    restore_cmd+=" restore"
    
    # Add recovery target options
    if [[ -n "$TARGET_TIME" ]]; then
        restore_cmd+=" --recovery-option=\"recovery_target_time='$TARGET_TIME'\""
        restore_cmd+=" --recovery-option=\"recovery_target_action=promote\""
    elif [[ -n "$TARGET_NAME" ]]; then
        restore_cmd+=" --recovery-option=\"recovery_target_name='$TARGET_NAME'\""
        restore_cmd+=" --recovery-option=\"recovery_target_action=promote\""
    elif [[ -n "$TARGET_LSN" ]]; then
        restore_cmd+=" --recovery-option=\"recovery_target_lsn='$TARGET_LSN'\""
        restore_cmd+=" --recovery-option=\"recovery_target_action=promote\""
    elif [[ "$RESTORE_LATEST" == true ]]; then
        restore_cmd+=" --recovery-option=\"recovery_target_timeline=latest\""
    fi
    
    # Add additional recovery options
    restore_cmd+=" --recovery-option=\"recovery_target_inclusive=true\""
    restore_cmd+=" --process-max=4"
    
    echo "$restore_cmd"
}

# Function to perform the restore
perform_restore() {
    local restore_cmd="$1"
    
    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] Would execute: $restore_cmd"
        return 0
    fi
    
    log "INFO" "Starting restore operation..."
    log "INFO" "Command: $restore_cmd"
    
    local restore_output
    local restore_exit_code=0
    
    restore_output=$(eval "$restore_cmd" 2>&1) || restore_exit_code=$?
    
    if [[ $restore_exit_code -ne 0 ]]; then
        log "ERROR" "pgBackRest restore failed with exit code $restore_exit_code"
        log "ERROR" "Output: $restore_output"
        return $restore_exit_code
    fi
    
    log "INFO" "Restore completed successfully"
    echo "$restore_output"
    return 0
}

# Function to verify restored data
verify_restored_data() {
    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] Would verify restored data"
        return 0
    fi
    
    log "INFO" "Verifying restored data..."
    
    # Check if postgresql.conf exists
    if [[ ! -f "$DATA_DIR/postgresql.conf" ]]; then
        log "ERROR" "postgresql.conf not found in restored data"
        return 1
    fi
    
    # Check if base directory structure exists
    local required_dirs=("base" "global" "pg_wal" "pg_xact")
    for dir in "${required_dirs[@]}"; do
        if [[ ! -d "$DATA_DIR/$dir" ]]; then
            log "ERROR" "Required directory $dir not found in restored data"
            return 1
        fi
    done
    
    # Check PG_VERSION file
    if [[ -f "$DATA_DIR/PG_VERSION" ]]; then
        local pg_version
        pg_version=$(cat "$DATA_DIR/PG_VERSION")
        log "INFO" "Restored PostgreSQL version: $pg_version"
    else
        log "WARN" "PG_VERSION file not found"
    fi
    
    log "INFO" "Data verification completed successfully"
    return 0
}

# Function to start test instance
start_test_instance() {
    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] Would start test PostgreSQL instance on port $PORT"
        return 0
    fi
    
    log "INFO" "Starting test PostgreSQL instance on port $PORT..."
    
    # Create a simple postgresql.conf for testing
    cat > "$DATA_DIR/postgresql.auto.conf" << EOF
port = $PORT
listen_addresses = 'localhost'
max_connections = 10
shared_buffers = 32MB
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
EOF
    
    # Start PostgreSQL instance
    local pg_ctl_cmd="pg_ctl -D \"$DATA_DIR\" -l \"$DATA_DIR/postgresql.log\" start"
    
    if eval "$pg_ctl_cmd" > /dev/null 2>&1; then
        log "INFO" "Test instance started successfully"
        
        # Wait for startup
        sleep 5
        
        # Test connection
        if psql -h localhost -p "$PORT" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
            log "INFO" "Test instance is accepting connections"
            
            # Stop the test instance
            pg_ctl -D "$DATA_DIR" stop -m fast > /dev/null 2>&1
            log "INFO" "Test instance stopped"
            return 0
        else
            log "ERROR" "Test instance is not accepting connections"
            pg_ctl -D "$DATA_DIR" stop -m immediate > /dev/null 2>&1 || true
            return 1
        fi
    else
        log "ERROR" "Failed to start test instance"
        return 1
    fi
}

# Function to cleanup restore environment
cleanup_restore() {
    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "[DRY RUN] Would cleanup restore environment"
        return 0
    fi
    
    # Stop any running instance
    if [[ -f "$DATA_DIR/postmaster.pid" ]]; then
        log "INFO" "Stopping PostgreSQL instance..."
        pg_ctl -D "$DATA_DIR" stop -m immediate > /dev/null 2>&1 || true
    fi
    
    # Optionally remove restored data
    if [[ "${CLEANUP_AFTER_TEST:-false}" == "true" ]]; then
        log "INFO" "Cleaning up restored data directory"
        rm -rf "${DATA_DIR:?}"
    else
        log "INFO" "Restored data preserved in: $DATA_DIR"
    fi
}

# Main execution
main() {
    log "INFO" "=== PostgreSQL Point-in-Time Recovery Started ==="
    log "INFO" "Restore ID: $RESTORE_ID"
    
    # Validate arguments
    validate_restore_target
    
    # Show restore parameters
    if [[ -n "$TARGET_TIME" ]]; then
        log "INFO" "Target: Time $TARGET_TIME"
    elif [[ -n "$TARGET_NAME" ]]; then
        log "INFO" "Target: Named point $TARGET_NAME"
    elif [[ -n "$TARGET_LSN" ]]; then
        log "INFO" "Target: LSN $TARGET_LSN"
    elif [[ "$RESTORE_LATEST" == true ]]; then
        log "INFO" "Target: Latest available"
    fi
    
    log "INFO" "Data directory: $DATA_DIR"
    log "INFO" "Test port: $PORT"
    
    if [[ "$VERIFY_ONLY" == true ]]; then
        log "INFO" "Verification mode only - no restore will be performed"
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        log "INFO" "DRY RUN mode - no changes will be made"
    fi
    
    # Record restore start
    if [[ "$VERIFY_ONLY" == false && "$DRY_RUN" == false ]]; then
        record_restore_start "$RESTORE_ID" "$TARGET_TIME" "$TARGET_NAME" "$TARGET_LSN"
    fi
    
    # Check available backups
    check_available_backups
    
    if [[ "$VERIFY_ONLY" == true ]]; then
        log "INFO" "Verification completed - backups are available for restore"
        exit 0
    fi
    
    # Prepare data directory
    prepare_data_directory
    
    # Build restore command
    local restore_cmd
    restore_cmd=$(build_restore_command)
    
    # Perform restore
    local restore_output
    if restore_output=$(perform_restore "$restore_cmd"); then
        log "INFO" "Restore operation completed"
    else
        log "ERROR" "Restore operation failed"
        exit 1
    fi
    
    # Verify restored data
    if verify_restored_data; then
        log "INFO" "Data verification passed"
    else
        log "ERROR" "Data verification failed"
        exit 1
    fi
    
    # Start and test instance
    if start_test_instance; then
        log "INFO" "Instance test passed"
    else
        log "ERROR" "Instance test failed"
        exit 1
    fi
    
    # Calculate duration
    local end_time=$(date +%s%3N)
    local duration_ms=$((end_time - START_TIME))
    
    # Record completion
    if [[ "$DRY_RUN" == false ]]; then
        local notes="{\"target_time\":\"$TARGET_TIME\",\"data_dir\":\"$DATA_DIR\",\"port\":$PORT}"
        record_restore_completion "$RESTORE_ID" "$duration_ms" "success" "$notes"
    fi
    
    # Log summary
    log "INFO" "=== Restore Summary ==="
    log "INFO" "Duration: ${duration_ms}ms"
    log "INFO" "RTO Target: 1800000ms (30 minutes)"
    log "INFO" "RTO Actual: ${duration_ms}ms"
    log "INFO" "RTO Status: $(if [[ $duration_ms -le 1800000 ]]; then echo "PASSED"; else echo "FAILED"; fi)"
    log "INFO" "Data Directory: $DATA_DIR"
    log "INFO" "=== PostgreSQL PITR Completed Successfully ==="
    
    # Cleanup
    cleanup_restore
}

# Execute main function
main "$@"