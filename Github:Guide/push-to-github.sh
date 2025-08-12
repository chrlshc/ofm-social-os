#!/bin/bash

# Script pour pousser le code vers GitHub
# Modifiez REPO_URL avec l'URL de votre dépôt GitHub existant

# IMPORTANT: Remplacez cette URL par l'URL de votre dépôt GitHub
# Format: https://github.com/USERNAME/REPO-NAME.git
REPO_URL="https://github.com/765h/YOUR-REPO-NAME.git"

echo "📦 Configuration du remote GitHub..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

echo "📋 Status du dépôt:"
git status

echo "🚀 Push vers GitHub..."
git push -u origin main

echo "✅ Push terminé!"
echo "🔗 Votre code est maintenant sur: $REPO_URL"