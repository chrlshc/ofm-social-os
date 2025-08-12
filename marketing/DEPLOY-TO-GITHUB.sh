#!/bin/bash
# Script de déploiement GitHub pour OFM Social OS

set -e

echo "🚀 Déploiement OFM Social OS sur GitHub"

# Variables (à personnaliser)
GITHUB_USERNAME="your-username"
REPO_NAME="ofm-social-os"
REPO_URL="https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"

# 1. Vérifier que nous sommes dans le bon dossier
if [[ ! -d "backend" ]] || [[ ! -d "services" ]]; then
    echo "❌ Erreur: Exécutez ce script depuis le dossier marketing/"
    exit 1
fi

echo "📁 Dossier de travail vérifié"

# 2. Initialiser git si nécessaire
if [[ ! -d ".git" ]]; then
    echo "🔧 Initialisation du repository git..."
    git init
    git branch -M main
fi

# 3. Créer/mettre à jour .gitignore
echo "📝 Création .gitignore..."
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
*/node_modules/

# Environment variables
.env
.env.local
.env.production
.env.test

# Logs
*.log
logs/
pids/
*.pid
*.seed
*.pid.lock

# Runtime data
lib-cov/
coverage/
.nyc_output/

# Build outputs
dist/
build/
.next/
out/

# Cache
.npm
.eslintcache
.node_repl_history

# System files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temporary files
tmp/
temp/
*.tmp
*.temp

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/

# Database
*.db
*.sqlite

# Test results
test-results/
playwright-report/
coverage/

# Lock files (optionnel - gardez selon préférence)
# package-lock.json
# yarn.lock
EOF

# 4. Créer README principal si pas encore fait
if [[ ! -f "README.md" ]]; then
    echo "📄 Copie du README GitHub..."
    cp README-GITHUB.md README.md
fi

# 5. Créer LICENSE
echo "📋 Création LICENSE MIT..."
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2025 OFM Social OS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

# 6. Ajouter remote origin si pas encore fait
if ! git remote get-url origin &>/dev/null; then
    echo "🔗 Ajout du remote GitHub..."
    echo "⚠️  Assurez-vous d'avoir créé le repository $REPO_NAME sur GitHub"
    read -p "Appuyez sur Entrée une fois le repository créé sur GitHub..."
    git remote add origin $REPO_URL
fi

# 7. Commit et push
echo "📦 Staging des fichiers..."
git add .

echo "💾 Commit initial..."
git commit -m "Initial commit: OFM Social OS v1.0

✨ Features:
- Multi-platform API (Instagram, TikTok, X, Reddit)  
- Temporal workflows with idempotence
- LLM budget system with hard caps
- E2E tests with Playwright
- Grafana observability dashboards
- Microservices architecture

🎯 Ready for Canari 10% deployment

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>" || echo "Commit déjà existant, continuons..."

echo "🚀 Push vers GitHub..."
git push -u origin main

echo "✅ Déploiement terminé!"
echo "🔗 Votre repository: $REPO_URL"
echo ""
echo "📋 Prochaines étapes:"
echo "1. Configurer les GitHub Secrets pour CI/CD"
echo "2. Activer GitHub Actions si besoin"
echo "3. Créer les issues/milestones"
echo "4. Inviter les collaborateurs"
echo ""
echo "🎉 OFM Social OS est maintenant sur GitHub!"
EOF

chmod +x /Users/765h/OFM\ CHARLES/marketing/DEPLOY-TO-GITHUB.sh