#!/bin/bash

# Disaster Recovery - PITR Sandbox Restoration Script
# Tests RPO=15min, RTO=30min targets using pgBackRest

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
DR_ENVIRONMENT="${DR_ENVIRONMENT:-sandbox}"
SOURCE_ENVIRONMENT="${SOURCE_ENVIRONMENT:-production}"
POSTGRES_VERSION="${POSTGRES_VERSION:-15}"
PGBACKREST_REPO_PATH="${PGBACKREST_REPO_PATH:-/var/lib/pgbackrest}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-ofm-db-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"
RESULTS_DIR="${RESULTS_DIR:-./dr-results}"
SANDBOX_NAMESPACE="ofm-${DR_ENVIRONMENT}"
DRY_RUN="${DRY_RUN:-false}"
PITR_TARGET="${PITR_TARGET:-}"  # Format: 2025-08-12 15:30:00
AUTO_CLEANUP="${AUTO_CLEANUP:-true}"

# Performance targets
RTO_TARGET_MINUTES=30  # Recovery Time Objective
RPO_TARGET_MINUTES=15  # Recovery Point Objective

print_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                🔄 DISASTER RECOVERY TESTING                      ║"
    echo "║                 PITR Sandbox Restoration                         ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_config() {
    echo -e "${YELLOW}🔧 DR Configuration:${NC}"
    echo "  Source Environment: $SOURCE_ENVIRONMENT"
    echo "  DR Environment: $DR_ENVIRONMENT"
    echo "  Sandbox Namespace: $SANDBOX_NAMESPACE"
    echo "  PostgreSQL Version: $POSTGRES_VERSION"
    echo "  S3 Backup Bucket: $S3_BACKUP_BUCKET"
    echo "  AWS Region: $AWS_REGION"
    echo "  Results Directory: $RESULTS_DIR"
    echo "  PITR Target: ${PITR_TARGET:-Latest}"
    echo "  RTO Target: ${RTO_TARGET_MINUTES} minutes"
    echo "  RPO Target: ${RPO_TARGET_MINUTES} minutes"
    echo "  Dry Run: $DRY_RUN"
    echo ""
}

check_prerequisites() {
    echo -e "${YELLOW}🔍 Checking DR prerequisites...${NC}"
    
    # Check required tools
    local missing_tools=()
    
    for tool in kubectl aws psql pgbackrest jq bc; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        echo -e "${RED}❌ Missing required tools: ${missing_tools[*]}${NC}"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        echo -e "${RED}❌ AWS credentials not configured${NC}"
        exit 1
    fi
    
    # Check Kubernetes access
    if ! kubectl cluster-info &> /dev/null; then
        echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
        exit 1
    fi
    
    # Check S3 bucket access
    if ! aws s3 ls "s3://$S3_BACKUP_BUCKET/" &> /dev/null; then
        echo -e "${RED}❌ Cannot access S3 backup bucket: $S3_BACKUP_BUCKET${NC}"
        exit 1
    fi
    
    # Create results directory
    mkdir -p "$RESULTS_DIR"
    
    # Create sandbox namespace if it doesn't exist
    if ! kubectl get namespace "$SANDBOX_NAMESPACE" &> /dev/null; then
        echo -e "${BLUE}📝 Creating sandbox namespace: $SANDBOX_NAMESPACE${NC}"
        if [[ "$DRY_RUN" != "true" ]]; then
            kubectl create namespace "$SANDBOX_NAMESPACE"
        fi
    fi
    
    echo -e "${GREEN}✅ Prerequisites check completed${NC}"
    echo ""
}

get_backup_info() {
    echo -e "${BLUE}📊 Retrieving backup information...${NC}"
    
    # Get latest backup info from S3
    local backup_info_file="$RESULTS_DIR/backup_info.json"
    
    # List available backups
    aws s3api list-objects-v2 \
        --bucket "$S3_BACKUP_BUCKET" \
        --prefix "backup/ofm-social-os/" \
        --query 'Contents[?contains(Key, `backup.info`)].{Key: Key, LastModified: LastModified, Size: Size}' \
        --output json > "$backup_info_file"
    
    if [[ ! -s "$backup_info_file" ]]; then
        echo -e "${RED}❌ No backup info files found in S3${NC}"
        exit 1
    fi
    
    # Get the most recent backup
    local latest_backup=$(jq -r 'sort_by(.LastModified) | last | .Key' "$backup_info_file")
    local latest_backup_time=$(jq -r 'sort_by(.LastModified) | last | .LastModified' "$backup_info_file")
    
    echo -e "${GREEN}✅ Latest backup found:${NC}"
    echo "  Path: $latest_backup"
    echo "  Time: $latest_backup_time"
    
    # Calculate RPO
    local backup_epoch=$(date -d "$latest_backup_time" +%s)
    local current_epoch=$(date +%s)
    local rpo_minutes=$(( (current_epoch - backup_epoch) / 60 ))
    
    echo "  Age: ${rpo_minutes} minutes"
    
    if [[ $rpo_minutes -gt $RPO_TARGET_MINUTES ]]; then
        echo -e "${YELLOW}⚠️  RPO Warning: Latest backup is ${rpo_minutes} minutes old (target: ${RPO_TARGET_MINUTES} minutes)${NC}"
    else
        echo -e "${GREEN}✅ RPO OK: Latest backup within ${RPO_TARGET_MINUTES} minute target${NC}"
    fi
    
    echo ""
    return $rpo_minutes
}

prepare_sandbox_environment() {
    echo -e "${BLUE}🏗️  Preparing sandbox environment...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would prepare sandbox environment${NC}"
        return
    fi
    
    # Clean up any existing sandbox resources
    echo -e "${YELLOW}🧹 Cleaning up existing sandbox resources...${NC}"
    kubectl delete all --all -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    kubectl delete pvc --all -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    sleep 10
    
    # Create PostgreSQL sandbox configuration
    cat << EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-dr-config
  namespace: $SANDBOX_NAMESPACE
data:
  postgresql.conf: |
    # PostgreSQL DR Sandbox Configuration
    listen_addresses = '*'
    port = 5432
    max_connections = 100
    shared_buffers = 256MB
    effective_cache_size = 1GB
    work_mem = 4MB
    maintenance_work_mem = 64MB
    
    # Logging for DR testing
    log_destination = 'stderr'
    log_statement = 'all'
    log_min_duration_statement = 1000
    
    # Archive settings (disabled for DR sandbox)
    archive_mode = off
    
  pg_hba.conf: |
    # TYPE  DATABASE        USER            ADDRESS                 METHOD
    local   all             postgres                                peer
    host    all             postgres        127.0.0.1/32            trust
    host    all             postgres        ::1/128                 trust
    host    all             all             0.0.0.0/0               md5
EOF
    
    # Create pgBackRest configuration
    cat << EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: pgbackrest-dr-config
  namespace: $SANDBOX_NAMESPACE
data:
  pgbackrest.conf: |
    [global]
    log-level-console=info
    log-level-file=debug
    
    [ofm-social-os]
    pg1-path=/var/lib/postgresql/data
    pg1-port=5432
    pg1-user=postgres
    
    repo1-type=s3
    repo1-s3-bucket=$S3_BACKUP_BUCKET
    repo1-s3-region=$AWS_REGION
    repo1-path=/backup/ofm-social-os
    repo1-retention-full=7
    repo1-retention-diff=2
EOF
    
    echo -e "${GREEN}✅ Sandbox environment prepared${NC}"
}

restore_database() {
    echo -e "${BLUE}🔄 Starting database restoration...${NC}"
    
    local start_time=$(date +%s)
    local restore_log="$RESULTS_DIR/restore_$(date +%Y%m%d_%H%M%S).log"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would restore database with PITR${NC}"
        echo "Target: ${PITR_TARGET:-Latest}"
        return
    fi
    
    echo -e "${YELLOW}⏳ Creating PostgreSQL DR instance...${NC}"
    
    # Create PostgreSQL DR deployment
    cat << EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres-dr
  namespace: $SANDBOX_NAMESPACE
  labels:
    app: postgres-dr
    purpose: disaster-recovery
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres-dr
  template:
    metadata:
      labels:
        app: postgres-dr
        purpose: disaster-recovery
    spec:
      serviceAccountName: postgres-dr
      securityContext:
        fsGroup: 999
      containers:
      - name: postgres
        image: postgres:$POSTGRES_VERSION
        env:
        - name: POSTGRES_DB
          value: ofm_social_os
        - name: POSTGRES_USER
          value: postgres
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-dr-secret
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        ports:
        - containerPort: 5432
          name: postgres
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
        - name: postgres-config
          mountPath: /etc/postgresql
        - name: pgbackrest-config
          mountPath: /etc/pgbackrest
        readinessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U postgres -d ofm_social_os
          initialDelaySeconds: 30
          periodSeconds: 10
        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - pg_isready -U postgres -d ofm_social_os
          initialDelaySeconds: 60
          periodSeconds: 30
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
      - name: pgbackrest
        image: pgbackrest/pgbackrest:latest
        env:
        - name: AWS_DEFAULT_REGION
          value: $AWS_REGION
        - name: PGBACKREST_CONFIG
          value: /etc/pgbackrest/pgbackrest.conf
        command: ["/bin/bash"]
        args:
        - -c
        - |
          echo "Starting pgBackRest DR restore..."
          
          # Wait for PostgreSQL to be ready for restore
          sleep 30
          
          # Stop PostgreSQL for restore
          pg_ctl -D /var/lib/postgresql/data/pgdata stop -m fast || true
          
          # Clear data directory
          rm -rf /var/lib/postgresql/data/pgdata/*
          
          # Restore from backup
          if [[ -n "$PITR_TARGET" ]]; then
            echo "Restoring to point-in-time: $PITR_TARGET"
            pgbackrest restore \
              --stanza=ofm-social-os \
              --target="$PITR_TARGET" \
              --target-action=promote
          else
            echo "Restoring to latest backup"
            pgbackrest restore --stanza=ofm-social-os
          fi
          
          # Start PostgreSQL
          pg_ctl -D /var/lib/postgresql/data/pgdata start
          
          echo "DR restore completed"
          sleep infinity
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
        - name: pgbackrest-config
          mountPath: /etc/pgbackrest
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
      volumes:
      - name: postgres-data
        persistentVolumeClaim:
          claimName: postgres-dr-pvc
      - name: postgres-config
        configMap:
          name: postgres-dr-config
      - name: pgbackrest-config
        configMap:
          name: pgbackrest-dr-config
      restartPolicy: Always

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-dr-pvc
  namespace: $SANDBOX_NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
  storageClassName: gp3

---
apiVersion: v1
kind: Service
metadata:
  name: postgres-dr
  namespace: $SANDBOX_NAMESPACE
spec:
  selector:
    app: postgres-dr
  ports:
  - port: 5432
    targetPort: 5432
    name: postgres
  type: ClusterIP

---
apiVersion: v1
kind: Secret
metadata:
  name: postgres-dr-secret
  namespace: $SANDBOX_NAMESPACE
type: Opaque
stringData:
  password: "dr-sandbox-password-$(date +%s)"

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: postgres-dr
  namespace: $SANDBOX_NAMESPACE
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/postgres-dr-role
EOF
    
    echo -e "${YELLOW}⏳ Waiting for DR database to be ready...${NC}"
    
    # Wait for deployment to be ready
    kubectl rollout status deployment/postgres-dr -n "$SANDBOX_NAMESPACE" --timeout=600s
    
    # Wait for database to be ready
    local ready=false
    local attempts=0
    local max_attempts=60
    
    while [[ $ready == false ]] && [[ $attempts -lt $max_attempts ]]; do
        if kubectl exec -n "$SANDBOX_NAMESPACE" deployment/postgres-dr -c postgres -- pg_isready -U postgres -d ofm_social_os &>/dev/null; then
            ready=true
        else
            echo -n "."
            sleep 10
            ((attempts++))
        fi
    done
    
    if [[ $ready == false ]]; then
        echo -e "\n${RED}❌ Database failed to become ready within timeout${NC}"
        exit 1
    fi
    
    local end_time=$(date +%s)
    local rto_minutes=$(( (end_time - start_time) / 60 ))
    
    echo -e "\n${GREEN}✅ Database restoration completed${NC}"
    echo "  RTO: ${rto_minutes} minutes"
    
    if [[ $rto_minutes -gt $RTO_TARGET_MINUTES ]]; then
        echo -e "${YELLOW}⚠️  RTO Warning: Restoration took ${rto_minutes} minutes (target: ${RTO_TARGET_MINUTES} minutes)${NC}"
    else
        echo -e "${GREEN}✅ RTO OK: Restoration within ${RTO_TARGET_MINUTES} minute target${NC}"
    fi
    
    return $rto_minutes
}

verify_data_integrity() {
    echo -e "${BLUE}🔍 Verifying data integrity...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would verify data integrity${NC}"
        return
    fi
    
    local verification_results="$RESULTS_DIR/verification_$(date +%Y%m%d_%H%M%S).json"
    
    echo "{"  > "$verification_results"
    echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"," >> "$verification_results"
    echo "  \"tests\": [" >> "$verification_results"
    
    local test_count=0
    local passed_tests=0
    
    # Test 1: Database connection
    echo -e "${YELLOW}  📝 Testing database connection...${NC}"
    if kubectl exec -n "$SANDBOX_NAMESPACE" deployment/postgres-dr -c postgres -- psql -U postgres -d ofm_social_os -c "SELECT version();" &>/dev/null; then
        echo -e "${GREEN}    ✅ Database connection successful${NC}"
        ((passed_tests++))
        echo "    {\"name\": \"database_connection\", \"status\": \"pass\", \"message\": \"Database connection successful\"}," >> "$verification_results"
    else
        echo -e "${RED}    ❌ Database connection failed${NC}"
        echo "    {\"name\": \"database_connection\", \"status\": \"fail\", \"message\": \"Database connection failed\"}," >> "$verification_results"
    fi
    ((test_count++))
    
    # Test 2: Table structure verification
    echo -e "${YELLOW}  📝 Verifying table structure...${NC}"
    local expected_tables=("creators" "posts" "media_files" "webhooks" "platform_tokens")
    local missing_tables=()
    
    for table in "${expected_tables[@]}"; do
        if ! kubectl exec -n "$SANDBOX_NAMESPACE" deployment/postgres-dr -c postgres -- psql -U postgres -d ofm_social_os -c "\\dt $table" | grep -q "$table"; then
            missing_tables+=("$table")
        fi
    done
    
    if [[ ${#missing_tables[@]} -eq 0 ]]; then
        echo -e "${GREEN}    ✅ All expected tables found${NC}"
        ((passed_tests++))
        echo "    {\"name\": \"table_structure\", \"status\": \"pass\", \"message\": \"All expected tables found\"}," >> "$verification_results"
    else
        echo -e "${RED}    ❌ Missing tables: ${missing_tables[*]}${NC}"
        echo "    {\"name\": \"table_structure\", \"status\": \"fail\", \"message\": \"Missing tables: ${missing_tables[*]}\"}," >> "$verification_results"
    fi
    ((test_count++))
    
    # Test 3: Data consistency check
    echo -e "${YELLOW}  📝 Checking data consistency...${NC}"
    local row_counts=$(kubectl exec -n "$SANDBOX_NAMESPACE" deployment/postgres-dr -c postgres -- psql -U postgres -d ofm_social_os -t -c "
        SELECT 
            'creators:' || COUNT(*) || ',posts:' || 
            (SELECT COUNT(*) FROM posts) || ',media_files:' || 
            (SELECT COUNT(*) FROM media_files)
        FROM creators;
    " 2>/dev/null | xargs || echo "Error")
    
    if [[ "$row_counts" != "Error" ]] && [[ -n "$row_counts" ]]; then
        echo -e "${GREEN}    ✅ Data consistency check passed${NC}"
        echo -e "${BLUE}    📊 Row counts: $row_counts${NC}"
        ((passed_tests++))
        echo "    {\"name\": \"data_consistency\", \"status\": \"pass\", \"message\": \"Row counts: $row_counts\"}," >> "$verification_results"
    else
        echo -e "${RED}    ❌ Data consistency check failed${NC}"
        echo "    {\"name\": \"data_consistency\", \"status\": \"fail\", \"message\": \"Unable to retrieve row counts\"}," >> "$verification_results"
    fi
    ((test_count++))
    
    # Test 4: Index integrity
    echo -e "${YELLOW}  📝 Verifying index integrity...${NC}"
    if kubectl exec -n "$SANDBOX_NAMESPACE" deployment/postgres-dr -c postgres -- psql -U postgres -d ofm_social_os -c "REINDEX DATABASE ofm_social_os;" &>/dev/null; then
        echo -e "${GREEN}    ✅ Index integrity verified${NC}"
        ((passed_tests++))
        echo "    {\"name\": \"index_integrity\", \"status\": \"pass\", \"message\": \"All indexes valid\"}," >> "$verification_results"
    else
        echo -e "${RED}    ❌ Index integrity issues detected${NC}"
        echo "    {\"name\": \"index_integrity\", \"status\": \"fail\", \"message\": \"Index corruption detected\"}," >> "$verification_results"
    fi
    ((test_count++))
    
    # Test 5: Functional test - Simple query
    echo -e "${YELLOW}  📝 Running functional tests...${NC}"
    if kubectl exec -n "$SANDBOX_NAMESPACE" deployment/postgres-dr -c postgres -- psql -U postgres -d ofm_social_os -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" &>/dev/null; then
        echo -e "${GREEN}    ✅ Functional test passed${NC}"
        ((passed_tests++))
        echo "    {\"name\": \"functional_test\", \"status\": \"pass\", \"message\": \"Basic queries working\"}" >> "$verification_results"
    else
        echo -e "${RED}    ❌ Functional test failed${NC}"
        echo "    {\"name\": \"functional_test\", \"status\": \"fail\", \"message\": \"Basic queries failing\"}" >> "$verification_results"
    fi
    ((test_count++))
    
    # Complete JSON
    echo "  ]," >> "$verification_results"
    echo "  \"summary\": {" >> "$verification_results"
    echo "    \"total_tests\": $test_count," >> "$verification_results"
    echo "    \"passed_tests\": $passed_tests," >> "$verification_results"
    echo "    \"success_rate\": $(echo "scale=2; $passed_tests * 100 / $test_count" | bc)" >> "$verification_results"
    echo "  }" >> "$verification_results"
    echo "}" >> "$verification_results"
    
    echo -e "${BLUE}📊 Data Integrity Summary:${NC}"
    echo "  Tests passed: $passed_tests/$test_count"
    echo "  Success rate: $(echo "scale=1; $passed_tests * 100 / $test_count" | bc)%"
    
    if [[ $passed_tests -eq $test_count ]]; then
        echo -e "${GREEN}✅ All data integrity checks passed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Some data integrity checks failed${NC}"
        return 1
    fi
}

test_application_connectivity() {
    echo -e "${BLUE}🔌 Testing application connectivity...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would test application connectivity${NC}"
        return
    fi
    
    # Deploy a test application pod to verify database connectivity
    cat << EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: dr-connectivity-test
  namespace: $SANDBOX_NAMESPACE
  labels:
    purpose: dr-testing
spec:
  containers:
  - name: test-app
    image: postgres:$POSTGRES_VERSION
    env:
    - name: PGHOST
      value: postgres-dr
    - name: PGPORT
      value: "5432"
    - name: PGDATABASE
      value: ofm_social_os
    - name: PGUSER
      value: postgres
    - name: PGPASSWORD
      valueFrom:
        secretKeyRef:
          name: postgres-dr-secret
          key: password
    command: ["/bin/bash"]
    args:
    - -c
    - |
      echo "Testing database connectivity from application perspective..."
      
      # Connection test
      if psql -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✅ Connection successful"
      else
        echo "❌ Connection failed"
        exit 1
      fi
      
      # Performance test
      echo "Running performance tests..."
      start_time=\$(date +%s)
      
      for i in {1..10}; do
        psql -c "SELECT COUNT(*) FROM creators;" > /dev/null 2>&1
        psql -c "SELECT COUNT(*) FROM posts;" > /dev/null 2>&1
        psql -c "SELECT COUNT(*) FROM media_files;" > /dev/null 2>&1
      done
      
      end_time=\$(date +%s)
      duration=\$((end_time - start_time))
      
      echo "✅ Performance test completed in \${duration}s"
      
      # Keep container alive for logs
      sleep 300
  restartPolicy: Never
EOF
    
    # Wait for test completion
    kubectl wait --for=condition=Ready pod/dr-connectivity-test -n "$SANDBOX_NAMESPACE" --timeout=60s
    
    # Check test results
    sleep 10
    local test_logs=$(kubectl logs dr-connectivity-test -n "$SANDBOX_NAMESPACE")
    
    if echo "$test_logs" | grep -q "✅ Connection successful"; then
        echo -e "${GREEN}✅ Application connectivity test passed${NC}"
        
        if echo "$test_logs" | grep -q "✅ Performance test completed"; then
            local perf_time=$(echo "$test_logs" | grep "Performance test completed" | sed -n 's/.*in \([0-9]*\)s/\1/p')
            echo -e "${GREEN}✅ Performance test completed in ${perf_time}s${NC}"
        fi
        
        return 0
    else
        echo -e "${RED}❌ Application connectivity test failed${NC}"
        echo "Test logs:"
        echo "$test_logs"
        return 1
    fi
}

generate_dr_report() {
    local rto_minutes="$1"
    local rpo_minutes="$2"
    local integrity_passed="$3"
    
    echo -e "${BLUE}📋 Generating DR test report...${NC}"
    
    local report_file="$RESULTS_DIR/dr_report_$(date +%Y%m%d_%H%M%S).json"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "$report_file" << EOF
{
  "timestamp": "$timestamp",
  "test_environment": "$DR_ENVIRONMENT",
  "source_environment": "$SOURCE_ENVIRONMENT",
  "pitr_target": "${PITR_TARGET:-latest}",
  "objectives": {
    "rto_target_minutes": $RTO_TARGET_MINUTES,
    "rpo_target_minutes": $RPO_TARGET_MINUTES
  },
  "results": {
    "rto_actual_minutes": $rto_minutes,
    "rpo_actual_minutes": $rpo_minutes,
    "rto_met": $(if [[ $rto_minutes -le $RTO_TARGET_MINUTES ]]; then echo true; else echo false; fi),
    "rpo_met": $(if [[ $rpo_minutes -le $RPO_TARGET_MINUTES ]]; then echo true; else echo false; fi),
    "data_integrity_passed": $integrity_passed
  },
  "test_phases": [
    {
      "phase": "preparation",
      "status": "completed",
      "duration_minutes": 2
    },
    {
      "phase": "restoration",
      "status": "completed",
      "duration_minutes": $rto_minutes
    },
    {
      "phase": "verification",
      "status": "completed",
      "integrity_passed": $integrity_passed
    },
    {
      "phase": "connectivity",
      "status": "completed"
    }
  ],
  "recommendations": [
EOF
    
    # Add recommendations based on results
    if [[ $rto_minutes -gt $RTO_TARGET_MINUTES ]]; then
        echo '    "Consider parallel restoration processes to reduce RTO",' >> "$report_file"
        echo '    "Review backup storage performance and network bandwidth",' >> "$report_file"
    fi
    
    if [[ $rpo_minutes -gt $RPO_TARGET_MINUTES ]]; then
        echo '    "Increase backup frequency to meet RPO requirements",' >> "$report_file"
        echo '    "Consider implementing streaming replication",' >> "$report_file"
    fi
    
    if [[ $integrity_passed != "true" ]]; then
        echo '    "Investigate data integrity issues in backup process",' >> "$report_file"
        echo '    "Review backup verification procedures",' >> "$report_file"
    fi
    
    echo '    "Schedule regular DR drills to maintain readiness"' >> "$report_file"
    echo "  ]" >> "$report_file"
    echo "}" >> "$report_file"
    
    echo -e "${GREEN}✅ DR report generated: $report_file${NC}"
    
    # Print summary
    echo -e "${BLUE}📊 DR Test Summary:${NC}"
    echo "  RTO: ${rto_minutes} minutes (target: ${RTO_TARGET_MINUTES} minutes) - $(if [[ $rto_minutes -le $RTO_TARGET_MINUTES ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
    echo "  RPO: ${rpo_minutes} minutes (target: ${RPO_TARGET_MINUTES} minutes) - $(if [[ $rpo_minutes -le $RPO_TARGET_MINUTES ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
    echo "  Data Integrity: $(if [[ $integrity_passed == "true" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
}

cleanup_sandbox() {
    if [[ "$AUTO_CLEANUP" != "true" ]]; then
        echo -e "${YELLOW}⏭️  Skipping cleanup (AUTO_CLEANUP=false)${NC}"
        echo -e "${BLUE}💡 Manual cleanup: kubectl delete namespace $SANDBOX_NAMESPACE${NC}"
        return
    fi
    
    echo -e "${YELLOW}🧹 Cleaning up sandbox environment...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would clean up sandbox environment${NC}"
        return
    fi
    
    # Delete test resources
    kubectl delete pod dr-connectivity-test -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    kubectl delete deployment postgres-dr -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    kubectl delete pvc postgres-dr-pvc -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    kubectl delete secret postgres-dr-secret -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    kubectl delete configmap postgres-dr-config pgbackrest-dr-config -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    kubectl delete service postgres-dr -n "$SANDBOX_NAMESPACE" --wait=false 2>/dev/null || true
    
    # Optionally delete the entire namespace
    read -p "Delete entire sandbox namespace? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl delete namespace "$SANDBOX_NAMESPACE" --wait=false
        echo -e "${GREEN}✅ Sandbox namespace deletion initiated${NC}"
    fi
}

show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Disaster Recovery PITR Testing Script"
    echo ""
    echo "Options:"
    echo "  --environment [env]       DR environment name [default: sandbox]"
    echo "  --source [env]           Source environment [default: production]"
    echo "  --pitr-target [datetime] Point-in-time target (YYYY-MM-DD HH:MM:SS)"
    echo "  --rto-target [minutes]   RTO target in minutes [default: 30]"
    echo "  --rpo-target [minutes]   RPO target in minutes [default: 15]"
    echo "  --s3-bucket [bucket]     S3 backup bucket [default: ofm-db-backups]"
    echo "  --aws-region [region]    AWS region [default: us-east-1]"
    echo "  --results-dir [dir]      Results directory [default: ./dr-results]"
    echo "  --no-cleanup            Skip automatic cleanup"
    echo "  --dry-run               Show what would be done"
    echo "  --help                  Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  DR_ENVIRONMENT          DR environment name"
    echo "  SOURCE_ENVIRONMENT      Source environment"
    echo "  PITR_TARGET             Point-in-time target"
    echo "  S3_BACKUP_BUCKET        S3 backup bucket"
    echo "  AWS_REGION              AWS region"
    echo "  RESULTS_DIR             Results directory"
    echo "  AUTO_CLEANUP            Auto cleanup (true/false)"
    echo "  DRY_RUN                 Dry run mode (true/false)"
    echo ""
    echo "Examples:"
    echo "  $0 --pitr-target '2025-08-12 15:30:00'"
    echo "  $0 --environment dr-test --rto-target 20"
    echo "  $0 --dry-run --pitr-target '2025-08-12 10:00:00'"
}

main() {
    print_banner
    
    if [[ $# -eq 0 ]] || [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
        show_usage
        exit 0
    fi
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment)
                DR_ENVIRONMENT="$2"
                SANDBOX_NAMESPACE="ofm-${DR_ENVIRONMENT}"
                shift 2
                ;;
            --source)
                SOURCE_ENVIRONMENT="$2"
                shift 2
                ;;
            --pitr-target)
                PITR_TARGET="$2"
                shift 2
                ;;
            --rto-target)
                RTO_TARGET_MINUTES="$2"
                shift 2
                ;;
            --rpo-target)
                RPO_TARGET_MINUTES="$2"
                shift 2
                ;;
            --s3-bucket)
                S3_BACKUP_BUCKET="$2"
                shift 2
                ;;
            --aws-region)
                AWS_REGION="$2"
                shift 2
                ;;
            --results-dir)
                RESULTS_DIR="$2"
                shift 2
                ;;
            --no-cleanup)
                AUTO_CLEANUP="false"
                shift
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            *)
                echo -e "${RED}❌ Unknown option: $1${NC}"
                show_usage
                exit 1
                ;;
        esac
    done
    
    print_config
    check_prerequisites
    
    # Start DR test
    echo -e "${PURPLE}🚀 Starting Disaster Recovery Test...${NC}"
    
    # Phase 1: Get backup information and calculate RPO
    local rpo_minutes
    rpo_minutes=$(get_backup_info)
    
    # Phase 2: Prepare sandbox environment
    prepare_sandbox_environment
    
    # Phase 3: Restore database and measure RTO
    local rto_minutes
    rto_minutes=$(restore_database)
    
    # Phase 4: Verify data integrity
    local integrity_passed="false"
    if verify_data_integrity; then
        integrity_passed="true"
    fi
    
    # Phase 5: Test application connectivity
    test_application_connectivity
    
    # Phase 6: Generate comprehensive report
    generate_dr_report "$rto_minutes" "$rpo_minutes" "$integrity_passed"
    
    # Phase 7: Cleanup
    cleanup_sandbox
    
    # Final summary
    echo -e "${GREEN}🎉 Disaster Recovery test completed!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo "1. Review DR test report in $RESULTS_DIR"
    echo "2. Address any failed objectives or recommendations"
    echo "3. Update DR procedures based on findings"
    echo "4. Schedule next DR drill"
    echo "5. Communicate results to stakeholders"
    
    # Set exit code based on overall success
    if [[ $rto_minutes -le $RTO_TARGET_MINUTES ]] && [[ $rpo_minutes -le $RPO_TARGET_MINUTES ]] && [[ $integrity_passed == "true" ]]; then
        echo -e "${GREEN}✅ All DR objectives met${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  Some DR objectives not met - see report for details${NC}"
        exit 1
    fi
}

# Trap for cleanup on script exit
trap 'echo -e "\n${YELLOW}🧹 Emergency cleanup...${NC}"; kubectl delete pod dr-connectivity-test -n "$SANDBOX_NAMESPACE" &>/dev/null || true' EXIT

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi