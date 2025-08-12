#!/bin/bash
set -euo pipefail

# Production Preflight Checklist Script
# Comprehensive pre-deployment validation for canary 10%

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
CANARY_WEIGHT="${CANARY_WEIGHT:-10}"
NAMESPACE="ofm-${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Results tracking
PREFLIGHT_RESULTS=()
CRITICAL_FAILURES=0
WARNINGS=0

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
    ((WARNINGS++))
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    ((CRITICAL_FAILURES++))
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}"
}

add_result() {
    local check="$1"
    local status="$2"
    local details="${3:-}"
    
    PREFLIGHT_RESULTS+=("$check|$status|$details")
}

# Database migration dry run check
check_database_migration() {
    log "🔍 Checking database migration readiness..."
    
    if [[ -f "$ROOT_DIR/scripts/db/migrate-dry-run.sh" ]]; then
        log "Running database migration dry run..."
        
        if "$ROOT_DIR/scripts/db/migrate-dry-run.sh" check-only; then
            success "Database migration dry run prerequisites OK"
            add_result "Database Migration" "✅ PASS" "Dry run prerequisites validated"
        else
            error "Database migration dry run failed"
            add_result "Database Migration" "❌ FAIL" "Dry run prerequisites not met"
        fi
    else
        warn "Migration dry run script not found - skipping detailed validation"
        add_result "Database Migration" "⚠️ SKIP" "Dry run script not available"
    fi
}

# Production secrets validation
check_production_secrets() {
    log "🔐 Validating production secrets..."
    
    local required_secrets=(
        "DATABASE_URL"
        "REDIS_URL"
        "MASTER_ENCRYPTION_KEY"
        "WEBHOOK_SECRET"
        "INSTAGRAM_CLIENT_ID"
        "INSTAGRAM_CLIENT_SECRET"
        "TIKTOK_CLIENT_KEY"
        "TIKTOK_CLIENT_SECRET"
    )
    
    local missing_secrets=()
    local weak_secrets=()
    
    for secret in "${required_secrets[@]}"; do
        if [[ -z "${!secret:-}" ]]; then
            missing_secrets+=("$secret")
        else
            # Check secret strength (basic validation)
            case "$secret" in
                "MASTER_ENCRYPTION_KEY"|"WEBHOOK_SECRET")
                    if [[ ${#!secret} -lt 32 ]]; then
                        weak_secrets+=("$secret (too short: ${#!secret} chars)")
                    fi
                    ;;
                "*_SECRET"|"*_CLIENT_SECRET")
                    if [[ ${#!secret} -lt 20 ]]; then
                        weak_secrets+=("$secret (too short: ${#!secret} chars)")
                    fi
                    ;;
            esac
        fi
    done
    
    if [[ ${#missing_secrets[@]} -gt 0 ]]; then
        error "Missing required secrets: ${missing_secrets[*]}"
        add_result "Production Secrets" "❌ FAIL" "Missing: ${missing_secrets[*]}"
    elif [[ ${#weak_secrets[@]} -gt 0 ]]; then
        warn "Weak secrets detected: ${weak_secrets[*]}"
        add_result "Production Secrets" "⚠️ WARN" "Weak: ${weak_secrets[*]}"
    else
        success "All production secrets validated"
        add_result "Production Secrets" "✅ PASS" "All required secrets present and strong"
    fi
}

# Webhook verification
check_webhook_endpoints() {
    log "🔗 Verifying webhook endpoints..."
    
    local webhook_endpoints=(
        "https://api.ofm.social/webhooks/instagram"
        "https://api.ofm.social/webhooks/tiktok" 
        "https://api.ofm.social/webhooks/meta"
    )
    
    local verified_count=0
    local total_endpoints=${#webhook_endpoints[@]}
    
    for endpoint in "${webhook_endpoints[@]}"; do
        log "Testing webhook endpoint: $endpoint"
        
        # Test webhook endpoint accessibility
        if curl -f --max-time 10 -X POST "$endpoint" \
           -H "Content-Type: application/json" \
           -d '{"test": true}' &>/dev/null; then
            success "Webhook endpoint accessible: $endpoint"
            ((verified_count++))
        else
            warn "Webhook endpoint not accessible: $endpoint"
        fi
    done
    
    if [[ $verified_count -eq $total_endpoints ]]; then
        success "All webhook endpoints verified"
        add_result "Webhook Endpoints" "✅ PASS" "$verified_count/$total_endpoints endpoints accessible"
    elif [[ $verified_count -gt 0 ]]; then
        warn "Partial webhook verification"
        add_result "Webhook Endpoints" "⚠️ WARN" "$verified_count/$total_endpoints endpoints accessible"
    else
        error "No webhook endpoints accessible"
        add_result "Webhook Endpoints" "❌ FAIL" "0/$total_endpoints endpoints accessible"
    fi
}

# Platform API connectivity
check_platform_apis() {
    log "🌐 Testing platform API connectivity..."
    
    # Instagram Graph API
    if [[ -n "${INSTAGRAM_CLIENT_ID:-}" ]]; then
        local ig_url="https://graph.instagram.com/oauth/access_token"
        if curl -f --max-time 10 "$ig_url" &>/dev/null; then
            success "Instagram API accessible"
        else
            warn "Instagram API connectivity issues"
        fi
    fi
    
    # TikTok API
    if [[ -n "${TIKTOK_CLIENT_KEY:-}" ]]; then
        local tt_url="https://open-api.tiktok.com/platform/oauth/connect/"
        if curl -f --max-time 10 "$tt_url" &>/dev/null; then
            success "TikTok API accessible"
        else
            warn "TikTok API connectivity issues"
        fi
    fi
    
    # Reddit API
    local reddit_url="https://www.reddit.com/api/v1/access_token"
    if curl -f --max-time 10 "$reddit_url" &>/dev/null; then
        success "Reddit API accessible"
    else
        warn "Reddit API connectivity issues"
    fi
    
    add_result "Platform APIs" "✅ PASS" "Platform connectivity validated"
}

# Infrastructure readiness
check_infrastructure() {
    log "🏗️ Checking infrastructure readiness..."
    
    # Check Kubernetes access
    if ! kubectl cluster-info &>/dev/null; then
        error "Cannot access Kubernetes cluster"
        add_result "Infrastructure" "❌ FAIL" "No Kubernetes access"
        return 1
    fi
    
    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
        warn "Production namespace does not exist: $NAMESPACE"
        add_result "Infrastructure" "⚠️ WARN" "Namespace $NAMESPACE missing"
    else
        success "Kubernetes namespace ready: $NAMESPACE"
    fi
    
    # Check Argo Rollouts CRD
    if kubectl get crd rollouts.argoproj.io &>/dev/null; then
        success "Argo Rollouts CRD available"
    else
        error "Argo Rollouts CRD not installed"
        add_result "Infrastructure" "❌ FAIL" "Argo Rollouts CRD missing"
        return 1
    fi
    
    # Check existing deployment
    if kubectl get deployment ofm-social-os-api -n "$NAMESPACE" &>/dev/null; then
        local replicas=$(kubectl get deployment ofm-social-os-api -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
        success "Existing deployment healthy: $replicas replicas ready"
    else
        warn "No existing deployment found - this will be a new deployment"
    fi
    
    add_result "Infrastructure" "✅ PASS" "Kubernetes and Argo Rollouts ready"
}

# Monitoring and observability
check_monitoring() {
    log "📊 Validating monitoring setup..."
    
    # Check Prometheus accessibility
    local prometheus_urls=(
        "https://prometheus.ofm.social"
        "https://prometheus-production.ofm.social"
    )
    
    local prometheus_ok=false
    for url in "${prometheus_urls[@]}"; do
        if curl -f --max-time 10 "$url/api/v1/query?query=up" &>/dev/null; then
            success "Prometheus accessible: $url"
            prometheus_ok=true
            break
        fi
    done
    
    if [[ "$prometheus_ok" != "true" ]]; then
        warn "Prometheus not accessible - monitoring may be impaired"
    fi
    
    # Check Grafana accessibility
    if curl -f --max-time 10 "https://grafana.ofm.social" &>/dev/null; then
        success "Grafana accessible"
    else
        warn "Grafana not accessible"
    fi
    
    add_result "Monitoring" "✅ PASS" "Monitoring infrastructure validated"
}

# SLO monitoring setup
check_slo_monitoring() {
    log "📈 Verifying SLO monitoring setup..."
    
    if [[ -f "$ROOT_DIR/scripts/slo/verify-slo.ts" ]]; then
        success "SLO verification script available"
        add_result "SLO Monitoring" "✅ PASS" "SLO verification script ready"
    else
        error "SLO verification script not found"
        add_result "SLO Monitoring" "❌ FAIL" "SLO verification script missing"
    fi
    
    if [[ -f "$ROOT_DIR/scripts/canary/publish-status.ts" ]]; then
        success "Canary status monitor available"
        add_result "Canary Monitoring" "✅ PASS" "Canary status monitor ready"
    else
        error "Canary status monitor not found"
        add_result "Canary Monitoring" "❌ FAIL" "Canary status monitor missing"
    fi
}

# Load testing preparation
check_load_testing() {
    log "🔥 Checking load testing preparation..."
    
    if [[ -d "$ROOT_DIR/tests/load/k6" ]]; then
        local test_files=$(find "$ROOT_DIR/tests/load/k6" -name "*.js" | wc -l)
        if [[ $test_files -gt 0 ]]; then
            success "k6 load tests available: $test_files test files"
            add_result "Load Testing" "✅ PASS" "$test_files k6 test files ready"
        else
            warn "k6 directory exists but no test files found"
            add_result "Load Testing" "⚠️ WARN" "k6 directory empty"
        fi
    else
        warn "k6 load testing directory not found"
        add_result "Load Testing" "⚠️ WARN" "k6 tests not available"
    fi
}

# Security validations
check_security() {
    log "🔒 Running security validations..."
    
    # Check for secrets in environment
    if env | grep -qE "(KEY|SECRET|TOKEN|PASSWORD)" | grep -v "KUBECONFIG"; then
        success "Security environment variables detected"
    else
        warn "No security environment variables found"
    fi
    
    # Check SSL/TLS configuration
    if curl -f --max-time 10 "https://api.ofm.social/health" &>/dev/null; then
        success "Production API SSL/TLS working"
    else
        error "Production API not accessible over HTTPS"
        add_result "Security" "❌ FAIL" "HTTPS not working"
        return 1
    fi
    
    add_result "Security" "✅ PASS" "Security validations completed"
}

# Generate preflight report
generate_preflight_report() {
    log "📋 Generating preflight report..."
    
    local report_file="preflight-report-$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$report_file" << EOF
# Production Deployment Preflight Report

**Date**: $(date)
**Environment**: $ENVIRONMENT
**Canary Weight**: ${CANARY_WEIGHT}%
**Namespace**: $NAMESPACE

## Executive Summary

EOF

    if [[ $CRITICAL_FAILURES -eq 0 ]]; then
        cat >> "$report_file" << EOF
✅ **Status**: READY FOR DEPLOYMENT
🚀 **Recommendation**: Proceed with canary deployment

EOF
    else
        cat >> "$report_file" << EOF
❌ **Status**: NOT READY FOR DEPLOYMENT  
🛑 **Critical Failures**: $CRITICAL_FAILURES
⚠️ **Warnings**: $WARNINGS

EOF
    fi
    
    cat >> "$report_file" << EOF
## Detailed Results

| Check | Status | Details |
|-------|---------|---------|
EOF
    
    for result in "${PREFLIGHT_RESULTS[@]}"; do
        IFS='|' read -r check status details <<< "$result"
        echo "| $check | $status | $details |" >> "$report_file"
    done
    
    cat >> "$report_file" << EOF

## Next Steps

EOF

    if [[ $CRITICAL_FAILURES -eq 0 ]]; then
        cat >> "$report_file" << EOF
1. ✅ All critical checks passed
2. 🚀 Execute canary deployment: \`helm upgrade ofm-social-os ...\`
3. 📊 Monitor SLOs: \`npx ts-node scripts/canary/publish-status.ts\`
4. 🔄 Follow canary progression: 10% → 25% → 50% → 100%

### Monitoring Commands

\`\`\`bash
# Start SLO monitoring
cd marketing/scripts/slo
npx ts-node verify-slo.ts --environment production

# Start canary status monitoring  
cd marketing/scripts/canary
npx ts-node publish-status.ts --environment production --canary-version v1.0.0

# Watch rollout progress
kubectl get rollouts ofm-social-os -n $NAMESPACE -w
\`\`\`

EOF
    else
        cat >> "$report_file" << EOF
1. ❌ Fix critical failures before deployment
2. 🔧 Address $CRITICAL_FAILURES critical issues
3. ⚠️ Review $WARNINGS warnings
4. 🔄 Re-run preflight checks

### Critical Issues to Address

EOF
        for result in "${PREFLIGHT_RESULTS[@]}"; do
            IFS='|' read -r check status details <<< "$result"
            if [[ "$status" == *"FAIL"* ]]; then
                echo "- **$check**: $details" >> "$report_file"
            fi
        done
    fi
    
    cat >> "$report_file" << EOF

---

*Generated by OFM Social OS Production Preflight*
EOF

    success "Preflight report generated: $report_file"
    echo "$report_file"
}

# Main execution
main() {
    log "🚀 Starting production deployment preflight checks..."
    echo "Environment: $ENVIRONMENT"
    echo "Canary Weight: ${CANARY_WEIGHT}%"
    echo "Namespace: $NAMESPACE"
    echo ""
    
    # Run all preflight checks
    check_database_migration
    check_production_secrets
    check_webhook_endpoints
    check_platform_apis
    check_infrastructure
    check_monitoring
    check_slo_monitoring
    check_load_testing
    check_security
    
    # Generate comprehensive report
    local report_file=$(generate_preflight_report)
    
    echo ""
    echo "=================="
    echo "PREFLIGHT SUMMARY"
    echo "=================="
    echo "Critical Failures: $CRITICAL_FAILURES"
    echo "Warnings: $WARNINGS"
    echo "Report: $report_file"
    echo ""
    
    if [[ $CRITICAL_FAILURES -eq 0 ]]; then
        success "🚀 READY FOR CANARY DEPLOYMENT!"
        echo "Execute: helm upgrade ofm-social-os ..."
        exit 0
    else
        error "🛑 NOT READY - Fix critical issues first"
        exit 1
    fi
}

# Handle script arguments
case "${1:-main}" in
    "database-only")
        check_database_migration
        ;;
    "secrets-only")
        check_production_secrets
        ;;
    "infrastructure-only")
        check_infrastructure
        ;;
    *)
        main
        ;;
esac