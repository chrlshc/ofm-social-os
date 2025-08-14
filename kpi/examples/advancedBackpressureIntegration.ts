/**
 * Exemple d'intégration complète du système de backpressure avancé
 * avec stratégie temps réel et couplage SLO
 */

import { BackpressureManager, PRODUCTION_BACKPRESSURE_CONFIG } from '../streaming/backpressureManager';
import { BackpressureStrategyManager } from '../streaming/backpressureStrategy';
import { SLOBackpressureCoupling } from '../monitoring/sloBackpressureCoupling';
import { BackpressureAPI } from '../api/backpressureAPI';
import { BackpressureStrategyAPI } from '../api/backpressureStrategyAPI';
import { SLOManager } from '../monitoring/slo';
import { NatsStreamingClient } from '../streaming/natsClient';
import express from 'express';
import WebSocket from 'ws';

/**
 * Configuration avancée pour environnement de production
 */
const ADVANCED_PRODUCTION_CONFIG = {
  ...PRODUCTION_BACKPRESSURE_CONFIG,
  // Ajustements pour couplage SLO
  maxMemoryUsageMB: 2048,      // 2GB pour gestion high-volume
  maxQueueSize: 100000,        // 100K messages
  maxPublishRate: 10000,       // 10K msg/s
  enableSampling: true,        // Sampling adaptatif activé
  enablePrioritization: true,  // Priorisation activée
  enableBatching: true,        // Batching adaptatif activé
  
  // Nouveaux paramètres pour couplage SLO
  sloIntegration: {
    enabled: true,
    budgetThreshold: 0.2,      // Déclencher à 20% budget restant
    adjustmentAggressiveness: 0.7, // Niveau d'agressivité des ajustements
    autoRevert: true,          // Auto-revert quand SLO récupèrent
    emergencyMode: {
      budgetThreshold: 0.05,   // Mode urgence à 5% budget
      maxDuration: 1800000     // 30 minutes max en mode urgence
    }
  }
};

/**
 * Classe principale d'orchestration du système avancé
 */
export class AdvancedBackpressureOrchestrator {
  private natsClient: NatsStreamingClient;
  private backpressureManager: BackpressureManager;
  private strategyManager: BackpressureStrategyManager;
  private sloManager: SLOManager;
  private coupling: SLOBackpressureCoupling;
  private backpressureAPI: BackpressureAPI;
  private strategyAPI: BackpressureStrategyAPI;
  private app: express.Application;
  private wsServer: WebSocket.Server | null = null;
  private isRunning = false;

  constructor() {
    this.initializeComponents();
    this.setupEventHandlers();
    this.createExpressApp();
  }

  /**
   * Initialiser tous les composants
   */
  private initializeComponents(): void {
    // NATS Client
    this.natsClient = new NatsStreamingClient({
      servers: process.env.NATS_SERVERS?.split(',') || ['nats://localhost:4222'],
      clientName: process.env.BACKPRESSURE_CLIENT_NAME || 'kpi-backpressure-prod',
      reconnectAttempts: -1,
      reconnectTimeWait: 2000
    });

    // Backpressure Manager
    this.backpressureManager = new BackpressureManager(
      this.natsClient,
      ADVANCED_PRODUCTION_CONFIG
    );

    // SLO Manager
    this.sloManager = new SLOManager();

    // Strategy Manager
    this.strategyManager = new BackpressureStrategyManager(this.sloManager);

    // SLO-Backpressure Coupling
    this.coupling = new SLOBackpressureCoupling(
      this.sloManager,
      this.backpressureManager,
      this.strategyManager
    );

    // APIs
    this.backpressureAPI = new BackpressureAPI(this.natsClient, this.backpressureManager);
    this.strategyAPI = new BackpressureStrategyAPI(
      this.strategyManager,
      this.backpressureManager,
      this.sloManager
    );
  }

  /**
   * Configuration des event handlers pour l'orchestration
   */
  private setupEventHandlers(): void {
    // Strategy Manager Events
    this.strategyManager.on('strategy_changed', (event) => {
      console.log(`🔄 Strategy changed: ${event.previous.degradationLevel} → ${event.current.degradationLevel}`);
      this.broadcastToClients('strategy_changed', event);
      
      // Log détaillé pour les changements critiques
      if (event.current.degradationLevel === 'critical') {
        console.error('🚨 CRITICAL: System in critical degradation state', {
          primaryReason: event.current.primaryReason,
          sloImpact: event.current.sloImpact,
          recommendations: event.current.predictedActions.recommendedManualActions
        });
      }
    });

    this.strategyManager.on('strategy_updated', (strategy) => {
      this.broadcastToClients('strategy_updated', {
        degradationLevel: strategy.degradationLevel,
        primaryReason: strategy.primaryReason,
        activeStrategies: strategy.activeStrategies,
        sloImpact: strategy.sloImpact,
        timestamp: strategy.timestamp
      });
    });

    // Backpressure Manager Events
    this.backpressureManager.on('degradation_level_changed', (event) => {
      console.log(`📊 Degradation level: ${event.oldLevel} → ${event.newLevel} (ratio: ${event.maxRatio.toFixed(2)})`);
    });

    this.backpressureManager.on('circuit_breaker_opened', (event) => {
      console.warn(`⚡ Circuit breaker opened for subject: ${event.subject}`);
      this.notifyOpsTeam('circuit_breaker_opened', event);
    });

    this.backpressureManager.on('message_dropped', (event) => {
      if (event.reason === 'circuit_breaker') {
        console.warn(`🗑️ Message dropped due to circuit breaker: ${event.message.subject}`);
      }
    });

    // SLO-Coupling Events
    this.coupling.on('rule_triggered', (event) => {
      console.log(`🎯 SLO-Coupling rule triggered: ${event.rule.name}`);
      console.log(`   Action: ${event.rule.action.type}`);
      console.log(`   Trigger: ${event.rule.metadata.description}`);
      
      this.broadcastToClients('slo_rule_triggered', {
        ruleName: event.rule.name,
        actionType: event.rule.action.type,
        priority: event.rule.priority,
        businessImpact: event.rule.metadata.businessImpact
      });
    });

    this.coupling.on('rule_reverted', (event) => {
      console.log(`↩️ SLO-Coupling rule reverted: ${event.rule.name}`);
    });

    // SLO Manager Events (si disponibles)
    this.sloManager.on('slo_violation', (violation) => {
      console.warn(`🎯 SLO violation: ${violation.slo.name} (compliance: ${violation.compliance}%)`);
    });
  }

  /**
   * Créer l'application Express
   */
  private createExpressApp(): void {
    this.app = express();
    
    // Middleware de base
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS pour les dashboards
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });

    // Health check
    this.app.get('/health', (req, res) => {
      const strategy = this.strategyManager.getCurrentStrategy();
      const couplingMetrics = this.coupling.getCouplingMetrics();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          backpressure: this.backpressureManager.getMetrics().degradationLevel,
          strategy: strategy?.degradationLevel || 'none',
          coupling: this.coupling.getRules().length > 0 ? 'active' : 'inactive',
          slo: couplingMetrics.activeRules
        }
      });
    });

    // API Routes
    this.app.use('/api/backpressure', this.backpressureAPI.getRouter());
    this.app.use('/api/strategy', this.strategyAPI.getRouter());

    // Route spéciale pour le couplage SLO
    this.app.get('/api/coupling/status', (req, res) => {
      res.json({
        success: true,
        data: {
          metrics: this.coupling.getCouplingMetrics(),
          rules: this.coupling.getRules(),
          adaptiveThresholds: this.coupling.getAdaptiveThresholds(),
          actionHistory: this.coupling.getActionHistory(20)
        }
      });
    });

    // Dashboard temps réel
    this.app.get('/dashboard/real-time', (req, res) => {
      res.send(this.generateRealtimeDashboardHTML());
    });
  }

  /**
   * Démarrer le système complet
   */
  async start(port: number = 3000): Promise<void> {
    if (this.isRunning) {
      console.log('Advanced backpressure system is already running');
      return;
    }

    try {
      // Démarrer NATS
      console.log('🚀 Starting NATS connection...');
      await this.natsClient.connect();

      // Démarrer le monitoring SLO
      console.log('🎯 Starting SLO monitoring...');
      this.coupling.startMonitoring();

      // Démarrer le serveur HTTP
      console.log(`🌐 Starting HTTP server on port ${port}...`);
      const server = this.app.listen(port, () => {
        console.log(`✅ Advanced Backpressure System running on port ${port}`);
      });

      // Démarrer WebSocket pour temps réel
      this.wsServer = new WebSocket.Server({ server });
      this.setupWebSocketHandlers();

      this.isRunning = true;

      // Analyser la stratégie initiale
      await this.performInitialAnalysis();

      console.log('🎉 Advanced Backpressure System fully operational!');
      console.log('📊 Dashboard: http://localhost:' + port + '/dashboard/real-time');
      console.log('🔧 API: http://localhost:' + port + '/api/');

    } catch (error) {
      console.error('❌ Failed to start Advanced Backpressure System:', error);
      throw error;
    }
  }

  /**
   * Arrêter le système proprement
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Advanced Backpressure System...');

    try {
      // Arrêter le monitoring
      this.coupling.stopMonitoring();

      // Arrêter le backpressure manager
      await this.backpressureManager.shutdown();

      // Déconnecter NATS
      await this.natsClient.disconnect();

      // Fermer WebSocket
      if (this.wsServer) {
        this.wsServer.close();
      }

      this.isRunning = false;
      console.log('✅ Advanced Backpressure System stopped gracefully');

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Configuration WebSocket pour temps réel
   */
  private setupWebSocketHandlers(): void {
    if (!this.wsServer) return;

    this.wsServer.on('connection', (ws) => {
      console.log('📡 New WebSocket client connected');

      // Envoyer l'état initial
      const currentStrategy = this.strategyManager.getCurrentStrategy();
      if (currentStrategy) {
        ws.send(JSON.stringify({
          type: 'initial_state',
          data: {
            strategy: currentStrategy,
            couplingMetrics: this.coupling.getCouplingMetrics(),
            backpressureMetrics: this.backpressureManager.getMetrics()
          }
        }));
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          }));
        }
      }, 30000);

      ws.on('close', () => {
        console.log('📡 WebSocket client disconnected');
        clearInterval(heartbeat);
      });

      ws.on('error', (error) => {
        console.error('📡 WebSocket error:', error);
      });
    });
  }

  /**
   * Diffuser aux clients WebSocket
   */
  private broadcastToClients(type: string, data: any): void {
    if (!this.wsServer) return;

    const message = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString()
    });

    this.wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Notifier l'équipe ops (exemple)
   */
  private notifyOpsTeam(eventType: string, data: any): void {
    // Dans un vrai système, ceci enverrait vers Slack, PagerDuty, etc.
    console.log(`🚨 OPS NOTIFICATION [${eventType}]:`, JSON.stringify(data, null, 2));
  }

  /**
   * Analyse initiale au démarrage
   */
  private async performInitialAnalysis(): Promise<void> {
    console.log('🔍 Performing initial strategy analysis...');

    const metrics = this.backpressureManager.getMetrics();
    const config = this.backpressureManager.getConfig();
    
    try {
      const sloEvaluation = await this.sloManager.evaluateAllSLOs();
      const strategy = await this.strategyManager.analyzeCurrentStrategy(
        metrics,
        config,
        sloEvaluation.violations
      );

      console.log(`✅ Initial analysis complete:
        - Degradation Level: ${strategy.degradationLevel}
        - Primary Reason: ${strategy.primaryReason.type}
        - SLO Risk Level: ${strategy.sloImpact.riskLevel}
        - Active Strategies: ${Object.keys(strategy.activeStrategies).filter(key => 
          strategy.activeStrategies[key as keyof typeof strategy.activeStrategies].enabled
        ).join(', ')}`);

    } catch (error) {
      console.error('❌ Initial analysis failed:', error);
    }
  }

  /**
   * Générer HTML pour dashboard temps réel (exemple simple)
   */
  private generateRealtimeDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Advanced Backpressure Dashboard</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .dashboard { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
        .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .card h3 { margin-top: 0; color: #333; }
        .status-none { border-left: 4px solid #28a745; }
        .status-low { border-left: 4px solid #ffc107; }
        .status-medium { border-left: 4px solid #fd7e14; }
        .status-high { border-left: 4px solid #dc3545; }
        .status-critical { border-left: 4px solid #721c24; }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .metric-value { font-weight: bold; }
        #log { height: 300px; overflow-y: auto; background: #1e1e1e; color: #fff; padding: 10px; font-family: monospace; }
    </style>
</head>
<body>
    <h1>🚀 Advanced Backpressure Dashboard</h1>
    
    <div class="dashboard">
        <div class="card" id="strategy-card">
            <h3>Current Strategy</h3>
            <div class="metric">
                <span>Degradation Level:</span>
                <span class="metric-value" id="degradation-level">-</span>
            </div>
            <div class="metric">
                <span>Primary Reason:</span>
                <span class="metric-value" id="primary-reason">-</span>
            </div>
            <div class="metric">
                <span>SLO Risk:</span>
                <span class="metric-value" id="slo-risk">-</span>
            </div>
        </div>
        
        <div class="card">
            <h3>Active Strategies</h3>
            <div class="metric">
                <span>Sampling Rate:</span>
                <span class="metric-value" id="sampling-rate">-</span>
            </div>
            <div class="metric">
                <span>Batch Size:</span>
                <span class="metric-value" id="batch-size">-</span>
            </div>
            <div class="metric">
                <span>Circuit Breakers:</span>
                <span class="metric-value" id="circuit-breakers">-</span>
            </div>
        </div>
        
        <div class="card">
            <h3>SLO Coupling</h3>
            <div class="metric">
                <span>Active Rules:</span>
                <span class="metric-value" id="active-rules">-</span>
            </div>
            <div class="metric">
                <span>Budget Consumption:</span>
                <span class="metric-value" id="budget-consumption">-</span>
            </div>
            <div class="metric">
                <span>Last Action:</span>
                <span class="metric-value" id="last-action">-</span>
            </div>
        </div>
    </div>
    
    <div class="card" style="margin-top: 20px;">
        <h3>Real-time Log</h3>
        <div id="log"></div>
    </div>

    <script>
        const ws = new WebSocket('ws://localhost:3000');
        const log = document.getElementById('log');
        
        function addLog(message) {
            const timestamp = new Date().toLocaleTimeString();
            log.innerHTML += timestamp + ' - ' + message + '\\n';
            log.scrollTop = log.scrollHeight;
        }
        
        function updateStrategy(strategy) {
            document.getElementById('degradation-level').textContent = strategy.degradationLevel;
            document.getElementById('primary-reason').textContent = strategy.primaryReason.type;
            document.getElementById('slo-risk').textContent = strategy.sloImpact.riskLevel;
            
            document.getElementById('sampling-rate').textContent = (strategy.activeStrategies.sampling.rate * 100).toFixed(1) + '%';
            document.getElementById('batch-size').textContent = strategy.activeStrategies.batching.currentSize;
            document.getElementById('circuit-breakers').textContent = strategy.activeStrategies.circuitBreaker.openCircuits.length;
            
            // Update card styling based on degradation level
            const card = document.getElementById('strategy-card');
            card.className = 'card status-' + strategy.degradationLevel;
        }
        
        ws.onmessage = function(event) {
            const message = JSON.parse(event.data);
            
            switch(message.type) {
                case 'initial_state':
                    updateStrategy(message.data.strategy);
                    document.getElementById('active-rules').textContent = message.data.couplingMetrics.activeRules;
                    addLog('Connected - Initial state loaded');
                    break;
                    
                case 'strategy_changed':
                    updateStrategy(message.data.current);
                    addLog('Strategy changed: ' + message.data.previous.degradationLevel + ' → ' + message.data.current.degradationLevel);
                    break;
                    
                case 'strategy_updated':
                    updateStrategy(message.data);
                    break;
                    
                case 'slo_rule_triggered':
                    addLog('SLO Rule triggered: ' + message.data.ruleName + ' (' + message.data.actionType + ')');
                    break;
                    
                case 'heartbeat':
                    // Silent heartbeat
                    break;
                    
                default:
                    addLog('Event: ' + message.type);
            }
        };
        
        ws.onopen = function() {
            addLog('WebSocket connected');
        };
        
        ws.onclose = function() {
            addLog('WebSocket disconnected');
        };
        
        ws.onerror = function(error) {
            addLog('WebSocket error: ' + error);
        };
    </script>
</body>
</html>`;
  }

  /**
   * Méthodes utilitaires publiques
   */
  getBackpressureManager(): BackpressureManager {
    return this.backpressureManager;
  }

  getStrategyManager(): BackpressureStrategyManager {
    return this.strategyManager;
  }

  getCoupling(): SLOBackpressureCoupling {
    return this.coupling;
  }

  isSystemRunning(): boolean {
    return this.isRunning;
  }
}

/**
 * Exemple d'utilisation en production
 */
async function main() {
  const orchestrator = new AdvancedBackpressureOrchestrator();
  
  // Gestion gracieuse des signaux
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await orchestrator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await orchestrator.stop();
    process.exit(0);
  });

  try {
    const port = parseInt(process.env.PORT || '3000');
    await orchestrator.start(port);
    
    // Exemple d'utilisation programmatique
    setTimeout(async () => {
      console.log('📊 Running system status check...');
      
      const strategy = orchestrator.getStrategyManager().getCurrentStrategy();
      const couplingMetrics = orchestrator.getCoupling().getCouplingMetrics();
      
      console.log('Current system state:', {
        degradationLevel: strategy?.degradationLevel || 'none',
        activeRules: couplingMetrics.activeRules,
        lastAction: couplingMetrics.lastCouplingAction
      });
    }, 10000);
    
  } catch (error) {
    console.error('Failed to start system:', error);
    process.exit(1);
  }
}

// Exporter pour utilisation en tant que module
export { AdvancedBackpressureOrchestrator };

// Exécuter si appelé directement
if (require.main === module) {
  main().catch(console.error);
}