#!/bin/bash
# Production startup script

set -e

echo "Starting OFM Production Environment..."

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "ERROR: .env.production file not found!"
    echo "Please create .env.production with all required environment variables"
    exit 1
fi

# Export environment variables
export $(cat .env.production | grep -v '^#' | xargs)

# Check required environment variables
required_vars=(
    "POSTGRES_PASSWORD"
    "REDIS_PASSWORD"
    "DOMAIN"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "ERROR: Required environment variable $var is not set!"
        exit 1
    fi
done

# Create required directories
echo "Creating required directories..."
mkdir -p ssl backups logs init-scripts/migrations/{marketing,kpi,outreach,payment,onboarding}

# Copy migration files to init-scripts
echo "Preparing migration files..."
cp -r marketing/backend/api/migrations/* init-scripts/migrations/marketing/ 2>/dev/null || true
cp -r marketing/backend/database/migrations/* init-scripts/migrations/marketing/ 2>/dev/null || true
cp -r marketing/internal/migrations/* init-scripts/migrations/marketing/ 2>/dev/null || true
cp -r kpi/db/migrations/* init-scripts/migrations/kpi/ 2>/dev/null || true
cp -r outreach/ig-dm-ui/migrations/* init-scripts/migrations/outreach/ 2>/dev/null || true

# Check SSL certificates
if [ ! -f "ssl/live/$DOMAIN/fullchain.pem" ]; then
    echo "WARNING: SSL certificates not found at ssl/live/$DOMAIN/"
    echo "Please run: sudo certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN"
    echo "And copy certificates to ./ssl/"
fi

# Pull latest images
echo "Pulling Docker images..."
docker-compose -f docker-compose.production.yml pull

# Build custom images
echo "Building custom Docker images..."
docker-compose -f docker-compose.production.yml build

# Start infrastructure services first
echo "Starting infrastructure services..."
docker-compose -f docker-compose.production.yml up -d postgres redis

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker-compose -f docker-compose.production.yml exec -T postgres pg_isready -U $POSTGRES_USER; do
    echo "PostgreSQL is not ready yet..."
    sleep 2
done

# Run database initialization
echo "Initializing databases..."
docker-compose -f docker-compose.production.yml exec -T postgres psql -U $POSTGRES_USER -f /docker-entrypoint-initdb.d/01-create-databases.sql

# Start remaining services
echo "Starting all services..."
docker-compose -f docker-compose.production.yml up -d

# Wait for all services to be healthy
echo "Waiting for all services to be healthy..."
sleep 10

# Check service health
services=("frontend" "marketing-api" "payment-api" "onboarding-api")
for service in "${services[@]}"; do
    if docker-compose -f docker-compose.production.yml exec -T $service curl -f http://localhost:3000/health 2>/dev/null; then
        echo "✓ $service is healthy"
    else
        echo "✗ $service health check failed"
    fi
done

echo ""
echo "Production environment started successfully!"
echo ""
echo "Services available at:"
echo "  - Frontend: https://$DOMAIN"
echo "  - API: https://api.$DOMAIN"
echo "  - Admin: https://admin.$DOMAIN"
echo ""
echo "To view logs: docker-compose -f docker-compose.production.yml logs -f"
echo "To stop: docker-compose -f docker-compose.production.yml down"