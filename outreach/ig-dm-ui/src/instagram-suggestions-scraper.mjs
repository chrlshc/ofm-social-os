import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { InstagramSessionManager } from './session-manager.mjs';

puppeteer.use(StealthPlugin());

/**
 * Advanced Instagram suggestions scraper using graph traversal
 */
export class InstagramSuggestionsScraper {
  constructor(options = {}) {
    this.sessionManager = new InstagramSessionManager();
    this.exploredProfiles = new Set();
    this.options = {
      maxDepth: options.maxDepth || 2,
      suggestionsPerProfile: options.suggestionsPerProfile || 30,
      pauseBetweenActions: options.pauseBetweenActions || { min: 2000, max: 5000 },
      headless: options.headless !== false,
      ...options
    };
  }

  /**
   * Get suggested profiles from a seed account
   */
  async getSuggestedProfiles(seedUsername, accountSession) {
    if (this.exploredProfiles.has(seedUsername)) {
      console.log(`Already explored @${seedUsername}, skipping...`);
      return [];
    }

    console.log(`🔍 Getting suggestions from @${seedUsername}...`);
    
    const browser = await puppeteer.launch({
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Load session if available
      if (accountSession) {
        await this.loadSession(page, accountSession);
      }

      // Navigate to profile
      await page.goto(`https://www.instagram.com/${seedUsername}/`, {
        waitUntil: 'networkidle2'
      });

      // Wait for profile to load
      await this.randomPause();

      // Click on followers to trigger suggestions
      const followersSelector = 'a[href*="/followers/"]';
      await page.waitForSelector(followersSelector, { timeout: 10000 });
      await page.click(followersSelector);

      await this.randomPause();

      // Extract suggested profiles
      const suggestions = await this.extractSuggestions(page);
      
      this.exploredProfiles.add(seedUsername);
      
      console.log(`✅ Found ${suggestions.length} suggestions from @${seedUsername}`);
      
      return suggestions;

    } catch (error) {
      console.error(`Error getting suggestions from @${seedUsername}:`, error.message);
      return [];
    } finally {
      await browser.close();
    }
  }

  /**
   * Extract suggestions from the modal
   */
  async extractSuggestions(page) {
    const suggestions = [];

    try {
      // Wait for suggestions section
      await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
      
      // Scroll to load more suggestions
      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrolls = 5;

      while (scrollAttempts < maxScrolls) {
        // Extract current visible suggestions
        const newSuggestions = await page.evaluate(() => {
          const profiles = [];
          
          // Look for "Suggested for you" section
          const suggestedSection = Array.from(document.querySelectorAll('div'))
            .find(div => div.textContent === 'Suggested for you');
          
          if (suggestedSection) {
            const container = suggestedSection.closest('div').parentElement;
            const profileElements = container.querySelectorAll('a[href^="/"][href$="/"]');
            
            profileElements.forEach(elem => {
              const username = elem.getAttribute('href').replace(/\//g, '');
              const nameElem = elem.querySelector('span');
              const imgElem = elem.querySelector('img');
              
              if (username && username !== 'explore' && username !== 'reels') {
                profiles.push({
                  username,
                  name: nameElem ? nameElem.textContent : '',
                  profilePic: imgElem ? imgElem.src : '',
                  timestamp: new Date().toISOString()
                });
              }
            });
          }
          
          return profiles;
        });

        // Add new suggestions
        newSuggestions.forEach(profile => {
          if (!suggestions.find(s => s.username === profile.username)) {
            suggestions.push(profile);
          }
        });

        // Scroll the modal
        const scrolled = await page.evaluate(() => {
          const modal = document.querySelector('div[role="dialog"] div[style*="overflow"]');
          if (modal) {
            const before = modal.scrollHeight;
            modal.scrollTop = modal.scrollHeight;
            return modal.scrollHeight > before;
          }
          return false;
        });

        if (!scrolled || suggestions.length >= this.options.suggestionsPerProfile) {
          break;
        }

        await this.randomPause(1000, 2000);
        scrollAttempts++;
      }

    } catch (error) {
      console.error('Error extracting suggestions:', error.message);
    }

    return suggestions.slice(0, this.options.suggestionsPerProfile);
  }

  /**
   * Crawl suggestions with depth (graph traversal)
   */
  async crawlSuggestionsGraph(seedUsernames, depth = 1) {
    const allProfiles = new Map();
    const queue = seedUsernames.map(u => ({ username: u, level: 0 }));
    
    while (queue.length > 0) {
      const { username, level } = queue.shift();
      
      if (level >= depth) continue;
      if (allProfiles.has(username)) continue;
      
      console.log(`\n📊 Level ${level + 1}/${depth} - Processing @${username}`);
      
      const suggestions = await this.getSuggestedProfiles(username);
      
      // Add to results
      suggestions.forEach(profile => {
        if (!allProfiles.has(profile.username)) {
          allProfiles.set(profile.username, {
            ...profile,
            discoveryPath: [username],
            level: level + 1
          });
          
          // Add to queue for next level
          if (level + 1 < depth) {
            queue.push({ username: profile.username, level: level + 1 });
          }
        }
      });
      
      // Pause between profiles
      await this.randomPause(5000, 10000);
    }
    
    return Array.from(allProfiles.values());
  }

  /**
   * Analyze profile for OF indicators
   */
  async analyzeProfileForOF(profile) {
    const browser = await puppeteer.launch({
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.goto(`https://www.instagram.com/${profile.username}/`, {
        waitUntil: 'networkidle2'
      });

      await this.randomPause();

      const analysis = await page.evaluate(() => {
        const data = {};
        
        // Get bio
        const bioElement = document.querySelector('div[data-testid="user-bio"]');
        data.bio = bioElement ? bioElement.textContent : '';
        
        // Get external link
        const linkElement = document.querySelector('a[href*="linktr.ee"], a[href*="beacons.ai"], a[href*="onlyfans.com"]');
        data.hasExternalLink = !!linkElement;
        data.externalLink = linkElement ? linkElement.href : '';
        
        // Get follower count
        const followersElement = Array.from(document.querySelectorAll('span'))
          .find(span => span.textContent.includes('followers'));
        data.followers = followersElement ? followersElement.textContent : '';
        
        // Get post count
        const postsElement = Array.from(document.querySelectorAll('span'))
          .find(span => span.textContent.includes('posts'));
        data.posts = postsElement ? postsElement.textContent : '';
        
        return data;
      });

      // Score the profile
      let ofScore = 0;
      
      // Bio indicators
      const ofKeywords = /onlyfans|of|exclusive|content|creator|link in bio|dm for|promo|collab/i;
      if (ofKeywords.test(analysis.bio)) ofScore += 3;
      
      // External link
      if (analysis.hasExternalLink) ofScore += 2;
      if (/onlyfans|fansly|fanvue/i.test(analysis.externalLink)) ofScore += 5;
      
      // Emoji indicators
      const ofEmojis = /🔥|💦|🍑|😈|💋|🔞|⬇️|👇/;
      if (ofEmojis.test(analysis.bio)) ofScore += 1;

      return {
        ...profile,
        ...analysis,
        ofScore,
        hasOF: ofScore >= 5,
        analyzed: true,
        analyzedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error analyzing @${profile.username}:`, error.message);
      return { ...profile, analyzed: false, error: error.message };
    } finally {
      await browser.close();
    }
  }

  /**
   * Load session cookies
   */
  async loadSession(page, session) {
    if (session.cookies && session.cookies.length > 0) {
      await page.setCookie(...session.cookies);
    }
  }

  /**
   * Random pause between actions
   */
  async randomPause(min = null, max = null) {
    const minPause = min || this.options.pauseBetweenActions.min;
    const maxPause = max || this.options.pauseBetweenActions.max;
    const pause = Math.floor(Math.random() * (maxPause - minPause + 1)) + minPause;
    await new Promise(resolve => setTimeout(resolve, pause));
  }

  /**
   * Smart crawl with analysis
   */
  async smartCrawl(seedUsernames, options = {}) {
    const { depth = 2, analyzeProfiles = true } = options;
    
    console.log(`🚀 Starting smart crawl with ${seedUsernames.length} seeds, depth ${depth}`);
    
    // Phase 1: Graph traversal
    const profiles = await this.crawlSuggestionsGraph(seedUsernames, depth);
    console.log(`\n📊 Found ${profiles.length} total profiles`);
    
    // Phase 2: Analyze profiles for OF
    if (analyzeProfiles) {
      console.log('\n🔍 Analyzing profiles for OF indicators...');
      
      const analyzed = [];
      for (const profile of profiles) {
        const result = await this.analyzeProfileForOF(profile);
        analyzed.push(result);
        
        if (result.hasOF) {
          console.log(`✅ @${result.username} - OF Score: ${result.ofScore}/10`);
        }
        
        // Pause between analyses
        await this.randomPause(3000, 5000);
      }
      
      // Sort by OF score
      analyzed.sort((a, b) => (b.ofScore || 0) - (a.ofScore || 0));
      
      const withOF = analyzed.filter(p => p.hasOF);
      console.log(`\n✨ Found ${withOF.length} profiles likely to have OF`);
      
      return analyzed;
    }
    
    return profiles;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new InstagramSuggestionsScraper({ headless: false });
  
  // Example usage
  const seeds = ['fashionnova', 'prettylittlething', 'sheinofficial'];
  
  scraper.smartCrawl(seeds, { depth: 2, analyzeProfiles: true })
    .then(results => {
      console.log('\n📋 Top OF Profiles Found:');
      results.slice(0, 20).forEach((profile, i) => {
        if (profile.hasOF) {
          console.log(`${i + 1}. @${profile.username} - Score: ${profile.ofScore}/10`);
        }
      });
    })
    .catch(console.error);
}