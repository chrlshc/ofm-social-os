# Système de Paiement OFM avec Commission Dégressive

Ce module implémente un système de paiement avec commission dégressive basé sur les revenus mensuels, utilisant Stripe Connect pour gérer les paiements et les virements vers les créatrices.

## 🎯 Fonctionnalités

- **Commission dégressive mensuelle** : Les premiers 2 000€ sont sans commission, puis application de taux dégressifs par paliers
- **Intégration Stripe Connect** : Gestion automatique des paiements et virements
- **API REST complète** : Endpoints pour créer des paiements, gérer les comptes et consulter les statistiques
- **Webhooks Stripe** : Mise à jour automatique des statuts de transaction
- **Calcul transparent** : Détail de la répartition des commissions par palier

## 📊 Grille de Commission

| Tranche mensuelle | Taux de commission |
|-------------------|-------------------|
| 0€ - 2 000€      | 0%                |
| 2 000€ - 5 000€  | 25%               |
| 5 000€ - 10 000€ | 20%               |
| 10 000€ - 20 000€| 15%               |
| 20 000€ - 30 000€| 10%               |
| 30 000€+         | 10%               |

## 🚀 Installation

### Prérequis

- Python 3.8+
- Compte Stripe avec clés API
- Variables d'environnement configurées

### Installation des dépendances

```bash
cd payment
pip install -r requirements.txt
```

### Configuration

1. Copiez le fichier d'exemple :
```bash
cp .env.example .env
```

2. Configurez vos variables d'environnement dans `.env` :
```bash
# Stripe (obligatoire)
STRIPE_SECRET_KEY=sk_test_votre_cle_secrete
STRIPE_WEBHOOK_SECRET=whsec_votre_webhook_secret

# Flask
FLASK_SECRET_KEY=votre-cle-secrete-unique
FLASK_DEBUG=true

# URLs de redirection pour Stripe Connect
FRONTEND_URL=http://localhost:3000
ONBOARDING_REFRESH_URL=http://localhost:3000/onboarding/refresh
ONBOARDING_RETURN_URL=http://localhost:3000/onboarding/complete
```

### Démarrage

```bash
# Développement
python -m src.app

# Production avec Gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 src.app:app
```

## 📚 Utilisation de l'API

### Créer un paiement

```bash
POST /payments
Content-Type: application/json

{
    "fan_id": "fan_123",
    "creator_id": "creator_456", 
    "amount_euros": 250.0,
    "currency": "eur",
    "metadata": {
        "tip": "true",
        "message": "Merci pour le contenu!"
    }
}
```

**Réponse :**
```json
{
    "success": true,
    "payment_intent_id": "pi_xxxxx",
    "client_secret": "pi_xxxxx_secret_xxxxx",
    "amount_cents": 25000,
    "amount_euros": 250.0,
    "fee_cents": 3750,
    "fee_euros": 37.50,
    "net_amount_cents": 21250,
    "net_amount_euros": 212.50,
    "commission_breakdown": [
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
            "amount_in_tier_euros": 200.0,
            "fee_euros": 50.0
        }
    ]
}
```

### Créer un compte créatrice

```bash
POST /creators/{creator_id}/account
Content-Type: application/json

{
    "email": "creatrice@example.com",
    "country": "FR"
}
```

### Estimer une commission

```bash
POST /commission/estimate
Content-Type: application/json

{
    "amount_euros": 300.0,
    "monthly_revenue_euros": 1500.0
}
```

### Consulter un paiement

```bash
GET /payments/{payment_intent_id}
```

### Annuler un paiement

```bash
POST /payments/{payment_intent_id}/cancel
```

### Consulter le revenu mensuel

```bash
GET /creators/{creator_id}/revenue/{year}/{month}
```

## 🔧 Configuration Avancée

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (obligatoire) | - |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe | - |
| `FLASK_SECRET_KEY` | Clé secrète Flask | `dev-secret-key` |
| `DATABASE_URL` | URL de la base de données | `sqlite:///payments.db` |
| `FLASK_ENV` | Environnement (development/production) | `development` |
| `PORT` | Port du serveur | `5000` |
| `LOG_LEVEL` | Niveau de log | `INFO` |

### Configuration Stripe Connect

1. **Activez Stripe Connect** dans votre dashboard Stripe
2. **Configurez l'URL de redirection** : `{FRONTEND_URL}/onboarding/complete`
3. **Ajoutez l'endpoint webhook** : `{API_URL}/webhook/stripe`
4. **Sélectionnez les événements** :
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`

## 🧪 Tests

### Tests unitaires

```bash
# Installation des dépendances de test
pip install pytest pytest-flask

# Exécution des tests
pytest tests/
```

### Test de l'API

```bash
# Vérification de santé
curl http://localhost:5000/health

# Test de calcul de commission
curl -X POST http://localhost:5000/commission/estimate \
  -H "Content-Type: application/json" \
  -d '{"amount_euros": 300, "monthly_revenue_euros": 1500}'
```

## 📁 Structure du Projet

```
payment/
├── src/
│   ├── app.py                 # Application Flask principale
│   ├── stripe_service.py      # Service Stripe Connect
│   ├── commission_calculator.py # Calcul des commissions
│   └── models.py             # Modèles de données
├── config/
│   └── settings.py           # Configuration centralisée
├── tests/
│   ├── test_commission.py    # Tests du calculateur
│   ├── test_stripe.py        # Tests Stripe
│   └── test_api.py          # Tests API
├── requirements.txt          # Dépendances Python
├── .env.example             # Exemple de configuration
└── README.md               # Documentation
```

## 🛠️ Développement

### Calculateur de Commission

Le module `commission_calculator.py` implémente la logique de commission dégressive :

```python
from src.commission_calculator import CommissionCalculator

calculator = CommissionCalculator()

# Calcul pour un paiement de 300€ avec 1500€ déjà généré ce mois
fee_cents = calculator.calculate_fee(30000, 150000)  # En centimes
print(f"Commission: {fee_cents/100:.2f}€")

# Détail par palier
breakdown = calculator.get_tier_breakdown(30000, 150000)
for tier in breakdown:
    print(f"Palier {tier['tier_number']}: {tier['fee_euros']:.2f}€")
```

### Service Stripe

Le module `stripe_service.py` gère toutes les interactions avec Stripe :

```python
from src.stripe_service import StripePaymentService

service = StripePaymentService()

# Création d'un paiement
result = service.create_payment_intent(
    amount_euros=250.0,
    connected_account_id="acct_xxxxx",
    fan_id="fan_123",
    monthly_revenue_cents=150000
)
```

## 🔒 Sécurité

- ✅ Validation des données d'entrée
- ✅ Vérification des signatures webhook
- ✅ Gestion sécurisée des clés API
- ✅ Logs d'audit des transactions
- ✅ Isolation des comptes via Stripe Connect

## 📈 Monitoring

### Logs

L'application log automatiquement :
- Création/confirmation/échec des paiements
- Erreurs Stripe
- Activité des webhooks
- Validation des configurations

### Métriques

Endpoints pour monitoring :
- `GET /health` : État de l'application
- `GET /creators/{id}/revenue/{year}/{month}` : Statistiques de revenu

## 🚀 Déploiement

### Docker (optionnel)

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "src.app:app"]
```

### Variables d'environnement de production

```bash
FLASK_ENV=production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://...
FRONTEND_URL=https://votre-domaine.com
```

## 🤝 Support

Pour toute question ou problème :
1. Consultez les logs de l'application
2. Vérifiez la configuration Stripe
3. Testez avec les clés de test Stripe
4. Consultez la documentation Stripe Connect

## 📄 Licence

Ce code est fourni à des fins éducatives et de démonstration. Adaptez-le selon vos besoins de production.