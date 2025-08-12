/**
 * Instagram Apify Scraper - Plan C Alternative
 * Utilise l'infrastructure Apify pour scraping Instagram professionnel
 */

import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

/**
 * Apify Instagram Profile Scraper
 * Alternative au scraping manuel avec infrastructure Apify
 */
export class ApifyInstagramScraper {
  constructor(options = {}) {
    this.options = {
      maxRequestsPerCrawl: 100,
      maxConcurrency: 1, // Instagram rate limiting
      requestHandlerTimeoutSecs: 60,
      ...options
    };
  }

  /**
   * Initialize Apify actor
   */
  async initialize() {
    await Actor.init();
    console.log('🕷️ Apify Instagram Scraper initialized');
  }

  /**
   * Scrape Instagram profile information
   * Utilise les patterns Apify pour éviter détection
   */
  async scrapeProfile(username) {
    const crawler = new PuppeteerCrawler({
      launchContext: {
        launchOptions: {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
          ]
        }
      },
      maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
      maxConcurrency: this.options.maxConcurrency,
      requestHandlerTimeoutSecs: this.options.requestHandlerTimeoutSecs,

      async requestHandler({ page, request }) {
        console.log(`🔍 Scraping profile: ${username}`);
        
        // Navigate to Instagram profile
        await page.goto(`https://www.instagram.com/${username}/`, {
          waitUntil: 'networkidle2'
        });

        // Wait for profile data to load
        await page.waitForSelector('article', { timeout: 10000 });

        // Extract profile information
        const profileData = await page.evaluate(() => {
          const getTextContent = (selector) => {
            const element = document.querySelector(selector);
            return element ? element.textContent.trim() : null;
          };

          const getMetaContent = (property) => {
            const meta = document.querySelector(`meta[property="${property}"]`);
            return meta ? meta.getAttribute('content') : null;
          };

          return {
            username: window.location.pathname.split('/')[1],
            displayName: getTextContent('h2'),
            bio: getTextContent('article div span'),
            profilePicUrl: getMetaContent('og:image'),
            isPrivate: !!document.querySelector('[data-testid="private-account-icon"]'),
            followerCount: getTextContent('a[href*="/followers/"] span'),
            followingCount: getTextContent('a[href*="/following/"] span'),
            postCount: getTextContent('article header div span'),
            isVerified: !!document.querySelector('[data-testid="verified-icon"]'),
            url: window.location.href
          };
        });

        // Store results
        await Actor.pushData({
          ...profileData,
          scrapedAt: new Date().toISOString(),
          source: 'apify-instagram-scraper'
        });

        console.log('✅ Profile data extracted:', profileData.username);
      },

      failedRequestHandler({ request, error }) {
        console.error(`❌ Failed to scrape ${request.url}:`, error.message);
      }
    });

    // Add request to crawler
    await crawler.addRequests([{
      url: `https://www.instagram.com/${username}/`,
      userData: { username }
    }]);

    // Run crawler
    await crawler.run();
  }

  /**
   * Find Instagram users by hashtag
   * Utilise Apify pour scraper les posts par hashtag
   */
  async findUsersByHashtag(hashtag, limit = 50) {
    const crawler = new PuppeteerCrawler({
      launchContext: {
        launchOptions: {
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      },
      maxRequestsPerCrawl: Math.min(limit, 100),
      maxConcurrency: 1,

      async requestHandler({ page, request }) {
        console.log(`🔍 Scraping hashtag: #${hashtag}`);
        
        await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, {
          waitUntil: 'networkidle2'
        });

        // Wait for posts to load
        await page.waitForSelector('article a', { timeout: 10000 });

        // Extract usernames from posts
        const usernames = await page.evaluate((limit) => {
          const posts = Array.from(document.querySelectorAll('article a'));
          const users = new Set();
          
          posts.slice(0, limit).forEach(post => {
            const href = post.getAttribute('href');
            if (href && href.includes('/p/')) {
              // Extract username from post URL structure
              const img = post.querySelector('img');
              if (img && img.alt) {
                const match = img.alt.match(/Photo by (.+?) on/);
                if (match) {
                  users.add(match[1]);
                }
              }
            }
          });

          return Array.from(users);
        }, limit);

        // Store results
        await Actor.pushData({
          hashtag,
          usernames,
          count: usernames.length,
          scrapedAt: new Date().toISOString(),
          source: 'apify-hashtag-scraper'
        });

        console.log(`✅ Found ${usernames.length} users for #${hashtag}`);
      },

      failedRequestHandler({ request, error }) {
        console.error(`❌ Failed to scrape hashtag ${hashtag}:`, error.message);
      }
    });

    await crawler.addRequests([{
      url: `https://www.instagram.com/explore/tags/${hashtag}/`,
      userData: { hashtag, limit }
    }]);

    await crawler.run();
  }

  /**
   * Get scraped data from Apify dataset
   */
  async getScrapedData() {
    const dataset = await Actor.openDataset();
    const data = await dataset.getData();
    return data.items;
  }

  /**
   * Clean up Apify resources
   */
  async cleanup() {
    await Actor.exit();
    console.log('🧹 Apify scraper cleaned up');
  }
}

/**
 * Apify Instagram DM Integration
 * Combine scraping avec DM automation
 */
export class ApifyDMIntegration {
  constructor(scraper, dmAutomation) {
    this.scraper = scraper;
    this.dmAutomation = dmAutomation;
  }

  /**
   * Scrape users and send DMs
   * Workflow complet : scrape → filter → DM
   */
  async scrapeAndMessage(hashtag, message, options = {}) {
    const settings = {
      maxUsers: 20,
      filterPrivate: true,
      filterVerified: false,
      ...options
    };

    console.log(`🚀 Starting scrape & DM workflow for #${hashtag}`);

    // Step 1: Scrape users from hashtag
    await this.scraper.findUsersByHashtag(hashtag, settings.maxUsers * 2);
    
    const hashtagData = await this.scraper.getScrapedData();
    const usernames = hashtagData
      .filter(item => item.hashtag === hashtag)
      .flatMap(item => item.usernames)
      .slice(0, settings.maxUsers);

    console.log(`📋 Found ${usernames.length} potential users`);

    // Step 2: Get detailed profile info for filtering
    const validUsers = [];
    for (const username of usernames) {
      try {
        await this.scraper.scrapeProfile(username);
        const profileData = await this.scraper.getScrapedData();
        const profile = profileData.find(p => p.username === username);
        
        if (profile) {
          // Apply filters
          if (settings.filterPrivate && profile.isPrivate) continue;
          if (settings.filterVerified && profile.isVerified) continue;
          
          validUsers.push(username);
        }
      } catch (error) {
        console.warn(`⚠️ Could not scrape profile ${username}:`, error.message);
      }
      
      // Rate limiting between profile scrapes
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
    }

    console.log(`✅ Filtered to ${validUsers.length} valid users`);

    // Step 3: Send DMs using UI automation
    const dmResults = [];
    for (const username of validUsers) {
      try {
        const result = await this.dmAutomation.sendDM(username, message);
        dmResults.push({ username, ...result });
        
        console.log(`📤 DM sent to ${username}: ${result.success ? '✅' : '❌'}`);
        
        // Rate limiting between DMs (respect Instagram limits)
        await new Promise(resolve => setTimeout(resolve, 8000 + Math.random() * 12000));
        
      } catch (error) {
        console.error(`❌ Failed to send DM to ${username}:`, error.message);
        dmResults.push({ username, success: false, error: error.message });
      }
    }

    // Summary
    const successCount = dmResults.filter(r => r.success).length;
    const successRate = Math.round((successCount / dmResults.length) * 100);

    console.log(`📊 Workflow complete: ${successCount}/${dmResults.length} DMs sent (${successRate}%)`);

    return {
      hashtag,
      totalScraped: usernames.length,
      validUsers: validUsers.length,
      dmResults,
      successRate,
      summary: {
        sent: successCount,
        failed: dmResults.length - successCount,
        total: dmResults.length
      }
    };
  }
}

// Usage example
export async function runApifyInstagramScraper() {
  const scraper = new ApifyInstagramScraper();
  
  try {
    await scraper.initialize();
    
    // Example: Scrape specific profile
    await scraper.scrapeProfile('instagram');
    
    // Example: Find users by hashtag
    await scraper.findUsersByHashtag('webdev', 10);
    
    // Get results
    const data = await scraper.getScrapedData();
    console.log('📊 Scraped data:', data);
    
  } catch (error) {
    console.error('❌ Apify scraper error:', error);
  } finally {
    await scraper.cleanup();
  }
}

console.log('🕷️ Apify Instagram Scraper module loaded');