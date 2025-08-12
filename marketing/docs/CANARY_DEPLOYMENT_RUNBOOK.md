# 🚀 Canary Deployment Runbook - OFM Social OS

## Overview

This runbook provides step-by-step instructions for deploying and managing canary releases of the OFM Social OS marketing system.

## Pre-Deployment Checklist

### ✅ Prerequisites

- [ ] All PR reviews completed and approved
- [ ] Security scans passed (SAST, DAST, container scan)
- [ ] Unit and integration tests passing
- [ ] Load testing completed with satisfactory results
- [ ] Staging environment validated
- [ ] SLO baselines established
- [ ] Monitoring dashboards operational
- [ ] Alerting configured and tested
- [ ] Rollback procedures verified

### 📊 Environment Health Check

Before starting canary deployment, verify:

```bash
# Check cluster health
kubectl cluster-info
kubectl get nodes
kubectl top nodes

# Check monitoring stack
kubectl get pods -n monitoring
kubectl get pods -n kube-system

# Check existing deployment health
kubectl get pods -n ofm-production
kubectl get svc -n ofm-production
```

## Deployment Strategies

### Strategy 1: Time-Based Promotion (Recommended)

- **Duration**: 48 hours
- **Traffic Split**: 10% canary, 90% stable
- **Promotion**: Automatic after 48h if SLOs met
- **Use Case**: Standard releases, feature updates

### Strategy 2: Burn-Rate Based Promotion

- **Duration**: Variable (6-72 hours)
- **Traffic Split**: 10% canary, 90% stable  
- **Promotion**: When error budget burn rate < 1.0x for 6 consecutive hours
- **Use Case**: High-risk changes, new platform integrations

## Deployment Process

### Step 1: Trigger Canary Deployment

#### Via GitHub Actions (Recommended)
```bash
# Manual trigger with custom parameters
gh workflow run deploy-canary.yml \
  -f environment=production \
  -f canary_weight=10 \
  -f auto_promote=true
```

#### Via Helm (Direct K8s)
```bash
# Set deployment parameters
ENVIRONMENT="production"
CANARY_WEIGHT="10" 
IMAGE_TAG="v1.2.3"

# Deploy canary
helm upgrade --install ofm-social-os-${ENVIRONMENT} \
  ./marketing/k8s/helm/ofm-social-os \
  --namespace ofm-${ENVIRONMENT} \
  --set canary.enabled=true \
  --set canary.weight=${CANARY_WEIGHT} \
  --set api.image.tag=${IMAGE_TAG} \
  --values values-${ENVIRONMENT}.yaml \
  --wait --timeout=10m
```

### Step 2: Verify Deployment

```bash
# Check deployment status
kubectl rollout status deployment/ofm-social-os-api-canary -n ofm-production
kubectl get pods -n ofm-production -l version=canary

# Verify traffic splitting
kubectl get ingress -n ofm-production
curl -H "X-Canary: always" https://api.ofm.social/health

# Check feature flags
kubectl exec -n ofm-production deployment/ofm-social-os-api-canary -- \
  curl localhost:3000/admin/feature-flags
```

### Step 3: Monitor SLO Gates

#### Critical SLOs to Monitor

1. **Success Rate**: ≥ 95%
```promql
sum(rate(publish_requests_total{status!~"5..",version="canary"}[5m])) / 
sum(rate(publish_requests_total{version="canary"}[5m]))
```

2. **Latency P95**: < 10 seconds
```promql
histogram_quantile(0.95, 
  sum by(le)(rate(publish_latency_ms_bucket{version="canary"}[5m]))
)
```

3. **Error Rate**: ≤ 1%
```promql
sum(rate(http_requests_total{status=~"5..",version="canary"}[5m])) / 
sum(rate(http_requests_total{version="canary"}[5m]))
```

4. **Webhook Security**: 100% signature verification
```promql
sum(rate(webhook_signature_verified_total{version="canary"}[5m])) / 
sum(rate(webhook_signature_total{version="canary"}[5m]))
```

#### Monitoring Commands

```bash
# Real-time SLO monitoring using verification script
cd marketing/scripts/slo
npx ts-node verify-slo.ts \
  --service-name ofm-social-os-api-canary \
  --environment production \
  --prometheus-url https://prometheus-production.ofm.social \
  --rollback-command "kubectl argo rollouts abort ofm-social-os-api-rollout -n ofm-production"

# Manual Prometheus queries for quick checks
kubectl exec -n monitoring deployment/prometheus-server -- \
  promtool query instant 'histogram_quantile(0.95, sum by(le)(rate(http_request_duration_seconds_bucket{service="ofm-social-os-api-canary", version="canary"}[5m]))) * 1000'

# Check webhook signature verification rate
kubectl exec -n monitoring deployment/prometheus-server -- \
  promtool query instant 'sum(rate(webhook_signature_verified_total{version="canary"}[5m])) / sum(rate(webhook_signature_total{version="canary"}[5m]))'

# View Grafana dashboards
open https://grafana.ofm.social/d/canary/canary-deployment
open https://grafana.ofm.social/d/k6-load-testing/k6-load-testing

# Check Argo Rollouts status
kubectl argo rollouts get rollout ofm-social-os-api-rollout -n ofm-production

# Monitor analysis runs for SLO gates
kubectl get analysisruns -n ofm-production -l app=ofm-social-os
kubectl describe analysisrun <analysis-run-name> -n ofm-production
```

### Step 4: Handle SLO Breaches

If any SLO is breached during monitoring:

#### Immediate Actions
1. **Stop further traffic** to canary
2. **Investigate** the root cause
3. **Rollback** if necessary
4. **Document** the incident

#### Commands
```bash
# Immediate traffic stop
kubectl argo rollouts set weight ofm-social-os-api-rollout 0 -n ofm-production

# Manual rollback
kubectl argo rollouts undo ofm-social-os-api-rollout -n ofm-production

# Scale down canary
kubectl scale deployment ofm-social-os-api-canary --replicas=0 -n ofm-production
```

## Platform-Specific Considerations

### Instagram
- **Rate Limits**: 200 requests/hour per user
- **Feature Flag**: `platform_instagram.canaryPercentage`
- **Monitor**: `instagram_api_calls_total`, `instagram_errors_total`

### TikTok
- **Rate Limits**: 100 posts/day per user
- **Feature Flag**: `platform_tiktok.canaryPercentage`
- **Monitor**: `tiktok_upload_duration_ms`, `tiktok_webhook_signature_rate`

### Reddit
- **Rate Limits**: 60 requests/minute
- **Feature Flag**: `platform_reddit.canaryPercentage`
- **Monitor**: `reddit_post_success_rate`, `reddit_moderation_flags`

### X (Twitter)
- **Status**: Currently disabled
- **Feature Flag**: `platform_x.enabled = false`
- **Activation**: Requires legal and compliance review

## Rollback Procedures

### Automatic Rollback Triggers

1. **SLO Breach**: Any SLO below threshold for > 5 consecutive measurements
2. **Error Spike**: Error rate > 5% for > 2 minutes
3. **Security Alert**: Webhook signature failure rate > 0.1%
4. **Resource Exhaustion**: CPU > 95% or Memory > 90% for > 3 minutes

### Manual Rollback

#### Emergency Rollback (< 2 minutes)
```bash
# Immediate traffic cutoff
kubectl patch ingress ofm-social-os-api-canary -n ofm-production \
  --type='json' \
  -p='[{"op": "replace", "path": "/metadata/annotations/nginx.ingress.kubernetes.io~1canary-weight", "value": "0"}]'

# Scale down canary
kubectl scale deployment ofm-social-os-api-canary --replicas=0 -n ofm-production
```

#### Controlled Rollback (5-10 minutes)
```bash
# Use Argo Rollouts
kubectl argo rollouts abort ofm-social-os-api-rollout -n ofm-production
kubectl argo rollouts undo ofm-social-os-api-rollout -n ofm-production

# Verify rollback
kubectl argo rollouts status ofm-social-os-api-rollout -n ofm-production
```

### Post-Rollback Actions

1. **Incident Documentation**
   - Create incident report
   - Update runbooks
   - Schedule post-mortem

2. **System Verification**
   - Check all SLOs returned to baseline
   - Verify stable version performance
   - Test all critical user journeys

3. **Communication**
   - Notify stakeholders via Slack
   - Update status page if needed
   - Inform support team

## Promotion to 100%

### Automated Promotion

After 48h with all SLOs met:
```bash
# Check promotion readiness
kubectl argo rollouts get rollout ofm-social-os-api-rollout -n ofm-production

# Promotion happens automatically or trigger manually
kubectl argo rollouts promote ofm-social-os-api-rollout -n ofm-production
```

### Manual Promotion Checklist

- [ ] All SLOs maintained for required duration
- [ ] No security alerts triggered
- [ ] Platform-specific metrics healthy
- [ ] User feedback positive (if available)
- [ ] Business metrics stable
- [ ] Infrastructure metrics normal

### Promotion Commands

```bash
# Full promotion
kubectl argo rollouts promote ofm-social-os-api-rollout -n ofm-production

# Gradual promotion (optional)
kubectl argo rollouts set weight ofm-social-os-api-rollout 50 -n ofm-production
# Wait and monitor
kubectl argo rollouts set weight ofm-social-os-api-rollout 100 -n ofm-production
```

## Post-Deployment

### Verification Steps

```bash
# Check final deployment state
kubectl get deployments -n ofm-production
kubectl get pods -n ofm-production

# Verify traffic distribution
curl -s https://api.ofm.social/health | jq '.version'

# Check feature flags status
curl -s https://api.ofm.social/admin/feature-flags | jq '.platforms'
```

### Monitoring Period

Continue monitoring for 24h after 100% promotion:

1. **SLO Dashboards**: Monitor all key metrics
2. **Error Rates**: Watch for delayed issues
3. **Platform APIs**: Check rate limit consumption
4. **User Feedback**: Monitor support channels
5. **Business Metrics**: Track conversion rates

## Troubleshooting

### Common Issues

#### 1. Canary Pods Not Starting
```bash
# Check events
kubectl describe pod -n ofm-production -l version=canary

# Check logs
kubectl logs -n ofm-production -l version=canary --tail=100

# Check secrets
kubectl get secret ofm-social-os-secret -n ofm-production -o yaml
```

#### 2. Traffic Not Reaching Canary
```bash
# Check ingress configuration
kubectl describe ingress ofm-social-os-api-canary -n ofm-production

# Test canary header
curl -H "X-Canary: always" -v https://api.ofm.social/health

# Check nginx controller
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

#### 3. SLO Metrics Missing
```bash
# Check Prometheus targets
kubectl port-forward -n monitoring svc/prometheus-server 9090:80
# Open http://localhost:9090/targets

# Check metric exports
curl -s http://api.ofm.social:9090/metrics | grep publish_requests_total
```

#### 4. Feature Flags Not Working
```bash
# Check Redis connection
kubectl exec -n ofm-production deployment/ofm-social-os-api-canary -- \
  redis-cli -u $REDIS_URL ping

# Check flag configuration
kubectl exec -n ofm-production deployment/ofm-social-os-api-canary -- \
  env | grep FEATURE_FLAGS
```

## Emergency Contacts

### On-Call Rotation
- **Primary**: Platform Engineering Team
- **Secondary**: DevOps Team  
- **Escalation**: CTO

### Communication Channels
- **Slack**: #incident-response
- **PagerDuty**: OFM Production Alerts
- **Status Page**: https://status.ofm.social

### External Dependencies
- **AWS Support**: Enterprise Support Plan
- **Kubernetes**: EKS Support
- **Monitoring**: DataDog/New Relic Support

## Runbook Updates

This runbook should be updated after:
- Each major deployment
- Post-incident reviews
- Platform changes
- Tool updates

**Last Updated**: 2025-08-12  
**Version**: 1.0.0  
**Next Review**: 2025-09-12