# Rollback Procedures Checklist

Emergency and planned rollback procedures for the OFM Social OS system.

## Emergency Rollback (SLO Violation)

### Immediate Response (0-5 minutes)
- [ ] **Assess Impact**: Confirm SLO violation or critical incident
- [ ] **Declare Incident**: Notify team via Slack #ops-alerts
- [ ] **Execute Rollback**: 
  ```
  POST /internal/ops/canary/rollback
  { "reason": "EMERGENCY_SLO_VIOLATION", "incident_id": "INC-XXXX" }
  ```
- [ ] **Monitor Rollback**: Watch traffic shift to stable version
- [ ] **Verify Recovery**: Confirm SLO metrics improving

### SLO Violation Triggers
Execute emergency rollback if any persist for 5+ minutes:
- [ ] P95 latency > 10 seconds
- [ ] Error rate > 1%  
- [ ] Success rate < 95%
- [ ] Webhook signature verification < 99.9%
- [ ] Database connection failures > 5%

### Rollback Validation (5-15 minutes)
- [ ] **Traffic Routing**: 100% traffic on stable version
- [ ] **SLO Recovery**: All metrics returning to normal ranges
- [ ] **Error Reduction**: Error rates decreasing consistently  
- [ ] **Database Health**: Connection pool and query performance normal
- [ ] **External APIs**: Platform integrations responding normally
- [ ] **Queue Processing**: Publishing queues processing normally

## Planned Rollback

### Pre-Rollback Planning
- [ ] **Change Window**: Schedule during low-traffic period
- [ ] **Team Availability**: Ensure key personnel available
- [ ] **Rollback Reason**: Document reason for planned rollback
- [ ] **Communication**: Notify stakeholders of planned rollback
- [ ] **Backup Verification**: Confirm stable version is available

### Execution Steps
- [ ] **Initiate Rollback**: Use Internal Operations interface
- [ ] **Monitor Progress**: Watch Argo Rollouts progress
- [ ] **Validate Health**: Run health checks on stable version
- [ ] **Smoke Tests**: Execute critical path smoke tests
- [ ] **Full Validation**: Run comprehensive test suite

## Database Rollback

### When Database Rollback Required
- [ ] Schema changes causing application failures
- [ ] Data corruption detected
- [ ] Performance degradation from migrations
- [ ] Incompatible data format changes

### Database Rollback Process
```bash
# Point-in-time recovery to before deployment
cd marketing/dr/scripts
./dr-restore-sandbox.sh \
  --environment rollback-$(date +%Y%m%d) \
  --pitr-target "$(date -d '2 hours ago' '+%Y-%m-%d %H:%M:%S')" \
  --source production
```

### Database Rollback Validation
- [ ] **Schema Version**: Confirm correct schema version
- [ ] **Data Integrity**: Run data consistency checks
- [ ] **Application Compatibility**: Verify app connects successfully
- [ ] **Performance**: Confirm query performance normal
- [ ] **Backup Status**: Verify new backups working

## Application Configuration Rollback

### Configuration Changes
- [ ] **Feature Flags**: Disable new features via feature flag system
- [ ] **Environment Variables**: Revert to previous values
- [ ] **API Keys**: Restore previous API credentials if changed
- [ ] **Rate Limits**: Reset to previous thresholds
- [ ] **Webhook URLs**: Restore previous endpoint configurations

### Helm Chart Rollback
```bash
# Rollback Helm release
helm rollback ofm-social-os -n ofm-production

# Or rollback to specific revision
helm rollback ofm-social-os 5 -n ofm-production

# Verify rollback
helm history ofm-social-os -n ofm-production
```

### Kubernetes Deployment Rollback
```bash
# Rollback deployment
kubectl rollout undo deployment/ofm-social-os-api -n ofm-production

# Rollback to specific revision
kubectl rollout undo deployment/ofm-social-os-api --to-revision=3 -n ofm-production

# Check rollout status
kubectl rollout status deployment/ofm-social-os-api -n ofm-production
```

## External Service Rollback

### DNS and Load Balancer
- [ ] **DNS Records**: Revert DNS changes if made
- [ ] **Load Balancer**: Restore previous routing rules
- [ ] **SSL Certificates**: Verify certificates still valid
- [ ] **CDN Configuration**: Reset CDN settings if changed

### Third-Party Integrations
- [ ] **Webhook Endpoints**: Restore previous webhook URLs
- [ ] **API Credentials**: Revert to previous API keys/secrets
- [ ] **OAuth Applications**: Reset OAuth application settings
- [ ] **Platform Permissions**: Verify platform app permissions

## Post-Rollback Procedures

### Immediate Validation (0-30 minutes)
- [ ] **SLO Compliance**: All SLOs within target ranges
- [ ] **Error Monitoring**: No unusual error patterns
- [ ] **Application Logs**: Normal log patterns resumed
- [ ] **Database Performance**: Query performance normal
- [ ] **Queue Processing**: No message backlogs
- [ ] **Integration Tests**: Critical path tests passing

### Extended Validation (30 minutes - 2 hours)
- [ ] **End-to-End Tests**: Full test suite execution
- [ ] **Load Testing**: Performance under normal load
- [ ] **Business Metrics**: Publishing rates normalized
- [ ] **User Experience**: No customer complaints
- [ ] **Monitoring Systems**: All dashboards showing normal

### Root Cause Analysis
- [ ] **Log Collection**: Gather logs from failed deployment
- [ ] **Metric Analysis**: Analyze performance degradation patterns  
- [ ] **Timeline Creation**: Document timeline of events
- [ ] **Contributing Factors**: Identify all contributing factors
- [ ] **Lessons Learned**: Document learnings and improvements

## Communication Protocol

### Internal Communications
- [ ] **Ops Team**: Immediate notification via Slack #ops-alerts
- [ ] **Engineering Team**: Update via Slack #engineering  
- [ ] **Leadership**: Brief engineering leadership on impact
- [ ] **Customer Success**: Notify if customer impact occurred

### External Communications (if customer impact)
- [ ] **Status Page**: Update status page if public impact
- [ ] **Customer Notifications**: Email affected customers if applicable
- [ ] **Social Media**: Monitor for customer complaints
- [ ] **Support Team**: Brief support team on known issues

## Documentation Requirements

### Incident Documentation
- [ ] **Rollback Trigger**: What caused the rollback decision
- [ ] **Timeline**: Detailed timeline of rollback execution
- [ ] **Impact Assessment**: Customer and business impact
- [ ] **Recovery Time**: Time from incident to full recovery
- [ ] **Lessons Learned**: Improvements for future deployments

### Audit Trail
- [ ] **Operations Log**: All rollback actions logged in audit system
- [ ] **Command History**: All commands executed during rollback
- [ ] **Configuration Changes**: All config changes during rollback
- [ ] **Team Actions**: Who performed which actions when

## Prevention Measures

### Process Improvements
- [ ] **Review Deployment Process**: Identify process gaps
- [ ] **Update Checklists**: Enhance pre-deployment validation
- [ ] **Improve Monitoring**: Add alerts for early warning signs
- [ ] **Automate Rollbacks**: Implement automated rollback triggers
- [ ] **Testing Enhancement**: Add tests to prevent similar issues

### Technical Improvements  
- [ ] **Circuit Breakers**: Implement for external dependencies
- [ ] **Feature Flags**: Use for safe feature rollouts
- [ ] **Blue-Green Deployment**: Consider for zero-downtime rollbacks
- [ ] **Database Migrations**: Improve migration safety
- [ ] **Configuration Management**: Better config change tracking

## Success Criteria

Rollback is successful when:
- [ ] **All SLOs** consistently within targets for 2+ hours
- [ ] **Application stability** demonstrated through monitoring
- [ ] **No ongoing incidents** related to the rolled-back deployment
- [ ] **Business operations** returned to normal
- [ ] **Team confidence** restored in system reliability
- [ ] **Documentation complete** for post-incident review

---

*Rollback procedures should only be executed by authorized operations personnel with admin role access. Always follow the principle: "When in doubt, roll back."*