# 🛠️ Services

## Microservices Spécialisés

### 🐍 Reddit Service
**Service Python dédié pour Reddit avec PRAW**

#### Fonctionnalités
- **Publishing** : Posts text/link vers subreddits
- **Commenting** : Réponses automatisées  
- **Crossposting** : Distribution multi-subreddits
- **Metrics** : Collection scores, comments, ratios
- **Rate Limiting** : Gestion automatique via PRAW

#### Endpoints
```
POST /publish     # Publier post Reddit
POST /comment     # Commenter post/comment  
POST /crosspost   # Crosspost vers autre subreddit
GET /metrics/:id  # Récupérer métriques post
```

#### Configuration
```python
# Variables d'environnement requises
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_secret  
REDDIT_SERVICE_KEY=service_auth_key
```

---

### 🔮 Services Futurs

#### TikTok Chunked Upload Service
- Upload vidéos > 64MB par chunks
- Retry logic intelligent
- Progress tracking

#### Instagram Business API Service  
- Content publishing avancé
- Stories automation
- IGTV upload

#### X Premium Features Service
- Long-form content (25k chars)
- Spaces integration  
- Advanced analytics

---

## 🚀 Déploiement

### Docker Support
```dockerfile
# Exemple pour Reddit Service
FROM python:3.11-slim
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py .
EXPOSE 5000
CMD ["python", "app.py"]
```

### Service Discovery
- Health checks sur `/health`
- Authentication via `X-Service-Key`
- Logging structuré JSON