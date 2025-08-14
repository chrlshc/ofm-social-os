import Mustache from 'mustache';

// Templates courts, personnalisés et FOMO-driven pour l'IA
export const AI_TEMPLATES = {
  // Intro ultra-courtes et personnalisées
  PERSONALIZED_INTRO: {
    templates: [
      {
        id: 'ai_intro_1',
        text: "{{username}} that {{recent_post_topic}} post 🔥🔥",
        ai_context: ['recent_post_topic'], // L'IA doit analyser le dernier post
        length: 'ultra_short'
      },
      {
        id: 'ai_intro_2',
        text: "girl ur {{compliment_specific}} is insaneee 😍",
        ai_context: ['compliment_specific'], // Ex: "makeup", "body", "style"
        length: 'ultra_short'
      },
      {
        id: 'ai_intro_3',
        text: "{{city_reference}}!! finally another {{niche}} creator 💕",
        ai_context: ['city_reference', 'niche'], // Ex: "NYC girl", "fitness"
        length: 'short'
      },
      {
        id: 'ai_intro_4',
        text: "wait {{mutual_interest}} too?? obsessed",
        ai_context: ['mutual_interest'], // Ex: "u do pilates", "u love sushi"
        length: 'ultra_short'
      }
    ]
  },

  // Follow-ups courts avec FOMO
  FOMO_FOLLOWUP: {
    templates: [
      {
        id: 'fomo_follow_1',
        text: "btw {{similar_creator}} just hit {{milestone}} using this thing we found 👀",
        ai_context: ['similar_creator', 'milestone'], // Ex: "@mia", "50k/month"
        length: 'short',
        fomo_level: 'high'
      },
      {
        id: 'fomo_follow_2',
        text: "only letting like 10 more {{niche}} girls in this week",
        ai_context: ['niche'],
        length: 'ultra_short',
        fomo_level: 'high'
      },
      {
        id: 'fomo_follow_3',
        text: "{{friend_name}} said i HAD to tell u about this",
        ai_context: ['friend_name'], // Nom d'une créatrice populaire
        length: 'ultra_short',
        fomo_level: 'medium'
      }
    ]
  },

  // Beta reveal super courts
  BETA_REVEAL: {
    templates: [
      {
        id: 'beta_reveal_1',
        text: "we're at {{current_earnings}}/month now 🤯 wanna see?",
        ai_context: ['current_earnings'], // Basé sur leur niveau estimé
        length: 'ultra_short',
        fomo_level: 'high'
      },
      {
        id: 'beta_reveal_2',
        text: "closing beta friday... u in? {{success_metric}}",
        ai_context: ['success_metric'], // Ex: "3 girls already at 100k"
        length: 'ultra_short',
        fomo_level: 'extreme'
      },
      {
        id: 'beta_reveal_3',
        text: "{{time_saved}}/day saved = more content = more 💰",
        ai_context: ['time_saved'], // Ex: "4hrs"
        length: 'ultra_short',
        fomo_level: 'medium'
      }
    ]
  },

  // Réponses aux objections (ultra courtes)
  OBJECTION_HANDLERS: {
    skeptical: [
      "totally get it! {{proof_point}} tho",
      "fair! but {{creator_name}} thought same thing now she's at {{result}}"
    ],
    busy: [
      "literally saves time lol {{time_metric}}",
      "that's WHY we built it 😅"
    ],
    interested: [
      "yesss sending rn! only {{spots_left}} spots",
      "omg perfect timing!! {{urgency_reason}}"
    ]
  },

  // Personnalisation par niche
  NICHE_SPECIFIC: {
    fitness: {
      intro: "another gym girl!! 💪 {{workout_reference}}",
      fomo: "{{fitness_creator}} doubled her subs in 2 weeks with this"
    },
    fashion: {
      intro: "ur style >>> {{brand_reference}} vibes",
      fomo: "fashion girls seeing 3x engagement rn"
    },
    gaming: {
      intro: "{{game_reference}}!! finally a girl who gets it",
      fomo: "{{gamer_creator}} quit her job last month bc of this"
    },
    milf: {
      intro: "mama you're glowing!! {{mom_reference}}",
      fomo: "other moms making 80k+ now no cap"
    }
  }
};

// Générateur avec IA Context
export class AIMessageGenerator {
  constructor(aiClient) {
    this.aiClient = aiClient; // GPT-4 ou Claude API
    this.profileCache = new Map();
  }

  async generatePersonalizedMessage(target, stage = 'intro') {
    // Analyser le profil avec l'IA
    const profile = await this.analyzeProfile(target);
    
    // Sélectionner template approprié
    const template = this.selectOptimalTemplate(profile, stage);
    
    // Générer les variables personnalisées
    const variables = await this.generateVariables(template, profile);
    
    // Render final message
    const message = Mustache.render(template.text, variables);
    
    return {
      message,
      templateId: template.id,
      profile,
      fomoLevel: template.fomo_level || 'low',
      length: message.length
    };
  }

  async analyzeProfile(target) {
    // Check cache
    if (this.profileCache.has(target.username)) {
      return this.profileCache.get(target.username);
    }

    // Analyze with AI
    const prompt = `Analyze this Instagram profile for DM outreach:
Username: ${target.username}
Bio: ${target.bio || 'N/A'}
Recent posts: ${target.recentPosts?.join(', ') || 'N/A'}
Followers: ${target.followers}

Extract:
1. Niche (fitness/fashion/gaming/lifestyle/etc)
2. Location/city if mentioned
3. Interests/hobbies
4. Recent post topics
5. Estimated earning level
6. Best compliment angle
7. Mutual interests we could mention

Format: JSON`;

    const analysis = await this.aiClient.complete(prompt);
    const profile = {
      ...JSON.parse(analysis),
      username: target.username,
      analyzedAt: new Date()
    };

    this.profileCache.set(target.username, profile);
    return profile;
  }

  selectOptimalTemplate(profile, stage) {
    // Smart template selection based on profile
    let templates = [];
    
    switch(stage) {
      case 'intro':
        templates = AI_TEMPLATES.PERSONALIZED_INTRO.templates;
        // Prioritize city-based if location known
        if (profile.location) {
          templates = templates.filter(t => t.ai_context.includes('city_reference'));
        }
        break;
        
      case 'followup':
        templates = AI_TEMPLATES.FOMO_FOLLOWUP.templates;
        // High FOMO for high earners
        if (profile.estimatedEarning === 'high') {
          templates = templates.filter(t => t.fomo_level === 'high');
        }
        break;
        
      case 'beta':
        templates = AI_TEMPLATES.BETA_REVEAL.templates;
        break;
    }

    // Pick shortest template for better engagement
    templates.sort((a, b) => a.text.length - b.text.length);
    return templates[0] || AI_TEMPLATES.PERSONALIZED_INTRO.templates[0];
  }

  async generateVariables(template, profile) {
    const variables = {
      username: profile.username
    };

    // Generate each required variable
    for (const context of template.ai_context) {
      switch(context) {
        case 'recent_post_topic':
          variables.recent_post_topic = profile.recentPostTopics?.[0] || 'content';
          break;
          
        case 'compliment_specific':
          variables.compliment_specific = profile.bestCompliment || 'vibe';
          break;
          
        case 'city_reference':
          variables.city_reference = profile.location ? 
            `${profile.location} girl` : 'hey girl';
          break;
          
        case 'niche':
          variables.niche = profile.niche || 'content';
          break;
          
        case 'similar_creator':
          variables.similar_creator = this.getSimilarCreator(profile.niche);
          break;
          
        case 'milestone':
          variables.milestone = this.getRelevantMilestone(profile.estimatedEarning);
          break;
          
        case 'current_earnings':
          variables.current_earnings = this.getAspirationEarnings(profile.estimatedEarning);
          break;
          
        case 'spots_left':
          variables.spots_left = Math.floor(Math.random() * 5) + 3; // 3-7
          break;
          
        case 'time_saved':
          variables.time_saved = ['3hrs', '4hrs', '5hrs'][Math.floor(Math.random() * 3)];
          break;
      }
    }

    return variables;
  }

  getSimilarCreator(niche) {
    const creators = {
      fitness: ['@fitgirl_sarah', '@gymqueen_mia', '@yogababe_em'],
      fashion: ['@styledbysoph', '@fashionista_j', '@ootd_queen'],
      gaming: ['@gamergirl_lily', '@fps_princess', '@cozy_gamer'],
      default: ['@creator_emma', '@model_sarah', '@bella_content']
    };
    
    const pool = creators[niche] || creators.default;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getRelevantMilestone(earningLevel) {
    const milestones = {
      low: ['10k/month', '15k/month', 'quit her job'],
      medium: ['30k/month', '50k/month', '6 figures'],
      high: ['100k/month', '200k/month', 'million dollar year']
    };
    
    const pool = milestones[earningLevel] || milestones.medium;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getAspirationEarnings(currentLevel) {
    const aspirations = {
      low: '25k',
      medium: '75k',
      high: '150k'
    };
    return aspirations[currentLevel] || '50k';
  }

  // Génération de messages en batch pour l'IA
  async generateBatch(targets, stage = 'intro') {
    const messages = [];
    
    // Process in batches of 10 for efficiency
    for (let i = 0; i < targets.length; i += 10) {
      const batch = targets.slice(i, i + 10);
      const promises = batch.map(target => 
        this.generatePersonalizedMessage(target, stage)
      );
      
      const results = await Promise.all(promises);
      messages.push(...results);
    }
    
    return messages;
  }
}

// Analyseur de réponses pour décider du prochain message
export class ResponseAnalyzer {
  constructor(aiClient) {
    this.aiClient = aiClient;
  }

  async analyzeResponse(message, conversation) {
    const prompt = `Analyze this Instagram DM response:
Message: "${message}"
Context: Beta software outreach, casual creator-to-creator
Previous stage: ${conversation.stage}

Determine:
1. Sentiment (positive/negative/neutral/curious)
2. Intent (interested/not_interested/needs_info/skeptical)
3. Key concerns mentioned
4. Recommended next action
5. FOMO level to apply (low/medium/high)

Format: JSON`;

    const analysis = await this.aiClient.complete(prompt);
    return JSON.parse(analysis);
  }

  async getNextMessage(username, response, conversation) {
    const analysis = await this.analyzeResponse(response, conversation);
    
    // Select appropriate response template
    let template;
    let stage = conversation.stage;
    
    if (analysis.intent === 'interested') {
      // Move to beta reveal with high FOMO
      template = AI_TEMPLATES.BETA_REVEAL.templates.find(t => 
        t.fomo_level === 'high' || t.fomo_level === 'extreme'
      );
      stage = 'beta';
    } else if (analysis.intent === 'skeptical') {
      // Handle objection
      template = {
        text: AI_TEMPLATES.OBJECTION_HANDLERS.skeptical[0],
        ai_context: ['proof_point']
      };
    } else if (analysis.intent === 'needs_info') {
      // Provide info with medium FOMO
      template = AI_TEMPLATES.FOMO_FOLLOWUP.templates.find(t => 
        t.fomo_level === 'medium'
      );
      stage = 'followup';
    }

    if (!template) return null;

    // Generate personalized variables
    const profile = conversation.profile;
    const variables = await this.generateVariables(template, profile);
    
    return {
      message: Mustache.render(template.text, variables),
      stage,
      analysis,
      fomoLevel: template.fomo_level || analysis.recommended_fomo
    };
  }
}