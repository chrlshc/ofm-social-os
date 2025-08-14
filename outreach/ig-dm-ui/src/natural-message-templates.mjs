import Mustache from 'mustache';

// Messages naturels et authentiques - comme si une vraie model écrivait
export const NATURAL_TEMPLATES = {
  // Messages d'accroche naturels après avoir liké des posts
  FIRST_CONTACT: {
    en: [
      {
        id: 'natural_intro_1',
        text: "hey girl! just saw your content and omg 😍 you're killing it!! love your vibe 💕",
        tone: 'supportive',
        category: 'intro'
      },
      {
        id: 'natural_intro_2',
        text: "{{username}} your last post thooo 🔥🔥 girl you're gorgeous!!",
        tone: 'hype',
        category: 'intro'
      },
      {
        id: 'natural_intro_3',
        text: "okayy {{username}} i see you 👀✨ your content is fireee",
        tone: 'casual',
        category: 'intro'
      },
      {
        id: 'natural_intro_4',
        text: "heyy babe! had to stop and say your pics are stunning 😍 love your style!",
        tone: 'friendly',
        category: 'intro'
      },
      {
        id: 'natural_intro_5',
        text: "{{username}} 💕 just scrolled through your page and wow... goals honestly",
        tone: 'admiring',
        category: 'intro'
      }
    ],
    fr: [
      {
        id: 'natural_intro_fr_1',
        text: "coucou {{username}}! je viens de voir tes posts et waouh 😍 t'es trop belle!!",
        tone: 'supportive',
        category: 'intro'
      },
      {
        id: 'natural_intro_fr_2',
        text: "heyy ma belle! ton contenu est vraiment incroyable 🔥 j'adore ton style!",
        tone: 'friendly',
        category: 'intro'
      }
    ],
    es: [
      {
        id: 'natural_intro_es_1',
        text: "holaa {{username}}! acabo de ver tu contenido y ufff 😍 qué divina eres!",
        tone: 'supportive',
        category: 'intro'
      }
    ]
  },

  // Conversation naturelle - après réponse positive
  NATURAL_FOLLOWUP: {
    en: [
      {
        id: 'natural_follow_1',
        text: "aww thank youu! 🥰 btw are you on OF too? i feel like we're in the same hustle haha",
        tone: 'relatable',
        category: 'followup'
      },
      {
        id: 'natural_follow_2',
        text: "yesss another creator! 💕 how's it going for you on there? always love connecting with other girls doing this",
        tone: 'curious',
        category: 'followup'
      },
      {
        id: 'natural_follow_3',
        text: "omg thank you babe! 💕 do you do OF too? would love to chat about it if you do!",
        tone: 'engaging',
        category: 'followup'
      }
    ]
  },

  // Introduction beta - très soft et naturelle
  SOFT_BETA_INTRO: {
    en: [
      {
        id: 'soft_beta_1',
        text: "actually me and some other girls are trying this new thing that's been helping sooo much with the business side... idk if you'd be interested but it's been a game changer for us 🙈",
        tone: 'casual_share',
        category: 'beta_soft'
      },
      {
        id: 'soft_beta_2',
        text: "girl honestly OF can be so overwhelming sometimes right?? me and my friends found something that's been making it wayy easier... would you want me to share?",
        tone: 'empathetic',
        category: 'beta_soft'
      },
      {
        id: 'soft_beta_3',
        text: "btw if you ever need help with the business side of OF, i've been testing something new with a few other creators that's been amazinggg 💕 no pressure but happy to share if you want!",
        tone: 'helpful',
        category: 'beta_soft'
      },
      {
        id: 'soft_beta_4',
        text: "random but have you been finding OF super time consuming lately?? cuz same 😅 but actually found something that's been helping a lot if you're interested",
        tone: 'relatable',
        category: 'beta_soft'
      }
    ]
  },

  // Partage d'expérience personnelle
  PERSONAL_STORY: {
    en: [
      {
        id: 'story_1',
        text: "honestly i was spending like 10+ hours a day just on messages and admin stuff 😭 but this new platform thing we're testing literally cut it down to like 2 hours... i actually have a life again lol",
        tone: 'personal',
        category: 'story'
      },
      {
        id: 'story_2',
        text: "ok so basically it's like having a whole team but without actually hiring anyone?? handles all the boring stuff so we can just focus on content... been using it for a few weeks and already seeing better results 📈",
        tone: 'explaining',
        category: 'story'
      },
      {
        id: 'story_3',
        text: "girl it's been life changing honestly... like my subs are happier cuz i can actually focus on them instead of being overwhelmed all the time 🥺 and my income went up like 40% already",
        tone: 'results',
        category: 'story'
      }
    ]
  },

  // Réponses aux questions
  ANSWER_QUESTIONS: {
    cost: [
      "totally get it! so rn it's actually free cuz we're still in beta testing 🙈 they just want feedback from creators to make it perfect for us"
    ],
    
    how_it_works: [
      "basically it automates allll the repetitive stuff - like sorting messages, scheduling posts, tracking stats... but the cool part is it learns your style so everything still feels like you! 💕"
    ],
    
    is_it_safe: [
      "yesss i was worried about that too! but it's actually built by creators for creators so they really get the privacy thing... plus it doesn't touch your banking or anything sensitive"
    ],
    
    interested: [
      "omgg yay! ok so i can send you the link to sign up for beta access! we're like a little community now helping each other out 🥰"
    ]
  },

  // Messages de clôture
  CLOSING: {
    en: [
      {
        id: 'close_1',
        text: "anyway babe, no pressure at all! just thought i'd share since it's been so helpful 💕 lmk if you want the link or have any questions!",
        tone: 'no_pressure',
        category: 'closing'
      },
      {
        id: 'close_2',
        text: "here's the link if you wanna check it out! {{betaLink}} \nfeel free to message me if you need any help! us girls gotta stick together 💪💕",
        tone: 'supportive',
        category: 'closing'
      }
    ]
  }
};

// Générateur de conversations naturelles
export class NaturalConversationFlow {
  constructor() {
    this.conversations = new Map();
  }

  startConversation(username, options = {}) {
    const { language = 'en' } = options;
    
    // Choisir un message d'intro au hasard
    const intros = NATURAL_TEMPLATES.FIRST_CONTACT[language];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    
    // Initialiser la conversation
    this.conversations.set(username, {
      stage: 'intro',
      language,
      history: [intro.id],
      lastInteraction: new Date()
    });
    
    return {
      message: Mustache.render(intro.text, { username }),
      templateId: intro.id,
      stage: 'intro',
      preEngagement: true // Indique qu'il faut liker 2 posts avant
    };
  }

  getNextMessage(username, userResponse, options = {}) {
    const convo = this.conversations.get(username);
    if (!convo) return this.startConversation(username, options);
    
    // Analyser la réponse pour déterminer le prochain message
    const sentiment = this.analyzeSentiment(userResponse);
    let nextTemplate;
    
    switch(convo.stage) {
      case 'intro':
        if (sentiment.positive) {
          nextTemplate = this.selectTemplate(NATURAL_TEMPLATES.NATURAL_FOLLOWUP[convo.language]);
          convo.stage = 'followup';
        } else if (sentiment.question) {
          return this.handleQuestion(userResponse, convo);
        } else {
          return null; // Pas de réponse si sentiment négatif
        }
        break;
        
      case 'followup':
        if (sentiment.interested) {
          nextTemplate = this.selectTemplate(NATURAL_TEMPLATES.SOFT_BETA_INTRO[convo.language]);
          convo.stage = 'beta_intro';
        }
        break;
        
      case 'beta_intro':
        if (sentiment.interested || sentiment.curious) {
          nextTemplate = this.selectTemplate(NATURAL_TEMPLATES.PERSONAL_STORY[convo.language]);
          convo.stage = 'story';
        } else if (sentiment.question) {
          return this.handleQuestion(userResponse, convo);
        }
        break;
        
      case 'story':
        if (sentiment.interested) {
          nextTemplate = this.selectTemplate(NATURAL_TEMPLATES.CLOSING[convo.language]);
          convo.stage = 'closing';
        }
        break;
    }
    
    if (!nextTemplate) return null;
    
    convo.history.push(nextTemplate.id);
    convo.lastInteraction = new Date();
    
    return {
      message: Mustache.render(nextTemplate.text, { 
        username,
        betaLink: options.betaLink || 'https://ofm-beta.com/join'
      }),
      templateId: nextTemplate.id,
      stage: convo.stage
    };
  }

  analyzeSentiment(text) {
    const lower = text.toLowerCase();
    return {
      positive: /yes|yeah|sure|ok|love|great|awesome|interested|tell me|sounds good/i.test(lower),
      negative: /no|not interested|stop|leave|spam/i.test(lower),
      question: /\?|how|what|when|where|why|cost|price|safe|work/i.test(lower),
      interested: /interested|curious|tell me more|link|sign up|join/i.test(lower),
      curious: /how does|what is|can you explain/i.test(lower)
    };
  }

  handleQuestion(question, convo) {
    const lower = question.toLowerCase();
    let answer;
    
    if (/cost|price|pay|free/i.test(lower)) {
      answer = NATURAL_TEMPLATES.ANSWER_QUESTIONS.cost[0];
    } else if (/how.*work|what.*do/i.test(lower)) {
      answer = NATURAL_TEMPLATES.ANSWER_QUESTIONS.how_it_works[0];
    } else if (/safe|secure|privacy/i.test(lower)) {
      answer = NATURAL_TEMPLATES.ANSWER_QUESTIONS.is_it_safe[0];
    } else if (/interested|want|join/i.test(lower)) {
      answer = NATURAL_TEMPLATES.ANSWER_QUESTIONS.interested[0];
    }
    
    if (answer) {
      return {
        message: answer,
        templateId: 'answer_question',
        stage: convo.stage
      };
    }
    
    return null;
  }

  selectTemplate(templates) {
    if (!templates || templates.length === 0) return null;
    return templates[Math.floor(Math.random() * templates.length)];
  }

  getConversationStage(username) {
    const convo = this.conversations.get(username);
    return convo ? convo.stage : null;
  }

  shouldContinueConversation(username) {
    const convo = this.conversations.get(username);
    if (!convo) return true;
    
    // Ne pas continuer si on est au stage closing
    if (convo.stage === 'closing') return false;
    
    // Ne pas continuer si la dernière interaction date de plus de 24h
    const hoursSinceLastInteraction = (Date.now() - convo.lastInteraction) / (1000 * 60 * 60);
    if (hoursSinceLastInteraction > 24) return false;
    
    return true;
  }
}