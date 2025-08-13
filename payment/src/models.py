"""
Modèles de données pour le système de paiement OFM.
Définit les structures pour les transactions, revenus mensuels et comptes.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from enum import Enum
from decimal import Decimal, ROUND_HALF_UP
import json


class TransactionStatus(Enum):
    """Statuts possibles d'une transaction."""
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    CANCELED = "canceled"
    FAILED = "failed"


class AccountStatus(Enum):
    """Statuts possibles d'un compte Connect."""
    INCOMPLETE = "incomplete"
    PENDING = "pending"
    ACTIVE = "active"
    RESTRICTED = "restricted"
    SUSPENDED = "suspended"


@dataclass
class Transaction:
    """Représente une transaction de paiement."""
    
    id: str
    fan_id: str
    creator_id: str
    amount_cents: int
    fee_cents: int
    net_amount_cents: int
    currency: str
    status: TransactionStatus
    stripe_payment_intent_id: str
    stripe_connected_account_id: str
    monthly_revenue_before_cents: int
    created_at: datetime
    updated_at: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def amount_euros(self) -> float:
        """Retourne le montant en euros."""
        return self.amount_cents / 100
    
    @property
    def fee_euros(self) -> float:
        """Retourne la commission en euros."""
        return self.fee_cents / 100
    
    @property
    def net_amount_euros(self) -> float:
        """Retourne le montant net en euros."""
        return self.net_amount_cents / 100
    
    @property
    def effective_commission_rate(self) -> float:
        """Retourne le taux de commission effectif en pourcentage."""
        if self.amount_cents == 0:
            return 0.0
        return (self.fee_cents / self.amount_cents) * 100
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit la transaction en dictionnaire."""
        return {
            'id': self.id,
            'fan_id': self.fan_id,
            'creator_id': self.creator_id,
            'amount_cents': self.amount_cents,
            'amount_euros': self.amount_euros,
            'fee_cents': self.fee_cents,
            'fee_euros': self.fee_euros,
            'net_amount_cents': self.net_amount_cents,
            'net_amount_euros': self.net_amount_euros,
            'currency': self.currency,
            'status': self.status.value,
            'stripe_payment_intent_id': self.stripe_payment_intent_id,
            'stripe_connected_account_id': self.stripe_connected_account_id,
            'monthly_revenue_before_cents': self.monthly_revenue_before_cents,
            'effective_commission_rate': self.effective_commission_rate,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'metadata': self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Transaction':
        """Crée une transaction à partir d'un dictionnaire."""
        return cls(
            id=data['id'],
            fan_id=data['fan_id'],
            creator_id=data['creator_id'],
            amount_cents=data['amount_cents'],
            fee_cents=data['fee_cents'],
            net_amount_cents=data['net_amount_cents'],
            currency=data['currency'],
            status=TransactionStatus(data['status']),
            stripe_payment_intent_id=data['stripe_payment_intent_id'],
            stripe_connected_account_id=data['stripe_connected_account_id'],
            monthly_revenue_before_cents=data['monthly_revenue_before_cents'],
            created_at=datetime.fromisoformat(data['created_at']),
            updated_at=datetime.fromisoformat(data['updated_at']),
            metadata=data.get('metadata', {})
        )


@dataclass
class MonthlyRevenue:
    """Représente le revenu mensuel d'une créatrice."""
    
    creator_id: str
    year: int
    month: int
    total_revenue_cents: int
    total_fees_cents: int
    net_revenue_cents: int
    transaction_count: int
    currency: str
    created_at: datetime
    updated_at: datetime
    
    @property
    def year_month(self) -> str:
        """Retourne la période au format YYYY-MM."""
        return f"{self.year:04d}-{self.month:02d}"
    
    @property
    def total_revenue_euros(self) -> float:
        """Retourne le revenu total en euros."""
        return self.total_revenue_cents / 100
    
    @property
    def total_fees_euros(self) -> float:
        """Retourne les frais totaux en euros."""
        return self.total_fees_cents / 100
    
    @property
    def net_revenue_euros(self) -> float:
        """Retourne le revenu net en euros."""
        return self.net_revenue_cents / 100
    
    @property
    def average_transaction_euros(self) -> float:
        """Retourne la transaction moyenne en euros."""
        if self.transaction_count == 0:
            return 0.0
        return self.total_revenue_euros / self.transaction_count
    
    @property
    def effective_commission_rate(self) -> float:
        """Retourne le taux de commission effectif du mois."""
        if self.total_revenue_cents == 0:
            return 0.0
        return (self.total_fees_cents / self.total_revenue_cents) * 100
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le revenu mensuel en dictionnaire."""
        return {
            'creator_id': self.creator_id,
            'year': self.year,
            'month': self.month,
            'year_month': self.year_month,
            'total_revenue_cents': self.total_revenue_cents,
            'total_revenue_euros': self.total_revenue_euros,
            'total_fees_cents': self.total_fees_cents,
            'total_fees_euros': self.total_fees_euros,
            'net_revenue_cents': self.net_revenue_cents,
            'net_revenue_euros': self.net_revenue_euros,
            'transaction_count': self.transaction_count,
            'average_transaction_euros': self.average_transaction_euros,
            'effective_commission_rate': self.effective_commission_rate,
            'currency': self.currency,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


@dataclass
class CreatorAccount:
    """Représente un compte créatrice avec ses informations Stripe Connect."""
    
    creator_id: str
    email: str
    stripe_account_id: str
    account_status: AccountStatus
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    country: str
    currency: str
    onboarding_completed: bool
    created_at: datetime
    updated_at: datetime
    requirements: Optional[Dict[str, List[str]]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def is_active(self) -> bool:
        """Vérifie si le compte est actif et peut recevoir des paiements."""
        return (
            self.account_status == AccountStatus.ACTIVE and
            self.charges_enabled and
            self.details_submitted
        )
    
    @property
    def can_receive_payouts(self) -> bool:
        """Vérifie si le compte peut recevoir des virements."""
        return self.payouts_enabled and self.is_active
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit le compte en dictionnaire."""
        return {
            'creator_id': self.creator_id,
            'email': self.email,
            'stripe_account_id': self.stripe_account_id,
            'account_status': self.account_status.value,
            'charges_enabled': self.charges_enabled,
            'payouts_enabled': self.payouts_enabled,
            'details_submitted': self.details_submitted,
            'country': self.country,
            'currency': self.currency,
            'onboarding_completed': self.onboarding_completed,
            'is_active': self.is_active,
            'can_receive_payouts': self.can_receive_payouts,
            'requirements': self.requirements,
            'metadata': self.metadata,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


@dataclass
class PaymentRequest:
    """Représente une demande de paiement."""
    
    fan_id: str
    creator_id: str
    amount_euros: Decimal
    currency: str = 'eur'
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        """Convertit amount_euros en Decimal si nécessaire."""
        if not isinstance(self.amount_euros, Decimal):
            self.amount_euros = Decimal(str(self.amount_euros))
    
    @property
    def amount_cents(self) -> int:
        """Retourne le montant en centimes avec arrondi correct."""
        cents = self.amount_euros * 100
        return int(cents.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    
    def validate(self) -> List[str]:
        """Valide la demande de paiement et retourne les erreurs."""
        errors = []
        
        if not self.fan_id:
            errors.append("fan_id est requis")
        
        if not self.creator_id:
            errors.append("creator_id est requis")
        
        # Validation du montant avec Decimal
        try:
            if self.amount_euros <= 0:
                errors.append("Le montant doit être positif")
            
            if self.amount_euros < Decimal('0.50'):  # Minimum Stripe
                errors.append("Le montant minimum est de 0.50€")
            
            if self.amount_euros > Decimal('999999.99'):  # Maximum raisonnable
                errors.append("Le montant maximum est de 999999.99€")
            
            # Vérification de la précision (max 2 décimales)
            if self.amount_euros.as_tuple().exponent < -2:
                errors.append("Le montant ne peut avoir plus de 2 décimales")
        except Exception as e:
            errors.append(f"Montant invalide: {str(e)}")
        
        if self.currency.lower() != 'eur':
            errors.append("Seule la devise EUR est supportée")
        
        # Validation des IDs (protection contre injection)
        if not self.fan_id.replace('_', '').replace('-', '').isalnum():
            errors.append("fan_id contient des caractères invalides")
        
        if not self.creator_id.replace('_', '').replace('-', '').isalnum():
            errors.append("creator_id contient des caractères invalides")
        
        return errors
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit la demande en dictionnaire."""
        return {
            'fan_id': self.fan_id,
            'creator_id': self.creator_id,
            'amount_euros': float(self.amount_euros),
            'amount_cents': self.amount_cents,
            'currency': self.currency,
            'metadata': self.metadata
        }


@dataclass
class PaymentResponse:
    """Représente la réponse à une demande de paiement."""
    
    success: bool
    payment_intent_id: Optional[str] = None
    client_secret: Optional[str] = None
    amount_cents: Optional[int] = None
    fee_cents: Optional[int] = None
    net_amount_cents: Optional[int] = None
    commission_breakdown: Optional[List[Dict[str, Any]]] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit la réponse en dictionnaire."""
        result = {
            'success': self.success
        }
        
        if self.success:
            result.update({
                'payment_intent_id': self.payment_intent_id,
                'client_secret': self.client_secret,
                'amount_cents': self.amount_cents,
                'amount_euros': self.amount_cents / 100 if self.amount_cents else None,
                'fee_cents': self.fee_cents,
                'fee_euros': self.fee_cents / 100 if self.fee_cents else None,
                'net_amount_cents': self.net_amount_cents,
                'net_amount_euros': self.net_amount_cents / 100 if self.net_amount_cents else None,
                'commission_breakdown': self.commission_breakdown
            })
        else:
            result.update({
                'error_message': self.error_message,
                'error_code': self.error_code
            })
        
        return result


# Fonctions utilitaires pour la manipulation des modèles
def create_transaction_id() -> str:
    """Génère un ID unique pour une transaction."""
    from uuid import uuid4
    return f"txn_{uuid4().hex[:16]}"


def get_current_month_revenue_period() -> tuple[int, int]:
    """Retourne l'année et le mois actuels."""
    now = datetime.now(timezone.utc)
    return now.year, now.month


def format_currency(amount_cents: int, currency: str = 'EUR') -> str:
    """Formate un montant en centimes selon la devise."""
    amount = amount_cents / 100
    if currency.upper() == 'EUR':
        return f"{amount:.2f}€"
    else:
        return f"{amount:.2f} {currency.upper()}"


def validate_monetary_amount(amount: Any, field_name: str = "amount") -> Decimal:
    """
    Valide et convertit un montant monétaire en Decimal.
    
    Args:
        amount: Montant à valider (string, float, int ou Decimal)
        field_name: Nom du champ pour les messages d'erreur
        
    Returns:
        Montant validé en Decimal
        
    Raises:
        ValueError: Si le montant est invalide
    """
    try:
        # Conversion en Decimal
        if isinstance(amount, Decimal):
            decimal_amount = amount
        else:
            # Convertir en string d'abord pour éviter les problèmes de float
            decimal_amount = Decimal(str(amount))
        
        # Vérification de la validité
        if decimal_amount.is_nan() or decimal_amount.is_infinite():
            raise ValueError(f"{field_name} invalide")
        
        # Vérification de la précision (max 2 décimales pour les euros)
        if decimal_amount.as_tuple().exponent < -2:
            # Arrondir à 2 décimales
            decimal_amount = decimal_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        return decimal_amount
        
    except Exception as e:
        raise ValueError(f"{field_name} invalide: {str(e)}")


# Exemples d'utilisation
if __name__ == "__main__":
    from datetime import datetime, timezone
    
    # Exemple de transaction
    transaction = Transaction(
        id="txn_example123",
        fan_id="fan_001",
        creator_id="creator_001",
        amount_cents=300_000,  # 3000€
        fee_cents=37_500,      # 375€ (exemple)
        net_amount_cents=262_500,  # 2625€
        currency="eur",
        status=TransactionStatus.SUCCEEDED,
        stripe_payment_intent_id="pi_example123",
        stripe_connected_account_id="acct_example123",
        monthly_revenue_before_cents=150_000,  # 1500€
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    
    print("=== Exemple de Transaction ===")
    print(f"Montant: {transaction.amount_euros}€")
    print(f"Commission: {transaction.fee_euros}€ ({transaction.effective_commission_rate:.2f}%)")
    print(f"Net créatrice: {transaction.net_amount_euros}€")
    print(f"Statut: {transaction.status.value}")
    
    # Exemple de demande de paiement avec Decimal
    request = PaymentRequest(
        fan_id="fan_002",
        creator_id="creator_002",
        amount_euros=Decimal("250.00"),
        metadata={"tip": "true", "message": "Merci pour le contenu!"}
    )
    
    errors = request.validate()
    if errors:
        print(f"\nErreurs de validation: {errors}")
    else:
        print(f"\nDemande valide: {request.amount_euros}€ pour {request.creator_id}")
    
    # Test de validation monétaire
    print("\n=== Tests de validation monétaire ===")
    test_amounts = ["123.45", "123.456", 123.45, Decimal("123.45"), "abc"]
    for amount in test_amounts:
        try:
            validated = validate_monetary_amount(amount)
            print(f"{amount} -> {validated} (type: {type(validated).__name__})")
        except ValueError as e:
            print(f"{amount} -> Erreur: {e}")