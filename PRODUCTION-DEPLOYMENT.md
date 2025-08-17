# Production Deployment Guide

## Prerequisites

1. **Domain Setup**
   - Main domain: yourdomain.com
   - API subdomain: api.yourdomain.com
   - Admin subdomain: admin.yourdomain.com

2. **SSL Certificates**
   ```bash
   # Install certbot
   sudo apt-get update
   sudo apt-get install certbot python3-certbot-nginx

   # Generate certificates
   sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
   sudo certbot certonly --standalone -d api.yourdomain.com
   sudo certbot certonly --standalone -d admin.yourdomain.com
   ```

3. **Environment Files Created**
   - ✅ `/site-web/.env`
   - ✅ `/marketing/backend/api/.env`
   - ✅ `/onboarding/.env`
   - ✅ `/payment/.env.production` (already existed)
   - ✅ `.env.production` (global)

## Security Keys Generated

- **Marketing API**:
  - MASTER_ENCRYPTION_KEY: `1ec27caa7eb1153e6f9ff9b960c21b72f12928965398abd8ac252c132f5eeef0`
  - WEBHOOK_SECRET: `59cdb1c9a5fcec9cafa357a1b1dafe7a4310df3d378bc6d6416d75438191b927`

- **Onboarding Service**:
  - FLASK_SECRET_KEY: `3848b87aaa40713f9b9647b4dc9a3bded088f0f0b6492e1367cf8fb6c11fd74e`
  - JWT_SECRET_KEY: `2351a0060bbbef9e23f1c810f36ba0ddb395cbe39b2d0a6cee19c962d18dc3d5`

## What Still Needs Configuration

### 1. Database Credentials
Replace in all .env files:
- PostgreSQL connection strings
- Database passwords

### 2. API Keys
Update in `/marketing/backend/api/.env`:
- Instagram API credentials
- TikTok API credentials
- X (Twitter) API credentials
- Reddit API credentials
- AWS S3 credentials

### 3. Stripe Keys
Update in `/payment/.env.production` and `/onboarding/.env`:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

### 4. Domain Names
Replace "yourdomain.com" in:
- nginx.conf
- All .env files
- docker-compose.production.yml

### 5. Email Configuration
Update in `/onboarding/.env`:
- SMTP settings
- Email credentials

## Deployment Steps

1. **Update all placeholders** in .env files with real values

2. **Create required directories**:
   ```bash
   mkdir -p ssl backups scripts init-scripts logs
   ```

3. **Generate htpasswd for admin area**:
   ```bash
   htpasswd -c .htpasswd admin
   ```

4. **Build and start services**:
   ```bash
   docker-compose -f docker-compose.production.yml up -d --build
   ```

5. **Initialize databases**:
   ```bash
   # Run migrations for each service
   docker-compose -f docker-compose.production.yml exec marketing-api npm run migrate
   docker-compose -f docker-compose.production.yml exec payment-api python -m flask db upgrade
   ```

6. **Setup SSL auto-renewal**:
   ```bash
   sudo crontab -e
   # Add: 0 0 * * * /usr/bin/certbot renew --quiet
   ```

## Monitoring

- Nginx: http://yourdomain.com
- Marketing API: http://api.yourdomain.com/marketing/health
- Payment API: http://api.yourdomain.com/payment/health
- Onboarding API: http://api.yourdomain.com/onboarding/health

## Backup Strategy

- Daily backups at midnight
- Weekly backups on Sundays
- Monthly backups on the 1st
- Retention: 7 days (daily), 30 days (weekly), 365 days (monthly)