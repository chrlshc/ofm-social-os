# OnlyFans AI Chatting Assistant

[![Python Application](https://github.com/yourusername/onlyfans-ai-chatbot/actions/workflows/python-app.yml/badge.svg)](https://github.com/yourusername/onlyfans-ai-chatbot/actions/workflows/python-app.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)

An intelligent messaging system for OnlyFans creators to personalize fan interactions using psychological profiling and the IRAS framework.

## Features

- **Fan Personality Analysis**: Classifies fans as "Emotional" or "Conqueror" types
- **IRAS Framework**: Implements Intrigue, Rapport, Attraction, Submission phases
- **Cialdini Principles**: Applies persuasion techniques (reciprocity, scarcity, social proof, etc.)
- **Smart Segmentation**: Analyzes sentiment, engagement level, and spending potential
- **Customizable Templates**: Different messaging strategies for small vs large accounts
- **Compliance-First**: Messages are generated for manual review and sending

## Installation

1. Clone or download this repository
2. Install dependencies:
```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

## Usage

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

## Support

For issues or questions, please review the code documentation or modify the templates in `message_generator.py` to match your brand voice.