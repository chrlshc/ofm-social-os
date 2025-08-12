#!/usr/bin/env node
/**
 * Pipeline Complet Intégré - OF Discovery → DM → Closer SaaS
 * Orchestrateur principal qui connecte tous les systèmes
 */

import { OfDiscoveryDmPipeline } from './of-discovery-dm-integration.mjs';
import { DmReplyMonitor } from './reply-monitor.mjs';
import { SaasCloserEngine } from './saas-closer-engine.mjs';
import { SaasCloserAnalytics } from './saas-closer-analytics.mjs';

class CompletePipeline {
  constructor(config = {}) {
    this.config = {
      // Pipeline config
      apifyToken: config.apifyToken || process.env.APIFY_TOKEN,
      
      // Phases à exécuter
      runDiscovery: config.runDiscovery !== false,
      runCloser: config.runCloser !== false, 
      runMonitoring: config.runMonitoring !== false,
      
      // Timing
      closerStartDelay: config.closerStartDelay || 60000, // 1min après DM
      
      ...config
    };

    this.stats = {
      startTime: Date.now(),
      phasesCompleted: 0,
      totalProspects: 0,
      dmsSent: 0,
      repliesReceived: 0,
      conversions: 0
    };

    console.log('🚀 Pipeline Complet OF → DM → Closer SaaS v2.0');
  }

  /**
   * Exécution du pipeline complet
   */
  async run() {
    try {
      console.log('\n🎯 === DÉMARRAGE PIPELINE COMPLET ===');
      console.log(`Configuration: Discovery=${this.config.runDiscovery}, Closer=${this.config.runCloser}, Monitor=${this.config.runMonitoring}`);

      // Phase 1: Discovery + DM Initial
      if (this.config.runDiscovery) {
        await this.runDiscoveryPhase();
      }

      // Phase 2: Démarrer Closer Engine
      if (this.config.runCloser) {
        await this.startCloserEngine();
      }

      // Phase 3: Monitoring des réponses
      if (this.config.runMonitoring) {
        await this.startReplyMonitoring();
      }

      // Phase 4: Dashboard temps réel
      this.startDashboard();

      // Keep alive
      if (this.config.runCloser || this.config.runMonitoring) {
        this.keepAlive();
      }

    } catch (error) {
      console.error('💥 Erreur pipeline:', error.message);
      process.exit(1);
    }
  }

  /**
   * Phase 1: Discovery OF + DM initial
   */
  async runDiscoveryPhase() {
    console.log('\n🔍 === PHASE 1: OF DISCOVERY + DM INITIAL ===');
    
    const discoveryPipeline = new OfDiscoveryDmPipeline({
      apifyToken: this.config.apifyToken,
      minScore: 15,
      maxTargets: 50,
      message: "We turn your OF into autopilot: smart DMs, pricing, analytics. Beta is open — 5-min setup. Want the link?",
      qps: 0.8,
      jitterMs: 18000,
      dryRun: false
    });

    await discoveryPipeline.run();
    
    this.stats.totalProspects = discoveryPipeline.stats.discovered;
    this.stats.dmsSent = discoveryPipeline.stats.dmsSent;
    this.stats.phasesCompleted++;
    
    console.log(`✅ Phase 1 terminée: ${this.stats.dmsSent} DMs envoyés`);
  }

  /**
   * Phase 2: Démarrer le Closer Engine
   */
  async startCloserEngine() {
    console.log('\n🤖 === PHASE 2: DÉMARRAGE SAAS CLOSER ENGINE ===');
    
    // Attendre un peu pour laisser le temps aux premières réponses
    if (this.config.runDiscovery) {
      console.log(`⏱️  Attente ${this.config.closerStartDelay/1000}s pour premières réponses...`);
      await new Promise(resolve => setTimeout(resolve, this.config.closerStartDelay));
    }

    this.closerEngine = new SaasCloserEngine({
      autoReplyEnabled: true,
      replyDelay: 300000, // 5min
      maxRepliesPerHour: 20,
      signupUrl: 'https://your-saas.com/beta-signup'
    });

    await this.closerEngine.start();
    this.stats.phasesCompleted++;
    
    console.log('✅ Phase 2: Closer Engine démarré');
  }

  /**
   * Phase 3: Monitoring des réponses
   */
  async startReplyMonitoring() {
    console.log('\n👂 === PHASE 3: MONITORING RÉPONSES ===');
    
    this.replyMonitor = new DmReplyMonitor({
      prospectsFile: 'out/qualified_of_targets.json',
      repliesFile: 'out/dm_replies.json',
      checkInterval: 30000
    });

    // Créer fichier de réponses exemple pour test
    if (process.env.NODE_ENV === 'development') {
      this.replyMonitor.createSampleRepliesFile();
    }

    await this.replyMonitor.start();
    this.stats.phasesCompleted++;
    
    console.log('✅ Phase 3: Monitoring démarré');
  }

  /**
   * Dashboard temps réel
   */
  startDashboard() {
    console.log('\n📊 === DASHBOARD TEMPS RÉEL ===');
    
    // Affichage périodique des stats
    setInterval(() => {
      this.showDashboard();
    }, 60000); // Toutes les minutes

    // Premier affichage
    setTimeout(() => this.showDashboard(), 5000);
  }

  /**
   * Affichage dashboard
   */
  showDashboard() {
    const duration = Math.round((Date.now() - this.stats.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    console.log('\n' + '='.repeat(60));
    console.log('📊 DASHBOARD PIPELINE COMPLET');
    console.log('='.repeat(60));
    console.log(`⏱️  Durée: ${minutes}m ${seconds}s`);
    console.log(`🎯 Phases: ${this.stats.phasesCompleted}/3`);
    console.log(`👥 Prospects découverts: ${this.stats.totalProspects}`);
    console.log(`📤 DMs initiaux envoyés: ${this.stats.dmsSent}`);
    
    // Stats closer engine si disponible
    if (this.closerEngine) {
      const closerStats = this.closerEngine.getDashboard();
      console.log(`💬 Conversations actives: ${closerStats.engine_status.active_conversations}`);
      console.log(`📬 Réponses en queue: ${closerStats.engine_status.reply_queue_size}`);
      console.log(`🎯 Funnel conversion: ${(closerStats.funnel_metrics.reply_to_click * 100).toFixed(1)}% reply→click`);
    }

    // Stats monitoring si disponible
    if (this.replyMonitor) {
      const monitorStats = this.replyMonitor.getStats();
      console.log(`👂 Prospects surveillés: ${monitorStats.tracked_prospects}`);
      console.log(`📨 Réponses traitées: ${monitorStats.processed_replies}`);
    }

    console.log('='.repeat(60));
    
    // Instructions
    if (this.stats.phasesCompleted === 3) {
      console.log('🎉 Pipeline complet actif !');
      console.log('💡 Commandes utiles:');
      console.log('   • node reply-monitor.mjs add-reply username "message"');
      console.log('   • node saas-closer-analytics.mjs dashboard');
      console.log('   • Ctrl+C pour arrêter');
    }
  }

  /**
   * Keep alive pour monitoring continu
   */
  keepAlive() {
    console.log('\n🔄 Pipeline en mode continu - Ctrl+C pour arrêter');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Arrêt du pipeline...');
      
      if (this.closerEngine) {
        await this.closerEngine.shutdown();
      }
      
      console.log('✅ Pipeline arrêté proprement');
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => {
      // Ping silencieux pour garder le process actif
    }, 30000);
  }

  /**
   * Mode test avec données simulées
   */
  async runTestMode() {
    console.log('\n🧪 === MODE TEST AVEC DONNÉES SIMULÉES ===');
    
    // Skip discovery, utiliser données test
    this.stats.dmsSent = 10; // Simuler 10 DMs envoyés
    
    // Démarrer seulement closer + monitoring
    await this.startCloserEngine();
    await this.startReplyMonitoring();
    
    // Injecter quelques réponses test
    setTimeout(async () => {
      console.log('📝 Injection réponses test...');
      
      const testReplies = [
        ['test_user_1', 'sounds good, tell me more'],
        ['test_user_2', 'how much does it cost?'],
        ['test_user_3', 'is this safe and allowed?']
      ];

      for (const [username, message] of testReplies) {
        await this.replyMonitor.addReply(username, message);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5s entre chaque
      }
    }, 10000);

    this.startDashboard();
    this.keepAlive();
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'full':
      // Pipeline complet
      const fullPipeline = new CompletePipeline({
        apifyToken: process.env.APIFY_TOKEN
      });
      await fullPipeline.run();
      break;

    case 'closer-only':
      // Seulement closer + monitoring (assumes DMs déjà envoyés)
      const closerPipeline = new CompletePipeline({
        runDiscovery: false,
        runCloser: true, 
        runMonitoring: true
      });
      await closerPipeline.run();
      break;

    case 'test':
      // Mode test avec données simulées
      const testPipeline = new CompletePipeline();
      await testPipeline.runTestMode();
      break;

    default:
      console.log('🚀 Pipeline Complet OF Discovery → DM → SaaS Closer');
      console.log('');
      console.log('Usage:');
      console.log('  APIFY_TOKEN=xxx node complete-pipeline.mjs full        # Pipeline complet');
      console.log('  node complete-pipeline.mjs closer-only                 # Seulement closer');
      console.log('  node complete-pipeline.mjs test                        # Mode test');
      console.log('');
      console.log('Variables requises:');
      console.log('  APIFY_TOKEN=your_apify_token (pour mode full)');
      console.log('');
      console.log('Le pipeline fait:');
      console.log('  1. 🔍 Découvre 1200+ modèles OF via Actor Apify');
      console.log('  2. 📤 Envoie DMs initiaux à 50 modèles qualifiées');
      console.log('  3. 👂 Surveille les réponses en continu');
      console.log('  4. 🤖 Traite automatiquement avec SaaS Closer');
      console.log('  5. 📊 Dashboard temps réel des conversions');
  }
}

export { CompletePipeline };