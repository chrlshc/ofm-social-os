import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createObjectCsvWriter } from 'csv-writer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced reply monitoring with sentiment analysis and automated handoff
 */
export class EnhancedReplyMonitor {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(__dirname, '../data/conversations.json');
    this.conversations = new Map();
    this.pendingHandoffs = new Map();
    this.sentimentPatterns = this.loadSentimentPatterns();
    this.loadConversations();
  }

  loadConversations() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        data.conversations?.forEach(conv => {
          this.conversations.set(conv.id, conv);
        });
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }

  saveConversations() {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const data = {
      conversations: Array.from(this.conversations.values()),
      updated: new Date().toISOString()
    };
    
    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  loadSentimentPatterns() {
    return {
      positive: {
        keywords: [
          'yes', 'yeah', 'sure', 'ok', 'okay', 'great', 'awesome', 
          'interested', 'love', 'thanks', 'thank you', 'perfect',
          'sounds good', 'tell me more', 'cool', 'nice', 'definitely',
          'absolutely', 'for sure', 'would love'
        ],
        emojis: ['😊', '😍', '🥰', '💕', '❤️', '👍', '🙌', '✨', '💖'],
        patterns: [
          /i'?m interested/i,
          /tell me more/i,
          /sounds good/i,
          /i would love/i,
          /sign me up/i,
          /how do i/i
        ]
      },
      
      curious: {
        keywords: [
          'what', 'how', 'when', 'where', 'why', 'tell me',
          'curious', 'wondering', 'question', 'more info',
          'explain', 'details'
        ],
        patterns: [
          /what is/i,
          /how does/i,
          /can you tell/i,
          /more about/i,
          /\?$/
        ]
      },
      
      negative: {
        keywords: [
          'no', 'not', 'stop', 'unsubscribe', 'remove',
          'not interested', 'leave me alone', 'spam', 'scam',
          'block', 'report', 'fake', 'bye'
        ],
        emojis: ['😒', '🙄', '😤', '👎', '❌', '🚫'],
        patterns: [
          /not interested/i,
          /no thanks/i,
          /stop messaging/i,
          /leave me alone/i,
          /don'?t message/i
        ]
      },
      
      neutral: {
        keywords: ['ok', 'alright', 'hmm', 'maybe', 'perhaps', 'idk'],
        patterns: [/^ok$/i, /^alright$/i, /^hmm+$/i]
      }
    };
  }

  /**
   * Record a sent DM
   */
  recordSentDM(target, account, message, options = {}) {
    const conversationId = `${account}-${target}`;
    
    const conversation = {
      id: conversationId,
      target: target,
      account: account,
      messages: [
        {
          type: 'sent',
          text: message,
          timestamp: new Date().toISOString(),
          ...options
        }
      ],
      status: 'pending_reply',
      created: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metadata: {
        preEngagement: options.preEngagement || false,
        messageSource: options.messageSource || 'template'
      }
    };
    
    this.conversations.set(conversationId, conversation);
    this.saveConversations();
    
    return conversationId;
  }

  /**
   * Record a received reply
   */
  recordReply(target, account, replyText) {
    const conversationId = `${account}-${target}`;
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      console.warn(`No conversation found for ${conversationId}`);
      return null;
    }
    
    const reply = {
      type: 'received',
      text: replyText,
      timestamp: new Date().toISOString()
    };
    
    conversation.messages.push(reply);
    conversation.status = 'replied';
    conversation.lastActivity = new Date().toISOString();
    
    // Analyze sentiment
    const analysis = this.analyzeSentiment(replyText);
    conversation.sentiment = analysis.sentiment;
    conversation.sentimentScore = analysis.score;
    conversation.intent = analysis.intent;
    
    // Calculate reply time
    const sentTime = new Date(conversation.messages[0].timestamp);
    const replyTime = new Date(reply.timestamp);
    conversation.replyTimeMinutes = Math.floor((replyTime - sentTime) / 1000 / 60);
    
    // Mark for handoff
    this.pendingHandoffs.set(conversationId, conversation);
    
    this.saveConversations();
    
    return {
      conversationId,
      sentiment: analysis.sentiment,
      intent: analysis.intent,
      replyTime: conversation.replyTimeMinutes
    };
  }

  /**
   * Analyze sentiment and intent of a reply
   */
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();
    const patterns = this.sentimentPatterns;
    
    let scores = {
      positive: 0,
      curious: 0,
      negative: 0,
      neutral: 0
    };
    
    // Check positive patterns
    patterns.positive.keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) scores.positive += 2;
    });
    patterns.positive.patterns.forEach(pattern => {
      if (pattern.test(text)) scores.positive += 3;
    });
    patterns.positive.emojis?.forEach(emoji => {
      if (text.includes(emoji)) scores.positive += 2;
    });
    
    // Check curious patterns
    patterns.curious.keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) scores.curious += 2;
    });
    patterns.curious.patterns.forEach(pattern => {
      if (pattern.test(text)) scores.curious += 3;
    });
    
    // Check negative patterns
    patterns.negative.keywords.forEach(keyword => {
      if (lowerText.includes(keyword)) scores.negative += 3;
    });
    patterns.negative.patterns.forEach(pattern => {
      if (pattern.test(text)) scores.negative += 4;
    });
    patterns.negative.emojis?.forEach(emoji => {
      if (text.includes(emoji)) scores.negative += 2;
    });
    
    // Determine primary sentiment
    let sentiment = 'neutral';
    let maxScore = scores.neutral;
    
    for (const [key, score] of Object.entries(scores)) {
      if (score > maxScore) {
        sentiment = key;
        maxScore = score;
      }
    }
    
    // Determine intent
    let intent = 'unclear';
    if (sentiment === 'positive' && scores.positive >= 5) {
      intent = 'interested';
    } else if (sentiment === 'curious') {
      intent = 'needs_info';
    } else if (sentiment === 'negative') {
      intent = 'not_interested';
    } else if (text.length < 10) {
      intent = 'acknowledge';
    }
    
    // Calculate confidence score
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? (maxScore / totalScore) * 100 : 50;
    
    return {
      sentiment,
      intent,
      score: confidence,
      scores
    };
  }

  /**
   * Check all accounts for new replies
   */
  async checkAllAccountsForReplies(accountManager, igClient) {
    const accounts = accountManager.accounts;
    const newReplies = [];
    
    for (const account of accounts) {
      try {
        console.log(`📬 Checking replies for @${account.username}...`);
        
        // Login to account (with proxy if configured)
        await igClient.login(account.username, account.password, account.proxy);
        
        // Get recent conversations
        const conversations = await igClient.getRecentConversations(50); // Last 50 conversations
        
        for (const igConv of conversations) {
          const conversationId = `${account.username}-${igConv.username}`;
          const localConv = this.conversations.get(conversationId);
          
          // Check if we have a pending conversation with this user
          if (localConv && localConv.status === 'pending_reply') {
            // Check for new messages
            const messages = await igClient.getConversationMessages(igConv.id);
            const ourLastMessage = localConv.messages[localConv.messages.length - 1];
            
            // Find messages after our last sent message
            const newMessages = messages.filter(msg => 
              new Date(msg.timestamp) > new Date(ourLastMessage.timestamp) &&
              msg.sender !== account.username
            );
            
            if (newMessages.length > 0) {
              // Record the reply
              const latestReply = newMessages[newMessages.length - 1];
              const result = this.recordReply(
                igConv.username,
                account.username,
                latestReply.text
              );
              
              newReplies.push({
                ...result,
                target: igConv.username,
                account: account.username
              });
              
              console.log(`  ✅ New reply from @${igConv.username}: "${latestReply.text.substring(0, 50)}..."`);
            }
          }
        }
        
      } catch (error) {
        console.error(`  ❌ Error checking ${account.username}:`, error.message);
      }
    }
    
    console.log(`\n📊 Found ${newReplies.length} new replies across all accounts`);
    
    return newReplies;
  }

  /**
   * Generate handoff report for closers
   */
  async generateHandoffReport(options = {}) {
    const {
      outputPath = path.join(__dirname, '../output/handoff_report.csv'),
      minAge = 30 * 60 * 1000, // 30 minutes
      onlyReplied = false
    } = options;
    
    const handoffData = [];
    const now = Date.now();
    
    for (const [convId, conversation] of this.conversations) {
      const age = now - new Date(conversation.created).getTime();
      
      // Apply filters
      if (age < minAge) continue;
      if (onlyReplied && conversation.status !== 'replied') continue;
      
      // Calculate priority
      const priority = this.calculatePriority(conversation);
      
      // Get suggested action
      const suggestedAction = this.getSuggestedAction(conversation);
      
      handoffData.push({
        username: conversation.target,
        dm_account: conversation.account,
        intro_sent: conversation.messages[0]?.text || '',
        response: conversation.messages.find(m => m.type === 'received')?.text || '',
        sentiment: conversation.sentiment || 'no_reply',
        intent: conversation.intent || 'none',
        confidence: conversation.sentimentScore ? `${Math.round(conversation.sentimentScore)}%` : 'N/A',
        reply_time: conversation.replyTimeMinutes ? `${conversation.replyTimeMinutes}min` : 'N/A',
        priority: priority,
        suggested_action: suggestedAction,
        conversation_id: convId,
        timestamp: conversation.lastActivity
      });
    }
    
    // Sort by priority
    handoffData.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    // Write CSV
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'username', title: 'Target Username' },
        { id: 'dm_account', title: 'Our Account' },
        { id: 'intro_sent', title: 'Intro Message' },
        { id: 'response', title: 'Their Reply' },
        { id: 'sentiment', title: 'Sentiment' },
        { id: 'intent', title: 'Intent' },
        { id: 'confidence', title: 'Confidence' },
        { id: 'reply_time', title: 'Reply Time' },
        { id: 'priority', title: 'Priority' },
        { id: 'suggested_action', title: 'Suggested Action' },
        { id: 'conversation_id', title: 'Conversation ID' },
        { id: 'timestamp', title: 'Last Activity' }
      ]
    });
    
    await csvWriter.writeRecords(handoffData);
    
    // Also create JSON for web interface
    const jsonPath = outputPath.replace('.csv', '.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      generated: new Date().toISOString(),
      totalConversations: handoffData.length,
      byPriority: {
        high: handoffData.filter(d => d.priority === 'high').length,
        medium: handoffData.filter(d => d.priority === 'medium').length,
        low: handoffData.filter(d => d.priority === 'low').length
      },
      conversations: handoffData
    }, null, 2));
    
    console.log(`\n📤 Handoff report generated:`);
    console.log(`   CSV: ${outputPath}`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   Total conversations: ${handoffData.length}`);
    console.log(`   High priority: ${handoffData.filter(d => d.priority === 'high').length}`);
    
    return handoffData;
  }

  calculatePriority(conversation) {
    if (!conversation.sentiment) return 'low';
    
    let score = 0;
    
    // Sentiment scoring
    if (conversation.sentiment === 'positive') score += 40;
    else if (conversation.sentiment === 'curious') score += 30;
    else if (conversation.sentiment === 'neutral') score += 10;
    else if (conversation.sentiment === 'negative') score -= 20;
    
    // Intent scoring
    if (conversation.intent === 'interested') score += 30;
    else if (conversation.intent === 'needs_info') score += 20;
    
    // Reply time scoring (faster = more interested)
    if (conversation.replyTimeMinutes) {
      if (conversation.replyTimeMinutes <= 5) score += 20;
      else if (conversation.replyTimeMinutes <= 30) score += 10;
      else if (conversation.replyTimeMinutes <= 60) score += 5;
    }
    
    // Confidence scoring
    if (conversation.sentimentScore >= 80) score += 10;
    
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  getSuggestedAction(conversation) {
    if (!conversation.sentiment) {
      return 'Wait for reply or send follow-up';
    }
    
    const suggestions = {
      positive: {
        interested: 'Send product details and offer call',
        needs_info: 'Answer questions and build interest',
        unclear: 'Continue building rapport'
      },
      curious: {
        needs_info: 'Provide detailed information',
        interested: 'Share benefits and pricing',
        unclear: 'Clarify their questions'
      },
      neutral: {
        acknowledge: 'Send engaging follow-up',
        unclear: 'Try different approach'
      },
      negative: {
        not_interested: 'Thank and close conversation',
        unclear: 'Apologize and offer to remove'
      }
    };
    
    return suggestions[conversation.sentiment]?.[conversation.intent] || 
           'Review conversation and decide';
  }

  /**
   * Get conversation statistics
   */
  
  
  /**
   * Guess US timezone from username/text
   */
  guessTimezone(username, text = '') {
    const combined = `${username} ${text}`.toLowerCase();
    
    const timezones = {
      ET: /(new york|nyc|miami|boston|philly|atlanta|orlando|tampa|dc|washington)/,
      CT: /(chicago|houston|dallas|austin|nashville|detroit|minneapolis|st\.?\s*louis)/,
      MT: /(denver|salt lake|phoenix|albuquerque|boise)/,
      PT: /(los angeles|la\b|san diego|san francisco|sf\b|seattle|portland|vegas|las vegas)/
    };
    
    for (const [tz, pattern] of Object.entries(timezones)) {
      if (pattern.test(combined)) return tz;
    }
    
    return 'ET'; // Default to Eastern
  }
  
  /**
   * Generate closer hint based on intent
   */
  getCloserHint(intent, sentiment) {
    const hints = {
      'pricing': 'Ask budget range; offer light ROI example; propose async trial.',
      'curious': 'Acknowledge; share 1-liner value; ask for preferred contact.',
      'positive': 'Build rapport; share success story; soft pitch allowed.',
      'negative': 'Thank and park; offer to keep a gamma slot later.',
      'neutral': 'Probe with 1 question; avoid pitch; keep it friendly.'
    };
    
    return hints[intent] || hints[sentiment] || hints.neutral;
  }

  /**
   * Get AI-generated playbook for closers
   */
  async getAIPlaybook(conv, tz, latency) {
    try {
      const { closerPlan } = await import('./closer-playbook.mjs');
      const plan = await closerPlan({
        username: conv.target,
        intent: conv.intent,
        sentiment: conv.sentiment,
        tz: tz,
        latencySec: latency,
        lastMsg: conv.replyText || conv.message
      });
      return plan?.steps?.join(' → ') || '';
    } catch (e) {
      return '';
    }
  }

  getStatistics() {
    const stats = {
      total: this.conversations.size,
      pending: 0,
      replied: 0,
      avgReplyTime: 0,
      bySentiment: {
        positive: 0,
        curious: 0,
        neutral: 0,
        negative: 0
      },
      byIntent: {
        interested: 0,
        needs_info: 0,
        not_interested: 0,
        unclear: 0
      }
    };
    
    let totalReplyTime = 0;
    let replyCount = 0;
    
    for (const conversation of this.conversations.values()) {
      if (conversation.status === 'pending_reply') stats.pending++;
      if (conversation.status === 'replied') {
        stats.replied++;
        
        if (conversation.sentiment) {
          stats.bySentiment[conversation.sentiment]++;
        }
        
        if (conversation.intent) {
          stats.byIntent[conversation.intent]++;
        }
        
        if (conversation.replyTimeMinutes) {
          totalReplyTime += conversation.replyTimeMinutes;
          replyCount++;
        }
      }
    }
    
    if (replyCount > 0) {
      stats.avgReplyTime = Math.round(totalReplyTime / replyCount);
    }
    
    return stats;
  }

  /**
   * Clean up old conversations
   */
  cleanup(daysOld = 7) {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let removed = 0;
    
    for (const [id, conversation] of this.conversations) {
      const age = Date.now() - new Date(conversation.created).getTime();
      if (age > cutoff) {
        this.conversations.delete(id);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.saveConversations();
      console.log(`🧹 Cleaned up ${removed} old conversations`);
    }
  }
}