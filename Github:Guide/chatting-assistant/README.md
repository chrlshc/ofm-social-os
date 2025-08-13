# OnlyFans AI Chatting Assistant

[![Python Application](https://github.com/yourusername/onlyfans-ai-chatbot/actions/workflows/python-app.yml/badge.svg)](https://github.com/yourusername/onlyfans-ai-chatbot/actions/workflows/python-app.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)

An intelligent messaging system for OnlyFans creators to personalize fan interactions using psychological profiling and the IRAS framework.

## Features

### **🎯 Personnalisation Avancée en Temps Réel**
- **⚡ Adaptation Contextuelle**: Messages adaptés à l'activité, l'heure et les préférences
- **🧭 Suivi d'Affinités**: Détection automatique des sujets d'intérêt de chaque fan
- **📱 Analyse d'Activité**: Intégration des connexions, achats et comportements

### **🧠 Intelligence Émotionnelle**
- **🎭 Analyse Émotionnelle IA**: 8 émotions détectées via transformers (joie, tristesse, désir, etc.)
- **🎨 Adaptation du Ton**: Modulation automatique selon l'état émotionnel
- **📊 Profil Émotionnel**: Historique et tendances émotionnelles de chaque fan

### **🔬 Tests A/B Intelligents**
- **🎰 Multi-Armed Bandit**: Algorithmes UCB et Thompson Sampling pour optimisation
- **📈 Optimisation Continue**: Amélioration automatique des performances
- **📋 Tests de Significativité**: Validation statistique robuste

### **🤝 Apprentissage Multi-Agents**
- **🌐 API Collaborative**: Partage de connaissances entre agents
- **🔄 Synchronisation**: Propagation automatique des meilleures pratiques
- **📚 Base Collective**: Tous les agents apprennent ensemble

### **🚀 Fonctionnalités Core**
- **📤 One-Click Manual Sending**: Workflow simplifié avec conformité OnlyFans
- **🤖 ML-Enhanced Classification**: Modèles d'IA avancés pour analyse comportementale
- **👥 Analyse Psychologique**: Types "Emotional" vs "Conqueror" avec scores de confiance
- **📊 Framework IRAS**: Phases Intrigue, Rapport, Attraction, Submission
- **🎯 Principes Cialdini**: Techniques de persuasion intégrées
- **⚙️ Templates Dynamiques**: A/B testing et optimisation automatique
- **📈 Analytics Complets**: Prédiction de churn, analyse de dépenses
- **✅ Conformité Totale**: Audit trail complet et envoi manuel requis

## Installation

1. Clone or download this repository
2. Install dependencies:
```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

## Usage

### 🚀 One-Click Manual Sending

Generate and copy messages with one command:

```bash
# Generate message and copy to clipboard
python main.py generate \
  --profile '{"type": "Emotional"}' \
  --phase "attraction" \
  --fan-id "fan_123" \
  --copy

# Output:
# ✅ Message copied to clipboard!
# 📋 Paste it in OnlyFans and send manually
```

### Interactive Mode

Run the chatbot in interactive mode for testing:

```bash
python main.py
```

Commands:
- `analyze` - Analyze fan messages and get response suggestions
- `scenario` - Generate messages for special scenarios (birthday, upsell, etc.)
- `save` - Save conversation data
- `load` - Load previous conversations
- `quit` - Exit the program

### Batch Processing

Process multiple fans from a JSON file:

```bash
python main.py --mode batch --input fans.json --account-size large
```

Input file format:
```json
[
  {
    "id": "fan123",
    "messages": [
      "Hey! I love your content",
      "You're amazing, can't wait to see more"
    ]
  }
]
```

## Message Examples

### Emotional Type Fan
- **Intrigue**: "Hey sweetie! 💕 I've been thinking about you... want to hear something personal?"
- **Rapport**: "I really loved what you said about {topic} 💕 It made me feel so understood"
- **Attraction**: "I created something intimate just for you... want a sneak peek? 😘"

### Conqueror Type Fan
- **Intrigue**: "🔥 Ready for an exclusive opportunity? Only my VIPs get this offer..."
- **Rapport**: "You're ranking #top 10% among my supporters! 🏆 That's seriously impressive"
- **Attraction**: "🚀 EXCLUSIVE DROP: Premium content - Only for my top 1% fans like you"

## Configuration

Edit `config.json` to customize:
- Account size settings
- IRAS phase durations
- Pricing tiers
- Message timing
- Emoji preferences

## Compliance Notice

⚠️ **IMPORTANT**: This tool generates message suggestions only. Always:
- Review messages before sending
- Send messages manually (no automation)
- Comply with OnlyFans Terms of Service
- Respect fan boundaries and consent

## File Structure

```
chatting/
├── main.py              # Main application entry point
├── fan_analyzer.py      # Fan personality and behavior analysis
├── message_generator.py # Message generation with IRAS framework
├── config.json         # Configuration settings
├── requirements.txt    # Python dependencies
└── README.md          # This file
```

## Advanced Features

### Spending Potential Analysis
The system analyzes message patterns to estimate spending potential:
- High spenders: References to large amounts, VIP language
- Medium spenders: Moderate purchase intent
- Low spenders: Price-sensitive language

### Re-engagement Campaigns
Automated suggestions for winning back inactive fans:
- < 7 days: Gentle check-in
- < 30 days: Special offer
- > 30 days: Urgent reactivation

### Upsell Sequences
Progressive messaging to increase fan spending:
- Start with appreciation
- Build on previous purchases
- Create exclusive opportunities

## 🧠 ML Training Pipeline

Train custom models for improved accuracy:

```bash
# Check training status
python train_models.py status

# Train models from database
python train_models.py train

# Evaluate performance
python train_models.py evaluate

# Process feedback data
python train_models.py feedback feedback.json
```

### API Training Endpoints

```bash
# Training status
GET /ml/training/status

# Start training
POST /ml/training/start
{"force_retrain": false}

# Model feedback
POST /ml/feedback
{
  "fan_id": "fan123",
  "messages": ["Hey beautiful"],
  "true_personality": "Emotional",
  "true_engagement": "high"
}
```

**See [ML_TRAINING_GUIDE.md](ML_TRAINING_GUIDE.md) for complete training documentation.**

## 🚀 One-Click Sending System

Streamline your workflow while maintaining OnlyFans compliance:

### API Endpoints

```bash
# Prepare message for sending
POST /send/prepare
{
  "fan_id": "fan_123",
  "message": "Hey love! 💕 I've been thinking about you..."
}

# Execute one-click send (copy + open OnlyFans)
POST /send/execute
{"audit_id": "audit_fan_123_20240101_120000"}

# Confirm manual send completion
POST /send/confirm/{audit_id}

# Get sending reports
GET /send/report?fan_id=fan_123&days=7
```

### React Component

```jsx
import MessageSender from './frontend/MessageSender';

<MessageSender
  fanId="fan_123"
  suggestedMessage="Generated message here"
  onSendComplete={(result) => console.log('Sent!', result)}
/>
```

**See [ONE_CLICK_SENDING_GUIDE.md](ONE_CLICK_SENDING_GUIDE.md) for complete documentation.**

## 🎯 Personnalisation Avancée

### Personnalisation en Temps Réel

```python
# Génération avec personnalisation complète
result = generator.generate_personalized_message(
    fan_profile={"type": "Emotional"},
    phase="attraction", 
    fan_id="fan_123",
    messages=["Hey beautiful", "I miss you"]
)

# Utilise automatiquement :
# - Historique d'activité du fan
# - Analyse émotionnelle des messages  
# - Affinités détectées
# - Adaptation temporelle
# - Tests A/B optimaux
```

### Analyse Émotionnelle

```python
# Détection automatique de 8 émotions
emotions = emotion_analyzer.detect_emotions([
    "I feel so lonely today",
    "You always make me smile"
])
# Résultat: {"sadness": 0.7, "love": 0.6, "joy": 0.3}

# Adaptation du ton automatique
tonality = emotion_analyzer.select_tonality(emotions, "Emotional")
# Résultat: {"approach": "empathetic", "modifiers": ["comforting"]}
```

### API Multi-Agents

```bash
# Partage de profils entre agents
GET /agent/profile/fan_123
Headers: X-Agent-ID: agent_001, X-Agent-Key: key

# Sélection de variante optimisée
POST /agent/variants/select
{"fan_type": "Emotional", "phase": "attraction", "strategy": "thompson_sampling"}

# Partage de connaissances
POST /agent/knowledge/share
{"type": "pattern", "content": "Fans lonely respond +40% to empathy", "confidence": 0.85}
```

**See [ADVANCED_PERSONALIZATION_GUIDE.md](ADVANCED_PERSONALIZATION_GUIDE.md) for complete advanced features documentation.**

## 📊 Advanced Features

### Dynamic Templates
- Database-driven message templates
- A/B testing with effectiveness tracking
- Automatic optimization based on performance

### Fan Analytics
- Comprehensive behavioral tracking
- Churn risk prediction
- Spending potential analysis
- Communication pattern insights

### Compliance & Security
- Complete audit trail for all messages
- Platform policy validation
- Manual send requirement enforcement
- Compliance scoring and reporting

## Support

For issues or questions, please review the code documentation or modify the templates in `message_generator.py` to match your brand voice.