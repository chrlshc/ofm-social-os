#!/usr/bin/env node
/**
 * SaaS Closer Engine - Orchestrateur principal
 * Intègre discovery → classification → templates → analytics
 */

import { SaasCloserClassifier } from './saas-closer-classifier.mjs';
import { SaasCloserAnalytics } from './saas-closer-analytics.mjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';

class SaasCloserEngine {
  constructor(config = {}) {
    this.config = {
      // Integration paths
      discoveryIntegration: config.discoveryIntegration || './of-discovery-dm-integration.mjs',
      dmSystem: config.dmSystem || '/Users/765h/OFM CHARLES/ig-dm-ui',
      
      // Templates & State
      templatesFile: config.templatesFile || './saas-closer-templates.json',
      stateMachineFile: config.stateMachineFile || './saas-closer-state-machine.json',
      
      // SaaS Config
      signupUrl: config.signupUrl || 'https://your-saas.com/beta-signup',
      dashboardUrl: config.dashboardUrl || 'https://your-saas.com/dashboard',
      
      // Comportement
      autoReplyEnabled: config.autoReplyEnabled !== false,
      replyDelay: config.replyDelay || 300000, // 5min
      maxRepliesPerHour: config.maxRepliesPerHour || 20,
      
      ...config
    };

    this.classifier = new SaasCloserClassifier();
    this.analytics = new SaasCloserAnalytics();
    this.templates = JSON.parse(readFileSync(this.config.templatesFile, 'utf8'));
    this.stateMachine = JSON.parse(readFileSync(this.config.stateMachineFile, 'utf8'));
    
    // État conversations actives
    this.activeConversations = new Map();
    this.replyQueue = [];
    this.isProcessing = false;

    console.log('🤖 SaaS Closer Engine v2.0 initialisé');
  }

  /**
   * Démarrage du système complet
   */
  async start() {
    console.log('🚀 Démarrage SaaS Closer Engine');
    
    // Démarrer monitoring des réponses
    this.startReplyMonitoring();
    
    // Démarrer processing queue
    this.startQueueProcessor();
    
    // Démarrer cleanup périodique
    this.startPeriodicCleanup();
    
    console.log('✅ SaaS Closer Engine démarré');
    console.log(`📊 Dashboard: http://localhost:3000/closer-dashboard`);
    console.log(`🎯 Signup URL: ${this.config.signupUrl}`);
  }

  /**
   * Monitoring des réponses entrantes (simulé)
   */
  startReplyMonitoring() {
    // En production, ceci serait connecté à votre système DM
    console.log('👂 Monitoring des réponses activé');
    
    // Simuler des réponses pour demo
    if (process.env.NODE_ENV === 'development') {
      this.simulateIncomingReplies();
    }
  }

  /**
   * Traitement d'une réponse reçue
   */
  async processIncomingReply(userId, message, context = {}) {
    try {
      console.log(`📬 Nouvelle réponse: ${userId} - "${message}"`);
      
      // 1. Classifier la réponse
      const classification = this.classifier.classifyReply(message, context);
      
      // 2. Track analytics
      this.analytics.track('reply_received', userId, { 
        message, 
        classification, 
        context 
      });
      
      // 3. Router vers template approprié
      const routing = this.classifier.routeToTemplate(classification);
      
      // 4. Mise à jour état conversation
      this.updateConversationState(userId, classification, routing);
      
      // 5. Programmer réponse automatique (si activé)
      if (this.config.autoReplyEnabled) {
        this.scheduleAutoReply(userId, routing, classification);
      }
      
      console.log(`✅ Réponse traitée: ${userId} → ${routing.templateId} (${classification.confidence.toFixed(2)} conf)`);
      
    } catch (error) {
      console.error(`❌ Erreur traitement réponse ${userId}:`, error.message);
      this.analytics.track('error', userId, { error: error.message, context: 'process_reply' });
    }
  }

  /**
   * Mise à jour état conversation
   */
  updateConversationState(userId, classification, routing) {
    const conversation = this.activeConversations.get(userId) || {
      userId,
      createdAt: new Date().toISOString(),
      currentState: 'INITIAL',
      messageHistory: [],
      templatesSent: [],
      classification: null,
      lastActivity: new Date().toISOString()
    };

    // Mettre à jour
    conversation.currentState = routing.nextState;
    conversation.classification = classification;
    conversation.lastActivity = new Date().toISOString();
    conversation.messageHistory.push({
      timestamp: new Date().toISOString(),
      type: 'received',
      content: classification.intent.class,
      confidence: classification.confidence
    });

    this.activeConversations.set(userId, conversation);
  }

  /**
   * Programmer réponse automatique
   */
  scheduleAutoReply(userId, routing, classification) {
    const replyItem = {
      userId,
      templateId: routing.templateId,
      personalization: routing.personalization,
      scheduledFor: new Date(Date.now() + this.config.replyDelay),
      priority: this.getPriority(classification.intent.class),
      attempts: 0
    };

    this.replyQueue.push(replyItem);
    console.log(`⏰ Réponse programmée: ${userId} → ${routing.templateId} dans ${this.config.replyDelay/1000}s`);
  }

  /**
   * Priorité basée sur intent
   */
  getPriority(intentClass) {
    const priorities = {
      'Interested_SaaS': 1,
      'Pricing_SaaS': 2,
      'Trust_Compliance': 3,
      'Migration_Agency': 4,
      'Neutral': 5,
      'Negative': 6
    };
    
    return priorities[intentClass] || 5;
  }

  /**
   * Processor queue réponses automatiques
   */
  startQueueProcessor() {
    console.log('⚙️  Queue processor démarré');
    
    setInterval(async () => {
      if (this.isProcessing || this.replyQueue.length === 0) return;
      
      this.isProcessing = true;
      
      try {
        // Trier par priorité et heure
        this.replyQueue.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return new Date(a.scheduledFor) - new Date(b.scheduledFor);
        });

        const now = new Date();
        const ready = this.replyQueue.filter(item => new Date(item.scheduledFor) <= now);
        
        // Limiter le débit
        const toProcess = ready.slice(0, Math.min(ready.length, 3));
        
        for (const item of toProcess) {
          await this.sendAutoReply(item);
          this.replyQueue = this.replyQueue.filter(r => r !== item);
        }
        
      } catch (error) {
        console.error('❌ Erreur queue processor:', error.message);
      } finally {
        this.isProcessing = false;
      }
      
    }, 30000); // Check toutes les 30s
  }

  /**
   * Envoyer réponse automatique
   */
  async sendAutoReply(replyItem) {
    try {
      const { userId, templateId, personalization } = replyItem;
      
      // 1. Récupérer template
      const template = this.getTemplate(templateId, personalization.language);
      if (!template) {
        throw new Error(`Template ${templateId} non trouvé`);
      }

      // 2. Personnaliser message
      const personalizedMessage = this.personalizeTemplate(template, personalization, userId);
      
      // 3. Envoyer DM via système existant
      await this.sendDM(userId, personalizedMessage);
      
      // 4. Track analytics
      this.analytics.track('template_sent', userId, { 
        template_id: templateId,
        personalized_message: personalizedMessage,
        state: replyItem.state 
      });

      // 5. Mettre à jour conversation
      const conversation = this.activeConversations.get(userId);
      if (conversation) {
        conversation.templatesSent.push({
          templateId,
          timestamp: new Date().toISOString(),
          message: personalizedMessage
        });
        conversation.messageHistory.push({
          timestamp: new Date().toISOString(),
          type: 'sent',
          content: personalizedMessage.slice(0, 50) + '...'
        });
      }

      console.log(`✅ Auto-reply envoyé: ${userId} → ${templateId}`);
      
    } catch (error) {
      replyItem.attempts++;
      console.error(`❌ Échec auto-reply ${replyItem.userId}:`, error.message);
      
      // Retry max 3 fois
      if (replyItem.attempts < 3) {
        replyItem.scheduledFor = new Date(Date.now() + 300000); // +5min
        this.replyQueue.push(replyItem);
      } else {
        this.analytics.track('auto_reply_failed', replyItem.userId, { 
          error: error.message,
          attempts: replyItem.attempts 
        });
      }
    }
  }

  /**
   * Récupérer template par ID et langue
   */
  getTemplate(templateId, language = 'en') {
    return this.templates.templates[templateId]?.[language] || 
           this.templates.templates[templateId]?.['en'];
  }

  /**
   * Personnaliser template
   */
  personalizeTemplate(template, personalization, userId) {
    let message = template;
    
    // Variables de personnalisation
    const variables = {
      '{username}': personalization.username || userId,
      '{signup_link}': this.config.signupUrl,
      '{dashboard_link}': this.config.dashboardUrl
    };

    // Remplacer variables
    for (const [placeholder, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(placeholder, 'g'), value);
    }

    return message;
  }

  /**
   * Envoyer DM via système existant
   */
  async sendDM(userId, message) {
    return new Promise((resolve, reject) => {
      const args = ['run', 'dm', '--', '--user', userId, '--message', message];
      
      const child = spawn('npm', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.config.dmSystem
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`DM failed (${code}): ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Timeout
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('DM timeout'));
      }, 60000);
    });
  }

  /**
   * API Dashboard métriques
   */
  getDashboard() {
    const analyticsData = this.analytics.getDashboard();
    
    return {
      ...analyticsData,
      engine_status: {
        active_conversations: this.activeConversations.size,
        reply_queue_size: this.replyQueue.length,
        is_processing: this.isProcessing,
        auto_reply_enabled: this.config.autoReplyEnabled
      },
      recent_conversations: Array.from(this.activeConversations.values())
        .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
        .slice(0, 10)
        .map(conv => ({
          userId: conv.userId,
          currentState: conv.currentState,
          lastActivity: conv.lastActivity,
          classification: conv.classification?.intent?.class,
          templatesSent: conv.templatesSent.length,
          language: conv.classification?.language?.language
        }))
    };
  }

  /**
   * Démarrer cleanup périodique
   */
  startPeriodicCleanup() {
    // Cleanup toutes les heures
    setInterval(() => {
      console.log('🧹 Nettoyage périodique...');
      
      // Nettoyer conversations inactives > 7j
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      for (const [userId, conv] of this.activeConversations.entries()) {
        if (new Date(conv.lastActivity) < cutoff) {
          this.activeConversations.delete(userId);
        }
      }
      
      // Nettoyer queue items expirés
      const queueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      this.replyQueue = this.replyQueue.filter(item => 
        new Date(item.scheduledFor) > queueCutoff
      );
      
      // Nettoyer analytics
      this.analytics.cleanupOldData();
      
      console.log(`✅ Cleanup: ${this.activeConversations.size} conversations, ${this.replyQueue.length} queue`);
      
    }, 60 * 60 * 1000); // 1h
  }

  /**
   * Simulation réponses (dev only)
   */
  simulateIncomingReplies() {
    const testReplies = [
      ['user123', 'sounds good, tell me more'],
      ['user456', 'how much does it cost?'], 
      ['user789', 'is this allowed by onlyfans?'],
      ['user101', 'I already have an agency'],
      ['user202', 'not interested'],
      ['user303', 'salut, combien ça coûte ?']
    ];

    let index = 0;
    setInterval(() => {
      if (index < testReplies.length) {
        const [userId, message] = testReplies[index];
        this.processIncomingReply(userId, message, { 
          platform: 'instagram', 
          follower_count: 5000 
        });
        index++;
      }
    }, 10000); // Une toutes les 10s pour demo
  }

  /**
   * Arrêt propre
   */
  async shutdown() {
    console.log('🛑 Arrêt SaaS Closer Engine...');
    
    // Sauvegarder état
    this.analytics.saveData();
    
    // Traiter queue restante (max 1min)
    const shutdownStart = Date.now();
    while (this.replyQueue.length > 0 && (Date.now() - shutdownStart) < 60000) {
      if (!this.isProcessing) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('✅ SaaS Closer Engine arrêté proprement');
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const engine = new SaasCloserEngine();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      engine.start();
      
      // Graceful shutdown
      process.on('SIGINT', async () => {
        await engine.shutdown();
        process.exit(0);
      });
      break;
      
    case 'dashboard':
      console.log('📊 Dashboard:');
      console.log(JSON.stringify(engine.getDashboard(), null, 2));
      break;
      
    case 'test-reply':
      const userId = process.argv[3] || 'test_user';
      const message = process.argv[4] || 'sounds good, tell me more';
      engine.processIncomingReply(userId, message);
      break;
      
    default:
      console.log('Usage:');
      console.log('  node saas-closer-engine.mjs start                    # Démarrer engine');
      console.log('  node saas-closer-engine.mjs dashboard               # Voir métriques');
      console.log('  node saas-closer-engine.mjs test-reply user "msg"   # Tester classification');
  }
}

export { SaasCloserEngine };