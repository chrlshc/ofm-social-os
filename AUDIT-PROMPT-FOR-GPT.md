# 🔍 Prompt d'Audit Complet pour Agent GPT avec Accès GitHub

## Contexte
Tu vas auditer une implémentation complète d'un système de publication sur les réseaux sociaux (Social OS) qui vient d'être développé. Le repository est : https://github.com/chrlshc/ofm-social-os

## Mission d'Audit

### 1. Architecture et Structure
Analyser la structure complète du projet et vérifier :
- La cohérence de l'architecture Next.js 14 App Router
- L'organisation des fichiers et dossiers
- Les patterns utilisés (singleton, factory, etc.)
- La séparation des responsabilités

### 2. Sécurité
Examiner en détail :
- L'implémentation du chiffrement AES-256-GCM dans `/src/lib/crypto.ts`
- La protection CSRF dans les OAuth flows
- La validation des inputs et sanitization
- Les potentielles vulnérabilités SQL injection
- La gestion des secrets et tokens
- Les headers de sécurité

### 3. OAuth Implementation
Pour chaque plateforme (Reddit, Instagram, TikTok) :
- Vérifier le flow OAuth complet
- La gestion des états et cookies
- Le refresh des tokens
- La conformité avec les specs de chaque API
- Les error handlers

### 4. API Endpoints
Tester et documenter tous les endpoints :
- `/api/social/auth/*` - OAuth flows
- `/api/social/accounts` - Gestion des comptes
- `/api/social/publish` - Publication
- `/api/stripe/connect` - Stripe integration
- Vérifier les status codes, error handling, et responses

### 5. Database Schema
Analyser :
- Le schema PostgreSQL dans `schema.sql` et `migration-social-os.sql`
- Les indexes et performances
- Les contraintes et relations
- L'idempotence implementation

### 6. Worker System
Examiner :
- L'implémentation pg-boss dans les workers
- La gestion des retry et backoff
- Les job queues et scheduling
- La scalabilité

### 7. Frontend Components
Vérifier :
- `/src/app/schedule/page.tsx` - Fonctionnalités et UX
- `/src/components/ConnectAccountModal.tsx` - États et interactions
- L'accessibilité (a11y)
- La gestion des erreurs côté client

### 8. Integration Points
Tester :
- L'intégration avec le système utilisateur existant
- Stripe Connect flow
- Les dépendances entre services
- Les points de failure potentiels

### 9. Documentation
Évaluer :
- README-SOCIAL-OS-COMPLETE.md
- DEPLOYMENT-SOCIAL-OS.md
- SOCIAL-OS-TESTING-GUIDE.md
- OAUTH-SETUP-GUIDE.md
- Clarté, complétude, et exactitude

### 10. Production Readiness
Vérifier :
- Variables d'environnement requises
- Logs et monitoring
- Performance et optimisations
- Scalabilité horizontale
- Disaster recovery

## Checklist de Tests

### Tests Fonctionnels
- [ ] OAuth Reddit : connexion, déconnexion, refresh token
- [ ] OAuth Instagram : connexion, token longue durée
- [ ] OAuth TikTok : connexion, PKCE flow, refresh token
- [ ] Publication immédiate sur chaque plateforme
- [ ] Publication planifiée et exécution
- [ ] Gestion des erreurs et retry
- [ ] Stripe Connect onboarding complet

### Tests de Sécurité
- [ ] Injection SQL sur tous les endpoints
- [ ] XSS dans les inputs utilisateur
- [ ] CSRF sur les actions sensibles
- [ ] Rate limiting effectif
- [ ] Encryption/decryption des tokens
- [ ] Access control sur les ressources

### Tests de Performance
- [ ] Load testing des endpoints critiques
- [ ] Temps de réponse des APIs
- [ ] Optimisation des requêtes DB
- [ ] Memory leaks dans le worker

## Output Attendu

1. **Rapport de Sécurité** : Liste des vulnérabilités avec sévérité
2. **Bugs Identifiés** : Description, reproduction, impact
3. **Améliorations Code** : Suggestions avec exemples
4. **Performance Issues** : Bottlenecks et solutions
5. **Documentation Gaps** : Ce qui manque ou est incorrect
6. **Quick Wins** : Améliorations faciles à implémenter
7. **Architecture Review** : Forces et faiblesses

## Commandes Utiles

```bash
# Clone et setup
git clone https://github.com/chrlshc/ofm-social-os.git
cd ofm-social-os
npm install

# Analyse statique
npm run lint
npm run typecheck

# Tests (si disponibles)
npm test

# Analyse de sécurité
npm audit
```

## Focus Prioritaires

1. **Sécurité** - C'est critique pour un système qui gère des tokens OAuth
2. **Fiabilité** - Le système doit être robuste pour la production
3. **Scalabilité** - Doit supporter la croissance
4. **Maintenabilité** - Code propre et bien documenté

---

**Note**: Cet audit doit être sans complaisance. L'objectif est d'identifier TOUS les problèmes avant la mise en production. Sois critique et exhaustif.