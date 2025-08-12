# 📦 Legacy

## Anciens Fichiers de Développement

**Note** : Les fichiers legacy originaux ont été supprimés car ils contenaient des détails d'implémentation spécifiques à d'autres projets non liés au système OFM Social OS.

---

## 🔄 Migration Vers Nouvelle Architecture

### Éléments Migrés vers OFM Social OS
✅ **Login Systems** → OAuth integration dans `/backend/api/`  
✅ **Manual typing simulation** → Respectful rate limiting
✅ **Direct browser interaction** → Official API endpoints

### Éléments Dépréciés
❌ **Direct DOM manipulation** → API officielle Instagram Graph  
❌ **Browser automation** → Official platform APIs
❌ **Client-side scraping** → Server-side API integration

---

## 📚 Historique de Développement

### Phase 1 : Prototypes JavaScript
- Scripts individuels pour chaque fonctionnalité
- Automation basée sur manipulation DOM
- Tests manuels et validation empirique

### Phase 2 : Intégration Services
- Consolidation scripts en modules
- Ajout rate limiting et sécurité
- Développement prototypes automation

### Phase 3 : Architecture Moderne ✅
- Migration vers TypeScript + API officielles
- Architecture microservices
- Tests automatisés et CI/CD
- Observabilité complète

---

## ⚠️ Notes de Migration

### Non Compatible
Ces fichiers ne sont **PAS compatibles** avec la nouvelle architecture et sont conservés uniquement pour référence historique.

### Récupération de Logique
Si besoin de récupérer de la logique spécifique :
1. Identifier la fonctionnalité dans legacy
2. Vérifier équivalent moderne dans `/backend/` ou `/automation/`  
3. Adapter si nécessaire selon nouvelles APIs

### Nettoyage
Ces fichiers peuvent être supprimés après validation complète du nouveau système en production.