import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { db } from '../utils/db';

export interface WebSocketEvent {
  type: 'metric_update' | 'alert_triggered' | 'insight_generated' | 'recommendation_created';
  modelName: string;
  data: any;
  timestamp: Date;
}

export interface ClientSubscription {
  socketId: string;
  modelNames: string[];
  eventTypes: string[];
  userId?: string;
  filters?: {
    platforms?: string[];
    severity?: string[];
    metricNames?: string[];
  };
}

export class WebSocketKpiServer {
  private io: Server;
  private httpServer: any;
  private subscriptions: Map<string, ClientSubscription> = new Map();
  private eventQueue: WebSocketEvent[] = [];
  private isProcessingQueue = false;

  constructor(app: express.Application, port: number = 3001) {
    this.httpServer = createServer(app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? process.env.ALLOWED_ORIGINS?.split(',') 
          : "*",
        methods: ["GET", "POST"]
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupEventHandlers();
    this.setupDatabaseListeners();
    this.startEventProcessor();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Gestion des subscriptions
      socket.on('subscribe', (subscription: Omit<ClientSubscription, 'socketId'>) => {
        const clientSubscription: ClientSubscription = {
          ...subscription,
          socketId: socket.id
        };
        
        this.subscriptions.set(socket.id, clientSubscription);
        console.log(`Client ${socket.id} subscribed to:`, subscription);
        
        // Envoyer l'état initial
        this.sendInitialData(socket, clientSubscription);
        
        socket.emit('subscription_confirmed', {
          status: 'success',
          subscription: clientSubscription
        });
      });

      // Mise à jour des filtres
      socket.on('update_filters', (filters: ClientSubscription['filters']) => {
        const subscription = this.subscriptions.get(socket.id);
        if (subscription) {
          subscription.filters = filters;
          this.subscriptions.set(socket.id, subscription);
          socket.emit('filters_updated', filters);
        }
      });

      // Demande de données en temps réel
      socket.on('request_live_data', async (request: {
        modelName: string;
        metricName?: string;
        timeRange?: number; // minutes
      }) => {
        try {
          const liveData = await this.getLiveData(request);
          socket.emit('live_data', liveData);
        } catch (error) {
          socket.emit('error', { message: 'Failed to fetch live data', error });
        }
      });

      // Trigger manual analysis
      socket.on('trigger_analysis', async (modelName: string) => {
        try {
          // Déclencher une analyse en arrière-plan
          this.triggerModelAnalysis(modelName);
          socket.emit('analysis_triggered', { modelName, status: 'started' });
        } catch (error) {
          socket.emit('error', { message: 'Failed to trigger analysis', error });
        }
      });

      // Déconnexion
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.subscriptions.delete(socket.id);
      });

      // Gestion d'erreur
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  // Écouter les changements en base de données (via polling)
  private setupDatabaseListeners() {
    // Polling pour les nouvelles métriques
    setInterval(async () => {
      try {
        await this.checkForNewMetrics();
      } catch (error) {
        console.error('Error checking for new metrics:', error);
      }
    }, 5000); // Check every 5 seconds

    // Polling pour les nouvelles alertes
    setInterval(async () => {
      try {
        await this.checkForNewAlerts();
      } catch (error) {
        console.error('Error checking for new alerts:', error);
      }
    }, 10000); // Check every 10 seconds

    // Polling pour les nouveaux insights
    setInterval(async () => {
      try {
        await this.checkForNewInsights();
      } catch (error) {
        console.error('Error checking for new insights:', error);
      }
    }, 15000); // Check every 15 seconds
  }

  private async checkForNewMetrics() {
    const cutoffTime = new Date(Date.now() - 60 * 1000); // Last minute
    
    const result = await db.query(
      `SELECT * FROM kpi_metrics 
       WHERE created_at > $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [cutoffTime]
    );

    for (const row of result.rows) {
      const event: WebSocketEvent = {
        type: 'metric_update',
        modelName: row.model_name,
        data: {
          id: row.id,
          metricName: row.metric_name,
          value: parseFloat(row.value),
          platform: row.platform,
          campaignId: row.campaign_id,
          metadata: row.metadata,
          createdAt: row.created_at
        },
        timestamp: new Date()
      };

      this.queueEvent(event);
    }
  }

  private async checkForNewAlerts() {
    const cutoffTime = new Date(Date.now() - 2 * 60 * 1000); // Last 2 minutes
    
    const result = await db.query(
      `SELECT * FROM kpi_insights 
       WHERE created_at > $1 AND severity IN ('warning', 'critical')
       ORDER BY created_at DESC 
       LIMIT 50`,
      [cutoffTime]
    );

    for (const row of result.rows) {
      const event: WebSocketEvent = {
        type: 'alert_triggered',
        modelName: row.model_name,
        data: {
          id: row.id,
          insight: row.insight,
          severity: row.severity,
          metadata: row.metadata,
          createdAt: row.created_at
        },
        timestamp: new Date()
      };

      this.queueEvent(event);
    }
  }

  private async checkForNewInsights() {
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // Last 5 minutes
    
    const result = await db.query(
      `SELECT * FROM kpi_insights 
       WHERE created_at > $1 AND severity = 'info'
       ORDER BY created_at DESC 
       LIMIT 20`,
      [cutoffTime]
    );

    for (const row of result.rows) {
      const event: WebSocketEvent = {
        type: 'insight_generated',
        modelName: row.model_name,
        data: {
          id: row.id,
          insight: row.insight,
          severity: row.severity,
          metadata: row.metadata,
          createdAt: row.created_at
        },
        timestamp: new Date()
      };

      this.queueEvent(event);
    }
  }

  private queueEvent(event: WebSocketEvent) {
    this.eventQueue.push(event);
    
    // Limiter la taille de la queue
    if (this.eventQueue.length > 1000) {
      this.eventQueue = this.eventQueue.slice(-500);
    }
  }

  private startEventProcessor() {
    setInterval(() => {
      if (!this.isProcessingQueue && this.eventQueue.length > 0) {
        this.processEventQueue();
      }
    }, 1000); // Process every second
  }

  private async processEventQueue() {
    if (this.isProcessingQueue || this.eventQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    const eventsToProcess = [...this.eventQueue];
    this.eventQueue = [];

    try {
      // Grouper les events par type pour optimiser l'envoi
      const groupedEvents = new Map<string, WebSocketEvent[]>();
      
      eventsToProcess.forEach(event => {
        const key = `${event.type}_${event.modelName}`;
        if (!groupedEvents.has(key)) {
          groupedEvents.set(key, []);
        }
        groupedEvents.get(key)!.push(event);
      });

      // Envoyer aux clients abonnés
      for (const [socketId, subscription] of this.subscriptions.entries()) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) {
          this.subscriptions.delete(socketId);
          continue;
        }

        for (const [groupKey, events] of groupedEvents.entries()) {
          const relevantEvents = events.filter(event => 
            this.shouldSendEventToClient(event, subscription)
          );

          if (relevantEvents.length > 0) {
            // Envoyer les events groupés
            socket.emit('kpi_events', {
              events: relevantEvents,
              count: relevantEvents.length,
              timestamp: new Date()
            });
          }
        }
      }
    } catch (error) {
      console.error('Error processing event queue:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private shouldSendEventToClient(event: WebSocketEvent, subscription: ClientSubscription): boolean {
    // Vérifier le modèle
    if (!subscription.modelNames.includes(event.modelName) && !subscription.modelNames.includes('*')) {
      return false;
    }

    // Vérifier le type d'event
    if (!subscription.eventTypes.includes(event.type) && !subscription.eventTypes.includes('*')) {
      return false;
    }

    // Appliquer les filtres
    if (subscription.filters) {
      // Filtre par plateforme
      if (subscription.filters.platforms && event.data.platform) {
        if (!subscription.filters.platforms.includes(event.data.platform)) {
          return false;
        }
      }

      // Filtre par sévérité (pour les alertes)
      if (subscription.filters.severity && event.data.severity) {
        if (!subscription.filters.severity.includes(event.data.severity)) {
          return false;
        }
      }

      // Filtre par nom de métrique
      if (subscription.filters.metricNames && event.data.metricName) {
        if (!subscription.filters.metricNames.includes(event.data.metricName)) {
          return false;
        }
      }
    }

    return true;
  }

  private async sendInitialData(socket: any, subscription: ClientSubscription) {
    try {
      // Envoyer les métriques récentes
      const recentMetrics = await this.getRecentMetrics(subscription.modelNames);
      socket.emit('initial_metrics', recentMetrics);

      // Envoyer les alertes actives
      const activeAlerts = await this.getActiveAlerts(subscription.modelNames);
      socket.emit('initial_alerts', activeAlerts);

      // Envoyer les insights récents
      const recentInsights = await this.getRecentInsights(subscription.modelNames);
      socket.emit('initial_insights', recentInsights);

    } catch (error) {
      console.error('Error sending initial data:', error);
      socket.emit('error', { message: 'Failed to load initial data' });
    }
  }

  private async getRecentMetrics(modelNames: string[]) {
    const modelFilter = modelNames.includes('*') ? '' : 'AND model_name = ANY($2)';
    const params: any[] = [new Date(Date.now() - 60 * 60 * 1000)]; // Last hour
    
    if (!modelNames.includes('*')) {
      params.push(modelNames);
    }

    const result = await db.query(
      `SELECT * FROM kpi_metrics 
       WHERE created_at > $1 ${modelFilter}
       ORDER BY created_at DESC 
       LIMIT 100`,
      params
    );

    return result.rows;
  }

  private async getActiveAlerts(modelNames: string[]) {
    const modelFilter = modelNames.includes('*') ? '' : 'AND model_name = ANY($2)';
    const params: any[] = [new Date(Date.now() - 24 * 60 * 60 * 1000)]; // Last 24 hours
    
    if (!modelNames.includes('*')) {
      params.push(modelNames);
    }

    const result = await db.query(
      `SELECT * FROM kpi_insights 
       WHERE created_at > $1 AND severity IN ('warning', 'critical') ${modelFilter}
       ORDER BY created_at DESC 
       LIMIT 50`,
      params
    );

    return result.rows;
  }

  private async getRecentInsights(modelNames: string[]) {
    const modelFilter = modelNames.includes('*') ? '' : 'AND model_name = ANY($2)';
    const params: any[] = [new Date(Date.now() - 6 * 60 * 60 * 1000)]; // Last 6 hours
    
    if (!modelNames.includes('*')) {
      params.push(modelNames);
    }

    const result = await db.query(
      `SELECT * FROM kpi_insights 
       WHERE created_at > $1 AND severity = 'info' ${modelFilter}
       ORDER BY created_at DESC 
       LIMIT 30`,
      params
    );

    return result.rows;
  }

  private async getLiveData(request: {
    modelName: string;
    metricName?: string;
    timeRange?: number;
  }) {
    const timeRange = request.timeRange || 60; // minutes
    const cutoffTime = new Date(Date.now() - timeRange * 60 * 1000);
    
    let query = `
      SELECT metric_name, value, platform, created_at
      FROM kpi_metrics 
      WHERE model_name = $1 AND created_at > $2
    `;
    const params: any[] = [request.modelName, cutoffTime];

    if (request.metricName) {
      query += ' AND metric_name = $3';
      params.push(request.metricName);
    }

    query += ' ORDER BY created_at DESC LIMIT 500';

    const result = await db.query(query, params);
    return result.rows;
  }

  private async triggerModelAnalysis(modelName: string) {
    // Ici on pourrait déclencher l'analyse via une queue ou un job
    // Pour l'instant, on simule juste en loggant
    console.log(`Triggering analysis for model: ${modelName}`);
    
    // Dans une vraie implémentation, on pourrait :
    // - Ajouter un job à une queue Redis
    // - Appeler directement le service d'analyse
    // - Envoyer un event à un autre service
  }

  // Méthodes publiques pour envoyer des events depuis l'extérieur
  public broadcastMetricUpdate(modelName: string, metricData: any) {
    const event: WebSocketEvent = {
      type: 'metric_update',
      modelName,
      data: metricData,
      timestamp: new Date()
    };
    this.queueEvent(event);
  }

  public broadcastAlert(modelName: string, alertData: any) {
    const event: WebSocketEvent = {
      type: 'alert_triggered',
      modelName,
      data: alertData,
      timestamp: new Date()
    };
    this.queueEvent(event);
  }

  public broadcastInsight(modelName: string, insightData: any) {
    const event: WebSocketEvent = {
      type: 'insight_generated',
      modelName,
      data: insightData,
      timestamp: new Date()
    };
    this.queueEvent(event);
  }

  public getConnectionStats() {
    return {
      connectedClients: this.io.sockets.sockets.size,
      subscriptions: this.subscriptions.size,
      queuedEvents: this.eventQueue.length,
      timestamp: new Date()
    };
  }

  public start(port: number = 3001) {
    this.httpServer.listen(port, () => {
      console.log(`WebSocket KPI Server running on port ${port}`);
    });
  }

  public stop() {
    this.io.close();
    this.httpServer.close();
  }
}

// Export singleton
let wsServer: WebSocketKpiServer | null = null;

export function createWebSocketServer(app: express.Application, port?: number): WebSocketKpiServer {
  if (!wsServer) {
    wsServer = new WebSocketKpiServer(app, port);
  }
  return wsServer;
}

export function getWebSocketServer(): WebSocketKpiServer | null {
  return wsServer;
}