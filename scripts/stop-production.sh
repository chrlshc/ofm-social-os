#!/bin/bash
# Production shutdown script

echo "Stopping OFM Production Environment..."

# Gracefully stop all services
docker-compose -f docker-compose.production.yml stop

# Optional: Remove containers (uncomment if needed)
# docker-compose -f docker-compose.production.yml down

echo "Production environment stopped successfully!"