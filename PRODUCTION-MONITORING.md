# 📊 Guide de Monitoring Production - Social OS

## Métriques Critiques de Sécurité

### 1. Dashboard Temps Réel

```typescript
// API endpoint: GET /api/admin/security-metrics
{
  "authSuccessRate": 99.8,      // Target: > 99.5%
  "csrfBlockRate": 0.05,        // Target: < 0.1%
  "kmsFailoverRate": 0.2,       // Target: < 1.0%
  "avgSessionDuration": 120,     // Minutes (alert if > 480)
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### 2. Alertes Automatiques

```yaml
# prometheus-alerts.yml
groups:
  - name: social_os_security
    rules:
      - alert: LowAuthSuccessRate
        expr: auth_success_rate < 99.5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Auth success rate below threshold"
          
      - alert: HighCSRFBlocks
        expr: csrf_block_rate > 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Potential CSRF false positives"
          
      - alert: KMSFailoverHigh
        expr: kms_failover_rate > 1.0
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "AWS KMS experiencing issues"
```

### 3. Grafana Dashboard Config

```json
{
  "dashboard": {
    "title": "Social OS Security Metrics",
    "panels": [
      {
        "title": "Auth Success Rate",
        "targets": [{
          "expr": "auth_success_rate",
          "legendFormat": "Success %"
        }],
        "alert": {
          "conditions": [{
            "evaluator": {
              "params": [99.5],
              "type": "lt"
            }
          }]
        }
      },
      {
        "title": "JWT Size Distribution",
        "targets": [{
          "expr": "histogram_quantile(0.95, jwt_size_bytes_bucket)",
          "legendFormat": "95th percentile"
        }]
      }
    ]
  }
}
```

## Tests de Sécurité CI/CD

### GitHub Actions Workflow

```yaml
name: Security Audit
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm ci
        
      - name: Run security tests
        run: npm run test:security
        
      - name: Dependency audit
        run: npm audit --audit-level=high
        
      - name: OWASP ZAP scan
        uses: zaproxy/action-full-scan@v0.4.0
        with:
          target: 'http://localhost:3000'
          
      - name: Check JWT sizes
        run: npm run test:jwt-size
```

### Script de Test Automatisé

```bash
#!/bin/bash
# security-check.sh

echo "🔒 Running Security Tests..."

# 1. Injection tests
echo "Testing SQL injection protection..."
curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -d '{"platform": "reddit'\'' OR 1=1--", "caption": "test"}' \
  | grep -q "Validation failed" || exit 1

# 2. CSRF tests
echo "Testing CSRF protection..."
curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=valid" \
  --no-include \
  | grep -q "Invalid CSRF token" || exit 1

# 3. Auth bypass tests
echo "Testing authentication..."
curl http://localhost:3000/api/social/accounts \
  | grep -q "Authentication required" || exit 1

echo "✅ All security tests passed!"
```

## Graceful Degradation KMS

### Implementation surveillée

```typescript
// src/lib/kms-crypto.ts (extrait amélioré)
import { log } from '@/lib/observability';

export async function encrypt(plaintext: string): Promise<string> {
  if (useKMS) {
    try {
      const result = await kmsEncrypt(plaintext);
      log('debug', 'KMS encryption successful');
      return `kms:${result}`;
    } catch (error) {
      log('warn', 'KMS unavailable, using local fallback', {
        error: error.message,
        metric: 'kms_fallback'
      });
      // Fallback automatique
    }
  }
  
  // Local encryption
  const result = await localEncrypt(plaintext);
  log('debug', 'Local encryption used');
  return `local:${result}`;
}
```

## Optimisations Edge Runtime

### Limites à surveiller

```typescript
// middleware.ts optimisé
export const config = {
  matcher: [
    '/api/social/:path*',
    '/api/stripe/:path*',
    '/schedule/:path*',
    '/settings/:path*'
  ],
  // Éviter les regex complexes qui augmentent le bundle
  // Pas de imports de libs lourdes (> 1MB total)
}

// Monitoring du bundle size
// next.config.js
module.exports = {
  experimental: {
    middlewareSizeLimit: '1mb'
  }
}
```

## Session Update Pattern

### Refresh JWT sans re-login

```typescript
// src/app/api/auth/refresh/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '../[...nextauth]/route';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No session' }, { status: 401 });
  
  // Fetch updated user data
  const user = await getUserById(session.user.id);
  
  // Force session update by triggering new sign-in
  return NextResponse.json({
    callbackUrl: `/api/auth/signin?callbackUrl=${request.nextUrl.pathname}`
  });
}
```

## Checklist Hebdomadaire

- [ ] Vérifier auth success rate > 99.5%
- [ ] Analyser les CSRF blocks pour false positives
- [ ] Contrôler la taille moyenne des JWT
- [ ] Vérifier les logs KMS failover
- [ ] Auditer les nouvelles dépendances
- [ ] Revoir les sessions anormalement longues
- [ ] Tester le fallback KMS→Local
- [ ] Valider les alertes Prometheus

---

**Monitoring configuré = Sécurité maintenue** 🛡️