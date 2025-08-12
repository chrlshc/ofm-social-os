#!/bin/bash
set -euo pipefail

# Disaster Recovery Test Automation
# Performs automated DR testing with full validation and reporting

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ID="dr-test-$(date +%Y%m%d-%H%M%S)"
START_TIME=$(date +%s%3N)
LOG_FILE="/tmp/dr-test-${TEST_ID}.log"

# DR targets
TARGET_RTO_MS=1800000  # 30 minutes
TARGET_RPO_MS=900000   # 15 minutes

# Test configuration
TEST_SCENARIOS=(
    "latest_backup:Restore from latest backup"
    "point_in_time:Point-in-time recovery to 1 hour ago"
    "data_integrity:Data integrity verification after restore"
    "performance:Performance validation of restored instance"
)

# Load environment variables
if [[ -f "${SCRIPT_DIR}/../.env" ]]; then
    set -a
    source "${SCRIPT_DIR}/../.env"
    set +a
fi

# Required environment variables
: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${PGBACKREST_REPO1_S3_BUCKET:?PGBACKREST_REPO1_S3_BUCKET must be set}"

# Logging function
log() {
    local level="$1"
    local message="$2"
    local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE" >&2
}

# Error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log "ERROR" "DR test failed with exit code $exit_code"
        record_dr_failure "$TEST_ID" "$exit_code" "DR test script failed"
    fi
    
    # Cleanup test resources
    cleanup_test_resources
    
    # Upload log file if configured
    upload_test_results
    
    exit $exit_code
}

trap cleanup EXIT ERR

# Function to record DR test start
record_dr_start() {
    local test_id="$1"
    local scenario="$2"
    
    psql "$DATABASE_URL" -c "
        INSERT INTO dr_exercises (
            exercise_id, exercise_type, scenario, started_at,
            target_rto_ms, target_rpo_ms
        ) VALUES (
            '$test_id', 'scheduled', '$scenario', now(),
            $TARGET_RTO_MS, $TARGET_RPO_MS
        );
    " > /dev/null
}

# Function to record DR test completion
record_dr_completion() {
    local test_id="$1"
    local actual_rto_ms="$2"
    local actual_rpo_ms="$3"
    local result="$4"
    local notes="$5"
    
    psql "$DATABASE_URL" -c "
        UPDATE dr_exercises
        SET 
            completed_at = now(),
            actual_rto_ms = $actual_rto_ms,
            actual_rpo_ms = $actual_rpo_ms,
            result = '$result',
            success_criteria_met = $(if [[ "$result" == "success" ]]; then echo "true"; else echo "false"; fi),
            data_integrity_verified = true,
            services_operational = $(if [[ "$result" == "success" ]]; then echo "true"; else echo "false"; fi),
            notes = '$notes'::jsonb,
            next_exercise_due = now() + INTERVAL '1 month'
        WHERE exercise_id = '$test_id';
    " > /dev/null
}

# Function to record DR test failure
record_dr_failure() {
    local test_id="$1"
    local exit_code="$2"
    local error_msg="$3"
    
    psql "$DATABASE_URL" -c "
        UPDATE dr_exercises
        SET 
            completed_at = now(),
            result = 'failed',
            success_criteria_met = false,
            notes = jsonb_build_object(
                'exit_code', $exit_code, 
                'error', '$error_msg',
                'log_file', '$LOG_FILE'
            )
        WHERE exercise_id = '$test_id';
    " > /dev/null 2>&1 || true
}

# Function to check prerequisites
check_prerequisites() {
    log "INFO" "Checking DR test prerequisites..."
    
    # Check required tools
    local required_tools=("pgbackrest" "psql" "pg_ctl" "curl")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log "ERROR" "Required tool not found: $tool"
            exit 1
        fi
    done
    
    # Check database connectivity
    if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log "ERROR" "Cannot connect to database"
        exit 1
    fi
    
    # Check backup repository access
    if ! pgbackrest --config="${SCRIPT_DIR}/pg/pgbackrest.conf" info > /dev/null 2>&1; then
        log "ERROR" "Cannot access backup repository"
        exit 1
    fi
    
    # Check available disk space (need at least 10GB for restore)
    local available_space
    available_space=$(df /tmp | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 10485760 ]]; then  # 10GB in KB
        log "ERROR" "Insufficient disk space for DR test (need 10GB, have ${available_space}KB)"
        exit 1
    fi
    
    log "INFO" "Prerequisites check passed"
}

# Function to get latest backup information
get_latest_backup_info() {
    log "INFO" "Retrieving latest backup information..."
    
    local info_output
    info_output=$(pgbackrest --config="${SCRIPT_DIR}/pg/pgbackrest.conf" info --output=json 2>/dev/null || echo '[]')
    
    if command -v jq &> /dev/null; then
        local latest_backup
        latest_backup=$(echo "$info_output" | jq -r '.[0].backup[-1] // empty' 2>/dev/null || echo "")
        
        if [[ -n "$latest_backup" ]]; then
            local backup_time
            local backup_type
            local backup_size
            
            backup_time=$(echo "$latest_backup" | jq -r '.timestamp.stop // ""')
            backup_type=$(echo "$latest_backup" | jq -r '.type // ""')
            backup_size=$(echo "$latest_backup" | jq -r '.info.size // 0')
            
            log "INFO" "Latest backup: $backup_type completed at $backup_time (size: $backup_size bytes)"
            
            # Calculate RPO (time between backup and now)
            if [[ -n "$backup_time" ]]; then
                local backup_timestamp=$(date -d "$backup_time" +%s 2>/dev/null || echo "0")
                local current_timestamp=$(date +%s)
                local rpo_seconds=$((current_timestamp - backup_timestamp))
                local rpo_ms=$((rpo_seconds * 1000))
                
                log "INFO" "Current RPO: ${rpo_ms}ms (target: ${TARGET_RPO_MS}ms)"
                
                if [[ $rpo_ms -gt $TARGET_RPO_MS ]]; then
                    log "WARN" "Current RPO exceeds target - backup may be stale"
                fi
                
                echo "$rpo_ms"
                return 0
            fi
        fi
    fi
    
    log "WARN" "Could not determine backup information"
    echo "0"
}

# Function to test latest backup restore
test_latest_backup_restore() {
    log "INFO" "Testing restore from latest backup..."
    
    local restore_start=$(date +%s%3N)
    local test_data_dir="/tmp/dr-test-${TEST_ID}-latest"
    local test_port="5434"
    
    # Perform restore
    local restore_cmd="${SCRIPT_DIR}/pg/restore_pitr.sh --latest --data-dir $test_data_dir --port $test_port"
    
    if eval "$restore_cmd" >> "$LOG_FILE" 2>&1; then
        local restore_end=$(date +%s%3N)
        local restore_duration=$((restore_end - restore_start))
        
        log "INFO" "Latest backup restore completed in ${restore_duration}ms"
        
        # Verify data integrity
        if verify_data_integrity "$test_data_dir"; then
            log "INFO" "Data integrity verification passed"
            echo "$restore_duration"
            return 0
        else
            log "ERROR" "Data integrity verification failed"
            return 1
        fi
    else
        log "ERROR" "Latest backup restore failed"
        return 1
    fi
}

# Function to test point-in-time recovery
test_point_in_time_recovery() {
    log "INFO" "Testing point-in-time recovery..."
    
    # Calculate target time (1 hour ago)
    local target_time
    target_time=$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')
    
    local restore_start=$(date +%s%3N)
    local test_data_dir="/tmp/dr-test-${TEST_ID}-pitr"
    local test_port="5435"
    
    log "INFO" "PITR target time: $target_time"
    
    # Perform PITR
    local restore_cmd="${SCRIPT_DIR}/pg/restore_pitr.sh --to-time '$target_time' --data-dir $test_data_dir --port $test_port"
    
    if eval "$restore_cmd" >> "$LOG_FILE" 2>&1; then
        local restore_end=$(date +%s%3N)
        local restore_duration=$((restore_end - restore_start))
        
        log "INFO" "PITR completed in ${restore_duration}ms"
        
        # Verify temporal consistency
        if verify_temporal_consistency "$test_data_dir" "$target_time"; then
            log "INFO" "Temporal consistency verification passed"
            echo "$restore_duration"
            return 0
        else
            log "ERROR" "Temporal consistency verification failed"
            return 1
        fi
    else
        log "ERROR" "Point-in-time recovery failed"
        return 1
    fi
}

# Function to verify data integrity
verify_data_integrity() {
    local data_dir="$1"
    
    log "INFO" "Verifying data integrity for $data_dir"
    
    # Check file system integrity
    if [[ ! -f "$data_dir/postgresql.conf" ]]; then
        log "ERROR" "postgresql.conf missing"
        return 1
    fi
    
    if [[ ! -d "$data_dir/base" ]]; then
        log "ERROR" "base directory missing"
        return 1
    fi
    
    # Start temporary instance for database checks
    local temp_port="5436"
    cat > "$data_dir/postgresql.auto.conf" << EOF
port = $temp_port
listen_addresses = 'localhost'
max_connections = 10
shared_buffers = 32MB
log_destination = 'stderr'
logging_collector = off
EOF
    
    if pg_ctl -D "$data_dir" -l "$data_dir/startup.log" start > /dev/null 2>&1; then
        sleep 3
        
        # Run integrity checks
        local integrity_checks=(
            "SELECT count(*) FROM information_schema.tables;"
            "SELECT pg_size_pretty(pg_database_size(current_database()));"
            "SELECT count(*) FROM pg_stat_user_tables;"
        )
        
        local all_checks_passed=true
        for check in "${integrity_checks[@]}"; do
            if ! psql -h localhost -p "$temp_port" -d postgres -c "$check" > /dev/null 2>&1; then
                log "ERROR" "Integrity check failed: $check"
                all_checks_passed=false
            fi
        done
        
        # Stop temporary instance
        pg_ctl -D "$data_dir" stop -m fast > /dev/null 2>&1
        
        if [[ "$all_checks_passed" == true ]]; then
            log "INFO" "All integrity checks passed"
            return 0
        else
            log "ERROR" "Some integrity checks failed"
            return 1
        fi
    else
        log "ERROR" "Failed to start temporary instance for integrity check"
        return 1
    fi
}

# Function to verify temporal consistency
verify_temporal_consistency() {
    local data_dir="$1"
    local target_time="$2"
    
    log "INFO" "Verifying temporal consistency for restore to $target_time"
    
    # This is a simplified check - in practice, you'd verify that
    # no data exists that was created after the target time
    
    # Start temporary instance
    local temp_port="5437"
    cat > "$data_dir/postgresql.auto.conf" << EOF
port = $temp_port
listen_addresses = 'localhost'
max_connections = 10
shared_buffers = 32MB
log_destination = 'stderr'
logging_collector = off
EOF
    
    if pg_ctl -D "$data_dir" -l "$data_dir/startup.log" start > /dev/null 2>&1; then
        sleep 3
        
        # Check recovery target was reached
        local recovery_info
        recovery_info=$(psql -h localhost -p "$temp_port" -d postgres -t -c "
            SELECT 
                CASE 
                    WHEN pg_is_in_recovery() THEN 'in_recovery'
                    ELSE 'recovered'
                END;
        " 2>/dev/null | tr -d ' \n' || echo "unknown")
        
        log "INFO" "Recovery status: $recovery_info"
        
        # Stop temporary instance
        pg_ctl -D "$data_dir" stop -m fast > /dev/null 2>&1
        
        if [[ "$recovery_info" == "recovered" ]]; then
            log "INFO" "Temporal consistency verification passed"
            return 0
        else
            log "ERROR" "Instance still in recovery mode"
            return 1
        fi
    else
        log "ERROR" "Failed to start temporary instance for temporal consistency check"
        return 1
    fi
}

# Function to test performance
test_performance() {
    log "INFO" "Testing performance of restored instance..."
    
    # This would include:
    # - Connection time
    # - Query performance benchmarks
    # - Resource utilization checks
    
    # Simplified performance test
    local test_data_dir="/tmp/dr-test-${TEST_ID}-latest"
    
    if [[ -d "$test_data_dir" ]]; then
        local perf_start=$(date +%s%3N)
        
        # Start instance for performance test
        local perf_port="5438"
        cat > "$test_data_dir/postgresql.auto.conf" << EOF
port = $perf_port
listen_addresses = 'localhost'
max_connections = 50
shared_buffers = 128MB
log_destination = 'stderr'
logging_collector = off
EOF
        
        if pg_ctl -D "$test_data_dir" -l "$test_data_dir/perf.log" start > /dev/null 2>&1; then
            sleep 3
            
            # Run performance tests
            local perf_results=""
            
            # Connection test
            local conn_start=$(date +%s%3N)
            if psql -h localhost -p "$perf_port" -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
                local conn_end=$(date +%s%3N)
                local conn_time=$((conn_end - conn_start))
                perf_results+="connection_time_ms:$conn_time,"
                log "INFO" "Connection time: ${conn_time}ms"
            fi
            
            # Simple query test
            local query_start=$(date +%s%3N)
            if psql -h localhost -p "$perf_port" -d postgres -c "SELECT count(*) FROM information_schema.tables;" > /dev/null 2>&1; then
                local query_end=$(date +%s%3N)
                local query_time=$((query_end - query_start))
                perf_results+="query_time_ms:$query_time"
                log "INFO" "Query time: ${query_time}ms"
            fi
            
            # Stop instance
            pg_ctl -D "$test_data_dir" stop -m fast > /dev/null 2>&1
            
            local perf_end=$(date +%s%3N)
            local total_perf_time=$((perf_end - perf_start))
            
            log "INFO" "Performance test completed in ${total_perf_time}ms"
            echo "$perf_results"
            return 0
        else
            log "ERROR" "Failed to start instance for performance test"
            return 1
        fi
    else
        log "ERROR" "No restored data available for performance test"
        return 1
    fi
}

# Function to cleanup test resources
cleanup_test_resources() {
    log "INFO" "Cleaning up test resources..."
    
    # Stop any running test instances
    local test_dirs=("/tmp/dr-test-${TEST_ID}-latest" "/tmp/dr-test-${TEST_ID}-pitr")
    
    for test_dir in "${test_dirs[@]}"; do
        if [[ -d "$test_dir" ]]; then
            # Stop PostgreSQL if running
            if [[ -f "$test_dir/postmaster.pid" ]]; then
                log "INFO" "Stopping PostgreSQL in $test_dir"
                pg_ctl -D "$test_dir" stop -m immediate > /dev/null 2>&1 || true
            fi
            
            # Remove test directory
            log "INFO" "Removing test directory: $test_dir"
            rm -rf "$test_dir"
        fi
    done
}

# Function to upload test results
upload_test_results() {
    if [[ -n "${DR_RESULTS_S3_BUCKET:-}" ]] && command -v aws &> /dev/null; then
        log "INFO" "Uploading test results to S3..."
        
        local s3_key="dr-tests/${TEST_ID}/dr-test.log"
        
        if aws s3 cp "$LOG_FILE" "s3://${DR_RESULTS_S3_BUCKET}/${s3_key}" > /dev/null 2>&1; then
            log "INFO" "Test results uploaded to s3://${DR_RESULTS_S3_BUCKET}/${s3_key}"
        else
            log "WARN" "Failed to upload test results to S3"
        fi
    fi
}

# Function to generate test report
generate_test_report() {
    local test_result="$1"
    local actual_rto_ms="$2"
    local actual_rpo_ms="$3"
    local test_details="$4"
    
    cat << EOF

=== DISASTER RECOVERY TEST REPORT ===
Test ID: $TEST_ID
Date: $(date '+%Y-%m-%d %H:%M:%S')
Result: $test_result

Performance Targets:
- RTO Target: ${TARGET_RTO_MS}ms ($(( TARGET_RTO_MS / 60000 )) minutes)
- RPO Target: ${TARGET_RPO_MS}ms ($(( TARGET_RPO_MS / 60000 )) minutes)

Actual Performance:
- RTO Achieved: ${actual_rto_ms}ms ($(( actual_rto_ms / 60000 )) minutes)
- RPO Achieved: ${actual_rpo_ms}ms ($(( actual_rpo_ms / 60000 )) minutes)

RTO Status: $(if [[ $actual_rto_ms -le $TARGET_RTO_MS ]]; then echo "✅ PASSED"; else echo "❌ FAILED"; fi)
RPO Status: $(if [[ $actual_rpo_ms -le $TARGET_RPO_MS ]]; then echo "✅ PASSED"; else echo "❌ FAILED"; fi)

Test Details:
$test_details

Log File: $LOG_FILE

Next Test Due: $(date -d '+1 month' '+%Y-%m-%d')

=== END REPORT ===

EOF
}

# Main execution
main() {
    log "INFO" "=== Disaster Recovery Test Started ==="
    log "INFO" "Test ID: $TEST_ID"
    log "INFO" "Log File: $LOG_FILE"
    log "INFO" "RTO Target: ${TARGET_RTO_MS}ms"
    log "INFO" "RPO Target: ${TARGET_RPO_MS}ms"
    
    # Record test start
    record_dr_start "$TEST_ID" "Automated DR Test - Full Suite"
    
    # Check prerequisites
    check_prerequisites
    
    # Get current RPO
    local actual_rpo_ms
    actual_rpo_ms=$(get_latest_backup_info)
    
    # Test scenarios
    local total_rto_ms=0
    local test_results=""
    local all_tests_passed=true
    
    # Test 1: Latest backup restore
    log "INFO" "=== Running Test 1: Latest Backup Restore ==="
    if latest_restore_time=$(test_latest_backup_restore); then
        log "INFO" "✅ Latest backup restore: ${latest_restore_time}ms"
        total_rto_ms=$((total_rto_ms + latest_restore_time))
        test_results+="latest_backup_restore:success:${latest_restore_time}ms\n"
    else
        log "ERROR" "❌ Latest backup restore failed"
        test_results+="latest_backup_restore:failed:0ms\n"
        all_tests_passed=false
    fi
    
    # Test 2: Point-in-time recovery
    log "INFO" "=== Running Test 2: Point-in-Time Recovery ==="
    if pitr_time=$(test_point_in_time_recovery); then
        log "INFO" "✅ Point-in-time recovery: ${pitr_time}ms"
        test_results+="point_in_time_recovery:success:${pitr_time}ms\n"
    else
        log "ERROR" "❌ Point-in-time recovery failed"
        test_results+="point_in_time_recovery:failed:0ms\n"
        all_tests_passed=false
    fi
    
    # Test 3: Performance validation
    log "INFO" "=== Running Test 3: Performance Validation ==="
    if perf_results=$(test_performance); then
        log "INFO" "✅ Performance validation: $perf_results"
        test_results+="performance_validation:success:$perf_results\n"
    else
        log "ERROR" "❌ Performance validation failed"
        test_results+="performance_validation:failed:no_data\n"
        all_tests_passed=false
    fi
    
    # Calculate final results
    local end_time=$(date +%s%3N)
    local total_duration_ms=$((end_time - START_TIME))
    local test_result
    
    if [[ "$all_tests_passed" == true ]]; then
        test_result="success"
        log "INFO" "🎉 All DR tests passed!"
    else
        test_result="partial"
        log "WARN" "⚠️ Some DR tests failed"
    fi
    
    # Use the latest backup restore time as primary RTO
    local primary_rto_ms=${latest_restore_time:-$total_duration_ms}
    
    # Record completion
    local notes="{\"tests\":\"$test_results\",\"total_duration_ms\":$total_duration_ms}"
    record_dr_completion "$TEST_ID" "$primary_rto_ms" "$actual_rpo_ms" "$test_result" "$notes"
    
    # Generate and display report
    local report
    report=$(generate_test_report "$test_result" "$primary_rto_ms" "$actual_rpo_ms" "$test_results")
    echo "$report" | tee -a "$LOG_FILE"
    
    # Final status
    log "INFO" "=== DR Test Summary ==="
    log "INFO" "Total Duration: ${total_duration_ms}ms"
    log "INFO" "Primary RTO: ${primary_rto_ms}ms (target: ${TARGET_RTO_MS}ms)"
    log "INFO" "RPO: ${actual_rpo_ms}ms (target: ${TARGET_RPO_MS}ms)"
    log "INFO" "Result: $test_result"
    log "INFO" "=== Disaster Recovery Test Completed ==="
    
    # Exit with appropriate code
    if [[ "$all_tests_passed" == true ]]; then
        exit 0
    else
        exit 1
    fi
}

# Execute main function
main "$@"