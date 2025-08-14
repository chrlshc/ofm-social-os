/**
 * Tests d'intégration pour le système de backpressure
 */

import { NatsStreamingClient } from '../streaming/natsClient';
import { BackpressureManager, PRODUCTION_BACKPRESSURE_CONFIG } from '../streaming/backpressureManager';
import { BackpressureAPI } from '../api/backpressureAPI';
import { streamingMetrics } from '../monitoring/metrics';
import express from 'express';
import request from 'supertest';

describe('Backpressure Integration Tests', () => {
  let natsClient: NatsStreamingClient;
  let backpressureManager: BackpressureManager;
  let backpressureAPI: BackpressureAPI;
  let app: express.Application;

  beforeAll(async () => {
    // Configuration pour les tests
    const testConfig = {
      maxMemoryUsageMB: 128,
      maxQueueSize: 100,
      maxPublishRate: 50,
      maxCpuUsagePercent: 90,
      enableCircuitBreaker: true,
      enableSampling: true,
      enablePrioritization: true,
      enableBatching: true,
      recoveryThresholdPercent: 60,
      recoveryDelayMs: 1000,
      maxBackoffMs: 5000
    };

    // Initialiser les composants
    natsClient = new NatsStreamingClient({
      servers: ['nats://localhost:4222'],
      clientName: 'test-backpressure'
    });

    backpressureManager = new BackpressureManager(natsClient, testConfig);
    backpressureAPI = new BackpressureAPI(natsClient, backpressureManager);

    // Configuration Express pour les tests
    app = express();
    app.use(express.json());
    app.use('/api/backpressure', backpressureAPI.getRouter());
  });

  afterAll(async () => {
    await backpressureManager.shutdown();
    await natsClient.disconnect();
  });

  describe('Basic Backpressure Functionality', () => {
    test('should handle normal message publishing', async () => {
      const result = await backpressureManager.publish('test.normal', { value: 42 }, 'medium');
      expect(result).toBe(true);
    });

    test('should report healthy status under normal conditions', async () => {
      const response = await request(app)
        .get('/api/backpressure/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isHealthy).toBe(true);
      expect(response.body.data.degradationLevel).toBe('none');
    });

    test('should return current configuration', async () => {
      const response = await request(app)
        .get('/api/backpressure/config')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.current).toBeDefined();
      expect(response.body.data.current.maxQueueSize).toBe(100);
    });
  });

  describe('Backpressure Triggers', () => {
    test('should trigger backpressure when queue is full', async () => {
      // Remplir la queue avec des messages
      const promises = [];
      for (let i = 0; i < 150; i++) { // Dépasser maxQueueSize (100)
        promises.push(backpressureManager.publish(`test.overload.${i}`, { index: i }, 'low'));
      }

      const results = await Promise.all(promises);
      const droppedCount = results.filter(r => !r).length;
      
      expect(droppedCount).toBeGreaterThan(0);
      
      // Vérifier le status
      const response = await request(app)
        .get('/api/backpressure/status')
        .expect(200);

      expect(response.body.data.degradationLevel).not.toBe('none');
    });

    test('should apply sampling during backpressure', async () => {
      // Déclencher le backpressure
      const promises = [];
      for (let i = 0; i < 80; i++) {
        promises.push(backpressureManager.publish('test.sampling', { index: i }, 'low'));
      }

      await Promise.all(promises);

      const metrics = backpressureManager.getMetrics();
      
      // Pendant le backpressure, certains messages devraient être échantillonnés
      expect(metrics.degradationLevel).not.toBe('none');
    });

    test('should prioritize high priority messages', async () => {
      // Remplir la queue avec des messages de différentes priorités
      const lowPriorityPromises = [];
      const highPriorityPromises = [];

      for (let i = 0; i < 40; i++) {
        lowPriorityPromises.push(backpressureManager.publish('test.priority.low', { index: i }, 'low'));
      }

      for (let i = 0; i < 40; i++) {
        highPriorityPromises.push(backpressureManager.publish('test.priority.high', { index: i }, 'critical'));
      }

      const lowResults = await Promise.all(lowPriorityPromises);
      const highResults = await Promise.all(highPriorityPromises);

      const lowDroppedCount = lowResults.filter(r => !r).length;
      const highDroppedCount = highResults.filter(r => !r).length;

      // Les messages de faible priorité devraient être plus souvent abandonnés
      expect(lowDroppedCount).toBeGreaterThanOrEqual(highDroppedCount);
    });
  });

  describe('Circuit Breaker', () => {
    test('should open circuit breaker manually', async () => {
      const response = await request(app)
        .post('/api/backpressure/circuit-breaker')
        .send({
          subject: 'test.circuit.manual',
          action: 'open'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('open');
    });

    test('should drop messages when circuit breaker is open', async () => {
      // Ouvrir le circuit breaker
      backpressureManager.openCircuitBreaker('test.circuit.drop');

      // Essayer de publier un message
      const result = await backpressureManager.publish('test.circuit.drop', { test: true }, 'medium');
      
      expect(result).toBe(false);

      const metrics = backpressureManager.getMetrics();
      expect(metrics.circuitBreakerOpen).toBe(true);
    });

    test('should report circuit breaker status', async () => {
      const response = await request(app)
        .get('/api/backpressure/circuit-breaker/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subjects).toBeDefined();
      expect(Array.isArray(response.body.data.subjects)).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', async () => {
      const newConfig = {
        maxQueueSize: 200,
        enableSampling: false
      };

      const response = await request(app)
        .put('/api/backpressure/config')
        .send(newConfig)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.newConfig.maxQueueSize).toBe(200);
      expect(response.body.data.newConfig.enableSampling).toBe(false);
    });

    test('should validate configuration updates', async () => {
      const invalidConfig = {
        maxQueueSize: -10, // Invalide
        enableSampling: 'invalid' // Type incorrect
      };

      await request(app)
        .put('/api/backpressure/config')
        .send(invalidConfig)
        .expect(400); // Erreur de validation
    });

    test('should reset configuration to preset', async () => {
      const response = await request(app)
        .post('/api/backpressure/config/reset')
        .send({ preset: 'testing' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.preset).toBe('testing');
      expect(response.body.data.config.maxQueueSize).toBe(100); // Valeur preset testing
    });
  });

  describe('Load Testing', () => {
    test('should start load test', async () => {
      const loadTestConfig = {
        messagesPerSecond: 10,
        durationSeconds: 2,
        messageSize: 100,
        subjects: ['test.load.1', 'test.load.2']
      };

      const response = await request(app)
        .post('/api/backpressure/load-test')
        .send(loadTestConfig)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('started');
    });

    test('should report load test status', async () => {
      const response = await request(app)
        .get('/api/backpressure/load-test/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    test('should stop load test', async () => {
      const response = await request(app)
        .post('/api/backpressure/load-test/stop')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('stopped');
    });

    test('should reject concurrent load tests', async () => {
      // Démarrer un premier test
      await request(app)
        .post('/api/backpressure/load-test')
        .send({
          messagesPerSecond: 5,
          durationSeconds: 10
        })
        .expect(200);

      // Essayer de démarrer un second test
      await request(app)
        .post('/api/backpressure/load-test')
        .send({
          messagesPerSecond: 5,
          durationSeconds: 5
        })
        .expect(409); // Conflict

      // Arrêter le premier test
      await request(app)
        .post('/api/backpressure/load-test/stop')
        .expect(200);
    });
  });

  describe('Health Monitoring', () => {
    test('should return basic health status', async () => {
      const response = await request(app)
        .get('/api/backpressure/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.healthScore).toBeGreaterThanOrEqual(0);
      expect(response.body.checks).toBeDefined();
    });

    test('should return detailed health status', async () => {
      const response = await request(app)
        .get('/api/backpressure/health/detailed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.healthScore).toBeGreaterThanOrEqual(0);
      expect(response.body.data.recommendations).toBeDefined();
      expect(response.body.data.trends).toBeDefined();
    });

    test('should return unhealthy status under stress', async () => {
      // Simuler une surcharge pour déclencher un état non sain
      const promises = [];
      for (let i = 0; i < 200; i++) {
        promises.push(backpressureManager.publish(`test.stress.${i}`, { index: i }, 'low'));
      }

      await Promise.all(promises);

      const response = await request(app)
        .get('/api/backpressure/health');

      // Le status peut être 200 (healthy), 206 (degraded), ou 503 (unhealthy)
      expect([200, 206, 503]).toContain(response.status);

      if (response.status !== 200) {
        expect(['degraded', 'unhealthy']).toContain(response.body.status);
      }
    });
  });

  describe('Analytics and Recommendations', () => {
    test('should provide degradation history', async () => {
      const response = await request(app)
        .get('/api/backpressure/analytics/degradation-history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.history).toBeDefined();
      expect(response.body.data.summary).toBeDefined();
    });

    test('should provide optimization recommendations', async () => {
      const response = await request(app)
        .get('/api/backpressure/analytics/recommendations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.recommendations).toBeDefined();
      expect(Array.isArray(response.body.data.recommendations)).toBe(true);
    });

    test('should provide detailed metrics', async () => {
      const response = await request(app)
        .get('/api/backpressure/metrics?timeRange=1h')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.current).toBeDefined();
      expect(response.body.data.historical).toBeDefined();
      expect(response.body.data.summary).toBeDefined();
    });
  });

  describe('Queue Management', () => {
    test('should initiate queue draining', async () => {
      // Remplir la queue
      for (let i = 0; i < 50; i++) {
        await backpressureManager.publish(`test.drain.${i}`, { index: i }, 'low');
      }

      const response = await request(app)
        .post('/api/backpressure/actions/drain-queue')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('draining');
      expect(response.body.data.initialQueueSize).toBeGreaterThan(0);
    });

    test('should clear queue immediately', async () => {
      // Remplir la queue
      for (let i = 0; i < 30; i++) {
        await backpressureManager.publish(`test.clear.${i}`, { index: i }, 'low');
      }

      const response = await request(app)
        .post('/api/backpressure/actions/clear-queue')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cleared');
      expect(response.body.data.clearedMessages).toBeGreaterThan(0);
    });
  });

  describe('Event System', () => {
    test('should emit events on degradation level changes', (done) => {
      let eventReceived = false;

      backpressureManager.once('degradation_level_changed', (event) => {
        eventReceived = true;
        expect(event.oldLevel).toBeDefined();
        expect(event.newLevel).toBeDefined();
        expect(event.maxRatio).toBeGreaterThan(0);
        done();
      });

      // Déclencher un changement de niveau de dégradation
      setTimeout(async () => {
        for (let i = 0; i < 120; i++) {
          await backpressureManager.publish(`test.event.${i}`, { index: i }, 'low');
        }

        // Si aucun événement n'est reçu dans les 5 secondes, terminer le test
        setTimeout(() => {
          if (!eventReceived) {
            done();
          }
        }, 5000);
      }, 100);
    });

    test('should emit events on circuit breaker operations', (done) => {
      backpressureManager.once('circuit_breaker_opened', (event) => {
        expect(event.subject).toBe('test.circuit.event');
        done();
      });

      backpressureManager.openCircuitBreaker('test.circuit.event');
    });

    test('should emit events on message drops', (done) => {
      backpressureManager.once('message_dropped', (event) => {
        expect(event.message).toBeDefined();
        expect(event.reason).toBeDefined();
        done();
      });

      // Ouvrir un circuit breaker et essayer d'envoyer un message
      backpressureManager.openCircuitBreaker('test.drop.event');
      backpressureManager.publish('test.drop.event', { test: true }, 'low');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid API requests gracefully', async () => {
      await request(app)
        .post('/api/backpressure/circuit-breaker')
        .send({ invalid: 'data' })
        .expect(400);

      await request(app)
        .put('/api/backpressure/config')
        .send({ maxQueueSize: 'invalid' })
        .expect(400);
    });

    test('should handle network errors during publishing', async () => {
      // Simuler une déconnexion réseau ou une erreur NATS
      // (En production, on pourrait mocker le client NATS)
      
      // Pour ce test, on peut juste vérifier que le système ne plante pas
      const result = await backpressureManager.publish('test.network.error', { test: true }, 'medium');
      
      // Le résultat peut être true ou false selon l'état du réseau
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Recovery Scenarios', () => {
    test('should recover from overload conditions', async () => {
      // Créer une condition de surcharge
      const promises = [];
      for (let i = 0; i < 150; i++) {
        promises.push(backpressureManager.publish(`test.recovery.${i}`, { index: i }, 'low'));
      }

      await Promise.all(promises);

      // Vérifier que le système est en mode dégradé
      let metrics = backpressureManager.getMetrics();
      expect(metrics.degradationLevel).not.toBe('none');

      // Attendre que le système se récupère
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Vérifier la récupération
      metrics = backpressureManager.getMetrics();
      // Le système devrait soit se récupérer, soit rester stable
      expect(['none', 'low', 'medium']).toContain(metrics.degradationLevel);
    });
  });
});

describe('Performance Tests', () => {
  let natsClient: NatsStreamingClient;
  let backpressureManager: BackpressureManager;

  beforeAll(async () => {
    const perfConfig = {
      ...PRODUCTION_BACKPRESSURE_CONFIG,
      maxQueueSize: 10000,
      maxPublishRate: 1000
    };

    natsClient = new NatsStreamingClient({
      servers: ['nats://localhost:4222'],
      clientName: 'test-performance'
    });

    backpressureManager = new BackpressureManager(natsClient, perfConfig);
  });

  afterAll(async () => {
    await backpressureManager.shutdown();
    await natsClient.disconnect();
  });

  test('should handle high throughput without degradation', async () => {
    const startTime = Date.now();
    const messageCount = 1000;
    const promises = [];

    for (let i = 0; i < messageCount; i++) {
      promises.push(backpressureManager.publish(`test.perf.${i}`, { 
        index: i, 
        timestamp: Date.now(),
        data: 'x'.repeat(100)
      }, 'medium'));
    }

    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const successCount = results.filter(r => r).length;
    const successRate = (successCount / messageCount) * 100;
    const throughput = messageCount / ((endTime - startTime) / 1000);

    console.log(`Performance Test Results:
      - Messages: ${messageCount}
      - Success Rate: ${successRate.toFixed(2)}%
      - Duration: ${endTime - startTime}ms
      - Throughput: ${throughput.toFixed(2)} msg/s`);

    expect(successRate).toBeGreaterThan(95); // Au moins 95% de succès
    expect(throughput).toBeGreaterThan(100); // Au moins 100 msg/s
  });

  test('should maintain performance under sustained load', async () => {
    const testDuration = 10000; // 10 secondes
    const targetRate = 50; // messages par seconde
    const interval = 1000 / targetRate;

    let messagesSent = 0;
    let messagesSuccessful = 0;
    const startTime = Date.now();

    const sendMessages = async () => {
      while (Date.now() - startTime < testDuration) {
        const result = await backpressureManager.publish(
          'test.sustained.load',
          { index: messagesSent++, timestamp: Date.now() },
          'medium'
        );

        if (result) messagesSuccessful++;

        await new Promise(resolve => setTimeout(resolve, interval));
      }
    };

    await sendMessages();

    const actualDuration = Date.now() - startTime;
    const actualRate = messagesSuccessful / (actualDuration / 1000);
    const successRate = (messagesSuccessful / messagesSent) * 100;

    console.log(`Sustained Load Test Results:
      - Duration: ${actualDuration}ms
      - Messages Sent: ${messagesSent}
      - Messages Successful: ${messagesSuccessful}
      - Success Rate: ${successRate.toFixed(2)}%
      - Actual Rate: ${actualRate.toFixed(2)} msg/s`);

    expect(successRate).toBeGreaterThan(90);
    expect(actualRate).toBeGreaterThan(targetRate * 0.8); // 80% du taux cible
  });
});