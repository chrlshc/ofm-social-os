# OFM Social Publishing System

Système de publication automatisée sur les réseaux sociaux (Reddit, Instagram, TikTok).

## Installation rapide

### 1. Prérequis
- Node.js 20+
- PostgreSQL 14+
- Clé de chiffrement 32 octets

### 2. Configuration

```bash
# Copier et remplir le .env
cp .env.example .env

# Générer une clé de chiffrement
openssl rand -base64 32
```

### 3. Base de données

```bash
# Appliquer le schéma
psql "$DATABASE_URL_OFM_PRODUCTION" -f schema.sql
```

### 4. Installation des dépendances

```bash
npm install
```

### 5. Lancer en local

```bash
# Terminal 1 - API/UI
npm run dev

# Terminal 2 - Worker
npm run worker
```

## Tester l'API

### Health check
```bash
curl http://localhost:3000/api/health
```

### Publier immédiatement
```bash
curl -X POST http://localhost:3000/api/post/publish-now \
  -H 'Content-Type: application/json' \
  -d '{
    "owner_id": 1,
    "platform": "reddit",
    "caption": "Mon premier post!",
    "platform_specific": {
      "subreddit": "test",
      "title": "Test post"
    }
  }'
```

### Planifier un post
```bash
curl -X POST http://localhost:3000/api/post/schedule \
  -H 'Content-Type: application/json' \
  -d '{
    "owner_id": 1,
    "platform": "reddit",
    "caption": "Post planifié",
    "scheduled_at": "2025-01-20T15:00:00Z"
  }'
```

### Lister les posts
```bash
curl "http://localhost:3000/api/posts/list?owner_id=1"
```

### Voir les logs d'un post
```bash
curl "http://localhost:3000/api/post/123/logs"
```

## Seed un compte Reddit (test)

```bash
# Encrypter un token
export CRYPTO_MASTER_KEY="votre-clé-du-.env"
ENC=$(npx tsx scripts/encrypt-token.ts "FAKE_TOKEN_123")

# Insérer en DB
psql "$DATABASE_URL_OFM_PRODUCTION" -c "
INSERT INTO social_publisher.platform_accounts
(user_id, platform, username, external_id, scopes, access_token_encrypted)
VALUES (1, 'reddit', 'testuser', 'u_123', ARRAY['submit'], '$ENC');
"
```

## OAuth Reddit (production)

1. Créer une app sur https://www.reddit.com/prefs/apps
2. Ajouter dans .env:
   - REDDIT_CLIENT_ID
   - REDDIT_CLIENT_SECRET
3. Rediriger l'utilisateur vers `/api/auth/reddit/authorize?user_id=1`

## Déploiement

### API (Vercel)
```bash
vercel --prod
```

### Worker (autre hébergeur)
- Déployer `npm run worker` sur EC2, Fly.io, Render, etc.
- Mêmes variables d'environnement que l'API
- Ouvrir l'accès DB depuis l'IP du worker

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Next.js   │────▶│  PostgreSQL │◀────│   pg-boss    │
│  API & UI   │     │   + Jobs    │     │   Worker     │
└─────────────┘     └─────────────┘     └──────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │Platform APIs  │
                    │- Reddit       │
                    │- Instagram    │
                    │- TikTok       │
                    └───────────────┘
```

## Endpoints principaux

- `POST /api/post/publish-now` - Publier immédiatement
- `POST /api/post/schedule` - Planifier un post
- `GET /api/posts/list` - Lister les posts
- `GET /api/post/:id/logs` - Logs d'un post
- `GET /api/health` - Santé du système
- `GET /api/metrics` - Métriques d'observabilité

## Sécurité

- Tokens chiffrés avec AES-256-GCM
- IV unique par token
- Validation Zod sur toutes les entrées
- Déduplication des jobs
- Refresh token automatique (< 5 min avant expiration)
- Sanitization des logs (pas de secrets)

## Améliorations Production

### 1. Reddit
- User-Agent strict requis : `ofm-social-os:v1.0.0 (by /u/username)`
- Headers rate limit surveillés : `X-Ratelimit-*`
- Support complet OAuth avec refresh token

### 2. Instagram
- Graph API v20.0 (configurable via `GRAPH_API_VERSION`)
- Workflow : Container → Polling (FINISHED) → Publish
- Contraintes Reels : 9:16, 3s-15min, ≤1GB, MP4/MOV
- Quotas : ~25 posts/24h, 200 calls/h

### 3. TikTok
- Mode PULL_FROM_URL pour Direct Post
- Domain verification requise dans dashboard
- Rate limits : ~6 req/min (init), 30 req/min (status)
- Mode sandbox = SELF_ONLY jusqu'à audit

### 4. Observabilité
- Logs JSON canoniques avec métriques
- Endpoint `/api/metrics` pour monitoring
- Métriques : success rate, latence p95, retries, erreurs par code
- Correlation IDs pour traçabilité

### 5. Résilience
- Retry automatique : 3 tentatives, backoff exponentiel
- Refresh token automatique avant expiration
- Gestion des erreurs transitoires réseau