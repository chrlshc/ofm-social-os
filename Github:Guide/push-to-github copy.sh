#!/bin/bash
# Script de push GitHub pour OFM Payments - Production Ready
# Pousse tous les développements sur GitHub avec commits organisés

set -euo pipefail

# Configuration
REPO_URL="https://github.com/765h/OFM-CHARLES.git"
BRANCH_NAME="feature/payments-production-ready"
COMMIT_MESSAGE_PREFIX="feat: Complete production-ready payment system"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier que nous sommes dans le bon répertoire
if [[ ! -d "payment" ]]; then
    log_error "Répertoire 'payment' non trouvé. Assurez-vous d'être dans le répertoire racine."
    exit 1
fi

log_info "🚀 Début du push vers GitHub"

# Initialiser git si nécessaire
if [[ ! -d ".git" ]]; then
    log_info "Initialisation du repository Git..."
    git init
    git remote add origin "$REPO_URL" || git remote set-url origin "$REPO_URL"
fi

# Configurer git si nécessaire
git config user.name "Claude Code" || true
git config user.email "noreply@anthropic.com" || true

# Créer et basculer sur la branche feature
log_info "📝 Création de la branche $BRANCH_NAME"
git checkout -B "$BRANCH_NAME"

# Ajouter tous les fichiers par catégorie avec commits séparés
log_info "📦 Ajout des fichiers par catégorie..."

# 1. Core Payment System
log_info "💰 Commit: Core Payment System"
git add payment/src/commission_calculator.py
git add payment/src/currency_handler.py  
git add payment/src/database.py
git add payment/src/stripe_service.py
git add payment/src/stripe_connect_manager.py
git add payment/src/models.py
git add payment/requirements.txt
git commit -m "feat: Implement core payment system with Stripe Connect

- Degressive commission structure (20% → 10%)
- Multi-currency support with zero-decimal handling
- Stripe Connect integration for marketplace payments
- Database models and core service architecture" || true

# 2. Advanced Features (Disputes, Reconciliation, KYC)
log_info "🛡️ Commit: Advanced Payment Features"
git add payment/src/dispute_handler.py
git add payment/src/reconciliation_service.py
git add payment/src/kyc_monitor.py
git add payment/src/refund_service.py
git add payment/src/security_manager.py
git add payment/src/retry_service.py
git commit -m "feat: Add production-grade payment features

- Dispute handling with automatic evidence collection
- Daily reconciliation with Stripe data validation
- Continuous KYC monitoring with risk assessment
- Intelligent refund policies with commission adjustment
- Retry mechanisms and security management" || true

# 3. Security & RBAC
log_info "🔐 Commit: Security & Access Control"
git add payment/src/rbac.py
git add payment/src/middleware.py
git add payment/src/data_retention.py
git add payment/src/security.py
git add payment/src/auth.py
git add payment/src/user_management.py
git commit -m "feat: Implement security and access control systems

- Role-based access control with audit logging
- Kill-switch and circuit breaker middleware
- GDPR-compliant data retention with TTL
- Rate limiting and security headers
- User authentication and management" || true

# 4. Observability Stack
log_info "📊 Commit: Complete Observability Stack"
git add payment/observability/
git commit -m "feat: Implement comprehensive observability system

- Prometheus metrics with SLO burn rate monitoring
- OpenTelemetry distributed tracing with correlation IDs
- Structured JSON logging with PII masking
- Grafana dashboards for real-time monitoring
- Business and technical metrics instrumentation" || true

# 5. Testing & Validation
log_info "🧪 Commit: Testing & Validation Suite"
git add payment/tests/
git add payment/canary/
git add payment/k6/
git commit -m "feat: Add comprehensive testing and validation suite

- Smoke tests for critical payment flows
- Canary synthetic monitoring (15-30min intervals)
- k6 load testing with realistic scenarios
- Security and production scenario testing" || true

# 6. Chaos Engineering
log_info "⚡ Commit: Chaos Engineering"
git add payment/chaos/
git commit -m "feat: Implement chaos engineering for resilience testing

- Webhook worker failure simulation
- Stripe network loss testing
- Secret rotation recovery validation
- Automated system recovery verification" || true

# 7. Deployment & Operations
log_info "🚀 Commit: Deployment & Operations"
git add payment/go-live/
git add payment/deployment/
git add payment/scripts/
git commit -m "feat: Add production deployment and operations procedures

- Complete go-live checklist with 15+ automated checks
- Run-of-show for day-0 deployment with canary rollout
- Rollback procedures (soft/hard/emergency)
- Automated key rotation with CRON scheduling" || true

# 8. Documentation & Policies
log_info "📚 Commit: Documentation & Policies"
git add payment/docs/
git add payment/README_PRODUCTION.md
git add payment/API_ENDPOINTS_GUIDE.md
git add payment/SECURITY_AUDIT_FIXES.md
git add payment/FINAL_SECURITY_IMPROVEMENTS.md
git commit -m "feat: Add comprehensive documentation and policies

- SLA with 99.9% uptime guarantee
- Refund policies with 4-tier approval system
- Incident communication templates
- Production deployment guide and security documentation" || true

# 9. Application & Configuration
log_info "⚙️ Commit: Application & Configuration"
git add payment/src/app.py
git add payment/src/app_secure.py
git add payment/src/error_handling.py
git add payment/src/metrics_service.py
git add payment/config/
git add payment/README.md
git commit -m "feat: Add application core and configuration

- Flask application with secure configuration
- Error handling and metrics collection
- Application settings and configuration management
- Main application README" || true

# 10. Final commit pour les fichiers restants
log_info "📁 Commit: Scripts and remaining files"
git add push-to-github.sh
git add *.md || true
git commit -m "feat: Add deployment scripts and project documentation

- GitHub push script for organized commits
- Project-level documentation
- Final production deployment tools" || true

# Pousser vers GitHub
log_info "🌐 Push vers GitHub..."
git push -u origin "$BRANCH_NAME" --force-with-lease

log_success "✅ Push terminé vers GitHub!"
log_info "🔗 Branch: $BRANCH_NAME"
log_info "📊 Repository: $REPO_URL"

# Afficher le résumé
log_info "📋 Résumé des commits:"
git log --oneline -10

# Instruction pour créer la PR
log_warning "📝 Prochaines étapes:"
echo "1. Aller sur GitHub: $REPO_URL"
echo "2. Créer une Pull Request depuis la branche: $BRANCH_NAME"
echo "3. Titre suggéré: 'Production-Ready OFM Payments System'"
echo "4. Description: Système de paiements complet avec observabilité, sécurité et procédures ops"

log_success "🎉 Système OFM Payments poussé sur GitHub avec succès!"