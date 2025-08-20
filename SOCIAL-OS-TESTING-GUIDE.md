# 🧪 Guide de Test Complet - Social OS

## 1. Tests OAuth Reddit

### Configuration Reddit App
```bash
# 1. Créer une app sur Reddit
https://www.reddit.com/prefs/apps

# Configuration:
- Name: OFM Social Publisher
- Type: web app
- Description: Social media publishing platform
- About URL: https://your-domain.com
- Redirect URI: http://localhost:3000/api/social/auth/reddit/callback
```

### Test de connexion
```bash
# 1. Initier OAuth
curl -v "http://localhost:3000/api/social/auth/reddit?user_id=1"

# 2. Vérifier le compte connecté
curl "http://localhost:3000/api/social/accounts?user_id=1" | jq

# Response attendue:
{
  "success": true,
  "accounts": [{
    "id": 1,
    "platform": "reddit",
    "username": "your_reddit_user",
    "is_expired": false,
    "expires_at": "2025-01-21T..."
  }]
}
```

## 2. Tests de Publication

### Publication immédiate Reddit
```bash
# Test post texte
curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "platform": "reddit",
    "caption": "Ceci est un test de publication via l'\''API!",
    "platform_specific": {
      "subreddit": "test",
      "title": "Test API Post"
    }
  }' | jq

# Test post avec image
curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "platform": "reddit",
    "caption": "Test avec image",
    "media_url": "https://i.imgur.com/example.jpg",
    "platform_specific": {
      "subreddit": "test",
      "title": "Test Image Post"
    }
  }' | jq
```

### Publication planifiée
```bash
# Planifier pour dans 1 heure
SCHEDULED_TIME=$(date -u -v+1H '+%Y-%m-%dT%H:%M:%SZ')

curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": 1,
    \"platform\": \"reddit\",
    \"caption\": \"Post planifié pour $SCHEDULED_TIME\",
    \"scheduled_at\": \"$SCHEDULED_TIME\",
    \"platform_specific\": {
      \"subreddit\": \"test\",
      \"title\": \"Scheduled Post Test\"
    }
  }" | jq
```

### Vérifier l'historique
```bash
# Tous les posts
curl "http://localhost:3000/api/social/publish?user_id=1" | jq

# Posts en échec
curl "http://localhost:3000/api/social/publish?user_id=1&status=FAILED" | jq

# Posts planifiés
curl "http://localhost:3000/api/social/publish?user_id=1&status=PENDING" | jq
```

## 3. Tests Stripe Connect

### Créer compte Express
```bash
curl -X POST http://localhost:3000/api/stripe/connect \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "email": "test@example.com"
  }' | jq

# Response:
{
  "success": true,
  "onboarding_url": "https://connect.stripe.com/...",
  "account_id": "acct_...",
  "expires_at": 1234567890
}
```

### Vérifier statut
```bash
curl "http://localhost:3000/api/stripe/connect?user_id=1" | jq

# Response complète:
{
  "success": true,
  "has_account": true,
  "account_id": "acct_...",
  "onboarding_complete": true,
  "charges_enabled": true,
  "payouts_enabled": true
}
```

## 4. Tests Frontend

### Page de planification
```javascript
// Console browser pour tester
// 1. Ouvrir http://localhost:3000/schedule

// 2. Tester connexion compte
document.querySelector('[data-platform="reddit"]').click()

// 3. Tester publication
const form = {
  platform: 'reddit',
  subreddit: 'test',
  title: 'Test depuis UI',
  caption: 'Contenu du post',
  scheduled_at: null // ou date ISO pour planifier
}

// 4. Vérifier historique
// Les posts apparaissent automatiquement à droite
```

## 5. Tests de Performance

### Load testing
```bash
# Installer Apache Bench
apt-get install apache2-utils

# Test endpoint accounts
ab -n 100 -c 10 "http://localhost:3000/api/social/accounts?user_id=1"

# Test publication (attention rate limits!)
ab -n 10 -c 2 -p post_data.json -T application/json \
  "http://localhost:3000/api/social/publish"
```

### Monitoring Worker
```bash
# Logs worker
tail -f logs/worker.log | grep "job:complete"

# Métriques
curl "http://localhost:3000/api/metrics?platform=reddit" | jq
```

## 6. Tests de Sécurité

### Test CSRF Protection
```bash
# Tentative sans state cookie
curl -X GET "http://localhost:3000/api/social/auth/reddit/callback?code=fake"
# → Should return 400 Bad Request

# Test injection SQL
curl "http://localhost:3000/api/social/accounts?user_id=1'; DROP TABLE users;--"
# → Should be safely escaped
```

### Test encryption
```sql
-- Vérifier que les tokens sont chiffrés
SELECT 
  platform,
  substring(access_token, 1, 20) as token_preview,
  length(access_token) as token_length
FROM social_publisher.platform_accounts;
-- Les tokens doivent être > 100 chars (chiffrés)
```

## 7. Scénarios de Test Complets

### Scénario 1: Nouveau utilisateur
```bash
# 1. Créer compte Stripe
./test-stripe-onboarding.sh 1

# 2. Connecter Reddit
./test-reddit-oauth.sh 1

# 3. Publier premier post
./test-publish-immediate.sh 1

# 4. Planifier posts
./test-schedule-posts.sh 1
```

### Scénario 2: Token expiré
```sql
-- Forcer expiration
UPDATE social_publisher.platform_accounts 
SET expires_at = NOW() - INTERVAL '1 hour'
WHERE user_id = 1;

-- Tenter publication
-- Le système doit auto-refresh
```

### Scénario 3: Rate limiting
```bash
# Envoyer 100 requêtes rapidement
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/social/publish \
    -H "Content-Type: application/json" \
    -d '{"user_id": 1, "platform": "reddit", ...}' &
done

# Vérifier retry après 429
```

## 8. Checklist Pre-Production

- [ ] Variables d'environnement configurées
- [ ] SSL/HTTPS activé
- [ ] CORS configuré correctement
- [ ] Rate limiting en place
- [ ] Logs structurés actifs
- [ ] Monitoring configuré
- [ ] Backup database configuré
- [ ] Worker en mode production
- [ ] Tests automatisés passent
- [ ] Documentation à jour

## 9. Scripts de Test Automatisés

### test-all.sh
```bash
#!/bin/bash
set -e

echo "🧪 Running Social OS Tests..."

# 1. Health check
echo "✓ Testing API health..."
curl -f http://localhost:3000/api/health

# 2. OAuth flow
echo "✓ Testing OAuth..."
./test-oauth-reddit.sh

# 3. Publishing
echo "✓ Testing publishing..."
./test-publish-all.sh

# 4. Stripe
echo "✓ Testing Stripe..."
./test-stripe-connect.sh

echo "✅ All tests passed!"
```

## 10. Debugging

### Logs utiles
```bash
# Logs Next.js
npm run dev 2>&1 | tee app.log

# Logs Worker
node worker.js 2>&1 | tee worker.log

# Logs PostgreSQL
tail -f /var/log/postgresql/*.log

# Logs combinés
tail -f app.log worker.log | grep -E "(ERROR|WARN|job)"
```

### Requêtes SQL debug
```sql
-- Posts en échec récents
SELECT 
  sp.id,
  sp.platform,
  sp.status,
  sp.error_message,
  pl.details->>'error_code' as error_code,
  pl.created_at
FROM social_publisher.scheduled_posts sp
JOIN social_publisher.post_logs pl ON sp.id = pl.post_id
WHERE sp.status = 'FAILED'
  AND sp.created_at > NOW() - INTERVAL '1 hour'
ORDER BY sp.created_at DESC;

-- Tokens qui vont expirer
SELECT 
  pa.id,
  pa.platform,
  pa.username,
  pa.expires_at,
  pa.expires_at - NOW() as time_remaining
FROM social_publisher.platform_accounts pa
WHERE pa.expires_at < NOW() + INTERVAL '1 hour'
ORDER BY pa.expires_at;
```

---

**Tests prêts à l'emploi!** 🚀