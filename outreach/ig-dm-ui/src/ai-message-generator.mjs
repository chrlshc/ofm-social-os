import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import Mustache from 'mustache';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AI-powered message generator with dynamic templates and personalization
 */
export class AIMessageGenerator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.apiType = options.apiType || (process.env.OPENAI_API_KEY ? 'openai' : 'anthropic');
    this.templatesPath = options.templatesPath || path.join(__dirname, '../config/message_templates.json');
    this.templates = this.loadTemplates();
    this.messageHistory = new Map();
    this.performanceData = new Map();
  }

  loadTemplates() {
    try {
      if (fs.existsSync(this.templatesPath)) {
        return JSON.parse(fs.readFileSync(this.templatesPath, 'utf8'));
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
    
    // Default templates if file doesn't exist
    return this.createDefaultTemplates();
  }

  createDefaultTemplates() {
    const defaultTemplates = {
      greetings: [
        "hey {{name}}!",
        "hii {{name}}",
        "{{name}}!!",
        "heyyy",
        "hiii girl"
      ],
      
      compliments: {
        general: [
          "just saw your content and omg 😍",
          "your posts are fireee 🔥",
          "loving your vibe!",
          "your content is amazing!!",
          "obsessed with your feed"
        ],
        
        specific: {
          fitness: [
            "your workout posts are insane",
            "fitness goals fr 💪",
            "that gym content tho"
          ],
          fashion: [
            "your style is everything",
            "outfit goals always",
            "your fashion sense >>>"
          ],
          beauty: [
            "makeup on point always",
            "your beauty content 😍",
            "glowing literally"
          ],
          lifestyle: [
            "living your best life i see",
            "your lifestyle content >>>",
            "aesthetic is perfect"
          ]
        }
      },
      
      closings: [
        "you're killing it!!",
        "keep slaying 💕",
        "love your energy",
        "you're gorgeous!!",
        "stunning as always"
      ],
      
      emojis: {
        positive: ["😍", "🔥", "💕", "✨", "💗", "🥰", "💖"],
        excitement: ["!!", "!!!", "🔥🔥", "👀"],
        casual: ["haha", "lol", "fr", "tho"]
      },
      
      personalization: {
        location: {
          "miami": ["miami girls different", "305 vibes", "miami energy"],
          "nyc": ["ny girls >>", "nyc energy unmatched", "manhattan vibes"],
          "la": ["la girls winning", "west coast vibes", "cali girl energy"],
          "chicago": ["chi town represent", "midwest beauty", "chicago girls >>"],
          "atlanta": ["atl energy", "georgia peach", "atlanta girls different"]
        },
        
        recent_post: {
          "beach": ["beach pics are everything", "beach goddess fr", "ocean vibes"],
          "gym": ["gym pics go hard", "fitness queen", "workout motivation"],
          "food": ["foodie content >>", "making me hungry", "food goals"],
          "travel": ["travel content is elite", "wanderlust vibes", "travel goals"],
          "selfie": ["selfie game strong", "face card never declines", "gorgeous selfie"]
        }
      },
      
      variations: {
        time_based: {
          morning: ["good morning sunshine", "morning gorgeous", "early bird vibes"],
          afternoon: ["hey beautiful", "afternoon vibes", "hey hun"],
          evening: ["evening gorgeous", "night owl?", "hey babe"],
          night: ["night vibes", "late night energy", "still up?"]
        }
      }
    };
    
    // Save default templates
    const dir = path.dirname(this.templatesPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.templatesPath, JSON.stringify(defaultTemplates, null, 2));
    
    return defaultTemplates;
  }

  /**
   * Generate a personalized message using AI and templates
   */
  async generateMessage(target, options = {}) {
    const { useAI = true, forceFallback = false } = options;
    
    // If AI is disabled or forced fallback, use template-based generation
    if (!useAI || forceFallback || !this.apiKey) {
      return this.generateTemplateMessage(target);
    }
    
    try {
      // Try AI generation first
      const aiMessage = await this.generateAIMessage(target);
      
      // Validate AI output
      if (this.validateMessage(aiMessage)) {
        this.trackMessagePerformance(aiMessage, 'ai');
        return aiMessage;
      }
    } catch (error) {
      console.warn('AI generation failed, falling back to templates:', error.message);
    }
    
    // Fallback to template-based generation
    return this.generateTemplateMessage(target);
  }

  /**
   * Generate message using AI API
   */
  async generateAIMessage(target) {
    const prompt = this.buildAIPrompt(target);
    
    let response;
    if (this.apiType === 'openai') {
      response = await this.callOpenAI(prompt);
    } else if (this.apiType === 'anthropic') {
      response = await this.callAnthropic(prompt);
    } else {
      throw new Error('Unknown API type');
    }
    
    const message = response.trim();
    
    // Ensure message follows our guidelines
    if (!this.validateMessage(message)) {
      throw new Error('AI generated invalid message');
    }
    
    return message;
  }

  buildAIPrompt(target) {
    const { username, name, location, niche, recentPost, followers } = target;
    
    let context = `Generate a friendly, casual Instagram DM intro message for ${username || 'a creator'}.`;
    
    if (name && name !== username) {
      context += ` Their name is ${name}.`;
    }
    
    if (location) {
      context += ` They're from ${location}.`;
    }
    
    if (niche) {
      context += ` They create ${niche} content.`;
    }
    
    if (recentPost) {
      context += ` Their recent post was about ${recentPost}.`;
    }
    
    const guidelines = `
Guidelines:
- Keep it VERY short (under 80 characters)
- Be genuine and friendly, like one creator complimenting another
- Use casual language (lowercase, informal)
- Include 1-2 emojis maximum
- Compliment their content specifically if possible
- NO mention of any product, service, or business
- NO sales pitch or agenda
- Just a friendly compliment/greeting
- Sound like a real person, not a bot

Examples of good messages:
- "hey sarah! your fitness posts are insane 💪"
- "girl your content is fireee 🔥"
- "miami creators >> love your vibe!"

Generate ONE message:`;
    
    return context + guidelines;
  }

  async callOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a friendly female content creator sending casual DMs to other creators.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 50
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenAI API error');
    }
    
    return data.choices[0].message.content;
  }

  async callAnthropic(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 50,
        temperature: 0.9
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Anthropic API error');
    }
    
    return data.content[0].text;
  }

  /**
   * Generate message using templates (fallback)
   */
  generateTemplateMessage(target) {
    const { username, name, location, niche, recentPost } = target;
    const hour = new Date().getHours();
    
    // Select components
    let greeting = this.selectRandom(this.templates.greetings);
    if (name && name !== username) {
      greeting = greeting.replace('{{name}}', name);
    } else if (username) {
      greeting = greeting.replace('{{name}}', username);
    } else {
      greeting = this.selectRandom(['heyyy', 'hiii', 'hey girl']);
    }
    
    // Select compliment based on available info
    let compliment;
    if (niche && this.templates.compliments.specific[niche.toLowerCase()]) {
      compliment = this.selectRandom(this.templates.compliments.specific[niche.toLowerCase()]);
    } else {
      compliment = this.selectRandom(this.templates.compliments.general);
    }
    
    // Add location-based element if available
    let locationElement = '';
    if (location) {
      const cityKey = location.toLowerCase().split(' ')[0];
      if (this.templates.personalization.location[cityKey]) {
        locationElement = this.selectRandom(this.templates.personalization.location[cityKey]) + ' ';
      }
    }
    
    // Add recent post reference if available
    if (recentPost) {
      const postKeys = Object.keys(this.templates.personalization.recent_post);
      const matchingKey = postKeys.find(key => recentPost.toLowerCase().includes(key));
      if (matchingKey) {
        compliment = this.selectRandom(this.templates.personalization.recent_post[matchingKey]);
      }
    }
    
    // Select closing
    const closing = this.selectRandom(this.templates.closings);
    
    // Add emoji
    const emoji = this.selectRandom(this.templates.emojis.positive);
    
    // Combine components
    let message = `${greeting} ${locationElement}${compliment} ${emoji} ${closing}`;
    
    // Clean up extra spaces
    message = message.replace(/\s+/g, ' ').trim();
    
    // Ensure it's not too long
    if (message.length > 80) {
      // Shorter version
      message = `${greeting} ${compliment} ${emoji}`;
    }
    
    this.trackMessagePerformance(message, 'template');
    
    return message;
  }

  selectRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Validate message meets our criteria
   */
  validateMessage(message) {
    if (!message || typeof message !== 'string') return false;
    
    // Length check
    if (message.length > 100 || message.length < 10) return false;
    
    // No sales/business words
    const bannedWords = [
      'offer', 'sale', 'discount', 'buy', 'purchase', 'deal',
      'business', 'opportunity', 'invest', 'earn', 'money',
      'link', 'click', 'website', 'promo', 'code', 'beta',
      'platform', 'service', 'product'
    ];
    
    const lowerMessage = message.toLowerCase();
    if (bannedWords.some(word => lowerMessage.includes(word))) {
      return false;
    }
    
    // Must be friendly/casual
    if (!lowerMessage.match(/hey|hi|hello|love|amazing|gorgeous|beautiful|fire|slay/)) {
      return false;
    }
    
    return true;
  }

  /**
   * Track message performance for optimization
   */
  trackMessagePerformance(message, source) {
    const key = `${source}:${message.substring(0, 50)}`;
    
    if (!this.performanceData.has(key)) {
      this.performanceData.set(key, {
        message,
        source,
        sent: 0,
        replies: 0,
        replyRate: 0
      });
    }
    
    const data = this.performanceData.get(key);
    data.sent++;
  }

  /**
   * Update performance data when reply received
   */
  recordReply(message) {
    // Find matching performance entry
    for (const [key, data] of this.performanceData) {
      if (data.message === message || message.includes(data.message.substring(0, 30))) {
        data.replies++;
        data.replyRate = (data.replies / data.sent) * 100;
        break;
      }
    }
  }

  /**
   * Get best performing messages
   */
  getBestPerformingMessages(limit = 10) {
    const sorted = Array.from(this.performanceData.values())
      .filter(data => data.sent >= 5) // Minimum sample size
      .sort((a, b) => b.replyRate - a.replyRate);
    
    return sorted.slice(0, limit);
  }

  /**
   * Export message performance data
   */
  exportPerformanceData(outputPath) {
    const report = {
      generated: new Date().toISOString(),
      totalMessages: this.performanceData.size,
      messages: Array.from(this.performanceData.values())
        .sort((a, b) => b.sent - a.sent)
        .map(data => ({
          message: data.message,
          source: data.source,
          sent: data.sent,
          replies: data.replies,
          replyRate: data.replyRate.toFixed(1) + '%'
        }))
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`📊 Exported message performance to ${outputPath}`);
  }

  /**
   * Update templates based on performance
   */
  optimizeTemplates() {
    const bestMessages = this.getBestPerformingMessages(20);
    
    // Extract patterns from best performing messages
    const patterns = {
      greetings: new Set(),
      compliments: new Set(),
      emojis: new Set()
    };
    
    bestMessages.forEach(data => {
      const message = data.message.toLowerCase();
      
      // Extract greeting pattern
      const greetingMatch = message.match(/^(hey|hi|hello|hii|heyyy)[^!]*/);
      if (greetingMatch) {
        patterns.greetings.add(greetingMatch[0].trim());
      }
      
      // Extract emoji
      const emojiMatch = message.match(/[😍🔥💕✨💗🥰💖❤️👀]/g);
      if (emojiMatch) {
        emojiMatch.forEach(emoji => patterns.emojis.add(emoji));
      }
    });
    
    console.log('📈 Optimization insights:', {
      bestReplyRate: bestMessages[0]?.replyRate || 0,
      topGreetings: Array.from(patterns.greetings).slice(0, 5),
      topEmojis: Array.from(patterns.emojis).slice(0, 5)
    });
    
    // TODO: Automatically update templates based on patterns
  }
}