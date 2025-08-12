# 🔥 Chaos Engineering & Disaster Recovery Runbook

## Overview

This runbook provides comprehensive procedures for chaos engineering testing and disaster recovery operations for the OFM Social OS marketing system. It covers both automated testing scenarios and emergency response procedures.

## Table of Contents

1. [Chaos Engineering](#chaos-engineering)
2. [Disaster Recovery](#disaster-recovery)
3. [Emergency Procedures](#emergency-procedures)
4. [Monitoring & Alerts](#monitoring--alerts)
5. [Post-Incident Procedures](#post-incident-procedures)

---

# Chaos Engineering

## 🎯 Objectives

- Validate system resilience under controlled failure conditions
- Identify weaknesses before they cause outages
- Build confidence in system recovery capabilities
- Maintain team preparedness for incident response

## 📋 Prerequisites

### Required Tools
```bash
# Verify prerequisites
kubectl version --client
aws --version
jq --version
bc --version
curl --version
```

### Access Requirements
- Kubernetes cluster access (staging/production)
- AWS IAM permissions for EKS and S3
- Prometheus access for metrics collection
- Grafana access for monitoring dashboards

### Safety Checks
- [ ] System health verified (>80% pods running)
- [ ] No ongoing deployments or maintenance
- [ ] Team availability for monitoring
- [ ] Rollback procedures tested

## 🔥 Chaos Scenarios

### 1. Pod Kill Chaos

**Objective**: Test pod restart resilience and load balancing

**Impact**: Low - pods should restart automatically

**Procedure**:
```bash
cd marketing/chaos/scripts

# Run pod kill chaos for 5 minutes
./chaos-inject.sh pod-kill \
  --environment staging \
  --duration 300 \
  --results-dir ./chaos-results

# Monitor during execution
watch kubectl get pods -n ofm-staging
```

**Expected Behavior**:
- Pods restart within 30 seconds
- No service interruption (load balancer routes around failed pods)
- Error rate remains < 1%
- P95 latency remains < 10 seconds

**Failure Indicators**:
- Service unavailable errors
- Cascading pod failures
- Extended recovery time (> 2 minutes)

---

### 2. Redis Unavailability

**Objective**: Test caching layer failure and graceful degradation

**Impact**: Medium - caching disabled, potential performance impact

**Procedure**:
```bash
# Scale down Redis for 5 minutes
./chaos-inject.sh redis-unavailable \
  --environment staging \
  --duration 300

# Monitor cache hit rate
kubectl exec -n monitoring deployment/prometheus-server -- \
  promtool query instant 'redis_connected_clients{namespace="ofm-staging"}'
```

**Expected Behavior**:
- Application continues operating without cache
- Database queries increase but remain within limits
- Response times degrade gracefully (< 2x baseline)
- No user-visible errors

**Failure Indicators**:
- Application errors due to Redis dependency
- Database overload (> 80% CPU)
- Timeout errors or 5xx responses

---

### 3. S3 5xx Errors

**Objective**: Test upload resilience and retry mechanisms

**Impact**: Medium - file uploads may fail temporarily

**Procedure**:
```bash
# Inject S3 failures for 3 minutes
./chaos-inject.sh s3-5xx \
  --environment staging \
  --duration 180

# Monitor upload success rate
curl -s "https://prometheus-staging.ofm.social/api/v1/query?query=sum(rate(upload_requests_total{status!~\"5..\"}[5m]))/sum(rate(upload_requests_total[5m]))"
```

**Expected Behavior**:
- Upload requests retry with exponential backoff
- Users receive appropriate error messages
- No data loss or corruption
- Recovery after S3 service restoration

**Failure Indicators**:
- Upload failures without retry attempts
- Data corruption or partial uploads
- Persistent errors after recovery

---

### 4. PostgreSQL Failover

**Objective**: Test database failover and connection recovery

**Impact**: High - brief database unavailability during failover

**Procedure**:
```bash
# Trigger PostgreSQL failover
./chaos-inject.sh postgres-failover \
  --environment staging \
  --duration 300

# Monitor database connections
kubectl exec -n monitoring deployment/prometheus-server -- \
  promtool query instant 'database_connections_active{namespace="ofm-staging"}'
```

**Expected Behavior**:
- Failover completes within 30 seconds
- Application connections recover automatically
- No data loss (transactions may be rolled back)
- Read replicas promote successfully

**Failure Indicators**:
- Extended database unavailability (> 60 seconds)
- Connection pool exhaustion
- Data inconsistencies

---

### 5. Memory Pressure

**Objective**: Test behavior under memory constraints and OOM conditions

**Impact**: Low-Medium - potential pod restarts due to memory limits

**Procedure**:
```bash
# Create memory pressure for 3 minutes
./chaos-inject.sh memory-pressure \
  --environment staging \
  --duration 180

# Monitor memory usage
kubectl top pods -n ofm-staging
```

**Expected Behavior**:
- Memory usage approaches limits gradually
- Garbage collection triggers appropriately
- OOM killer terminates only test pods
- Application pods remain stable

**Failure Indicators**:
- Application pods killed by OOM
- Memory leaks or unbounded growth
- Node-level memory exhaustion

## 📊 Chaos Monitoring

### Real-Time Metrics

Monitor these metrics during chaos injection:

```bash
# Error rate
kubectl exec -n monitoring deployment/prometheus-server -- \
  promtool query instant 'sum(rate(http_requests_total{status=~"5.."}[1m]))/sum(rate(http_requests_total[1m]))'

# P95 latency
kubectl exec -n monitoring deployment/prometheus-server -- \
  promtool query instant 'histogram_quantile(0.95, sum by(le)(rate(http_request_duration_seconds_bucket[5m])))'

# Pod status
kubectl get pods -n ofm-staging -o wide --watch

# Database connections
kubectl exec -n monitoring deployment/prometheus-server -- \
  promtool query instant 'sum(database_connections_active)'
```

### Grafana Dashboards

Access real-time monitoring:
- **Chaos Engineering Dashboard**: https://grafana.ofm.social/d/chaos-engineering/chaos-engineering
- **System Overview**: https://grafana.ofm.social/d/system-resources/system-resources
- **Application Performance**: https://grafana.ofm.social/d/api-performance/api-performance

### SLO Compliance

Chaos tests should maintain:
- **Availability**: > 99.5% during chaos
- **Error Rate**: < 1% increase from baseline
- **Latency P95**: < 2x baseline
- **Recovery Time**: < 2 minutes after chaos ends

## 🚨 Chaos Emergency Procedures

### Immediate Abort

If chaos causes severe impact:

```bash
# Emergency stop - kill all chaos processes
pkill -f chaos-inject

# Remove network policies
kubectl delete networkpolicy -n ofm-staging -l chaos-experiment

# Scale resources back up
kubectl get deployments -n ofm-staging -o name | xargs -I {} kubectl scale {} --replicas=3

# Check system status
kubectl get pods -n ofm-staging
curl -f https://api-staging.ofm.social/health
```

### Escalation

1. **Level 1**: Engineering team member running chaos test
2. **Level 2**: On-call SRE (#ops-alerts Slack channel)
3. **Level 3**: Engineering manager (#incident-response Slack channel)
4. **Level 4**: CTO (emergency only)

---

# Disaster Recovery

## 🎯 Objectives

- **RTO Target**: 30 minutes (from detection to full service restoration)
- **RPO Target**: 15 minutes (maximum data loss window)
- **Availability Target**: 99.9% annual uptime

## 📋 DR Prerequisites

### Infrastructure Requirements
- pgBackRest configured with S3 storage
- Cross-region backup replication
- Disaster recovery environment provisioned
- Network connectivity between regions

### Team Requirements
- DR team roster with contact information
- Access credentials for DR environment
- Communication channels established
- Decision-making authority documented

## 🔄 DR Testing Procedures

### Monthly DR Drill

Automated monthly testing via GitHub Actions:

```bash
# Manual trigger of monthly DR drill
gh workflow run dr-monthly.yml \
  -f environment=production \
  -f dr_environment=dr-sandbox \
  -f full_drill=true \
  -f rto_target=30 \
  -f rpo_target=15
```

The drill will automatically:
1. Verify backup availability
2. Create sandbox environment
3. Restore database from backup
4. Verify data integrity
5. Test application connectivity
6. Generate comprehensive report

### Manual DR Testing

For ad-hoc testing or specific scenarios:

```bash
cd marketing/dr/scripts

# Test latest backup restoration
./dr-restore-sandbox.sh \
  --environment dr-test \
  --source production \
  --rto-target 30 \
  --rpo-target 15

# Test point-in-time recovery
./dr-restore-sandbox.sh \
  --environment dr-pitr \
  --source production \
  --pitr-target "2025-08-12 10:30:00" \
  --no-cleanup
```

## 🚨 Disaster Declaration

### Criteria for DR Activation

Activate disaster recovery when:
- Primary region completely unavailable (> 15 minutes)
- Data center failure affecting all services
- Critical security incident requiring isolation
- Regulatory requirement for data residency change

### DR Activation Decision Tree

```
Is primary region accessible?
├─ YES → Continue with regional failover
└─ NO → Full DR activation required
    ├─ Data loss acceptable?
    │   ├─ YES → Restore from latest backup
    │   └─ NO → Attempt PITR recovery
    └─ Time critical?
        ├─ YES → Fast restore (may lose recent data)
        └─ NO → Complete PITR restoration
```

## ⚡ Emergency DR Procedures

### Phase 1: Assessment & Communication (0-5 minutes)

1. **Declare Incident**
   ```bash
   # Update status page
   curl -X POST https://api.statuspage.io/v1/incidents \
     -H "Authorization: Bearer $STATUS_PAGE_TOKEN" \
     -d '{"incident":{"name":"Service Disruption - Investigating","status":"investigating"}}'
   
   # Notify team
   slack-notify "#incident-response" "🚨 DR activation initiated - primary region unavailable"
   ```

2. **Assess Impact**
   - Check primary region status
   - Evaluate data loss window
   - Determine affected services
   - Estimate recovery time

### Phase 2: DR Environment Activation (5-15 minutes)

1. **Prepare DR Environment**
   ```bash
   # Switch to DR region
   export AWS_REGION=us-west-2
   aws eks update-kubeconfig --name ofm-dr-cluster
   
   # Verify DR infrastructure
   kubectl get nodes
   kubectl get namespaces
   ```

2. **Initiate Database Recovery**
   ```bash
   # Fast recovery from latest backup
   cd marketing/dr/scripts
   ./dr-restore-sandbox.sh \
     --environment production-dr \
     --source production \
     --s3-bucket ofm-db-backups \
     --aws-region us-west-2 \
     --rto-target 20 \
     --no-cleanup
   ```

### Phase 3: Application Deployment (15-25 minutes)

1. **Deploy Application Stack**
   ```bash
   # Deploy using Helm with DR configuration
   helm upgrade --install ofm-social-os-dr \
     ./marketing/k8s/helm/ofm-social-os \
     --namespace ofm-production-dr \
     --values values-dr.yaml \
     --set global.environment=production-dr \
     --set database.host=postgres-dr \
     --set redis.host=redis-dr \
     --wait --timeout=10m
   ```

2. **Verify Deployment**
   ```bash
   # Check pod status
   kubectl get pods -n ofm-production-dr
   
   # Verify health endpoints
   kubectl port-forward -n ofm-production-dr service/ofm-social-os-api 8080:80 &
   curl -f http://localhost:8080/health
   curl -f http://localhost:8080/api/health/database
   ```

### Phase 4: Traffic Cutover (25-30 minutes)

1. **DNS Updates**
   ```bash
   # Update Route53 records to point to DR region
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890 \
     --change-batch file://dr-dns-change.json
   
   # Verify DNS propagation
   dig api.ofm.social
   ```

2. **SSL Certificate Validation**
   ```bash
   # Verify SSL certificates are valid in DR region
   curl -vI https://api.ofm.social 2>&1 | grep -i certificate
   ```

3. **Final Validation**
   ```bash
   # End-to-end functionality test
   curl -f -X POST https://api.ofm.social/api/auth/health-check \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

## 📊 DR Monitoring

### Critical Metrics During DR

Monitor these metrics during DR activation:

```bash
# Application health
kubectl get pods -n ofm-production-dr -o wide

# Database performance
kubectl exec -n ofm-production-dr deployment/postgres-dr -- \
  psql -U postgres -c "SELECT datname, numbackends, xact_commit, xact_rollback FROM pg_stat_database;"

# API response times
curl -w "@curl-format.txt" -s -o /dev/null https://api.ofm.social/health

# Error rates
kubectl logs -n ofm-production-dr -l app=ofm-social-os --tail=50 | grep -i error
```

### Recovery Validation Checklist

- [ ] All pods running and healthy
- [ ] Database accessible with expected data
- [ ] API endpoints responding (< 2s response time)
- [ ] Authentication system functional
- [ ] File uploads working
- [ ] Webhook processing active
- [ ] Monitoring and logging operational

## 🔄 DR Recovery (Returning to Primary)

### Planning Recovery

Before returning to primary region:
1. Verify primary region stability (> 2 hours)
2. Plan data synchronization strategy
3. Schedule maintenance window
4. Prepare rollback plan

### Data Synchronization

```bash
# Dump changes from DR database
kubectl exec -n ofm-production-dr deployment/postgres-dr -- \
  pg_dump -U postgres --data-only --where="created_at > '$DR_START_TIME'" ofm_social_os > dr-changes.sql

# Apply to restored primary database
kubectl exec -n ofm-production deployment/postgres-primary -i -- \
  psql -U postgres ofm_social_os < dr-changes.sql
```

### Gradual Cutover

1. **Deploy to Primary** (with DR data)
2. **Canary Traffic** (10% to primary)
3. **Monitor Closely** (error rates, performance)
4. **Gradual Increase** (25%, 50%, 75%, 100%)
5. **DNS Cutover** (back to primary region)

---

# Emergency Procedures

## 🚨 Incident Response

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| P0 | Complete service outage | Immediate | Immediate |
| P1 | Major functionality impacted | 15 minutes | 30 minutes |
| P2 | Minor functionality impacted | 1 hour | 4 hours |
| P3 | Cosmetic/documentation issues | 24 hours | N/A |

### P0 Emergency Response

**Detection**:
- Automated alerting (PagerDuty)
- User reports
- Monitoring dashboard alerts

**Immediate Actions** (0-5 minutes):
```bash
# Check overall system status
kubectl get pods --all-namespaces | grep -v Running

# Check API health
curl -f https://api.ofm.social/health
curl -f https://api-staging.ofm.social/health

# Check database
kubectl exec -n ofm-production deployment/postgres-primary -- \
  pg_isready -U postgres

# Check external dependencies
dig api.ofm.social
curl -I https://s3.amazonaws.com
```

**Communication** (0-2 minutes):
```bash
# Update status page
curl -X POST "https://api.statuspage.io/v1/pages/$PAGE_ID/incidents" \
  -H "Authorization: OAuth $STATUSPAGE_TOKEN" \
  -d '{"incident": {"name": "Service Disruption", "status": "investigating", "impact": "major"}}'

# Notify team
slack-notify "#incident-response" "🚨 P0 Incident - Service outage detected"
```

### Rollback Procedures

**Application Rollback**:
```bash
# Helm rollback to previous version
helm rollback ofm-social-os -n ofm-production

# Or kubectl rollback
kubectl rollout undo deployment/ofm-social-os-api -n ofm-production

# Verify rollback
kubectl rollout status deployment/ofm-social-os-api -n ofm-production
```

**Database Rollback**:
```bash
# Point-in-time recovery to before incident
cd marketing/dr/scripts
./dr-restore-sandbox.sh \
  --environment rollback-$(date +%Y%m%d) \
  --pitr-target "$(date -d '30 minutes ago' '+%Y-%m-%d %H:%M:%S')" \
  --source production
```

**Traffic Rollback**:
```bash
# DNS rollback
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch file://rollback-dns-change.json

# Verify
dig api.ofm.social
```

---

# Monitoring & Alerts

## 🔍 Key Metrics

### Application Metrics
- **Response Time**: P95 < 10s, P99 < 15s
- **Error Rate**: < 1%
- **Throughput**: Baseline ± 20%
- **Availability**: > 99.9%

### Infrastructure Metrics
- **CPU Usage**: < 80% average
- **Memory Usage**: < 85% average
- **Disk Usage**: < 80%
- **Network Latency**: < 100ms

### Business Metrics
- **Publishing Success Rate**: > 95%
- **Upload Success Rate**: > 98%
- **Webhook Processing Rate**: > 99.9%

## 📱 Alert Configuration

### PagerDuty Escalation

```yaml
# High priority alerts
- name: api_down
  condition: up{job="api"} == 0
  duration: 1m
  severity: critical
  
- name: error_rate_high
  condition: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
  duration: 3m
  severity: critical

# Medium priority alerts  
- name: response_time_high
  condition: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 10
  duration: 5m
  severity: warning
```

### Slack Notifications

```bash
# Function to send Slack alerts
slack-notify() {
  local channel="$1"
  local message="$2"
  
  curl -X POST -H 'Content-type: application/json' \
    --data "{\"channel\":\"$channel\",\"text\":\"$message\"}" \
    "$SLACK_WEBHOOK_URL"
}

# Usage examples
slack-notify "#alerts" "⚠️ High error rate detected: 5.2%"
slack-notify "#incident-response" "🚨 Database connection issues"
```

## 📊 Dashboard Links

### Production Monitoring
- **System Overview**: https://grafana.ofm.social/d/system/system-overview
- **API Performance**: https://grafana.ofm.social/d/api/api-performance
- **Database Performance**: https://grafana.ofm.social/d/db/database-performance
- **Chaos Engineering**: https://grafana.ofm.social/d/chaos/chaos-engineering
- **DR Status**: https://grafana.ofm.social/d/dr/disaster-recovery

### Staging Monitoring
- **System Overview**: https://grafana-staging.ofm.social/d/system/system-overview
- **Load Testing**: https://grafana-staging.ofm.social/d/k6/k6-load-testing

---

# Post-Incident Procedures

## 📝 Incident Documentation

### Incident Report Template

```markdown
# Incident Report - [Date] - [Brief Description]

## Summary
- **Start Time**: 
- **End Time**: 
- **Duration**: 
- **Severity**: P0/P1/P2/P3
- **Impact**: 

## Timeline
- **[Time]**: First detection
- **[Time]**: Initial response
- **[Time]**: Root cause identified
- **[Time]**: Mitigation deployed
- **[Time]**: Service restored
- **[Time]**: Incident closed

## Root Cause
[Detailed analysis of what caused the incident]

## Resolution
[Description of how the incident was resolved]

## Lessons Learned
[What we learned from this incident]

## Action Items
- [ ] [Action item 1] - Assignee: [Name] - Due: [Date]
- [ ] [Action item 2] - Assignee: [Name] - Due: [Date]
```

### Post-Mortem Process

1. **Immediate** (within 24 hours):
   - Draft incident report
   - Collect logs and evidence
   - Initial timeline reconstruction

2. **Short-term** (within 3 days):
   - Conduct blameless post-mortem meeting
   - Identify root cause and contributing factors
   - Define action items

3. **Medium-term** (within 1 week):
   - Implement immediate fixes
   - Update runbooks and procedures
   - Communicate learnings to broader team

4. **Long-term** (within 1 month):
   - Complete all action items
   - Update monitoring and alerting
   - Conduct follow-up testing

## 🔄 Continuous Improvement

### Monthly Reviews
- Review all P0/P1 incidents
- Analyze trends and patterns
- Update procedures and runbooks
- Schedule additional training if needed

### Quarterly Assessments
- Full DR drill with lessons learned
- Chaos engineering program review
- Tool and process evaluation
- Team skills assessment

### Annual Planning
- DR strategy review
- Infrastructure capacity planning
- Team training and certification
- Vendor and tool evaluation

---

# Quick Reference

## 🆘 Emergency Contacts

| Role | Primary | Secondary | Escalation |
|------|---------|-----------|------------|
| On-Call SRE | Slack: #ops-alerts | PagerDuty: ofm-sre | Engineering Manager |
| Database Admin | Slack: @db-admin | Phone: +1-555-0123 | CTO |
| Security Team | Slack: #security | security@ofm.social | CISO |
| Executive | CTO | CEO | Board Chair |

## 🔗 Quick Links

| Resource | URL |
|----------|-----|
| Status Page | https://status.ofm.social |
| Grafana | https://grafana.ofm.social |
| PagerDuty | https://ofm.pagerduty.com |
| Slack | https://ofm.slack.com/channels/incident-response |
| AWS Console | https://console.aws.amazon.com |
| GitHub Actions | https://github.com/ofm/social-os/actions |

## 📞 Key Commands

```bash
# System status
kubectl get pods --all-namespaces | grep -v Running
curl -f https://api.ofm.social/health

# Chaos testing
cd marketing/chaos/scripts
./chaos-inject.sh --help

# DR testing  
cd marketing/dr/scripts
./dr-restore-sandbox.sh --help

# SLO monitoring
cd marketing/scripts/slo
npx ts-node verify-slo.ts --help

# Emergency rollback
helm rollback ofm-social-os -n ofm-production
kubectl rollout undo deployment/ofm-social-os-api -n ofm-production
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-08-12  
**Next Review**: 2025-09-12  
**Owner**: Platform Engineering Team