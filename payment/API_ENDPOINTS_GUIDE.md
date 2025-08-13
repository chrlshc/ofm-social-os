# Guide des Endpoints API - Module de Paiement OFM v2.1

Documentation complète de tous les endpoints disponibles avec exemples d'utilisation.

---

## 🔐 Authentification

Tous les endpoints protégés nécessitent un token JWT dans l'en-tête :
```
Authorization: Bearer <your-jwt-token>
```

## 📋 Endpoints Publics

### `GET /health`
**Description :** Vérification de santé de l'API  
**Authentification :** Non requise  
**Rate Limit :** Aucune

```bash
curl http://localhost:5000/health
```

**Réponse :**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "2.1.0"
}
```

### `POST /commission/estimate`
**Description :** Estime la commission pour un montant donné  
**Authentification :** Non requise  
**Rate Limit :** 30/minute

```bash
curl -X POST http://localhost:5000/commission/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "amount_euros": "300.00",
    "monthly_revenue_euros": "1500.00"
  }'
```

**Réponse :**
```json
{
  "amount_euros": 300.0,
  "monthly_revenue_euros": 1500.0,
  "fee_cents": 3750,
  "fee_euros": 37.50,
  "net_amount_euros": 262.50,
  "effective_rate": 12.5,
  "tier_breakdown": [
    {
      "tier_number": 1,
      "tier_range": "0€ - 2000€",
      "rate": "0%",
      "amount_in_tier_euros": 50.0,
      "fee_euros": 0.0
    },
    {
      "tier_number": 2,
      "tier_range": "2000€ - 5000€",
      "rate": "25%",
      "amount_in_tier_euros": 250.0,
      "fee_euros": 62.5
    }
  ]
}
```

---

## 🔑 Authentification

### `POST /auth/login`
**Description :** Connexion utilisateur  
**Authentification :** Non requise  
**Rate Limit :** Par défaut

```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@test.local",
    "password": "Creator123!"
  }'
```

**Réponse :**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": {
    "id": "user_123",
    "email": "creator@test.local",
    "role": "creator",
    "first_name": "Test",
    "last_name": "Creator",
    "email_verified": true,
    "status": "active"
  }
}
```

### `POST /auth/register`
**Description :** Inscription nouvel utilisateur  
**Authentification :** Non requise  
**Rate Limit :** Par défaut

```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecureP@ssw0rd123",
    "first_name": "John",
    "last_name": "Doe",
    "role": "user"
  }'
```

### `POST /auth/refresh`
**Description :** Rafraîchissement du token d'accès  
**Authentification :** Refresh token requis

```bash
curl -X POST http://localhost:5000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### `GET /auth/verify`
**Description :** Vérification du token et infos utilisateur  
**Authentification :** Requise  
**Rôles :** Tous

```bash
curl http://localhost:5000/auth/verify \
  -H "Authorization: Bearer your-jwt-token"
```

### `POST /auth/change-password`
**Description :** Changement de mot de passe  
**Authentification :** Requise  
**Rôles :** Tous

```bash
curl -X POST http://localhost:5000/auth/change-password \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "old_password": "current_password",
    "new_password": "new_secure_password"
  }'
```

---

## 💳 Paiements

### `POST /payments`
**Description :** Crée un nouveau paiement avec commission dégressive  
**Authentification :** Requise  
**Rôles :** user, creator  
**Rate Limit :** 10/minute

```bash
curl -X POST http://localhost:5000/payments \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "fan_id": "fan_123",
    "creator_id": "creator_456",
    "amount_euros": "250.00",
    "currency": "eur",
    "metadata": {
      "tip": "true",
      "message": "Merci pour le contenu!"
    }
  }'
```

**Réponse :**
```json
{
  "success": true,
  "payment_intent_id": "pi_1234567890",
  "client_secret": "pi_1234567890_secret_abcdef",
  "amount_cents": 25000,
  "amount_euros": 250.0,
  "fee_cents": 3750,
  "fee_euros": 37.50,
  "net_amount_cents": 21250,
  "net_amount_euros": 212.50,
  "commission_breakdown": [...]
}
```

### `GET /payments/<payment_intent_id>`
**Description :** Récupère les détails d'un paiement  
**Authentification :** Requise  
**Rôles :** user, creator, admin (avec restrictions)  
**Rate Limit :** 30/minute

```bash
curl http://localhost:5000/payments/pi_1234567890 \
  -H "Authorization: Bearer your-jwt-token"
```

**Réponse :**
```json
{
  "id": "txn_abc123",
  "amount_cents": 25000,
  "amount_euros": 250.0,
  "fee_cents": 3750,
  "fee_euros": 37.50,
  "net_amount_euros": 212.50,
  "currency": "EUR",
  "status": "succeeded",
  "created_at": "2024-01-15T10:30:00.000Z",
  "stripe_status": "succeeded"
}
```

### `POST /payments/<payment_intent_id>/cancel`
**Description :** Annule un paiement  
**Authentification :** Requise  
**Rôles :** user (propriétaire), admin  
**Rate Limit :** 5/minute

```bash
curl -X POST http://localhost:5000/payments/pi_1234567890/cancel \
  -H "Authorization: Bearer your-jwt-token"
```

---

## 👩‍💼 Gestion des Créatrices

### `POST /creators/<creator_id>/account`
**Description :** Crée un compte Stripe Connect pour une créatrice  
**Authentification :** Requise  
**Rôles :** admin uniquement  
**Rate Limit :** 3/minute

```bash
curl -X POST http://localhost:5000/creators/creator_456/account \
  -H "Authorization: Bearer admin-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com",
    "country": "FR",
    "business_profile": {
      "product_description": "Création de contenu digital"
    }
  }'
```

**Réponse :**
```json
{
  "creator_id": "creator_456",
  "email": "creator@example.com",
  "stripe_account_id": "acct_1234567890",
  "status": "incomplete",
  "onboarding_url": "https://connect.stripe.com/express/onboarding/...",
  "capabilities": {
    "card_payments": "inactive",
    "transfers": "inactive"
  },
  "requirements": {
    "currently_due": ["business_profile.url", "external_account"],
    "eventually_due": [],
    "past_due": [],
    "pending_verification": []
  }
}
```

### `POST /creators/<creator_id>/onboarding-link`
**Description :** Crée un nouveau lien d'onboarding  
**Authentification :** Requise  
**Rôles :** creator (propriétaire), admin  
**Rate Limit :** 5/minute

```bash
curl -X POST http://localhost:5000/creators/creator_456/onboarding-link \
  -H "Authorization: Bearer creator-jwt-token"
```

**Réponse :**
```json
{
  "onboarding_url": "https://connect.stripe.com/express/onboarding/...",
  "expires_at": "2024-01-16T10:30:00.000Z"
}
```

### `POST /creators/<creator_id>/dashboard-link`
**Description :** Crée un lien vers le dashboard Stripe Express  
**Authentification :** Requise  
**Rôles :** creator (propriétaire), admin  
**Rate Limit :** 10/minute

```bash
curl -X POST http://localhost:5000/creators/creator_456/dashboard-link \
  -H "Authorization: Bearer creator-jwt-token"
```

**Réponse :**
```json
{
  "dashboard_url": "https://connect.stripe.com/express/dashboard/..."
}
```

### `GET /creators/<creator_id>/stripe-status`
**Description :** Récupère le statut détaillé du compte Stripe  
**Authentification :** Requise  
**Rôles :** creator (propriétaire), admin  
**Rate Limit :** 20/minute

```bash
curl http://localhost:5000/creators/creator_456/stripe-status \
  -H "Authorization: Bearer creator-jwt-token"
```

**Réponse :**
```json
{
  "creator_id": "creator_456",
  "stripe_account_id": "acct_1234567890",
  "status": {
    "account_id": "acct_1234567890",
    "email": "creator@example.com",
    "details_submitted": true,
    "charges_enabled": true,
    "payouts_enabled": true,
    "capabilities": {
      "card_payments": "active",
      "transfers": "active",
      "can_receive_payments": true,
      "can_receive_transfers": true
    },
    "requirements": {
      "currently_due": [],
      "eventually_due": [],
      "past_due": [],
      "pending_verification": [],
      "has_blocking_requirements": false,
      "total_requirements": 0
    },
    "onboarding_status": "completed"
  },
  "last_updated": "2024-01-15T10:30:00.000Z"
}
```

### `GET /creators/<creator_id>/revenue/<year>/<month>`
**Description :** Récupère le revenu mensuel  
**Authentification :** Requise  
**Rôles :** creator (propriétaire), admin  
**Rate Limit :** 20/minute

```bash
curl http://localhost:5000/creators/creator_456/revenue/2024/1 \
  -H "Authorization: Bearer creator-jwt-token"
```

**Réponse :**
```json
{
  "creator_id": "creator_456",
  "year": 2024,
  "month": 1,
  "revenue_cents": 500000,
  "revenue_euros": 5000.0,
  "estimated_fees": {
    "monthly_revenue_cents": 500000,
    "monthly_revenue_euros": 5000.0,
    "total_fees_cents": 75000,
    "total_fees_euros": 750.0,
    "effective_rate": 15.0,
    "tier_breakdown": [...]
  }
}
```

---

## 🔗 Webhooks

### `POST /webhook/stripe`
**Description :** Endpoint pour les webhooks Stripe  
**Authentification :** Signature Stripe requise  
**Rate Limit :** 100/minute

```bash
# Cet endpoint est appelé automatiquement par Stripe
# Configuration dans le dashboard Stripe :
# URL: https://your-domain.com/webhook/stripe
# Événements: payment_intent.succeeded, payment_intent.payment_failed, account.updated
```

**Headers requis :**
```
Stripe-Signature: t=timestamp,v1=signature
```

---

## 📊 Codes d'Erreur

### Format des Erreurs
Toutes les erreurs suivent ce format standardisé :

```json
{
  "success": false,
  "error": {
    "code": "PAY_4001",
    "message": "Paiement refusé par votre banque",
    "error_id": "a3b4c5d6",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "details": {
      "decline_code": "insufficient_funds"
    }
  }
}
```

### Codes d'Erreur Principaux

**Authentification (1000-1099) :**
- `AUTH_1001` : Token JWT manquant
- `AUTH_1002` : Token JWT invalide
- `AUTH_1003` : Token JWT expiré
- `AUTH_1004` : Permissions insuffisantes
- `AUTH_1005` : Compte verrouillé
- `AUTH_1007` : Identifiants invalides

**Validation (2000-2099) :**
- `VAL_2001` : Champ obligatoire manquant
- `VAL_2002` : Format invalide
- `VAL_2004` : Montant invalide
- `VAL_2005` : Devise non supportée

**Ressources (3000-3099) :**
- `RES_3001` : Ressource non trouvée
- `RES_3002` : Ressource déjà existante

**Paiements (4000-4099) :**
- `PAY_4001` : Fonds insuffisants
- `PAY_4002` : Paiement refusé
- `PAY_4003` : Erreur de traitement
- `PAY_4006` : Compte invalide

**Stripe (5000-5099) :**
- `STR_5001` : Erreur API Stripe
- `STR_5002` : Erreur de carte
- `STR_5003` : Limite de débit atteinte

**Système (9000-9099) :**
- `SYS_9001` : Erreur interne
- `SYS_9003` : Rate limit dépassé

---

## 🔄 Flow d'Intégration Complet

### 1. Création d'un Utilisateur et Onboarding
```bash
# 1. Inscription créatrice
curl -X POST /auth/register -d '{"email":"creator@example.com","password":"SecureP@ss123!","role":"creator"}'

# 2. Connexion
curl -X POST /auth/login -d '{"email":"creator@example.com","password":"SecureP@ss123!"}'

# 3. Création compte Stripe (admin)
curl -X POST /creators/creator_123/account -H "Authorization: Bearer admin-token" -d '{"email":"creator@example.com"}'

# 4. Récupération lien onboarding
curl -X POST /creators/creator_123/onboarding-link -H "Authorization: Bearer creator-token"

# 5. Vérification statut après onboarding
curl /creators/creator_123/stripe-status -H "Authorization: Bearer creator-token"
```

### 2. Processus de Paiement
```bash
# 1. Estimation commission
curl -X POST /commission/estimate -d '{"amount_euros":"100.00","monthly_revenue_euros":"1500.00"}'

# 2. Création paiement
curl -X POST /payments -H "Authorization: Bearer user-token" -d '{"fan_id":"fan_123","creator_id":"creator_123","amount_euros":"100.00"}'

# 3. Suivi paiement
curl /payments/pi_1234567890 -H "Authorization: Bearer user-token"

# 4. Vérification revenus créatrice
curl /creators/creator_123/revenue/2024/1 -H "Authorization: Bearer creator-token"
```

---

## 🛡️ Sécurité et Bonnes Pratiques

### Headers de Sécurité
L'API retourne automatiquement ces headers :
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### Rate Limiting
- Les limites sont par IP et par minute
- En cas de dépassement : HTTP 429 + retry_after
- Utilise Redis en production pour la distribution

### Logs d'Audit
Toutes les actions sont automatiquement loggées avec :
- ID utilisateur et rôle
- Adresse IP et User-Agent
- Données de requête (masquées)
- Statut de réponse et erreurs

---

Cette documentation couvre tous les endpoints disponibles dans le module de paiement OFM v2.1. Pour des questions spécifiques ou des intégrations personnalisées, consultez le code source ou les tests d'intégration.