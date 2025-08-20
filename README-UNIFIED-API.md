# API Unifiée de Publication Sociale

## Vue d'ensemble

L'API unifiée centralise toute la logique de publication sur les réseaux sociaux avec :
- ✅ Gestion automatique des tokens (pré-refresh < 5 min)
- ✅ Observabilité structurée avec sanitization
- ✅ Retry/backoff automatique via pg-boss
- ✅ Support Reddit, Instagram (Reels), TikTok

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Routes API     │────▶│  API Unifiée     │────▶│ Platform        │
│  /publish-now   │     │  publishPost()   │     │ Adapters        │
│  /schedule      │     │                  │     │ - Reddit        │
└─────────────────┘     └──────────────────┘     │ - Instagram     │
         │                       │                │ - TikTok        │
         ▼                       ▼                └─────────────────┘
┌─────────────────┐     ┌──────────────────┐              │
│  pg-boss Jobs   │     │  OAuth Manager   │              ▼
│  post:execute   │     │  Token Refresh   │     ┌─────────────────┐
└─────────────────┘     └──────────────────┘     │ External APIs   │
                                                  └─────────────────┘
```

## Composants Principaux

### 1. API Unifiée (`src/server/social/publish.ts`)
Point d'entrée central qui :
- Route vers le bon adaptateur plateforme
- Gère les tokens via OAuth Manager
- Log tous les événements avec sanitization
- Retourne un format unifié

### 2. OAuth Manager (`src/server/oauth/manager.ts`)
- Vérifie l'expiration des tokens
- Refresh automatique si < 5 minutes
- Support des TTLs par plateforme :
  - Reddit : 1h (refresh permanent possible)
  - Instagram : 60j (long-lived token)
  - TikTok : 24h access / 365j refresh

### 3. Observabilité (`src/lib/observability.ts`)
- Logs JSON canoniques
- Sanitization automatique des secrets
- Métriques : success rate, latence p95, erreurs
- Correlation IDs pour traçabilité

### 4. Job Unifié (`src/server/jobs/post.ts`)
- Handler pg-boss pour `post:execute`
- Retry automatique (3x, backoff 30s)
- Idempotence via singletonKey
- Statuts : PENDING → RUNNING → SUCCEEDED/FAILED

## Configuration Requise

### Variables d'environnement
```env
# OAuth Reddit
REDDIT_USER_AGENT=ofm-social-os:v1.0.0 (by /u/username)
REDDIT_CLIENT_ID=xxx
REDDIT_CLIENT_SECRET=xxx

# OAuth Instagram
GRAPH_API_VERSION=v20.0
INSTAGRAM_APP_ID=xxx
INSTAGRAM_APP_SECRET=xxx

# OAuth TikTok
TIKTOK_CLIENT_KEY=xxx
TIKTOK_CLIENT_SECRET=xxx
```

### Contraintes Plateformes

#### Reddit
- User-Agent obligatoire (sinon 403)
- Rate limit : 60 req/min
- Headers surveillés : X-Ratelimit-*

#### Instagram (Reels)
- Graph API v20.0 obligatoire
- Workflow : Container → Poll FINISHED → Publish
- Contraintes vidéo : 9:16, 3s-15min, ≤1GB, MP4/MOV
- Quotas : ~25 posts/24h, 200 calls/h

#### TikTok
- Mode PULL_FROM_URL requis
- Domain verification dans dashboard
- Rate limits : ~6 req/min (init), 30 req/min (status)
- Sandbox = SELF_ONLY jusqu'à audit

## Utilisation

### Publication immédiate
```bash
curl -X POST http://localhost:3000/api/post/publish-now \
  -H 'Content-Type: application/json' \
  -d '{
    "owner_id": 1,
    "platform": "reddit",
    "caption": "Mon post",
    "platform_specific": {
      "subreddit": "test",
      "title": "Mon titre"
    }
  }'
```

### Planification
```bash
curl -X POST http://localhost:3000/api/post/schedule \
  -H 'Content-Type: application/json' \
  -d '{
    "owner_id": 1,
    "platform": "instagram",
    "caption": "Ma vidéo Reel",
    "media_url": "https://example.com/video.mp4",
    "scheduled_at": "2025-01-20T15:00:00Z"
  }'
```

### Métriques
```bash
curl http://localhost:3000/api/metrics?platform=reddit
```

Retourne :
```json
{
  "metrics": {
    "success_rate": "95.50%",
    "average_latency_ms": 1250,
    "p95_latency_ms": 3200,
    "retry_rate": "5.20%",
    "errors_by_code": {
      "RATE_LIMIT": 12,
      "AUTH_FAILED": 3
    },
    "posts_by_platform": {
      "reddit": 150,
      "instagram": 75,
      "tiktok": 50
    }
  }
}
```

## Tests

### Test unitaire de l'API
```bash
npx tsx scripts/test-unified-api.ts
```

### Test end-to-end
1. Démarrer l'API : `npm run dev`
2. Démarrer le worker : `npm run worker`
3. Publier un post test
4. Vérifier les logs et métriques

## Monitoring Production

### Logs structurés
Tous les événements sont loggés avec :
- `correlation_id` pour tracer une requête
- `latency_ms` pour la performance
- `retryable` pour les erreurs transitoires
- Sanitization automatique des secrets

### Alertes recommandées
- Success rate < 90%
- Latence p95 > 5s
- Erreurs AUTH_FAILED en hausse
- Rate limits approchés

## Déploiement

### API (Vercel)
```bash
vercel --prod
```

### Worker (EC2/Fly.io/Render)
```bash
# Dockerfile exemple
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --production
CMD ["npm", "run", "worker"]
```

### Base de données
- PostgreSQL 14+ avec schema `social_publisher`
- Contrainte unique sur `dedupe_key`
- Indexes sur `status`, `scheduled_at`

## Troubleshooting

### Token expiré
→ Le système refresh automatiquement, vérifier les logs OAuth

### Rate limit atteint
→ Backoff automatique, vérifier headers X-Ratelimit

### Post en échec
→ Consulter `/api/post/{id}/logs` pour le détail

### Métriques vides
→ Vérifier que des posts ont été traités récemment