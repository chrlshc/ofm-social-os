# Marketing Automation System

Advanced content planning and social media intelligence system for OFM platform.

## Features

### 1. Weekly Content Planning & Scheduling
- Multi-platform content calendar (Instagram, TikTok, Twitter, Reddit)
- Optimal posting time recommendations
- Content repurposing automation
- Approval workflows
- Temporal-based scheduling for reliable execution

### 2. Social Profile Intelligence
- Multi-platform profile scraping
- Competitor analysis
- Profile categorization (fitness, lifestyle, adult content, etc.)
- Follower growth tracking

### 3. AI-Powered Content Strategy
- Automatic creator categorization using ML
- Content strategy recommendations
- Hashtag suggestions
- Posting time optimization

### 4. Automated Pipeline
- Daily/weekly scraping schedules
- Automatic model retraining
- Canary deployments with SLO monitoring
- Prometheus metrics integration

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Express API   │────▶│    Temporal     │────▶│   PostgreSQL    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Content Plan   │     │  Scraper Jobs   │     │   ML Training   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Setup environment variables:
```bash
cp env.example .env
# Edit .env with your configuration
```

3. Run database migrations:
```bash
npm run migrate
```

4. Start Temporal worker:
```bash
npm run worker
```

5. Start API server:
```bash
npm run dev
```

## API Endpoints

### Content Planning
- `POST /api/content-plan/generate` - Generate weekly content plan
- `GET /api/content-plan` - Get content plan for week
- `PUT /api/content-plan/:id/approve` - Approve content item

### Profile Scraping
- `POST /api/scraper/scrape-profiles` - Trigger profile scraping
- `GET /api/scraper/top-profiles` - Get scraped profiles
- `GET /api/scraper/top-profiles/stats` - Get profile statistics

### ML/AI
- `POST /api/ml/train` - Train categorization model
- `POST /api/ml/suggest-strategy` - Get content strategy suggestions
- `GET /api/ml/categories` - Get all categories
- `GET /api/ml/model-status` - Get model status

### Automation
- `POST /api/automation/scrape-and-train` - Manual trigger full pipeline
- `GET /api/automation/schedule/status` - Get schedule status
- `POST /api/automation/schedule/pause` - Pause automation
- `POST /api/automation/schedule/resume` - Resume automation

## Configuration

### Environment Variables

- `ENABLE_AUTOMATION` - Enable/disable scheduled workflows (default: true)
- `SCRAPER_CRON` - Cron expression for scraping (default: "0 3 * * *" - 3 AM daily)
- `SCRAPER_PROFILE_LIMITS` - JSON object to limit profiles per platform
- `TWITTER_BEARER_TOKEN` - Twitter API token (optional)

### Scraper Targets

Edit `src/scraper/index.ts` `getTargetProfiles()` to configure which profiles to scrape.

### ML Configuration

The system automatically determines the number of clusters (5-10) based on data volume.

## Monitoring

### Metrics

Prometheus metrics available at `/metrics`:

- `ofm_scraper_runs_total` - Total scraper runs
- `ofm_scraper_profiles_scraped` - Profiles scraped by platform
- `ofm_scraper_duration_seconds` - Scraper run duration
- `ofm_model_training_runs_total` - Model training runs
- `ofm_content_plans_created` - Content plans created

### Logging

Structured logging with levels:
- `error` - Errors requiring attention
- `warn` - Warnings
- `info` - General information
- `debug` - Detailed debugging

## Safety Features

1. **Rate Limiting**: Automatic delays between scraping requests
2. **Idempotency**: Duplicate workflow prevention
3. **Feature Flags**: Easy disabling of automation
4. **Canary Deployments**: Gradual rollout with monitoring
5. **Data Validation**: Input validation on all endpoints

## Development

### Running Tests
```bash
npm test
```

### Code Style
```bash
npm run lint
npm run format
```

### Type Checking
```bash
npm run typecheck
```

## Production Deployment

1. Use proper database migrations
2. Configure Temporal for high availability
3. Enable TLS for Temporal connection
4. Use environment-specific configuration
5. Monitor SLOs and error rates
6. Implement proper backup strategies

## License

Proprietary - OFM Platform