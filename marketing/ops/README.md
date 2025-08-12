# OFM Social OS Operations Center

Complete operations infrastructure for production deployment, monitoring, and administration of the OFM Social OS marketing system.

## 🎛️ Console Admin Operations

### Web-Based Admin Console

The **Admin Console** provides a comprehensive web interface for production operations:

- **📍 Location**: `ops/console/admin-console.tsx`
- **🚀 Features**: Real-time deployment monitoring, SLO tracking, health status, alert management, user session control
- **🔧 Tech Stack**: React + Chakra UI with real-time data integration

#### Key Features:
- **Canary Deployment Control**: Promote, pause, abort canary rollouts
- **SLO Monitoring**: Real-time P95/P99 latency, success rates, webhook signatures
- **System Health**: API, database, Redis, S3 service status
- **Alert Management**: Configure and toggle critical alert rules
- **Session Management**: View and terminate active user sessions
- **Operations Panel**: Database backup, security scan, maintenance mode

### Command-Line Operations Interface

The **OFM Ops CLI** provides powerful command-line operations:

- **📍 Location**: `ops/cli/ofm-ops-cli.ts`
- **🚀 Features**: Full deployment lifecycle, monitoring, troubleshooting
- **⚡ Interactive**: Dashboard mode with guided operations

#### Core Commands:

```bash
# Health and status
ofm-ops health              # System health check
ofm-ops deploy status       # Deployment status
ofm-ops slo                 # SLO compliance check

# Canary management  
ofm-ops canary promote      # Promote canary deployment
ofm-ops canary abort        # Abort and rollback canary
ofm-ops canary pause        # Pause canary deployment
ofm-ops canary resume       # Resume canary deployment

# Monitoring and logs
ofm-ops logs -f             # Stream live logs
ofm-ops logs -n 500         # Show last 500 log lines

# Database operations
ofm-ops db backup           # Create database backup

# Security operations
ofm-ops security scan       # Run security scan

# Interactive dashboard
ofm-ops dashboard           # Launch interactive dashboard
ofm-ops                     # Default interactive mode
```

#### Configuration:

```bash
# View current config
ofm-ops config show

# Set configuration values
ofm-ops config set apiUrl https://api.ofm.social
ofm-ops config set environment production
ofm-ops config set namespace ofm-production
```

## 🔒 Security Hardening

### Final Security Lockdown

**Script**: `security/hardening/security-hardening-final.sh`

Comprehensive production security hardening including:

- **🛡️ Network Security**: NetworkPolicies with default deny, specific allow rules
- **🔐 Pod Security**: Non-root containers, read-only filesystems, capability dropping
- **👮 Runtime Monitoring**: Falco behavioral monitoring with custom OFM rules
- **📝 Audit Logging**: Kubernetes API + Application audit with 90-day retention
- **🔑 Encryption**: AES-256 at-rest, TLS 1.3 in-transit, field-level encryption
- **🌐 Secure Ingress**: TLS 1.3, HSTS, security headers, rate limiting
- **💾 Backup Security**: GPG + KMS encryption with integrity verification

#### Security Controls Applied:

1. **Network Isolation**
   - Default deny network policies
   - Segmented access between components
   - WAF protection at ingress

2. **Identity & Access Management**
   - Service accounts with minimal permissions
   - RBAC with least privilege principle
   - Automated secret rotation

3. **Container Security**
   - Non-root user execution (UID 1001)
   - Read-only root filesystem
   - All capabilities dropped
   - Resource limits enforced

4. **Runtime Protection**
   - Falco monitoring for behavioral anomalies
   - Admission controllers for policy enforcement
   - Image vulnerability scanning webhook

5. **Data Protection**
   - Encryption at rest using AWS KMS
   - TLS 1.3 for all inter-service communication
   - Field-level encryption for sensitive data

6. **Compliance & Auditing**
   - SOC 2 Type II controls
   - GDPR compliance measures
   - Comprehensive audit trail
   - 90-day log retention

## 📊 Production Readiness Validation

### Comprehensive Pre-Deployment Checklist

**Script**: `ops/scripts/production-readiness.sh`

Final validation before production deployment covering:

- **🏗️ Infrastructure**: Kubernetes cluster, namespaces, resource quotas, storage
- **🔒 Security**: Pod security policies, network policies, RBAC, secrets
- **📊 Monitoring**: Prometheus, Grafana, AlertManager, ServiceMonitors
- **💾 Backup & DR**: Backup CronJobs, S3 storage, DR procedures
- **⚡ Performance**: HPA, resource limits, load testing results
- **🌐 Dependencies**: Platform APIs, AWS services, database, Redis
- **🔗 Networking**: DNS resolution, SSL certificates, ingress, load balancer
- **🚀 Deployment**: Core services, Argo Rollouts, API health

#### Readiness Report Generated:

- **Executive Summary**: GO/NO-GO recommendation
- **Detailed Results**: All checks with status and remediation
- **Architecture Overview**: HA configuration, security posture
- **SLO Targets**: Production performance benchmarks
- **Operational Procedures**: Daily, weekly, monthly operations
- **Next Steps**: Deployment approval or remediation plan

## 🚀 Deployment Pipeline Integration

### Canary Deployment Scripts

1. **Preflight Validation**: `scripts/preflight/production-preflight.sh`
   - Migration dry run validation
   - Production secrets verification
   - Webhook endpoint testing
   - Infrastructure readiness

2. **Canary Deployment**: `scripts/canary/deploy-canary-10.sh`
   - Automated 10% canary deployment
   - Real-time SLO monitoring
   - Automatic rollback on SLO violations

3. **Status Monitoring**: `scripts/canary/publish-status.ts`
   - Real-time canary health monitoring
   - SLO compliance tracking
   - GO/NO-GO decision automation

4. **Alert Testing**: `scripts/alerts/test-pagerduty.sh`
   - PagerDuty integration validation
   - Critical alert rule testing
   - Notification pipeline verification

### Complete Deployment Workflow:

```bash
# 1. Production readiness validation
./ops/scripts/production-readiness.sh

# 2. Security hardening
./security/hardening/security-hardening-final.sh

# 3. Preflight checks
./scripts/preflight/production-preflight.sh

# 4. Alert system validation
./scripts/alerts/test-pagerduty.sh

# 5. Canary deployment
./scripts/canary/deploy-canary-10.sh

# 6. Continuous monitoring
npx ts-node scripts/canary/publish-status.ts --environment production
```

## 📈 Monitoring & Observability

### SLO Monitoring Dashboard

Real-time tracking of production SLOs:

- **P95 Latency**: < 10 seconds (target)
- **P99 Latency**: < 15 seconds (target)
- **Success Rate**: ≥ 95% (target)
- **Error Rate**: < 1% (target)
- **Availability**: 99.9% uptime (target)
- **Webhook Signatures**: ≥ 99.9% verified (target)

### Alert Configuration

Critical alerts configured for:

- **API Availability**: Service down > 1 minute
- **High Error Rate**: Error rate > 1% for 5 minutes
- **High Latency**: P95 > 10s or P99 > 15s for 5 minutes
- **Database Issues**: Connection failures or high latency
- **Canary Issues**: SLO violations during deployment
- **Security Events**: Unauthorized access attempts

### Grafana Dashboards

Production monitoring dashboards:

- **System Overview**: https://grafana.ofm.social/d/system/system-overview
- **API Performance**: https://grafana.ofm.social/d/api/api-performance
- **Canary Deployment**: https://grafana.ofm.social/d/canary/canary-deployment
- **Security Monitoring**: https://grafana.ofm.social/d/security/security-overview
- **SLO Tracking**: https://grafana.ofm.social/d/slo/slo-dashboard

## 🛠️ Operations Procedures

### Daily Operations

```bash
# Morning health check
ofm-ops health

# Review overnight alerts
ofm-ops logs -n 1000 | grep -E "(ERROR|WARN)"

# Check deployment status
ofm-ops deploy status

# Verify SLO compliance
ofm-ops slo
```

### Weekly Operations

```bash
# Security scan
ofm-ops security scan

# Performance review
./scripts/performance-review.sh

# Capacity analysis
./scripts/capacity-analysis.sh

# Backup verification
aws s3 ls s3://ofm-encrypted-backups/database/ | tail -10
```

### Monthly Operations

```bash
# Disaster recovery drill
gh workflow run dr-monthly.yml

# Security audit
./security/scripts/security-audit.sh

# Performance optimization
./scripts/performance-optimization.sh

# Access review
kubectl get rolebindings,clusterrolebindings --all-namespaces
```

### Emergency Procedures

#### Immediate Incident Response

```bash
# Check system status
ofm-ops health

# View recent errors
ofm-ops logs -f | grep ERROR

# If canary deployment issues
ofm-ops canary abort

# If API down
kubectl get pods -n ofm-production
kubectl describe pod <failing-pod> -n ofm-production
```

#### Rollback Procedures

```bash
# Application rollback
helm rollback ofm-social-os -n ofm-production

# Or using kubectl
kubectl rollout undo deployment/ofm-social-os-api -n ofm-production

# Database rollback (if needed)
cd marketing/dr/scripts
./dr-restore-sandbox.sh --pitr-target "2025-08-12 10:00:00"
```

## 🔧 Configuration Management

### Environment Configuration

Configuration files support multiple environments:

- **Development**: Local development with Docker Compose
- **Staging**: Full production-like environment for testing  
- **Production**: High-availability deployment with monitoring

### CLI Configuration

CLI configuration stored in `~/.ofm-cli-config.json`:

```json
{
  "environment": "production",
  "namespace": "ofm-production", 
  "apiUrl": "https://api.ofm.social",
  "prometheusUrl": "https://prometheus.ofm.social",
  "grafanaUrl": "https://grafana.ofm.social",
  "argoRolloutsUrl": "http://localhost:3100"
}
```

## 📚 Documentation & Training

### Operational Runbooks

- **RUNBOOK_CHAOS_DR.md**: Comprehensive chaos engineering and disaster recovery procedures
- **Security Hardening Guide**: Step-by-step security implementation
- **Deployment Guide**: Complete deployment workflow documentation
- **Troubleshooting Guide**: Common issues and resolution procedures

### Team Training Materials

- **Operations Dashboard Training**: Web console usage and features
- **CLI Operations Training**: Command-line interface proficiency  
- **Incident Response Training**: Emergency procedures and escalation
- **Security Procedures Training**: Security controls and compliance

---

## 🎯 Quick Start for Operators

### New Operator Onboarding

1. **Install CLI Tools**
   ```bash
   npm install -g ts-node commander chalk inquirer ora axios
   chmod +x marketing/ops/cli/ofm-ops-cli.ts
   ```

2. **Configure Environment**
   ```bash
   ./marketing/ops/cli/ofm-ops-cli.ts config set environment production
   ./marketing/ops/cli/ofm-ops-cli.ts config set apiUrl https://api.ofm.social
   ```

3. **Verify Access**
   ```bash
   ofm-ops health
   ofm-ops deploy status
   ```

4. **Launch Dashboard**
   ```bash
   ofm-ops dashboard
   ```

### Emergency Contact Information

- **Platform Engineering**: #platform-eng (Slack)
- **On-Call SRE**: #ops-alerts (Slack) / PagerDuty
- **Security Team**: #security (Slack)
- **Engineering Leadership**: #incident-response (Slack)

**Remember**: All production operations are logged and audited. Follow proper change management procedures for any production modifications.

---

*OFM Social OS Operations Center - Production Ready* 🚀