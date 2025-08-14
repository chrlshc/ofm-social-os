/**
 * Tests pour le système de stratégie de backpressure avancée
 * et le couplage avec les SLO
 */

import { BackpressureStrategyManager, ActiveStrategy } from '../streaming/backpressureStrategy';
import { SLOBackpressureCoupling, SLOBackpressureRule } from '../monitoring/sloBackpressureCoupling';
import { BackpressureStrategyAPI } from '../api/backpressureStrategyAPI';
import { BackpressureManager } from '../streaming/backpressureManager';
import { SLOManager } from '../monitoring/slo';
import { NatsStreamingClient } from '../streaming/natsClient';
import express from 'express';
import request from 'supertest';

describe('Advanced Backpressure Strategy System', () => {
  let strategyManager: BackpressureStrategyManager;
  let backpressureManager: BackpressureManager;
  let sloManager: SLOManager;
  let coupling: SLOBackpressureCoupling;
  let strategyAPI: BackpressureStrategyAPI;
  let app: express.Application;
  let natsClient: NatsStreamingClient;

  beforeAll(async () => {
    // Setup components
    natsClient = new NatsStreamingClient({
      servers: ['nats://localhost:4222'],
      clientName: 'test-strategy'
    });

    backpressureManager = new BackpressureManager(natsClient, {
      maxMemoryUsageMB: 256,
      maxQueueSize: 1000,
      maxPublishRate: 100,
      maxCpuUsagePercent: 80,
      enableCircuitBreaker: true,
      enableSampling: true,
      enablePrioritization: true,
      enableBatching: true,
      recoveryThresholdPercent: 70,
      recoveryDelayMs: 5000,
      maxBackoffMs: 30000
    });

    sloManager = new SLOManager();
    strategyManager = new BackpressureStrategyManager(sloManager);
    coupling = new SLOBackpressureCoupling(sloManager, backpressureManager, strategyManager);
    strategyAPI = new BackpressureStrategyAPI(strategyManager, backpressureManager, sloManager);

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/strategy', strategyAPI.getRouter());
  });

  afterAll(async () => {
    coupling.stopMonitoring();
    await backpressureManager.shutdown();
    await natsClient.disconnect();
  });

  describe('BackpressureStrategyManager', () => {
    test('should analyze current strategy correctly', async () => {
      const metrics = {
        currentMemoryMB: 200,
        currentQueueSize: 500,
        currentPublishRate: 80,
        currentCpuPercent: 60,
        droppedMessages: 10,
        sampledMessages: 5,
        circuitBreakerOpen: false,
        degradationLevel: 'low' as const
      };

      const thresholds = {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      };

      const strategy = await strategyManager.analyzeCurrentStrategy(metrics, thresholds);

      expect(strategy).toBeDefined();
      expect(strategy.degradationLevel).toBe('low');
      expect(strategy.reasons).toBeInstanceOf(Array);
      expect(strategy.activeStrategies).toBeDefined();
      expect(strategy.sloImpact).toBeDefined();
      expect(strategy.predictedActions).toBeDefined();
    });

    test('should identify primary reason correctly', async () => {
      const metrics = {
        currentMemoryMB: 240, // 93.75% of 256MB threshold - should be primary
        currentQueueSize: 700, // 70% of 1000 - secondary
        currentPublishRate: 50, // 50% - normal
        currentCpuPercent: 40, // 50% - normal
        droppedMessages: 0,
        sampledMessages: 0,
        circuitBreakerOpen: false,
        degradationLevel: 'medium' as const
      };

      const thresholds = {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      };

      const strategy = await strategyManager.analyzeCurrentStrategy(metrics, thresholds);

      expect(strategy.primaryReason.type).toBe('memory');
      expect(strategy.primaryReason.severity).toMatch(/high|critical/);
    });

    test('should calculate strategy effectiveness', async () => {
      const metrics = {
        currentMemoryMB: 128,
        currentQueueSize: 200,
        currentPublishRate: 40,
        currentCpuPercent: 30,
        droppedMessages: 50,
        sampledMessages: 20,
        circuitBreakerOpen: false,
        degradationLevel: 'medium' as const
      };

      const thresholds = {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      };

      const strategy = await strategyManager.analyzeCurrentStrategy(metrics, thresholds);

      expect(strategy.activeStrategies.sampling.effectivenessScore).toBeGreaterThanOrEqual(0);
      expect(strategy.activeStrategies.sampling.effectivenessScore).toBeLessThanOrEqual(1);
      expect(strategy.activeStrategies.batching.throughputImprovement).toBeGreaterThanOrEqual(0);
    });

    test('should emit events on strategy changes', (done) => {
      strategyManager.once('strategy_changed', (event) => {
        expect(event.previous).toBeDefined();
        expect(event.current).toBeDefined();
        expect(event.trigger).toBeDefined();
        done();
      });

      // Trigger a strategy change by analyzing with different levels
      const createMetrics = (level: string) => ({
        currentMemoryMB: level === 'critical' ? 300 : 100,
        currentQueueSize: level === 'critical' ? 1200 : 100,
        currentPublishRate: 50,
        currentCpuPercent: 40,
        droppedMessages: 0,
        sampledMessages: 0,
        circuitBreakerOpen: false,
        degradationLevel: level as any
      });

      const thresholds = {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      };

      // First analysis
      strategyManager.analyzeCurrentStrategy(createMetrics('none'), thresholds)
        .then(() => {
          // Second analysis with different level
          return strategyManager.analyzeCurrentStrategy(createMetrics('critical'), thresholds);
        })
        .catch(done);
    });

    test('should track performance stats', async () => {
      // Generate some history
      const metrics = {
        currentMemoryMB: 150,
        currentQueueSize: 300,
        currentPublishRate: 60,
        currentCpuPercent: 50,
        droppedMessages: 5,
        sampledMessages: 2,
        circuitBreakerOpen: false,
        degradationLevel: 'low' as const
      };

      const thresholds = {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      };

      await strategyManager.analyzeCurrentStrategy(metrics, thresholds);

      const stats = strategyManager.getPerformanceStats();

      expect(stats).toHaveProperty('averageResolutionTime');
      expect(stats).toHaveProperty('automaticResolutionRate');
      expect(stats).toHaveProperty('strategyEffectiveness');
      expect(stats).toHaveProperty('mostCommonTriggers');
      expect(Array.isArray(stats.mostCommonTriggers)).toBe(true);
    });
  });

  describe('SLOBackpressureCoupling', () => {
    test('should initialize with default rules', () => {
      const rules = coupling.getRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(rule => rule.priority === 'critical')).toBe(true);
      expect(rules.some(rule => rule.action.type === 'emergency_mode')).toBe(true);
    });

    test('should add and remove rules correctly', () => {
      const testRule: SLOBackpressureRule = {
        id: 'test_rule',
        name: 'Test Rule',
        enabled: true,
        priority: 'medium',
        trigger: {
          sloNames: ['test_slo'],
          budgetThreshold: 0.5,
          violationCount: 1,
          timeWindow: '5m'
        },
        action: {
          type: 'adjust_config',
          parameters: {
            configAdjustments: { maxQueueSize: 500 }
          },
          autoRevert: true,
          revertConditions: {
            budgetRecovery: 0.7,
            timeDelay: 300000,
            manualApproval: false
          }
        },
        metadata: {
          description: 'Test rule for unit testing',
          businessImpact: 'None - test only',
          triggerCount: 0,
          effectiveness: 0.8
        }
      };

      const initialCount = coupling.getRules().length;
      
      coupling.addRule(testRule);
      expect(coupling.getRules().length).toBe(initialCount + 1);
      
      const removed = coupling.removeRule('test_rule');
      expect(removed).toBe(true);
      expect(coupling.getRules().length).toBe(initialCount);
    });

    test('should start and stop monitoring', () => {
      coupling.startMonitoring();
      // Note: In a real test, we would check internal state
      // For now, just ensure no errors are thrown
      
      coupling.stopMonitoring();
      // Again, ensure no errors
    });

    test('should create adaptive thresholds', async () => {
      const threshold = await coupling.createAdaptiveThreshold(
        'test_slo',
        0.8, // 80% of original target
        'Test adjustment for load management',
        12 // 12 hours validity
      );

      expect(threshold).toBeDefined();
      expect(threshold.sloName).toBe('test_slo');
      expect(threshold.adjustmentFactor).toBe(0.8);
      expect(threshold.reason).toContain('Test adjustment');
      expect(threshold.validUntil).toBeInstanceOf(Date);
      expect(threshold.confidence).toBeGreaterThan(0);
    });

    test('should track coupling metrics', () => {
      const metrics = coupling.getCouplingMetrics();
      
      expect(metrics).toHaveProperty('activeRules');
      expect(metrics).toHaveProperty('triggeredRules');
      expect(metrics).toHaveProperty('preventedViolations');
      expect(metrics).toHaveProperty('budgetPreserved');
      expect(metrics).toHaveProperty('adjustmentEffectiveness');
      expect(metrics.activeRules).toBeGreaterThanOrEqual(0);
    });

    test('should maintain action history', () => {
      const history = coupling.getActionHistory(10);
      
      expect(Array.isArray(history)).toBe(true);
      // History might be empty in a fresh test, that's okay
    });
  });

  describe('BackpressureStrategyAPI', () => {
    test('should return current strategy', async () => {
      const response = await request(app)
        .get('/api/strategy/current')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.timestamp).toBeDefined();
    });

    test('should handle strategy query parameters', async () => {
      const response = await request(app)
        .get('/api/strategy/current?includeHistory=true&includePredictions=true&historyLimit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.strategy).toBeDefined();
      
      // If there's history, it should be included
      if (response.body.data.recentHistory) {
        expect(Array.isArray(response.body.data.recentHistory)).toBe(true);
        expect(response.body.data.recentHistory.length).toBeLessThanOrEqual(10);
      }
    });

    test('should provide detailed analysis', async () => {
      // First ensure we have a strategy
      await strategyManager.analyzeCurrentStrategy({
        currentMemoryMB: 150,
        currentQueueSize: 300,
        currentPublishRate: 60,
        currentCpuPercent: 50,
        droppedMessages: 5,
        sampledMessages: 2,
        circuitBreakerOpen: false,
        degradationLevel: 'low' as const
      }, {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      });

      const response = await request(app)
        .get('/api/strategy/analysis/detailed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.strategy).toBeDefined();
      expect(response.body.data.deepAnalysis).toBeDefined();
      expect(response.body.data.contextualData).toBeDefined();
      expect(response.body.data.actionPlan).toBeDefined();
    });

    test('should provide reason analysis', async () => {
      // Ensure we have a strategy with reasons
      await strategyManager.analyzeCurrentStrategy({
        currentMemoryMB: 220, // High memory usage
        currentQueueSize: 800, // High queue usage
        currentPublishRate: 90, // High publish rate
        currentCpuPercent: 75,  // High CPU
        droppedMessages: 20,
        sampledMessages: 10,
        circuitBreakerOpen: false,
        degradationLevel: 'high' as const
      }, {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      });

      const response = await request(app)
        .get('/api/strategy/analysis/reasons')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.current).toBeDefined();
      expect(response.body.data.breakdown).toBeDefined();
      expect(response.body.data.correlations).toBeDefined();
      expect(response.body.data.predictions).toBeDefined();
    });

    test('should provide effectiveness analysis', async () => {
      const response = await request(app)
        .get('/api/strategy/analysis/effectiveness')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.current).toBeDefined();
      expect(response.body.data.historical).toBeDefined();
      expect(response.body.data.optimization).toBeDefined();
    });

    test('should provide SLO coupling information', async () => {
      const response = await request(app)
        .get('/api/strategy/slo-coupling')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.currentState).toBeDefined();
      expect(response.body.data.coupling).toBeDefined();
      expect(response.body.data.recommendations).toBeDefined();
      expect(response.body.data.automation).toBeDefined();
    });

    test('should execute manual actions', async () => {
      const actionData = {
        action: 'force_recovery',
        reason: 'Manual intervention for testing',
        parameters: {
          immediate: true
        }
      };

      const response = await request(app)
        .post('/api/strategy/manual-action')
        .send(actionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('executed successfully');
      expect(response.body.data.action).toBe('force_recovery');
    });

    test('should validate manual action data', async () => {
      const invalidActionData = {
        action: 'invalid_action',
        reason: 'Test'
      };

      await request(app)
        .post('/api/strategy/manual-action')
        .send(invalidActionData)
        .expect(400);
    });

    test('should provide dashboard summary', async () => {
      const response = await request(app)
        .get('/api/strategy/dashboard/summary')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.status).toBeDefined();
      expect(response.body.data.metrics).toBeDefined();
      expect(response.body.data.trends).toBeDefined();
      expect(response.body.data.recommendations).toBeDefined();
    });

    test('should handle live stream setup', async () => {
      const response = await request(app)
        .get('/api/strategy/live-stream')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });

    test('should provide performance stats', async () => {
      const response = await request(app)
        .get('/api/strategy/performance/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    test('should provide predictions', async () => {
      const response = await request(app)
        .get('/api/strategy/predictions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    test('should provide manual recommendations', async () => {
      const response = await request(app)
        .get('/api/strategy/manual-recommendations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    test('should handle end-to-end strategy analysis and SLO coupling', async () => {
      // Start monitoring
      coupling.startMonitoring();

      // Simulate a high-load scenario
      const highLoadMetrics = {
        currentMemoryMB: 240,
        currentQueueSize: 950,
        currentPublishRate: 95,
        currentCpuPercent: 78,
        droppedMessages: 100,
        sampledMessages: 50,
        circuitBreakerOpen: false,
        degradationLevel: 'high' as const
      };

      const thresholds = {
        maxMemoryUsageMB: 256,
        maxQueueSize: 1000,
        maxPublishRate: 100,
        maxCpuUsagePercent: 80
      };

      // Analyze strategy
      const strategy = await strategyManager.analyzeCurrentStrategy(highLoadMetrics, thresholds);

      // Verify strategy details
      expect(strategy.degradationLevel).toBe('high');
      expect(strategy.reasons.length).toBeGreaterThan(0);
      expect(strategy.primaryReason.severity).toMatch(/high|critical/);

      // Check SLO impact
      expect(strategy.sloImpact.riskLevel).toMatch(/medium|high|critical/);

      // Verify active strategies
      expect(strategy.activeStrategies.sampling.enabled).toBe(true);
      expect(strategy.activeStrategies.sampling.rate).toBeLessThan(1.0);
      expect(strategy.activeStrategies.batching.enabled).toBe(true);
      expect(strategy.activeStrategies.prioritization.enabled).toBe(true);

      // Stop monitoring
      coupling.stopMonitoring();
    });

    test('should maintain consistency across API calls', async () => {
      // Get current strategy via API
      const strategyResponse = await request(app)
        .get('/api/strategy/current')
        .expect(200);

      const apiStrategy = strategyResponse.body.data.strategy;

      // Get the same strategy directly from manager
      const directStrategy = strategyManager.getCurrentStrategy();

      if (directStrategy && apiStrategy) {
        expect(apiStrategy.degradationLevel).toBe(directStrategy.degradationLevel);
        expect(apiStrategy.timestamp).toBe(directStrategy.timestamp.toISOString());
      }
    });

    test('should handle concurrent strategy updates', async () => {
      const promises = [];
      
      // Simulate multiple concurrent analyses
      for (let i = 0; i < 5; i++) {
        const metrics = {
          currentMemoryMB: 100 + i * 20,
          currentQueueSize: 200 + i * 100,
          currentPublishRate: 40 + i * 10,
          currentCpuPercent: 30 + i * 8,
          droppedMessages: i * 10,
          sampledMessages: i * 5,
          circuitBreakerOpen: false,
          degradationLevel: 'low' as const
        };

        const thresholds = {
          maxMemoryUsageMB: 256,
          maxQueueSize: 1000,
          maxPublishRate: 100,
          maxCpuUsagePercent: 80
        };

        promises.push(strategyManager.analyzeCurrentStrategy(metrics, thresholds));
      }

      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.degradationLevel).toBeDefined();
      });
    });
  });
});

describe('Performance Tests', () => {
  let strategyManager: BackpressureStrategyManager;
  let sloManager: SLOManager;

  beforeAll(() => {
    sloManager = new SLOManager();
    strategyManager = new BackpressureStrategyManager(sloManager);
  });

  test('should handle rapid strategy analysis', async () => {
    const startTime = Date.now();
    const iterations = 100;

    const metrics = {
      currentMemoryMB: 150,
      currentQueueSize: 300,
      currentPublishRate: 60,
      currentCpuPercent: 50,
      droppedMessages: 5,
      sampledMessages: 2,
      circuitBreakerOpen: false,
      degradationLevel: 'low' as const
    };

    const thresholds = {
      maxMemoryUsageMB: 256,
      maxQueueSize: 1000,
      maxPublishRate: 100,
      maxCpuUsagePercent: 80
    };

    for (let i = 0; i < iterations; i++) {
      await strategyManager.analyzeCurrentStrategy(metrics, thresholds);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const avgTime = duration / iterations;

    console.log(`Strategy analysis performance:
      - Iterations: ${iterations}
      - Total time: ${duration}ms
      - Average time: ${avgTime.toFixed(2)}ms per analysis`);

    expect(avgTime).toBeLessThan(100); // Should be under 100ms per analysis
  });

  test('should handle large history efficiently', async () => {
    // Generate a lot of history
    const metrics = {
      currentMemoryMB: 150,
      currentQueueSize: 300,
      currentPublishRate: 60,
      currentCpuPercent: 50,
      droppedMessages: 5,
      sampledMessages: 2,
      circuitBreakerOpen: false,
      degradationLevel: 'low' as const
    };

    const thresholds = {
      maxMemoryUsageMB: 256,
      maxQueueSize: 1000,
      maxPublishRate: 100,
      maxCpuUsagePercent: 80
    };

    // Generate 500 history entries
    for (let i = 0; i < 500; i++) {
      // Vary the degradation level to create history
      const varyingMetrics = {
        ...metrics,
        degradationLevel: i % 3 === 0 ? 'medium' as const : 'low' as const
      };
      await strategyManager.analyzeCurrentStrategy(varyingMetrics, thresholds);
    }

    const startTime = Date.now();
    const history = strategyManager.getStrategyHistory(100);
    const endTime = Date.now();

    expect(history.length).toBeLessThanOrEqual(100);
    expect(endTime - startTime).toBeLessThan(50); // Should be fast to retrieve
  });
});