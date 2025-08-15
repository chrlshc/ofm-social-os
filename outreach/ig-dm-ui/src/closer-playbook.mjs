/**
 * AI-powered playbook generator for closers
 * Generates contextual 3-step plans based on prospect response
 */

export async function closerPlan({ 
  username, 
  intent, 
  sentiment, 
  tz, 
  latencySec, 
  lastMsg 
} = {}) {
  const base = {
    steps: [
      `Acknowledge their response`,
      `Share specific value for their situation`,
      `Propose next step (call/demo/trial)`
    ],
    hint: baselineHint(intent, sentiment)
  };
  
  try {
    // Try AI generation if available
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
      const aiPlan = await generateAIPlan({
        username,
        intent,
        sentiment,
        tz,
        latencySec,
        lastMsg
      });
      
      if (aiPlan?.steps?.length) {
        return aiPlan;
      }
    }
  } catch (e) {
    console.warn('AI playbook generation failed:', e.message);
  }
  
  // Fallback to rule-based playbook
  return generateRuleBasedPlan({ intent, sentiment, tz, latencySec });
}

function baselineHint(intent, sentiment) {
  const i = (intent || '').toLowerCase();
  const s = (sentiment || '').toLowerCase();
  
  if (i.includes('pricing')) {
    return 'Ask budget range; give ROI micro-example; propose async trial.';
  }
  if (i.includes('curious') || s.includes('positive')) {
    return 'Acknowledge interest; share 1-liner value; ask preferred contact method.';
  }
  if (s.includes('negative')) {
    return 'Thank them; park politely; offer to reconnect in future.';
  }
  return 'Probe with 1 question; avoid pitch; keep conversation light.';
}

function generateRuleBasedPlan({ intent, sentiment, tz, latencySec }) {
  const fastResponse = latencySec < 7200; // < 2 hours
  const timezone = tz || 'ET';
  
  const plans = {
    'curious:positive': {
      steps: [
        'Love your energy! Quick question - what type of content do you create?',
        'Share how similar creators increased earnings 3-5x in 60 days',
        `Offer 15-min call this week (${timezone} friendly times)`
      ],
      hint: 'High intent - move fast but stay authentic'
    },
    'pricing:neutral': {
      steps: [
        'Great question! Investment depends on your goals',
        'Most creators see ROI in 30-45 days (share quick example)',
        'Suggest quick DM chat to understand their specific needs'
      ],
      hint: 'Price curious - focus on value not cost'
    },
    'reject:negative': {
      steps: [
        'No worries at all! Appreciate your honesty',
        'If you change your mind, I\'m here',
        'Leave door open with light touch (no follow-up for 30+ days)'
      ],
      hint: 'Soft close - preserve relationship'
    }
  };
  
  const key = `${intent}:${sentiment}`.toLowerCase();
  return plans[key] || {
    steps: [
      fastResponse ? 'Thanks for the quick reply!' : 'Hey thanks for getting back!',
      'I help creators like you monetize better - mind if I ask what your main challenge is?',
      'Based on your answer, I can share some free tips or we can chat more'
    ],
    hint: 'Default approach - qualify gently'
  };
}

async function generateAIPlan({ username, intent, sentiment, tz, latencySec, lastMsg }) {
  // Placeholder for actual AI implementation
  // Would call OpenAI/Anthropic with structured prompt
  return null;
}

export function parseSteps(text = '') {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const steps = lines.filter(l => /^[-*•\d]/.test(l)).map(l => l.replace(/^[-*•\d]\s?\.?\s?/, ''));
  const hint = lines.find(l => /^hint:/i.test(l))?.replace(/^hint:\s?/i, '');
  return { steps, hint };
}