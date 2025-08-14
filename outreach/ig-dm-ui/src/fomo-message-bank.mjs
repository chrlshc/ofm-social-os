// Banque de messages FOMO courts et percutants
export const FOMO_MESSAGE_BANK = {
  // Phrases d'accroche ultra-personnalisées (15-30 caractères)
  OPENERS: {
    location_based: [
      "{{city}} girls >>",
      "another {{city}} baddie!!",
      "{{city}} creators unite 💕"
    ],
    
    niche_based: [
      "fitness queen spotted 👑",
      "gamer girls do it better",
      "milf energy unmatched",
      "ur aesthetic tho >>>"
    ],
    
    content_based: [
      "that {{post_item}} pic 🔥",
      "ur {{recent_trend}} >>>",
      "{{emoji}} obsessed",
      "wait ur {{activity}}??"
    ]
  },

  // Éléments FOMO à insérer (urgence + social proof)
  FOMO_ELEMENTS: {
    urgency: [
      "closing friday",
      "3 spots left",
      "last week to join",
      "ends tmrw",
      "48hrs only"
    ],
    
    social_proof: [
      "{{name}} just joined",
      "12 girls already in",
      "{{creator}} hit 100k",
      "everyone's joining",
      "ur friends r here"
    ],
    
    results: [
      "+40% this month",
      "doubled subs",
      "6 figs already", 
      "quit her 9-5",
      "best month ever"
    ],
    
    exclusivity: [
      "invite only",
      "not public yet",
      "secret beta",
      "can't share this",
      "delete after reading"
    ]
  },

  // Messages complets ultra-courts avec FOMO
  FULL_FOMO_MESSAGES: {
    extreme_urgency: [
      "3 spots. closing tmrw. u in?",
      "{{creator}} said tell u NOW",
      "last chance fr",
      "they're closing it sunday",
      "can only add 2 more"
    ],
    
    peer_pressure: [
      "every {{city}} girl is on this",
      "ur literally the last one",
      "{{friend1}} & {{friend2}} already in",
      "missing out rn",
      "they're all at 50k+ now"
    ],
    
    success_stories: [
      "{{name}} made 80k last month",
      "she quit her job bc of this",
      "from 5k to 50k in 6 weeks",
      "best decision ever - {{creator}}",
      "life changing fr - {{name}}"
    ],
    
    mystery: [
      "can't say here but 👀",
      "dm me if u want the secret",
      "👄🤫 iykyk",
      "not allowed to share but...",
      "delete this after: {{link}}"
    ]
  },

  // Réponses ultra-rapides
  QUICK_RESPONSES: {
    to_interest: [
      "sending rn! 2 spots left",
      "yess! perfect timing",
      "omg yes! {{urgency}}",
      "💕 check ur dms"
    ],
    
    to_question: [
      "free till friday",
      "{{creator}} explains here: {{link}}",
      "literally 5 min setup",
      "no catch. beta testing"
    ],
    
    to_skepticism: [
      "i thought same! but {{result}}",
      "{{name}} was skeptical too lol",
      "just look: {{proof_screenshot}}",
      "ur loss 🤷‍♀️"
    ]
  },

  // Variables dynamiques pour personnalisation
  DYNAMIC_VARS: {
    creators: [
      "@bella", "@soph", "@mia_fit", "@emma.content", 
      "@sarah_xx", "@luna.of", "@jade_model"
    ],
    
    cities: [
      "LA", "NYC", "Miami", "Chicago", "Dallas", 
      "Atlanta", "Vegas", "Phoenix", "Denver"
    ],
    
    results: [
      "50k/mo", "100k/mo", "6 figs", "200k year",
      "quit my job", "bought a house", "paid off debt"
    ],
    
    timeframes: [
      "2 weeks", "1 month", "6 weeks", "30 days", "this month"
    ]
  },

  // Templates par niveau d'engagement
  ENGAGEMENT_LEVELS: {
    cold: {
      // Premier contact - très court, intriguant
      templates: [
        "{{opener}} + secret beta = 💰",
        "{{city}} girls winning rn 👀",
        "ur content + our thing = 🚀"
      ],
      max_length: 30
    },
    
    warm: {
      // A montré de l'intérêt - FOMO moyen
      templates: [
        "btw {{creator}} just hit {{milestone}}",
        "only {{number}} {{niche}} girls allowed",
        "closes {{day}}. want in?"
      ],
      max_length: 40
    },
    
    hot: {
      // Très intéressée - FOMO maximum
      templates: [
        "LAST CHANCE. {{spots}} spots. yes?",
        "{{friend}} begged me to add u",
        "closing in {{hours}}h. link?"
      ],
      max_length: 35
    }
  },

  // Formules de personnalisation
  PERSONALIZATION_RULES: {
    by_follower_count: {
      under_10k: "grow to {{target}}k with us",
      "10k_50k": "ready for 6 figs?",
      "50k_100k": "next level = 200k+",
      over_100k: "7 figs is the goal right?"
    },
    
    by_engagement_rate: {
      low: "boost engagement 10x",
      medium: "ur engagement + our system = 💰",
      high: "ur already killing it but..."
    },
    
    by_content_style: {
      sexy: "hottest creators use this",
      cute: "perfect for ur vibe",
      lifestyle: "lifestyle girls earning most",
      fetish: "ur niche = goldmine"
    }
  }
};

// Sélecteur intelligent de messages FOMO
export class FOMOMessageSelector {
  selectMessage(profile, stage, urgencyLevel = 'medium') {
    const bank = FOMO_MESSAGE_BANK;
    
    // Sélectionner catégorie selon le stage
    let messagePool = [];
    
    switch(stage) {
      case 'intro':
        messagePool = this.buildIntroPool(profile, bank);
        break;
      case 'followup':
        messagePool = this.buildFollowupPool(profile, bank, urgencyLevel);
        break;
      case 'closing':
        messagePool = bank.FULL_FOMO_MESSAGES.extreme_urgency;
        break;
    }
    
    // Sélection aléatoire avec variables
    const template = messagePool[Math.floor(Math.random() * messagePool.length)];
    return this.insertVariables(template, profile);
  }
  
  buildIntroPool(profile, bank) {
    const pool = [];
    
    // Ajouter selon la localisation
    if (profile.city) {
      pool.push(...bank.OPENERS.location_based);
    }
    
    // Ajouter selon la niche
    if (profile.niche) {
      pool.push(...bank.OPENERS.niche_based.filter(m => 
        m.toLowerCase().includes(profile.niche.toLowerCase()) || !m.includes('{{')
      ));
    }
    
    // Ajouter des openers génériques
    pool.push(...bank.OPENERS.content_based);
    
    return pool;
  }
  
  buildFollowupPool(profile, bank, urgencyLevel) {
    const pool = [];
    
    switch(urgencyLevel) {
      case 'low':
        pool.push(...bank.FULL_FOMO_MESSAGES.success_stories);
        break;
      case 'medium':
        pool.push(...bank.FULL_FOMO_MESSAGES.peer_pressure);
        break;
      case 'high':
        pool.push(...bank.FULL_FOMO_MESSAGES.extreme_urgency);
        break;
    }
    
    return pool;
  }
  
  insertVariables(template, profile) {
    const vars = FOMO_MESSAGE_BANK.DYNAMIC_VARS;
    
    let message = template;
    
    // Remplacer les variables
    message = message.replace('{{city}}', profile.city || vars.cities[Math.floor(Math.random() * vars.cities.length)]);
    message = message.replace('{{creator}}', vars.creators[Math.floor(Math.random() * vars.creators.length)]);
    message = message.replace('{{friend}}', vars.creators[Math.floor(Math.random() * vars.creators.length)]);
    message = message.replace('{{friend1}}', vars.creators[0]);
    message = message.replace('{{friend2}}', vars.creators[1]);
    message = message.replace('{{name}}', vars.creators[Math.floor(Math.random() * vars.creators.length)]);
    message = message.replace('{{milestone}}', vars.results[Math.floor(Math.random() * vars.results.length)]);
    message = message.replace('{{result}}', vars.results[Math.floor(Math.random() * vars.results.length)]);
    message = message.replace('{{number}}', Math.floor(Math.random() * 5) + 3); // 3-7
    message = message.replace('{{spots}}', Math.floor(Math.random() * 3) + 2); // 2-4
    message = message.replace('{{hours}}', [24, 48, 72][Math.floor(Math.random() * 3)]);
    message = message.replace('{{day}}', ['friday', 'sunday', 'tomorrow'][Math.floor(Math.random() * 3)]);
    message = message.replace('{{niche}}', profile.niche || 'content');
    message = message.replace('{{post_item}}', profile.recentPost || 'last');
    message = message.replace('{{urgency}}', vars.timeframes[Math.floor(Math.random() * vars.timeframes.length)]);
    
    return message;
  }
}