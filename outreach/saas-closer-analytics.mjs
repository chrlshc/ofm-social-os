#!/usr/bin/env node
/**
 * SaaS Closer Analytics & Event Tracking
 * Track conversion funnel et performance des templates
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';

class SaasCloserAnalytics {
  constructor(config = {}) {
    this.config = {
      dataFile: config.dataFile || 'out/closer_analytics.json',
      retentionDays: config.retentionDays || 90,
      ...config
    };

    this.events = [];
    this.conversations = new Map();
    this.funnelMetrics = {
      reply_to_click: 0,
      click_to_signup: 0,
      signup_to_connected_of: 0,
      connected_of_to_first_revenue_14d: 0
    };

    this.loadExistingData();
  }

  /**
   * Charger données existantes
   */
  loadExistingData() {
    if (existsSync(this.config.dataFile)) {
      try {
        const data = JSON.parse(readFileSync(this.config.dataFile, 'utf8'));
        this.events = data.events || [];
        this.conversations = new Map(data.conversations || []);
        this.funnelMetrics = { ...this.funnelMetrics, ...data.funnelMetrics };
      } catch (error) {
        console.warn('Erreur chargement analytics:', error.message);
      }
    }
  }

  /**
   * Sauvegarder données
   */
  saveData() {
    const data = {
      timestamp: new Date().toISOString(),
      events: this.events,
      conversations: Array.from(this.conversations.entries()),
      funnelMetrics: this.funnelMetrics,
      version: '2.0'
    };

    writeFileSync(this.config.dataFile, JSON.stringify(data, null, 2));
  }

  /**
   * Track événement principal
   */
  track(eventName, userId, data = {}) {
    const event = {
      event: eventName,
      user_id: userId,
      timestamp: new Date().toISOString(),
      data: { ...data },
      session_id: this.getSessionId(userId)
    };

    this.events.push(event);
    this.updateConversationState(userId, eventName, data);
    this.updateFunnelMetrics(eventName, userId);

    console.log(`📊 Event: ${eventName} | User: ${userId}`);
    
    // Auto-save périodique
    if (this.events.length % 10 === 0) {
      this.saveData();
    }

    return event;
  }

  /**
   * Mise à jour état conversation
   */
  updateConversationState(userId, eventName, data) {
    const conversation = this.conversations.get(userId) || {
      user_id: userId,
      created_at: new Date().toISOString(),
      current_state: 'INITIAL',
      intent_class: null,
      language: 'en',
      templates_sent: [],
      objections: [],
      conversion_events: [],
      last_activity: new Date().toISOString()
    };

    // Mettre à jour last_activity
    conversation.last_activity = new Date().toISOString();

    // Événements de conversion spéciaux
    const conversionEvents = [
      'reply_received', 'click_signup', 'signup_completed',
      'onboarding_started', 'of_connected', 'first_revenue'
    ];

    if (conversionEvents.includes(eventName)) {
      conversation.conversion_events.push({
        event: eventName,
        timestamp: new Date().toISOString(),
        data
      });
    }

    // Mise à jour état basé sur événement
    switch (eventName) {
      case 'reply_received':
        conversation.current_state = 'REPLIED';
        if (data.classification) {
          conversation.intent_class = data.classification.intent.class;
          conversation.language = data.classification.language.language;
          conversation.objections.push(...data.classification.objections);
        }
        break;

      case 'template_sent':
        conversation.templates_sent.push({
          template_id: data.template_id,
          timestamp: new Date().toISOString(),
          state: data.state
        });
        break;

      case 'click_signup':
        conversation.current_state = 'CLICKED';
        break;

      case 'signup_completed':
        conversation.current_state = 'SIGNED_UP';
        break;

      case 'of_connected':
        conversation.current_state = 'CONNECTED';
        break;

      case 'first_revenue':
        conversation.current_state = 'SUCCESS';
        conversation.revenue_data = data;
        break;
    }

    this.conversations.set(userId, conversation);
  }

  /**
   * Mise à jour métriques funnel
   */
  updateFunnelMetrics(eventName, userId) {
    const conversation = this.conversations.get(userId);
    if (!conversation) return;

    const events = conversation.conversion_events;
    
    // Calculer métriques en temps réel
    const hasReply = events.some(e => e.event === 'reply_received');
    const hasClick = events.some(e => e.event === 'click_signup');
    const hasSignup = events.some(e => e.event === 'signup_completed');
    const hasConnection = events.some(e => e.event === 'of_connected');
    const hasRevenue = events.some(e => e.event === 'first_revenue');

    // Update globales (recalculer pour toutes conversations)
    if (eventName === 'funnel_refresh' || this.events.length % 50 === 0) {
      this.recalculateFunnelMetrics();
    }
  }

  /**
   * Recalcul complet métriques funnel
   */
  recalculateFunnelMetrics() {
    const conversations = Array.from(this.conversations.values());
    
    let totalReplied = 0;
    let totalClicked = 0;
    let totalSignedUp = 0;
    let totalConnected = 0;
    let totalRevenue = 0;

    conversations.forEach(conv => {
      const events = conv.conversion_events.map(e => e.event);
      
      if (events.includes('reply_received')) totalReplied++;
      if (events.includes('click_signup')) totalClicked++;
      if (events.includes('signup_completed')) totalSignedUp++;
      if (events.includes('of_connected')) totalConnected++;
      if (events.includes('first_revenue')) totalRevenue++;
    });

    // Calculer ratios
    this.funnelMetrics = {
      reply_to_click: totalReplied > 0 ? totalClicked / totalReplied : 0,
      click_to_signup: totalClicked > 0 ? totalSignedUp / totalClicked : 0,
      signup_to_connected_of: totalSignedUp > 0 ? totalConnected / totalSignedUp : 0,
      connected_of_to_first_revenue_14d: totalConnected > 0 ? totalRevenue / totalConnected : 0,
      
      // Métriques absolues
      total_conversations: conversations.length,
      total_replied: totalReplied,
      total_clicked: totalClicked,
      total_signed_up: totalSignedUp,
      total_connected: totalConnected,
      total_revenue: totalRevenue
    };
  }

  /**
   * Analytics template performance
   */
  getTemplatePerformance() {
    const templateStats = {};
    
    this.conversations.forEach(conv => {
      conv.templates_sent.forEach(template => {
        const id = template.template_id;
        
        if (!templateStats[id]) {
          templateStats[id] = {
            sent: 0,
            replies: 0,
            clicks: 0,
            signups: 0,
            reply_rate: 0,
            click_rate: 0,
            signup_rate: 0
          };
        }
        
        templateStats[id].sent++;
        
        // Check si cette conversation a eu des actions après ce template
        const templateTime = new Date(template.timestamp);
        const laterEvents = conv.conversion_events.filter(e => 
          new Date(e.timestamp) > templateTime
        );
        
        if (laterEvents.some(e => e.event === 'reply_received')) {
          templateStats[id].replies++;
        }
        if (laterEvents.some(e => e.event === 'click_signup')) {
          templateStats[id].clicks++;
        }
        if (laterEvents.some(e => e.event === 'signup_completed')) {
          templateStats[id].signups++;
        }
      });
    });

    // Calculer taux
    Object.values(templateStats).forEach(stats => {
      stats.reply_rate = stats.sent > 0 ? stats.replies / stats.sent : 0;
      stats.click_rate = stats.sent > 0 ? stats.clicks / stats.sent : 0;
      stats.signup_rate = stats.sent > 0 ? stats.signups / stats.sent : 0;
    });

    return templateStats;
  }

  /**
   * Analytics par intent class
   */
  getIntentPerformance() {
    const intentStats = {};
    
    this.conversations.forEach(conv => {
      const intent = conv.intent_class;
      if (!intent) return;
      
      if (!intentStats[intent]) {
        intentStats[intent] = {
          count: 0,
          clicked: 0,
          signed_up: 0,
          connected: 0,
          revenue: 0,
          click_rate: 0,
          signup_rate: 0,
          success_rate: 0
        };
      }
      
      intentStats[intent].count++;
      
      const events = conv.conversion_events.map(e => e.event);
      if (events.includes('click_signup')) intentStats[intent].clicked++;
      if (events.includes('signup_completed')) intentStats[intent].signed_up++;
      if (events.includes('of_connected')) intentStats[intent].connected++;
      if (events.includes('first_revenue')) intentStats[intent].revenue++;
    });

    // Calculer taux
    Object.values(intentStats).forEach(stats => {
      stats.click_rate = stats.count > 0 ? stats.clicked / stats.count : 0;
      stats.signup_rate = stats.count > 0 ? stats.signed_up / stats.count : 0;
      stats.success_rate = stats.count > 0 ? stats.revenue / stats.count : 0;
    });

    return intentStats;
  }

  /**
   * Dashboard métriques temps réel
   */
  getDashboard() {
    this.recalculateFunnelMetrics();
    
    const templatePerf = this.getTemplatePerformance();
    const intentPerf = this.getIntentPerformance();
    
    // Activité récente (24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEvents = this.events.filter(e => new Date(e.timestamp) > last24h);
    
    const recentActivity = {
      total_events: recentEvents.length,
      replies: recentEvents.filter(e => e.event === 'reply_received').length,
      clicks: recentEvents.filter(e => e.event === 'click_signup').length,
      signups: recentEvents.filter(e => e.event === 'signup_completed').length,
      connections: recentEvents.filter(e => e.event === 'of_connected').length
    };

    return {
      timestamp: new Date().toISOString(),
      funnel_metrics: this.funnelMetrics,
      template_performance: templatePerf,
      intent_performance: intentPerf,
      recent_24h: recentActivity,
      conversion_targets: {
        reply_to_click: { target: 0.25, actual: this.funnelMetrics.reply_to_click },
        click_to_signup: { target: 0.30, actual: this.funnelMetrics.click_to_signup },
        signup_to_connected_of: { target: 0.60, actual: this.funnelMetrics.signup_to_connected_of },
        connected_of_to_first_revenue_14d: { target: 0.40, actual: this.funnelMetrics.connected_of_to_first_revenue_14d }
      }
    };
  }

  /**
   * Générer session ID
   */
  getSessionId(userId) {
    return `session_${userId}_${new Date().toDateString()}`;
  }

  /**
   * Nettoyage données anciennes
   */
  cleanupOldData() {
    const cutoff = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    // Nettoyer événements anciens
    this.events = this.events.filter(e => new Date(e.timestamp) > cutoff);
    
    // Nettoyer conversations inactives
    for (const [userId, conv] of this.conversations.entries()) {
      if (new Date(conv.last_activity) < cutoff) {
        this.conversations.delete(userId);
      }
    }
    
    console.log(`🧹 Nettoyage: ${this.events.length} events, ${this.conversations.size} conversations`);
    this.saveData();
  }

  /**
   * Export CSV pour analyse
   */
  exportCsv(filename = 'closer_analytics.csv') {
    const conversations = Array.from(this.conversations.values());
    
    let csv = 'user_id,created_at,current_state,intent_class,language,templates_sent,replied,clicked,signed_up,connected,revenue\n';
    
    conversations.forEach(conv => {
      const events = conv.conversion_events.map(e => e.event);
      
      csv += [
        conv.user_id,
        conv.created_at,
        conv.current_state,
        conv.intent_class || '',
        conv.language,
        conv.templates_sent.length,
        events.includes('reply_received') ? 1 : 0,
        events.includes('click_signup') ? 1 : 0,
        events.includes('signup_completed') ? 1 : 0,
        events.includes('of_connected') ? 1 : 0,
        events.includes('first_revenue') ? 1 : 0
      ].join(',') + '\n';
    });
    
    writeFileSync(filename, csv);
    console.log(`📊 Export CSV: ${filename}`);
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const analytics = new SaasCloserAnalytics();
  const command = process.argv[2];

  switch (command) {
    case 'dashboard':
      console.log('📊 SaaS Closer Dashboard:');
      console.log(JSON.stringify(analytics.getDashboard(), null, 2));
      break;

    case 'templates':
      console.log('📋 Template Performance:');
      console.log(JSON.stringify(analytics.getTemplatePerformance(), null, 2));
      break;

    case 'intents':
      console.log('🎯 Intent Performance:');
      console.log(JSON.stringify(analytics.getIntentPerformance(), null, 2));
      break;

    case 'export':
      analytics.exportCsv();
      break;

    case 'cleanup':
      analytics.cleanupOldData();
      break;

    case 'test':
      // Simuler quelques événements pour test
      analytics.track('reply_received', 'user123', { 
        classification: { intent: { class: 'Interested_SaaS' }, language: { language: 'en' }, objections: [] }
      });
      analytics.track('template_sent', 'user123', { template_id: 'R1_VALUE_PROP', state: 'CLOSE_R1' });
      analytics.track('click_signup', 'user123', { signup_url: 'https://app.com/signup' });
      analytics.track('signup_completed', 'user123', { plan: 'starter' });
      
      console.log('✅ Test events créés');
      console.log(analytics.getDashboard());
      break;

    default:
      console.log('Usage:');
      console.log('  node saas-closer-analytics.mjs dashboard  # Métriques temps réel');
      console.log('  node saas-closer-analytics.mjs templates  # Performance templates');
      console.log('  node saas-closer-analytics.mjs intents    # Performance par intent');
      console.log('  node saas-closer-analytics.mjs export     # Export CSV');
      console.log('  node saas-closer-analytics.mjs cleanup    # Nettoyer anciennes données');
      console.log('  node saas-closer-analytics.mjs test       # Créer données test');
  }
}

export { SaasCloserAnalytics };