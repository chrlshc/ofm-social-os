# Canary Deployment Checklist

Essential checklist for safe canary deployments through the Internal Operations API.

## Pre-Deployment Checklist

### Infrastructure Readiness
- [ ] Database connectivity verified (`/internal/ops/execute` → `health-check`)
- [ ] Redis connectivity verified  
- [ ] S3/storage accessibility confirmed
- [ ] Webhook endpoints responding (Instagram, TikTok, Meta)
- [ ] Monitoring dashboards accessible (Grafana, Prometheus)
- [ ] PagerDuty integration tested and alerts configured

### Security & Access
- [ ] Internal ops team authenticated with appropriate roles
- [ ] Audit logging enabled and functioning
- [ ] IP allowlists configured for operations access
- [ ] Backup and rollback procedures tested

### Code & Configuration
- [ ] All tests passing (unit, integration, e2e)
- [ ] Security scans completed with no critical issues
- [ ] Database migrations applied and tested
- [ ] Feature flags configured for gradual rollout
- [ ] Container images built and scanned for vulnerabilities

## Deployment Execution

### Phase 1: Launch 10% Canary
- [ ] Execute canary deployment via `/internal/ops/canary/promote`
- [ ] Verify canary pods are running and healthy
- [ ] Monitor SLO metrics via internal dashboard:
  - [ ] P95 latency < 10 seconds
  - [ ] Success rate ≥ 95%  
  - [ ] Error rate < 1%
  - [ ] Webhook signature verification ≥ 99.9%
- [ ] Check application logs for errors
- [ ] Validate business metrics (publishing rates, user activity)
- [ ] **Wait 30+ minutes** for traffic pattern establishment

### Phase 2: Monitor and Validate 10%
- [ ] SLO compliance maintained for 30+ minutes
- [ ] No critical alerts triggered
- [ ] Application logs show normal behavior
- [ ] Database performance within normal ranges
- [ ] External API rate limits not exceeded
- [ ] Customer success metrics stable

### Phase 3: Progressive Rollout (if 10% successful)
- [ ] Promote to 25% via operations interface
- [ ] **Wait 15 minutes** → Verify SLOs maintained
- [ ] Promote to 50% via operations interface  
- [ ] **Wait 15 minutes** → Verify SLOs maintained
- [ ] Promote to 75% via operations interface
- [ ] **Wait 10 minutes** → Verify SLOs maintained
- [ ] Promote to 100% (full deployment)

## Monitoring During Rollout

### Real-Time Metrics (check every 5-10 minutes)
- [ ] P95 response time trends
- [ ] Error rate patterns
- [ ] Database connection pool status
- [ ] Memory and CPU utilization
- [ ] Active user counts
- [ ] Publishing success rates per platform

### Business Impact Assessment
- [ ] Content publishing rates normal
- [ ] User engagement metrics stable
- [ ] Platform-specific metrics within ranges:
  - [ ] Instagram: Post success rate > 95%
  - [ ] TikTok: Video upload success rate > 95%
  - [ ] Reddit: Comment/post success rate > 95%
- [ ] Webhook processing latency acceptable
- [ ] No user complaints or support tickets

## Rollback Triggers

### Automatic Rollback Conditions
Execute `/internal/ops/canary/rollback` immediately if:
- [ ] **P95 latency** exceeds 10 seconds for 5+ consecutive minutes
- [ ] **Error rate** exceeds 1% for 5+ consecutive minutes  
- [ ] **Success rate** drops below 95% for 5+ consecutive minutes
- [ ] **Webhook signatures** verification drops below 99.9%
- [ ] **Database** connection failures > 5% for 2+ minutes
- [ ] **Critical alerts** fired (P0/P1 incidents)

### Manual Rollback Considerations
Consider rollback if:
- [ ] Memory leaks detected (steady memory growth)
- [ ] Unusual log patterns or exception spikes
- [ ] External API rate limiting triggered
- [ ] Customer reports of degraded experience
- [ ] Publishing queues backing up significantly
- [ ] Third-party integration failures

## Post-Deployment Validation

### Immediate Validation (within 30 minutes)
- [ ] All SLO targets met consistently
- [ ] Application logs show normal operation
- [ ] Database performance stable
- [ ] No pending alerts or warnings
- [ ] Smoke tests pass end-to-end

### Extended Validation (within 2 hours)
- [ ] Load testing confirms performance
- [ ] Business metrics returned to baseline
- [ ] Integration tests with all platforms pass
- [ ] Backup and monitoring systems functioning
- [ ] Documentation updated with any changes

## Audit and Communication

### Internal Logging
- [ ] All deployment actions logged in audit system
- [ ] SLO compliance data recorded
- [ ] Performance metrics baseline updated
- [ ] Any issues or anomalies documented

### Team Communication  
- [ ] Engineering team notified of successful deployment
- [ ] Operations team briefed on any configuration changes
- [ ] Customer success team updated on feature availability
- [ ] Post-deployment review scheduled if issues occurred

## Emergency Contacts

- **Primary On-Call**: Available via Slack #ops-alerts or PagerDuty
- **Database Team**: Available via Slack #database-support  
- **Security Team**: Available via Slack #security-incidents
- **Platform Engineering**: Available via Slack #platform-eng

## Rollback Procedure

If rollback is required:

1. **Immediate Action**:
   ```
   POST /internal/ops/canary/rollback
   { "reason": "SLO_VIOLATION" }
   ```

2. **Verify Rollback**:
   - [ ] Traffic routed to stable version
   - [ ] SLO metrics recovering
   - [ ] Error rates decreasing

3. **Investigation**:
   - [ ] Collect logs and metrics from failed deployment
   - [ ] Document root cause
   - [ ] Update deployment checklist based on learnings

## Success Criteria

Deployment is considered successful when:
- [ ] **100% traffic** on new version for 2+ hours
- [ ] **All SLOs** consistently within targets
- [ ] **No critical incidents** related to deployment
- [ ] **Business metrics** at or above baseline
- [ ] **Monitoring and alerting** functioning normally
- [ ] **Team confidence** in system stability

---

*This checklist should be completed by authorized operations personnel with admin role access to the Internal Operations API.*