# Instagram DM Automation avec Pré-engagement

Système Instagram DM production-ready avec pré-engagement par likes, network sync et anti-détection.

## 🚀 Features

- **DM Automation** avec waitForResponse() network sync (zero sleeps)
- **Pré-engagement** optionnel (2 likes avant DM)
- **Rate Limiting** conservateur avec token buckets
- **Anti-détection** Puppeteer stealth + headless profiles
- **Metrics & Reporting** JSON agrégé avec health score
- **CLI** avec flags pour configuration rapide

## 🔧 Installation

```bash
npm install
```

## 📋 Usage

### Generate DM Pack (One-Shot)
```bash
# Generate 40 compliance messages for US market
npm run gen-dm-pack -- --target @target --model_name "mia" --city "la" --niche "fitness" --n 40 --outdir dm-pack

# Quick test with 10 messages
npm run gen-dm-pack -- --target @target --n 10 --outdir dm-test
```

### DM avec Messages Générés
```bash
# Message aléatoire compliance
npm run dm-random -- --user target

# Message spécifique par index
npm run dm -- --user target --message-index 0 --preengage likes=2
```

### DM Simple
```bash
npm run dm -- --user johndoe --message "hey youre amazing, just found youre page (i can help you earn more)"
```

### DM avec Pré-engagement (2 likes)
```bash
npm run dm -- --user johndoe --message "hey youre great (i can help you make more)" --preengage likes=2
```

### Script prêt-à-utiliser
```bash
# Via npm script avec pré-engagement
npm run dm-with-likes -- --user target --random-message

# Via env var
PRE_ENGAGE_LIKES=2 npm run dm -- --user target --random-message
```

## 🎛️ Configuration

### Variables d'environnement
- `PRE_ENGAGE_LIKES=2` : Active le pré-engagement automatique
- `HEADLESS=new` : Mode headless par défaut

### Options CLI
- `--user, -u` : Username cible (sans @)
- `--message, -m` : Message à envoyer
- `--preengage` : Pré-engagement (`likes=2`)
- `--debug` : Logs détaillés
- `--headless` : Mode headless (`false|new|shell`)
- `--status` : Affiche les rate limits actuels

## 📊 Monitoring

### Status des rate limits
```bash
npm run status
```

### Rapport de performance
```bash
npm run report
```

### Test des profils headless
```bash
npm run test-headless
```

## 🔒 Rate Limiting

- **DM** : 5 burst, 1 token/10min
- **Search** : 10 burst, 2 tokens/2min  
- **Likes** : 2 burst, 1 token/30min
- **Navigation** : 20 burst, 5 tokens/5min

## 🏗️ Architecture

```
src/
├── cli-dm.js           # CLI principal
├── dm-clean.js         # DM core avec network sync
├── preengage.ts        # Système 2-likes
├── headless-switch.js  # Profils headless A/B
├── batch-reporter.js   # Métriques agrégées
├── rate/
│   ├── tokenBucket.ts  # Token bucket implementation
│   └── policies.ts     # Rate limiting policies
├── apify-scraper.js    # Alternative Apify (Plan C)
└── test-apify.js       # Test Apify SDK
```

## 🎯 Workflow Complet

1. **Pre-engagement** (optionnel) : Navigation profil + 2 likes max
2. **Rate limiting** : Vérification tokens disponibles
3. **DM Flow** : Search user → Create thread → Send message
4. **Network proof** : waitForResponse() confirmation
5. **Metrics** : Tracking performance + health score

## 🔍 Debugging

```bash
# Mode debug complet
node src/cli-dm.js --user test --message "Hello" --debug --preengage likes=2

# Test isolation composants
npm run test-headless  # Profils browser
npm run test-apify     # SDK Apify
npm run status         # Rate limits
```

## 📈 Performance Targets

- **DM Time** : < 8s optimal, < 12s acceptable
- **Success Rate** : > 95% cible
- **Network 2xx** : > 90% 
- **Rate Limit 429** : < 5%

## 🛡️ Anti-détection

- Puppeteer stealth plugin
- Human-like timing (random delays)
- Semantic selectors (aria-label vs classes)
- Network sync (pas de sleeps arbitraires)
- Token bucket rate limiting
- Headless mode switching

## 🚨 Production Notes

- Utilise `headless: false` (headful) pour maximum compatibilité
- `headless: 'new'` pour production automatisée
- Évite `headless: 'shell'` sauf CI/scale (détection risk)
- Monitor health score < 80 → réduire fréquence
- 429 rate > 5% → augmenter délais inter-DM