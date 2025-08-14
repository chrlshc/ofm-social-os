import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createObjectCsvWriter } from 'csv-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gestionnaire de handoff entre DM auto et closeurs
export class CloserHandoffManager {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(__dirname, '../data/handoffs.json');
    this.conversations = new Map();
    this.responseTracking = new Map();
    this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        data.conversations?.forEach(conv => {
          this.conversations.set(conv.username, conv);
        });
      }
    } catch (e) {
      console.error('Failed to load handoff data:', e);
    }
  }

  saveData() {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const data = {
      conversations: Array.from(this.conversations.values()),
      updated: new Date().toISOString()
    };
    
    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  // Enregistrer une nouvelle conversation pour handoff
  registerHandoff(dmResult) {
    const conversation = {
      username: dmResult.target,
      account: dmResult.account,
      introMessage: dmResult.message,
      sentAt: dmResult.timestamp,
      status: 'pending_response',
      priority: 'normal',
      assigned: null,
      metrics: {
        timeToResponse: null,
        responseReceived: false,
        closerAssigned: null
      }
    };
    
    this.conversations.set(dmResult.target, conversation);
    this.saveData();
  }

  // Marquer qu'une réponse a été reçue
  markResponse(username, responseData) {
    const conv = this.conversations.get(username);
    if (!conv) return;
    
    conv.status = 'response_received';
    conv.metrics.responseReceived = true;
    conv.metrics.timeToResponse = Date.now() - new Date(conv.sentAt).getTime();
    conv.responseData = {
      message: responseData.message,
      sentiment: this.analyzeSentiment(responseData.message),
      receivedAt: new Date().toISOString()
    };
    
    // Calculer la priorité basée sur la réponse
    conv.priority = this.calculatePriority(conv);
    
    this.saveData();
  }

  analyzeSentiment(message) {
    const lower = message.toLowerCase();
    
    // Indicateurs positifs
    const positive = [
      'yes', 'yeah', 'sure', 'interested', 'tell me', 
      'sounds good', 'love', 'awesome', 'great', 'thanks'
    ];
    
    // Indicateurs négatifs
    const negative = [
      'no', 'not interested', 'stop', 'spam', 'leave me alone'
    ];
    
    // Questions
    const questions = [
      '?', 'how', 'what', 'when', 'where', 'why', 'cost', 'price'
    ];
    
    let sentiment = 'neutral';
    
    if (positive.some(word => lower.includes(word))) {
      sentiment = 'positive';
    } else if (negative.some(word => lower.includes(word))) {
      sentiment = 'negative';
    } else if (questions.some(q => lower.includes(q))) {
      sentiment = 'curious';
    }
    
    return sentiment;
  }

  calculatePriority(conversation) {
    let score = 0;
    
    // Sentiment positif = haute priorité
    if (conversation.responseData?.sentiment === 'positive') score += 50;
    if (conversation.responseData?.sentiment === 'curious') score += 30;
    
    // Réponse rapide = intérêt élevé
    const responseTime = conversation.metrics.timeToResponse;
    if (responseTime && responseTime < 5 * 60 * 1000) score += 30; // <5 min
    else if (responseTime && responseTime < 30 * 60 * 1000) score += 20; // <30 min
    
    // Longueur de la réponse
    const msgLength = conversation.responseData?.message?.length || 0;
    if (msgLength > 50) score += 10; // Réponse détaillée
    
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  // Obtenir les conversations prêtes pour les closeurs
  getReadyForClosers(options = {}) {
    const { minAge = 30 * 60 * 1000, onlyWithResponse = false } = options;
    
    const ready = [];
    const now = Date.now();
    
    for (const [username, conv] of this.conversations) {
      const age = now - new Date(conv.sentAt).getTime();
      
      // Filtres
      if (age < minAge) continue;
      if (onlyWithResponse && !conv.metrics.responseReceived) continue;
      if (conv.assigned) continue; // Déjà assigné
      if (conv.status === 'closed') continue;
      
      ready.push({
        ...conv,
        age: Math.floor(age / 1000 / 60), // Minutes
        readyScore: this.getReadyScore(conv)
      });
    }
    
    // Trier par score de priorité
    ready.sort((a, b) => {
      // Priorité haute d'abord
      if (a.priority !== b.priority) {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      // Puis par score
      return b.readyScore - a.readyScore;
    });
    
    return ready;
  }

  getReadyScore(conversation) {
    let score = 0;
    
    // Avec réponse = priorité
    if (conversation.metrics.responseReceived) score += 100;
    
    // Sentiment positif/curieux = bonus
    if (conversation.responseData?.sentiment === 'positive') score += 50;
    if (conversation.responseData?.sentiment === 'curious') score += 30;
    
    // Pénalité pour conversations trop vieilles
    const age = Date.now() - new Date(conversation.sentAt).getTime();
    if (age > 24 * 60 * 60 * 1000) score -= 50; // >24h
    
    return score;
  }

  // Assigner une conversation à un closeur
  assignToCloser(username, closerName) {
    const conv = this.conversations.get(username);
    if (!conv) return false;
    
    conv.assigned = closerName;
    conv.assignedAt = new Date().toISOString();
    conv.status = 'assigned';
    conv.metrics.closerAssigned = closerName;
    
    this.saveData();
    return true;
  }

  // Export pour interface closeur
  async exportForCloserInterface(outputPath) {
    const ready = this.getReadyForClosers({ onlyWithResponse: true });
    
    const exportData = ready.map(conv => ({
      username: conv.username,
      dm_account: conv.account,
      intro_sent: conv.introMessage,
      response: conv.responseData?.message || '',
      sentiment: conv.responseData?.sentiment || '',
      priority: conv.priority,
      time_since_intro: `${conv.age}min`,
      suggested_action: this.getSuggestedAction(conv)
    }));
    
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'username', title: 'Username' },
        { id: 'dm_account', title: 'DM Account' },
        { id: 'intro_sent', title: 'Intro Message' },
        { id: 'response', title: 'Their Response' },
        { id: 'sentiment', title: 'Sentiment' },
        { id: 'priority', title: 'Priority' },
        { id: 'time_since_intro', title: 'Time Since Intro' },
        { id: 'suggested_action', title: 'Suggested Action' }
      ]
    });
    
    await csvWriter.writeRecords(exportData);
    
    // Aussi créer un JSON pour interface web
    const jsonPath = outputPath.replace('.csv', '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(exportData, null, 2));
    
    console.log(`\n📤 Exported ${exportData.length} conversations for closers`);
    console.log(`   CSV: ${outputPath}`);
    console.log(`   JSON: ${jsonPath}`);
    
    return exportData;
  }

  getSuggestedAction(conversation) {
    const sentiment = conversation.responseData?.sentiment;
    
    switch(sentiment) {
      case 'positive':
        return 'Send beta info + link';
      case 'curious':
        return 'Answer questions + soft pitch';
      case 'neutral':
        return 'Build more rapport';
      case 'negative':
        return 'Skip or gentle re-engage';
      default:
        return 'Wait for response';
    }
  }

  // Stats pour monitoring
  getStats() {
    const stats = {
      total: this.conversations.size,
      pending: 0,
      responded: 0,
      assigned: 0,
      closed: 0,
      avgResponseTime: 0,
      bySentiment: {
        positive: 0,
        curious: 0,
        neutral: 0,
        negative: 0
      },
      byPriority: {
        high: 0,
        medium: 0,
        low: 0
      }
    };
    
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (const conv of this.conversations.values()) {
      // Status
      if (conv.status === 'pending_response') stats.pending++;
      if (conv.metrics.responseReceived) stats.responded++;
      if (conv.assigned) stats.assigned++;
      if (conv.status === 'closed') stats.closed++;
      
      // Sentiment
      if (conv.responseData?.sentiment) {
        stats.bySentiment[conv.responseData.sentiment]++;
      }
      
      // Priority
      stats.byPriority[conv.priority]++;
      
      // Response time
      if (conv.metrics.timeToResponse) {
        totalResponseTime += conv.metrics.timeToResponse;
        responseCount++;
      }
    }
    
    if (responseCount > 0) {
      stats.avgResponseTime = Math.floor(totalResponseTime / responseCount / 1000 / 60); // Minutes
    }
    
    return stats;
  }

  // Nettoyer les vieilles conversations
  cleanup(daysOld = 7) {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let removed = 0;
    
    for (const [username, conv] of this.conversations) {
      const age = Date.now() - new Date(conv.sentAt).getTime();
      if (age > cutoff && conv.status === 'closed') {
        this.conversations.delete(username);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.saveData();
      console.log(`🧹 Cleaned up ${removed} old conversations`);
    }
  }
}