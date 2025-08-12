import { budgetManager } from '../llm-budget';
import { db } from '../db';

// Mock database
jest.mock('../db', () => ({
  db: {
    query: jest.fn(),
    getClient: jest.fn(),
    end: jest.fn(),
  }
}));

const mockDb = db as jest.Mocked<typeof db>;

describe('LLM Budget Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('estimateCost', () => {
    it('should calculate cost correctly for OpenAI models', async () => {
      // Mock database pricing query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ 
          input_cost_per_1m_tokens: '0.50', 
          output_cost_per_1m_tokens: '1.50' 
        }]
      });

      const cost = await budgetManager.estimateCost('openai', 'gpt-3.5-turbo', 1000, 500);
      
      // Expected: (1000 / 1,000,000) * 0.50 + (500 / 1,000,000) * 1.50 = 0.0005 + 0.00075 = 0.00125
      expect(cost).toBeCloseTo(0.00125, 6);
    });

    it('should use fallback pricing for unknown models', async () => {
      // Mock empty database result
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const cost = await budgetManager.estimateCost('unknown', 'unknown-model', 1000, 500);
      
      // Fallback pricing: input: $5, output: $15 per 1M tokens
      // Expected: (1000 / 1,000,000) * 5.0 + (500 / 1,000,000) * 15.0 = 0.005 + 0.0075 = 0.0125
      expect(cost).toBeCloseTo(0.0125, 6);
    });

    it('should account for cached tokens', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ 
          input_cost_per_1m_tokens: '1.00', 
          output_cost_per_1m_tokens: '2.00' 
        }]
      });

      const cost = await budgetManager.estimateCost('openai', 'gpt-4', 1000, 500, 300);
      
      // Effective input tokens: 1000 - 300 = 700
      // Expected: (700 / 1,000,000) * 1.0 + (500 / 1,000,000) * 2.0 = 0.0007 + 0.001 = 0.0017
      expect(cost).toBeCloseTo(0.0017, 6);
    });
  });

  describe('getBudgetStatus', () => {
    it('should return correct budget status', async () => {
      // Mock budget query
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          usd_limit: '100.00',
          soft_pct: 80,
          hard_stop: true
        }]
      });

      // Mock usage query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ current_usage: '25.50', request_count: '10' }]
      });

      // Mock top models query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { model: 'openai/gpt-4', cost: '15.00', requests: '5' },
          { model: 'openai/gpt-3.5-turbo', cost: '10.50', requests: '5' }
        ]
      });

      const status = await budgetManager.getBudgetStatus('creator-123');

      expect(status.budgetLimit).toBe(100);
      expect(status.currentUsage).toBe(25.50);
      expect(status.availableBudget).toBe(74.50);
      expect(status.usagePercentage).toBe(25.5);
      expect(status.softLimitReached).toBe(false);
      expect(status.hardLimitReached).toBe(false);
      expect(status.topModels).toHaveLength(2);
      expect(status.topModels[0].model).toBe('openai/gpt-4');
    });

    it('should detect soft limit reached', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          usd_limit: '100.00',
          soft_pct: 80,
          hard_stop: true
        }]
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [{ current_usage: '85.00', request_count: '20' }]
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const status = await budgetManager.getBudgetStatus('creator-123');

      expect(status.softLimitReached).toBe(true);
      expect(status.hardLimitReached).toBe(false);
    });

    it('should detect hard limit reached', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          usd_limit: '100.00',
          soft_pct: 80,
          hard_stop: true
        }]
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [{ current_usage: '105.00', request_count: '25' }]
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const status = await budgetManager.getBudgetStatus('creator-123');

      expect(status.hardLimitReached).toBe(true);
      expect(status.availableBudget).toBe(0); // Capped at 0
    });
  });

  describe('reserveBudget', () => {
    it('should approve reservation when budget allows', async () => {
      // Mock getBudgetStatus call
      jest.spyOn(budgetManager, 'getBudgetStatus').mockResolvedValueOnce({
        budgetLimit: 100,
        currentUsage: 50,
        reservedAmount: 0,
        availableBudget: 50,
        usagePercentage: 50,
        softLimitReached: false,
        hardLimitReached: false,
        topModels: []
      });

      const reservation = await budgetManager.reserveBudget(
        'creator-123',
        5.00,
        'content_generation'
      );

      expect(reservation.approved).toBe(true);
      expect(reservation.reservationId).toBeDefined();
      expect(reservation.reason).toBe('Budget reserved successfully');
    });

    it('should reject reservation when hard limit reached', async () => {
      jest.spyOn(budgetManager, 'getBudgetStatus').mockResolvedValueOnce({
        budgetLimit: 100,
        currentUsage: 105,
        reservedAmount: 0,
        availableBudget: 0,
        usagePercentage: 105,
        softLimitReached: true,
        hardLimitReached: true,
        topModels: []
      });

      const reservation = await budgetManager.reserveBudget(
        'creator-123',
        5.00,
        'content_generation'
      );

      expect(reservation.approved).toBe(false);
      expect(reservation.reservationId).toBeNull();
      expect(reservation.reason).toContain('Hard budget limit exceeded');
    });

    it('should reject reservation when cost exceeds available budget', async () => {
      jest.spyOn(budgetManager, 'getBudgetStatus').mockResolvedValueOnce({
        budgetLimit: 100,
        currentUsage: 95,
        reservedAmount: 0,
        availableBudget: 5,
        usagePercentage: 95,
        softLimitReached: true,
        hardLimitReached: false,
        topModels: []
      });

      const reservation = await budgetManager.reserveBudget(
        'creator-123',
        10.00, // Exceeds available budget
        'content_generation'
      );

      expect(reservation.approved).toBe(false);
      expect(reservation.reservationId).toBeNull();
      expect(reservation.reason).toContain('Insufficient budget');
    });
  });

  describe('recordUsage', () => {
    it('should record usage successfully', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient as any);
      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'usage-123' }] }); // INSERT
      mockClient.query.mockResolvedValueOnce(undefined); // COMMIT

      const usage = {
        creatorId: 'creator-123',
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
        totalCost: 0.015,
        operationType: 'content_generation'
      };

      await budgetManager.recordUsage(usage, 'reservation-123');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO llm_usage'),
        expect.arrayContaining([
          'creator-123',
          undefined, // agentId
          undefined, // postId
          'openai',
          'gpt-4',
          1000,
          500,
          0, // cachedTokens
          0.015,
          'content_generation',
          expect.any(String) // metadata JSON
        ])
      );
    });
  });
});