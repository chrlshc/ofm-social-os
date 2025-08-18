# Guide de Configuration des Variables d'Environnement

## 🎯 Approche Simplifiée

Pour faciliter la configuration, j'ai créé un fichier unique `.env.all-services` qui contient TOUTES les variables d'environnement nécessaires.

## 📝 Étapes à suivre

### 1. Ouvrir le fichier central
```bash
nano .env.all-services
```

### 2. Remplir toutes les valeurs

Le fichier est organisé en sections claires :

1. **Configuration Globale** - Votre domaine
2. **PostgreSQL** - Mot de passe de la base de données
3. **Redis** - Mot de passe Redis
4. **Clés de sécurité** - Déjà générées, ne pas modifier
5. **Stripe** - Vos clés API Stripe
6. **APIs Réseaux Sociaux** - Instagram, TikTok, X, Reddit
7. **Email SMTP** - Configuration email
8. **AWS S3** - Stockage (optionnel)
9. **APIs LLM** - OpenAI, Anthropic (optionnel)
10. **Instagram DM** - Comptes et proxies
11. **Autres configurations**

### 3. Distribuer automatiquement
Une fois toutes les valeurs remplies :
```bash
./scripts/distribute-env.sh
```

Ce script va automatiquement :
- Créer tous les fichiers .env nécessaires
- Placer les bonnes variables dans chaque service
- Faire un backup des anciens fichiers

## 🔑 Variables Importantes à Remplir

### Obligatoires
- `DOMAIN` - Votre domaine (ex: monsite.com)
- `POSTGRES_PASSWORD` - Mot de passe PostgreSQL fort
- `REDIS_PASSWORD` - Mot de passe Redis fort
- `STRIPE_SECRET_KEY` - Clé API Stripe
- `SMTP_*` - Configuration email

### APIs Sociales (selon vos besoins)
- Instagram : `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`
- TikTok : `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- X/Twitter : `X_API_KEY`, `X_API_SECRET`
- Reddit : `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`

### Optionnelles
- AWS S3 pour le stockage
- OpenAI/Anthropic pour l'IA
- Comptes Instagram pour le DM automatique

## 🚀 Après la configuration

1. Vérifiez que tout est correct
2. Lancez la production :
```bash
./scripts/start-production.sh
```

## ⚠️ Sécurité

- Ne commitez JAMAIS le fichier `.env.all-services` rempli
- Gardez une copie sécurisée de vos clés
- Utilisez des mots de passe forts et uniques
- Activez l'authentification 2FA sur tous vos comptes API

## 📁 Fichiers créés

Le script créera automatiquement :
- `.env.production` - Variables globales
- `site-web/.env` - Frontend
- `marketing/backend/api/.env` - API Marketing
- `payment/.env.production` - Service de paiement
- `onboarding/.env` - Service d'onboarding
- `kpi/.env` - Service KPI
- `outreach/ig-dm-ui/.env.production` - Instagram DM