# Domain Configuration for Huntaze

## Current Architecture

You have two separate applications:

1. **Main Website** (site-web/)
   - Landing page
   - Pre-login content
   - Currently on: huntaze.com

2. **Dashboard/Social OS** (main app)
   - Post-login dashboard
   - Social media management
   - Currently on: ofm-social-*.vercel.app

## Recommended Setup

### Option A: Subdomain (Easiest)
```
huntaze.com         → Main website (site-web)
app.huntaze.com     → Dashboard (this app)
```

### Option B: Path-based routing
```
huntaze.com/        → Main website
huntaze.com/dashboard → Dashboard app
```

### Option C: Unified deployment
Merge both apps into one Next.js application

## How to Configure Subdomain

1. In Vercel Dashboard:
   - Go to your `ofm-social-os` project
   - Settings → Domains
   - Add `app.huntaze.com`

2. In your DNS provider:
   - Add CNAME record:
   ```
   app.huntaze.com → cname.vercel-dns.com
   ```

3. Update OAuth redirect URIs:
   - Reddit: https://app.huntaze.com/api/social/auth/reddit/callback
   - Instagram: https://app.huntaze.com/api/social/auth/instagram/callback
   - TikTok: https://app.huntaze.com/api/social/auth/tiktok/callback

4. Update environment variables in Vercel:
   ```
   NEXT_PUBLIC_URL=https://app.huntaze.com
   NEXTAUTH_URL=https://app.huntaze.com
   ```

## Current Issue

The main website (huntaze.com) and dashboard are separate deployments. Users need to navigate between:
- huntaze.com (landing page)
- app.huntaze.com (dashboard after login)

This is a common pattern used by many SaaS platforms.