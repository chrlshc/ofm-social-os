#!/bin/bash
set -euo pipefail

# Canary 10% Deployment Script
# Executes controlled canary deployment with SLO monitoring

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
CANARY_VERSION="${CANARY_VERSION:-v1.0.0}"
NAMESPACE="ofm-${ENVIRONMENT}"
CANARY_WEIGHT="${CANARY_WEIGHT:-10}"
MONITOR_DURATION="${MONITOR_DURATION:-1800}" # 30 minutes default

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

# Pre-deployment validation
validate_prerequisites() {
    log "🔍 Validating deployment prerequisites..."
    
    # Check kubectl access
    if ! kubectl cluster-info &>/dev/null; then
        error "Cannot access Kubernetes cluster"
    fi
    
    # Check namespace
    if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
        error "Namespace does not exist: $NAMESPACE"
    fi
    
    # Check Argo Rollouts
    if ! kubectl get crd rollouts.argoproj.io &>/dev/null; then
        error "Argo Rollouts CRD not found"
    fi
    
    # Check Helm release exists
    if ! helm list -n "$NAMESPACE" | grep -q ofm-social-os; then
        warn "No existing Helm release found - this will be a fresh deployment"
    fi
    
    success "Prerequisites validated"
}

# Execute preflight checks
run_preflight_checks() {
    log "🚀 Running preflight checks..."
    
    if [[ -f "$ROOT_DIR/scripts/preflight/production-preflight.sh" ]]; then
        if "$ROOT_DIR/scripts/preflight/production-preflight.sh"; then
            success "Preflight checks passed"
        else
            error "Preflight checks failed - aborting deployment"
        fi
    else
        warn "Preflight script not found - proceeding with basic validation"
    fi
}

# Deploy canary using Helm
deploy_canary() {
    log "🚀 Deploying canary version $CANARY_VERSION with ${CANARY_WEIGHT}% traffic..."
    
    # Prepare Helm values for canary deployment
    local values_file="/tmp/canary-values-${CANARY_VERSION}.yaml"
    
    cat > "$values_file" << EOF
# Canary deployment configuration
global:
  environment: $ENVIRONMENT
  version: $CANARY_VERSION

# Application configuration
app:
  replicas: 3
  image:
    repository: ghcr.io/ofm/social-os/api
    tag: $CANARY_VERSION

# Canary deployment settings
canary:
  enabled: true
  weight: $CANARY_WEIGHT
  
# Argo Rollouts configuration
rollout:
  enabled: true
  strategy:
    canary:
      steps:
      - setWeight: $CANARY_WEIGHT
      - pause: 
          duration: ${MONITOR_DURATION}s
      - setWeight: 25
      - pause:
          duration: 900s # 15 minutes
      - setWeight: 50
      - pause:
          duration: 900s # 15 minutes
      - setWeight: 75
      - pause:
          duration: 600s # 10 minutes
      - setWeight: 100
      
  # SLO-based analysis
  analysis:
    templates:
    - templateName: slo-analysis
    args:
    - name: service-name
      value: ofm-social-os-api
    - name: namespace
      value: $NAMESPACE

# Monitoring configuration
monitoring:
  enabled: true
  prometheus:
    enabled: true
  grafana:
    enabled: true

# Database migration
database:
  migrate: true
  migrationJob:
    enabled: true
    image:
      repository: ghcr.io/ofm/social-os/migrator
      tag: $CANARY_VERSION

# Resources
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "1000m"

# Autoscaling
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

# Service configuration
service:
  type: ClusterIP
  port: 80

# Ingress
ingress:
  enabled: true
  host: api.ofm.social
  tls:
    enabled: true

# Security
security:
  podSecurityContext:
    runAsNonRoot: true
    runAsUser: 1001
    fsGroup: 1001
  
  networkPolicy:
    enabled: true

EOF

    log "Helm values prepared: $values_file"
    
    # Execute Helm deployment
    helm upgrade --install ofm-social-os \
        "$ROOT_DIR/k8s/helm/ofm-social-os" \
        --namespace "$NAMESPACE" \
        --values "$values_file" \
        --wait \
        --timeout=10m \
        --debug
    
    success "Canary deployment initiated"
}

# Wait for rollout to start
wait_for_rollout_start() {
    log "⏳ Waiting for Argo Rollout to start..."
    
    local timeout=300 # 5 minutes
    local elapsed=0
    
    while [[ $elapsed -lt $timeout ]]; do
        if kubectl get rollout ofm-social-os -n "$NAMESPACE" &>/dev/null; then
            local status=$(kubectl get rollout ofm-social-os -n "$NAMESPACE" -o jsonpath='{.status.phase}')
            if [[ "$status" == "Progressing" || "$status" == "Healthy" ]]; then
                success "Rollout started - Status: $status"
                return 0
            fi
        fi
        
        sleep 10
        ((elapsed += 10))
        log "Waiting for rollout to start... (${elapsed}s/${timeout}s)"
    done
    
    error "Rollout failed to start within $timeout seconds"
}

# Start monitoring processes
start_monitoring() {
    log "📊 Starting monitoring processes..."
    
    # Start SLO monitoring in background
    if [[ -f "$ROOT_DIR/scripts/slo/verify-slo.ts" ]]; then
        log "Starting SLO verification..."
        cd "$ROOT_DIR/scripts/slo"
        npx ts-node verify-slo.ts \
            --environment "$ENVIRONMENT" \
            --service-name "ofm-social-os-api" \
            --namespace "$NAMESPACE" \
            --output-file "/tmp/slo-results.json" \
            --refresh-interval 30 &
        
        SLO_PID=$!
        log "SLO monitoring started (PID: $SLO_PID)"
    fi
    
    # Start canary status monitoring in background
    if [[ -f "$ROOT_DIR/scripts/canary/publish-status.ts" ]]; then
        log "Starting canary status monitoring..."
        cd "$ROOT_DIR/scripts/canary"
        npx ts-node publish-status.ts \
            --environment "$ENVIRONMENT" \
            --service-name "ofm-social-os-api" \
            --namespace "$NAMESPACE" \
            --canary-version "$CANARY_VERSION" \
            --output-format "both" \
            --output-file "/tmp/canary-status.json" \
            --refresh-interval 30 &
        
        CANARY_MONITOR_PID=$!
        log "Canary status monitoring started (PID: $CANARY_MONITOR_PID)"
    fi
    
    # Watch Argo Rollout status
    log "Watching Argo Rollout progress..."
    kubectl get rollout ofm-social-os -n "$NAMESPACE" -w &
    ROLLOUT_WATCH_PID=$!
}

# Monitor canary health
monitor_canary_health() {
    log "🔍 Monitoring canary health for ${MONITOR_DURATION} seconds..."
    
    local check_interval=60 # Check every minute
    local total_checks=$((MONITOR_DURATION / check_interval))
    local current_check=0
    
    while [[ $current_check -lt $total_checks ]]; do
        ((current_check++))
        
        log "Health check $current_check/$total_checks"
        
        # Check rollout status
        local rollout_status=$(kubectl get rollout ofm-social-os -n "$NAMESPACE" -o jsonpath='{.status.phase}' 2>/dev/null || echo "Unknown")
        log "Rollout status: $rollout_status"
        
        # Check canary pods
        local canary_pods=$(kubectl get pods -n "$NAMESPACE" -l app=ofm-social-os,rollouts-pod-template-hash --no-headers 2>/dev/null | wc -l)
        local canary_ready=$(kubectl get pods -n "$NAMESPACE" -l app=ofm-social-os,rollouts-pod-template-hash --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
        log "Canary pods: $canary_ready/$canary_pods ready"
        
        # Check API health
        if kubectl port-forward -n "$NAMESPACE" service/ofm-social-os 8080:80 &>/dev/null &; then
            local pf_pid=$!
            sleep 2
            
            if curl -f --max-time 10 http://localhost:8080/health &>/dev/null; then
                success "API health check passed"
            else
                warn "API health check failed"
            fi
            
            kill $pf_pid 2>/dev/null || true
        fi
        
        # Check for rollout abortion
        if [[ "$rollout_status" == "Degraded" || "$rollout_status" == "Aborted" ]]; then
            error "Rollout has been degraded or aborted - stopping monitoring"
        fi
        
        sleep $check_interval
    done
    
    success "Canary monitoring completed"
}

# Check SLO compliance
check_slo_compliance() {
    log "📈 Checking SLO compliance..."
    
    if [[ -f "/tmp/slo-results.json" ]]; then
        local latest_result=$(jq -r '.timestamp' /tmp/slo-results.json 2>/dev/null | tail -1)
        log "Latest SLO check: $latest_result"
        
        # Extract SLO status
        local p95_latency=$(jq -r '.slos[] | select(.name=="p95_latency") | .current' /tmp/slo-results.json 2>/dev/null | tail -1)
        local success_rate=$(jq -r '.slos[] | select(.name=="success_rate") | .current' /tmp/slo-results.json 2>/dev/null | tail -1)
        local webhook_signatures=$(jq -r '.slos[] | select(.name=="webhook_signatures") | .current' /tmp/slo-results.json 2>/dev/null | tail -1)
        
        log "P95 Latency: ${p95_latency:-N/A}ms (target: <10000ms)"
        log "Success Rate: ${success_rate:-N/A}% (target: ≥95%)"
        log "Webhook Signatures: ${webhook_signatures:-N/A}% (target: ≥99.9%)"
        
        # Determine compliance
        if [[ "${p95_latency:-10001}" -lt 10000 ]] && \
           [[ "${success_rate:-0}" -ge 95 ]] && \
           [[ "${webhook_signatures:-0}" -ge 99.9 ]]; then
            success "All SLOs are compliant - canary is healthy"
            return 0
        else
            warn "Some SLOs are not compliant - manual review required"
            return 1
        fi
    else
        warn "No SLO results file found - cannot determine compliance"
        return 1
    fi
}

# Post-deployment validation
validate_deployment() {
    log "✅ Running post-deployment validation..."
    
    # Check rollout status
    local rollout_status=$(kubectl get rollout ofm-social-os -n "$NAMESPACE" -o jsonpath='{.status.phase}')
    log "Final rollout status: $rollout_status"
    
    # Check pods
    local total_pods=$(kubectl get pods -n "$NAMESPACE" -l app=ofm-social-os --no-headers | wc -l)
    local ready_pods=$(kubectl get pods -n "$NAMESPACE" -l app=ofm-social-os --field-selector=status.phase=Running --no-headers | wc -l)
    log "Pods status: $ready_pods/$total_pods ready"
    
    # Run smoke tests
    if [[ -f "$ROOT_DIR/tests/load/k6/scenarios/smoke.js" ]]; then
        log "Running smoke tests..."
        cd "$ROOT_DIR/tests/load/k6"
        k6 run scenarios/smoke.js --quiet || warn "Smoke tests failed"
    fi
    
    if [[ "$rollout_status" == "Healthy" ]] && [[ $ready_pods -gt 0 ]]; then
        success "Deployment validation passed"
        return 0
    else
        error "Deployment validation failed"
        return 1
    fi
}

# Cleanup monitoring processes
cleanup_monitoring() {
    log "🧹 Cleaning up monitoring processes..."
    
    # Kill background processes
    [[ -n "${SLO_PID:-}" ]] && kill $SLO_PID 2>/dev/null || true
    [[ -n "${CANARY_MONITOR_PID:-}" ]] && kill $CANARY_MONITOR_PID 2>/dev/null || true  
    [[ -n "${ROLLOUT_WATCH_PID:-}" ]] && kill $ROLLOUT_WATCH_PID 2>/dev/null || true
    
    # Archive results
    local results_dir="canary-results-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$results_dir"
    
    [[ -f "/tmp/slo-results.json" ]] && cp /tmp/slo-results.json "$results_dir/"
    [[ -f "/tmp/canary-status.json" ]] && cp /tmp/canary-status.json "$results_dir/"
    
    log "Results archived to: $results_dir"
}

# Generate deployment report
generate_deployment_report() {
    log "📋 Generating deployment report..."
    
    local report_file="canary-10-deployment-report-$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$report_file" << EOF
# Canary 10% Deployment Report

**Date**: $(date)
**Version**: $CANARY_VERSION
**Environment**: $ENVIRONMENT
**Canary Weight**: ${CANARY_WEIGHT}%
**Namespace**: $NAMESPACE

## Deployment Summary

✅ **Status**: Canary 10% deployment completed
🎯 **Target**: ${CANARY_WEIGHT}% of production traffic
⏱️ **Duration**: ${MONITOR_DURATION} seconds monitoring

## Rollout Status

EOF

    # Add rollout information
    kubectl get rollout ofm-social-os -n "$NAMESPACE" -o yaml >> "$report_file" 2>/dev/null || echo "Rollout information not available" >> "$report_file"
    
    cat >> "$report_file" << EOF

## SLO Compliance

EOF

    if [[ -f "/tmp/slo-results.json" ]]; then
        echo "Latest SLO metrics from monitoring:" >> "$report_file"
        jq -r '.slos[] | "- **\(.name)**: \(.current) (target: \(.target)) - \(.status)"' /tmp/slo-results.json >> "$report_file" 2>/dev/null || echo "SLO data format error" >> "$report_file"
    else
        echo "No SLO results available" >> "$report_file"
    fi
    
    cat >> "$report_file" << EOF

## Next Steps

1. ✅ Monitor canary for 30 minutes minimum
2. 📊 Validate all SLOs remain compliant
3. 🚀 If healthy, progress to 25% canary weight
4. 🔄 Continue staged rollout: 25% → 50% → 75% → 100%
5. 🚨 If issues detected, execute rollback immediately

### Commands for Next Stage

\`\`\`bash
# Progress to 25% (manual)
kubectl argo rollouts promote ofm-social-os -n $NAMESPACE

# Or automatic progression based on analysis
kubectl argo rollouts set-canary-weight ofm-social-os 25 -n $NAMESPACE
\`\`\`

### Rollback Commands (if needed)

\`\`\`bash
# Immediate rollback
kubectl argo rollouts abort ofm-social-os -n $NAMESPACE
kubectl argo rollouts undo ofm-social-os -n $NAMESPACE
\`\`\`

## Monitoring

- **Grafana**: https://grafana.ofm.social/d/canary/canary-deployment
- **Prometheus**: https://prometheus.ofm.social
- **Argo Rollouts UI**: kubectl argo rollouts dashboard

---

*Generated by OFM Social OS Canary Deployment*
EOF

    success "Deployment report generated: $report_file"
    echo "$report_file"
}

# Main execution
main() {
    log "🚀 Starting canary 10% deployment for $CANARY_VERSION..."
    
    # Setup cleanup trap
    trap cleanup_monitoring EXIT
    
    # Execute deployment pipeline
    validate_prerequisites
    run_preflight_checks
    deploy_canary
    wait_for_rollout_start
    start_monitoring
    monitor_canary_health
    
    # Validate results
    if check_slo_compliance && validate_deployment; then
        success "🎉 Canary 10% deployment successful!"
        
        # Generate report
        local report_file=$(generate_deployment_report)
        echo ""
        echo "📋 Deployment Report: $report_file"
        echo "🔍 Continue monitoring for 30+ minutes"
        echo "🚀 Next: Progress to 25% if SLOs remain compliant"
        
        exit 0
    else
        error "❌ Canary deployment completed with issues - review monitoring data"
        exit 1
    fi
}

# Handle script arguments
case "${1:-main}" in
    "validate-only")
        validate_prerequisites
        ;;
    "preflight-only")
        run_preflight_checks
        ;;
    "deploy-only")
        validate_prerequisites
        deploy_canary
        wait_for_rollout_start
        ;;
    *)
        main
        ;;
esac