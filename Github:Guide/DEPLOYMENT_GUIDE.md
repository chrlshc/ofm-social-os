# 🚀 Deployment Guide - Marketing Automation System

## Prerequisites

- Node.js 18+ 
- PostgreSQL 13+
- Temporal Server
- Docker & Docker Compose (optional)
- Git

## Quick Start with Docker

```bash
# Clone the repository
git clone <your-repo-url>
cd marketing/backend/api

# Start all services
docker-compose up -d

# Run migrations
npm run migrate

# Seed test data (optional)
npx ts-node scripts/seed-profiles.ts

# Start the worker
npm run worker

# In another terminal, start the API
npm run dev
```

## Manual Installation

### 1. Install PostgreSQL

```bash
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Create database
createdb ofm_marketing
```

### 2. Install Temporal

```bash
# Using Docker (recommended)
docker run --name temporal -p 7233:7233 temporalio/auto-setup:latest

# Or download binary
curl -sSf https://temporal.download/cli.sh | sh
temporal server start-dev
```

### 3. Configure Environment

```bash
cd marketing/backend/api
cp env.example .env

# Edit .env file
nano .env
```

Required environment variables:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/ofm_marketing
TEMPORAL_ADDRESS=localhost:7233
JWT_SECRET=your-secure-secret-key
ENABLE_AUTOMATION=true
```

### 4. Install Dependencies & Setup

```bash
# Install Node dependencies
npm install

# Run database migrations
npm run migrate

# Optional: Seed test data
npx ts-node scripts/seed-profiles.ts

# Build TypeScript
npm run build
```

### 5. Start Services

```bash
# Terminal 1: Start Temporal worker
npm run worker

# Terminal 2: Start API server
npm start

# Or for development with hot reload
npm run dev
```

## Production Deployment

### 1. Environment Setup

```bash
# Production .env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/ofm_marketing
TEMPORAL_ADDRESS=temporal.production.com:7233
TEMPORAL_TLS=true
JWT_SECRET=<strong-secret>
ENABLE_AUTOMATION=true
LOG_LEVEL=info
```

### 2. Database Migrations

```bash
# Run migrations in production
NODE_ENV=production npm run migrate

# Verify migrations
psql $DATABASE_URL -c "SELECT * FROM SequelizeMeta;"
```

### 3. Build & Deploy

```bash
# Build the application
npm run build

# Copy files to server
rsync -avz --exclude node_modules --exclude .git . user@server:/app/

# On server
cd /app
npm ci --production
```

### 4. Process Management (PM2)

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'ofm-api',
      script: './dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'ofm-worker',
      script: './dist/temporal/worker.js',
      instances: 1,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

# Start services
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /metrics {
        allow 10.0.0.0/8;  # Internal network only
        deny all;
        proxy_pass http://localhost:3000/metrics;
    }
}
```

### 6. SSL with Certbot

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Monitoring Setup

### 1. Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'ofm-marketing'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### 2. Grafana Dashboard

Import the dashboard JSON from `monitoring/grafana-dashboard.json` or create alerts for:

- Scraper failure rate > 10%
- Model training duration > 5 minutes
- API response time p95 > 500ms
- Temporal workflow failures

### 3. Health Checks

```bash
# API health
curl http://localhost:3000/health

# Temporal health
curl http://localhost:8233/health

# Schedule status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/automation/schedule/status
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check PostgreSQL is running
   sudo systemctl status postgresql
   
   # Check connection
   psql $DATABASE_URL -c "SELECT 1"
   ```

2. **Temporal Connection Failed**
   ```bash
   # Check Temporal is running
   docker ps | grep temporal
   
   # Test connection
   temporal operator namespace list
   ```

3. **Scraper Rate Limited**
   - Increase delays in scraper configuration
   - Use proxy rotation (advanced)
   - Reduce concurrent scraping

4. **Model Training Fails**
   ```bash
   # Check data availability
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM top_profiles WHERE bio IS NOT NULL"
   
   # Need at least 10 profiles with bios
   ```

### Logs

```bash
# View API logs
pm2 logs ofm-api

# View worker logs
pm2 logs ofm-worker

# View all logs
tail -f logs/combined.log

# View error logs only
tail -f logs/error.log
```

## Maintenance

### Daily Tasks
- Monitor error logs
- Check scraper success rate
- Verify scheduled workflows running

### Weekly Tasks
- Review model performance
- Update scraping targets
- Check disk space for logs

### Monthly Tasks
- Update dependencies
- Review and optimize database
- Audit security settings

## Rollback Procedure

```bash
# 1. Stop services
pm2 stop all

# 2. Restore previous version
cd /app
git checkout <previous-version>

# 3. Rollback database if needed
npm run migrate:undo

# 4. Restart services
pm2 restart all
```

## Security Checklist

- [ ] Strong JWT_SECRET configured
- [ ] Database uses SSL connection
- [ ] Temporal TLS enabled in production
- [ ] API rate limiting implemented
- [ ] CORS properly configured
- [ ] Sensitive endpoints require authentication
- [ ] Logs don't contain sensitive data
- [ ] Regular security updates applied

## Support

For issues or questions:
1. Check logs first
2. Review error messages
3. Consult documentation
4. Open GitHub issue with details