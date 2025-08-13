#!/bin/bash
# Simple push script for OFM Payments system

set -euo pipefail

# Configuration
REPO_URL="https://github.com/765h/OFM-CHARLES.git"
BRANCH_NAME="feature/payments-production-ready"

echo "🚀 Starting GitHub push..."

# Configure git
git config user.name "Claude Code" || true
git config user.email "noreply@anthropic.com" || true

# Create and switch to feature branch
echo "📝 Creating branch $BRANCH_NAME"
git checkout -B "$BRANCH_NAME"

# Add all payment system files
echo "📦 Adding all OFM Payments files..."
git add payment/
git add push-to-github-simple.sh

# Create commit
git commit -m "feat: Complete production-ready OFM Payments system

🚀 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to GitHub
echo "🌐 Pushing to GitHub..."
git push -u origin "$BRANCH_NAME" --force-with-lease

echo "✅ Push completed successfully!"
echo "🔗 Branch: $BRANCH_NAME"
echo "📊 Repository: $REPO_URL"
echo ""
echo "📝 Next steps:"
echo "1. Go to GitHub: $REPO_URL"
echo "2. Create a Pull Request from branch: $BRANCH_NAME"
echo "3. Title: 'Production-Ready OFM Payments System'"