# Vercel Environment Variables Setup for charles@huntaze.com

Add these environment variables in your Vercel project settings:

## Required Variables

```bash
# Database (from AWS RDS)
DATABASE_URL_OFM_PRODUCTION=your-aws-rds-url
DATABASE_URL_OFM_MARKETING=your-aws-rds-url
DATABASE_URL_OFM_PAYMENT=your-aws-rds-url
DATABASE_URL_OFM_ONBOARDING=your-aws-rds-url
DATABASE_URL_OFM_KPI=your-aws-rds-url
DATABASE_URL_OFM_SITE=your-aws-rds-url

# Security
CRYPTO_MASTER_KEY=generate-with-openssl-rand-base64-32
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=https://app.huntaze.com

# Email Configuration
SES_FROM_EMAIL=charles@huntaze.com
ADMIN_EMAIL=charles@huntaze.com
SUPPORT_EMAIL=charles@huntaze.com
DEFAULT_ADMIN_USER=charles@huntaze.com

# OAuth - Reddit
REDDIT_CLIENT_ID=your-reddit-client-id
REDDIT_CLIENT_SECRET=your-reddit-client-secret
REDDIT_USER_AGENT=Huntaze/1.0 by charles@huntaze.com
REDDIT_REDIRECT_URI=https://app.huntaze.com/api/social/auth/reddit/callback

# OAuth - Instagram
INSTAGRAM_CLIENT_ID=your-instagram-client-id
INSTAGRAM_CLIENT_SECRET=your-instagram-client-secret

# OAuth - TikTok
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret

# Stripe
STRIPE_SECRET_KEY=sk_live_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-secret

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_KMS_KEY_ID=your-kms-key-id (optional)

# App URL
NEXT_PUBLIC_URL=https://app.huntaze.com
```

## Steps to Configure

1. Go to: https://vercel.com/chrlshcs-projects/ofm-social-os/settings/environment-variables
2. Add each variable above
3. Make sure to add them for "Production", "Preview", and "Development" environments
4. Save changes

## AWS SES Setup for charles@huntaze.com

1. Verify charles@huntaze.com in AWS SES:
   ```bash
   aws ses verify-email-identity --email-address charles@huntaze.com
   ```

2. Verify the huntaze.com domain:
   ```bash
   aws ses verify-domain-identity --domain huntaze.com
   ```

3. Move out of sandbox (for production):
   - Submit request to AWS to move SES out of sandbox
   - Reference charles@huntaze.com as the primary sending address

## OAuth Apps Configuration

### Reddit App
- Create at: https://www.reddit.com/prefs/apps
- Redirect URI: https://app.huntaze.com/api/social/auth/reddit/callback
- Contact: charles@huntaze.com

### Instagram App
- Create at: https://developers.facebook.com/
- Add Instagram Basic Display
- Redirect URI: https://app.huntaze.com/api/social/auth/instagram/callback
- Contact: charles@huntaze.com

### TikTok App
- Create at: https://developers.tiktok.com/
- Redirect URI: https://app.huntaze.com/api/social/auth/tiktok/callback
- Contact: charles@huntaze.com