# 🚀 Beta DM Automation System

Enhanced Instagram DM automation system designed for multi-account beta outreach campaigns with team collaboration features.

## 🌟 Key Features

### Multi-Account Management
- **Account Pool**: Manage multiple model accounts with rotation
- **Health Monitoring**: Track account performance and automatic suspension
- **Team Attribution**: Each account assigned to team members (Sarah, Emma, Mia, Sophia)
- **Daily Limits**: Conservative limits to avoid detection (10-50 DMs/day per account)

### Beta-Specific Messaging
- **20+ Templates**: Curated beta invitation messages in multiple languages
- **Smart Selection**: Time-based template selection (morning = earnings, evening = exclusive)
- **Personalization**: Dynamic username insertion and team member attribution
- **Follow-up Ready**: Response handling templates included

### Proxy Management
- **Proxy Rotation**: Automatic IP rotation per account
- **Health Monitoring**: Real-time proxy testing and failover
- **Geographic Distribution**: US-focused proxy locations
- **Performance Tracking**: Response time and success rate monitoring

### Campaign Coordination
- **Deduplication**: Prevent multiple accounts messaging same target
- **Rate Limiting**: Intelligent spacing between messages (2-5 minutes)
- **Progress Tracking**: Real-time campaign metrics and reporting
- **CSV Integration**: Direct integration with Apify discovery results

## 🛠️ Setup

### 1. Install Dependencies
```bash
cd outreach/ig-dm-ui
npm install
```

### 2. Configure Environment
```bash
# Copy example files
cp .env.example .env
cp config/accounts.example.json config/accounts.json
cp config/proxies.example.json config/proxies.json

# Edit .env with your credentials
APIFY_TOKEN=your_token_here
BETA_LINK=https://yourbeta.com/exclusive
```

### 3. Add Model Accounts
```bash
# Add first model account
npm run beta:setup -- --username model_sarah_01 --password yourpass \\
  --team Sarah --model "Sarah's VIP" --niche fitness

# Add more accounts
npm run beta:setup -- --username model_emma_01 --password yourpass \\
  --team Emma --model "Emma's Elite" --niche lifestyle
```

### 4. Configure Proxies
Edit `config/proxies.json` with your proxy provider details:
```json
{
  "proxies": [
    {
      "host": "proxy1.provider.com",
      "port": 8080,
      "username": "user",
      "password": "pass",
      "type": "residential",
      "location": "US-NY"
    }
  ]
}
```

## 🎯 Usage

### Generate US Targets
```bash
# Discover US creators via Apify
npm run apify:us
# Generates: ../../out/dm_todo_us.csv
```

### Test Messages
```bash
# Preview message templates
npm run beta:test
```

### Run Campaign
```bash
# Full US campaign (50 DMs max)
npm run beta:campaign -- --targets ../out/dm_todo_us.csv --max 50 --category exclusive

# Dry run (preview only)
npm run beta:campaign -- --dry-run --max 10

# Specific niche filter
npm run beta:campaign -- --niche fitness --max 25
```

### Monitor Status
```bash
# System overview
npm run beta:status
```

## 📊 Campaign Categories

### Message Categories
- **exclusive**: \"We're in beta with something exclusive...\"
- **earnings**: \"What if you could automate 80% of OF management...\"
- **peer**: \"[ModelName] suggested I reach out...\"
- **solution**: \"Tired of spending hours on admin?...\"
- **short**: Ultra-short, direct messages

### Time-Based Selection
- **Morning (9-12)**: Earnings-focused, direct approach
- **Afternoon (12-17)**: Peer recommendations, exclusive access
- **Evening (17-21)**: Short messages, friendly tone
- **Night**: Exclusive access, warm approach

## 🔒 Safety Features

### Account Protection
- Conservative daily limits (10-50 DMs based on account age)
- Automatic account suspension on repeated failures
- Health scoring system (0-100)
- Session management with cookie persistence

### Anti-Detection
- Human-like timing (2-5 minute gaps between DMs)
- Proxy rotation per account
- Network-synchronized sending (no arbitrary sleeps)
- Stealth browser configuration

### Rate Limiting
- Per-account hourly limits
- Global campaign coordination
- Adaptive pausing on errors
- Queue-based processing

## 📈 Monitoring & Analytics

### Real-Time Stats
```bash
npm run beta:status
```

Output includes:
- Account health and usage
- Proxy performance
- Campaign progress
- Team member attribution
- Success/failure rates

### Campaign Results
Each campaign generates:
- `campaign_xxx_results.csv`: Detailed per-message results
- `campaign_xxx_summary.json`: Campaign overview and stats

### Key Metrics
- **Success Rate**: % of successful DM sends
- **Response Rate**: % of targets that respond
- **Account Health**: Health scores per account
- **Proxy Performance**: Response times and success rates

## 🔧 Configuration

### Account Settings
```json
{
  "username": "model_account",
  "teamMember": "Sarah",
  "modelName": "Sarah's VIP",
  "niche": "fitness",
  "preferredLocation": "US",
  "proxyType": "residential"
}
```

### Campaign Options
- `maxDMs`: Maximum DMs per campaign (default: 50)
- `messageCategory`: Template category (default: 'exclusive')
- `timezone`: Target timezone for scheduling (ET/CT/MT/PT)
- `language`: Message language (en/fr/es)
- `accountNiche`: Filter accounts by niche

## 🚨 Troubleshooting

### Common Issues

**No available accounts**
- Check account status: `npm run beta:status`
- Verify daily limits haven't been exceeded
- Ensure accounts aren't suspended

**Proxy failures**
- Run proxy health check
- Update proxy configurations
- Check provider status

**Template errors**
- Verify `saas-closer-templates.json` exists
- Check template format and language codes

### Debug Mode
```bash
# Enable verbose logging
DEBUG=* npm run beta:campaign -- --dry-run
```

## 📝 Example Workflow

### Complete Beta Campaign
```bash
# 1. Discover targets
npm run apify:us

# 2. Preview campaign
npm run beta:campaign -- --dry-run --max 10

# 3. Run campaign
npm run beta:campaign -- --targets ../out/dm_todo_us.csv --max 100 --yes

# 4. Monitor progress
npm run beta:status

# 5. Check results
ls -la output/campaign_*
```

### Team Coordination
```bash
# Sarah's accounts only
npm run beta:campaign -- --team Sarah --max 25

# Fitness niche only
npm run beta:campaign -- --niche fitness --max 25

# Evening campaign (short messages)
npm run beta:campaign -- --category short --max 50
```

## 🔄 Maintenance

### Daily Tasks
- Reset daily limits: Automatic at midnight
- Health checks: Run proxy health check
- Review results: Check campaign outputs

### Weekly Tasks
- Account health review
- Template performance analysis
- Proxy provider evaluation
- Success rate optimization

---

**⚠️ Important**: This system is designed for legitimate beta outreach. Always comply with Instagram's Terms of Service and applicable laws.