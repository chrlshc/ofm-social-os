import { NaturalDMCoordinator } from './dm-coordinator-natural.mjs';
import { NATURAL_TEMPLATES } from './natural-message-templates.mjs';

export class FastTempoCoordinator extends NaturalDMCoordinator {
  constructor(options = {}) {
    super({
      ...options,
      // Tempo plus rapide
      pauseBetweenDMs: { min: 60000, max: 180000 }, // 1-3 minutes (vs 5-10)
      pauseAfterLikes: { min: 30000, max: 60000 }, // 30s-1min (vs 1-3min)
      maxDMsPerHour: 30, // Plus agressif
      maxDMsPerAccountPerHour: 8, // Plus par compte
    });
    
    this.introOnly = true; // Seulement les messages d'intro
    this.handoffTracking = new Map(); // Pour passer aux closeurs
  }

  async sendNaturalDM(target, campaign, stage = 'intro') {
    // Override - on envoie SEULEMENT des intros
    if (stage !== 'intro') {
      console.log(`⏭️  Skipping ${stage} - closers handle this`);
      return null;
    }
    
    // Get account avec préférence pour les comptes chauds
    const account = this.accountManager.getAvailableAccount({
      preferWarm: true, // Priorité aux comptes avec cookies
      preferredNiche: campaign.settings.accountNiche
    });
    
    if (!account) {
      throw new Error('No available accounts');
    }
    
    this.accountManager.lockAccount(account.username);
    
    try {
      const proxy = await this.proxyRotator.getProxyForAccount(account);
      if (proxy) this.proxyRotator.lockProxy(proxy);
      
      // Message d'intro seulement
      const intro = this.selectIntroMessage(target);
      
      console.log(`\n💬 Fast intro DM:`);
      console.log(`   Model: @${account.username}`);
      console.log(`   Target: @${target.username}`);
      console.log(`   Message: "${intro.message}"`);
      console.log(`   Length: ${intro.message.length} chars`);
      
      // Simulate send (95% success pour comptes chauds)
      const success = Math.random() < 0.95;
      
      if (success) {
        // Track pour handoff aux closeurs
        this.handoffTracking.set(target.username, {
          account: account.username,
          sentAt: new Date(),
          message: intro.message,
          status: 'awaiting_response'
        });
        
        campaign.stats.sent++;
      }
      
      this.accountManager.updateAccountHealth(account.username, {
        dmSent: true,
        success: success
      });
      
      return {
        target: target.username,
        account: account.username,
        message: intro.message,
        success: success,
        handoffReady: success,
        timestamp: new Date().toISOString()
      };
      
    } finally {
      this.accountManager.unlockAccount(account.username);
      if (proxy) this.proxyRotator.unlockProxy(proxy);
    }
  }

  selectIntroMessage(target) {
    const intros = NATURAL_TEMPLATES.FIRST_CONTACT.en;
    
    // Sélection basée sur l'heure (messages différents selon moment)
    const hour = new Date().getHours();
    let pool = intros;
    
    if (hour < 12) {
      // Matin - plus énergique
      pool = intros.filter(t => t.tone === 'hype' || t.tone === 'supportive');
    } else if (hour < 18) {
      // Après-midi - casual
      pool = intros.filter(t => t.tone === 'casual' || t.tone === 'friendly');
    } else {
      // Soir - admiratif
      pool = intros.filter(t => t.tone === 'admiring' || t.tone === 'friendly');
    }
    
    const template = pool[Math.floor(Math.random() * pool.length)];
    
    return {
      message: template.text.replace('{{username}}', target.username),
      templateId: template.id,
      tone: template.tone
    };
  }

  async getHandoffList() {
    // Liste des conversations prêtes pour les closeurs
    const handoffs = [];
    
    for (const [username, data] of this.handoffTracking) {
      const timeSinceSent = Date.now() - new Date(data.sentAt).getTime();
      
      // Prêt pour handoff après 30 minutes
      if (timeSinceSent > 30 * 60 * 1000) {
        handoffs.push({
          username,
          account: data.account,
          sentAt: data.sentAt,
          introMessage: data.message,
          priority: this.calculatePriority(username)
        });
      }
    }
    
    // Trier par priorité
    handoffs.sort((a, b) => b.priority - a.priority);
    
    return handoffs;
  }

  calculatePriority(username) {
    // Logique de priorité pour les closeurs
    // (pourrait être basée sur followers, engagement, etc)
    return Math.random() * 100;
  }

  async exportForClosers(outputPath) {
    const handoffs = await this.getHandoffList();
    
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'username', title: 'username' },
        { id: 'account', title: 'dm_sent_from' },
        { id: 'sentAt', title: 'sent_at' },
        { id: 'introMessage', title: 'intro_message' },
        { id: 'priority', title: 'priority_score' }
      ]
    });
    
    await csvWriter.writeRecords(handoffs);
    console.log(`\n📤 Exported ${handoffs.length} conversations for closers`);
  }

  // Override pour tempo plus rapide
  getRandomPause(min = null, max = null) {
    const minPause = min || this.config.pauseBetweenDMs.min;
    const maxPause = max || this.config.pauseBetweenDMs.max;
    
    // 20% de chance d'avoir une pause très courte
    if (Math.random() < 0.2) {
      return 30000; // 30 secondes seulement
    }
    
    return Math.floor(Math.random() * (maxPause - minPause + 1)) + minPause;
  }
}