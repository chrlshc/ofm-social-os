# 🎯 Guide Closers - Handoff & Conversion

## 📋 Lire le fichier handoff.csv

Chaque ligne = 1 conversation qualifiée avec toutes les infos pour closer :

| Colonne | Description | Exemple |
|---------|-------------|---------|
| `username` | @ du prospect | @sarah_fit |
| `from_account` | Compte qui a DM | @model_account_1 |
| `message_intro` | Notre 1er message | "hey girl! love your content 😍" |
| `reply` | Sa réponse | "thanks! what is this about?" |
| `intent` | Intention détectée | curious / pricing / skeptical |
| `sentiment` | Sentiment analysé | positive / neutral / negative |
| `priority` | Urgence suggérée | high / medium / low |
| `latency_sec` | Temps de réponse | 420 (= 7 min) |
| `tz` | Timezone estimé | ET / CT / MT / PT |
| `closer_hint` | Action recommandée | "Acknowledge; share value; ask contact" |
| `ai_playbook` | Script 3 étapes | "Thanks for reply → Share ROI → Book call" |

## 🔥 Scripts de réponse par intent

### Intent: CURIOUS + Sentiment: POSITIVE
```
Hey {name}! Love your energy 💕
I help creators like you maximize their earnings - most see 3-5x growth in 60 days
Quick 15 min call this week? I'm free [TZ-friendly times]
```

### Intent: PRICING + Sentiment: NEUTRAL  
```
Great question! Investment depends on your goals
Most creators make it back in 30-45 days (Sarah went from $3k→$15k/month)
Can I ask what your current monthly is? Happy to share exact numbers
```

### Intent: SKEPTICAL + Sentiment: NEUTRAL
```
Totally understand the caution! 
I work with [similar creator in their niche] who felt the same
No pressure - want to see some results first? [screenshot/testimonial]
```

### Intent: REJECT + Sentiment: NEGATIVE
```
No worries at all! Appreciate you letting me know 🙏
If you ever want tips or change your mind, I'm here
Best of luck with your content! ✨
```

## ⏰ SLA & Timing

- **High Priority** (positive/curious) → Répondre < 2h
- **Medium Priority** (neutral/pricing) → Répondre < 6h  
- **Low Priority** (negative/reject) → Répondre < 24h

**Heures optimales par timezone:**
- ET: 12pm-2pm, 7pm-10pm
- CT: 11am-1pm, 6pm-9pm
- MT: 10am-12pm, 5pm-8pm
- PT: 9am-11am, 4pm-7pm

## 📊 KPIs de conversion

Objectifs par intent:
- **Curious** → 40% book call
- **Pricing** → 25% qualify  
- **Skeptical** → 15% re-engage
- **Overall** → 20% to call minimum

## 🚀 Process de handoff

1. **Import CSV** dans votre CRM/sheets
2. **Trier par priority** (high → low)
3. **Répondre dans IG** depuis le compte original
4. **Logger l'action** (responded/booked/rejected)
5. **Export stats** fin de journée

## 💡 Tips pros

- Réponses < 100 caractères convertissent mieux
- Voice notes pour high-intent (60% plus de conversion)
- Partager preuve sociale du même niche
- Proposer 2-3 créneaux précis (pas "quand tu veux")
- Si pas de réponse après 48h → 1 relance max

## 🎯 Exemples de closes réussis

**Close rapide (intent: curious)**
```
Them: "omg yes tell me more!"
You: "Yay! So excited 💕 I help creators optimize their funnels & pricing"
You: "Most go from $5k to $20k+ monthly - want to jump on a quick call?"
You: "Free tomorrow 2pm ET or Thursday 7pm?"
Them: "Thursday works!"
→ BOOKED ✅
```

**Close pricing (intent: pricing)**
```
Them: "how much?"
You: "Depends on your goals! Most invest $X-Y"
You: "But avg ROI is 5-10x in 60 days"
You: "What's your current monthly? Can share exact numbers"
Them: "Around $8k"
You: "Perfect! Similar creators hit $30-40k with our system"
You: "15 min call to show you how?"
→ QUALIFIED ✅
```

---

📈 **Dashboard live**: http://localhost:8088/stats/live

Questions? Post in #closers-support 💬