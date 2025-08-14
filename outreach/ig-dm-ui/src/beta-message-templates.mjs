import Mustache from 'mustache';

// Beta-specific templates with team attribution
export const BETA_TEMPLATES = {
  // Warm, personal templates emphasizing exclusive beta access
  BETA_EXCLUSIVE: {
    en: [
      {
        id: 'beta_exclusive_1',
        text: "Hey {{username}}! 👋 I'm {{teamMember}} from the {{modelName}} team. We're launching something exclusive for creators like you - a platform that's already helping models earn 40% more. Want to be one of our first beta users? 🚀",
        tone: 'friendly',
        category: 'exclusive'
      },
      {
        id: 'beta_exclusive_2',
        text: "Hi {{username}}! {{teamMember}} here 💕 Your content is amazing! We're in beta with a new platform designed by models, for models. Our early users are seeing incredible results. Interested in exclusive access?",
        tone: 'warm',
        category: 'exclusive'
      },
      {
        id: 'beta_exclusive_3',
        text: "{{username}}! 🌟 {{teamMember}} from {{modelName}}'s team here. We're secretly beta testing a game-changing platform for OF creators. Only inviting a select few... want in? 🎯",
        tone: 'mysterious',
        category: 'exclusive'
      }
    ],
    fr: [
      {
        id: 'beta_exclusive_fr_1',
        text: "Salut {{username}}! 👋 C'est {{teamMember}} de l'équipe {{modelName}}. On lance un truc exclusif pour les créatrices comme toi - déjà +40% de revenus pour nos beta testeuses. Ça t'intéresse? 🚀",
        tone: 'friendly',
        category: 'exclusive'
      }
    ],
    es: [
      {
        id: 'beta_exclusive_es_1',
        text: "Hola {{username}}! 👋 Soy {{teamMember}} del equipo de {{modelName}}. Estamos lanzando algo exclusivo para creadoras como tú. ¿Quieres ser una de las primeras en probarlo? 🚀",
        tone: 'friendly',
        category: 'exclusive'
      }
    ]
  },

  // Direct value proposition focusing on earnings
  BETA_EARNINGS: {
    en: [
      {
        id: 'beta_earnings_1',
        text: "{{username}}, quick question from {{teamMember}} 💭 What if you could automate 80% of your OF management and focus on creating? We're beta testing exactly that. Want details?",
        tone: 'direct',
        category: 'earnings'
      },
      {
        id: 'beta_earnings_2',
        text: "Hey {{username}}! {{teamMember}} here from {{modelName}}'s team 💰 Our beta platform is helping creators save 10+ hours/week and earn way more. Limited spots left... interested?",
        tone: 'urgent',
        category: 'earnings'
      },
      {
        id: 'beta_earnings_3',
        text: "{{username}} 🔥 Real talk from {{teamMember}}: We built something that's changing the game for OF models. Beta users seeing 2-3x engagement. Want to level up? 📈",
        tone: 'confident',
        category: 'earnings'
      }
    ]
  },

  // Peer recommendation style
  BETA_PEER: {
    en: [
      {
        id: 'beta_peer_1',
        text: "Hi {{username}}! {{teamMember}} here 😊 {{modelName}} suggested I reach out - she's been using our beta platform and loving it. Thought you might want to check it out too?",
        tone: 'referral',
        category: 'peer'
      },
      {
        id: 'beta_peer_2',
        text: "{{username}}! 💕 {{teamMember}} from the beta team here. Several top creators in your niche are already with us and crushing it. Want to join them?",
        tone: 'social_proof',
        category: 'peer'
      }
    ]
  },

  // Problem-solving approach
  BETA_SOLUTION: {
    en: [
      {
        id: 'beta_solution_1',
        text: "{{username}}, tired of spending hours on admin? 😮‍💨 {{teamMember}} here - we're beta testing tools that handle the boring stuff so you can focus on content. Interested?",
        tone: 'problem_solver',
        category: 'solution'
      },
      {
        id: 'beta_solution_2',
        text: "Hey {{username}}! It's {{teamMember}} 👋 Know that feeling when OF management takes over your life? We built something to fix that. Beta spots available - want one?",
        tone: 'empathetic',
        category: 'solution'
      }
    ]
  },

  // Short and sweet
  BETA_SHORT: {
    en: [
      {
        id: 'beta_short_1',
        text: "{{username}} + our beta = 💰💰💰\n\n{{teamMember}} here. Want the link?",
        tone: 'minimal',
        category: 'short'
      },
      {
        id: 'beta_short_2',
        text: "{{modelName}}'s team here 👋\n\nBeta access for {{username}}?\n\n- {{teamMember}}",
        tone: 'minimal',
        category: 'short'
      }
    ]
  }
};

// Template selection logic
export class BetaMessageGenerator {
  constructor() {
    this.usageHistory = new Map();
  }

  generateMessage(options = {}) {
    const {
      username,
      teamMember = 'Sarah',
      modelName = 'our team',
      language = 'en',
      category = null,
      timezone = 'ET'
    } = options;

    // Get appropriate template based on time and category
    const template = this.selectTemplate(language, category, timezone);
    
    // Render with Mustache
    const message = Mustache.render(template.text, {
      username,
      teamMember,
      modelName
    });

    // Track usage
    this.trackUsage(username, template.id);

    return {
      message,
      templateId: template.id,
      category: template.category,
      tone: template.tone
    };
  }

  selectTemplate(language, preferredCategory, timezone) {
    const hour = this.getCurrentHour(timezone);
    let categories = [];

    // Time-based category selection
    if (hour >= 9 && hour < 12) {
      // Morning: direct and earnings-focused
      categories = ['earnings', 'solution'];
    } else if (hour >= 12 && hour < 17) {
      // Afternoon: peer recommendations and exclusive
      categories = ['peer', 'exclusive'];
    } else if (hour >= 17 && hour < 21) {
      // Evening: short and friendly
      categories = ['short', 'exclusive', 'peer'];
    } else {
      // Late night: friendly and exclusive
      categories = ['exclusive', 'peer'];
    }

    // Override with preferred category if specified
    if (preferredCategory && BETA_TEMPLATES[`BETA_${preferredCategory.toUpperCase()}`]) {
      categories.unshift(preferredCategory);
    }

    // Find templates
    for (const cat of categories) {
      const categoryKey = `BETA_${cat.toUpperCase()}`;
      const templates = BETA_TEMPLATES[categoryKey]?.[language];
      
      if (templates && templates.length > 0) {
        // Random selection within category
        return templates[Math.floor(Math.random() * templates.length)];
      }
    }

    // Fallback to first available template
    return BETA_TEMPLATES.BETA_EXCLUSIVE.en[0];
  }

  getCurrentHour(timezone) {
    const now = new Date();
    let offset = 0;
    
    switch(timezone) {
      case 'PT': offset = -8; break;
      case 'MT': offset = -7; break;
      case 'CT': offset = -6; break;
      case 'ET': offset = -5; break;
      default: offset = -5; // Default to ET
    }

    const utcHour = now.getUTCHours();
    return (utcHour + offset + 24) % 24;
  }

  trackUsage(username, templateId) {
    if (!this.usageHistory.has(username)) {
      this.usageHistory.set(username, []);
    }
    
    this.usageHistory.get(username).push({
      templateId,
      timestamp: new Date()
    });
  }

  getOptimalTemplate(username, templates) {
    const history = this.usageHistory.get(username) || [];
    const usedTemplateIds = history.map(h => h.templateId);
    
    // Find unused templates
    const unused = templates.filter(t => !usedTemplateIds.includes(t.id));
    
    if (unused.length > 0) {
      return unused[0];
    }
    
    // If all used, pick least recently used
    const usageCount = {};
    usedTemplateIds.forEach(id => {
      usageCount[id] = (usageCount[id] || 0) + 1;
    });
    
    templates.sort((a, b) => {
      const countA = usageCount[a.id] || 0;
      const countB = usageCount[b.id] || 0;
      return countA - countB;
    });
    
    return templates[0];
  }
}

// Follow-up templates for responses
export const BETA_FOLLOWUPS = {
  interested: [
    "Awesome! 🎉 Here's your exclusive beta access: {{betaLink}}\n\nLet me know if you need any help getting started! - {{teamMember}}",
    "Perfect! 💕 Welcome to the beta fam!\n\n{{betaLink}}\n\nCan't wait to see you crush it! - {{teamMember}}",
    "Yesss! 🚀 You're gonna love this:\n\n{{betaLink}}\n\nHit me up if you have any questions! - {{teamMember}}"
  ],
  
  question: [
    "Great question! {{answer}}\n\nWant to see it in action? {{betaLink}} - {{teamMember}}",
    "Good thinking! {{answer}}\n\nHere's your access: {{betaLink}}\n\nLet me know what you think! - {{teamMember}}"
  ],
  
  notInterested: [
    "No worries at all! If you change your mind, we'll be here 😊 Good luck with everything! - {{teamMember}}",
    "All good! Keep doing your thing 💕 If you ever want to check it out, just let me know! - {{teamMember}}"
  ]
};