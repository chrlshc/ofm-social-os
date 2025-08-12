# Grafana Dashboards Index - OFM Social OS

This directory contains all Grafana dashboard configurations for the OFM Social OS marketing system.

## 📊 Available Dashboards

### Core System Monitoring
- **[k6-load-testing.json](./k6-load-testing.json)** - K6 Load Testing Dashboard
  - Real-time load test metrics
  - Performance validation (P95/P99 latencies)
  - SLO compliance monitoring
  - Resource usage during tests
  - **Grafana URL**: `https://grafana.ofm.social/d/k6-load-testing/k6-load-testing`

### Application Performance
- **API Performance** *(To be implemented)*
  - Request latencies and throughput
  - Error rates by endpoint
  - Platform-specific metrics
  - **Grafana URL**: `https://grafana.ofm.social/d/api-performance/api-performance`

- **Database Performance** *(To be implemented)*
  - PostgreSQL query performance
  - Connection pool monitoring
  - Slow query analysis
  - **Grafana URL**: `https://grafana.ofm.social/d/database-performance/database-performance`

### Infrastructure Monitoring
- **System Resources** *(To be implemented)*
  - CPU, Memory, Disk I/O
  - Network metrics
  - Container resource usage
  - **Grafana URL**: `https://grafana.ofm.social/d/system-resources/system-resources`

- **Kubernetes Cluster** *(To be implemented)*
  - Pod status and resource consumption
  - Node health and capacity
  - Deployment status
  - **Grafana URL**: `https://grafana.ofm.social/d/kubernetes-cluster/kubernetes-cluster`

### Business Metrics
- **Platform Publishing** *(To be implemented)*
  - Publishing success rates by platform
  - Content performance metrics
  - User engagement tracking
  - **Grafana URL**: `https://grafana.ofm.social/d/platform-publishing/platform-publishing`

- **Media Pipeline** *(To be implemented)*
  - Upload and transcoding metrics
  - S3 storage usage
  - FFmpeg processing times
  - **Grafana URL**: `https://grafana.ofm.social/d/media-pipeline/media-pipeline`

### Operational Dashboards
- **Canary Deployment** *(To be implemented)*
  - Canary vs stable comparison
  - SLO gate status
  - Rollback trigger monitoring
  - **Grafana URL**: `https://grafana.ofm.social/d/canary-deployment/canary-deployment`

- **Chaos Engineering** *(To be implemented)*
  - Fault injection status
  - System resilience metrics
  - Recovery time tracking
  - **Grafana URL**: `https://grafana.ofm.social/d/chaos-engineering/chaos-engineering`

- **Disaster Recovery** *(To be implemented)*
  - Backup status monitoring
  - RTO/RPO tracking
  - DR drill results
  - **Grafana URL**: `https://grafana.ofm.social/d/disaster-recovery/disaster-recovery`

## 🔄 Dashboard Deployment

### Automatic Deployment
Dashboards are automatically deployed via Helm chart:

```yaml
# In values.yaml
grafana:
  dashboards:
    enabled: true
    configMapGenerator:
      enabled: true
      labelKey: grafana_dashboard
      labelValue: 1
```

### Manual Import
To manually import a dashboard:

1. Access Grafana: `https://grafana.ofm.social`
2. Go to **Dashboards** → **Import**
3. Upload the JSON file or paste the content
4. Configure data sources (usually Prometheus)
5. Save the dashboard

### Data Sources Configuration

#### Prometheus
- **Name**: `prometheus`
- **Type**: `Prometheus`
- **URL**: `http://prometheus-server.monitoring.svc.cluster.local`
- **Access**: `Server (default)`

#### Loki (Logs)
- **Name**: `loki`
- **Type**: `Loki`
- **URL**: `http://loki.monitoring.svc.cluster.local:3100`
- **Access**: `Server (default)`

## 📋 Dashboard Standards

### Naming Conventions
- Use kebab-case for file names: `dashboard-name.json`
- Dashboard titles should be descriptive: "K6 Load Testing - OFM Social OS"
- Panel titles should be concise and clear

### Tagging
All dashboards should include these tags:
- `ofm` - Organization identifier
- `marketing` - System identifier
- Dashboard-specific tags (e.g., `load-testing`, `performance`)

### Time Ranges
- Default time range: Last 1 hour
- Refresh intervals available: 5s, 10s, 30s, 1m, 5m, 15m, 30m, 1h
- Use appropriate refresh rates for dashboard purpose

### Color Schemes
- Use consistent color palette across dashboards
- Green: Healthy/Success states
- Yellow: Warning states
- Red: Critical/Error states
- Blue: Information/Neutral metrics

### Thresholds
- Configure meaningful thresholds based on SLOs
- P95 Latency: Warning at 8s, Critical at 10s
- Error Rate: Warning at 0.5%, Critical at 1%
- Success Rate: Warning at 97%, Critical at 95%

## 🚀 Quick Links

### Production Environment
- **Grafana**: https://grafana.ofm.social
- **Prometheus**: https://prometheus.ofm.social
- **Alertmanager**: https://alertmanager.ofm.social

### Staging Environment
- **Grafana**: https://grafana-staging.ofm.social
- **Prometheus**: https://prometheus-staging.ofm.social

## 🔧 Development

### Testing Dashboards Locally
```bash
# Start local Grafana with Docker
docker run -d -p 3000:3000 --name grafana grafana/grafana

# Import dashboard via API
curl -X POST \
  http://localhost:3000/api/dashboards/db \
  -H 'Content-Type: application/json' \
  -d @k6-load-testing.json
```

### Dashboard Variables
Use dashboard variables for:
- Environment selection (staging/production)
- Service selection
- Time range selection
- Percentile selection for latency graphs

### Best Practices
1. **Performance**: Avoid too many panels or complex queries
2. **Usability**: Group related metrics in rows
3. **Responsiveness**: Design for different screen sizes
4. **Documentation**: Add panel descriptions for complex metrics
5. **Alerting**: Link panels to relevant alerts when possible

## 📚 References

- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/best-practices/)
- [Prometheus Query Examples](https://prometheus.io/docs/prometheus/latest/querying/examples/)
- [OFM Social OS Monitoring Strategy](../../../docs/MONITORING.md)