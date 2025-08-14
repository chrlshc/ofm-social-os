import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { EventEmitter } from 'events';
import { createError } from '../utils/errorHandler';

/**
 * WebSocket simplifié pour les KPI avec pattern Observer et gestion d'erreur robuste
 */

export interface KpiWebSocketEvent {
  type: 'metric' | 'alert' | 'insight' | 'benchmark';
  modelName: string;
  data: any;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ClientFilter {
  models?: string[];
  eventTypes?: string[];
  platforms?: string[];
  severity?: string[];
}

export interface ClientInfo {
  id: string;
  filter: ClientFilter;
  connectedAt: Date;
  lastActivity: Date;
}

export class SimplifiedWebSocketServer extends EventEmitter {
  private io: Server;
  private httpServer: any;
  private clients: Map<string, ClientInfo> = new Map();
  private eventBuffer: KpiWebSocketEvent[] = [];
  private maxBufferSize = 100;

  constructor(app: express.Application, options: {
    port?: number;
    cors?: any;
    bufferSize?: number;
  } = {}) {
    super();
    
    const { port = 3001, cors, bufferSize = 100 } = options;
    this.maxBufferSize = bufferSize;

    this.httpServer = createServer(app);
    this.io = new Server(this.httpServer, {
      cors: cors || {
        origin: process.env.NODE_ENV === 'production' ? false : "*",
        methods: ["GET", "POST"]
      },
      pingTimeout: 30000,
      pingInterval: 10000
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Initialiser le client
      const clientInfo: ClientInfo = {
        id: socket.id,
        filter: {},
        connectedAt: new Date(),
        lastActivity: new Date()
      };
      this.clients.set(socket.id, clientInfo);

      // Gestion de la subscription avec validation
      socket.on('subscribe', (filter: ClientFilter) => {
        try {
          this.validateFilter(filter);
          
          const client = this.clients.get(socket.id);
          if (client) {
            client.filter = filter;
            client.lastActivity = new Date();
            this.clients.set(socket.id, client);
            
            // Envoyer les events buffered qui correspondent au filtre
            this.sendBufferedEvents(socket, filter);
            
            socket.emit('subscribed', { 
              status: 'success', 
              filter,
              bufferedEvents: this.getRelevantBufferedEvents(filter).length
            });
            
            this.emit('client_subscribed', { socketId: socket.id, filter });
          }
        } catch (error) {
          socket.emit('subscription_error', { 
            error: error instanceof Error ? error.message : 'Invalid filter' 
          });
        }
      });

      // Mise à jour du filtre
      socket.on('update_filter', (newFilter: Partial<ClientFilter>) => {
        try {
          const client = this.clients.get(socket.id);
          if (client) {
            client.filter = { ...client.filter, ...newFilter };
            client.lastActivity = new Date();
            this.clients.set(socket.id, client);
            
            socket.emit('filter_updated', client.filter);
          }
        } catch (error) {
          socket.emit('filter_error', { 
            error: error instanceof Error ? error.message : 'Failed to update filter' 
          });
        }
      });

      // Heartbeat pour maintenir la connexion active
      socket.on('ping', () => {
        const client = this.clients.get(socket.id);
        if (client) {
          client.lastActivity = new Date();
          this.clients.set(socket.id, client);
        }
        socket.emit('pong', { timestamp: new Date() });
      });

      // Déconnexion propre
      socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
        this.clients.delete(socket.id);
        this.emit('client_disconnected', { socketId: socket.id, reason });
      });

      // Gestion d'erreur
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
        this.emit('socket_error', { socketId: socket.id, error });
      });
    });

    // Nettoyage périodique des clients inactifs
    setInterval(() => {
      this.cleanupInactiveClients();
    }, 60000); // Every minute
  }

  /**
   * Valide un filtre client
   */
  private validateFilter(filter: ClientFilter) {
    if (filter.models && !Array.isArray(filter.models)) {
      throw createError.validation('filter.models must be an array');
    }
    
    if (filter.eventTypes && !Array.isArray(filter.eventTypes)) {
      throw createError.validation('filter.eventTypes must be an array');
    }

    if (filter.eventTypes) {
      const validTypes = ['metric', 'alert', 'insight', 'benchmark'];
      const invalidTypes = filter.eventTypes.filter(type => !validTypes.includes(type));
      if (invalidTypes.length > 0) {
        throw createError.validation(`Invalid event types: ${invalidTypes.join(', ')}`);
      }
    }

    if (filter.severity) {
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      const invalidSeverities = filter.severity.filter(s => !validSeverities.includes(s));
      if (invalidSeverities.length > 0) {
        throw createError.validation(`Invalid severities: ${invalidSeverities.join(', ')}`);
      }
    }
  }

  /**
   * Diffuse un événement à tous les clients concernés
   */
  public broadcast(event: Omit<KpiWebSocketEvent, 'timestamp'>) {
    const fullEvent: KpiWebSocketEvent = {
      ...event,
      timestamp: new Date()
    };

    // Ajouter à buffer
    this.addToBuffer(fullEvent);

    // Diffuser aux clients connectés
    let sentCount = 0;
    for (const [socketId, client] of this.clients.entries()) {
      if (this.eventMatchesFilter(fullEvent, client.filter)) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('kpi_event', fullEvent);
          sentCount++;
          
          // Mettre à jour l'activité du client
          client.lastActivity = new Date();
          this.clients.set(socketId, client);
        } else {
          // Socket déconnecté, nettoyer
          this.clients.delete(socketId);
        }
      }
    }

    this.emit('event_broadcasted', { event: fullEvent, recipients: sentCount });
    return sentCount;
  }

  /**
   * Diffuse plusieurs événements en batch
   */
  public broadcastBatch(events: Array<Omit<KpiWebSocketEvent, 'timestamp'>>) {
    const fullEvents = events.map(event => ({
      ...event,
      timestamp: new Date()
    }));

    // Ajouter au buffer
    fullEvents.forEach(event => this.addToBuffer(event));

    // Grouper les événements par client pour optimiser l'envoi
    const clientEvents = new Map<string, KpiWebSocketEvent[]>();

    for (const [socketId, client] of this.clients.entries()) {
      const relevantEvents = fullEvents.filter(event => 
        this.eventMatchesFilter(event, client.filter)
      );

      if (relevantEvents.length > 0) {
        clientEvents.set(socketId, relevantEvents);
      }
    }

    // Envoyer aux clients
    let totalSent = 0;
    for (const [socketId, events] of clientEvents.entries()) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('kpi_events_batch', {
          events,
          count: events.length,
          timestamp: new Date()
        });
        totalSent += events.length;

        // Mettre à jour l'activité
        const client = this.clients.get(socketId);
        if (client) {
          client.lastActivity = new Date();
          this.clients.set(socketId, client);
        }
      } else {
        this.clients.delete(socketId);
      }
    }

    this.emit('batch_broadcasted', { 
      eventsCount: fullEvents.length, 
      totalSent, 
      recipients: clientEvents.size 
    });

    return { eventsCount: fullEvents.length, totalSent, recipients: clientEvents.size };
  }

  /**
   * Vérifie si un événement correspond au filtre d'un client
   */
  private eventMatchesFilter(event: KpiWebSocketEvent, filter: ClientFilter): boolean {
    // Filtre par modèle
    if (filter.models && filter.models.length > 0) {
      if (!filter.models.includes(event.modelName) && !filter.models.includes('*')) {
        return false;
      }
    }

    // Filtre par type d'événement
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      if (!filter.eventTypes.includes(event.type) && !filter.eventTypes.includes('*')) {
        return false;
      }
    }

    // Filtre par plateforme
    if (filter.platforms && filter.platforms.length > 0 && event.data.platform) {
      if (!filter.platforms.includes(event.data.platform)) {
        return false;
      }
    }

    // Filtre par sévérité
    if (filter.severity && filter.severity.length > 0 && event.data.severity) {
      if (!filter.severity.includes(event.data.severity)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Ajoute un événement au buffer
   */
  private addToBuffer(event: KpiWebSocketEvent) {
    this.eventBuffer.push(event);
    
    // Limiter la taille du buffer
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }
  }

  /**
   * Envoie les événements buffered pertinents à un nouveau client
   */
  private sendBufferedEvents(socket: any, filter: ClientFilter) {
    const relevantEvents = this.getRelevantBufferedEvents(filter);
    
    if (relevantEvents.length > 0) {
      socket.emit('buffered_events', {
        events: relevantEvents,
        count: relevantEvents.length
      });
    }
  }

  /**
   * Récupère les événements buffered pertinents pour un filtre
   */
  private getRelevantBufferedEvents(filter: ClientFilter): KpiWebSocketEvent[] {
    return this.eventBuffer.filter(event => this.eventMatchesFilter(event, filter));
  }

  /**
   * Nettoie les clients inactifs
   */
  private cleanupInactiveClients() {
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
    const now = new Date();
    
    for (const [socketId, client] of this.clients.entries()) {
      if (now.getTime() - client.lastActivity.getTime() > inactiveThreshold) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket || !socket.connected) {
          this.clients.delete(socketId);
          console.log(`Cleaned up inactive client: ${socketId}`);
        }
      }
    }
  }

  /**
   * Méthodes publiques d'information
   */
  public getStats() {
    const now = new Date();
    const activeClients = Array.from(this.clients.values()).filter(
      client => now.getTime() - client.lastActivity.getTime() < 60000 // Active dans la dernière minute
    );

    return {
      connectedClients: this.clients.size,
      activeClients: activeClients.length,
      bufferedEvents: this.eventBuffer.length,
      socketConnections: this.io.sockets.sockets.size,
      timestamp: now
    };
  }

  public getClientInfo(socketId: string): ClientInfo | undefined {
    return this.clients.get(socketId);
  }

  public getAllClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  /**
   * Méthodes de lifecycle
   */
  public start(port: number = 3001): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer.listen(port, () => {
          console.log(`Simplified WebSocket KPI Server running on port ${port}`);
          this.emit('server_started', { port });
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      console.log('Stopping WebSocket server...');
      
      // Fermer toutes les connexions
      this.io.close(() => {
        this.httpServer.close(() => {
          this.clients.clear();
          this.eventBuffer = [];
          this.emit('server_stopped');
          console.log('WebSocket server stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Méthodes de convenance pour les différents types d'événements
   */
  public sendMetricUpdate(modelName: string, metricData: any) {
    return this.broadcast({
      type: 'metric',
      modelName,
      data: metricData
    });
  }

  public sendAlert(modelName: string, alertData: any) {
    return this.broadcast({
      type: 'alert',
      modelName,
      data: alertData
    });
  }

  public sendInsight(modelName: string, insightData: any) {
    return this.broadcast({
      type: 'insight',
      modelName,
      data: insightData
    });
  }

  public sendBenchmark(modelName: string, benchmarkData: any) {
    return this.broadcast({
      type: 'benchmark',
      modelName,
      data: benchmarkData
    });
  }

  /**
   * Middleware de gestion d'erreur personnalisé
   */
  public setErrorHandler(handler: (error: any, context: any) => void) {
    this.on('socket_error', handler);
    this.on('error', handler);
  }
}

/**
 * Factory function pour créer une instance singleton
 */
let wsServerInstance: SimplifiedWebSocketServer | null = null;

export function createSimplifiedWebSocketServer(
  app: express.Application, 
  options: {
    port?: number;
    cors?: any;
    bufferSize?: number;
  } = {}
): SimplifiedWebSocketServer {
  if (!wsServerInstance) {
    wsServerInstance = new SimplifiedWebSocketServer(app, options);
  }
  return wsServerInstance;
}

export function getSimplifiedWebSocketServer(): SimplifiedWebSocketServer | null {
  return wsServerInstance;
}

/**
 * Types d'export pour TypeScript
 */
export type WebSocketStats = ReturnType<SimplifiedWebSocketServer['getStats']>;
export type BroadcastResult = ReturnType<SimplifiedWebSocketServer['broadcastBatch']>;