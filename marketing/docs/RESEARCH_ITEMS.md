# Deep Research Items - OFM Social OS

## Critical API Verifications Required

### 1. Instagram Graph API v23+
**Research needed:**
- Verify current version requirements for Reels and Stories publishing
- Confirm required permissions: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
- Check if Instagram Professional Account is required for all features
- Validate container creation fields for different media types

**Sources to verify:**
- Meta Developer Docs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
- Stack Overflow issues with v23: https://stackoverflow.com/questions/79676026/instagram-graph-api-unsupported-post-request-when-uploading-reels

**TODO:** Test container creation with actual FB App ID and verify webhook payload structure

### 2. TikTok Content Posting API
**Research needed:**
- Confirm access requirements (need business verification?)
- Verify webhook topics and payload formats
- Check file size limits for direct upload vs chunk upload (64MB threshold?)
- Validate status polling intervals to avoid rate limits

**Sources:**
- TikTok Developer Portal: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
- Content Posting API limits and quotas

**TODO:** Register for TikTok developer account and test sandbox environment

### 3. X (Twitter) API Pricing Tiers
**Research needed:**
- Current pricing for Basic ($100/month) vs Pro tiers
- Monthly post limits per tier
- Media upload size limits
- Confirm OAuth 2.0 PKCE flow implementation

**Sources:**
- X Developer Platform pricing: https://developer.x.com/en/portal/petition/essential/basic-info
- TechCrunch on API changes: https://techcrunch.com/2024/03/20/x-launches-top-up-packs-for-its-developer-api/

**TODO:** Calculate cost per creator based on posting frequency

### 4. Reddit API Rate Limits
**Research needed:**
- Confirm 100 QPM is per OAuth client_id (not per user)
- Verify if commercial use requires special agreement
- Check subreddit-specific posting limits
- Validate PRAW vs direct API performance

**Sources:**
- Reddit API Terms: https://www.reddit.com/wiki/api-terms
- PRAW Documentation: https://praw.readthedocs.io/en/stable/

**TODO:** Test rate limit headers in production environment

### 5. Multi-Agent Framework Selection
**Research needed:**
- Compare LangGraph vs CrewAI vs AutoGen for production stability
- Memory persistence options for agent state
- Cost analysis for different LLM backends
- Integration complexity with existing Node.js stack

**Sources:**
- LangGraph: https://www.langchain.com/langgraph
- CrewAI: https://docs.crewai.com/
- Microsoft AutoGen: https://microsoft.github.io/autogen/

**TODO:** Build proof-of-concept with each framework

### 6. Compliance and Platform Policies
**Research needed:**
- Instagram Private Reply API limitations (one message until user responds)
- TikTok community guidelines for automated posting
- X platform manipulation policy details
- Reddit self-promotion rules per subreddit

**Sources:**
- Meta Platform Policy: https://developers.facebook.com/docs/development/platform-policy/
- X Automation Rules: https://help.x.com/en/rules-and-policies/x-automation

**TODO:** Create compliance checklist for each platform

### 7. Infrastructure Considerations
**Research needed:**
- Optimal Redis configuration for BullMQ at scale
- PostgreSQL partitioning strategy for metrics table
- S3 storage costs for video variants
- CDN requirements for global distribution

**TODO:** Load test with 1000 concurrent creators

### 8. Security Research
**Research needed:**
- OAuth token encryption at rest
- Webhook signature verification for each platform
- Rate limiting strategy per creator to prevent abuse

**TODO:** Security audit checklist

### 9. FFmpeg Optimization
**Research needed:**
- Hardware acceleration options (NVENC, VideoToolbox)
- Optimal encoding settings for each platform
- Subtitle rendering performance at scale
- Storage vs compute tradeoffs

**TODO:** Benchmark FFmpeg variants generation time

### 10. Monitoring and Observability
**Research needed:**
- OpenTelemetry integration with BullMQ
- Metrics aggregation strategy for multi-tenant system
- Alert thresholds for platform API errors
- Creator-facing analytics requirements

**TODO:** Design monitoring dashboard

## Implementation Risks

1. **Platform API Changes**: All platforms frequently update their APIs. Need versioning strategy.
2. **Rate Limit Coordination**: Managing rate limits across multiple creator accounts on same platform.
3. **Content Moderation**: Automated systems may trigger platform spam detection.
4. **Cost Management**: LLM API costs could escalate with agent complexity.

## Next Steps

1. Set up developer accounts on all platforms
2. Create test content library with various formats
3. Build platform-specific API clients with extensive error handling
4. Implement comprehensive logging for API interactions
5. Design fallback strategies for platform outages