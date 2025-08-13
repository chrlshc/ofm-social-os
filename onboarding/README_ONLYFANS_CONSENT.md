# Guide d'intégration OnlyFans avec consentement RGPD

## Vue d'ensemble

L'intégration OnlyFans dans le système OFM doit respecter strictement le RGPD et obtenir le consentement explicite des créateurs avant toute collecte de données. Ce document détaille l'approche recommandée pour une intégration conforme et éthique.

## Principes RGPD à respecter

### 1. Consentement explicite et éclairé
- Le créateur doit explicitement accepter la collecte de ses données OnlyFans
- Le consentement doit être distinct de l'acceptation des CGU
- Il doit être possible de refuser sans bloquer l'utilisation du service

### 2. Finalité claire et limitée
- Expliquer précisément pourquoi les données sont collectées
- Limiter la collecte au strict nécessaire
- Ne pas utiliser les données pour d'autres finalités sans nouveau consentement

### 3. Droit à l'oubli
- Permettre la suppression complète des données OnlyFans
- Conserver une preuve du consentement avec horodatage

## Architecture proposée

### Modèle de consentement

```python
# onboarding/models.py
class OnlyFansConsent(Base):
    __tablename__ = 'onlyfans_consents'
    
    id = Column(String(50), primary_key=True)
    user_id = Column(String(50), ForeignKey('users.id'), unique=True)
    
    # Consentement détaillé
    consent_given = Column(Boolean, default=False)
    consent_date = Column(DateTime, nullable=True)
    consent_ip = Column(String(45), nullable=True)  # IPv4/IPv6
    consent_version = Column(String(10), nullable=True)  # Version des conditions
    
    # Portée du consentement
    allow_stats_collection = Column(Boolean, default=False)
    allow_revenue_analysis = Column(Boolean, default=False)
    allow_content_analysis = Column(Boolean, default=False)
    allow_marketing_automation = Column(Boolean, default=False)
    
    # Révocation
    revoked = Column(Boolean, default=False)
    revoked_date = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### Service de collecte avec consentement

```python
# onboarding/onlyfans_analyzer.py
class OnlyFansAnalyzer:
    """
    Analyse OnlyFans avec vérification stricte du consentement
    """
    
    @staticmethod
    def analyze_with_consent(user_id: str, handle: str, db: Session) -> Dict[str, Any]:
        """
        Analyse OnlyFans uniquement avec consentement valide
        
        Args:
            user_id: ID de l'utilisateur
            handle: Handle OnlyFans
            db: Session de base de données
            
        Returns:
            Données analysées ou valeurs par défaut si pas de consentement
        """
        # Vérifier le consentement
        consent = db.query(OnlyFansConsent).filter_by(
            user_id=user_id,
            consent_given=True,
            revoked=False
        ).first()
        
        if not consent:
            logger.info(f"Pas de consentement OnlyFans pour l'utilisateur {user_id}")
            return {
                "account_size": "unknown",
                "pricing_tier": "entry",
                "consent_required": True
            }
        
        # Vérifier les permissions spécifiques
        results = {"consent_valid": True}
        
        try:
            if consent.allow_stats_collection:
                # Collecter uniquement les statistiques autorisées
                stats = cls._collect_public_stats(handle)
                results["account_size"] = cls._classify_account_size(stats)
            
            if consent.allow_revenue_analysis:
                # Analyser les revenus si autorisé
                revenue = cls._analyze_revenue_metrics(handle)
                results["pricing_tier"] = cls._determine_pricing_tier(revenue)
            
            if consent.allow_content_analysis:
                # Analyser le contenu si autorisé
                content = cls._analyze_content_categories(handle)
                results["content_categories"] = content
            
            # Logger la collecte pour l'audit
            cls._log_data_collection(user_id, consent.id, results.keys())
            
        except Exception as e:
            logger.error(f"Erreur lors de l'analyse OnlyFans: {str(e)}")
            results["error"] = "Collection failed"
        
        return results
    
    @classmethod
    def _collect_public_stats(cls, handle: str) -> Dict:
        """
        Collecte uniquement les données publiques ou avec API officielle
        
        IMPORTANT: N'utilisez jamais de scraping non autorisé.
        Utilisez uniquement :
        - L'API officielle OnlyFans (si disponible)
        - Les données publiquement accessibles
        - Les données fournies directement par le créateur
        """
        # Implémentation avec API officielle ou formulaire manuel
        raise NotImplementedError("Implémenter avec API officielle OnlyFans")
    
    @classmethod
    def _log_data_collection(cls, user_id: str, consent_id: str, data_types: List[str]):
        """Log chaque collecte de données pour l'audit RGPD"""
        audit_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "consent_id": consent_id,
            "data_types": data_types,
            "purpose": "marketing_optimization"
        }
        # Stocker dans un log d'audit sécurisé
        logger.info(f"Data collection audit: {audit_entry}")
```

### Endpoint de gestion du consentement

```python
# onboarding/routes.py
@bp.route("/onlyfans/consent", methods=["POST"])
@require_auth(["creator"])
def manage_onlyfans_consent():
    """
    Gérer le consentement pour la collecte de données OnlyFans
    
    Body:
        consent_given: bool - Consentement global
        allow_stats_collection: bool - Autoriser collecte des stats
        allow_revenue_analysis: bool - Autoriser analyse des revenus
        allow_content_analysis: bool - Autoriser analyse du contenu
        allow_marketing_automation: bool - Autoriser automatisation marketing
        
    Returns:
        200: Consentement enregistré
    """
    try:
        data = request.get_json()
        consent_given = data.get("consent_given", False)
        
        with get_db_session() as db:
            # Chercher ou créer l'enregistrement de consentement
            consent = db.query(OnlyFansConsent).filter_by(
                user_id=request.user_id
            ).first()
            
            if not consent:
                consent = OnlyFansConsent(user_id=request.user_id)
                db.add(consent)
            
            # Mettre à jour le consentement
            consent.consent_given = consent_given
            
            if consent_given:
                consent.consent_date = datetime.utcnow()
                consent.consent_ip = request.remote_addr
                consent.consent_version = "v1.0"
                consent.allow_stats_collection = data.get("allow_stats_collection", False)
                consent.allow_revenue_analysis = data.get("allow_revenue_analysis", False)
                consent.allow_content_analysis = data.get("allow_content_analysis", False)
                consent.allow_marketing_automation = data.get("allow_marketing_automation", False)
                consent.revoked = False
            else:
                # Révocation du consentement
                consent.revoked = True
                consent.revoked_date = datetime.utcnow()
            
            db.commit()
            
            return success_response({
                "consent_recorded": True,
                "consent_given": consent_given,
                "timestamp": consent.consent_date.isoformat() if consent_given else None
            })
    
    except Exception as e:
        logger.error(f"Erreur gestion consentement: {str(e)}")
        return error_response("Échec enregistrement consentement", 500)


@bp.route("/onlyfans/consent", methods=["GET"])
@require_auth(["creator"])
def get_onlyfans_consent():
    """Récupérer l'état actuel du consentement OnlyFans"""
    try:
        with get_db_session() as db:
            consent = db.query(OnlyFansConsent).filter_by(
                user_id=request.user_id
            ).first()
            
            if not consent:
                return success_response({
                    "consent_given": False,
                    "never_consented": True
                })
            
            return success_response({
                "consent_given": consent.consent_given and not consent.revoked,
                "consent_date": consent.consent_date.isoformat() if consent.consent_date else None,
                "permissions": {
                    "stats_collection": consent.allow_stats_collection,
                    "revenue_analysis": consent.allow_revenue_analysis,
                    "content_analysis": consent.allow_content_analysis,
                    "marketing_automation": consent.allow_marketing_automation
                },
                "revoked": consent.revoked
            })
    
    except Exception as e:
        logger.error(f"Erreur récupération consentement: {str(e)}")
        return error_response("Échec récupération consentement", 500)
```

## Interface utilisateur recommandée

### Modal de consentement

```typescript
// ConsentModal.tsx
interface ConsentModalProps {
  onAccept: (permissions: ConsentPermissions) => void;
  onDecline: () => void;
}

const OnlyFansConsentModal: React.FC<ConsentModalProps> = ({ onAccept, onDecline }) => {
  const [permissions, setPermissions] = useState({
    allow_stats_collection: true,
    allow_revenue_analysis: true,
    allow_content_analysis: false,
    allow_marketing_automation: true
  });

  return (
    <Modal>
      <h2>Autorisation d'accès aux données OnlyFans</h2>
      
      <div className="consent-intro">
        <p>
          Pour optimiser votre stratégie marketing, nous pouvons analyser 
          vos données OnlyFans. Cette analyse est entièrement optionnelle 
          et vous gardez le contrôle total de vos données.
        </p>
      </div>

      <div className="consent-details">
        <h3>Données collectées et finalités :</h3>
        
        <ConsentOption
          checked={permissions.allow_stats_collection}
          onChange={(checked) => setPermissions({...permissions, allow_stats_collection: checked})}
          title="Statistiques publiques"
          description="Nombre d'abonnés, taux de croissance pour déterminer votre segment de marché"
        />
        
        <ConsentOption
          checked={permissions.allow_revenue_analysis}
          onChange={(checked) => setPermissions({...permissions, allow_revenue_analysis: checked})}
          title="Analyse des revenus"
          description="Revenus mensuels pour optimiser votre tarification et commission"
        />
        
        <ConsentOption
          checked={permissions.allow_content_analysis}
          onChange={(checked) => setPermissions({...permissions, allow_content_analysis: checked})}
          title="Catégories de contenu"
          description="Types de contenu pour personnaliser les stratégies marketing"
        />
        
        <ConsentOption
          checked={permissions.allow_marketing_automation}
          onChange={(checked) => setPermissions({...permissions, allow_marketing_automation: checked})}
          title="Automatisation marketing"
          description="Utiliser ces données pour des suggestions automatiques"
        />
      </div>

      <div className="consent-rights">
        <h4>Vos droits RGPD :</h4>
        <ul>
          <li>✓ Retirer votre consentement à tout moment</li>
          <li>✓ Demander la suppression complète de vos données</li>
          <li>✓ Accéder à toutes les données collectées</li>
          <li>✓ Rectifier les informations incorrectes</li>
        </ul>
      </div>

      <div className="consent-actions">
        <button onClick={onDecline} className="btn-secondary">
          Continuer sans analyse
        </button>
        <button onClick={() => onAccept(permissions)} className="btn-primary">
          J'accepte l'analyse sélectionnée
        </button>
      </div>
    </Modal>
  );
};
```

## Bonnes pratiques d'implémentation

### 1. Approche progressive
- Proposer le consentement OnlyFans après l'onboarding initial
- Ne jamais bloquer l'accès au service si refus
- Permettre de donner le consentement plus tard

### 2. Transparence totale
- Afficher clairement quelles données sont collectées
- Expliquer comment elles seront utilisées
- Montrer les bénéfices concrets pour le créateur

### 3. Sécurité des données
- Chiffrer toutes les données OnlyFans au repos
- Limiter l'accès aux employés autorisés uniquement
- Implémenter un audit trail complet

### 4. Alternative manuelle
Si l'API OnlyFans n'est pas disponible, proposer un formulaire manuel :

```python
@bp.route("/onlyfans/manual-stats", methods=["POST"])
@require_auth(["creator"])
def submit_manual_stats():
    """
    Permet au créateur de soumettre manuellement ses statistiques
    
    Body:
        subscriber_count: int
        monthly_revenue: float
        content_categories: List[str]
    """
    # Validation et stockage sécurisé
    pass
```

## Conformité légale

### Documentation requise
1. **Politique de confidentialité** détaillant :
   - Types de données collectées
   - Finalités du traitement
   - Base légale (consentement)
   - Durée de conservation
   - Droits des utilisateurs

2. **Registre des traitements** incluant :
   - Date et heure du consentement
   - Version des conditions acceptées
   - IP de consentement
   - Données effectivement collectées

3. **Procédures internes** pour :
   - Suppression des données sur demande
   - Export des données personnelles
   - Notification en cas de violation

## Conclusion

Cette approche garantit une collecte éthique et légale des données OnlyFans tout en offrant de la valeur aux créateurs. Le consentement explicite et granulaire permet aux créateurs de garder le contrôle total sur leurs données tout en bénéficiant d'optimisations marketing personnalisées.