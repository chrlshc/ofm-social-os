# OFM Social API

AI Agent-Based Social Media Publisher API with multi-platform support.

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Set up environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Run health check**:
```bash
npm run doctor
```

4. **Start development server**:
```bash
npm run dev
```

## Environment Setup

### Required Environment Variables

```bash
# Database & Cache
DATABASE_URL=postgresql://postgres:password@localhost:5432/ofm_social
REDIS_URL=redis://localhost:6379

# Platform APIs
INSTAGRAM_CLIENT_ID=your-instagram-client-id
INSTAGRAM_CLIENT_SECRET=your-instagram-client-secret
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret
X_API_KEY=your-x-api-key
X_API_SECRET=your-x-api-secret
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret
```

### Optional Environment Variables

```bash
# LLM Providers
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here

# AWS Storage
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
S3_BUCKET=your-assets-bucket

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Runtime
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
```

## Database Setup

1. **Run migrations**:
```bash
npm run migrate
```

This will run all SQL migrations in the correct order:
- `002_temporal_migration.sql`
- `003_llm_budgets.sql` 
- `004_bootstrap_runtime.sql`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:e2e` - Run E2E tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run type-check` - Check TypeScript types
- `npm run migrate` - Run database migrations
- `npm run doctor` - Run environment health check

## API Endpoints

### Authentication
- `POST /api/auth/:platform/start` - Start OAuth flow
- `GET /api/auth/:platform/callback` - OAuth callback
- `POST /api/auth/:platform/refresh` - Refresh tokens

### Publishing
- `POST /api/publish` - Publish content to platforms
- `GET /api/publish/:postId` - Get post status

### LLM Budget
- `GET /api/llm-budget/:creatorId/status` - Get budget status
- `POST /api/llm-budget/:creatorId/reserve` - Reserve budget
- `POST /api/llm-budget/:creatorId/usage` - Record usage

### Health Check
- `GET /health` - Service health status

## Architecture

### Core Components

1. **Environment Configuration** (`src/lib/env.ts`)
   - Validates all environment variables with Zod
   - Provides type-safe configuration

2. **Database Layer** (`src/lib/db.ts`)
   - PostgreSQL connection pool
   - Query logging and error handling

3. **Redis Cache** (`src/lib/redis.ts`)
   - Connection management
   - Utility functions for common operations

4. **Logging** (`src/lib/logger.ts`)
   - Structured logging with Pino
   - Component-specific child loggers

5. **Observability** (`src/lib/otel.ts`)
   - OpenTelemetry instrumentation
   - Custom metrics and tracing

### Platform Publishers

Each platform has a dedicated publisher class:

- **Instagram** (`src/lib/platforms/instagram/`)
  - Graph API integration
  - Business account support
  - Private reply functionality

- **TikTok** (`src/lib/platforms/tiktok/`)
  - Content Posting API
  - Rate limiting (6 req/min)
  - UTF-16 character counting

- **X (Twitter)** (`src/lib/platforms/x/`)
  - API v2 OAuth 2.0
  - Premium account detection
  - Character limits (280/25k)

- **Reddit** (`src/lib/platforms/reddit/`)
  - OAuth 2.0 integration
  - PRAW-compatible endpoints

### OAuth Implementation

Each platform supports:
- Authorization URL generation
- Code exchange for tokens
- Token refresh
- User info retrieval
- Account persistence

### LLM Budget System

Features:
- Cost estimation with up-to-date pricing
- Budget reservations with TTL
- Usage tracking and analytics
- Hard/soft limits
- Multi-provider support (OpenAI, Anthropic, etc.)

## Testing

### Unit Tests
```bash
npm test
```

Tests cover:
- Environment validation
- LLM budget calculations
- Platform publisher logic
- OAuth flows (mocked)

### Integration Tests
```bash
npm run test:e2e
```

### Test Database
Set `TEST_DATABASE_URL` environment variable for test isolation.

## Deployment

### Docker
```bash
# Build image
docker build -t ofm-social-api .

# Run container
docker run -p 3000:3000 --env-file .env ofm-social-api
```

### Health Monitoring
The `/health` endpoint checks:
- Database connectivity
- Redis connectivity
- Service status

Returns:
- `200` if healthy
- `503` if unhealthy with error details

## Security

- Environment variable validation
- Database connection pooling
- Redis connection security
- No secrets in logs
- Row-level security (RLS) in database
- OAuth token encryption
- Request/response logging

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Check `DATABASE_URL` format
   - Ensure PostgreSQL is running
   - Verify credentials and network access

2. **Redis connection failed**
   - Check `REDIS_URL` format
   - Ensure Redis is running
   - Verify network connectivity

3. **Platform API errors**
   - Verify API keys are valid
   - Check rate limits
   - Review platform-specific documentation

4. **Migration errors**
   - Check database permissions
   - Ensure migrations run in order
   - Review migration logs

### Debug Mode
Set `LOG_LEVEL=debug` for detailed logging.

### Environment Doctor
Run `npm run doctor` to validate your environment setup.

## Contributing

1. Follow TypeScript strict mode
2. Add tests for new features
3. Use conventional commit messages
4. Update documentation
5. Run linter before commit

## License

MIT License - see [LICENSE](../../LICENSE) for details.