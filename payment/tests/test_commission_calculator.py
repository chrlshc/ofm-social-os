"""
Tests pour le calculateur de commission dégressive.
"""

import pytest
from src.commission_calculator import CommissionCalculator, CommissionTier


class TestCommissionCalculator:
    """Tests pour la classe CommissionCalculator."""
    
    def setup_method(self):
        """Initialise le calculateur pour chaque test."""
        self.calculator = CommissionCalculator()
    
    def test_no_commission_under_threshold(self):
        """Test : Pas de commission sous le seuil de 2000€."""
        # Paiement de 1500€ sans revenu préalable
        fee = self.calculator.calculate_fee(150_000, 0)
        assert fee == 0
        
        # Paiement de 500€ avec 1000€ déjà généré (total = 1500€)
        fee = self.calculator.calculate_fee(50_000, 100_000)
        assert fee == 0
    
    def test_commission_above_threshold(self):
        """Test : Commission appliquée au-delà du seuil."""
        # Paiement de 1000€ avec 1500€ déjà généré
        # 500€ à 0%, 500€ à 25% = 125€ de commission
        fee = self.calculator.calculate_fee(100_000, 150_000)
        expected_fee = 500 * 100 * 0.25  # 500€ à 25%
        assert fee == int(expected_fee)
    
    def test_multiple_tiers(self):
        """Test : Calcul sur plusieurs paliers."""
        # Paiement de 4000€ avec 1500€ déjà généré
        # 500€ à 0%, 3000€ à 25%, 500€ à 20%
        fee = self.calculator.calculate_fee(400_000, 150_000)
        expected_fee = (500 * 100 * 0.0) + (3000 * 100 * 0.25) + (500 * 100 * 0.20)
        assert fee == int(expected_fee)
    
    def test_high_revenue_tier(self):
        """Test : Calcul pour les gros revenus."""
        # Paiement de 5000€ avec 25000€ déjà généré (palier 10%)
        fee = self.calculator.calculate_fee(500_000, 2_500_000)
        expected_fee = 500_000 * 0.10
        assert fee == int(expected_fee)
    
    def test_tier_breakdown(self):
        """Test : Détail de la répartition par palier."""
        breakdown = self.calculator.get_tier_breakdown(300_000, 150_000)
        
        # Doit avoir 2 paliers dans ce cas
        assert len(breakdown) == 2
        
        # Premier palier (0%)
        tier_1 = breakdown[0]
        assert tier_1['tier_number'] == 1
        assert tier_1['rate'] == '0%'
        assert tier_1['amount_in_tier_euros'] == 50.0  # 500€
        assert tier_1['fee_euros'] == 0.0
        
        # Deuxième palier (25%)
        tier_2 = breakdown[1]
        assert tier_2['tier_number'] == 2
        assert tier_2['rate'] == '25%'
        assert tier_2['amount_in_tier_euros'] == 250.0  # 2500€
        assert tier_2['fee_euros'] == 62.5  # 25% de 250€
    
    def test_estimate_monthly_fees(self):
        """Test : Estimation des frais mensuels."""
        estimation = self.calculator.estimate_monthly_fees(1_500_000)  # 15000€
        
        assert estimation['monthly_revenue_euros'] == 15000.0
        
        # Calcul attendu :
        # 2000€ à 0% = 0€
        # 3000€ à 25% = 750€
        # 5000€ à 20% = 1000€ 
        # 5000€ à 15% = 750€
        # Total = 2500€
        expected_fees = 2500.0
        assert estimation['total_fees_euros'] == expected_fees
        
        # Taux effectif
        expected_rate = (expected_fees / 15000.0) * 100
        assert abs(estimation['effective_rate'] - expected_rate) < 0.01
    
    def test_zero_payment(self):
        """Test : Paiement de 0€."""
        fee = self.calculator.calculate_fee(0, 100_000)
        assert fee == 0
    
    def test_zero_monthly_revenue(self):
        """Test : Aucun revenu mensuel préalable."""
        fee = self.calculator.calculate_fee(100_000, 0)
        assert fee == 0  # 1000€ < 2000€
    
    def test_large_payment(self):
        """Test : Très gros paiement."""
        # Paiement de 50000€ sans revenu préalable
        fee = self.calculator.calculate_fee(5_000_000, 0)
        
        # Calcul attendu :
        # 2000€ à 0% = 0€
        # 3000€ à 25% = 750€
        # 5000€ à 20% = 1000€
        # 10000€ à 15% = 1500€
        # 10000€ à 10% = 1000€
        # 20000€ à 10% = 2000€
        # Total = 6250€
        expected_fee = 625_000  # 6250€ en centimes
        assert fee == expected_fee
    
    def test_exact_tier_boundaries(self):
        """Test : Paiements exactement aux limites des paliers."""
        # Paiement exactement au seuil de 2000€
        fee = self.calculator.calculate_fee(200_000, 0)
        assert fee == 0
        
        # Paiement de 1 centime au-delà du seuil
        fee = self.calculator.calculate_fee(200_001, 0)
        assert fee == 0  # 1 centime à 25% = 0 (arrondi à l'entier)
        
        # Paiement de 1€ au-delà du seuil
        fee = self.calculator.calculate_fee(200_100, 0)
        assert fee == 25  # 1€ à 25% = 25 centimes


class TestCommissionTier:
    """Tests pour la classe CommissionTier."""
    
    def test_tier_creation(self):
        """Test : Création d'un palier."""
        tier = CommissionTier(0, 200_000, 0.25)
        
        assert tier.min_amount == 0
        assert tier.max_amount == 200_000
        assert tier.rate == 0.25
    
    def test_tier_boundaries(self):
        """Test : Vérification des limites de paliers."""
        calculator = CommissionCalculator()
        tiers = calculator.commission_tiers
        
        # Vérification de la continuité des paliers
        for i in range(len(tiers) - 1):
            current_tier = tiers[i]
            next_tier = tiers[i + 1]
            assert current_tier.max_amount == next_tier.min_amount
        
        # Premier palier commence à 0
        assert tiers[0].min_amount == 0
        
        # Dernier palier va jusqu'à l'infini
        assert tiers[-1].max_amount == float('inf')


if __name__ == "__main__":
    # Exécution des tests
    pytest.main([__file__, "-v"])