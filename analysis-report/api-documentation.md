# 📡 OFM Onboarding API - Documentation Complète

## 🎯 Vue d'Ensemble

L'API Onboarding fournit un flux complet pré-connexion avec :
- **Registration & Email Verification** sécurisée
- **Stripe Connect Express** intégration hosted  
- **Auto-locale detection** sans friction utilisateur
- **Progress tracking** temps réel
- **Background automation** post-activation

**Base URL**: `https://api.ofm.com/api/v1`

---

## 🔐 Authentication

Tous les endpoints (sauf registration) nécessitent un JWT token valide.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### **User Roles**
- `creator` - Créateur de contenu (accès complet onboarding)
- `admin` - Administrateur (accès monitoring)

---

## 📋 Endpoints API

### 🔑 **Authentication Endpoints**

#### **POST** `/auth/register`
Créer un nouveau compte utilisateur et démarrer l'onboarding.

**Request Body:**
```json
{
  "email": "creator@example.com",
  "password": "securePassword123"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user_id": "user_abc123",
    "onboarding_session_id": "onb_def456", 
    "email_verification_sent": true
  }
}
```

**Errors:**
```json
// 400 Bad Request
{
  "success": false,
  "error": "Valid email address required"
}

// 409 Conflict  
{
  "success": false,
  "error": "User already exists"
}
```

---

#### **POST** `/auth/verify-email`
Vérifier l'adresse email avec le token reçu par email.

**Request Body:**
```json
{
  "user_id": "user_abc123",
  "token": "cryptographic_token_from_email"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Errors:**
```json
// 400 Bad Request
{
  "success": false,
  "error": "Invalid or expired verification token"
}
```

---

#### **POST** `/auth/resend-verification`
Renvoyer un token de vérification email (rate limited).

**Headers:** `Authorization: Bearer {token}`

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Verification email sent"
}
```

**Errors:**
```json  
// 429 Too Many Requests
{
  "success": false,
  "error": "Verification email already sent. Please wait 25 minutes."
}
```

---

#### **POST** `/auth/accept-terms`
Accepter les conditions générales d'utilisation.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "terms_version": "v1.0"  // Optional
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Terms accepted successfully"  
}
```

---

### 💳 **Stripe Connect Endpoints**

#### **POST** `/stripe/connect/start`
Démarrer l'onboarding Stripe Connect Express.

**Headers:** `Authorization: Bearer {token}`  
**Required Role:** `creator`

**Request Body:**
```json
{
  "return_url": "https://app.ofm.com/onboarding/stripe-return",
  "refresh_url": "https://app.ofm.com/onboarding/stripe-refresh"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Stripe onboarding started",
  "data": {
    "onboarding_url": "https://connect.stripe.com/setup/e/acct_1234...",
    "expires_in_minutes": 60
  }
}
```

**Errors:**
```json
// 400 Bad Request
{
  "success": false,
  "error": "return_url and refresh_url required"
}

// 404 Not Found
{
  "success": false, 
  "error": "Creator profile not found"
}
```

---

#### **POST** `/stripe/connect/refresh`
Rafraîchir un lien d'onboarding Stripe expiré.

**Headers:** `Authorization: Bearer {token}`  
**Required Role:** `creator`

**Request Body:**
```json
{
  "return_url": "https://app.ofm.com/onboarding/stripe-return",
  "refresh_url": "https://app.ofm.com/onboarding/stripe-refresh"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Onboarding link refreshed", 
  "data": {
    "onboarding_url": "https://connect.stripe.com/setup/e/acct_1234..."
  }
}
```

---

#### **POST** `/stripe/connect/return`
Traiter le retour depuis Stripe après onboarding.

**Headers:** `Authorization: Bearer {token}`  
**Required Role:** `creator`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "status": "complete",
    "message": "Onboarding completed successfully",
    "can_accept_payments": true
  }
}
```

**Possible Status Values:**
- `complete` - Onboarding terminé avec succès
- `incomplete` - Informations supplémentaires requises  
- `error` - Erreur lors du traitement

**Incomplete Response:**
```json
{
  "success": true,
  "data": {
    "status": "incomplete",
    "message": "Additional information required",
    "progress": 75,
    "requirements": {
      "currently_due": ["individual.first_name"],
      "eventually_due": ["individual.address.line1"],
      "past_due": []
    }
  }
}
```

---

#### **GET** `/stripe/status`
Obtenir le statut actuel du compte Stripe.

**Headers:** `Authorization: Bearer {token}`  
**Required Role:** `creator`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "account_id": "acct_1234567890",
    "status": {
      "charges_enabled": true,
      "payouts_enabled": true, 
      "details_submitted": true,
      "requirements": {
        "currently_due": [],
        "eventually_due": [],
        "past_due": [],
        "pending_verification": []
      }
    },
    "progress": 100,
    "progress_message": "Onboarding complete - ready to accept payments",
    "is_complete": true
  }
}
```

---

#### **POST** `/stripe/dashboard-link`
Créer un lien de connexion au Stripe Express Dashboard.

**Headers:** `Authorization: Bearer {token}`  
**Required Role:** `creator`

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Dashboard link created",
  "data": {
    "dashboard_url": "https://connect.stripe.com/express/oauth/v2/authorize?...",
    "expires_in_seconds": 300
  }
}
```

**Note:** Les liens dashboard expirent après 5 minutes pour des raisons de sécurité.

---

### 📊 **Onboarding Status & Progress**

#### **GET** `/onboarding/status`
Obtenir le statut complet de l'onboarding.

**Headers:** `Authorization: Bearer {token}`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "session_id": "onb_def456",
    "current_step": "stripe_completed", 
    "completed": true,
    "progress": 100,
    "steps": {
      "registered": true,
      "email_verified": true,
      "terms_accepted": true,
      "stripe_started": true,
      "stripe_completed": true
    },
    "stripe": {
      "account_id": "acct_1234567890",
      "charges_enabled": true,
      "payouts_enabled": true,
      "requirements": {
        "currently_due": [],
        "eventually_due": []
      }
    }
  }
}
```

**Step Values:**
- `registered` - Compte créé
- `email_verified` - Email vérifié  
- `terms_accepted` - CGU acceptées
- `stripe_started` - Onboarding Stripe démarré
- `stripe_completed` - Onboarding Stripe terminé
- `completed` - Onboarding complet

---

#### **POST** `/onboarding/update-timezone`
Mettre à jour le fuseau horaire depuis la détection JavaScript.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "timezone": "Europe/Paris"
}
```

**JavaScript Client Code:**
```javascript
// Détection automatique côté client
const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

fetch('/api/v1/onboarding/update-timezone', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ timezone: clientTimeZone })
});
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Timezone updated"
}
```

---

### 🔔 **Webhook Endpoints**

#### **POST** `/webhooks/stripe`
Recevoir et traiter les webhooks Stripe.

**Headers:**
```
Stripe-Signature: t=1234567890,v1=abc123...,v0=def456...
Content-Type: application/json
```

**Request Body:** (Stripe Event Object)
```json
{
  "id": "evt_1234567890",
  "object": "event",
  "type": "account.updated",
  "data": {
    "object": {
      "id": "acct_1234567890",
      "charges_enabled": true,
      "payouts_enabled": true
    }
  }
}
```

**Response:** `200 OK`
```json
{
  "received": true
}
```

**Supported Events:**
- `account.updated` - Statut compte Stripe mis à jour
- `capability.updated` - Capacité compte modifiée
- `person.created` - Personne ajoutée au compte
- `person.updated` - Informations personne mises à jour

---

## 🌐 Frontend Integration

### **JavaScript SDK Example**

```javascript
class OFMOnboardingSDK {
  constructor(apiBaseUrl, authToken) {
    this.apiUrl = apiBaseUrl;
    this.token = authToken;
  }

  async register(email, password) {
    const response = await fetch(`${this.apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return response.json();
  }

  async verifyEmail(userId, token) {
    const response = await fetch(`${this.apiUrl}/auth/verify-email`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, token })
    });
    return response.json();
  }

  async startStripeOnboarding(returnUrl, refreshUrl) {
    const response = await fetch(`${this.apiUrl}/stripe/connect/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        return_url: returnUrl, 
        refresh_url: refreshUrl 
      })
    });
    return response.json();
  }

  async getOnboardingStatus() {
    const response = await fetch(`${this.apiUrl}/onboarding/status`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.json();
  }

  // Auto-detect and update timezone
  async updateTimezone() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await fetch(`${this.apiUrl}/onboarding/update-timezone`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ timezone })
    });
    return response.json();
  }
}

// Usage
const sdk = new OFMOnboardingSDK('https://api.ofm.com/api/v1', userToken);

// Complete onboarding flow
async function completeOnboarding(email, password) {
  // 1. Register
  const registration = await sdk.register(email, password);
  const { user_id } = registration.data;
  
  // 2. Email verification (user clicks email link)
  // URL: https://app.ofm.com/verify-email?token=...&user_id=...
  
  // 3. After email verification, start Stripe onboarding
  const stripeOnboarding = await sdk.startStripeOnboarding(
    'https://app.ofm.com/onboarding/return',
    'https://app.ofm.com/onboarding/refresh'
  );
  
  // 4. Redirect user to Stripe
  window.location.href = stripeOnboarding.data.onboarding_url;
  
  // 5. After Stripe return, update timezone
  await sdk.updateTimezone();
}
```

### **React Components Example**

```jsx
import React, { useState, useEffect } from 'react';

function OnboardingProgress({ sdk }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await sdk.getOnboardingStatus();
        setStatus(response.data);
      } catch (error) {
        console.error('Failed to fetch onboarding status:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [sdk]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="onboarding-progress">
      <h2>Onboarding Progress</h2>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${status.progress}%` }}
        />
      </div>
      <p>{status.progress}% complete</p>
      
      <div className="steps">
        {Object.entries(status.steps).map(([step, completed]) => (
          <div key={step} className={`step ${completed ? 'completed' : 'pending'}`}>
            {step.replace('_', ' ').toUpperCase()}
            {completed ? ' ✅' : ' ⏳'}
          </div>
        ))}
      </div>

      {status.current_step === 'stripe_started' && (
        <div className="stripe-status">
          <h3>Stripe Setup</h3>
          <p>Complete your payment setup to start earning!</p>
          {status.stripe && status.stripe.requirements.currently_due.length > 0 && (
            <div className="requirements">
              <h4>Required Information:</h4>
              <ul>
                {status.stripe.requirements.currently_due.map(req => (
                  <li key={req}>{req.replace('_', ' ').replace('.', ' - ')}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StripeOnboardingButton({ sdk }) {
  const [loading, setLoading] = useState(false);

  const startStripeOnboarding = async () => {
    setLoading(true);
    try {
      const result = await sdk.startStripeOnboarding(
        `${window.location.origin}/onboarding/stripe-return`,
        `${window.location.origin}/onboarding/stripe-refresh`
      );
      
      if (result.success) {
        window.location.href = result.data.onboarding_url;
      }
    } catch (error) {
      console.error('Stripe onboarding failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={startStripeOnboarding} 
      disabled={loading}
      className="stripe-onboarding-btn"
    >
      {loading ? 'Starting...' : 'Complete Payment Setup'}
    </button>
  );
}
```

---

## 🚨 Error Handling

### **Standard Error Response Format**
```json
{
  "success": false,
  "error": "Human readable error message",
  "details": {
    "field": "email",
    "code": "INVALID_FORMAT"
  }
}
```

### **HTTP Status Codes**

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful request |
| 201 | Created | Resource created (registration) |
| 400 | Bad Request | Invalid input/validation error |
| 401 | Unauthorized | Missing/invalid JWT token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

### **Common Error Scenarios**

```javascript
// Handle API errors
async function handleApiCall(apiFunction) {
  try {
    const result = await apiFunction();
    
    if (!result.success) {
      switch (result.error) {
        case 'User already exists':
          showError('An account with this email already exists. Try logging in instead.');
          break;
        case 'Invalid or expired verification token':
          showError('This verification link has expired. Please request a new one.');
          break;
        case 'Stripe account not found':
          showError('Please complete your payment setup first.');
          break;
        default:
          showError(`Error: ${result.error}`);
      }
    }
    
    return result;
  } catch (networkError) {
    showError('Network error. Please check your connection and try again.');
    throw networkError;
  }
}
```

---

## 📊 Rate Limiting

| Endpoint | Rate Limit | Window |
|----------|------------|---------|
| `/auth/register` | 5 requests | per hour |
| `/auth/resend-verification` | 3 requests | per hour |
| `/stripe/connect/*` | 10 requests | per minute |
| Other endpoints | 100 requests | per minute |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95  
X-RateLimit-Reset: 1640995200
```

---

## 🔒 Security Considerations

### **Token Security**
- Email verification tokens expire after 30 minutes
- Single-use enforcement (tokens invalidated after use)
- Cryptographically secure generation (256 bits entropy)
- SHA256 hashing for storage

### **Stripe Security**
- Webhook signature verification required
- Account Links expire after 60 minutes
- Dashboard links expire after 5 minutes
- No sensitive data stored locally

### **API Security**
- JWT tokens required for authenticated endpoints
- CORS restrictions enforced
- HTTPS required in production
- Input validation on all endpoints

---

**🎯 Cette API fournit tout ce nécessaire pour un onboarding friction-free et sécurisé avec intégration Stripe Connect complète.**