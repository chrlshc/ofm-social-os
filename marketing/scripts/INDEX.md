# 📜 Scripts

## Scripts Utilitaires

### 🎬 FFmpeg Scripts (`ffmpeg-variants.sh`)
**Génération automatique de variants vidéo**

#### Fonctionnalités
- **9:16** : Format TikTok/Instagram Reels
- **1:1** : Format Instagram Post carré
- **16:9** : Format YouTube/X landscape
- **Auto-crop** : Recadrage intelligent selon ratio
- **Subtitles** : Ajout sous-titres automatiques

#### Usage
```bash
./ffmpeg-variants.sh input-video.mp4 output-prefix
# Génère:
# - output-prefix-9x16.mp4 (TikTok/Reels)
# - output-prefix-1x1.mp4 (IG Post)  
# - output-prefix-16x9.mp4 (YouTube)
```

---

### 🗣️ Subtitle Generation (`generate-subtitles.py`)
**Génération sous-titres avec AI**

#### Fonctionnalités  
- **Speech-to-Text** : Transcription automatique
- **Multi-language** : Support langues multiples
- **SRT Export** : Format standard sous-titres
- **Timing Precision** : Synchronisation précise

#### Usage
```python
python generate-subtitles.py video.mp4 --lang fr --output video.srt
```

---

## 🔧 Scripts de Maintenance

### Database Scripts
```bash
# Migration script
./migrate-database.sh

# Backup script  
./backup-database.sh

# Clean old data
./cleanup-old-data.sh
```

### Deployment Scripts
```bash  
# Deploy API
./deploy-api.sh production

# Deploy services
./deploy-services.sh

# Update Grafana dashboards
./update-dashboards.sh
```

### Monitoring Scripts
```bash
# Health check all services
./health-check.sh

# Generate LLM cost report
./llm-cost-report.sh

# Export metrics
./export-metrics.sh
```

---

## 🎯 Intégration KPI Loop

### Auto-Repurposing Script
```bash
# Check KPIs and trigger repurposing
./kpi-check-repurpose.sh

# Generate performance reports
./performance-report.sh  

# Update content strategy
./strategy-update.sh
```

### Optimization Scripts
```bash
# Optimize video quality/size
./optimize-videos.sh

# Compress assets
./compress-assets.sh

# Clean temp files
./cleanup-temp.sh
```