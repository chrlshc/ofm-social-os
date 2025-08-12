#!/bin/bash
set -euo pipefail

# Production Readiness Final Checklist
# Comprehensive validation before full production deployment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
NAMESPACE="ofm-${ENVIRONMENT}"

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
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}"
}

# Results tracking
READINESS_CHECKS=()
CRITICAL_FAILURES=0
WARNINGS=0

add_readiness_check() {
    local check="$1"
    local status="$2"
    local details="${3:-}"
    
    READINESS_CHECKS+=("$check|$status|$details")
    
    if [[ "$status" == *"FAIL"* ]]; then
        ((CRITICAL_FAILURES++))
    elif [[ "$status" == *"WARN"* ]]; then
        ((WARNINGS++))
    fi
}

# Production infrastructure validation
validate_production_infrastructure() {
    log "🏗️ Validating production infrastructure..."
    
    # Kubernetes cluster validation
    if kubectl cluster-info &>/dev/null; then
        local cluster_version=$(kubectl version --client=false -o json | jq -r '.serverVersion.gitVersion')
        success "Kubernetes cluster accessible - Version: $cluster_version"
        add_readiness_check "Kubernetes Cluster" "✅ READY" "Version $cluster_version"
    else
        error "Kubernetes cluster not accessible"
        add_readiness_check "Kubernetes Cluster" "❌ FAIL" "Cluster not accessible"
        return 1
    fi
    
    # Check production namespace
    if kubectl get namespace "$NAMESPACE" &>/dev/null; then
        success "Production namespace exists: $NAMESPACE"
        add_readiness_check "Production Namespace" "✅ READY" "$NAMESPACE configured"
    else
        error "Production namespace missing: $NAMESPACE"
        add_readiness_check "Production Namespace" "❌ FAIL" "$NAMESPACE not found"
    fi
    
    # Check resource quotas
    local cpu_quota=$(kubectl get resourcequota -n "$NAMESPACE" -o json 2>/dev/null | jq -r '.items[0].status.hard["requests.cpu"] // "none"')
    local memory_quota=$(kubectl get resourcequota -n "$NAMESPACE" -o json 2>/dev/null | jq -r '.items[0].status.hard["requests.memory"] // "none"')
    
    if [[ "$cpu_quota" != "none" ]] && [[ "$memory_quota" != "none" ]]; then
        success "Resource quotas configured - CPU: $cpu_quota, Memory: $memory_quota"
        add_readiness_check "Resource Quotas" "✅ READY" "CPU: $cpu_quota, Memory: $memory_quota"
    else
        warn "No resource quotas configured"
        add_readiness_check "Resource Quotas" "⚠️ WARN" "No quotas configured"
    fi
    
    # Check storage classes
    local storage_classes=$(kubectl get storageclass --no-headers | wc -l)
    if [[ $storage_classes -gt 0 ]]; then
        success "$storage_classes storage class(es) available"
        add_readiness_check "Storage Classes" "✅ READY" "$storage_classes available"
    else
        error "No storage classes available"
        add_readiness_check "Storage Classes" "❌ FAIL" "No storage classes"
    fi
}

# Security validation
validate_security() {
    log "🔒 Validating production security..."
    
    # Check security policies
    local psp_count=$(kubectl get podsecuritypolicy --no-headers 2>/dev/null | wc -l)
    if [[ $psp_count -gt 0 ]]; then
        success "$psp_count Pod Security Policy/ies configured"
        add_readiness_check "Pod Security Policies" "✅ READY" "$psp_count policies"
    else
        warn "No Pod Security Policies found"
        add_readiness_check "Pod Security Policies" "⚠️ WARN" "No PSPs configured"
    fi
    
    # Check network policies
    local np_count=$(kubectl get networkpolicy -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
    if [[ $np_count -gt 0 ]]; then
        success "$np_count Network Policy/ies configured"
        add_readiness_check "Network Policies" "✅ READY" "$np_count policies"
    else
        error "No Network Policies configured"
        add_readiness_check "Network Policies" "❌ FAIL" "No network isolation"
    fi
    
    # Check secrets encryption
    if kubectl get secrets -n "$NAMESPACE" -o json | jq -r '.items[].type' | grep -q "Opaque"; then
        success "Kubernetes secrets present"
        add_readiness_check "Secrets Management" "✅ READY" "K8s secrets configured"
    else
        error "No secrets found in production namespace"
        add_readiness_check "Secrets Management" "❌ FAIL" "No production secrets"
    fi
    
    # Check RBAC
    local rbac_roles=$(kubectl get roles,rolebindings,clusterroles,clusterrolebindings --all-namespaces --no-headers 2>/dev/null | wc -l)
    if [[ $rbac_roles -gt 0 ]]; then
        success "$rbac_roles RBAC rule(s) configured"
        add_readiness_check "RBAC Authorization" "✅ READY" "$rbac_roles rules"
    else
        error "No RBAC rules configured"
        add_readiness_check "RBAC Authorization" "❌ FAIL" "No authorization rules"
    fi
}

# Monitoring and observability validation
validate_monitoring() {
    log "📊 Validating monitoring and observability..."
    
    # Check Prometheus
    if kubectl get pods -n monitoring -l app=prometheus --no-headers 2>/dev/null | grep -q "Running"; then
        success "Prometheus is running"
        add_readiness_check "Prometheus" "✅ READY" "Pod running in monitoring namespace"
    else
        error "Prometheus not running"
        add_readiness_check "Prometheus" "❌ FAIL" "Pod not found or not running"
    fi
    
    # Check Grafana
    if kubectl get pods -n monitoring -l app=grafana --no-headers 2>/dev/null | grep -q "Running"; then
        success "Grafana is running"
        add_readiness_check "Grafana" "✅ READY" "Pod running in monitoring namespace"
    else
        warn "Grafana not running"
        add_readiness_check "Grafana" "⚠️ WARN" "Pod not found or not running"
    fi
    
    # Check AlertManager
    if kubectl get pods -n monitoring -l app=alertmanager --no-headers 2>/dev/null | grep -q "Running"; then
        success "AlertManager is running"
        add_readiness_check "AlertManager" "✅ READY" "Pod running in monitoring namespace"
    else
        error "AlertManager not running"
        add_readiness_check "AlertManager" "❌ FAIL" "Pod not found or not running"
    fi
    
    # Check ServiceMonitor CRDs
    if kubectl get crd servicemonitors.monitoring.coreos.com &>/dev/null; then
        success "ServiceMonitor CRD available"
        add_readiness_check "ServiceMonitor CRD" "✅ READY" "Prometheus Operator CRD installed"
    else
        warn "ServiceMonitor CRD not available"
        add_readiness_check "ServiceMonitor CRD" "⚠️ WARN" "Prometheus Operator not installed"
    fi
}

# Backup and disaster recovery validation
validate_backup_dr() {
    log "💾 Validating backup and disaster recovery..."
    
    # Check backup cronjob
    if kubectl get cronjob ofm-secure-backup -n "$NAMESPACE" &>/dev/null; then
        local schedule=$(kubectl get cronjob ofm-secure-backup -n "$NAMESPACE" -o jsonpath='{.spec.schedule}')
        success "Backup CronJob configured - Schedule: $schedule"
        add_readiness_check "Backup CronJob" "✅ READY" "Schedule: $schedule"
    else
        error "Backup CronJob not configured"
        add_readiness_check "Backup CronJob" "❌ FAIL" "No automated backups"
    fi
    
    # Check backup storage
    if aws s3 ls s3://ofm-encrypted-backups/ &>/dev/null; then
        local backup_count=$(aws s3 ls s3://ofm-encrypted-backups/database/ | wc -l)
        success "Backup storage accessible - $backup_count existing backups"
        add_readiness_check "Backup Storage" "✅ READY" "$backup_count backups in S3"
    else
        error "Backup storage not accessible"
        add_readiness_check "Backup Storage" "❌ FAIL" "S3 bucket not accessible"
    fi
    
    # Check DR runbook
    if [[ -f "$ROOT_DIR/docs/RUNBOOK_CHAOS_DR.md" ]]; then
        success "DR runbook available"
        add_readiness_check "DR Runbook" "✅ READY" "Documentation available"
    else
        warn "DR runbook not found"
        add_readiness_check "DR Runbook" "⚠️ WARN" "Missing documentation"
    fi
}

# Performance and capacity validation
validate_performance() {
    log "⚡ Validating performance and capacity..."
    
    # Check HPA configuration
    if kubectl get hpa -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q "ofm-social-os"; then
        local min_replicas=$(kubectl get hpa ofm-social-os -n "$NAMESPACE" -o jsonpath='{.spec.minReplicas}')
        local max_replicas=$(kubectl get hpa ofm-social-os -n "$NAMESPACE" -o jsonpath='{.spec.maxReplicas}')
        success "HPA configured - Min: $min_replicas, Max: $max_replicas"
        add_readiness_check "Horizontal Pod Autoscaler" "✅ READY" "Min: $min_replicas, Max: $max_replicas"
    else
        warn "HPA not configured"
        add_readiness_check "Horizontal Pod Autoscaler" "⚠️ WARN" "No autoscaling configured"
    fi
    
    # Check resource requests/limits
    if kubectl get deployment ofm-social-os-api -n "$NAMESPACE" -o json 2>/dev/null | jq -e '.spec.template.spec.containers[0].resources.requests' &>/dev/null; then
        local cpu_request=$(kubectl get deployment ofm-social-os-api -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}')
        local memory_request=$(kubectl get deployment ofm-social-os-api -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].resources.requests.memory}')
        success "Resource requests configured - CPU: $cpu_request, Memory: $memory_request"
        add_readiness_check "Resource Requests" "✅ READY" "CPU: $cpu_request, Memory: $memory_request"
    else
        error "No resource requests configured"
        add_readiness_check "Resource Requests" "❌ FAIL" "No resource management"
    fi
    
    # Check load testing results
    if [[ -f "$ROOT_DIR/tests/load/k6/results/latest-soak-test.json" ]]; then
        success "Load testing results available"
        add_readiness_check "Load Testing" "✅ READY" "Soak test results available"
    else
        warn "No recent load testing results"
        add_readiness_check "Load Testing" "⚠️ WARN" "No performance validation"
    fi
}

# External dependencies validation
validate_external_dependencies() {
    log "🌐 Validating external dependencies..."
    
    # Test platform APIs
    local platforms=("instagram.com" "api.tiktok.com" "www.reddit.com")
    local platform_issues=()
    
    for platform in "${platforms[@]}"; do
        if curl -f --max-time 10 "https://$platform" &>/dev/null; then
            success "$platform accessible"
        else
            platform_issues+=("$platform")
        fi
    done
    
    if [[ ${#platform_issues[@]} -eq 0 ]]; then
        add_readiness_check "Platform APIs" "✅ READY" "All platforms accessible"
    else
        warn "Some platforms not accessible: ${platform_issues[*]}"
        add_readiness_check "Platform APIs" "⚠️ WARN" "Issues: ${platform_issues[*]}"
    fi
    
    # Test AWS services
    if aws s3 ls s3://ofm-social-media-bucket/ &>/dev/null; then
        success "S3 bucket accessible"
        add_readiness_check "AWS S3" "✅ READY" "Bucket accessible"
    else
        error "S3 bucket not accessible"
        add_readiness_check "AWS S3" "❌ FAIL" "Cannot access media storage"
    fi
    
    # Test database connectivity
    if kubectl exec -n "$NAMESPACE" deployment/postgres-primary -- pg_isready &>/dev/null; then
        success "Database connectivity verified"
        add_readiness_check "Database" "✅ READY" "PostgreSQL accessible"
    else
        error "Database not accessible"
        add_readiness_check "Database" "❌ FAIL" "PostgreSQL connection failed"
    fi
    
    # Test Redis connectivity
    if kubectl exec -n "$NAMESPACE" deployment/redis-primary -- redis-cli ping | grep -q "PONG"; then
        success "Redis connectivity verified"
        add_readiness_check "Redis" "✅ READY" "Cache accessible"
    else
        error "Redis not accessible"
        add_readiness_check "Redis" "❌ FAIL" "Cache connection failed"
    fi
}

# DNS and networking validation
validate_networking() {
    log "🌐 Validating DNS and networking..."
    
    # Test production domain
    if dig api.ofm.social +short | grep -q '^[0-9]'; then
        success "Production domain resolves"
        add_readiness_check "DNS Resolution" "✅ READY" "api.ofm.social resolves"
    else
        error "Production domain does not resolve"
        add_readiness_check "DNS Resolution" "❌ FAIL" "api.ofm.social not resolving"
    fi
    
    # Test SSL certificate
    if openssl s_client -connect api.ofm.social:443 -servername api.ofm.social < /dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
        success "SSL certificate valid"
        add_readiness_check "SSL Certificate" "✅ READY" "Certificate valid"
    else
        error "SSL certificate invalid"
        add_readiness_check "SSL Certificate" "❌ FAIL" "Certificate issues"
    fi
    
    # Test ingress controller
    if kubectl get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --no-headers 2>/dev/null | grep -q "Running"; then
        success "Ingress controller running"
        add_readiness_check "Ingress Controller" "✅ READY" "nginx-ingress running"
    else
        error "Ingress controller not running"
        add_readiness_check "Ingress Controller" "❌ FAIL" "No ingress controller"
    fi
    
    # Test load balancer
    local lb_ip=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [[ -n "$lb_ip" ]]; then
        success "Load balancer IP: $lb_ip"
        add_readiness_check "Load Balancer" "✅ READY" "IP: $lb_ip"
    else
        error "Load balancer not ready"
        add_readiness_check "Load Balancer" "❌ FAIL" "No external IP"
    fi
}

# Final deployment validation
validate_final_deployment() {
    log "🚀 Validating final deployment readiness..."
    
    # Check all required deployments are ready
    local deployments=("ofm-social-os-api" "postgres-primary" "redis-primary")
    local deployment_issues=()
    
    for deployment in "${deployments[@]}"; do
        if kubectl get deployment "$deployment" -n "$NAMESPACE" &>/dev/null; then
            local ready=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
            local desired=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
            
            if [[ "$ready" == "$desired" ]] && [[ "$ready" -gt 0 ]]; then
                success "$deployment ready ($ready/$desired)"
            else
                deployment_issues+=("$deployment ($ready/$desired)")
            fi
        else
            deployment_issues+=("$deployment (not found)")
        fi
    done
    
    if [[ ${#deployment_issues[@]} -eq 0 ]]; then
        add_readiness_check "Core Deployments" "✅ READY" "All deployments ready"
    else
        error "Deployment issues: ${deployment_issues[*]}"
        add_readiness_check "Core Deployments" "❌ FAIL" "Issues: ${deployment_issues[*]}"
    fi
    
    # Check Argo Rollouts readiness
    if kubectl get rollout ofm-social-os -n "$NAMESPACE" &>/dev/null; then
        local rollout_phase=$(kubectl get rollout ofm-social-os -n "$NAMESPACE" -o jsonpath='{.status.phase}')
        if [[ "$rollout_phase" == "Healthy" ]]; then
            success "Argo Rollout healthy"
            add_readiness_check "Argo Rollouts" "✅ READY" "Phase: $rollout_phase"
        else
            warn "Argo Rollout not healthy: $rollout_phase"
            add_readiness_check "Argo Rollouts" "⚠️ WARN" "Phase: $rollout_phase"
        fi
    else
        error "Argo Rollout not configured"
        add_readiness_check "Argo Rollouts" "❌ FAIL" "Not configured"
    fi
    
    # Final API health check
    if curl -f --max-time 30 "https://api.ofm.social/health" &>/dev/null; then
        success "Production API responding"
        add_readiness_check "API Health" "✅ READY" "Health endpoint responding"
    else
        error "Production API not responding"
        add_readiness_check "API Health" "❌ FAIL" "Health endpoint not accessible"
    fi
}

# Generate production readiness report
generate_readiness_report() {
    log "📋 Generating production readiness report..."
    
    local report_file="production-readiness-report-$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$report_file" << EOF
# Production Readiness Report

**Date**: $(date)
**Environment**: $ENVIRONMENT
**Namespace**: $NAMESPACE

## Executive Summary

EOF

    if [[ $CRITICAL_FAILURES -eq 0 ]]; then
        cat >> "$report_file" << EOF
✅ **Status**: READY FOR FULL PRODUCTION DEPLOYMENT
🚀 **Recommendation**: Proceed with 100% production rollout
📊 **Quality Gate**: All critical checks passed

EOF
    else
        cat >> "$report_file" << EOF
❌ **Status**: NOT READY FOR PRODUCTION
🚨 **Critical Failures**: $CRITICAL_FAILURES issues must be resolved
⚠️ **Warnings**: $WARNINGS issues should be addressed
🛑 **Action Required**: Fix critical issues before production deployment

EOF
    fi
    
    cat >> "$report_file" << EOF
## Readiness Checklist Results

| Category | Status | Details |
|----------|--------|---------|
EOF
    
    for result in "${READINESS_CHECKS[@]}"; do
        IFS='|' read -r category status details <<< "$result"
        echo "| $category | $status | $details |" >> "$report_file"
    done
    
    cat >> "$report_file" << EOF

## Production Deployment Architecture

### High Availability Configuration

- **Replicas**: Minimum 3 per service for zero-downtime deployments
- **Load Balancing**: NGINX Ingress with SSL termination
- **Database**: PostgreSQL with read replicas and automated backups
- **Caching**: Redis cluster with persistence
- **Storage**: S3 with cross-region replication

### Security Posture

- **Network Isolation**: NetworkPolicies with default deny
- **Pod Security**: Non-root containers with read-only filesystems  
- **Secret Management**: Kubernetes secrets with encryption at rest
- **RBAC**: Least-privilege access controls
- **Runtime Security**: Falco behavioral monitoring

### Monitoring & Observability

- **Metrics**: Prometheus with custom business metrics
- **Alerting**: AlertManager → PagerDuty integration
- **Logging**: Centralized logging with 90-day retention
- **Tracing**: Distributed tracing for request flow
- **Dashboards**: Grafana with SLO tracking

### Disaster Recovery

- **RTO Target**: 30 minutes (Recovery Time Objective)
- **RPO Target**: 15 minutes (Recovery Point Objective)
- **Backup Strategy**: Encrypted daily backups with PITR
- **DR Testing**: Monthly automated disaster recovery drills
- **Failover**: Cross-region failover capability

## SLO Targets for Production

| Metric | Target | Current | Status |
|--------|---------|---------|---------|
| **Availability** | 99.9% | TBD | 🎯 Target |
| **P95 Latency** | < 10s | TBD | 🎯 Target |
| **P99 Latency** | < 15s | TBD | 🎯 Target |
| **Error Rate** | < 1% | TBD | 🎯 Target |
| **Success Rate** | ≥ 95% | TBD | 🎯 Target |

## Operational Procedures

### Daily Operations
\`\`\`bash
# Health check
ofm-ops health

# Deployment status
ofm-ops deploy status

# SLO compliance
ofm-ops slo
\`\`\`

### Weekly Operations
\`\`\`bash
# Performance review
./scripts/performance-review.sh

# Security scan
ofm-ops security scan

# Capacity planning
./scripts/capacity-analysis.sh
\`\`\`

### Monthly Operations
\`\`\`bash
# DR drill
gh workflow run dr-monthly.yml

# Security audit
./security/scripts/security-audit.sh

# Performance optimization
./scripts/performance-optimization.sh
\`\`\`

## Next Steps

EOF

    if [[ $CRITICAL_FAILURES -eq 0 ]]; then
        cat >> "$report_file" << EOF
### ✅ Production Deployment Approved

1. **Final Canary Validation**
   - Verify canary 10% has been stable for 24+ hours
   - Confirm all SLOs are within targets
   - Review monitoring dashboards for anomalies

2. **Full Production Rollout**
   \`\`\`bash
   # Promote canary to 25%
   ofm-ops canary promote
   
   # Continue staged rollout: 50% → 75% → 100%
   # Monitor SLOs at each stage
   \`\`\`

3. **Post-Deployment Validation**
   - Run full end-to-end tests
   - Validate all integrations
   - Confirm monitoring and alerting
   - Update documentation

4. **Production Operations Handover**
   - Brief operations team on new procedures
   - Validate PagerDuty escalation paths
   - Confirm backup and DR procedures
   - Schedule first post-deployment review

### 📊 Production Monitoring

**Critical Dashboards**:
- System Overview: https://grafana.ofm.social/d/system/system-overview
- API Performance: https://grafana.ofm.social/d/api/api-performance  
- SLO Tracking: https://grafana.ofm.social/d/slo/slo-dashboard
- Security: https://grafana.ofm.social/d/security/security-overview

**Alert Channels**:
- PagerDuty: Critical incidents (P0/P1)
- Slack #ops-alerts: Warnings and informational
- Email: Weekly summaries and reports

EOF
    else
        cat >> "$report_file" << EOF
### ❌ Critical Issues to Resolve

EOF
        for result in "${READINESS_CHECKS[@]}"; do
            IFS='|' read -r category status details <<< "$result"
            if [[ "$status" == *"FAIL"* ]]; then
                echo "#### $category" >> "$report_file"
                echo "**Status**: $status" >> "$report_file"
                echo "**Issue**: $details" >> "$report_file"
                echo "**Action**: [Specific remediation steps needed]" >> "$report_file"
                echo "" >> "$report_file"
            fi
        done
        
        cat >> "$report_file" << EOF
### 🔧 Remediation Plan

1. **Immediate Actions**
   - Fix all critical failures listed above
   - Re-run production readiness checks
   - Validate fixes in staging environment

2. **Validation Steps**
   - Run \`./scripts/production-readiness.sh\` again
   - Ensure all checks show ✅ READY status
   - Complete end-to-end testing

3. **Approval Process**
   - Technical review by platform engineering
   - Security review by security team  
   - Final go/no-go decision by engineering leadership

**DO NOT PROCEED TO PRODUCTION UNTIL ALL CRITICAL ISSUES ARE RESOLVED**

EOF
    fi
    
    cat >> "$report_file" << EOF

---

*Generated by OFM Social OS Production Readiness Validation*  
**Engineering Team**: Platform Engineering  
**Review Date**: $(date)  
**Next Review**: $(date -d '+1 month')
EOF

    success "Production readiness report generated: $report_file"
    echo "$report_file"
}

# Main execution
main() {
    log "🎯 Starting production readiness validation..."
    echo "Environment: $ENVIRONMENT"
    echo "Namespace: $NAMESPACE"
    echo ""
    
    # Execute comprehensive readiness checks
    validate_production_infrastructure
    validate_security
    validate_monitoring
    validate_backup_dr
    validate_performance
    validate_external_dependencies
    validate_networking
    validate_final_deployment
    
    # Generate comprehensive report
    local report_file=$(generate_readiness_report)
    
    echo ""
    echo "=================================="
    echo "PRODUCTION READINESS SUMMARY"
    echo "=================================="
    echo "Critical Failures: $CRITICAL_FAILURES"
    echo "Warnings: $WARNINGS"
    echo "Total Checks: ${#READINESS_CHECKS[@]}"
    echo "Report: $report_file"
    echo ""
    
    if [[ $CRITICAL_FAILURES -eq 0 ]]; then
        success "🚀 PRODUCTION DEPLOYMENT APPROVED!"
        echo "✅ All critical checks passed"
        echo "⚠️  $WARNINGS warnings to review"
        echo "📊 Ready for full production rollout"
        echo ""
        echo "Next steps:"
        echo "1. Monitor canary for 24+ hours"
        echo "2. Execute staged rollout: 25% → 50% → 75% → 100%"
        echo "3. Validate post-deployment health"
        exit 0
    else
        error "🛑 PRODUCTION DEPLOYMENT NOT APPROVED"
        echo "❌ $CRITICAL_FAILURES critical issues must be resolved"
        echo "⚠️  $WARNINGS warnings should be addressed"
        echo "📋 Review report for detailed remediation plan"
        echo ""
        echo "Fix critical issues and re-run validation"
        exit 1
    fi
}

# Handle script arguments
case "${1:-main}" in
    "infrastructure-only")
        validate_production_infrastructure
        ;;
    "security-only")
        validate_security
        ;;
    "monitoring-only")
        validate_monitoring
        ;;
    *)
        main
        ;;
esac