#!/usr/bin/env node
/**
 * SaaS Closer 2.0 - Reply Classification System
 * Classifie les réponses pour routing vers templates appropriés
 */

import { readFileSync } from 'fs';

class SaasCloserClassifier {
  constructor() {
    // Charger la state machine
    this.stateMachine = JSON.parse(readFileSync('./saas-closer-state-machine.json', 'utf8'));
    this.patterns = this.stateMachine.classification.patterns;
    
    // Language detection patterns
    this.languagePatterns = {
      'fr': [
        'bonjour', 'salut', 'merci', 'oui', 'non', 'comment', 'combien',
        'français', 'prix', 'coût', 'gratuit', 'essai', 'sécurisé'
      ],
      'es': [
        'hola', 'gracias', 'sí', 'no', 'cómo', 'cuánto', 'precio', 
        'gratis', 'seguro', 'español'
      ],
      'de': [
        'hallo', 'danke', 'ja', 'nein', 'wie', 'preis', 'kostenlos',
        'deutsch', 'sicher'
      ],
      'en': [
        'hello', 'hi', 'thanks', 'yes', 'no', 'how', 'price', 'free',
        'safe', 'english'
      ]
    };

    // Objection patterns
    this.objectionPatterns = {
      'price_concern': ['expensive', 'cost', 'afford', 'budget', 'cheap'],
      'time_concern': ['busy', 'no time', 'later', 'schedule'],
      'trust_concern': ['scam', 'fake', 'legitimate', 'real', 'trust'],
      'technical_concern': ['complicated', 'difficult', 'easy', 'simple'],
      'competition': ['already have', 'using', 'other tool', 'competitor']
    };

    // Trust signal patterns
    this.trustSignalPatterns = {
      'positive': ['looks good', 'professional', 'legitimate', 'real'],
      'questioning': ['is this real', 'legitimate', 'scam', 'fake'],
      'experienced': ['tried before', 'know about', 'familiar with']
    };
  }

  /**
   * Classification principale d'une réponse
   */
  classifyReply(message, context = {}) {
    const normalizedMessage = message.toLowerCase().trim();
    
    const classification = {
      intent: this.classifyIntent(normalizedMessage),
      language: this.detectLanguage(normalizedMessage),
      objections: this.extractObjections(normalizedMessage),
      trustSignals: this.extractTrustSignals(normalizedMessage),
      sentiment: this.analyzeSentiment(normalizedMessage),
      confidence: 0,
      context
    };

    // Calculer confidence score
    classification.confidence = this.calculateConfidence(normalizedMessage, classification);

    return classification;
  }

  /**
   * Classification d'intent principale
   */
  classifyIntent(message) {
    const scores = {};

    // Score chaque classe d'intent
    for (const [intentClass, patterns] of Object.entries(this.patterns)) {
      scores[intentClass] = 0;
      
      for (const pattern of patterns) {
        if (message.includes(pattern.toLowerCase())) {
          scores[intentClass] += 1;
          
          // Bonus pour matches exacts
          if (message === pattern.toLowerCase()) {
            scores[intentClass] += 2;
          }
          
          // Bonus pour début de message
          if (message.startsWith(pattern.toLowerCase())) {
            scores[intentClass] += 0.5;
          }
        }
      }
    }

    // Retourner l'intent avec le plus haut score
    const topIntent = Object.entries(scores)
      .sort(([,a], [,b]) => b - a)[0];

    return {
      class: topIntent[0],
      score: topIntent[1],
      allScores: scores
    };
  }

  /**
   * Détection de langue
   */
  detectLanguage(message) {
    const scores = {};

    for (const [lang, patterns] of Object.entries(this.languagePatterns)) {
      scores[lang] = 0;
      
      for (const pattern of patterns) {
        if (message.includes(pattern)) {
          scores[lang] += 1;
        }
      }
    }

    // Défaut à anglais si pas de match clair
    const detectedLang = Object.entries(scores)
      .sort(([,a], [,b]) => b - a)[0];

    return {
      language: detectedLang[1] > 0 ? detectedLang[0] : 'en',
      confidence: detectedLang[1],
      allScores: scores
    };
  }

  /**
   * Extraction des objections
   */
  extractObjections(message) {
    const objections = [];

    for (const [objType, patterns] of Object.entries(this.objectionPatterns)) {
      for (const pattern of patterns) {
        if (message.includes(pattern)) {
          objections.push({
            type: objType,
            trigger: pattern,
            position: message.indexOf(pattern)
          });
        }
      }
    }

    return objections;
  }

  /**
   * Extraction des signaux de confiance
   */
  extractTrustSignals(message) {
    const signals = [];

    for (const [signalType, patterns] of Object.entries(this.trustSignalPatterns)) {
      for (const pattern of patterns) {
        if (message.includes(pattern)) {
          signals.push({
            type: signalType,
            trigger: pattern,
            weight: signalType === 'positive' ? 1 : signalType === 'questioning' ? -0.5 : 0
          });
        }
      }
    }

    return signals;
  }

  /**
   * Analyse de sentiment simple
   */
  analyzeSentiment(message) {
    const positiveWords = [
      'good', 'great', 'awesome', 'perfect', 'love', 'like', 'yes',
      'interested', 'amazing', 'cool', 'nice', 'sounds good'
    ];
    
    const negativeWords = [
      'bad', 'terrible', 'hate', 'no', 'not', 'never', 'stop',
      'spam', 'annoying', 'boring', 'stupid', 'waste'
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    for (const word of positiveWords) {
      if (message.includes(word)) positiveScore += 1;
    }

    for (const word of negativeWords) {
      if (message.includes(word)) negativeScore += 1;
    }

    let sentiment = 'neutral';
    if (positiveScore > negativeScore + 1) sentiment = 'positive';
    else if (negativeScore > positiveScore + 1) sentiment = 'negative';

    return {
      sentiment,
      positiveScore,
      negativeScore,
      netScore: positiveScore - negativeScore
    };
  }

  /**
   * Calcul du score de confiance
   */
  calculateConfidence(message, classification) {
    let confidence = 0;

    // Base confidence from intent score
    confidence += Math.min(classification.intent.score * 0.3, 0.6);

    // Language detection confidence
    confidence += classification.language.confidence * 0.1;

    // Length bonus (longer messages usually more confident)
    const lengthBonus = Math.min(message.split(' ').length * 0.05, 0.2);
    confidence += lengthBonus;

    // Sentiment clarity bonus
    const sentimentClarity = Math.abs(classification.sentiment.netScore) * 0.05;
    confidence += sentimentClarity;

    return Math.min(confidence, 1.0);
  }

  /**
   * Router vers le bon template basé sur classification
   */
  routeToTemplate(classification) {
    const { intent, language, objections, sentiment } = classification;

    // Route basée sur l'intent principal
    let templateId = this.getTemplateForIntent(intent.class);

    // Ajustements basés sur langue
    if (language.language !== 'en') {
      templateId += `_${language.language.toUpperCase()}`;
    }

    // Ajustements basés sur objections
    if (objections.length > 0) {
      const primaryObjection = objections[0].type;
      templateId += `_${primaryObjection.toUpperCase()}`;
    }

    return {
      templateId,
      nextState: this.getNextState(intent.class),
      personalization: {
        language: language.language,
        sentiment: sentiment.sentiment,
        objections: objections.map(o => o.type),
        confidence: classification.confidence
      }
    };
  }

  /**
   * Mapping intent → template
   */
  getTemplateForIntent(intentClass) {
    const mapping = {
      'Interested_SaaS': 'R1_VALUE_PROP',
      'Pricing_SaaS': 'PRICING_RESPONSE',
      'Trust_Compliance': 'TRUST_RESPONSE', 
      'Migration_Agency': 'MIGRATION_RESPONSE',
      'Neutral': 'VALUE_NUDGE',
      'Negative': 'SOFT_EXIT',
      'Language_Barrier': 'LANGUAGE_ADAPT'
    };

    return mapping[intentClass] || 'VALUE_NUDGE';
  }

  /**
   * Mapping intent → next state
   */
  getNextState(intentClass) {
    const mapping = {
      'Interested_SaaS': 'CLOSE_R1',
      'Pricing_SaaS': 'CLOSE_PRICING',
      'Trust_Compliance': 'CLOSE_TRUST',
      'Migration_Agency': 'CLOSE_MIGRATION',
      'Neutral': 'NUDGE_VALUE', 
      'Negative': 'SOFT_EXIT',
      'Language_Barrier': 'LANGUAGE_ADAPT'
    };

    return mapping[intentClass] || 'NUDGE_VALUE';
  }

  /**
   * Test batch de messages
   */
  testClassification(testMessages) {
    console.log('🧪 Test Classification SaaS Closer\n');
    
    for (const [message, expectedIntent] of testMessages) {
      const classification = this.classifyReply(message);
      const routing = this.routeToTemplate(classification);
      
      const correct = classification.intent.class === expectedIntent ? '✅' : '❌';
      
      console.log(`${correct} "${message}"`);
      console.log(`   Intent: ${classification.intent.class} (${classification.confidence.toFixed(2)})`);
      console.log(`   Language: ${classification.language.language}`);
      console.log(`   Template: ${routing.templateId}`);
      console.log(`   Objections: ${classification.objections.map(o => o.type).join(', ')}`);
      console.log('');
    }
  }
}

// Test messages
const testMessages = [
  ['sounds good, where do I start?', 'Interested_SaaS'],
  ['how much does it cost?', 'Pricing_SaaS'],
  ['is this allowed by onlyfans?', 'Trust_Compliance'],
  ['I already have an agency', 'Migration_Agency'],
  ['hi thanks', 'Neutral'],
  ['not interested spam', 'Negative'],
  ['combien ça coûte?', 'Pricing_SaaS'],
  ['tell me more about the beta', 'Interested_SaaS'],
  ['is my data safe?', 'Trust_Compliance'],
  ['sounds cool but expensive', 'Pricing_SaaS']
];

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const classifier = new SaasCloserClassifier();
  
  if (process.argv[2] === 'test') {
    classifier.testClassification(testMessages);
  } else if (process.argv[2]) {
    const message = process.argv.slice(2).join(' ');
    const result = classifier.classifyReply(message);
    const routing = classifier.routeToTemplate(result);
    
    console.log('Classification:', JSON.stringify(result, null, 2));
    console.log('Routing:', JSON.stringify(routing, null, 2));
  } else {
    console.log('Usage:');
    console.log('  node saas-closer-classifier.mjs test');
    console.log('  node saas-closer-classifier.mjs "your message here"');
  }
}

export { SaasCloserClassifier };