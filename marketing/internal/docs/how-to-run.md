# OFM Internal Operations API

Quick setup guide for running the OFM Internal Operations API locally.

## Prerequisites

- Node.js 18+ with pnpm
- PostgreSQL database with OFM schema
- OIDC provider (e.g., Auth0, Okta, Google Workspace)

## Environment Setup

1. Copy environment variables:
```bash
cp marketing/internal/api/.env.example marketing/internal/api/.env
```

2. Configure required environment variables:
```env
# API Configuration
PORT=4010
SESSION_SECRET=your-64-character-session-secret-here-minimum-32-chars

# OIDC Authentication
OIDC_ISSUER_URL=https://your-oidc-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:4010/oidc/callback

# Security Allowlists (optional)
ALLOWLIST_IPS=127.0.0.1,10.0.0.0/8,192.168.0.0/16
ALLOWLIST_ORGS=yourcompany.com,partner.com

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/ofm_social_os
```

## Database Setup

Run the audit and RBAC migration:
```bash
psql $DATABASE_URL -f marketing/internal/migrations/010_audit_and_rbac.sql
```

Add your admin role:
```sql
INSERT INTO rbac_roles (email, roles, created_by, notes) 
VALUES (
    'your-email@company.com', 
    ARRAY['admin'], 
    'setup', 
    'Initial admin user'
);
```

## Run the API

1. Install dependencies:
```bash
cd marketing/internal/api
pnpm install
```

2. Start in development mode:
```bash
pnpm dev
```

3. The API will start on http://localhost:4010

## Usage

1. Open browser to http://localhost:4010
2. Click "Login" to initiate OIDC flow
3. After authentication, you'll be redirected to /internal/status
4. Navigate to different sections based on your role:
   - **Viewer**: Can access /internal/status
   - **Operator**: Can access /internal/audit  
   - **Admin**: Can access /internal/ops

## API Testing

Import the Postman collection:
- File: `marketing/internal/postman/ofm-internal.postman_collection.json`
- Set BASE_URL variable to `http://localhost:4010`
- Authenticate via browser first, then use the session cookie

## OIDC Provider Setup

### Auth0 Example:
1. Create new Application (Regular Web Application)
2. Set Allowed Callback URLs: `http://localhost:4010/oidc/callback`
3. Set Allowed Logout URLs: `http://localhost:4010/login`
4. Add custom claims in Auth0 Action:
```javascript
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.user.app_metadata?.roles || ['viewer'];
  api.idToken.setCustomClaim('roles', roles);
};
```

### Google Workspace Example:
1. Create OAuth 2.0 Client ID in Google Cloud Console
2. Set Authorized redirect URI: `http://localhost:4010/oidc/callback`
3. Configure workspace domain in ALLOWLIST_ORGS

## Troubleshooting

### Database Connection Issues:
- Verify DATABASE_URL is correct
- Ensure PostgreSQL is running
- Check that migrations have been applied

### Authentication Issues:
- Verify OIDC provider configuration
- Check OIDC_* environment variables
- Ensure redirect URI matches exactly
- Check browser developer tools for CORS errors

### Role/Permission Issues:
- Verify user exists in rbac_roles table
- Check roles array contains expected values
- View audit logs to see authentication attempts

### IP Allowlist Issues:
- Check ALLOWLIST_IPS format (comma-separated CIDR)
- Verify your IP is included
- Use `curl -H "X-Forwarded-For: 127.0.0.1"` for testing

## Production Deployment

1. Set appropriate environment variables for production
2. Use a proper session store (Redis) instead of memory
3. Configure reverse proxy with HTTPS termination
4. Set up proper OIDC provider with production URLs
5. Configure IP allowlists for your infrastructure
6. Set up log aggregation for audit logs

## Security Notes

- Always use HTTPS in production
- Session secret should be cryptographically random
- IP allowlists should be as restrictive as possible
- OIDC client secrets must be kept secure
- Audit logs contain sensitive information - restrict access
- Consider mTLS for internal service communication