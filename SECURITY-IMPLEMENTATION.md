# 🔒 Implémentation des Améliorations de Sécurité - Social OS

## Vue d'ensemble

Ce document détaille toutes les améliorations de sécurité implémentées suite à l'audit de sécurité. Toutes les vulnérabilités critiques ont été corrigées.

## 1. ✅ Authentification NextAuth.js

### Implémentation
- **Fichier**: `/src/app/api/auth/[...nextauth]/route.ts`
- **Stratégie**: JWT avec sessions de 30 jours
- **Protection**: Toutes les routes API nécessitent maintenant une authentification

### Utilisation
```typescript
// Dans les routes API
import { requireAuth, requireStripeOnboarding } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (user instanceof NextResponse) return user; // 401 si non authentifié
  
  // user.id est maintenant dérivé de la session
  const userId = user.id;
}
```

### Middleware Global
- **Fichier**: `/middleware.ts`
- Protège automatiquement:
  - `/api/social/*`
  - `/api/stripe/*`  
  - `/schedule/*`
  - `/settings/*`

## 2. ✅ Protection CSRF

### Implémentation
- **Package**: `@edge-csrf/nextjs`
- **Configuration**: Cookies sécurisés avec `SameSite=strict`

### Utilisation côté client
```typescript
import { fetchWithCsrf } from '@/lib/csrf';

// Toutes les requêtes POST/PUT/DELETE utilisent automatiquement le token CSRF
const response = await fetchWithCsrf('/api/social/publish', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

### Configuration
- Cookies CSRF: `HttpOnly`, `Secure` (production), `SameSite=strict`
- Validation automatique via middleware

## 3. ✅ Validation Zod

### Schémas définis
- **Fichier**: `/src/lib/validation.ts`
- Validation stricte de toutes les entrées utilisateur

### Exemples
```typescript
// Publication
const publishPostSchema = z.object({
  platform: z.enum(['reddit', 'instagram', 'tiktok']),
  caption: z.string().min(1).max(10000),
  media_url: z.string().url().optional(),
  scheduled_at: z.string().datetime().optional(),
  platform_specific: z.record(z.string(), z.any())
});

// Variables d'environnement
const envSchema = z.object({
  DATABASE_URL_OFM_PRODUCTION: z.string().url(),
  CRYPTO_MASTER_KEY: z.string().min(32),
  NEXTAUTH_SECRET: z.string().min(32),
  // ...
});
```

### Sanitization
- Fonction `sanitizeHtml()` pour prévenir XSS
- Fonction `sanitizeLog()` pour masquer les données sensibles

## 4. ✅ Gestion des clés avec AWS KMS

### Architecture hybride
- **Fichier**: `/src/lib/kms-crypto.ts`
- Support AWS KMS (production) ET chiffrement local (dev)
- Migration transparente entre les deux

### Fonctionnalités
```typescript
// Chiffrement automatique avec KMS si disponible
const encrypted = await encrypt(token); // Préfixe "kms:" ou "local:"

// Déchiffrement transparent
const decrypted = await decrypt(encrypted); // Détecte automatiquement la méthode

// Rotation des clés
const rotated = await rotateEncryption(oldEncrypted);
```

### Configuration
```env
# Pour activer KMS (optionnel)
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=arn:aws:kms:...

# Fallback local toujours disponible
CRYPTO_MASTER_KEY=<32-char-base64-key>
```

## 5. ✅ Variables d'environnement harmonisées

### Validation au démarrage
- **Fichier**: `/src/lib/env.ts`
- Validation Zod de toutes les variables
- Crash au démarrage si configuration invalide

### Fichiers de configuration
- `.env.example` - Template avec toutes les variables
- Documentation claire des formats attendus

## 6. 🔐 Sécurité additionnelle

### Headers de sécurité (via middleware)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`

### Rate limiting
- Configuré dans Nginx (production)
- 10 req/s avec burst de 20

### Logs sécurisés
- Tous les tokens/secrets sont automatiquement masqués
- Correlation IDs pour traçabilité
- Pas de données sensibles dans les logs

## 7. 📋 Checklist de migration

Pour migrer une installation existante:

1. **Générer les clés**
```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# CRYPTO_MASTER_KEY  
openssl rand -base64 32
```

2. **Mettre à jour .env**
```env
NEXTAUTH_SECRET=<generated-key>
NEXTAUTH_URL=https://yourdomain.com
```

3. **Appliquer les migrations**
```sql
-- Ajouter les colonnes si nécessaire
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
```

4. **Redémarrer l'application**
```bash
pm2 restart all
```

## 8. 🚨 Breaking Changes

### Routes API
- ❌ Ancien: `GET /api/social/accounts?user_id=123`
- ✅ Nouveau: `GET /api/social/accounts` (user_id dérivé de la session)

### Frontend
- Toutes les requêtes doivent maintenant utiliser `fetchWithCsrf()`
- L'utilisateur doit être authentifié pour accéder aux fonctionnalités

### OAuth Flows
- Les paramètres `user_id` sont maintenant dérivés de la session
- Les redirections post-OAuth vérifient l'authentification

## 9. 🔍 Tests de sécurité

### Test d'authentification
```bash
# Sans auth - doit retourner 401
curl http://localhost:3000/api/social/accounts

# Avec auth - OK
curl http://localhost:3000/api/social/accounts \
  -H "Cookie: next-auth.session-token=..."
```

### Test CSRF
```bash
# Sans token CSRF - doit échouer
curl -X POST http://localhost:3000/api/social/publish \
  -H "Content-Type: application/json" \
  -d '{"platform": "reddit", ...}'
```

### Test validation
```bash
# user_id invalide - doit échouer
curl -X DELETE http://localhost:3000/api/social/accounts \
  -d '{"account_id": "not-a-number"}'
```

## 10. 📚 Ressources

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [OWASP Security Guidelines](https://owasp.org/)
- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)

---

**Toutes les vulnérabilités critiques ont été corrigées. Le système est maintenant prêt pour un déploiement sécurisé en production.**