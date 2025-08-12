#!/usr/bin/env node
/**
 * Monitor des réponses DM Instagram pour alimenter le SaaS Closer
 * Surveille les réponses des prospects contactés et les route vers l'engine
 */

import { SaasCloserEngine } from './saas-closer-engine.mjs';
import { readFileSync, writeFileSync, existsSync, watchFile } from 'fs';
import { spawn } from 'child_process';

class DmReplyMonitor {
  constructor(config = {}) {
    this.config = {
      // Fichiers de surveillance  
      prospectsFile: config.prospectsFile || 'out/qualified_of_targets.json',
      repliesFile: config.repliesFile || 'out/dm_replies.json',
      
      // Système DM
      dmSystemPath: config.dmSystemPath || '/Users/765h/OFM CHARLES/ig-dm-ui',
      
      // Monitoring
      checkInterval: config.checkInterval || 30000, // 30s
      maxRepliesPerCheck: config.maxRepliesPerCheck || 5,
      
      ...config
    };

    this.closerEngine = new SaasCloserEngine();
    this.trackedProspects = new Set();
    this.processedReplies = new Set();
    this.lastCheck = new Date();

    console.log('👂 DM Reply Monitor initialisé');
  }

  /**
   * Démarrage du monitoring
   */
  async start() {
    console.log('🚀 Démarrage monitoring des réponses DM...');
    
    // Charger prospects déjà contactés
    await this.loadTrackedProspects();
    
    // Démarrer le closer engine
    await this.closerEngine.start();
    
    // Démarrer surveillance réponses
    this.startReplyMonitoring();
    
    // Watch des fichiers
    this.watchFiles();
    
    console.log(`✅ Monitoring actif - ${this.trackedProspects.size} prospects surveillés`);
  }

  /**
   * Charger les prospects contactés depuis le pipeline
   */
  async loadTrackedProspects() {
    if (!existsSync(this.config.prospectsFile)) {
      console.log('⚠️  Aucun fichier prospects trouvé. Lancez d\'abord le pipeline discovery.');
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this.config.prospectsFile, 'utf8'));
      const prospects = data.qualified_candidates || [];
      
      prospects.forEach(prospect => {
        this.trackedProspects.add(prospect.username);
      });
      
      console.log(`📥 ${prospects.length} prospects chargés depuis ${this.config.prospectsFile}`);
      
    } catch (error) {
      console.error('❌ Erreur chargement prospects:', error.message);
    }
  }

  /**
   * Surveillance active des réponses
   */
  startReplyMonitoring() {
    console.log('👀 Surveillance des réponses démarrée');
    
    setInterval(async () => {
      try {
        await this.checkForNewReplies();
      } catch (error) {
        console.error('❌ Erreur check réponses:', error.message);
      }
    }, this.config.checkInterval);
  }

  /**
   * Check des nouvelles réponses
   */
  async checkForNewReplies() {
    if (this.trackedProspects.size === 0) {
      return; // Pas de prospects à surveiller
    }

    console.log(`🔍 Check réponses pour ${this.trackedProspects.size} prospects...`);
    
    // En production, ceci interrogerait l'API Instagram ou votre système DM
    // Pour cette implémentation, on simule avec un fichier JSON de réponses
    
    const replies = await this.fetchRepliesFromSystem();
    const newReplies = this.filterNewReplies(replies);
    
    if (newReplies.length > 0) {
      console.log(`📬 ${newReplies.length} nouvelles réponses détectées`);
      
      for (const reply of newReplies.slice(0, this.config.maxRepliesPerCheck)) {
        await this.processReply(reply);
      }
    }
    
    this.lastCheck = new Date();
  }

  /**
   * Récupération des réponses depuis le système DM
   * En production: API Instagram ou scraping du système DM
   */
  async fetchRepliesFromSystem() {
    // Méthode 1: Lire depuis fichier JSON (simple)
    if (existsSync(this.config.repliesFile)) {
      try {
        const data = JSON.parse(readFileSync(this.config.repliesFile, 'utf8'));
        return data.replies || [];
      } catch (error) {
        console.error('❌ Erreur lecture replies:', error.message);
      }
    }

    // Méthode 2: Interroger système DM (avancé)
    // return await this.queryDmSystemForReplies();
    
    return [];
  }

  /**
   * Interrogation avancée du système DM
   */
  async queryDmSystemForReplies() {
    return new Promise((resolve, reject) => {
      // Exemple: script pour extraire réponses du système DM
      const args = ['run', 'get-replies', '--', '--since', this.lastCheck.toISOString()];
      
      const child = spawn('npm', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.config.dmSystemPath
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
          try {
            const replies = JSON.parse(stdout);
            resolve(replies);
          } catch (error) {
            resolve([]);
          }
        } else {
          console.error(`Erreur get-replies: ${stderr}`);
          resolve([]);
        }
      });

      child.on('error', () => resolve([]));
      
      setTimeout(() => {
        child.kill('SIGTERM');
        resolve([]);
      }, 30000);
    });
  }

  /**
   * Filtrer les nouvelles réponses non encore traitées
   */
  filterNewReplies(replies) {
    return replies.filter(reply => {
      // Vérifier si c'est un prospect surveillé
      const isTrackedProspect = this.trackedProspects.has(reply.username);
      
      // Vérifier si pas déjà traité
      const replyId = `${reply.username}_${reply.timestamp}`;
      const isNewReply = !this.processedReplies.has(replyId);
      
      // Vérifier si récent
      const replyTime = new Date(reply.timestamp);
      const isRecent = replyTime > this.lastCheck;
      
      return isTrackedProspect && isNewReply && isRecent;
    });
  }

  /**
   * Traitement d'une réponse individuelle
   */
  async processReply(reply) {
    const replyId = `${reply.username}_${reply.timestamp}`;
    
    try {
      console.log(`📨 Traitement réponse: @${reply.username} - "${reply.message}"`);
      
      // Context du prospect
      const context = {
        platform: 'instagram',
        source: 'of_discovery_pipeline',
        follower_count: reply.follower_count || 5000,
        original_score: reply.score || 0,
        contacted_at: reply.contacted_at
      };

      // Envoyer au closer engine pour traitement
      await this.closerEngine.processIncomingReply(
        reply.username,
        reply.message,
        context
      );

      // Marquer comme traité
      this.processedReplies.add(replyId);
      
      console.log(`✅ Réponse traitée: @${reply.username}`);
      
    } catch (error) {
      console.error(`❌ Erreur traitement réponse ${reply.username}:`, error.message);
    }
  }

  /**
   * Surveillance des fichiers pour auto-reload
   */
  watchFiles() {
    // Watch prospects file pour nouveaux prospects
    if (existsSync(this.config.prospectsFile)) {
      watchFile(this.config.prospectsFile, async () => {
        console.log('📁 Fichier prospects modifié, rechargement...');
        await this.loadTrackedProspects();
      });
    }

    // Watch replies file pour nouvelles réponses
    if (existsSync(this.config.repliesFile)) {
      watchFile(this.config.repliesFile, async () => {
        console.log('📁 Fichier réponses modifié, check...');
        await this.checkForNewReplies();
      });
    }
  }

  /**
   * API pour ajouter manuellement une réponse
   */
  async addReply(username, message, timestamp = new Date().toISOString()) {
    const reply = {
      username,
      message,
      timestamp,
      source: 'manual'
    };

    await this.processReply(reply);
    console.log(`✅ Réponse manuelle ajoutée: @${username}`);
  }

  /**
   * Créer fichier de réponses exemple pour test
   */
  createSampleRepliesFile() {
    const sampleReplies = {
      timestamp: new Date().toISOString(),
      source: 'sample_data',
      replies: [
        {
          username: 'model_test_1',
          message: 'sounds good, tell me more about this',
          timestamp: new Date().toISOString(),
          follower_count: 5200,
          contacted_at: new Date(Date.now() - 3600000).toISOString()
        },
        {
          username: 'model_test_2', 
          message: 'how much does it cost?',
          timestamp: new Date().toISOString(),
          follower_count: 8900,
          contacted_at: new Date(Date.now() - 7200000).toISOString()
        },
        {
          username: 'model_test_3',
          message: 'is this allowed by onlyfans?',
          timestamp: new Date().toISOString(), 
          follower_count: 4300,
          contacted_at: new Date(Date.now() - 1800000).toISOString()
        }
      ]
    };

    writeFileSync(this.config.repliesFile, JSON.stringify(sampleReplies, null, 2));
    console.log(`📝 Fichier réponses exemple créé: ${this.config.repliesFile}`);
  }

  /**
   * Statistiques du monitor
   */
  getStats() {
    return {
      tracked_prospects: this.trackedProspects.size,
      processed_replies: this.processedReplies.size,
      last_check: this.lastCheck.toISOString(),
      check_interval: this.config.checkInterval,
      closer_engine_status: this.closerEngine.getDashboard().engine_status
    };
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new DmReplyMonitor();
  const command = process.argv[2];

  switch (command) {
    case 'start':
      monitor.start();
      
      // Graceful shutdown
      process.on('SIGINT', async () => {
        console.log('🛑 Arrêt du monitor...');
        await monitor.closerEngine.shutdown();
        process.exit(0);
      });
      break;

    case 'create-sample':
      monitor.createSampleRepliesFile();
      break;

    case 'add-reply':
      const username = process.argv[3];
      const message = process.argv.slice(4).join(' ');
      if (!username || !message) {
        console.error('Usage: node reply-monitor.mjs add-reply username "message"');
        process.exit(1);
      }
      await monitor.addReply(username, message);
      break;

    case 'stats':
      console.log('📊 Stats Monitor:');
      console.log(JSON.stringify(monitor.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node reply-monitor.mjs start              # Démarrer monitoring');
      console.log('  node reply-monitor.mjs create-sample      # Créer fichier réponses test');
      console.log('  node reply-monitor.mjs add-reply user "msg"  # Ajouter réponse manuellement');
      console.log('  node reply-monitor.mjs stats              # Voir statistiques');
  }
}

export { DmReplyMonitor };