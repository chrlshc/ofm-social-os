# Chatting Assistant Deployment Guide

## Prerequisites

- Python 3.8+
- Node.js 16+ (for integration with main system)
- PostgreSQL (shared with main system)
- Docker (optional)

## Standalone Deployment

### 1. Local Development

```bash
# Navigate to module directory
cd Github:Guide/chatting-assistant

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
python -m spacy download en_core_web_sm

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run interactive mode
python main.py interactive

# Analyze a fan
python main.py analyze --fan-id fan123 --messages '["Hello", "How are you?"]'

# Generate message
python main.py generate --profile '{"type": "Emotional"}' --phase intrigue

# Run batch processing
python main.py batch --input example_fans.json

# Start server mode
python main.py server --port 8001
```

### 2. Docker Deployment

Create `Dockerfile` in chatting-assistant directory:

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Run application
ENTRYPOINT ["python", "main.py"]
```

Build and run:

```bash
docker build -t ofm-chatting-assistant .
docker run -it ofm-chatting-assistant
```

## Integration with OFM Social OS

### 1. Add to Docker Compose

Update main `docker-compose.yml`:

```yaml
services:
  # ... existing services ...
  
  chatting-assistant:
    build: ./Github:Guide/chatting-assistant
    environment:
      - ACCOUNT_SIZE=${CHATTING_ACCOUNT_SIZE:-small}
      - DATABASE_URL=postgresql://user:pass@postgres:5432/ofm_db
    volumes:
      - ./Github:Guide/chatting-assistant:/app
      - chatting-data:/app/data
    networks:
      - ofm-network
    restart: unless-stopped

volumes:
  chatting-data:
```

### 2. API Integration Deployment

Add Python execution to main API:

```javascript
// src/services/chattingService.ts
import { spawn } from 'child_process';
import path from 'path';

export class ChattingService {
  private pythonPath: string;
  
  constructor() {
    this.pythonPath = path.join(process.cwd(), 'Github:Guide/chatting-assistant');
  }
  
  async analyzeFan(fanId: string, messages: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const python = spawn('python', [
        path.join(this.pythonPath, 'main.py'),
        'analyze',
        '--fan-id', fanId,
        '--messages', JSON.stringify(messages)
      ]);
      
      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      python.on('close', (code) => {
        if (code === 0) {
          resolve(JSON.parse(output));
        } else {
          reject(new Error(`Python process exited with code ${code}`));
        }
      });
    });
  }
}
```

### 3. Environment Configuration

Add to `.env`:

```bash
# Chatting Assistant Configuration
CHATTING_ASSISTANT_PATH=./Github:Guide/chatting-assistant
CHATTING_ACCOUNT_SIZE=small
CHATTING_PYTHON_PATH=/usr/bin/python3
CHATTING_ENABLE_API=true
CHATTING_MAX_MESSAGE_LENGTH=1000
CHATTING_CACHE_TTL=3600
```

### 4. Database Setup

Run migrations for chatting tables:

```sql
-- migrations/add_chatting_tables.sql
CREATE SCHEMA IF NOT EXISTS chatting;

CREATE TABLE chatting.fan_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fan_id VARCHAR(255) UNIQUE NOT NULL,
    personality_type VARCHAR(50),
    engagement_level VARCHAR(50),
    spending_potential VARCHAR(50),
    interests JSONB,
    last_analyzed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chatting.conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fan_id VARCHAR(255) NOT NULL,
    message_sent TEXT,
    message_received TEXT,
    phase VARCHAR(50),
    effectiveness_score FLOAT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chatting.message_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID,
    fan_type VARCHAR(50),
    phase VARCHAR(50),
    open_rate FLOAT,
    response_rate FLOAT,
    conversion_rate FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_fan_profiles_fan_id ON chatting.fan_profiles(fan_id);
CREATE INDEX idx_conversation_history_fan_id ON chatting.conversation_history(fan_id);
CREATE INDEX idx_conversation_history_timestamp ON chatting.conversation_history(timestamp);
```

### 5. Production Deployment

#### A. Systemd Service (Linux)

Create `/etc/systemd/system/ofm-chatting.service`:

```ini
[Unit]
Description=OFM Chatting Assistant
After=network.target postgresql.service

[Service]
Type=simple
User=ofm
WorkingDirectory=/opt/ofm/Github:Guide/chatting-assistant
Environment="PATH=/opt/ofm/venv/bin:/usr/local/bin:/usr/bin"
ExecStart=/opt/ofm/venv/bin/python main.py --mode server --port 8001
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable ofm-chatting
sudo systemctl start ofm-chatting
```

#### B. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chatting-assistant
  namespace: ofm-social
spec:
  replicas: 2
  selector:
    matchLabels:
      app: chatting-assistant
  template:
    metadata:
      labels:
        app: chatting-assistant
    spec:
      containers:
      - name: chatting-assistant
        image: ofm-chatting-assistant:latest
        env:
        - name: ACCOUNT_SIZE
          value: "large"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ofm-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: chatting-assistant
  namespace: ofm-social
spec:
  selector:
    app: chatting-assistant
  ports:
  - port: 8001
    targetPort: 8001
```

## Monitoring

### 1. Health Check Endpoint

Add to `main.py`:

```python
from flask import Flask, jsonify
import threading

app = Flask(__name__)

@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'module': 'chatting-assistant',
        'version': '1.0.0'
    })

def start_health_server():
    app.run(host='0.0.0.0', port=8001)

# Start in server mode
if args.mode == 'server':
    health_thread = threading.Thread(target=start_health_server)
    health_thread.daemon = True
    health_thread.start()
```

### 2. Prometheus Metrics

Add metrics collection:

```python
from prometheus_client import Counter, Histogram, generate_latest

# Metrics
message_generated = Counter('chatting_messages_generated_total', 
                          'Total messages generated', 
                          ['fan_type', 'phase'])
analysis_duration = Histogram('chatting_analysis_duration_seconds',
                            'Time spent analyzing fan')

@app.route('/metrics')
def metrics():
    return generate_latest()
```

## Performance Optimization

### 1. Model Caching

```python
# Cache spaCy model
import functools

@functools.lru_cache(maxsize=1)
def load_spacy_model():
    return spacy.load("en_core_web_sm")
```

### 2. Database Connection Pooling

```python
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10
)
```

### 3. Redis Caching

```python
import redis
import json

redis_client = redis.Redis(host='redis', port=6379, db=0)

def get_cached_profile(fan_id):
    cached = redis_client.get(f"profile:{fan_id}")
    if cached:
        return json.loads(cached)
    return None

def cache_profile(fan_id, profile, ttl=3600):
    redis_client.setex(
        f"profile:{fan_id}",
        ttl,
        json.dumps(profile)
    )
```

## Troubleshooting

### Common Issues

1. **spaCy Model Error**
   ```bash
   python -m spacy download en_core_web_sm
   ```

2. **Import Errors**
   ```bash
   export PYTHONPATH="${PYTHONPATH}:$(pwd)"
   ```

3. **Permission Denied**
   ```bash
   chmod +x main.py
   chown -R user:user chatting-assistant/
   ```

4. **Memory Issues**
   - Increase Docker memory limit
   - Use smaller spaCy model: `en_core_web_sm`

### Logging

Configure logging in production:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/ofm/chatting.log'),
        logging.StreamHandler()
    ]
)
```

## Security Considerations

1. **Input Validation**: Always sanitize fan messages
2. **Rate Limiting**: Implement per-fan rate limits
3. **Access Control**: Restrict API access
4. **Audit Logging**: Log all generated messages
5. **Compliance**: Never auto-send messages

## Backup

Include in backup strategy:

```bash
# Backup chatting data
pg_dump -h localhost -U postgres -d ofm_db \
  --schema=chatting \
  -f chatting_backup.sql

# Backup conversation history
tar -czf chatting_conversations_$(date +%Y%m%d).tar.gz \
  Github:Guide/chatting-assistant/conversations.json
```