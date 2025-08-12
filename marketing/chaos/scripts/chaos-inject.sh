#!/bin/bash

# Chaos Engineering Injection Script - OFM Social OS
# Injects controlled failures to test system resilience

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${CHAOS_ENVIRONMENT:-staging}"
NAMESPACE="ofm-${ENVIRONMENT}"
CHAOS_DURATION="${CHAOS_DURATION:-300}" # 5 minutes default
PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus-server.monitoring.svc.cluster.local}"
RESULTS_DIR="${RESULTS_DIR:-./chaos-results}"
DRY_RUN="${DRY_RUN:-false}"

# Chaos scenarios
declare -A CHAOS_SCENARIOS=(
    ["s3-5xx"]="Inject S3 5xx errors to test upload resilience"
    ["redis-unavailable"]="Make Redis unavailable to test caching fallback"
    ["postgres-failover"]="Trigger PostgreSQL failover to test DB resilience"
    ["network-partition"]="Create network partition to test service mesh"
    ["pod-kill"]="Kill random pods to test restart resilience"
    ["memory-pressure"]="Create memory pressure to test resource limits"
    ["cpu-spike"]="Generate CPU spikes to test autoscaling"
    ["disk-full"]="Simulate disk full condition"
)

print_banner() {
    echo -e "${RED}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                🔥 CHAOS ENGINEERING - OFM SOCIAL OS          ║"
    echo "║                    Testing System Resilience                  ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_config() {
    echo -e "${YELLOW}🔧 Chaos Configuration:${NC}"
    echo "  Environment: $ENVIRONMENT"
    echo "  Namespace: $NAMESPACE"
    echo "  Duration: ${CHAOS_DURATION}s"
    echo "  Results Dir: $RESULTS_DIR"
    echo "  Dry Run: $DRY_RUN"
    echo ""
}

check_prerequisites() {
    echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}❌ kubectl is not installed${NC}"
        exit 1
    fi
    
    # Check if we can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
        exit 1
    fi
    
    # Check if namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        echo -e "${RED}❌ Namespace $NAMESPACE does not exist${NC}"
        exit 1
    fi
    
    # Check if Chaos Mesh is available (optional)
    if kubectl get crd chaosexperiments.chaos-mesh.org &> /dev/null; then
        echo -e "${GREEN}✅ Chaos Mesh available${NC}"
        CHAOS_MESH_AVAILABLE=true
    else
        echo -e "${YELLOW}⚠️  Chaos Mesh not available - using kubectl methods${NC}"
        CHAOS_MESH_AVAILABLE=false
    fi
    
    # Create results directory
    mkdir -p "$RESULTS_DIR"
    
    echo -e "${GREEN}✅ Prerequisites check completed${NC}"
    echo ""
}

collect_baseline_metrics() {
    echo -e "${BLUE}📊 Collecting baseline metrics...${NC}"
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local baseline_file="$RESULTS_DIR/baseline_${timestamp}.json"
    
    # Collect key metrics before chaos injection
    cat > "$baseline_file" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "environment": "$ENVIRONMENT",
  "namespace": "$NAMESPACE",
  "metrics": {
EOF
    
    # HTTP request metrics
    if curl -s --max-time 5 "$PROMETHEUS_URL/api/v1/query?query=sum(rate(http_requests_total{namespace=\"$NAMESPACE\"}[5m]))" > /tmp/http_rate.json 2>/dev/null; then
        local http_rate=$(jq -r '.data.result[0].value[1] // "0"' /tmp/http_rate.json)
        echo "    \"http_request_rate\": $http_rate," >> "$baseline_file"
    fi
    
    # Error rate
    if curl -s --max-time 5 "$PROMETHEUS_URL/api/v1/query?query=sum(rate(http_requests_total{namespace=\"$NAMESPACE\",status=~\"5..\"}[5m]))/sum(rate(http_requests_total{namespace=\"$NAMESPACE\"}[5m]))" > /tmp/error_rate.json 2>/dev/null; then
        local error_rate=$(jq -r '.data.result[0].value[1] // "0"' /tmp/error_rate.json)
        echo "    \"error_rate\": $error_rate," >> "$baseline_file"
    fi
    
    # P95 latency
    if curl -s --max-time 5 "$PROMETHEUS_URL/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket{namespace=\"$NAMESPACE\"}[5m])))" > /tmp/p95.json 2>/dev/null; then
        local p95_latency=$(jq -r '.data.result[0].value[1] // "0"' /tmp/p95.json)
        echo "    \"p95_latency_seconds\": $p95_latency," >> "$baseline_file"
    fi
    
    # Pod count
    local pod_count=$(kubectl get pods -n "$NAMESPACE" --no-headers | wc -l)
    echo "    \"running_pods\": $pod_count," >> "$baseline_file"
    
    # Database connections
    if curl -s --max-time 5 "$PROMETHEUS_URL/api/v1/query?query=sum(database_connections_active{namespace=\"$NAMESPACE\"})" > /tmp/db_conn.json 2>/dev/null; then
        local db_connections=$(jq -r '.data.result[0].value[1] // "0"' /tmp/db_conn.json)
        echo "    \"database_connections\": $db_connections" >> "$baseline_file"
    else
        echo "    \"database_connections\": 0" >> "$baseline_file"
    fi
    
    echo "  }" >> "$baseline_file"
    echo "}" >> "$baseline_file"
    
    echo -e "${GREEN}✅ Baseline metrics saved to: $baseline_file${NC}"
}

inject_s3_5xx_errors() {
    echo -e "${RED}🔥 Injecting S3 5xx errors...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would inject S3 5xx errors for ${CHAOS_DURATION}s${NC}"
        return
    fi
    
    # Method 1: Using network policies to block S3 traffic (simpler)
    cat << EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: chaos-block-s3
  namespace: $NAMESPACE
  labels:
    chaos-experiment: s3-5xx
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: ofm-social-os
      component: api
  policyTypes:
  - Egress
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443
    except:
    - namespaceSelector: {}
  - to:
    - namespaceSelector: {}
  - to: []
    ports:
    - protocol: TCP
      port: 80
    - protocol: TCP
      port: 5432  # PostgreSQL
    - protocol: TCP
      port: 6379  # Redis
    - protocol: UDP
      port: 53    # DNS
EOF
    
    echo -e "${RED}🚨 S3 traffic blocked - uploads should fail${NC}"
    
    # Monitor during chaos
    monitor_chaos_metrics "s3-5xx" &
    local monitor_pid=$!
    
    # Wait for chaos duration
    echo -e "${YELLOW}⏳ Chaos injection active for ${CHAOS_DURATION}s...${NC}"
    sleep "$CHAOS_DURATION"
    
    # Stop monitoring
    kill $monitor_pid 2>/dev/null || true
    
    # Clean up network policy
    kubectl delete networkpolicy chaos-block-s3 -n "$NAMESPACE" 2>/dev/null || true
    
    echo -e "${GREEN}✅ S3 chaos injection completed and cleaned up${NC}"
}

inject_redis_unavailable() {
    echo -e "${RED}🔥 Making Redis unavailable...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would make Redis unavailable for ${CHAOS_DURATION}s${NC}"
        return
    fi
    
    # Scale down Redis deployment
    local redis_replicas=$(kubectl get deployment redis -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
    
    if [[ "$redis_replicas" -gt 0 ]]; then
        kubectl scale deployment redis --replicas=0 -n "$NAMESPACE"
        echo -e "${RED}🚨 Redis scaled down to 0 replicas${NC}"
        
        # Monitor during chaos
        monitor_chaos_metrics "redis-unavailable" &
        local monitor_pid=$!
        
        # Wait for chaos duration
        echo -e "${YELLOW}⏳ Redis unavailable for ${CHAOS_DURATION}s...${NC}"
        sleep "$CHAOS_DURATION"
        
        # Stop monitoring
        kill $monitor_pid 2>/dev/null || true
        
        # Restore Redis
        kubectl scale deployment redis --replicas="$redis_replicas" -n "$NAMESPACE"
        
        # Wait for Redis to be ready
        kubectl rollout status deployment/redis -n "$NAMESPACE" --timeout=120s
        
        echo -e "${GREEN}✅ Redis restored to $redis_replicas replicas${NC}"
    else
        # Alternative: Block Redis network traffic
        cat << EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: chaos-block-redis
  namespace: $NAMESPACE
  labels:
    chaos-experiment: redis-unavailable
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: ofm-social-os
  policyTypes:
  - Egress
  egress:
  - to: []
    except:
    - podSelector:
        matchLabels:
          app: redis
EOF
        
        echo -e "${RED}🚨 Redis network traffic blocked${NC}"
        
        # Monitor during chaos
        monitor_chaos_metrics "redis-unavailable" &
        local monitor_pid=$!
        
        sleep "$CHAOS_DURATION"
        kill $monitor_pid 2>/dev/null || true
        
        # Clean up
        kubectl delete networkpolicy chaos-block-redis -n "$NAMESPACE" 2>/dev/null || true
        
        echo -e "${GREEN}✅ Redis network chaos completed${NC}"
    fi
}

inject_postgres_failover() {
    echo -e "${RED}🔥 Triggering PostgreSQL failover...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would trigger PostgreSQL failover for ${CHAOS_DURATION}s${NC}"
        return
    fi
    
    # Find PostgreSQL primary pod
    local pg_primary=$(kubectl get pods -n "$NAMESPACE" -l app=postgresql,role=primary -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [[ -n "$pg_primary" ]]; then
        echo -e "${RED}🚨 Killing PostgreSQL primary: $pg_primary${NC}"
        
        # Monitor during chaos
        monitor_chaos_metrics "postgres-failover" &
        local monitor_pid=$!
        
        # Kill primary pod to trigger failover
        kubectl delete pod "$pg_primary" -n "$NAMESPACE" --grace-period=0 --force
        
        # Wait for failover to complete
        echo -e "${YELLOW}⏳ Waiting for PostgreSQL failover...${NC}"
        sleep 30
        
        # Continue monitoring for remaining duration
        local remaining=$((CHAOS_DURATION - 30))
        if [[ $remaining -gt 0 ]]; then
            sleep $remaining
        fi
        
        # Stop monitoring
        kill $monitor_pid 2>/dev/null || true
        
        # Verify new primary is running
        local new_primary=$(kubectl get pods -n "$NAMESPACE" -l app=postgresql,role=primary -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "none")
        echo -e "${GREEN}✅ PostgreSQL failover completed. New primary: $new_primary${NC}"
    else
        echo -e "${YELLOW}⚠️  No PostgreSQL primary found, simulating connection issues instead${NC}"
        
        # Block PostgreSQL connections temporarily
        cat << EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: chaos-block-postgres
  namespace: $NAMESPACE
  labels:
    chaos-experiment: postgres-failover
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: ofm-social-os
  policyTypes:
  - Egress
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 443  # HTTPS
    - protocol: TCP
      port: 80   # HTTP
    - protocol: TCP
      port: 6379 # Redis
    - protocol: UDP
      port: 53   # DNS
EOF
        
        monitor_chaos_metrics "postgres-failover" &
        local monitor_pid=$!
        
        sleep "$CHAOS_DURATION"
        kill $monitor_pid 2>/dev/null || true
        
        kubectl delete networkpolicy chaos-block-postgres -n "$NAMESPACE" 2>/dev/null || true
        
        echo -e "${GREEN}✅ PostgreSQL connection chaos completed${NC}"
    fi
}

inject_pod_kill() {
    echo -e "${RED}🔥 Killing random pods...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would kill random pods for ${CHAOS_DURATION}s${NC}"
        return
    fi
    
    # Monitor during chaos
    monitor_chaos_metrics "pod-kill" &
    local monitor_pid=$!
    
    local end_time=$(($(date +%s) + CHAOS_DURATION))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        # Get random pod from our namespace
        local pod=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}' | tr ' ' '\n' | grep -E '^ofm-social-os-' | sort -R | head -n1)
        
        if [[ -n "$pod" ]]; then
            echo -e "${RED}🚨 Killing pod: $pod${NC}"
            kubectl delete pod "$pod" -n "$NAMESPACE" --grace-period=10 &
        fi
        
        # Wait 30 seconds between kills
        sleep 30
    done
    
    # Stop monitoring
    kill $monitor_pid 2>/dev/null || true
    
    echo -e "${GREEN}✅ Pod kill chaos completed${NC}"
}

inject_memory_pressure() {
    echo -e "${RED}🔥 Creating memory pressure...${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}[DRY RUN] Would create memory pressure for ${CHAOS_DURATION}s${NC}"
        return
    fi
    
    # Create memory pressure pod
    cat << EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: chaos-memory-pressure
  namespace: $NAMESPACE
  labels:
    chaos-experiment: memory-pressure
spec:
  containers:
  - name: memory-hog
    image: busybox
    command: ["/bin/sh"]
    args:
    - -c
    - |
      echo "Starting memory pressure..."
      # Allocate memory in chunks
      for i in \$(seq 1 10); do
        dd if=/dev/zero of=/tmp/memory_\$i bs=1M count=100 2>/dev/null
        sleep 5
      done
      echo "Memory pressure active, sleeping..."
      sleep $CHAOS_DURATION
    resources:
      requests:
        memory: "512Mi"
      limits:
        memory: "1Gi"
  restartPolicy: Never
EOF
    
    # Monitor during chaos
    monitor_chaos_metrics "memory-pressure" &
    local monitor_pid=$!
    
    echo -e "${RED}🚨 Memory pressure pod created${NC}"
    
    # Wait for completion
    kubectl wait --for=condition=Ready pod/chaos-memory-pressure -n "$NAMESPACE" --timeout=60s || true
    sleep "$CHAOS_DURATION"
    
    # Stop monitoring
    kill $monitor_pid 2>/dev/null || true
    
    # Clean up
    kubectl delete pod chaos-memory-pressure -n "$NAMESPACE" --grace-period=0 --force 2>/dev/null || true
    
    echo -e "${GREEN}✅ Memory pressure chaos completed${NC}"
}

monitor_chaos_metrics() {
    local scenario="$1"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local metrics_file="$RESULTS_DIR/chaos_${scenario}_${timestamp}.json"
    
    echo "Starting metrics collection for $scenario..." > "$metrics_file"
    
    local start_time=$(date +%s)
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [[ $elapsed -gt $CHAOS_DURATION ]]; then
            break
        fi
        
        # Collect metrics every 15 seconds
        {
            echo "{"
            echo "  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
            echo "  \"elapsed_seconds\": $elapsed,"
            echo "  \"scenario\": \"$scenario\","
            
            # HTTP metrics
            if curl -s --max-time 5 "$PROMETHEUS_URL/api/v1/query?query=sum(rate(http_requests_total{namespace=\"$NAMESPACE\"}[1m]))" > /tmp/http_current.json 2>/dev/null; then
                local current_rate=$(jq -r '.data.result[0].value[1] // "0"' /tmp/http_current.json)
                echo "  \"http_request_rate\": $current_rate,"
            fi
            
            # Error rate
            if curl -s --max-time 5 "$PROMETHEUS_URL/api/v1/query?query=sum(rate(http_requests_total{namespace=\"$NAMESPACE\",status=~\"5..\"}[1m]))/sum(rate(http_requests_total{namespace=\"$NAMESPACE\"}[1m]))" > /tmp/error_current.json 2>/dev/null; then
                local current_errors=$(jq -r '.data.result[0].value[1] // "0"' /tmp/error_current.json)
                echo "  \"error_rate\": $current_errors,"
            fi
            
            # Pod status
            local running_pods=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Running --no-headers | wc -l)
            local pending_pods=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Pending --no-headers | wc -l)
            local failed_pods=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Failed --no-headers | wc -l)
            
            echo "  \"pods\": {"
            echo "    \"running\": $running_pods,"
            echo "    \"pending\": $pending_pods,"
            echo "    \"failed\": $failed_pods"
            echo "  }"
            
            echo "}"
        } >> "$metrics_file"
        
        sleep 15
    done
    
    echo -e "${BLUE}📊 Metrics collected in: $metrics_file${NC}"
}

analyze_chaos_results() {
    local scenario="$1"
    
    echo -e "${BLUE}📈 Analyzing chaos results for $scenario...${NC}"
    
    # Find the most recent results file for this scenario
    local results_file=$(find "$RESULTS_DIR" -name "chaos_${scenario}_*.json" -type f | sort | tail -n1)
    
    if [[ -z "$results_file" ]] || [[ ! -f "$results_file" ]]; then
        echo -e "${YELLOW}⚠️  No results file found for $scenario${NC}"
        return
    fi
    
    echo "Results file: $results_file"
    
    # Basic analysis
    local max_error_rate=$(jq -r '[.error_rate] | max // 0' "$results_file" 2>/dev/null || echo "0")
    local avg_pods_running=$(jq -r '[.pods.running] | add / length // 0' "$results_file" 2>/dev/null || echo "0")
    local max_pods_failed=$(jq -r '[.pods.failed] | max // 0' "$results_file" 2>/dev/null || echo "0")
    
    echo -e "${YELLOW}📊 Chaos Analysis Summary:${NC}"
    echo "  Scenario: $scenario"
    echo "  Max Error Rate: $(echo "$max_error_rate * 100" | bc -l 2>/dev/null || echo "$max_error_rate")%"
    echo "  Avg Pods Running: $avg_pods_running"
    echo "  Max Pods Failed: $max_pods_failed"
    
    # Determine resilience score
    local resilience_score=100
    
    if (( $(echo "$max_error_rate > 0.1" | bc -l 2>/dev/null || echo 0) )); then
        resilience_score=$((resilience_score - 30))
        echo -e "${RED}  ❌ High error rate detected${NC}"
    fi
    
    if [[ "$max_pods_failed" -gt 0 ]]; then
        resilience_score=$((resilience_score - 20))
        echo -e "${YELLOW}  ⚠️  Pod failures detected${NC}"
    fi
    
    if [[ "$avg_pods_running" -lt 2 ]]; then
        resilience_score=$((resilience_score - 25))
        echo -e "${RED}  ❌ Low availability during chaos${NC}"
    fi
    
    echo -e "${BLUE}  🎯 Resilience Score: ${resilience_score}/100${NC}"
    
    # Generate recommendations
    if [[ $resilience_score -lt 70 ]]; then
        echo -e "${RED}  💡 Recommendations:${NC}"
        echo "    - Increase replica counts for critical services"
        echo "    - Implement better circuit breakers"
        echo "    - Add retry logic with exponential backoff"
        echo "    - Review resource limits and requests"
    elif [[ $resilience_score -lt 90 ]]; then
        echo -e "${YELLOW}  💡 Recommendations:${NC}"
        echo "    - Fine-tune health checks and probes"
        echo "    - Consider implementing graceful degradation"
    else
        echo -e "${GREEN}  ✅ Excellent resilience! System handled chaos well.${NC}"
    fi
}

run_chaos_scenario() {
    local scenario="$1"
    
    if [[ -z "${CHAOS_SCENARIOS[$scenario]:-}" ]]; then
        echo -e "${RED}❌ Unknown chaos scenario: $scenario${NC}"
        echo "Available scenarios:"
        for s in "${!CHAOS_SCENARIOS[@]}"; do
            echo "  $s: ${CHAOS_SCENARIOS[$s]}"
        done
        exit 1
    fi
    
    echo -e "${PURPLE}🎯 Running chaos scenario: $scenario${NC}"
    echo -e "${BLUE}Description: ${CHAOS_SCENARIOS[$scenario]}${NC}"
    echo ""
    
    # Collect baseline before starting chaos
    collect_baseline_metrics
    
    # Execute the specific chaos scenario
    case "$scenario" in
        "s3-5xx")
            inject_s3_5xx_errors
            ;;
        "redis-unavailable")
            inject_redis_unavailable
            ;;
        "postgres-failover")
            inject_postgres_failover
            ;;
        "pod-kill")
            inject_pod_kill
            ;;
        "memory-pressure")
            inject_memory_pressure
            ;;
        *)
            echo -e "${RED}❌ Chaos scenario '$scenario' not implemented yet${NC}"
            exit 1
            ;;
    esac
    
    # Wait for system to stabilize
    echo -e "${YELLOW}⏳ Waiting for system stabilization...${NC}"
    sleep 30
    
    # Analyze results
    analyze_chaos_results "$scenario"
    
    echo -e "${GREEN}✅ Chaos scenario '$scenario' completed${NC}"
}

show_usage() {
    echo "Usage: $0 [scenario] [options]"
    echo ""
    echo "Available chaos scenarios:"
    for scenario in "${!CHAOS_SCENARIOS[@]}"; do
        echo "  $scenario - ${CHAOS_SCENARIOS[$scenario]}"
    done
    echo ""
    echo "Options:"
    echo "  --environment [env]    Environment (staging/production) [default: staging]"
    echo "  --duration [seconds]   Chaos duration in seconds [default: 300]"
    echo "  --dry-run             Show what would be done without executing"
    echo "  --results-dir [dir]   Directory for results [default: ./chaos-results]"
    echo "  --help               Show this help"
    echo ""
    echo "Environment variables:"
    echo "  CHAOS_ENVIRONMENT     Environment to target"
    echo "  CHAOS_DURATION        Duration in seconds"
    echo "  PROMETHEUS_URL        Prometheus server URL"
    echo "  RESULTS_DIR          Results directory"
    echo "  DRY_RUN              Set to 'true' for dry run"
    echo ""
    echo "Examples:"
    echo "  $0 s3-5xx --duration 180"
    echo "  $0 redis-unavailable --environment production --dry-run"
    echo "  $0 postgres-failover --results-dir /tmp/chaos"
}

main() {
    print_banner
    
    if [[ $# -eq 0 ]] || [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
        show_usage
        exit 0
    fi
    
    local scenario="$1"
    shift
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment)
                ENVIRONMENT="$2"
                NAMESPACE="ofm-${ENVIRONMENT}"
                shift 2
                ;;
            --duration)
                CHAOS_DURATION="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --results-dir)
                RESULTS_DIR="$2"
                shift 2
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
    
    # Safety check for production
    if [[ "$ENVIRONMENT" == "production" ]] && [[ "$DRY_RUN" != "true" ]]; then
        echo -e "${RED}⚠️  WARNING: You are about to run chaos engineering on PRODUCTION!${NC}"
        echo -e "${RED}This could cause service disruption and affect real users.${NC}"
        echo ""
        read -p "Are you absolutely sure you want to continue? (type 'YES' to confirm): " -r
        if [[ $REPLY != "YES" ]]; then
            echo "Chaos injection cancelled."
            exit 1
        fi
    fi
    
    run_chaos_scenario "$scenario"
    
    echo -e "${GREEN}🎉 Chaos engineering session completed!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo "1. Review results in: $RESULTS_DIR"
    echo "2. Check application logs for error handling"
    echo "3. Verify system recovery and stability"
    echo "4. Update runbooks based on findings"
    echo "5. Schedule regular chaos engineering sessions"
}

# Cleanup on script exit
trap 'echo -e "\n${YELLOW}🧹 Cleaning up chaos resources...${NC}"; kubectl delete networkpolicy -n "$NAMESPACE" -l chaos-experiment &>/dev/null || true; kubectl delete pod -n "$NAMESPACE" -l chaos-experiment &>/dev/null || true' EXIT

# Run main function if script is called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi