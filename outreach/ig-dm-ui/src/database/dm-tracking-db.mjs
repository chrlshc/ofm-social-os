import pg from 'pg';
const { Pool } = pg;

/**
 * Database integration for DM outreach tracking and analytics
 */
export class DMTrackingDatabase {
  constructor(options = {}) {
    this.pool = new Pool({
      host: options.host || process.env.DB_HOST || 'localhost',
      port: options.port || process.env.DB_PORT || 5432,
      database: options.database || process.env.DB_NAME || 'social_os',
      user: options.user || process.env.DB_USER || 'postgres',
      password: options.password || process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    this.initialized = false;
  }

  /**
   * Initialize database tables
   */
  async initialize() {
    try {
      await this.createTables();
      this.initialized = true;
      console.log('✅ DM tracking database initialized');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  async createTables() {
    const queries = [
      // Main outreach log table
      `CREATE TABLE IF NOT EXISTS dm_outreach_logs (
        id SERIAL PRIMARY KEY,
        conversation_id VARCHAR(255) UNIQUE NOT NULL,
        prospect_username VARCHAR(255) NOT NULL,
        prospect_name VARCHAR(255),
        prospect_location VARCHAR(255),
        prospect_niche VARCHAR(255),
        prospect_followers INTEGER,
        account_used VARCHAR(255) NOT NULL,
        proxy_used VARCHAR(255),
        message_sent TEXT NOT NULL,
        message_template_id VARCHAR(255),
        message_source VARCHAR(50), -- 'ai', 'template', 'custom'
        timestamp_sent TIMESTAMP NOT NULL DEFAULT NOW(),
        pre_engagement BOOLEAN DEFAULT FALSE,
        replied BOOLEAN DEFAULT FALSE,
        reply_text TEXT,
        reply_timestamp TIMESTAMP,
        reply_time_minutes INTEGER,
        sentiment VARCHAR(50),
        sentiment_score DECIMAL(5,2),
        intent VARCHAR(50),
        priority VARCHAR(20),
        assigned_to VARCHAR(255),
        conversion_status VARCHAR(50), -- 'none', 'lead', 'customer'
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Create indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_dm_logs_prospect ON dm_outreach_logs(prospect_username)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_logs_account ON dm_outreach_logs(account_used)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_logs_timestamp ON dm_outreach_logs(timestamp_sent)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_logs_replied ON dm_outreach_logs(replied)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_logs_sentiment ON dm_outreach_logs(sentiment)`,
      
      // Account performance tracking
      `CREATE TABLE IF NOT EXISTS dm_account_performance (
        id SERIAL PRIMARY KEY,
        account_username VARCHAR(255) UNIQUE NOT NULL,
        total_dms_sent INTEGER DEFAULT 0,
        total_replies INTEGER DEFAULT 0,
        reply_rate DECIMAL(5,2) DEFAULT 0,
        positive_replies INTEGER DEFAULT 0,
        negative_replies INTEGER DEFAULT 0,
        avg_reply_time_minutes DECIMAL(10,2),
        total_conversions INTEGER DEFAULT 0,
        conversion_rate DECIMAL(5,2) DEFAULT 0,
        last_dm_sent TIMESTAMP,
        account_status VARCHAR(50) DEFAULT 'active',
        performance_score DECIMAL(5,2) DEFAULT 100,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Message template performance
      `CREATE TABLE IF NOT EXISTS dm_template_performance (
        id SERIAL PRIMARY KEY,
        template_id VARCHAR(255) UNIQUE NOT NULL,
        template_text TEXT NOT NULL,
        template_source VARCHAR(50), -- 'ai', 'manual', 'system'
        times_used INTEGER DEFAULT 0,
        total_replies INTEGER DEFAULT 0,
        reply_rate DECIMAL(5,2) DEFAULT 0,
        positive_sentiment_rate DECIMAL(5,2) DEFAULT 0,
        avg_reply_time_minutes DECIMAL(10,2),
        conversions INTEGER DEFAULT 0,
        conversion_rate DECIMAL(5,2) DEFAULT 0,
        last_used TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Daily campaign metrics
      `CREATE TABLE IF NOT EXISTS dm_daily_metrics (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        account_username VARCHAR(255),
        total_dms_sent INTEGER DEFAULT 0,
        total_replies INTEGER DEFAULT 0,
        positive_replies INTEGER DEFAULT 0,
        negative_replies INTEGER DEFAULT 0,
        neutral_replies INTEGER DEFAULT 0,
        avg_reply_time_minutes DECIMAL(10,2),
        unique_prospects INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(date, account_username)
      )`,
      
      // Error and issue tracking
      `CREATE TABLE IF NOT EXISTS dm_error_logs (
        id SERIAL PRIMARY KEY,
        account_username VARCHAR(255),
        error_type VARCHAR(100),
        error_message TEXT,
        error_details JSONB,
        occurred_at TIMESTAMP DEFAULT NOW()
      )`
    ];
    
    for (const query of queries) {
      await this.pool.query(query);
    }
  }

  /**
   * Log a sent DM
   */
  async logDMSent(data) {
    const {
      conversationId,
      prospect,
      account,
      message,
      templateId,
      messageSource,
      preEngagement,
      proxy
    } = data;
    
    const query = `
      INSERT INTO dm_outreach_logs (
        conversation_id, prospect_username, prospect_name, 
        prospect_location, prospect_niche, prospect_followers,
        account_used, proxy_used, message_sent, 
        message_template_id, message_source, pre_engagement
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (conversation_id) DO UPDATE SET
        updated_at = NOW()
      RETURNING id
    `;
    
    const values = [
      conversationId,
      prospect.username,
      prospect.name || null,
      prospect.location || null,
      prospect.niche || null,
      prospect.followers || null,
      account,
      proxy || null,
      message,
      templateId || null,
      messageSource || 'template',
      preEngagement || false
    ];
    
    try {
      const result = await this.pool.query(query, values);
      
      // Update account performance
      await this.updateAccountPerformance(account, { dmSent: true });
      
      // Update template performance if applicable
      if (templateId) {
        await this.updateTemplatePerformance(templateId, message, { used: true });
      }
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Error logging DM:', error);
      await this.logError(account, 'dm_logging_error', error.message);
      throw error;
    }
  }

  /**
   * Log a received reply
   */
  async logReply(conversationId, replyData) {
    const {
      replyText,
      sentiment,
      sentimentScore,
      intent,
      priority,
      replyTime
    } = replyData;
    
    const query = `
      UPDATE dm_outreach_logs SET
        replied = true,
        reply_text = $2,
        reply_timestamp = NOW(),
        reply_time_minutes = $3,
        sentiment = $4,
        sentiment_score = $5,
        intent = $6,
        priority = $7,
        updated_at = NOW()
      WHERE conversation_id = $1
      RETURNING account_used, message_template_id
    `;
    
    const values = [
      conversationId,
      replyText,
      replyTime || null,
      sentiment,
      sentimentScore || null,
      intent || null,
      priority || null
    ];
    
    try {
      const result = await this.pool.query(query, values);
      
      if (result.rows.length > 0) {
        const { account_used, message_template_id } = result.rows[0];
        
        // Update account performance
        await this.updateAccountPerformance(account_used, {
          gotReply: true,
          sentiment: sentiment
        });
        
        // Update template performance
        if (message_template_id) {
          await this.updateTemplatePerformance(message_template_id, null, {
            gotReply: true,
            sentiment: sentiment,
            replyTime: replyTime
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error logging reply:', error);
      throw error;
    }
  }

  /**
   * Update account performance metrics
   */
  async updateAccountPerformance(account, event) {
    // First, ensure account exists in performance table
    await this.pool.query(`
      INSERT INTO dm_account_performance (account_username)
      VALUES ($1)
      ON CONFLICT (account_username) DO NOTHING
    `, [account]);
    
    let updateQuery = '';
    const values = [account];
    
    if (event.dmSent) {
      updateQuery = `
        UPDATE dm_account_performance SET
          total_dms_sent = total_dms_sent + 1,
          last_dm_sent = NOW(),
          updated_at = NOW()
        WHERE account_username = $1
      `;
    } else if (event.gotReply) {
      let sentimentUpdate = '';
      if (event.sentiment === 'positive') {
        sentimentUpdate = ', positive_replies = positive_replies + 1';
      } else if (event.sentiment === 'negative') {
        sentimentUpdate = ', negative_replies = negative_replies + 1';
      }
      
      updateQuery = `
        UPDATE dm_account_performance SET
          total_replies = total_replies + 1
          ${sentimentUpdate},
          updated_at = NOW()
        WHERE account_username = $1
      `;
    } else if (event.conversion) {
      updateQuery = `
        UPDATE dm_account_performance SET
          total_conversions = total_conversions + 1,
          updated_at = NOW()
        WHERE account_username = $1
      `;
    }
    
    if (updateQuery) {
      await this.pool.query(updateQuery, values);
      
      // Recalculate rates
      await this.recalculateAccountMetrics(account);
    }
  }

  /**
   * Update template performance metrics
   */
  async updateTemplatePerformance(templateId, templateText, event) {
    // Ensure template exists
    if (templateText) {
      await this.pool.query(`
        INSERT INTO dm_template_performance (template_id, template_text)
        VALUES ($1, $2)
        ON CONFLICT (template_id) DO NOTHING
      `, [templateId, templateText]);
    }
    
    let updateQuery = '';
    const values = [templateId];
    
    if (event.used) {
      updateQuery = `
        UPDATE dm_template_performance SET
          times_used = times_used + 1,
          last_used = NOW(),
          updated_at = NOW()
        WHERE template_id = $1
      `;
    } else if (event.gotReply) {
      let additionalUpdates = [];
      
      if (event.sentiment === 'positive') {
        additionalUpdates.push('positive_sentiment_rate = (positive_sentiment_rate * total_replies + 1) / (total_replies + 1)');
      }
      
      if (event.replyTime) {
        additionalUpdates.push(`avg_reply_time_minutes = 
          CASE 
            WHEN avg_reply_time_minutes IS NULL THEN ${event.replyTime}
            ELSE (avg_reply_time_minutes * total_replies + ${event.replyTime}) / (total_replies + 1)
          END`);
      }
      
      updateQuery = `
        UPDATE dm_template_performance SET
          total_replies = total_replies + 1,
          ${additionalUpdates.join(', ')},
          updated_at = NOW()
        WHERE template_id = $1
      `;
    }
    
    if (updateQuery) {
      await this.pool.query(updateQuery, values);
      
      // Recalculate rates
      await this.recalculateTemplateMetrics(templateId);
    }
  }

  /**
   * Recalculate account metrics
   */
  async recalculateAccountMetrics(account) {
    await this.pool.query(`
      UPDATE dm_account_performance SET
        reply_rate = CASE 
          WHEN total_dms_sent > 0 THEN (total_replies::decimal / total_dms_sent * 100)
          ELSE 0 
        END,
        conversion_rate = CASE 
          WHEN total_dms_sent > 0 THEN (total_conversions::decimal / total_dms_sent * 100)
          ELSE 0 
        END,
        performance_score = LEAST(100, 
          (reply_rate * 0.4) + 
          (conversion_rate * 0.4) + 
          (CASE WHEN negative_replies > 0 
            THEN GREATEST(0, 20 - (negative_replies::decimal / total_replies * 20))
            ELSE 20 
          END)
        )
      WHERE account_username = $1
    `, [account]);
  }

  /**
   * Recalculate template metrics
   */
  async recalculateTemplateMetrics(templateId) {
    await this.pool.query(`
      UPDATE dm_template_performance SET
        reply_rate = CASE 
          WHEN times_used > 0 THEN (total_replies::decimal / times_used * 100)
          ELSE 0 
        END,
        conversion_rate = CASE 
          WHEN times_used > 0 THEN (conversions::decimal / times_used * 100)
          ELSE 0 
        END
      WHERE template_id = $1
    `, [templateId]);
  }

  /**
   * Get account performance statistics
   */
  async getAccountStats(account = null) {
    let query = `
      SELECT 
        account_username,
        total_dms_sent,
        total_replies,
        reply_rate,
        positive_replies,
        negative_replies,
        total_conversions,
        conversion_rate,
        performance_score,
        last_dm_sent
      FROM dm_account_performance
    `;
    
    const values = [];
    if (account) {
      query += ' WHERE account_username = $1';
      values.push(account);
    }
    
    query += ' ORDER BY performance_score DESC';
    
    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Get best performing message templates
   */
  async getBestTemplates(limit = 10) {
    const query = `
      SELECT 
        template_id,
        template_text,
        times_used,
        reply_rate,
        positive_sentiment_rate,
        conversion_rate,
        avg_reply_time_minutes
      FROM dm_template_performance
      WHERE times_used >= 5  -- Minimum sample size
      ORDER BY reply_rate DESC, conversion_rate DESC
      LIMIT $1
    `;
    
    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Generate daily metrics
   */
  async generateDailyMetrics(date = new Date()) {
    const dateStr = date.toISOString().split('T')[0];
    
    const query = `
      INSERT INTO dm_daily_metrics (
        date, account_username, total_dms_sent, total_replies,
        positive_replies, negative_replies, neutral_replies,
        avg_reply_time_minutes, unique_prospects
      )
      SELECT 
        $1::date,
        account_used,
        COUNT(*) FILTER (WHERE DATE(timestamp_sent) = $1::date),
        COUNT(*) FILTER (WHERE replied = true),
        COUNT(*) FILTER (WHERE sentiment = 'positive'),
        COUNT(*) FILTER (WHERE sentiment = 'negative'),
        COUNT(*) FILTER (WHERE sentiment = 'neutral'),
        AVG(reply_time_minutes) FILTER (WHERE replied = true),
        COUNT(DISTINCT prospect_username)
      FROM dm_outreach_logs
      WHERE DATE(timestamp_sent) = $1::date
      GROUP BY account_used
      ON CONFLICT (date, account_username) DO UPDATE SET
        total_dms_sent = EXCLUDED.total_dms_sent,
        total_replies = EXCLUDED.total_replies,
        positive_replies = EXCLUDED.positive_replies,
        negative_replies = EXCLUDED.negative_replies,
        neutral_replies = EXCLUDED.neutral_replies,
        avg_reply_time_minutes = EXCLUDED.avg_reply_time_minutes,
        unique_prospects = EXCLUDED.unique_prospects
    `;
    
    await this.pool.query(query, [dateStr]);
    
    console.log(`📊 Generated daily metrics for ${dateStr}`);
  }

  /**
   * Get analytics for a date range
   */
  async getAnalytics(startDate, endDate) {
    const query = `
      SELECT 
        DATE(timestamp_sent) as date,
        COUNT(*) as total_dms,
        COUNT(*) FILTER (WHERE replied = true) as total_replies,
        AVG(CASE WHEN replied THEN reply_time_minutes END) as avg_reply_time,
        COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_replies,
        COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_replies,
        COUNT(DISTINCT account_used) as accounts_used,
        COUNT(DISTINCT prospect_username) as unique_prospects
      FROM dm_outreach_logs
      WHERE timestamp_sent >= $1 AND timestamp_sent <= $2
      GROUP BY DATE(timestamp_sent)
      ORDER BY date DESC
    `;
    
    const result = await this.pool.query(query, [startDate, endDate]);
    return result.rows;
  }

  /**
   * Log errors
   */
  async logError(account, errorType, errorMessage, details = null) {
    const query = `
      INSERT INTO dm_error_logs (account_username, error_type, error_message, error_details)
      VALUES ($1, $2, $3, $4)
    `;
    
    await this.pool.query(query, [account, errorType, errorMessage, details]);
  }

  /**
   * Clean up old data
   */
  async cleanup(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    await this.pool.query(`
      DELETE FROM dm_outreach_logs 
      WHERE created_at < $1 AND conversion_status = 'none'
    `, [cutoffDate]);
    
    await this.pool.query(`
      DELETE FROM dm_error_logs 
      WHERE occurred_at < $1
    `, [cutoffDate]);
    
    console.log(`🧹 Cleaned up data older than ${daysToKeep} days`);
  }

  /**
   * Close database connection
   */
  
  
  /**
   * Calculate recent reply rate for backpressure
   */
  async getRecentReplyRate(minutes = 30) {
    const query = `
      WITH recent_sent AS (
        SELECT id FROM dm_outreach_logs
        WHERE sent_at > NOW() - INTERVAL '${minutes} minutes'
      )
      SELECT 
        COUNT(DISTINCT r.id)::float / GREATEST(COUNT(DISTINCT s.id), 1)::float AS reply_rate
      FROM recent_sent s
      LEFT JOIN dm_replies r ON r.outreach_log_id = s.id
    `;
    
    const result = await this.client.query(query);
    return result.rows[0]?.reply_rate || 0;
  }

  async close() {
    await this.pool.end();
  }
}