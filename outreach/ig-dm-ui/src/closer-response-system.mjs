/**
 * Système de réponses intelligentes pour closers
 * Basé sur notre vraie offre et capacités
 */
export class CloserResponseSystem {
  constructor() {
    this.responses = {
      // Question: "Tell me more about your agency"
      agency_info: {
        sequence: [
          {
            id: 'agency_1',
            message: "hey babe! 💕 so we're different from those big agencies that treat you like a number",
            delay: 0
          },
          {
            id: 'agency_2', 
            message: "what we ACTUALLY do that works:\n✓ find your ideal subs on IG/twitter (not spam, real targeting)\n✓ AI-powered DMs that convert (we send 1000s daily)\n✓ track EVERYTHING so we know what makes you money",
            delay: 3000
          },
          {
            id: 'agency_3',
            message: "basically we use data + automation to find guys who WANT to pay for your content 🎯\n\nwhat's your biggest challenge rn? getting subs or keeping them spending?",
            delay: 5000
          }
        ],
        performance: { sent: 0, replies: 0, positive: 0 }
      },

      // Question: "What did you have in mind?" (they have OF)
      existing_of: {
        sequence: [
          {
            id: 'existing_1',
            message: "omg perfect timing! 🙌 we just opened 3 spots for january",
            delay: 0
          },
          {
            id: 'existing_2',
            message: "so we use advanced automation to find & convert subs 24/7 - like imagine having 10 assistants working non-stop to promote you",
            delay: 2500
          },
          {
            id: 'existing_3',
            message: "our last girl went from $3k to $18k in 2 months using our system 📈\n\nquick q - what's your current monthly? helps me show you realistic projections!",
            delay: 4000
          }
        ],
        performance: { sent: 0, replies: 0, positive: 0 }
      },

      // Question: "How much can I make?"
      earnings_question: {
        sequence: [
          {
            id: 'earnings_1',
            message: "love that you're thinking big! 💰 real talk - it depends on a few things",
            delay: 0
          },
          {
            id: 'earnings_2',
            message: "if you're starting fresh: $2-5k month 1 is normal\nif you already have OF: we usually 3-5x it in 60 days",
            delay: 3000
          },
          {
            id: 'earnings_3',
            message: "BUT the girls who follow our content strategy + post daily hit $10k+ fast 🚀\n\nare you already on OF or thinking of starting?",
            delay: 4500
          }
        ],
        performance: { sent: 0, replies: 0, positive: 0 }
      },

      // Question: "What's your commission?"
      commission_question: {
        sequence: [
          {
            id: 'commission_1',
            message: "great question! we do 25% after OF's cut ✨",
            delay: 0
          },
          {
            id: 'commission_2',
            message: "sounds like a lot? here's the thing - we INVEST in your growth:\n💎 paid promo campaigns\n💎 professional tools ($500+/mo value)\n💎 dedicated growth team",
            delay: 3500
          },
          {
            id: 'commission_3',
            message: "most girls make 5x more with us, so you keep 75% of wayyy more money 📈\n\ncan I ask what you're making now? i'll show you exact numbers!",
            delay: 5000
          }
        ],
        performance: { sent: 0, replies: 0, positive: 0 }
      },

      // Follow-up sequences based on their response
      followup: {
        // If they mention low earnings
        low_earnings: {
          sequence: [
            {
              id: 'low_1',
              message: "ok that's actually perfect! means you have huge growth potential 🌟",
              delay: 0
            },
            {
              id: 'low_2',
              message: "girls starting under $1k are our BEST success stories bc the strategies work even better on fresh accounts",
              delay: 2500
            },
            {
              id: 'low_3',
              message: "wanna hop on a quick call? i can show you exactly how we'd grow your account - takes like 15 mins max 📱",
              delay: 4000
            }
          ]
        },

        // If they mention high earnings
        high_earnings: {
          sequence: [
            {
              id: 'high_1',
              message: "omg that's amazing! 🔥 you're already killing it",
              delay: 0
            },
            {
              id: 'high_2',
              message: "at your level, it's all about optimization - we've helped girls go from $10k → $30k+ by finding hidden revenue streams",
              delay: 3000
            },
            {
              id: 'high_3',
              message: "like PPV campaigns, custom requests, rebill optimization... stuff that adds $5-10k without more work\n\ninterested in seeing the full strategy? 👀",
              delay: 5000
            }
          ]
        },

        // If they're hesitant
        hesitant: {
          sequence: [
            {
              id: 'hesitant_1',
              message: "totally get it! it's a big decision 💕",
              delay: 0
            },
            {
              id: 'hesitant_2',
              message: "what if we started with a trial? 2 weeks, if you don't see major growth, we part ways no hard feelings",
              delay: 3000
            },
            {
              id: 'hesitant_3',
              message: "that way you can see our system working before committing long-term. fair? 🤝",
              delay: 4500
            }
          ]
        }
      }
    };

    // A/B test variations
    this.variations = {
      agency_info_v2: {
        sequence: [
          {
            id: 'agency_v2_1',
            message: "heyyy! so we're basically growth hackers for OF creators 🚀",
            delay: 0
          },
          {
            id: 'agency_v2_2',
            message: "we built AI that finds guys who LOVE your type of content & converts them into subs automatically",
            delay: 2500
          },
          {
            id: 'agency_v2_3',
            message: "like one girl just texted me she hit $24k this month (was at $4k in october!) 🤯\n\nwhat's your main goal with OF?",
            delay: 4500
          }
        ],
        performance: { sent: 0, replies: 0, positive: 0 }
      }
    };
  }

  /**
   * Get best performing response sequence
   */
  getBestResponse(questionType) {
    const mainResponse = this.responses[questionType];
    const variation = this.variations[`${questionType}_v2`];
    
    if (!mainResponse) return null;
    
    // If variation exists and performs better, use it
    if (variation && this.calculatePerformance(variation) > this.calculatePerformance(mainResponse)) {
      return variation;
    }
    
    return mainResponse;
  }

  /**
   * Calculate performance score
   */
  calculatePerformance(response) {
    const { sent, replies, positive } = response.performance;
    if (sent === 0) return 0;
    
    const replyRate = replies / sent;
    const positiveRate = positive / Math.max(replies, 1);
    
    return (replyRate * 0.5) + (positiveRate * 0.5);
  }

  /**
   * Track response performance
   */
  trackPerformance(responseId, event) {
    // Find response by ID and update metrics
    Object.values(this.responses).forEach(response => {
      if (response.sequence) {
        response.sequence.forEach(seq => {
          if (seq.id === responseId) {
            response.performance.sent++;
            if (event === 'reply') response.performance.replies++;
            if (event === 'positive') response.performance.positive++;
          }
        });
      }
    });
  }

  /**
   * Get response sequence for a specific question
   */
  getResponseSequence(questionType, context = {}) {
    const response = this.getBestResponse(questionType);
    if (!response) return null;
    
    // Personalize based on context
    return response.sequence.map(msg => ({
      ...msg,
      message: this.personalizeMessage(msg.message, context)
    }));
  }

  /**
   * Personalize message with context
   */
  personalizeMessage(message, context) {
    let personalized = message;
    
    if (context.name) {
      personalized = personalized.replace(/babe|girl|hun/g, context.name);
    }
    
    if (context.currentEarnings) {
      personalized = personalized.replace(
        /\$[\d,]+/g, 
        `$${parseInt(context.currentEarnings * 5).toLocaleString()}`
      );
    }
    
    return personalized;
  }

  /**
   * Get follow-up based on their response
   */
  getFollowUp(theirResponse) {
    const response = theirResponse.toLowerCase();
    
    // Detect intent
    if (response.includes('making') && response.includes('$')) {
      const amount = parseInt(response.match(/\$?([\d,]+)/)[1].replace(/,/g, ''));
      return amount < 5000 ? 'low_earnings' : 'high_earnings';
    }
    
    if (response.includes('not sure') || response.includes('think about')) {
      return 'hesitant';
    }
    
    return null;
  }
}

// Export for use
export default CloserResponseSystem;