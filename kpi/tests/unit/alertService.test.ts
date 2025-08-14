import { AlertService } from '../../alerts/alertService';
import { db } from '../../utils/db';
import { sendEmail } from '../../utils/notif';

jest.mock('../../utils/db');
jest.mock('../../utils/notif');
jest.mock('cron', () => ({
  CronJob: jest.fn().mockImplementation((schedule, callback) => ({
    start: jest.fn(),
    stop: jest.fn(),
    schedule,
    callback
  }))
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

describe('AlertService', () => {
  let alertService: AlertService;
  
  beforeEach(() => {
    alertService = new AlertService();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    alertService.stop();
  });
  
  describe('evaluateRule', () => {
    it('should trigger alert when threshold is exceeded', async () => {
      const rule = {
        id: 'test-rule',
        modelName: 'marketing',
        metricName: 'ctr',
        threshold: 1.0,
        comparison: 'lt' as const,
        severity: 'warning' as const,
        message: 'CTR too low'
      };
      
      mockDb.query.mockResolvedValue({
        rows: [{ agg_value: '0.5', count: 10, min_value: '0.3', max_value: '0.8' }],
        rowCount: 1
      });
      
      const triggered = await (alertService as any).evaluateRule(rule);
      
      expect(triggered).toBeTruthy();
      expect(triggered.currentValue).toBe(0.5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AVG(value) as agg_value'),
        ['marketing', 'ctr']
      );
    });
    
    it('should not trigger when threshold is not exceeded', async () => {
      const rule = {
        id: 'test-rule',
        modelName: 'marketing',
        metricName: 'ctr',
        threshold: 1.0,
        comparison: 'lt' as const,
        severity: 'warning' as const,
        message: 'CTR too low'
      };
      
      mockDb.query.mockResolvedValue({
        rows: [{ agg_value: '1.5', count: 10 }],
        rowCount: 1
      });
      
      const triggered = await (alertService as any).evaluateRule(rule);
      
      expect(triggered).toBeNull();
    });
    
    it('should return null when no data available', async () => {
      const rule = {
        id: 'test-rule',
        modelName: 'marketing',
        metricName: 'ctr',
        threshold: 1.0,
        comparison: 'lt' as const,
        severity: 'warning' as const,
        message: 'CTR too low'
      };
      
      mockDb.query.mockResolvedValue({
        rows: [{ agg_value: null, count: 0 }],
        rowCount: 1
      });
      
      const triggered = await (alertService as any).evaluateRule(rule);
      
      expect(triggered).toBeNull();
    });
  });
  
  describe('compareValue', () => {
    it('should compare values correctly', () => {
      expect((alertService as any).compareValue(5, 10, 'lt')).toBe(true);
      expect((alertService as any).compareValue(10, 5, 'lt')).toBe(false);
      expect((alertService as any).compareValue(10, 5, 'gt')).toBe(true);
      expect((alertService as any).compareValue(5, 5, 'eq')).toBe(true);
      expect((alertService as any).compareValue(5, 10, 'lte')).toBe(true);
      expect((alertService as any).compareValue(10, 10, 'gte')).toBe(true);
    });
  });
  
  describe('sendAlert', () => {
    it('should send alert when not in debounce period', async () => {
      const rule = {
        id: 'test-rule',
        modelName: 'marketing',
        metricName: 'ctr',
        threshold: 1.0,
        comparison: 'lt' as const,
        severity: 'warning' as const,
        message: 'CTR too low'
      };
      
      const triggerData = {
        currentValue: 0.5,
        stats: { count: 10 },
        triggeredAt: new Date()
      };
      
      // Mock getLastAlert to return null (no previous alert)
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Mock insert alert
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      
      await (alertService as any).sendAlert(rule, triggerData);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kpi_insights'),
        expect.arrayContaining(['marketing'])
      );
      expect(mockSendEmail).toHaveBeenCalled();
    });
    
    it('should skip alert during debounce period', async () => {
      const rule = {
        id: 'test-rule',
        modelName: 'marketing',
        metricName: 'ctr',
        threshold: 1.0,
        comparison: 'lt' as const,
        severity: 'warning' as const,
        message: 'CTR too low',
        metadata: { debounceMinutes: 60 }
      };
      
      const triggerData = {
        currentValue: 0.5,
        stats: { count: 10 },
        triggeredAt: new Date()
      };
      
      // Mock getLastAlert to return recent alert
      const recentAlert = {
        created_at: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      };
      mockDb.query.mockResolvedValueOnce({ rows: [recentAlert], rowCount: 1 });
      
      await (alertService as any).sendAlert(rule, triggerData);
      
      // Should not insert new alert or send email
      expect(mockDb.query).toHaveBeenCalledTimes(1); // Only the getLastAlert call
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
  
  describe('checkAlerts', () => {
    it('should check all rules and trigger applicable alerts', async () => {
      const mockEvaluateRule = jest.spyOn(alertService as any, 'evaluateRule');
      const mockSendAlert = jest.spyOn(alertService as any, 'sendAlert');
      
      // Mock evaluateRule to return triggered for first rule, null for second
      mockEvaluateRule
        .mockResolvedValueOnce({ triggered: true })
        .mockResolvedValueOnce(null);
      
      mockSendAlert.mockResolvedValue(undefined);
      
      await alertService.checkAlerts();
      
      expect(mockEvaluateRule).toHaveBeenCalledTimes(5); // Default rules count
      expect(mockSendAlert).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('addRule and removeRule', () => {
    it('should add and remove rules dynamically', async () => {
      const newRule = {
        id: 'dynamic-rule',
        modelName: 'test',
        metricName: 'test_metric',
        threshold: 100,
        comparison: 'gt' as const,
        severity: 'critical' as const,
        message: 'Test alert'
      };
      
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });
      
      const initialCount = alertService.getRules().length;
      
      await alertService.addRule(newRule);
      expect(alertService.getRules()).toHaveLength(initialCount + 1);
      
      alertService.removeRule('dynamic-rule');
      expect(alertService.getRules()).toHaveLength(initialCount);
    });
  });
});