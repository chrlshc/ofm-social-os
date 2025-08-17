/**
 * Analyseur avancé pour détecter OnlyFans dans les profils Instagram
 */
export class OnlyFansProfileAnalyzer {
  constructor() {
    // Patterns pour détecter OF
    this.patterns = {
      // Liens directs OF
      directLinks: [
        /onlyfans\.com\//i,
        /fansly\.com\//i,
        /fanvue\.com\//i,
        /patreon\.com\//i,
        /fancentro\.com\//i
      ],
      
      // Services de liens
      linkServices: [
        /linktr\.ee\//i,
        /beacons\.ai\//i,
        /bio\.link\//i,
        /linkin\.bio\//i,
        /allmylinks\.com\//i,
        /campsite\.bio\//i,
        /lnk\.bio\//i,
        /direct\.me\//i
      ],
      
      // Mots-clés dans bio
      bioKeywords: {
        high: [
          /\bOF\b/i,
          /onlyfans/i,
          /only fans/i,
          /exclusive content/i,
          /spicy content/i,
          /adult content/i,
          /NSFW/i,
          /18\+/i,
          /content creator/i,
          /link below/i,
          /check my link/i,
          /subscribe for more/i
        ],
        medium: [
          /DM for/i,
          /content/i,
          /exclusive/i,
          /private/i,
          /custom/i,
          /PPV/i,
          /tips welcome/i,
          /cashapp/i,
          /venmo/i
        ],
        emojis: [
          /🔥/,
          /💦/,
          /🍑/,
          /😈/,
          /🔞/,
          /⬇️/,
          /👇/,
          /💋/,
          /🌶️/,
          /🥵/
        ]
      }
    };
  }

  /**
   * Analyser un profil Instagram
   */
  analyzeProfile(profileData) {
    const analysis = {
      username: profileData.username,
      hasOF: false,
      confidence: 0,
      signals: [],
      directLink: null,
      linkService: null,
      score: 0
    };

    // 1. Vérifier les liens externes
    if (profileData.externalLink || profileData.bio) {
      const linkToCheck = `${profileData.externalLink || ''} ${profileData.bio || ''}`;
      
      // Liens directs OF (très haute confiance)
      for (const pattern of this.patterns.directLinks) {
        if (pattern.test(linkToCheck)) {
          analysis.hasOF = true;
          analysis.confidence = 0.95;
          analysis.directLink = linkToCheck.match(pattern)[0];
          analysis.signals.push('direct_of_link');
          analysis.score += 10;
          break;
        }
      }
      
      // Services de liens (haute confiance)
      if (!analysis.directLink) {
        for (const pattern of this.patterns.linkServices) {
          if (pattern.test(linkToCheck)) {
            analysis.linkService = linkToCheck.match(pattern)[0];
            analysis.signals.push('link_service');
            analysis.score += 7;
            analysis.confidence = Math.max(analysis.confidence, 0.8);
            break;
          }
        }
      }
    }

    // 2. Analyser la bio
    if (profileData.bio) {
      const bio = profileData.bio.toLowerCase();
      
      // Mots-clés haute confiance
      let highMatches = 0;
      for (const pattern of this.patterns.bioKeywords.high) {
        if (pattern.test(bio)) {
          highMatches++;
          analysis.signals.push(`keyword_high_${pattern.source}`);
        }
      }
      if (highMatches > 0) {
        analysis.score += highMatches * 3;
        analysis.confidence = Math.max(analysis.confidence, 0.7);
      }
      
      // Mots-clés moyenne confiance
      let mediumMatches = 0;
      for (const pattern of this.patterns.bioKeywords.medium) {
        if (pattern.test(bio)) {
          mediumMatches++;
          analysis.signals.push(`keyword_medium_${pattern.source}`);
        }
      }
      if (mediumMatches > 0) {
        analysis.score += mediumMatches * 1.5;
        analysis.confidence = Math.max(analysis.confidence, 0.5);
      }
      
      // Emojis suggestifs
      let emojiMatches = 0;
      for (const pattern of this.patterns.bioKeywords.emojis) {
        if (pattern.test(bio)) {
          emojiMatches++;
          analysis.signals.push(`emoji_${pattern.source}`);
        }
      }
      if (emojiMatches >= 2) {
        analysis.score += 2;
        analysis.confidence = Math.max(analysis.confidence, 0.4);
      }
    }

    // 3. Analyser les métriques
    if (profileData.followers) {
      const followers = this.parseFollowers(profileData.followers);
      
      // Sweet spot pour OF creators
      if (followers >= 5000 && followers <= 100000) {
        analysis.score += 2;
        analysis.signals.push('optimal_follower_range');
      }
      
      // Ratio posts/followers
      if (profileData.posts) {
        const posts = parseInt(profileData.posts);
        const ratio = posts / followers;
        if (ratio < 0.1 && followers > 10000) {
          // Peu de posts mais beaucoup de followers = possible OF
          analysis.score += 1;
          analysis.signals.push('low_post_ratio');
        }
      }
    }

    // 4. Calculer le verdict final
    analysis.hasOF = analysis.score >= 7 || analysis.confidence >= 0.7;
    
    // Normaliser le score sur 10
    analysis.score = Math.min(10, analysis.score);
    
    return analysis;
  }

  /**
   * Analyser en batch
   */
  analyzeBatch(profiles) {
    const results = profiles.map(profile => this.analyzeProfile(profile));
    
    // Trier par score
    results.sort((a, b) => b.score - a.score);
    
    // Statistiques
    const stats = {
      total: results.length,
      withOF: results.filter(r => r.hasOF).length,
      withDirectLink: results.filter(r => r.directLink).length,
      withLinkService: results.filter(r => r.linkService).length,
      averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length
    };
    
    return { results, stats };
  }

  /**
   * Parser les followers
   */
  parseFollowers(followersText) {
    if (!followersText) return 0;
    
    // Gérer les formats: "10.5K", "1.2M", "1,234"
    let num = followersText.replace(/[^\d.KMkmB]/g, '');
    
    if (num.includes('K') || num.includes('k')) {
      return parseFloat(num) * 1000;
    } else if (num.includes('M') || num.includes('m')) {
      return parseFloat(num) * 1000000;
    } else if (num.includes('B') || num.includes('b')) {
      return parseFloat(num) * 1000000000;
    }
    
    return parseInt(num) || 0;
  }

  /**
   * Obtenir des recommandations basées sur l'analyse
   */
  getRecommendations(analysis) {
    const recs = [];
    
    if (analysis.directLink) {
      recs.push({
        priority: 'high',
        action: 'direct_outreach',
        message: 'Profil avec lien OF direct - priorité maximale'
      });
    } else if (analysis.linkService) {
      recs.push({
        priority: 'high',
        action: 'check_link_service',
        message: 'Vérifier le service de liens pour OF'
      });
    } else if (analysis.score >= 6) {
      recs.push({
        priority: 'medium',
        action: 'soft_approach',
        message: 'Signaux OF présents - approche douce recommandée'
      });
    }
    
    return recs;
  }
}

// Export
export default OnlyFansProfileAnalyzer;