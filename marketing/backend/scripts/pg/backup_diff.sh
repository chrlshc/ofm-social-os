#!/bin/bash
set -euo pipefail

# Differential PostgreSQL backup using pgBackRest
# This script performs a differential backup (changes since last full backup)

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/pgbackrest.conf"
LOG_LEVEL="${LOG_LEVEL:-info}"
BACKUP_ID="diff-$(date +%Y%m%d-%H%M%S)"
START_TIME=$(date +%s%3N)

# Load environment variables
if [[ -f "${SCRIPT_DIR}/../../.env" ]]; then
    set -a
    source "${SCRIPT_DIR}/../../.env"
    set +a
fi

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
        log "ERROR" "Differential backup failed with exit code $exit_code"
        record_backup_failure "$BACKUP_ID" "differential" "$exit_code" "Backup script failed"
    fi
    exit $exit_code
}

trap cleanup EXIT ERR

# Function to record backup start in database
record_backup_start() {
    local backup_id="$1"
    local kind="$2"
    
    psql "$DATABASE_URL" -c "
        INSERT INTO backup_reports (backup_id, kind, started_at, status) 
        VALUES ('$backup_id', '$kind', now(), 'running');
    " > /dev/null
}

# Function to record backup completion
record_backup_completion() {
    local backup_id="$1"
    local kind="$2"
    local duration_ms="$3"
    local size_bytes="$4"
    local location="$5"
    local wal_start="$6"
    local wal_end="$7"
    
    psql "$DATABASE_URL" -c "
        SELECT record_backup_completion(
            '$backup_id', '$kind', $duration_ms, $size_bytes, 
            '$location', '$wal_start', '$wal_end'
        );
    " > /dev/null
}

# Function to record backup failure
record_backup_failure() {
    local backup_id="$1"
    local kind="$2"
    local exit_code="$3"
    local error_msg="$4"
    
    psql "$DATABASE_URL" -c "
        UPDATE backup_reports 
        SET status = 'failed', 
            completed_at = now(),
            error_message = '$error_msg',
            notes = jsonb_build_object('exit_code', $exit_code),
            updated_at = now()
        WHERE backup_id = '$backup_id' AND status = 'running';
    " > /dev/null 2>&1 || true
}

# Function to check if full backup exists
check_full_backup_exists() {
    log "INFO" "Checking for existing full backup..."
    
    local info_output
    info_output=$(pgbackrest \
        --config="$CONFIG_FILE" \
        --log-level-console=error \
        info \
        --output=json 2>/dev/null || echo '[]')
    
    # Check if we have any full backups
    if command -v jq &> /dev/null; then
        local full_backup_count
        full_backup_count=$(echo "$info_output" | jq -r '.[0].backup // [] | map(select(.type == "full")) | length' 2>/dev/null || echo "0")
        
        if [[ "$full_backup_count" -eq 0 ]]; then
            log "ERROR" "No full backup found. Cannot perform differential backup without a full backup."
            log "INFO" "Please run 'npm run backup:full' first to create a full backup."
            exit 1
        fi
        
        log "INFO" "Found $full_backup_count full backup(s). Proceeding with differential backup."
    else
        log "WARN" "jq not found. Cannot verify full backup existence. Proceeding with differential backup attempt."
    fi
}

# Function to perform the differential backup
perform_backup() {
    log "INFO" "Starting differential backup: $BACKUP_ID"
    
    # Record backup start
    record_backup_start "$BACKUP_ID" "differential"
    
    # Perform the backup with pgBackRest
    local backup_output
    local backup_exit_code=0
    
    backup_output=$(pgbackrest \
        --config="$CONFIG_FILE" \
        --log-level-console="$LOG_LEVEL" \
        --log-level-file=detail \
        --log-path="/var/log/pgbackrest" \
        backup \
        --type=diff \
        --compress-type=lz4 \
        --compress-level=6 \
        --process-max=4 \
        --archive-copy \
        2>&1) || backup_exit_code=$?
    
    if [[ $backup_exit_code -ne 0 ]]; then
        log "ERROR" "pgBackRest differential backup failed with exit code $backup_exit_code"
        log "ERROR" "Output: $backup_output"
        record_backup_failure "$BACKUP_ID" "differential" "$backup_exit_code" "$backup_output"
        exit $backup_exit_code
    fi
    
    log "INFO" "Differential backup completed successfully"
    echo "$backup_output"
}

# Function to get backup information
get_backup_info() {
    local info_output
    info_output=$(pgbackrest \
        --config="$CONFIG_FILE" \
        --log-level-console=error \
        info \
        --output=json 2>/dev/null || echo '[]')
    
    echo "$info_output"
}

# Function to extract backup details from info
extract_backup_details() {
    local info_json="$1"
    local backup_size=0
    local wal_start=""
    local wal_end=""
    local s3_location=""
    
    # Extract latest differential backup details using jq if available
    if command -v jq &> /dev/null; then
        local latest_diff_backup
        latest_diff_backup=$(echo "$info_json" | jq -r '.[0].backup // [] | map(select(.type == "diff")) | last // empty' 2>/dev/null || echo "")
        
        if [[ -n "$latest_diff_backup" ]]; then
            backup_size=$(echo "$latest_diff_backup" | jq -r '.info.size // 0' 2>/dev/null || echo "0")
            wal_start=$(echo "$latest_diff_backup" | jq -r '.archive.start // ""' 2>/dev/null || echo "")
            wal_end=$(echo "$latest_diff_backup" | jq -r '.archive.stop // ""' 2>/dev/null || echo "")
        fi
    fi
    
    # Construct S3 location
    s3_location="s3://${PGBACKREST_REPO1_S3_BUCKET}/backup/db"
    
    echo "$backup_size|$wal_start|$wal_end|$s3_location"
}

# Function to verify backup integrity
verify_backup() {
    log "INFO" "Verifying backup integrity..."
    
    local verify_output
    local verify_exit_code=0
    
    verify_output=$(pgbackrest \
        --config="$CONFIG_FILE" \
        --log-level-console="$LOG_LEVEL" \
        check 2>&1) || verify_exit_code=$?
    
    if [[ $verify_exit_code -ne 0 ]]; then
        log "WARN" "Backup verification failed: $verify_output"
        return 1
    fi
    
    log "INFO" "Backup verification completed successfully"
    return 0
}

# Function to send metrics
send_metrics() {
    local duration_ms="$1"
    local size_bytes="$2"
    local success="$3"
    
    # Send metrics to monitoring system (if configured)
    if command -v curl &> /dev/null && [[ -n "${METRICS_ENDPOINT:-}" ]]; then
        curl -s -X POST "$METRICS_ENDPOINT/metrics" \
            -H "Content-Type: application/json" \
            -d "{
                \"metric\": \"backup_duration_ms\",
                \"value\": $duration_ms,
                \"tags\": {\"type\": \"differential\", \"success\": \"$success\"}
            }" > /dev/null 2>&1 || true
        
        curl -s -X POST "$METRICS_ENDPOINT/metrics" \
            -H "Content-Type: application/json" \
            -d "{
                \"metric\": \"backup_size_bytes\",
                \"value\": $size_bytes,
                \"tags\": {\"type\": \"differential\", \"success\": \"$success\"}
            }" > /dev/null 2>&1 || true
    fi
}

# Main execution
main() {
    log "INFO" "=== PostgreSQL Differential Backup Started ==="
    log "INFO" "Backup ID: $BACKUP_ID"
    log "INFO" "S3 Bucket: $PGBACKREST_REPO1_S3_BUCKET"
    log "INFO" "S3 Region: $PGBACKREST_REPO1_S3_REGION"
    
    # Check if full backup exists
    check_full_backup_exists
    
    # Perform backup
    local backup_output
    backup_output=$(perform_backup)
    
    # Get backup information
    local info_json
    info_json=$(get_backup_info)
    
    # Extract backup details
    local backup_details
    backup_details=$(extract_backup_details "$info_json")
    IFS='|' read -r backup_size wal_start wal_end s3_location <<< "$backup_details"
    
    # Calculate duration
    local end_time=$(date +%s%3N)
    local duration_ms=$((end_time - START_TIME))
    
    # Verify backup
    local verification_success=true
    if ! verify_backup; then
        verification_success=false
    fi
    
    # Record completion in database
    record_backup_completion "$BACKUP_ID" "differential" "$duration_ms" "$backup_size" "$s3_location" "$wal_start" "$wal_end"
    
    # Send metrics
    send_metrics "$duration_ms" "$backup_size" "true"
    
    # Log summary
    log "INFO" "=== Backup Summary ==="
    log "INFO" "Duration: ${duration_ms}ms"
    log "INFO" "Size: $backup_size bytes"
    log "INFO" "WAL Range: $wal_start -> $wal_end"
    log "INFO" "Location: $s3_location"
    log "INFO" "Verification: $([ "$verification_success" = true ] && echo "PASSED" || echo "FAILED")"
    log "INFO" "=== PostgreSQL Differential Backup Completed Successfully ==="
    
    # Return backup details for CI/CD
    echo "BACKUP_ID=$BACKUP_ID"
    echo "BACKUP_SIZE=$backup_size"
    echo "BACKUP_LOCATION=$s3_location"
    echo "DURATION_MS=$duration_ms"
}

# Execute main function
main "$@"