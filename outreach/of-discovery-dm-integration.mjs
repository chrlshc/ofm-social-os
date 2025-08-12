#!/usr/bin/env node
/**
 * Intégration OF Discovery → IG DM Auto
 * Pipeline complet: Actor Apify → Filtrage qualifié → DM automatisé
 */

import { InstagramOfDiscoveryClient } from './of-discovery/backend/instagram-of-discovery-client.mjs';
import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

class OfDiscoveryDmPipeline {
  constructor(config = {}) {
    this.config = {
      // Apify OF Discovery
      apifyToken: config.apifyToken || process.env.APIFY_TOKEN,
      actorId: config.actorId || process.env.ACTOR_ID || 'username/instagram-of-discovery',
      
      // Filtrage candidats
      minScore: config.minScore || 15,
      maxTargets: config.maxTargets || 50,
      requireOfConfirmed: config.requireOfConfirmed !== false,
      
      // DM Config
      message: config.message || "hey amazing content, i can help you earn more from ig",
      qps: config.qps || 0.8,
      jitterMs: config.jitterMs || 18000,
      dryRun: config.dryRun || false,
      
      // Pipeline
      outputDir: config.outputDir || 'out',
      ...config
    };

    this.client = new InstagramOfDiscoveryClient({
      apifyToken: this.config.apifyToken,
      actorId: this.config.actorId
    });

    this.stats = {
      discovered: 0,
      qualified: 0,
      dmsSent: 0,
      dmsSkipped: 0,
      errors: 0
    };
  }

  async run() {
    console.log('🚀 Démarrage Pipeline OF Discovery → DM Auto');
    
    try {
      // 1. Discovery via Actor Apify
      const discovery = await this.runOfDiscovery();
      
      // 2. Filtrage candidats qualifiés  
      const qualified = await this.filterQualifiedCandidates(discovery);
      
      // 3. DM automatisé via système existant
      await this.sendDmsToQualified(qualified);
      
      // 4. Stats finales
      this.showFinalStats();
      
    } catch (error) {
      console.error('💥 Erreur pipeline:', error.message);
      process.exit(1);
    }
  }

  async runOfDiscovery() {
    console.log('🔍 === PHASE 1: OF DISCOVERY ===');
    
    const input = {
      hashtags: ['onlyfans', 'linkinbio', 'beacons', 'fansly'],
      maxUsers: 1200,
      minFollowers: 3000,
      maxFollowers: 15000,
      enableLinkResolution: true,
      useProxy: true,
      proxyGroups: ['RESIDENTIAL']
    };

    console.log('Input Discovery:', input);
    
    const results = await this.client.runSync(input);
    
    this.stats.discovered = results.stats.totalCandidates;
    
    console.log(`✅ Discovery terminé: ${results.stats.totalCandidates} candidats trouvés`);
    console.log(`🎯 OF confirmés: ${results.stats.ofConfirmed}`);
    console.log(`📊 Score moyen: ${results.stats.avgScore}`);
    
    return results;
  }

  async filterQualifiedCandidates(discovery) {
    console.log('\\n🎯 === PHASE 2: FILTRAGE QUALIFIÉ ===');
    
    let candidates = discovery.candidates;
    
    console.log(`📥 Candidats initiaux: ${candidates.length}`);
    
    // Filtre 1: OF confirmé (si requis)
    if (this.config.requireOfConfirmed) {
      candidates = candidates.filter(c => c.link_resolution?.isOF === true);
      console.log(`✅ Après filtre OF confirmé: ${candidates.length}`);
    }
    
    // Filtre 2: Score minimum
    candidates = candidates.filter(c => c.of_analysis?.score >= this.config.minScore);
    console.log(`✅ Après filtre score ≥${this.config.minScore}: ${candidates.length}`);
    
    // Filtre 3: Critères qualité
    candidates = candidates.filter(c => {
      return !c.is_private &&
             !c.is_verified &&
             c.followers >= 3000 &&
             c.followers <= 15000;
    });
    console.log(`✅ Après filtres qualité: ${candidates.length}`);
    
    // Tri par score décroissant
    candidates.sort((a, b) => b.of_analysis.score - a.of_analysis.score);
    
    // Limitation max targets
    const qualified = candidates.slice(0, this.config.maxTargets);
    this.stats.qualified = qualified.length;
    
    console.log(`🎯 Candidats qualifiés finaux: ${qualified.length}`);
    
    // Sauvegarde pour audit
    await this.saveQualifiedCandidates(qualified);
    
    return qualified;
  }

  async saveQualifiedCandidates(qualified) {
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }

    const output = {
      timestamp: new Date().toISOString(),
      pipeline: 'of-discovery-dm-integration',
      config: {
        minScore: this.config.minScore,
        maxTargets: this.config.maxTargets,
        requireOfConfirmed: this.config.requireOfConfirmed
      },
      stats: this.stats,
      qualified_candidates: qualified.map(c => ({
        username: c.username,
        followers: c.followers,
        score: c.of_analysis?.score,
        platform: c.link_resolution?.platform,
        reasons: c.of_analysis?.reasons,
        external_url: c.external_url,
        biography: c.biography?.slice(0, 100) // Tronquer bio
      }))
    };

    writeFileSync(`${this.config.outputDir}/qualified_of_targets.json`, 
      JSON.stringify(output, null, 2));
    
    console.log(`💾 Candidats qualifiés sauvés: ${this.config.outputDir}/qualified_of_targets.json`);
  }

  async sendDmsToQualified(qualified) {
    console.log('\\n📤 === PHASE 3: DM AUTOMATISÉ ===');
    
    if (qualified.length === 0) {
      console.log('⚠️  Aucun candidat qualifié, skip DMs');
      return;
    }

    console.log(`Configuration DM:`);
    console.log(`- Cibles: ${qualified.length}`);
    console.log(`- Message: "${this.config.message}"`);
    console.log(`- QPS: ${this.config.qps}`);
    console.log(`- Jitter: ${this.config.jitterMs}ms`);
    console.log(`- Dry run: ${this.config.dryRun}`);

    if (this.config.dryRun) {
      console.log('\\n🧪 MODE DRY RUN - Commandes qui seraient exécutées:');
      qualified.slice(0, 5).forEach((candidate, i) => {
        console.log(`${i+1}. @${candidate.username} (score: ${candidate.of_analysis.score}) - npm run dm -- --user ${candidate.username} --message "${this.config.message}"`);
      });
      if (qualified.length > 5) {
        console.log(`... et ${qualified.length - 5} autres`);
      }
      return;
    }

    // DM réel avec système existant
    const baseDelay = Math.ceil(1000 / this.config.qps);
    
    for (let i = 0; i < qualified.length; i++) {
      const candidate = qualified[i];
      const progress = `[${i + 1}/${qualified.length}]`;
      
      console.log(`${progress} 📤 DM à @${candidate.username} (score: ${candidate.of_analysis.score})`);
      
      try {
        await this.sendSingleDm(candidate.username);
        this.stats.dmsSent++;
        console.log(`${progress} ✅ DM envoyé à @${candidate.username}`);
      } catch (error) {
        this.stats.errors++;
        console.error(`${progress} ❌ Échec DM à @${candidate.username}:`, error.message);
      }

      // Throttle avec jitter
      if (i < qualified.length - 1) {
        const jitter = Math.random() * this.config.jitterMs;
        const totalDelay = baseDelay + jitter;
        console.log(`⏱️  Attente ${Math.round(totalDelay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }

    console.log(`\\n📊 DM terminé: ${this.stats.dmsSent} envoyés, ${this.stats.errors} erreurs`);
  }

  async sendSingleDm(username) {
    return new Promise((resolve, reject) => {
      // Utiliser le système DM sophistiqué existant
      const args = ['run', 'dm', '--', '--user', username, '--message', this.config.message];
      
      const child = spawn('npm', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: '/Users/765h/OFM CHARLES/ig-dm-ui' // Path vers votre projet IG DM
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

      // Timeout sécurité
      setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('DM timeout (60s)'));
      }, 60000);
    });
  }

  showFinalStats() {
    console.log('\\n🏁 === PIPELINE TERMINÉ ===');
    console.log('📊 Statistiques finales:');
    console.log(`- Candidats découverts: ${this.stats.discovered}`);
    console.log(`- Candidats qualifiés: ${this.stats.qualified}`);
    console.log(`- DMs envoyés: ${this.stats.dmsSent}`);
    console.log(`- DMs ratés: ${this.stats.errors}`);
    
    const successRate = this.stats.qualified > 0 
      ? Math.round(this.stats.dmsSent / this.stats.qualified * 100) 
      : 0;
    
    console.log(`- Taux de succès DM: ${successRate}%`);
    
    if (this.stats.dmsSent > 0) {
      console.log(`\\n🎯 ${this.stats.dmsSent} modèles OF contactés avec succès !`);
      console.log(`\\n🤖 Le SaaS Closer Engine peut maintenant traiter leurs réponses automatiquement.`);
      console.log(`   Démarrer: node saas-closer-engine.mjs start`);
    }
  }
}

// CLI Usage
function parseArgs(argv) {
  const args = {};
  const flags = [];
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i++;
      } else {
        flags.push(key);
      }
    }
  }
  
  return { args, flags };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const { args, flags } = parseArgs(process.argv);
  
  const config = {
    apifyToken: process.env.APIFY_TOKEN || args.token,
    minScore: parseInt(args.minScore || '15'),
    maxTargets: parseInt(args.maxTargets || '50'),
    message: args.message || "hey amazing content, i can help you earn more from ig",
    qps: parseFloat(args.qps || '0.8'),
    jitterMs: parseInt(args.jitterMs || '18000'),
    dryRun: flags.includes('dry') || process.env.DRY_RUN === 'true',
    requireOfConfirmed: !flags.includes('no-of-filter')
  };

  if (!config.apifyToken) {
    console.error('❌ APIFY_TOKEN requis');
    console.error('Usage: APIFY_TOKEN=xxx node of-discovery-dm-integration.mjs [--dry] [--minScore 20] [--maxTargets 30]');
    process.exit(1);
  }

  const pipeline = new OfDiscoveryDmPipeline(config);
  pipeline.run().catch(error => {
    console.error('💥 Erreur fatale:', error);
    process.exit(1);
  });
}