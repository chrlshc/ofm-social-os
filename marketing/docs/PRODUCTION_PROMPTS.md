# 🚀 Production Deployment Prompts - OFM Social OS

Suite de prompts pour finaliser le déploiement en production avec canari 10%, tests de charge, chaos engineering, et console d'administration.

## 📋 Ordre d'exécution recommandé

1. **PROMPT 1** - Release & Canari 10% (infrastructure de déploiement)
2. **PROMPT 2** - Charge & Soak k6 (validation performance)
3. **PROMPT 3** - Chaos & DR Drill (validation résilience)
4. **PROMPT 4** - Security Hardening (durcissement final)
5. **PROMPT 5** - Cost Guardrails (contrôle des coûts)
6. **PROMPT 6** - Console Admin Ops (interface d'administration)
7. **PROMPT 7** - Docs & Runbooks (documentation opérationnelle)

---

## PROMPT 1 — Release & Canari 10%

**Objectif**: Automatiser le déploiement canari 10% (48h) avec gates SLO et rollback.

**Tâches**:
- Helm/K8s manifests pour déploiement canari
- Feature-flags par plateforme (Instagram, TikTok, X, Reddit)
- Gates PromQL (p95 latency, taux 5xx, webhook signature)
- Rollback automatique si SLO breach
- Promotion automatique vers 100% après 48h

**Livrables**:
- PR avec Helm charts et manifests K8s
- Workflow CI/CD "deploy:canary"
- README avec runbook de déploiement

**Extended thinking**: Proposer 2 stratégies de promotion (time-based vs error-budget burn-rate).

---

## PROMPT 2 — Charge & Soak (k6)

**Objectif**: Mesurer p95/p99 sous charge réaliste.

**Tâches**:
- Scénarios k6 pour endpoints critiques:
  - POST /publish (multi-platform)
  - POST /upload multipart (media pipeline)
  - POST /webhooks (TikTok/Meta)
- Test soak 2h avec charge progressive
- Profils CPU/mémoire pendant les tests
- Rapport de performance détaillé

**Livrables**:
- PR avec tests k6 structurés
- Dashboard Grafana dédié aux tests de charge
- Seuils d'échec intégrés au CI

**Extended thinking**: Recommander limites par nœud et tuning pool DB/Redis.

---

## PROMPT 3 — Chaos & DR Drill

**Objectif**: Valider RPO=15min, RTO=30min et résilience générale.

**Tâches**:
- Injection de pannes contrôlées:
  - S3 returning 5xx
  - Redis connection down
  - PostgreSQL failover
- Test PITR (Point-in-Time Recovery) en sandbox
- Mesure précise RTO/RPO
- Identification et correction des points faibles

**Livrables**:
- Scripts d'injection de chaos (Litmus/Gremlin)
- Rapport DR avec métriques RTO/RPO
- PR avec alertes manquantes identifiées

**Extended thinking**: Comparer stratégie active-passive vs multi-AZ.

---

## PROMPT 4 — Security Hardening final

**Objectif**: Réduire surface d'attaque en production.

**Tâches**:
- Rotation automatique des clés (LLM/OAuth) via KMS
- Configuration CSP/CORS stricte
- mTLS interne optionnel entre services
- Scopes OAuth minimaux par plateforme
- Migration secrets vers OIDC→cloud provider
- Génération et attestation SBOM

**Livrables**:
- PR avec configurations sécurité
- Documentation des policies
- Tests de sécurité automatisés

**Extended thinking**: Estimer coût latence mTLS vs bénéfice sécurité.

---

## PROMPT 5 — Cost Guardrails

**Objectif**: Plafonner OPEX (LLM/S3/egress).

**Tâches**:
- Budgets LLM par agent avec hard stop
- Tags de coût sur toute l'infrastructure
- Politique lifecycle S3 agressive (30j→Glacier)
- Calcul et exposition métrique €/post
- Alerting à 80% et 100% du budget

**Livrables**:
- PR avec métriques de coût exposées
- Dashboards Grafana dédiés aux coûts
- Alertes PagerDuty pour dépassements

**Extended thinking**: Proposer 2 politiques de cache LLM et calculer leur ROI.

---

## PROMPT 6 — Console Admin Ops

**Objectif**: Panneau unique pour opérations quotidiennes.

**Tâches**:
- UI minimale React/Next.js avec:
  - Toggle feature flags par plateforme
  - Statut du déploiement canari
  - Health des queues et tokens
  - Budgets LLM temps réel
  - Kill switch d'urgence
- Authentification admin (OIDC/SAML)
- Audit trail complet des actions

**Livrables**:
- PR avec frontend et API admin
- Tests E2E Playwright
- Documentation utilisateur

**Extended thinking**: Suggérer RBAC simple (admin/operator/viewer) et durées de session.

---

## PROMPT 7 — Docs & Runbooks

**Objectif**: Zéro oralité, tout documenté pour ops.

**Tâches**:
- Génération OpenAPI/Swagger automatique
- Diagrammes d'architecture à jour (C4/Mermaid)
- Runbooks pour incidents courants:
  - Saturation LLM budget
  - Échec webhook signature
  - Latence publishing élevée
- Playbook de rollback canari
- Checklists GO/NO-GO pour promotion

**Livrables**:
- PR avec documentation versionnée
- Liens directs vers dashboards Grafana
- Intégration avec Alertmanager

**Extended thinking**: Créer checklist d'onboarding pour nouveau membre ops.

---

## 🎯 Métriques de succès

### Canari 10%
- Zero rollback durant 48h
- SLOs maintenus (>95% latency, >99% success)
- Pas d'augmentation des erreurs vs baseline

### Performance
- p95 latency < 10s pour publishing
- p99 latency < 15s sous charge 10x
- CPU < 80% sous charge nominale

### Résilience
- RTO mesuré < 30 minutes
- RPO mesuré < 15 minutes
- Zero data loss en cas de panne

### Sécurité
- Zero secret en clair dans le code
- 100% des endpoints avec auth
- Rotation automatique fonctionnelle

### Coûts
- Coût par post < 0.10€
- Alertes avant dépassement budget
- Visibilité temps réel des dépenses

### Opérations
- MTTR < 30 minutes avec runbooks
- 100% des incidents documentés
- Console admin utilisée quotidiennement

---

## 📅 Timeline suggérée

- **Semaine 1**: PROMPT 1 & 2 (Canari + Tests charge)
- **Semaine 2**: PROMPT 3 & 4 (Chaos + Security)
- **Semaine 3**: PROMPT 5 & 6 (Coûts + Console)
- **Semaine 4**: PROMPT 7 + Go-Live 100%

---

## 🚦 Critères Go/No-Go pour production

### GO ✅
- [ ] Canari 10% stable pendant 48h
- [ ] Tous les SLOs respectés
- [ ] Tests de charge passés
- [ ] DR validé avec RTO/RPO confirmés
- [ ] Security scan clean
- [ ] Budgets configurés et alertes actives
- [ ] Console admin opérationnelle
- [ ] Documentation complète

### NO-GO ❌
- [ ] SLO breaches répétés
- [ ] Latence p95 > 15s
- [ ] Échecs DR tests
- [ ] Vulnérabilités critiques
- [ ] Coûts non maîtrisés
- [ ] Documentation incomplète

---

**Note**: Chaque prompt peut être exécuté indépendamment mais l'ordre recommandé maximise la valeur et minimise les risques.