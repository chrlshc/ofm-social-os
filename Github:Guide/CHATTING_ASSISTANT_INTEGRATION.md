# OnlyFans Chatting Assistant Integration Guide

## Overview

The Chatting Assistant is an AI-powered module for the OFM Social OS that provides intelligent message generation for OnlyFans creators. It integrates with the existing marketing automation system to deliver personalized fan interactions.

## Module Location

```
Github:Guide/chatting-assistant/
├── main.py                  # Main CLI application
├── fan_analyzer.py          # Fan personality profiling
├── message_generator.py     # IRAS-based message generation
├── config.json             # Configuration settings
├── requirements.txt        # Python dependencies
└── README.md              # Module documentation
```

## Integration with OFM Social OS

### 1. Database Integration

The chatting assistant can be integrated with the existing PostgreSQL database:

```sql
-- Add to existing schema
CREATE TABLE fan_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fan_id VARCHAR(255) UNIQUE NOT NULL,
    personality_type VARCHAR(50),
    engagement_level VARCHAR(50),
    spending_potential VARCHAR(50),
    last_analyzed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_data JSONB
);

CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personality_type VARCHAR(50),
    phase VARCHAR(50),
    template_text TEXT,
    effectiveness_score FLOAT DEFAULT 0.0
);

CREATE TABLE conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fan_id VARCHAR(255),
    message_sent TEXT,
    message_received TEXT,
    phase VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. API Integration

Add these endpoints to the existing Express API:

```javascript
// Add to src/routes/chatting.ts
import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

router.post('/analyze-fan', async (req, res) => {
    const { fanId, messages } = req.body;
    
    const command = `cd Github:Guide/chatting-assistant && python main.py analyze --fan-id ${fanId} --messages '${JSON.stringify(messages)}' --output json`;
    const { stdout } = await execAsync(command);
    
    res.json(JSON.parse(stdout));
});

router.post('/generate-message', async (req, res) => {
    const { fanProfile, phase, context } = req.body;
    
    let command = `cd Github:Guide/chatting-assistant && python main.py generate --profile '${JSON.stringify(fanProfile)}' --phase ${phase} --output json`;
    if (context) {
        command += ` --context '${JSON.stringify(context)}'`;
    }
    
    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);
    
    res.json({
        message: result.message,
        compliance: result.compliance,
        manual_send_required: result.manual_send_required
    });
});

export default router;
```

### 3. Frontend Integration

Add to the React dashboard:

```jsx
// components/ChattingAssistant.jsx
import React, { useState } from 'react';
import { analyzeEmail, generateMessage } from '../api/chatting';

const ChattingAssistant = () => {
    const [messages, setMessages] = useState([]);
    const [suggestedResponse, setSuggestedResponse] = useState('');
    
    const analyzeFan = async (fanId, messageHistory) => {
        const analysis = await analyzeFan(fanId, messageHistory);
        const response = await generateMessage(analysis.profile, analysis.phase);
        setSuggestedResponse(response.message);
    };
    
    return (
        <div className="chatting-assistant">
            <h3>AI Message Assistant</h3>
            <div className="fan-messages">
                {/* Message history */}
            </div>
            <div className="suggested-response">
                <h4>Suggested Response:</h4>
                <textarea value={suggestedResponse} readOnly />
                <button onClick={() => navigator.clipboard.writeText(suggestedResponse)}>
                    Copy to Clipboard
                </button>
            </div>
        </div>
    );
};
```

### 4. Temporal Workflow Integration

Add to existing Temporal workflows:

```javascript
// src/temporal/activities/chattingAssistant.ts
import { execSync } from 'child_process';

export async function analyzeFanActivity(fanId: string, messages: string[]): Promise<any> {
    const command = `cd Github:Guide/chatting-assistant && python main.py analyze --fan-id ${fanId} --messages '${JSON.stringify(messages)}' --output json`;
    const result = execSync(command, { encoding: 'utf8' });
    return JSON.parse(result);
}

export async function generatePersonalizedMessage(profile: any, phase: string, context?: any): Promise<any> {
    let command = `cd Github:Guide/chatting-assistant && python main.py generate --profile '${JSON.stringify(profile)}' --phase ${phase} --output json`;
    if (context) {
        command += ` --context '${JSON.stringify(context)}'`;
    }
    
    const result = execSync(command, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    
    return {
        message: parsed.message,
        compliance: parsed.compliance,
        manual_send_required: parsed.manual_send_required
    };
}
```

## Installation Steps

1. **Install Python dependencies:**
```bash
cd Github:Guide/chatting-assistant
pip install -r requirements.txt
python -m spacy download en_core_web_sm
# For French support:
python -m spacy download fr_core_news_sm
```

2. **Setup environment variables:**
```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env with your settings:
# DATABASE_URL=postgresql://user:pass@localhost:5432/ofm_db
# CHATTING_ACCOUNT_SIZE=small
# CHATTING_LANGUAGE=en
# CHATTING_MANUAL_SEND=true
```

3. **Database migration:**
```bash
npm run migrate:chatting
```

4. **Add to Docker setup:**
```dockerfile
# Add to Dockerfile
RUN pip install spacy textblob nltk pandas numpy scikit-learn python-dotenv colorama
RUN python -m spacy download en_core_web_sm
```

## Configuration

Update `chatting-assistant/config.json` for your needs:

```json
{
  "account_settings": {
    "account_size": "small", // or "large"
    "compliance_mode": true,
    "manual_review": true
  }
}
```

## Usage Examples

### CLI Usage
```bash
# Interactive mode
cd Github:Guide/chatting-assistant
python main.py interactive

# Analyze specific fan
python main.py analyze --fan-id fan123 --messages '["Hey beautiful", "Love your content"]'

# Generate message for fan type
python main.py generate --profile '{"type": "Emotional", "engagement_level": "high"}' --phase attraction

# Batch processing
python main.py batch --input example_fans.json

# Start HTTP server
python main.py server --port 8001
```

### API Usage
```javascript
// Analyze fan
const analysis = await fetch('/api/chatting/analyze-fan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        fanId: 'fan123',
        messages: ['Hey beautiful', 'Love your content']
    })
});

// Generate message with compliance check
const response = await fetch('/api/chatting/generate-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        fanProfile: { type: "Emotional", engagement_level: "high" },
        phase: 'attraction',
        context: { topic: "our conversation", offer_link: "exclusive content" }
    })
});

const result = await response.json();
// result.message - the generated message
// result.compliance - compliance check result
// result.manual_send_required - true/false
```

## Monitoring

Add to existing monitoring:

```javascript
// Track message effectiveness
const trackMessagePerformance = async (fanId, message, response) => {
    await db.query(`
        INSERT INTO message_analytics (fan_id, message_sent, response_rate, conversion_rate)
        VALUES ($1, $2, $3, $4)
    `, [fanId, message, responseRate, conversionRate]);
};
```

## Security Considerations

1. **Never auto-send messages** - Always require manual approval
2. **Sanitize inputs** - Prevent injection attacks
3. **Rate limiting** - Prevent abuse
4. **Audit logging** - Track all generated messages

## Troubleshooting

Common issues:

1. **spaCy model not found:**
   ```bash
   python -m spacy download en_core_web_sm
   ```

2. **Permission errors:**
   ```bash
   chmod +x Github:Guide/chatting-assistant/main.py
   ```

3. **Import errors:**
   ```bash
   export PYTHONPATH="${PYTHONPATH}:Github:Guide/chatting-assistant"
   ```