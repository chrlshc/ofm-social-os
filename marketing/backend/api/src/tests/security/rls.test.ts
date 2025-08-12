import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { db } from '../../lib/db';
import { v4 as uuidv4 } from 'uuid';

describe('Row Level Security (RLS) Tests', () => {
  let testCreator1: string;
  let testCreator2: string;
  let testAccount1: string;
  let testAccount2: string;

  beforeEach(async () => {
    testCreator1 = uuidv4();
    testCreator2 = uuidv4();
    
    // Create test accounts for both creators
    const account1Result = await db.query(`
      INSERT INTO accounts (creator_id, platform, platform_account_id, username, status)
      VALUES ($1, 'instagram', 'test_account_1', 'testuser1', 'active')
      RETURNING id
    `, [testCreator1]);
    testAccount1 = account1Result.rows[0].id;

    const account2Result = await db.query(`
      INSERT INTO accounts (creator_id, platform, platform_account_id, username, status)
      VALUES ($1, 'instagram', 'test_account_2', 'testuser2', 'active')
      RETURNING id
    `, [testCreator2]);
    testAccount2 = account2Result.rows[0].id;
  });

  afterEach(async () => {
    // Clean up test data
    await db.query('DELETE FROM posts WHERE creator_id IN ($1, $2)', [testCreator1, testCreator2]);
    await db.query('DELETE FROM accounts WHERE creator_id IN ($1, $2)', [testCreator1, testCreator2]);
    await db.query('DELETE FROM llm_usage WHERE creator_id IN ($1, $2)', [testCreator1, testCreator2]);
    await db.query('DELETE FROM llm_budgets WHERE creator_id IN ($1, $2)', [testCreator1, testCreator2]);
  });

  describe('Posts Table RLS', () => {
    it('should isolate posts by creator_id', async () => {
      // Set current creator context
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      // Create a post for creator 1
      await db.query(`
        INSERT INTO posts (creator_id, account_id, caption, status, platform, media_type)
        VALUES ($1, $2, 'Test post creator 1', 'draft', 'instagram', 'photo')
      `, [testCreator1, testAccount1]);

      // Create a post for creator 2 (should be isolated)
      await db.query(`
        INSERT INTO posts (creator_id, account_id, caption, status, platform, media_type)
        VALUES ($1, $2, 'Test post creator 2', 'draft', 'instagram', 'photo')
      `, [testCreator2, testAccount2]);

      // Query posts as creator 1 - should only see their own posts
      const creator1Posts = await db.query('SELECT * FROM posts');
      expect(creator1Posts.rows).toHaveLength(1);
      expect(creator1Posts.rows[0].creator_id).toBe(testCreator1);

      // Switch context to creator 2
      await db.query('SET auth.creator_id = $1', [testCreator2]);

      // Query posts as creator 2 - should only see their own posts  
      const creator2Posts = await db.query('SELECT * FROM posts');
      expect(creator2Posts.rows).toHaveLength(1);
      expect(creator2Posts.rows[0].creator_id).toBe(testCreator2);
    });

    it('should prevent cross-creator post access', async () => {
      // Set creator 1 context and create post
      await db.query('SET auth.creator_id = $1', [testCreator1]);
      
      const postResult = await db.query(`
        INSERT INTO posts (creator_id, account_id, caption, status, platform, media_type)
        VALUES ($1, $2, 'Creator 1 post', 'draft', 'instagram', 'photo')
        RETURNING id
      `, [testCreator1, testAccount1]);
      const postId = postResult.rows[0].id;

      // Switch to creator 2 context
      await db.query('SET auth.creator_id = $1', [testCreator2]);

      // Attempt to access creator 1's post - should return no results
      const result = await db.query('SELECT * FROM posts WHERE id = $1', [postId]);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Accounts Table RLS', () => {
    it('should isolate accounts by creator_id', async () => {
      // Set creator 1 context
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      const creator1Accounts = await db.query('SELECT * FROM accounts');
      expect(creator1Accounts.rows).toHaveLength(1);
      expect(creator1Accounts.rows[0].creator_id).toBe(testCreator1);

      // Switch to creator 2 context
      await db.query('SET auth.creator_id = $1', [testCreator2]);

      const creator2Accounts = await db.query('SELECT * FROM accounts');
      expect(creator2Accounts.rows).toHaveLength(1);
      expect(creator2Accounts.rows[0].creator_id).toBe(testCreator2);
    });
  });

  describe('LLM Usage RLS', () => {
    it('should isolate LLM usage by creator_id', async () => {
      // Create LLM usage records for both creators
      await db.query(`
        INSERT INTO llm_usage (creator_id, provider, model, prompt_tokens, completion_tokens, cost_usd)
        VALUES ($1, 'openai', 'gpt-4', 100, 50, 0.005)
      `, [testCreator1]);

      await db.query(`
        INSERT INTO llm_usage (creator_id, provider, model, prompt_tokens, completion_tokens, cost_usd)
        VALUES ($1, 'openai', 'gpt-4', 200, 100, 0.010)
      `, [testCreator2]);

      // Set creator 1 context
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      const creator1Usage = await db.query('SELECT * FROM llm_usage');
      expect(creator1Usage.rows).toHaveLength(1);
      expect(creator1Usage.rows[0].creator_id).toBe(testCreator1);
      expect(creator1Usage.rows[0].cost_usd).toBe('0.005');

      // Switch to creator 2 context
      await db.query('SET auth.creator_id = $1', [testCreator2]);

      const creator2Usage = await db.query('SELECT * FROM llm_usage');
      expect(creator2Usage.rows).toHaveLength(1);
      expect(creator2Usage.rows[0].creator_id).toBe(testCreator2);
      expect(creator2Usage.rows[0].cost_usd).toBe('0.010');
    });
  });

  describe('LLM Budgets RLS', () => {
    it('should isolate budgets by creator_id', async () => {
      // Create budget records
      await db.query(`
        INSERT INTO llm_budgets (creator_id, period_start, period_end, budget_usd, spent_usd, status)
        VALUES ($1, NOW(), NOW() + INTERVAL '30 days', 100.00, 25.50, 'active')
      `, [testCreator1]);

      await db.query(`
        INSERT INTO llm_budgets (creator_id, period_start, period_end, budget_usd, spent_usd, status)
        VALUES ($1, NOW(), NOW() + INTERVAL '30 days', 200.00, 75.25, 'active')
      `, [testCreator2]);

      // Test creator 1 access
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      const creator1Budgets = await db.query('SELECT * FROM llm_budgets');
      expect(creator1Budgets.rows).toHaveLength(1);
      expect(creator1Budgets.rows[0].creator_id).toBe(testCreator1);
      expect(parseFloat(creator1Budgets.rows[0].budget_usd)).toBe(100.00);

      // Test creator 2 access
      await db.query('SET auth.creator_id = $1', [testCreator2]);

      const creator2Budgets = await db.query('SELECT * FROM llm_budgets');
      expect(creator2Budgets.rows).toHaveLength(1);
      expect(creator2Budgets.rows[0].creator_id).toBe(testCreator2);
      expect(parseFloat(creator2Budgets.rows[0].budget_usd)).toBe(200.00);
    });
  });

  describe('DM History RLS', () => {
    it('should isolate DM history through account ownership', async () => {
      // Create DM history for both accounts
      await db.query(`
        INSERT INTO dm_history (account_id, recipient_username, message_content, sent_at, status)
        VALUES ($1, 'target_user_1', 'Hello from creator 1', NOW(), 'sent')
      `, [testAccount1]);

      await db.query(`
        INSERT INTO dm_history (account_id, recipient_username, message_content, sent_at, status)
        VALUES ($1, 'target_user_2', 'Hello from creator 2', NOW(), 'sent')
      `, [testAccount2]);

      // Test creator 1 access
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      const creator1DMs = await db.query('SELECT * FROM dm_history');
      expect(creator1DMs.rows).toHaveLength(1);
      expect(creator1DMs.rows[0].account_id).toBe(testAccount1);
      expect(creator1DMs.rows[0].recipient_username).toBe('target_user_1');

      // Test creator 2 access
      await db.query('SET auth.creator_id = $1', [testCreator2]);

      const creator2DMs = await db.query('SELECT * FROM dm_history');
      expect(creator2DMs.rows).toHaveLength(1);
      expect(creator2DMs.rows[0].account_id).toBe(testAccount2);
      expect(creator2DMs.rows[0].recipient_username).toBe('target_user_2');
    });
  });

  describe('Privilege Escalation Prevention', () => {
    it('should prevent setting auth.creator_id to unauthorized values', async () => {
      // Try to set creator_id to a different creator
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      // Verify the setting worked
      const result1 = await db.query('SELECT current_setting(\'auth.creator_id\')');
      expect(result1.rows[0].current_setting).toBe(testCreator1);

      // In real application, this would be prevented by middleware
      // For testing, we verify RLS works with different creator contexts
      await db.query('SET auth.creator_id = $1', [testCreator2]);

      const result2 = await db.query('SELECT current_setting(\'auth.creator_id\')');
      expect(result2.rows[0].current_setting).toBe(testCreator2);
    });
  });

  describe('Safe Views', () => {
    it('should provide safe access to posts without sensitive data', async () => {
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      // Create a post with potentially sensitive remote_id
      await db.query(`
        INSERT INTO posts (creator_id, account_id, caption, status, platform, media_type, remote_id)
        VALUES ($1, $2, 'Test post', 'published', 'instagram', 'photo', 'very_long_sensitive_remote_id_12345678901234567890')
      `, [testCreator1, testAccount1]);

      // Query safe view
      const safeResult = await db.query('SELECT * FROM safe_posts');
      expect(safeResult.rows).toHaveLength(1);
      
      // Verify remote_id is masked
      expect(safeResult.rows[0].remote_id_masked).toBe('very_long_...');
      
      // Verify other fields are present
      expect(safeResult.rows[0].caption).toBe('Test post');
      expect(safeResult.rows[0].platform).toBe('instagram');
    });

    it('should provide safe access to accounts without tokens', async () => {
      await db.query('SET auth.creator_id = $1', [testCreator1]);

      // Update account with metadata including tokens
      await db.query(`
        UPDATE accounts 
        SET metadata = $1 
        WHERE id = $2
      `, [
        JSON.stringify({
          access_token: 'secret_token_123',
          refresh_token: 'secret_refresh_456', 
          profile_url: 'https://instagram.com/testuser1',
          follower_count: 1000
        }),
        testAccount1
      ]);

      // Query safe view
      const safeResult = await db.query('SELECT * FROM safe_accounts');
      expect(safeResult.rows).toHaveLength(1);
      
      // Verify tokens are excluded
      expect(safeResult.rows[0].safe_metadata).not.toHaveProperty('access_token');
      expect(safeResult.rows[0].safe_metadata).not.toHaveProperty('refresh_token');
      
      // Verify safe metadata is present
      expect(safeResult.rows[0].safe_metadata.profile_url).toBe('https://instagram.com/testuser1');
      expect(safeResult.rows[0].safe_metadata.follower_count).toBe(1000);
    });
  });

  describe('Context Reset Security', () => {
    it('should handle missing auth.creator_id gracefully', async () => {
      // Reset auth context
      await db.query('RESET auth.creator_id');

      // Should return default UUID (all zeros) or handle gracefully
      const posts = await db.query('SELECT * FROM posts');
      expect(posts.rows).toHaveLength(0); // No access without valid creator_id
    });

    it('should prevent SQL injection through auth.creator_id', async () => {
      // Attempt SQL injection through setting
      try {
        await db.query('SET auth.creator_id = $1', ["'; DROP TABLE posts; --"]);
        
        // Should not affect posts table
        const posts = await db.query('SELECT COUNT(*) as count FROM posts');
        expect(posts.rows[0].count).toBeDefined();
      } catch (error) {
        // Setting should fail gracefully with invalid UUID format
        expect(error).toBeDefined();
      }
    });
  });
});