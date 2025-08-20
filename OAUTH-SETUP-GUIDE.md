# 🔐 Guide Configuration OAuth - Reddit, Instagram, TikTok

## 1. Reddit OAuth Setup

### Créer une app Reddit
1. Aller sur https://www.reddit.com/prefs/apps
2. Cliquer "Create App" ou "Create Another App"
3. Remplir :
   - **Name**: OFM Social Publisher
   - **Type**: Select "web app"
   - **Description**: Social media publishing platform
   - **About URL**: https://yourdomain.com
   - **Redirect URI**: `http://localhost:3000/api/social/auth/reddit/callback` (dev)
   - **Redirect URI**: `https://yourdomain.com/api/social/auth/reddit/callback` (prod)
4. Noter le Client ID (sous "web app") et Secret

### Configuration .env.local
```env
REDDIT_CLIENT_ID=7YJkpCW28hB4zradQaTtRA
REDDIT_CLIENT_SECRET=pyUICGVMJt1lmrWeidkUYU807WqFYQ
REDDIT_USER_AGENT=ofm-social-os:v1.0.0 (by /u/votre_username)
```

## 2. Instagram OAuth Setup

### Prérequis
- Compte Facebook Developer
- App Facebook avec Instagram Basic Display API activée

### Étapes
1. Aller sur https://developers.facebook.com/apps/
2. Créer une nouvelle app ou utiliser existante
3. Ajouter "Instagram Basic Display" comme produit
4. Dans Instagram Basic Display :
   - **Valid OAuth Redirect URIs**: 
     - `http://localhost:3000/api/social/auth/instagram/callback` (dev)
     - `https://yourdomain.com/api/social/auth/instagram/callback` (prod)
   - **Deauthorize Callback URL**: `https://yourdomain.com/api/social/auth/instagram/deauth`
   - **Data Deletion Request URL**: `https://yourdomain.com/api/social/auth/instagram/delete`

### Permissions requises
- `instagram_basic` - Infos de base du profil
- `instagram_content_publish` - Publier du contenu
- `instagram_manage_insights` - Accès aux analytics

### Configuration .env.local
```env
INSTAGRAM_CLIENT_ID=23875871685429265
INSTAGRAM_CLIENT_SECRET=206b1bcacb7af5ea9ade71775c2d5483
```

## 3. TikTok OAuth Setup

### Créer une app TikTok
1. Aller sur https://developers.tiktok.com/apps/
2. Créer une nouvelle app
3. Dans "Product" → Ajouter "Login Kit" et "Content Posting API"
4. Configuration :
   - **Redirect URI**: 
     - `http://localhost:3000/api/social/auth/tiktok/callback` (dev)
     - `https://yourdomain.com/api/social/auth/tiktok/callback` (prod)
   - **Scopes requis**:
     - `user.info.basic` - Infos utilisateur
     - `video.publish` - Publier des vidéos
     - `video.upload` - Upload de vidéos

### Configuration .env.local
```env
TIKTOK_CLIENT_KEY=awjbhv6npxd097tk
TIKTOK_CLIENT_SECRET=Fv3uYYv0vU82nyDtY4OUORt5Ouliy1yl
```

## 4. URLs de Redirect

### Development
```
Reddit:    http://localhost:3000/api/social/auth/reddit/callback
Instagram: http://localhost:3000/api/social/auth/instagram/callback
TikTok:    http://localhost:3000/api/social/auth/tiktok/callback
```

### Production
```
Reddit:    https://yourdomain.com/api/social/auth/reddit/callback
Instagram: https://yourdomain.com/api/social/auth/instagram/callback
TikTok:    https://yourdomain.com/api/social/auth/tiktok/callback
```

## 5. Test des connexions

### Test Reddit
```bash
# 1. Initier OAuth
curl "http://localhost:3000/api/social/auth/reddit?user_id=1"

# 2. Suivre le redirect dans le navigateur
# 3. Autoriser l'app
# 4. Vérifier la connexion
curl "http://localhost:3000/api/social/accounts?user_id=1"
```

### Test Instagram
```bash
# Même process
curl "http://localhost:3000/api/social/auth/instagram?user_id=1"
```

### Test TikTok
```bash
# Même process
curl "http://localhost:3000/api/social/auth/tiktok?user_id=1"
```

## 6. Limites et Quotas

### Reddit
- Rate limit: 60 requêtes/minute
- Posts: Pas de limite stricte

### Instagram
- Rate limit: 200 requêtes/heure
- Posts: 25 posts/jour
- Reels: 10 reels/jour
- Stories: 100 stories/jour

### TikTok
- Rate limit: 6 requêtes/minute
- Videos: 10 vidéos/jour

## 7. Tokens et Expiration

### Reddit
- Access token: 24 heures
- Refresh token: Permanent (jusqu'à révocation)
- Auto-refresh implémenté

### Instagram
- Short-lived token: 1 heure
- Long-lived token: 60 jours
- Pas de refresh token (renouvellement manuel)

### TikTok
- Access token: 24 heures
- Refresh token: 180 jours
- Auto-refresh implémenté

## 8. Troubleshooting

### "Invalid redirect URI"
→ Vérifier que l'URL dans .env correspond EXACTEMENT à celle dans l'app

### "Invalid scope"
→ Certains scopes nécessitent une validation de l'app

### "Rate limit exceeded"
→ Implémenter un backoff exponentiel (déjà fait dans le code)

### Token expiré
→ Le système refresh automatiquement, vérifier les logs

---

**Important**: Gardez vos secrets sécurisés et ne les commitez jamais dans Git!