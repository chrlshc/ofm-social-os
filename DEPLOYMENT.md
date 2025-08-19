# Guide de Déploiement OFM IA sur Vercel

## 🚀 Étapes de déploiement

### 1. Connecter votre repository GitHub à Vercel

1. Allez sur [vercel.com](https://vercel.com)
2. Cliquez sur "New Project"
3. Importez votre repository `chrlshc/ofm-social-os`
4. Sélectionnez le framework "Next.js"

### 2. Configurer les variables d'environnement

Dans les paramètres du projet Vercel, ajoutez ces variables d'environnement :

```bash
# Base de données
DATABASE_URL=postgresql://postgres:Francelyse1!@huntaze.c2ryoow8c5m4.us-east-1.rds.amazonaws.com:5432/ofm_production?sslmode=require

# API URLs
NEXT_PUBLIC_API_URL=https://api.huntaze.com
NEXT_PUBLIC_DOMAIN=huntaze.com

# Auth
NEXTAUTH_URL=https://huntaze.com
NEXTAUTH_SECRET=2351a0060bbbef9e23f1c810f36ba0ddb395cbe39b2d0a6cee19c962d18dc3d5

# Environnement
NODE_ENV=production
```

### 3. Domaine personnalisé

1. Dans Settings → Domains
2. Ajoutez `huntaze.com`
3. Configurez vos DNS :
   - Type A : `76.76.21.21`
   - ou CNAME : `cname.vercel-dns.com`

### 4. Variables d'environnement pour les services backend

Pour déployer les services backend (Marketing, Payment, etc.), utilisez les fichiers .env créés dans :
- `services/marketing/.env`
- `services/payment/.env`
- `services/onboarding/.env`
- `services/kpi/.env`

### 5. Base de données

Les schémas sont déjà appliqués. Pour vérifier :

```bash
./scripts/check-db-connections.py
```

### 6. SSL/HTTPS

Vercel fournit automatiquement des certificats SSL. Aucune action requise.

## 📋 Checklist de déploiement

- [ ] Repository GitHub connecté
- [ ] Variables d'environnement configurées
- [ ] Domaine personnalisé ajouté
- [ ] DNS configurés
- [ ] Build réussi sur Vercel
- [ ] Site accessible sur https://huntaze.com

## 🔧 Commandes utiles

```bash
# Déployer les variables d'environnement localement
./scripts/deploy-env.sh

# Vérifier les connexions base de données
./scripts/check-db-connections.py

# Appliquer les schémas de base de données
./database/apply-schemas.sh
```

## 🛠️ Dépannage

### Erreur de build
- Vérifiez que toutes les variables NEXT_PUBLIC_* sont définies
- Assurez-vous que NODE_ENV=production

### Erreur de base de données
- Vérifiez que l'IP de Vercel est autorisée dans le Security Group RDS
- Testez la connexion avec `scripts/check-db-connections.py`

### Erreur 500
- Vérifiez les logs dans le dashboard Vercel
- Assurez-vous que NEXTAUTH_SECRET est défini

## 📱 Prochaines étapes

1. Configurer les webhooks Stripe
2. Activer les APIs réseaux sociaux (Instagram, TikTok, Reddit)
3. Configurer le monitoring avec Grafana
4. Mettre en place les backups automatiques