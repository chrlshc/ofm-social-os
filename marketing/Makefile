.PHONY: help install dev prod test clean docker-up docker-down migrate check logs

# Default target
help:
	@echo "OFM Marketing System - Available commands:"
	@echo ""
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Start development environment"
	@echo "  make prod         - Start production environment"
	@echo "  make test         - Run tests"
	@echo "  make clean        - Clean build artifacts and dependencies"
	@echo ""
	@echo "Docker commands:"
	@echo "  make docker-up    - Start all Docker services"
	@echo "  make docker-down  - Stop all Docker services"
	@echo "  make docker-reset - Reset Docker volumes (WARNING: deletes data)"
	@echo ""
	@echo "Database commands:"
	@echo "  make migrate      - Run database migrations"
	@echo "  make seed         - Seed database with test data"
	@echo "  make db-reset     - Reset database (WARNING: deletes data)"
	@echo ""
	@echo "Utility commands:"
	@echo "  make check        - Run system health checks"
	@echo "  make logs         - Tail application logs"
	@echo "  make format       - Format code with prettier"
	@echo "  make lint         - Run linter"

# Install dependencies
install:
	cd backend/api && npm install
	@echo "✅ Dependencies installed"

# Development environment
dev: docker-up
	@echo "Waiting for services to be ready..."
	@sleep 10
	cd backend/api && npm run migrate
	@echo "Starting API server and worker..."
	@tmux new-session -d -s ofm-api 'cd backend/api && npm run dev'
	@tmux new-session -d -s ofm-worker 'cd backend/api && npm run worker'
	@echo "✅ Development environment started"
	@echo "   API: http://localhost:3000"
	@echo "   Temporal UI: http://localhost:8233"
	@echo "   MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
	@echo ""
	@echo "To view logs: make logs"
	@echo "To stop: make docker-down"

# Production environment
prod:
	cd backend/api && npm run build
	cd backend/api && NODE_ENV=production npm start

# Run tests
test:
	cd backend/api && npm test
	cd backend/api && npm run test:e2e

# Clean build artifacts
clean:
	rm -rf backend/api/node_modules
	rm -rf backend/api/dist
	rm -rf backend/api/coverage
	find . -name "*.log" -delete
	@echo "✅ Cleaned build artifacts"

# Docker commands
docker-up:
	docker-compose up -d
	@echo "✅ Docker services started"

docker-down:
	docker-compose down
	@tmux kill-session -t ofm-api 2>/dev/null || true
	@tmux kill-session -t ofm-worker 2>/dev/null || true
	@echo "✅ Docker services stopped"

docker-reset:
	docker-compose down -v
	@echo "⚠️  Docker volumes deleted"

docker-logs:
	docker-compose logs -f

# Database commands
migrate:
	cd backend/api && npm run migrate
	@echo "✅ Migrations completed"

seed:
	cd backend/api && npx ts-node scripts/seed-profiles.ts
	@echo "✅ Database seeded"

db-reset:
	@echo "⚠️  This will delete all data. Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	docker-compose exec postgres psql -U ofm -d ofm_marketing -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	make migrate
	@echo "✅ Database reset"

# System check
check:
	cd backend/api && npx ts-node scripts/check-system.ts

check-verbose:
	cd backend/api && VERBOSE=true npx ts-node scripts/check-system.ts

# Logs
logs:
	@echo "Showing logs (Ctrl+C to exit)..."
	@tmux attach-session -t ofm-api 2>/dev/null || echo "API not running"
	@tmux attach-session -t ofm-worker 2>/dev/null || echo "Worker not running"

logs-api:
	tail -f backend/api/logs/combined.log

logs-error:
	tail -f backend/api/logs/error.log

# Code quality
format:
	cd backend/api && npm run format
	@echo "✅ Code formatted"

lint:
	cd backend/api && npm run lint
	@echo "✅ Linting completed"

typecheck:
	cd backend/api && npm run typecheck
	@echo "✅ Type checking completed"

# Scraper operations
scrape-test:
	cd backend/api && npx ts-node scripts/test-scraper.ts

scrape-profiles:
	curl -X POST http://localhost:3000/api/automation/scrape-and-train \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer YOUR_TOKEN" \
		-d '{"dryRun": false}'

# ML operations
train-model:
	curl -X POST http://localhost:3000/api/ml/train \
		-H "Authorization: Bearer YOUR_TOKEN"

# Quick setup for new developers
quickstart: install docker-up migrate seed
	@echo "✅ Quick setup completed!"
	@echo ""
	@echo "Next steps:"
	@echo "1. Copy .env.example to .env and configure"
	@echo "2. Run 'make dev' to start development"
	@echo "3. Run 'make check' to verify everything is working"