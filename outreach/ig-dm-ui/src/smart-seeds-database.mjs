import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Intelligent seeds management for Instagram profile discovery
 */
export class SmartSeedsDatabase {
  constructor(options = {}) {
    this.db = options.database || new DMTrackingDatabase();
    this.seedsFile = options.seedsFile || path.join(__dirname, '../data/smart-seeds.json');
    this.initialized = false;
  }

  /**
   * Initialize database tables
   */
  async initialize() {
    if (this.initialized) return;

    // Create tables if using PostgreSQL
    if (this.db) {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS smart_seeds (
          username VARCHAR(255) PRIMARY KEY,
          category VARCHAR(100),
          quality_score INT DEFAULT 10,
          leads_generated INT DEFAULT 0,
          conversion_rate FLOAT DEFAULT 0,
          last_crawled TIMESTAMPTZ,
          added_at TIMESTAMPTZ DEFAULT NOW(),
          metadata JSONB DEFAULT '{}',
          active BOOLEAN DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS discovered_profiles (
          username VARCHAR(255) PRIMARY KEY,
          source_seed VARCHAR(255) REFERENCES smart_seeds(username),
          discovery_path TEXT[],
          quality_score INT,
          has_of_probability FLOAT,
          bio TEXT,
          followers INT,
          external_link TEXT,
          last_analyzed TIMESTAMPTZ,
          metadata JSONB DEFAULT '{}',
          added_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS seed_performance (
          id SERIAL PRIMARY KEY,
          seed_username VARCHAR(255) REFERENCES smart_seeds(username),
          crawl_date DATE,
          profiles_found INT,
          of_profiles_found INT,
          avg_quality_score FLOAT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_seeds_active ON smart_seeds(active, quality_score DESC);
        CREATE INDEX IF NOT EXISTS idx_profiles_quality ON discovered_profiles(has_of_probability DESC);
        CREATE INDEX IF NOT EXISTS idx_performance_date ON seed_performance(crawl_date DESC);
      `);
    }

    // Load initial seeds from file
    await this.loadInitialSeeds();
    
    this.initialized = true;
  }

  /**
   * Load initial seeds from configuration
   */
  async loadInitialSeeds() {
    try {
      const data = await fs.readFile(this.seedsFile, 'utf8');
      const { seeds } = JSON.parse(data);
      
      for (const seed of seeds) {
        await this.addSeed(seed);
      }
      
      console.log(`✅ Loaded ${seeds.length} initial seeds`);
    } catch (error) {
      // Load verified premium seeds
      const verifiedSeedsData = await fs.readFile(
        path.join(__dirname, '../data/verified-premium-seeds.json'), 
        'utf8'
      );
      const { premium_seeds } = JSON.parse(verifiedSeedsData);
      
      // Flatten all seeds from categories
      const defaultSeeds = [];
      for (const category of premium_seeds) {
        for (const seed of category.seeds) {
          defaultSeeds.push({
            username: seed.username,
            category: category.category,
            quality_score: Math.round(parseFloat(seed.of_correlation) / 10),
            metadata: {
              verified: seed.verified,
              of_correlation: seed.of_correlation,
              notes: seed.notes
            }
          });
        }
      }
      
      // Save default seeds
      await fs.mkdir(path.dirname(this.seedsFile), { recursive: true });
      await fs.writeFile(this.seedsFile, JSON.stringify({ seeds: defaultSeeds }, null, 2));
      
      // Add to database
      for (const seed of defaultSeeds) {
        await this.addSeed(seed);
      }
    }
  }

  /**
   * Add a new seed account
   */
  async addSeed(seedData) {
    const { username, category = 'general', quality_score = 10, metadata = {} } = seedData;
    
    if (this.db) {
      await this.db.query(`
        INSERT INTO smart_seeds (username, category, quality_score, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (username) DO UPDATE
        SET category = $2, quality_score = $3, metadata = $4
      `, [username, category, quality_score, JSON.stringify(metadata)]);
    }
    
    console.log(`➕ Added seed: @${username} (${category})`);
  }

  /**
   * Get active seeds for crawling
   */
  async getActiveSeeds(limit = 10) {
    if (this.db) {
      const result = await this.db.query(`
        SELECT * FROM smart_seeds
        WHERE active = true
        AND (last_crawled IS NULL OR last_crawled < NOW() - INTERVAL '24 hours')
        ORDER BY quality_score DESC, leads_generated DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows;
    }
    
    // Fallback to file
    const data = await fs.readFile(this.seedsFile, 'utf8');
    const { seeds } = JSON.parse(data);
    return seeds.slice(0, limit);
  }

  /**
   * Update seed after crawling
   */
  async updateSeedPerformance(username, stats) {
    const { profilesFound, ofProfilesFound, avgQualityScore } = stats;
    
    if (this.db) {
      // Update seed stats
      await this.db.query(`
        UPDATE smart_seeds
        SET 
          last_crawled = NOW(),
          leads_generated = leads_generated + $2
        WHERE username = $1
      `, [username, ofProfilesFound]);
      
      // Log performance
      await this.db.query(`
        INSERT INTO seed_performance 
        (seed_username, crawl_date, profiles_found, of_profiles_found, avg_quality_score)
        VALUES ($1, CURRENT_DATE, $2, $3, $4)
      `, [username, profilesFound, ofProfilesFound, avgQualityScore]);
      
      // Update conversion rate
      await this.updateSeedConversionRate(username);
    }
  }

  /**
   * Calculate and update seed conversion rate
   */
  async updateSeedConversionRate(username) {
    if (!this.db) return;
    
    const result = await this.db.query(`
      SELECT 
        SUM(profiles_found) as total_found,
        SUM(of_profiles_found) as total_of
      FROM seed_performance
      WHERE seed_username = $1
    `, [username]);
    
    const { total_found, total_of } = result.rows[0];
    const conversionRate = total_found > 0 ? (total_of / total_found) : 0;
    
    await this.db.query(`
      UPDATE smart_seeds
      SET conversion_rate = $2
      WHERE username = $1
    `, [username, conversionRate]);
  }

  /**
   * Save discovered profile
   */
  async saveDiscoveredProfile(profile) {
    if (!this.db) return;
    
    const {
      username,
      source_seed,
      discovery_path = [],
      quality_score = 0,
      has_of_probability = 0,
      bio = '',
      followers = 0,
      external_link = '',
      metadata = {}
    } = profile;
    
    await this.db.query(`
      INSERT INTO discovered_profiles
      (username, source_seed, discovery_path, quality_score, has_of_probability, 
       bio, followers, external_link, last_analyzed, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
      ON CONFLICT (username) DO UPDATE
      SET 
        quality_score = $4,
        has_of_probability = $5,
        bio = $6,
        followers = $7,
        external_link = $8,
        last_analyzed = NOW(),
        metadata = $9
    `, [
      username, source_seed, discovery_path, quality_score, has_of_probability,
      bio, followers, external_link, JSON.stringify(metadata)
    ]);
  }

  /**
   * Get high quality discovered profiles
   */
  async getHighQualityProfiles(limit = 100) {
    if (!this.db) return [];
    
    const result = await this.db.query(`
      SELECT * FROM discovered_profiles
      WHERE has_of_probability >= 0.7
      ORDER BY has_of_probability DESC, quality_score DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  /**
   * Discover new seeds from high-performing profiles
   */
  async discoverNewSeeds() {
    if (!this.db) return [];
    
    // Find profiles that generated many conversions
    const result = await this.db.query(`
      WITH profile_performance AS (
        SELECT 
          dp.username,
          COUNT(DISTINCT dr.username) as replies_generated,
          AVG(CASE WHEN dr.sentiment = 'positive' THEN 1 ELSE 0 END) as positive_rate
        FROM discovered_profiles dp
        LEFT JOIN dm_conversations dc ON dc.prospect_username = dp.username
        LEFT JOIN dm_replies dr ON dr.conversation_id = dc.conversation_id
        WHERE dp.has_of_probability >= 0.8
        GROUP BY dp.username
        HAVING COUNT(DISTINCT dr.username) >= 5
      )
      SELECT 
        pp.username,
        pp.replies_generated,
        pp.positive_rate,
        dp.bio,
        dp.followers
      FROM profile_performance pp
      JOIN discovered_profiles dp ON dp.username = pp.username
      WHERE pp.positive_rate >= 0.3
      AND dp.username NOT IN (SELECT username FROM smart_seeds)
      ORDER BY pp.replies_generated DESC, pp.positive_rate DESC
      LIMIT 10
    `);
    
    const newSeeds = [];
    for (const row of result.rows) {
      await this.addSeed({
        username: row.username,
        category: 'discovered',
        quality_score: Math.round(8 + row.positive_rate * 2),
        metadata: {
          replies_generated: row.replies_generated,
          positive_rate: row.positive_rate,
          auto_discovered: true
        }
      });
      newSeeds.push(row.username);
    }
    
    if (newSeeds.length > 0) {
      console.log(`🌟 Discovered ${newSeeds.length} new high-performing seeds!`);
    }
    
    return newSeeds;
  }

  /**
   * Get analytics dashboard data
   */
  async getAnalytics() {
    if (!this.db) return {};
    
    const [seeds, profiles, performance] = await Promise.all([
      // Active seeds
      this.db.query(`
        SELECT COUNT(*) as total, 
               SUM(CASE WHEN active THEN 1 ELSE 0 END) as active,
               AVG(conversion_rate) as avg_conversion
        FROM smart_seeds
      `),
      
      // Discovered profiles
      this.db.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN has_of_probability >= 0.7 THEN 1 ELSE 0 END) as high_quality,
               AVG(has_of_probability) as avg_probability
        FROM discovered_profiles
      `),
      
      // Recent performance
      this.db.query(`
        SELECT 
          crawl_date,
          SUM(profiles_found) as total_found,
          SUM(of_profiles_found) as of_found
        FROM seed_performance
        WHERE crawl_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY crawl_date
        ORDER BY crawl_date DESC
      `)
    ]);
    
    return {
      seeds: seeds.rows[0],
      profiles: profiles.rows[0],
      recentPerformance: performance.rows
    };
  }

  /**
   * Deactivate poor performing seeds
   */
  async optimizeSeeds() {
    if (!this.db) return;
    
    // Deactivate seeds with poor conversion
    await this.db.query(`
      UPDATE smart_seeds
      SET active = false
      WHERE conversion_rate < 0.05
      AND leads_generated > 100
    `);
    
    // Boost high performers
    await this.db.query(`
      UPDATE smart_seeds
      SET quality_score = LEAST(quality_score + 1, 10)
      WHERE conversion_rate > 0.15
      AND active = true
    `);
    
    console.log('✨ Optimized seed performance scores');
  }
}

// Export for use
export default SmartSeedsDatabase;