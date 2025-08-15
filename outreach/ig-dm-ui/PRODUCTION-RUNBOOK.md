# 🚀 Production Runbook - DM Automation System

## ✅ Pre-Flight Checklist

### 1. Environment Check
```bash
# Verify accounts
npm run enhanced:accounts

# Initialize database
npm run enhanced:db-init

# Check environment variables
env | grep -E "(OPENAI|ANTHROPIC|DATABASE)" | wc -l  # Should be >= 1
```

### 2. Burn-in Test (48h with 10 accounts)
```bash
# Day 1: Small batch test
npm run enhanced:campaign -- --targets ./out/dm_todo_us.csv --max 60

# Simulate replies for backpressure testing
npm run enhanced:simulate -- --rate 0.08 --max 120

# Monitor live stats
npm run enhanced:live
# Open http://localhost:8088/stats/live
```

### 3. Handoff Validation
```bash
# Generate handoff report
npm run enhanced:handoff -- --only-responded --out ./out/handoff.csv

# Review with README-CLOSERS.md
```

## 📊 KPIs & Monitoring

### Key Metrics
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Global Reply Rate (30m) | 4-10% | >15% → Slow all |
| Per-Account Reply Rate | <15% | >15% → Slow account |
| Failed DMs/hour/account | <3 | >5 → Disable account |
| Time to Handoff (p50) | <40min | >60min → Alert closers |
| First Reply Time (p90) | <6h | >12h → Review messages |

### SQL Queries

#### Account Health (Last Hour)
```sql
SELECT account,
       COUNT(*) FILTER (WHERE sent_at > now() - interval '1 hour') AS sent_1h,
       SUM(CASE WHEN r.id IS NOT NULL AND r.reply_at > now() - interval '1 hour' THEN 1 ELSE 0 END) AS replied_1h,
       ROUND(100.0 * SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS reply_rate_pct
FROM dm_outreach_logs o
LEFT JOIN dm_replies r ON r.outreach_log_id = o.id
WHERE sent_at > now() - interval '1 hour'
GROUP BY account
ORDER BY sent_1h DESC;
```

#### Top Performing Templates (7 Days)
```sql
SELECT template_id,
       COUNT(*) AS sent,
       SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS replied,
       ROUND(100.0*SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),2) AS reply_rate_pct
FROM dm_outreach_logs o
LEFT JOIN dm_replies r ON r.outreach_log_id = o.id
WHERE o.sent_at > now() - interval '7 days'
  AND template_id IS NOT NULL
GROUP BY template_id
HAVING COUNT(*) >= 10  -- Min sample size
ORDER BY reply_rate_pct DESC;
```

#### Handoff SLA Performance
```sql
SELECT
  percentile_disc(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.reply_at - o.sent_at))/60) AS p50_minutes,
  percentile_disc(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.reply_at - o.sent_at))/60) AS p90_minutes,
  COUNT(*) as total_replies
FROM dm_replies r
JOIN dm_outreach_logs o ON o.id = r.outreach_log_id
WHERE r.reply_at > now() - interval '24 hours';
```

## 🛡️ Operational Guardrails

### 1. Timezone-Aware Sending
- **Send Window**: 9:00 AM - 9:00 PM local time
- **Implementation**: Add to scheduler check
```javascript
const hour = getLocalHour(prospect.tz || 'ET');
if (hour < 9 || hour > 21) return skip();
```

### 2. Hard Quotas
- **Hourly**: 25-30 DMs/account max
- **Daily**: 150-180 DMs/account max
- **Enforced**: Account manager already blocks when limits reached

### 3. Backpressure Rules
- **Global**: >10% replies → 2-4 min tempo
- **Per-Account**: >10% replies → 2-4 min for that account only
- **Recovery**: <4% replies → Return to fast tempo

## 📈 Scaling Plan

### Phase 1: Days 1-2 (10 accounts)
```bash
# 40-80 DMs/day total
npm run enhanced:campaign -- --max 80 --tempo normal
```

### Phase 2: Days 3-4 (25 accounts)
```bash
# 150-250 DMs/day total
npm run enhanced:campaign -- --max 200 --tempo fast
```

### Phase 3: Day 5+ (50 accounts)
```bash
# 300-500 DMs/day total
npm run enhanced:campaign -- --max 400 --tempo fast
```

**Scaling Rule**: Only increase if:
- Error rate < 2%
- Handoff SLA p50 < 40 min
- No account blocks in last 24h

## 🚨 Incident Response

### High Error Rate
1. Stop affected accounts: Comment out in config
2. Rotate proxy: Update proxy URL
3. Reduce tempo: `--tempo conservative`
4. Wait 30 min and retry

### AI Service Down
- Automatic fallback to templates (already implemented)
- Monitor `ai_failures_total` metric
- No action needed - system self-heals

### Database Down
- Local buffering active
- Exponential retry built-in
- Check connection: `psql $DATABASE_URL -c "SELECT 1"`

### Handoff Backlog
```bash
# Pause new sends
npm run enhanced:campaign -- --max 0 --dry-run

# Export current backlog
npm run enhanced:handoff -- --out ./out/urgent_handoff.csv

# Resume when p50 < 40 min
```

## 🔧 Quick Commands

### Daily Operations
```bash
# Morning check
npm run enhanced:accounts
npm run enhanced:db-stats

# Run campaign
npm run enhanced:campaign -- --max 200 --tempo fast --no-dry-run

# Afternoon handoff
npm run enhanced:handoff -- --only-replied

# Evening stats
curl http://localhost:8088/stats/live | jq .
```

### Testing & Debugging
```bash
# Test backpressure
npm run enhanced:simulate -- --rate 0.15 --max 100

# Test single message
npm run enhanced:test -- --username testuser --location Miami

# Check specific account
psql $DATABASE_URL -c "SELECT * FROM account_reply_stats WHERE account='model_account_1'"
```

## 🎯 Closer Playbook Tuning

### High Intent (latency < 15min + positive)
- Acknowledge quickly
- Closed question: "Want me to send the invite now?"
- Book within same timezone window

### Pricing Inquiries
- Never quote in DM
- Ask budget range first
- Share ROI example (no specific $)
- Move to call/email

### Timezone Optimization
- Use detected TZ in proposals
- "Later today after 5pm your time?"
- Respect local business hours

## 📋 Compliance Reminders

✅ **DO**:
- Keep first message pitch-free (enforced by code)
- Randomize send times ±15-45 seconds
- Use pre-engagement (2 likes before DM)
- Respect 24h Instagram window

❌ **DON'T**:
- Send outside 9am-9pm local
- Exceed 30 DMs/hour/account
- Retry failed DMs immediately
- Use banned terms in intros

## 🚀 Launch Sequence

1. **Final Pre-flight**: Run full checklist above
2. **Soft Launch**: 10 accounts, 2 days observation
3. **Scale Test**: 25 accounts, validate KPIs
4. **Full Deploy**: 50 accounts, monitor hourly
5. **Optimize**: A/B test messages weekly

---

**Support**: Post in #dm-automation-ops
**Monitoring**: http://localhost:8088/stats/live
**Backups**: Daily export to S3/GCS recommended

Last updated: {{current_date}}