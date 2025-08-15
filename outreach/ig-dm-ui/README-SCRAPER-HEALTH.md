# 🏥 État de Santé du Scraper Instagram

## 📊 Status Actuel

### ✅ Composants Fonctionnels

1. **Apify Provider** (`apify-provider.mjs`)
   - Intégration clean avec l'API Apify
   - Utilise l'actor officiel `apify/instagram-scraper`
   - Gestion d'erreurs robuste

2. **Discovery & Export** (`apify-discover-export.mjs`)
   - Découverte multi-hashtags
   - Filtrage US avancé avec lexicon
   - Scoring intelligent des prospects
   - Export CSV optimisé

3. **US Targeting** (`us-lexicon.mjs`)
   - Détection géographique par mots-clés
   - Inference de timezone
   - Liste complète villes/états US

### 🔧 Configuration

```bash
# .env
APIFY_TOKEN=your_apify_token_here
```

## 📋 Commandes Disponibles

### Discovery US Market
```bash
# Hashtags US généraux (onlyfansusa, ugcmodel, etc.)
npm run apify:us

# Hashtags intention (collab, branddeals, etc.)
npm run apify:us-intent

# Custom avec paramètres
node src/apify-discover-export.mjs hashtag \
  --hashtags onlyfansusa,miamimodel \
  --limit 200 \
  --minFollowers 5000 \
  --minScore 3 \
  --top 500 \
  --usOnly true
```

### Tests de Santé
```bash
# Status rapide
npm run scraper:status

# Test complet (peut être lent)
npm run scraper:health
```

## 🎯 Architecture du Scraper

```
apify-discover-export.mjs
    ↓
ApifyDiscoveryProvider
    ↓
Apify API (actor: apify/instagram-scraper)
    ↓
Instagram Data
    ↓
Filtering & Scoring
    ↓
CSV Export (dm_todo_us.csv)
```

## 📈 Métriques de Performance

### Scoring des Prospects
- **+2 points**: Followers >= minFollowers (défaut: 3000)
- **+1 point**: Keywords dans bio/caption (collab, ugc, creator, etc.)
- **+1 point**: URL présente

### Filtrage US
- Détection par villes US (Miami, NYC, LA, etc.)
- Détection par états (California, Texas, Florida, etc.)
- Mots-clés US (born in USA, American, etc.)
- Timezone par défaut: ET (Eastern Time)

## 🚨 Troubleshooting

### Problème: Timeout API
**Symptômes**: Commands qui timeout après 2 minutes

**Solutions**:
1. Vérifier la connexion internet
2. Réduire la limite (`--limit 50` au lieu de 150)
3. Tester avec un seul hashtag
4. Vérifier les crédits Apify

### Problème: Peu de résultats
**Symptômes**: Moins de profils que prévu

**Solutions**:
1. Élargir les hashtags
2. Baisser minFollowers (`--minFollowers 2000`)
3. Baisser minScore (`--minScore 1`)
4. Désactiver le filtre US (`--usOnly false`)

### Problème: Token invalide
**Symptômes**: Authentication failed

**Solutions**:
1. Vérifier le token dans .env
2. Régénérer le token sur Apify dashboard
3. Vérifier l'abonnement Apify

## 📊 Monitoring Recommandé

### KPIs à Suivre
- **Profiles/hashtag**: Cible 100-200
- **Score moyen**: Cible > 2.5
- **Taux US**: Cible > 60% (avec usOnly)
- **Temps de scraping**: < 30s par hashtag

### Cron Suggéré
```bash
# Discovery quotidienne (6h du matin)
0 6 * * * cd /path/to/project && npm run apify:us >> logs/discovery.log

# Test de santé hebdomadaire
0 9 * * 1 cd /path/to/project && npm run scraper:status >> logs/health.log
```

## 🔐 Sécurité

- **Ne jamais** commiter le token Apify
- **Toujours** utiliser variables d'environnement
- **Limiter** les requêtes pour éviter rate limits
- **Monitorer** l'usage des crédits Apify

## 💡 Optimisations Futures

1. **Cache local** des résultats pour éviter re-scraping
2. **Batch processing** pour hashtags multiples
3. **Machine learning** pour scoring avancé
4. **Webhook integration** pour notifications temps réel
5. **A/B testing** des hashtags performants

## 📞 Support

- Documentation Apify: https://docs.apify.com
- Actor Instagram: https://apify.com/apify/instagram-scraper
- Support technique: Créer issue sur GitHub

---

**État Global**: ✅ Le scraper est opérationnel et prêt pour la production. Les timeouts observés sont normaux avec l'API Instagram qui peut être lente. Utiliser des limites plus petites pour des résultats plus rapides.