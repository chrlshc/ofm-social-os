"""
Module de calcul de commission dégressive pour le système de paiement OFM.
Applique une grille de commission par paliers mensuels.
"""

from typing import List, Tuple
from dataclasses import dataclass


@dataclass
class CommissionTier:
    """Représente un palier de commission."""
    min_amount: int  # En centimes d'euro
    max_amount: int  # En centimes d'euro
    rate: float      # Taux de commission (0.0 à 1.0)


class CommissionCalculator:
    """Calculateur de commission dégressive basé sur les paliers mensuels."""
    
    def __init__(self):
        """Initialise avec la grille de commission OFM."""
        self.commission_tiers = [
            CommissionTier(0, 200_000, 0.00),           # 0% jusqu'à 2 000€
            CommissionTier(200_000, 500_000, 0.25),     # 25% de 2k à 5k€
            CommissionTier(500_000, 1_000_000, 0.20),   # 20% de 5k à 10k€
            CommissionTier(1_000_000, 2_000_000, 0.15), # 15% de 10k à 20k€
            CommissionTier(2_000_000, 3_000_000, 0.10), # 10% de 20k à 30k€
            CommissionTier(3_000_000, float('inf'), 0.10) # 10% au-delà de 30k€
        ]
    
    def calculate_fee(self, payment_amount_cents: int, monthly_revenue_cents: int) -> int:
        """
        Calcule la commission sur un paiement en fonction du revenu mensuel déjà généré.
        
        Args:
            payment_amount_cents: Montant du paiement en centimes
            monthly_revenue_cents: Revenu mensuel déjà généré en centimes
            
        Returns:
            Commission à prélever en centimes
        """
        remaining_payment = payment_amount_cents
        total_fee = 0
        current_position = monthly_revenue_cents
        
        for tier in self.commission_tiers:
            if remaining_payment <= 0:
                break
                
            # Si on a déjà dépassé ce palier, on continue
            if current_position >= tier.max_amount:
                continue
            
            # Calcule la portion du paiement qui tombe dans ce palier
            tier_start = max(tier.min_amount, current_position)
            tier_available_space = tier.max_amount - tier_start
            tier_portion = min(remaining_payment, tier_available_space)
            
            # Applique le taux de commission sur cette portion
            tier_fee = int(tier_portion * tier.rate)
            total_fee += tier_fee
            
            # Met à jour pour le prochain palier
            current_position += tier_portion
            remaining_payment -= tier_portion
        
        return total_fee
    
    def get_tier_breakdown(self, payment_amount_cents: int, monthly_revenue_cents: int) -> List[dict]:
        """
        Retourne le détail de la répartition par palier pour un paiement donné.
        
        Args:
            payment_amount_cents: Montant du paiement en centimes
            monthly_revenue_cents: Revenu mensuel déjà généré en centimes
            
        Returns:
            Liste des paliers avec montants et commissions détaillés
        """
        breakdown = []
        remaining_payment = payment_amount_cents
        current_position = monthly_revenue_cents
        
        for i, tier in enumerate(self.commission_tiers):
            if remaining_payment <= 0:
                break
                
            if current_position >= tier.max_amount:
                continue
            
            tier_start = max(tier.min_amount, current_position)
            tier_available_space = tier.max_amount - tier_start
            tier_portion = min(remaining_payment, tier_available_space)
            tier_fee = int(tier_portion * tier.rate)
            
            breakdown.append({
                'tier_number': i + 1,
                'tier_range': f"{tier.min_amount/100:.0f}€ - {tier.max_amount/100:.0f}€" if tier.max_amount != float('inf') else f"{tier.min_amount/100:.0f}€+",
                'rate': f"{tier.rate*100:.0f}%",
                'amount_in_tier_cents': tier_portion,
                'amount_in_tier_euros': tier_portion / 100,
                'fee_cents': tier_fee,
                'fee_euros': tier_fee / 100
            })
            
            current_position += tier_portion
            remaining_payment -= tier_portion
        
        return breakdown
    
    def estimate_monthly_fees(self, monthly_revenue_cents: int) -> dict:
        """
        Estime les frais totaux pour un revenu mensuel donné.
        
        Args:
            monthly_revenue_cents: Revenu mensuel total en centimes
            
        Returns:
            Dictionnaire avec le détail des frais par palier
        """
        total_fees = self.calculate_fee(monthly_revenue_cents, 0)
        breakdown = self.get_tier_breakdown(monthly_revenue_cents, 0)
        
        return {
            'monthly_revenue_cents': monthly_revenue_cents,
            'monthly_revenue_euros': monthly_revenue_cents / 100,
            'total_fees_cents': total_fees,
            'total_fees_euros': total_fees / 100,
            'effective_rate': (total_fees / monthly_revenue_cents * 100) if monthly_revenue_cents > 0 else 0,
            'tier_breakdown': breakdown
        }


# Fonction utilitaire pour les tests et exemples
def format_euros(cents: int) -> str:
    """Formate un montant en centimes en euros avec 2 décimales."""
    return f"{cents / 100:.2f}€"


# Exemples d'utilisation
if __name__ == "__main__":
    calculator = CommissionCalculator()
    
    # Exemple 1: Première transaction du mois de 1500€
    print("=== Exemple 1: Première transaction de 1500€ ===")
    payment = 150_000  # 1500€ en centimes
    monthly_revenue = 0
    fee = calculator.calculate_fee(payment, monthly_revenue)
    print(f"Paiement: {format_euros(payment)}")
    print(f"Revenu mensuel actuel: {format_euros(monthly_revenue)}")
    print(f"Commission: {format_euros(fee)}")
    print(f"Net pour la créatrice: {format_euros(payment - fee)}")
    print()
    
    # Exemple 2: Transaction de 2000€ avec 1500€ déjà généré ce mois
    print("=== Exemple 2: Transaction de 2000€ avec 1500€ déjà généré ===")
    payment = 200_000  # 2000€ en centimes
    monthly_revenue = 150_000  # 1500€ déjà généré
    fee = calculator.calculate_fee(payment, monthly_revenue)
    breakdown = calculator.get_tier_breakdown(payment, monthly_revenue)
    print(f"Paiement: {format_euros(payment)}")
    print(f"Revenu mensuel actuel: {format_euros(monthly_revenue)}")
    print(f"Commission: {format_euros(fee)}")
    print(f"Net pour la créatrice: {format_euros(payment - fee)}")
    print("\nRépartition par palier:")
    for tier in breakdown:
        print(f"  Palier {tier['tier_number']} ({tier['tier_range']}): {tier['amount_in_tier_euros']:.2f}€ à {tier['rate']} = {tier['fee_euros']:.2f}€")
    print()
    
    # Exemple 3: Estimation pour 15000€ de revenu mensuel
    print("=== Exemple 3: Estimation pour 15000€ de revenu mensuel ===")
    estimation = calculator.estimate_monthly_fees(1_500_000)
    print(f"Revenu mensuel: {estimation['monthly_revenue_euros']:.2f}€")
    print(f"Commissions totales: {estimation['total_fees_euros']:.2f}€")
    print(f"Taux effectif: {estimation['effective_rate']:.2f}%")
    print(f"Net pour la créatrice: {estimation['monthly_revenue_euros'] - estimation['total_fees_euros']:.2f}€")