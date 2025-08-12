# 🚀 Marketing Automation System - GitHub Update

## 📋 Overview

This update adds a comprehensive marketing automation system to the OFM platform with AI-powered content planning, social media intelligence, and automated scheduling.

## 🎯 Key Features Added

### 1. Content Planning & Scheduling
- **Weekly content calendar** generation with optimal posting times
- **Multi-platform support**: Instagram, TikTok, Twitter/X, Reddit  
- **Content repurposing**: Turn 3 pieces of content into 9+ posts
- **Approval workflows** with status tracking
- **Temporal-based scheduling** for reliable execution

### 2. Social Media Intelligence
- **Profile scraping** from top creators across platforms
- **Competitor analysis** with follower tracking
- **Automatic categorization** (fitness, lifestyle, adult content, etc.)
- **Performance metrics** collection

### 3. AI-Powered Strategy
- **ML clustering** for creator categorization
- **Personalized recommendations** based on profile analysis
- **Hashtag suggestions** by category
- **Optimal posting times** based on audience type

### 4. Automation Pipeline
- **Scheduled workflows** (daily/weekly scraping)
- **Automatic model retraining** as new data arrives
- **Prometheus metrics** for monitoring
- **Feature flags** for safe rollouts

## 📁 New Files Structure

```
marketing/backend/api/
├── src/
│   ├── models/
│   │   ├── ContentPlan.ts          # Content planning data model
│   │   └── TopProfile.ts           # Scraped profiles model
│   ├── services/
│   │   └── contentPlanning.ts      # Content plan generation logic
│   ├── scraper/
│   │   ├── types.ts                # Scraper interfaces
│   │   ├── instagram.ts            # Instagram scraper
│   │   ├── tiktok.ts              # TikTok scraper
│   │   ├── twitter.ts             # Twitter/X scraper
│   │   ├── reddit.ts              # Reddit scraper
│   │   └── index.ts               # Scraper orchestration
│   ├── ml/
│   │   ├── dataPrep.ts            # ML data preparation
│   │   ├── textVectorizer.ts      # TF-IDF & K-Means implementation
│   │   └── contentCategorizer.ts  # Model training & inference
│   ├── temporal/
│   │   ├── workflows/
│   │   │   ├── contentPublishing.ts # Content publishing workflow
│   │   │   └── scrapeAndTrain.ts   # Scraping & training workflow
│   │   ├── activities/
│   │   │   ├── contentPublishing.ts # Publishing activities
│   │   │   └── scrapeAndTrain.ts   # Scraping & training activities
│   │   ├── schedules.ts            # Scheduled workflow management
│   │   └── marketingClient.ts      # Temporal client wrapper
│   ├── routes/
│   │   ├── contentPlan.ts         # Content planning endpoints
│   │   ├── scraper.ts             # Scraper control endpoints
│   │   ├── ml.ts                  # ML/AI endpoints
│   │   └── automation.ts          # Automation control endpoints
│   ├── utils/
│   │   └── metrics.ts             # Prometheus metrics
│   └── index.ts                   # Updated main server file
├── migrations/
│   ├── 20240112_create_content_plans.js
│   └── 20240112_create_top_profiles.js
├── package.json                    # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
├── .env.example                   # Environment variables template
└── README.md                      # Documentation
```

## 🔧 Installation & Setup

### 1. Install Dependencies
```bash
cd marketing/backend/api
npm install
```

### 2. Environment Configuration
```bash
cp env.example .env
# Edit .env with your settings:
# - DATABASE_URL
# - TEMPORAL_ADDRESS
# - JWT_SECRET
# - ENABLE_AUTOMATION=true
# - SCRAPER_CRON="0 3 * * *"
```

### 3. Database Setup
```bash
# Run migrations
npm run migrate

# Optional: Seed with test data
npm run seed
```

### 4. Start Services
```bash
# Terminal 1: Start Temporal worker
npm run worker

# Terminal 2: Start API server
npm run dev
```

## 🔌 API Endpoints

### Content Planning
```bash
# Generate weekly content plan
POST /api/content-plan/generate
{
  "originalsPerWeek": 3,
  "platforms": ["instagram", "tiktok", "twitter"],
  "requireApproval": true
}

# Get content plan
GET /api/content-plan?week=2024-W03

# Approve content
PUT /api/content-plan/:id/approve
```

### Profile Scraping
```bash
# Trigger scraping
POST /api/scraper/scrape-profiles
{
  "platforms": {
    "instagram": ["username1", "username2"],
    "tiktok": ["creator1", "creator2"]
  }
}

# Get scraped profiles
GET /api/scraper/top-profiles?platform=instagram&minFollowers=10000
```

### AI/ML Operations
```bash
# Train model
POST /api/ml/train

# Get content strategy
POST /api/ml/suggest-strategy
{
  "bio": "Fitness coach and nutrition expert..."
}
```

### Automation Control
```bash
# Manual trigger
POST /api/automation/scrape-and-train

# Check schedule status
GET /api/automation/schedule/status

# Pause/Resume automation
POST /api/automation/schedule/pause
POST /api/automation/schedule/resume
```

## 📊 Monitoring

### Prometheus Metrics
Access metrics at `GET /metrics`:

- `ofm_scraper_runs_total` - Total scraper executions
- `ofm_scraper_profiles_scraped` - Profiles scraped by platform
- `ofm_model_training_runs_total` - Model training executions
- `ofm_content_plans_created` - Content plans generated

### Health Check
```bash
GET /health
```

## 🛡️ Security & Safety

1. **Rate Limiting**: Built-in delays between scraping requests
2. **Idempotency**: Duplicate workflow prevention via Temporal
3. **Feature Flags**: `ENABLE_AUTOMATION` environment variable
4. **Input Validation**: All endpoints validate inputs
5. **Error Handling**: Comprehensive error tracking and recovery

## 🚦 Configuration Options

### Environment Variables
- `ENABLE_AUTOMATION` - Enable/disable scheduled workflows
- `SCRAPER_CRON` - Cron expression for automation (default: "0 3 * * *")
- `SCRAPER_PROFILE_LIMITS` - JSON limits per platform
- `TWITTER_BEARER_TOKEN` - Optional Twitter API access

### Customization Points
1. **Target Profiles**: Edit `src/scraper/index.ts` → `getTargetProfiles()`
2. **Categories**: Modify `CATEGORY_KEYWORDS` in `contentCategorizer.ts`
3. **Posting Times**: Update `OPTIMAL_POSTING_TIMES` in `contentPlanning.ts`

## 🧪 Testing

```bash
# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## 📈 Performance Considerations

- **Scraping**: Limited to 1-2 second delays between requests
- **ML Training**: Handles up to 10,000 profiles efficiently
- **Content Planning**: Generates weekly plans in <1 second
- **Database**: Indexes on key query fields

## 🔄 Migration Guide

For existing installations:

1. Run database migrations
2. Configure environment variables
3. Test with `dryRun: true` mode
4. Enable automation gradually

## 🐛 Known Issues & TODOs

- [ ] Twitter scraping requires API token (limited without)
- [ ] Add support for YouTube and LinkedIn
- [ ] Implement content performance tracking
- [ ] Add A/B testing for posting times
- [ ] Create admin dashboard UI

## 📝 License

Proprietary - OFM Platform

---

## 💡 Next Steps

1. **Review** the implementation and adjust configuration
2. **Test** with a small set of profiles first
3. **Monitor** metrics and logs during initial runs
4. **Scale** by adding more profiles and platforms
5. **Iterate** on ML model with real performance data

For questions or improvements, please open an issue or submit a PR!