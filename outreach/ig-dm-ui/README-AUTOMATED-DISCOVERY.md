# 🤖 Système de Découverte Automatisée Instagram → OnlyFans

## 🎯 Vue d'ensemble

Ce système révolutionnaire utilise les **suggestions Instagram** pour découvrir automatiquement des profils de modèles ayant potentiellement OnlyFans, **sans configuration quotidienne de hashtags**.

## 🚀 Comment ça marche

### 1. **Graph Traversal Intelligent**
```
Compte Seed (ex: @fashionnova)
    ↓
Suggestions Instagram (30 profils similaires)
    ↓
Pour chaque suggestion → Nouvelles suggestions
    ↓
Réseau exponentiel de profils qualifiés
```

### 2. **Scoring Automatique**
- Analyse de bio (mots-clés OF)
- Détection de liens externes
- Patterns d'engagement
- Indicateurs visuels

### 3. **Auto-Apprentissage**
- Découvre automatiquement de nouveaux seeds performants
- Optimise les scores basés sur les conversions
- S'adapte aux changements d'algorithme

## 📦 Installation

```bash
# 1. Initialiser la base de données
npm run enhanced:db-init

# 2. Charger les seeds initiaux
npm run discovery:seeds init

# 3. Lancer une découverte unique (test)
npm run discovery:once

# 4. Lancer le pipeline automatisé
npm run discovery:run
```

## 🎮 Utilisation

### Découverte Manuelle (Test)
```bash
# Découvrir une fois avec les paramètres par défaut
npm run discovery:once

# Personnalisé
node src/automated-discovery-pipeline.mjs once \
  --crawlDepth 3 \
  --seedsPerRun 5 \
  --minOFScore 7
```

### Pipeline Automatisé 24/7
```bash
# Lancer le pipeline (runs toutes les 24h)
npm run discovery:run

# Avec configuration personnalisée
node src/automated-discovery-pipeline.mjs \
  --runInterval 86400000 \  # 24 heures en ms
  --crawlDepth 2 \
  --seedsPerRun 10
```

## 🌱 Gestion des Seeds

### Seeds Initiaux de Haute Qualité
- **Fashion**: @fashionnova, @prettylittlething, @dollskill
- **Fitness**: @gymshark, @alphalete, @bombshellsportswear  
- **Lingerie**: @savagexfenty, @lounge
- **Lifestyle**: @revolve, @ohpolly

### Commandes Seeds
```bash
# Voir tous les seeds
npm run discovery:seeds list

# Ajouter un nouveau seed
npm run discovery:seeds add --username newbrand --category fashion

# Voir les performances
npm run discovery:seeds stats

# Optimiser (désactiver les mauvais performers)
npm run discovery:seeds optimize
```

## 📊 Métriques et Résultats

### Fichiers de Sortie
```
output/
├── discovered_profiles_2025-01-15.csv    # Profils du jour
├── high_quality_leads.csv                # Top profils (score >8)
└── seed_performance_report.csv           # Performance des seeds
```

### Structure CSV
```csv
username,platform,of_score,bio,followers,external_link,discovery_path,source_seed
sarah_fit,instagram,9,"Fitness coach 💪 Link below ⬇️",45000,linktr.ee/sarah,@gymshark,gymshark
```

### KPIs Clés
- **Profils découverts/jour**: 500-2000
- **Taux OF probable**: >70% (score >7)
- **Conversion seed→lead**: 30-50 profils/seed
- **Auto-découverte seeds**: 5-10/semaine

## 🔧 Configuration Avancée

### Options du Pipeline
```javascript
const pipeline = new AutomatedDiscoveryPipeline({
  // Profondeur du graph (1-3 recommandé)
  crawlDepth: 2,
  
  // Nombre de seeds par cycle
  seedsPerRun: 5,
  
  // Score minimum pour qualification
  minOFScore: 6,
  
  // Intervalle entre cycles (ms)
  runInterval: 24 * 60 * 60 * 1000,
  
  // Options du scraper
  scraperOptions: {
    headless: true,
    pauseBetweenActions: { min: 2000, max: 5000 }
  }
});
```

### Base de Données

Tables créées automatiquement:
- `smart_seeds` - Gestion des comptes seeds
- `discovered_profiles` - Profils découverts
- `seed_performance` - Métriques de performance

## 🏃 Workflow Complet

### 1. Discovery → 2. DM Automation
```bash
# Étape 1: Découverte automatique
npm run discovery:run

# Étape 2: Envoyer DMs aux profils découverts
npm run enhanced:campaign -- --targets output/discovered_profiles_2025-01-15.csv
```

### Pipeline Intégré (Coming Soon)
```javascript
// Configuration pour pipeline complet
{
  discovery: {
    enabled: true,
    interval: '24h'
  },
  dmAutomation: {
    enabled: true,
    autoSendToNewLeads: true,
    minScoreForDM: 7
  }
}
```

## 📈 Analyse des Performances

### Dashboard Analytics
```bash
# Voir les statistiques globales
npm run discovery:analytics

# Rapport détaillé des seeds
npm run discovery:seeds report
```

### Requêtes SQL Utiles
```sql
-- Top seeds par conversion
SELECT 
  seed_username,
  SUM(of_profiles_found) as total_of,
  AVG(avg_quality_score) as avg_score
FROM seed_performance
GROUP BY seed_username
ORDER BY total_of DESC;

-- Profils haute qualité récents
SELECT username, has_of_probability, bio, external_link
FROM discovered_profiles
WHERE has_of_probability >= 0.8
AND last_analyzed > NOW() - INTERVAL '24 hours'
ORDER BY has_of_probability DESC;
```

## 🚨 Monitoring et Alertes

### Health Checks
- Seeds actifs < 5 → Alerte
- Taux de découverte < 100/jour → Vérifier
- Score moyen < 5 → Ajuster critères

### Logs
```
logs/
├── discovery.log         # Tous les logs
├── errors.log           # Erreurs uniquement
└── performance.log      # Métriques
```

## 🛡️ Sécurité et Limites

### Anti-Détection
- Rotation automatique des sessions
- Comportement humain simulé
- Pauses aléatoires entre actions
- Limite: 50-100 profils/heure/compte

### Best Practices
- Ne pas crawler plus de 3 niveaux de profondeur
- Limiter à 10 seeds actifs simultanément
- Respecter les pauses entre actions
- Monitorer le taux de blocage

## 🎯 Avantages vs Hashtags

| Hashtags (Ancien) | Suggestions (Nouveau) |
|-------------------|----------------------|
| Configuration manuelle quotidienne | 100% automatisé |
| Qualité variable | Haute qualité (IA Instagram) |
| Saturation rapide | Découverte infinie |
| Pas d'apprentissage | Auto-amélioration |
| ROI décroissant | ROI croissant |

## 🚀 Résultats Attendus

### Semaine 1
- 3,000-5,000 profils découverts
- 500+ profils haute qualité (OF probable)
- 5-10 nouveaux seeds auto-découverts

### Mois 1
- 20,000+ profils dans la base
- 3,000+ leads qualifiés
- Réseau de 50+ seeds optimisés
- Pipeline 100% autonome

## 💡 Tips & Tricks

1. **Commencer petit**: 3-5 seeds, depth 2
2. **Seeds diversifiés**: Mélanger fashion/fitness/beauty
3. **Analyser régulièrement**: Vérifier quels seeds performent
4. **Ajuster scores**: Basé sur vos taux de conversion réels
5. **Backup data**: Exporter régulièrement les CSV

---

**🎊 Félicitations!** Vous avez maintenant un système de découverte de leads qui tourne 24/7 sans intervention manuelle, utilisant l'intelligence d'Instagram pour trouver des profils hautement qualifiés!