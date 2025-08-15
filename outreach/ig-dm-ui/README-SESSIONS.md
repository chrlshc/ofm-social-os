# 🔐 Instagram Session Management System

## Overview

Ce système gère automatiquement les sessions Instagram pour 50+ comptes sans intervention manuelle quotidienne.

## 🚀 Quick Start

### 1. Initialisation (première fois)
```bash
# Initialise toutes les sessions des comptes configurés
npm run session:init

# Vérifie le statut
npm run session:status
```

### 2. Utilisation quotidienne
```bash
# Health check automatique (à mettre en cron)
npm run session:health

# Refresh automatique des sessions expirées
npm run session:refresh
```

## 🔑 Fonctionnalités clés

### Persistance sécurisée des sessions
- **Encryption AES-256** des cookies et données sensibles
- **Storage local** dans `sessions/` (gitignored)
- **Backup database** optionnel pour la redondance

### Validation automatique
- Test de connexion sans navigation visible
- Détection des challenges et 2FA
- Health score par compte (0-100)

### Gestion du 2FA
```bash
# Si un compte demande 2FA
# 1. Connexion manuelle sur Instagram
# 2. Compléter le 2FA
# 3. Marquer comme complété:
npm run session:2fa -- --username compte_exemple

# 4. Le système récupère automatiquement la session
```

### Rotation intelligente
- Sessions valides 7-14 jours
- Refresh automatique avant expiration
- Détection proactive des problèmes

## 📁 Structure des fichiers

```
sessions/
├── .gitignore          # Empêche commit accidentel
├── account1.session    # Session encryptée
├── account2.session    # Session encryptée
└── ...
```

## 🛠️ Configuration

### Variables d'environnement
```bash
# .env
SESSION_ENCRYPTION_KEY=your-32-byte-hex-key  # Généré automatiquement si absent
HEADLESS=true                                # false pour debug
SESSION_MAX_AGE_DAYS=7                       # Durée de vie des sessions
```

### Configuration des comptes
```json
// config/account_proxy_config.json
{
  "accounts": [
    {
      "username": "account1",
      "password": "password1",
      "proxy": "http://proxy1.com:8080",
      "totpSecret": "ABCD1234...",  // Optionnel: pour 2FA automatique
      "tags": ["warm", "primary"]
    }
  ]
}
```

## 📊 Commandes disponibles

| Commande | Description |
|----------|-------------|
| `session:init` | Initialise toutes les sessions |
| `session:status` | Affiche le statut de toutes les sessions |
| `session:validate` | Valide toutes les sessions |
| `session:refresh` | Rafraîchit les sessions expirées |
| `session:login` | Login manuel d'un compte spécifique |
| `session:health` | Health check complet |
| `session:cleanup` | Nettoie les vieilles sessions |
| `session:2fa` | Marque un 2FA comme complété |

### Exemples d'utilisation

```bash
# Login d'un compte spécifique
npm run session:login -- --username moncompte

# Forcer le refresh de toutes les sessions
npm run session:refresh -- --force

# Nettoyer les sessions > 30 jours
npm run session:cleanup -- --days 30

# Utiliser une config différente
npm run session:init -- --config ./config/accounts-test.json
```

## 🔄 Automatisation recommandée (cron)

```bash
# Health check toutes les 4 heures
0 */4 * * * cd /path/to/project && npm run session:health >> logs/session-health.log 2>&1

# Refresh des sessions expirées chaque nuit
0 3 * * * cd /path/to/project && npm run session:refresh >> logs/session-refresh.log 2>&1

# Cleanup hebdomadaire
0 4 * * 0 cd /path/to/project && npm run session:cleanup -- --days 30 >> logs/session-cleanup.log 2>&1
```

## 🏥 Health Score

Le health score (0-100) détermine la priorité d'utilisation des comptes:

- **90-100**: Excellent - Priorité haute
- **70-89**: Bon - Utilisation normale
- **50-69**: Moyen - Surveillance accrue
- **0-49**: Faible - Refresh nécessaire

Facteurs affectant le score:
- Erreurs de connexion (-5 points)
- Challenges détectés (-10 points)
- Âge de la session
- Taux de succès des actions

## 🚨 Troubleshooting

### Session expirée fréquemment
- Vérifier le proxy (IP stable?)
- User-agent cohérent?
- Activité trop intense?

### Challenge/Checkpoint
1. Se connecter manuellement depuis le même proxy
2. Résoudre le challenge
3. Relancer `session:refresh`

### 2FA récurrent
- Configurer TOTP secret pour automation
- Ou utiliser des comptes avec 2FA désactivé (moins sécurisé)

### Erreur de décryption
- Vérifier SESSION_ENCRYPTION_KEY identique
- Ne pas modifier les fichiers .session manuellement

## 🔒 Sécurité

- **Ne jamais** commiter les fichiers de session
- **Ne jamais** partager SESSION_ENCRYPTION_KEY
- **Toujours** utiliser des proxies dédiés par compte
- **Éviter** les connexions simultanées (mobile + automation)

## 📈 Monitoring

Métriques à surveiller:
- Session validity rate (cible: >95%)
- Challenge frequency (alerte si >10%)
- Health score moyen (cible: >80)
- 2FA queue size (alerte si >5)

## 🔧 Debug

Pour debug un compte spécifique:
```bash
# Mode headless désactivé
HEADLESS=false npm run session:login -- --username problematic_account

# Logs détaillés
DEBUG=* npm run session:validate
```

## 💡 Best Practices

1. **Warm-up** nouveaux comptes progressivement
2. **Rotation** des comptes pour éviter surcharge
3. **Monitoring** quotidien du health score
4. **Backup** régulier du dossier sessions/
5. **Isolation** des sessions par environnement (dev/prod)

---

Pour plus d'aide: `npm run session:init -- --help`