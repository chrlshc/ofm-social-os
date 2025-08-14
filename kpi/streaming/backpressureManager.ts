/**
 * Gestionnaire de backpressure pour le streaming haute performance
 * Gère les scénarios de surcharge extrême avec dégradation gracieuse
 */

import { EventEmitter } from 'events';
import { NatsStreamingClient } from './natsClient';
import { streamingMetrics } from '../monitoring/metrics';
import { sloMetrics } from '../monitoring/slo';

export interface BackpressureConfig {
  // Seuils de déclenchement
  maxMemoryUsageMB: number;        // Memory threshold en MB
  maxQueueSize: number;            // Taille max de la queue interne
  maxPublishRate: number;          // Messages/seconde max
  maxCpuUsagePercent: number;      // CPU threshold en %
  
  // Stratégies de mitigation
  enableCircuitBreaker: boolean;   // Circuit breaker sur les streams
  enableSampling: boolean;         // Échantillonnage adaptatif
  enablePrioritization: boolean;   // Priorisation des messages
  enableBatching: boolean;         // Batching adaptatif
  
  // Paramètres de récupération
  recoveryThresholdPercent: number; // % en dessous duquel on récupère
  recoveryDelayMs: number;         // Délai avant tentative de récupération
  maxBackoffMs: number;            // Backoff maximum
}

export interface BackpressureMetrics {
  currentMemoryMB: number;
  currentQueueSize: number;
  currentPublishRate: number;
  currentCpuPercent: number;
  droppedMessages: number;
  sampledMessages: number;
  circuitBreakerOpen: boolean;
  degradationLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface MessageWithPriority {
  data: any;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  retries: number;
}

/**
 * Gestionnaire principal du backpressure
 */
export class BackpressureManager extends EventEmitter {
  private config: BackpressureConfig;
  private metrics: BackpressureMetrics;
  private messageQueue: MessageWithPriority[] = [];
  private circuitBreakerStates: Map<string, boolean> = new Map();
  private lastRecoveryAttempt = 0;
  private currentBackoffMs = 1000;
  private samplingRate = 1.0; // 1.0 = 100%, 0.5 = 50%
  private batchSize = 1;
  private isShuttingDown = false;

  // Monitoring
  private monitoringInterval: NodeJS.Timeout | null = null;
  private processingInterval: NodeJS.Timeout | null = null;
  
  constructor(
    private natsClient: NatsStreamingClient,
    config: Partial<BackpressureConfig> = {}
  ) {
    super();
    
    this.config = {
      maxMemoryUsageMB: 512,
      maxQueueSize: 10000,
      maxPublishRate: 1000,
      maxCpuUsagePercent: 80,
      enableCircuitBreaker: true,
      enableSampling: true,
      enablePrioritization: true,
      enableBatching: true,
      recoveryThresholdPercent: 70,
      recoveryDelayMs: 5000,
      maxBackoffMs: 30000,
      ...config
    };

    this.metrics = {
      currentMemoryMB: 0,
      currentQueueSize: 0,
      currentPublishRate: 0,
      currentCpuPercent: 0,
      droppedMessages: 0,
      sampledMessages: 0,
      circuitBreakerOpen: false,
      degradationLevel: 'none'
    };

    this.startMonitoring();
    this.startProcessing();
  }

  /**
   * Publier un message avec gestion du backpressure
   */
  async publish(subject: string, data: any, priority: MessageWithPriority['priority'] = 'medium'): Promise<boolean> {
    if (this.isShuttingDown) {
      return false;
    }

    const message: MessageWithPriority = {
      data,
      subject,
      priority,
      timestamp: Date.now(),
      retries: 0
    };

    // Vérifier les conditions de backpressure
    const shouldApplyBackpressure = this.shouldApplyBackpressure();
    
    if (shouldApplyBackpressure) {
      return this.handleBackpressureScenario(message);
    }

    // Traitement normal
    return this.processMessage(message);
  }

  /**
   * Vérifier si le backpressure doit être appliqué
   */
  private shouldApplyBackpressure(): boolean {
    const { 
      maxMemoryUsageMB, 
      maxQueueSize, 
      maxPublishRate, 
      maxCpuUsagePercent 
    } = this.config;

    return (
      this.metrics.currentMemoryMB > maxMemoryUsageMB ||
      this.metrics.currentQueueSize > maxQueueSize ||
      this.metrics.currentPublishRate > maxPublishRate ||
      this.metrics.currentCpuPercent > maxCpuUsagePercent
    );
  }

  /**
   * Gérer un scénario de backpressure
   */
  private handleBackpressureScenario(message: MessageWithPriority): boolean {
    this.updateDegradationLevel();
    
    // Circuit breaker check
    if (this.config.enableCircuitBreaker && this.isCircuitBreakerOpen(message.subject)) {
      this.metrics.droppedMessages++;
      streamingMetrics.messagesDropped.inc({ reason: 'circuit_breaker', subject: message.subject });
      this.emit('message_dropped', { message, reason: 'circuit_breaker' });
      return false;
    }

    // Sampling
    if (this.config.enableSampling && !this.shouldSampleMessage()) {
      this.metrics.sampledMessages++;
      streamingMetrics.messagesDropped.inc({ reason: 'sampling', subject: message.subject });
      this.emit('message_sampled', { message });
      return false;
    }

    // Prioritization - drop low priority messages first
    if (this.config.enablePrioritization && this.shouldDropLowPriorityMessage(message)) {
      this.metrics.droppedMessages++;
      streamingMetrics.messagesDropped.inc({ reason: 'low_priority', subject: message.subject });
      this.emit('message_dropped', { message, reason: 'low_priority' });
      return false;
    }

    // Queue the message if possible
    if (this.messageQueue.length < this.config.maxQueueSize * 1.2) { // 20% buffer
      this.queueMessage(message);
      return true;
    } else {
      // Queue full, drop message
      this.metrics.droppedMessages++;
      streamingMetrics.messagesDropped.inc({ reason: 'queue_full', subject: message.subject });
      this.emit('message_dropped', { message, reason: 'queue_full' });
      return false;
    }
  }

  /**
   * Mettre à jour le niveau de dégradation
   */
  private updateDegradationLevel(): void {
    const memoryRatio = this.metrics.currentMemoryMB / this.config.maxMemoryUsageMB;
    const queueRatio = this.metrics.currentQueueSize / this.config.maxQueueSize;
    const rateRatio = this.metrics.currentPublishRate / this.config.maxPublishRate;
    const cpuRatio = this.metrics.currentCpuPercent / this.config.maxCpuUsagePercent;
    
    const maxRatio = Math.max(memoryRatio, queueRatio, rateRatio, cpuRatio);
    
    let newLevel: BackpressureMetrics['degradationLevel'];
    
    if (maxRatio < 0.7) {
      newLevel = 'none';
    } else if (maxRatio < 1.0) {
      newLevel = 'low';
    } else if (maxRatio < 1.5) {
      newLevel = 'medium';
    } else if (maxRatio < 2.0) {
      newLevel = 'high';
    } else {
      newLevel = 'critical';
    }

    if (newLevel !== this.metrics.degradationLevel) {
      const oldLevel = this.metrics.degradationLevel;
      this.metrics.degradationLevel = newLevel;
      this.adjustStrategies(newLevel);
      this.emit('degradation_level_changed', { oldLevel, newLevel, maxRatio });
    }
  }

  /**
   * Ajuster les stratégies selon le niveau de dégradation
   */
  private adjustStrategies(level: BackpressureMetrics['degradationLevel']): void {
    switch (level) {
      case 'none':
        this.samplingRate = 1.0;
        this.batchSize = 1;
        break;
      
      case 'low':
        this.samplingRate = 0.9;
        this.batchSize = 5;
        break;
      
      case 'medium':
        this.samplingRate = 0.7;
        this.batchSize = 10;
        break;
      
      case 'high':
        this.samplingRate = 0.5;
        this.batchSize = 20;
        break;
      
      case 'critical':
        this.samplingRate = 0.2;
        this.batchSize = 50;
        break;
    }

    // Mettre à jour les métriques Prometheus
    streamingMetrics.backpressureLevel.set(this.getDegradationLevelNumber(level));
    streamingMetrics.samplingRate.set(this.samplingRate);
  }

  /**
   * Vérifier si un message doit être échantillonné
   */
  private shouldSampleMessage(): boolean {
    return Math.random() <= this.samplingRate;
  }

  /**
   * Vérifier si un message de faible priorité doit être abandonné
   */
  private shouldDropLowPriorityMessage(message: MessageWithPriority): boolean {
    if (this.metrics.degradationLevel === 'critical') {
      return message.priority === 'low';
    }
    if (this.metrics.degradationLevel === 'high') {
      return message.priority === 'low' && Math.random() < 0.7;
    }
    return false;
  }

  /**
   * Ajouter un message à la queue avec priorisation
   */
  private queueMessage(message: MessageWithPriority): void {
    if (this.config.enablePrioritization) {
      // Insertion triée par priorité et timestamp
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const messagePriority = priorityOrder[message.priority];
      
      let insertIndex = this.messageQueue.length;
      
      for (let i = 0; i < this.messageQueue.length; i++) {
        const queuedPriority = priorityOrder[this.messageQueue[i].priority];
        
        if (messagePriority > queuedPriority || 
           (messagePriority === queuedPriority && message.timestamp < this.messageQueue[i].timestamp)) {
          insertIndex = i;
          break;
        }
      }
      
      this.messageQueue.splice(insertIndex, 0, message);
    } else {
      this.messageQueue.push(message);
    }

    this.metrics.currentQueueSize = this.messageQueue.length;
  }

  /**
   * Traiter un message directement
   */
  private async processMessage(message: MessageWithPriority): Promise<boolean> {
    try {
      await this.natsClient.publishMetric(message.subject, message.data);
      streamingMetrics.messagesPublished.inc({ 
        subject: message.subject, 
        priority: message.priority 
      });
      return true;
    } catch (error) {
      // Gérer l'erreur et potentiellement réessayer
      return this.handlePublishError(message, error);
    }
  }

  /**
   * Gérer les erreurs de publication
   */
  private async handlePublishError(message: MessageWithPriority, error: any): Promise<boolean> {
    message.retries++;
    
    if (message.retries <= 3) {
      // Réessayer après un délai
      setTimeout(() => {
        this.queueMessage(message);
      }, Math.min(1000 * Math.pow(2, message.retries), this.config.maxBackoffMs));
      return true;
    } else {
      // Abandonner après 3 tentatives
      this.metrics.droppedMessages++;
      streamingMetrics.messagesDropped.inc({ 
        reason: 'max_retries', 
        subject: message.subject 
      });
      this.emit('message_failed', { message, error });
      return false;
    }
  }

  /**
   * Vérifier si le circuit breaker est ouvert pour un subject
   */
  private isCircuitBreakerOpen(subject: string): boolean {
    if (!this.config.enableCircuitBreaker) {
      return false;
    }

    return this.circuitBreakerStates.get(subject) || false;
  }

  /**
   * Ouvrir le circuit breaker pour un subject
   */
  openCircuitBreaker(subject: string): void {
    this.circuitBreakerStates.set(subject, true);
    this.metrics.circuitBreakerOpen = true;
    
    streamingMetrics.circuitBreakerOpen.set({ subject }, 1);
    
    // Programmer une tentative de récupération
    setTimeout(() => {
      this.attemptRecovery(subject);
    }, this.config.recoveryDelayMs);
    
    this.emit('circuit_breaker_opened', { subject });
  }

  /**
   * Tentative de récupération pour un subject
   */
  private async attemptRecovery(subject: string): Promise<void> {
    const now = Date.now();
    
    if (now - this.lastRecoveryAttempt < this.currentBackoffMs) {
      return; // Trop tôt pour réessayer
    }

    this.lastRecoveryAttempt = now;

    // Vérifier si les conditions permettent la récupération
    if (this.canRecover()) {
      this.closeCircuitBreaker(subject);
      this.currentBackoffMs = 1000; // Reset backoff
    } else {
      // Augmenter le backoff et réessayer plus tard
      this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.config.maxBackoffMs);
      setTimeout(() => {
        this.attemptRecovery(subject);
      }, this.currentBackoffMs);
    }
  }

  /**
   * Vérifier si la récupération est possible
   */
  private canRecover(): boolean {
    const { recoveryThresholdPercent } = this.config;
    const threshold = recoveryThresholdPercent / 100;
    
    const memoryOk = this.metrics.currentMemoryMB / this.config.maxMemoryUsageMB < threshold;
    const queueOk = this.metrics.currentQueueSize / this.config.maxQueueSize < threshold;
    const rateOk = this.metrics.currentPublishRate / this.config.maxPublishRate < threshold;
    const cpuOk = this.metrics.currentCpuPercent / this.config.maxCpuUsagePercent < threshold;
    
    return memoryOk && queueOk && rateOk && cpuOk;
  }

  /**
   * Fermer le circuit breaker pour un subject
   */
  private closeCircuitBreaker(subject: string): void {
    this.circuitBreakerStates.set(subject, false);
    
    // Vérifier si tous les circuits sont fermés
    const anyOpen = Array.from(this.circuitBreakerStates.values()).some(open => open);
    this.metrics.circuitBreakerOpen = anyOpen;
    
    streamingMetrics.circuitBreakerOpen.set({ subject }, 0);
    
    this.emit('circuit_breaker_closed', { subject });
  }

  /**
   * Démarrer le monitoring des métriques système
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateSystemMetrics();
    }, 1000); // Toutes les secondes
  }

  /**
   * Démarrer le traitement de la queue
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processQueue();
    }, 100); // Toutes les 100ms
  }

  /**
   * Mettre à jour les métriques système
   */
  private updateSystemMetrics(): void {
    // Memory usage (approximation)
    const memUsage = process.memoryUsage();
    this.metrics.currentMemoryMB = memUsage.heapUsed / 1024 / 1024;

    // Queue size
    this.metrics.currentQueueSize = this.messageQueue.length;

    // Publish rate (approximation based on queue changes)
    // En production, utiliser un compteur plus précis

    // CPU usage (approximation)
    // En production, utiliser une vraie mesure CPU

    // Mettre à jour les métriques Prometheus
    streamingMetrics.backpressureMemoryUsage.set(this.metrics.currentMemoryMB);
    streamingMetrics.backpressureQueueSize.set(this.metrics.currentQueueSize);
  }

  /**
   * Traiter la queue de messages
   */
  private async processQueue(): Promise<void> {
    if (this.messageQueue.length === 0 || this.shouldApplyBackpressure()) {
      return;
    }

    const batchSize = Math.min(this.batchSize, this.messageQueue.length);
    const batch = this.messageQueue.splice(0, batchSize);

    if (this.config.enableBatching && batch.length > 1) {
      await this.processBatch(batch);
    } else {
      for (const message of batch) {
        await this.processMessage(message);
      }
    }

    this.metrics.currentQueueSize = this.messageQueue.length;
  }

  /**
   * Traiter un batch de messages
   */
  private async processBatch(batch: MessageWithPriority[]): Promise<void> {
    try {
      // Grouper par subject pour optimiser
      const subjectGroups = new Map<string, MessageWithPriority[]>();
      
      for (const message of batch) {
        if (!subjectGroups.has(message.subject)) {
          subjectGroups.set(message.subject, []);
        }
        subjectGroups.get(message.subject)!.push(message);
      }

      // Publier chaque groupe
      for (const [subject, messages] of subjectGroups) {
        try {
          // En mode batch, publier tous les messages du même subject ensemble
          await Promise.all(messages.map(msg => this.processMessage(msg)));
          
          streamingMetrics.batchesProcessed.inc({ 
            subject, 
            size: messages.length.toString() 
          });
          
        } catch (error) {
          // En cas d'erreur batch, réessayer individuellement
          for (const message of messages) {
            await this.handlePublishError(message, error);
          }
        }
      }

    } catch (error) {
      console.error('Batch processing failed:', error);
      
      // Fallback: traitement individuel
      for (const message of batch) {
        await this.handlePublishError(message, error);
      }
    }
  }

  /**
   * Obtenir les métriques actuelles
   */
  getMetrics(): BackpressureMetrics {
    return { ...this.metrics };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): BackpressureConfig {
    return { ...this.config };
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(newConfig: Partial<BackpressureConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', this.config);
  }

  /**
   * Arrêt propre
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    // Traiter les messages restants
    while (this.messageQueue.length > 0 && !this.shouldApplyBackpressure()) {
      await this.processQueue();
    }

    this.emit('shutdown_complete');
  }

  /**
   * Utilitaires privés
   */
  private getDegradationLevelNumber(level: BackpressureMetrics['degradationLevel']): number {
    const levels = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    return levels[level];
  }
}

/**
 * Factory pour créer un gestionnaire de backpressure
 */
export function createBackpressureManager(
  natsClient: NatsStreamingClient,
  config?: Partial<BackpressureConfig>
): BackpressureManager {
  return new BackpressureManager(natsClient, config);
}

/**
 * Configuration par défaut pour production
 */
export const PRODUCTION_BACKPRESSURE_CONFIG: BackpressureConfig = {
  maxMemoryUsageMB: 1024,
  maxQueueSize: 50000,
  maxPublishRate: 10000,
  maxCpuUsagePercent: 75,
  enableCircuitBreaker: true,
  enableSampling: true,
  enablePrioritization: true,
  enableBatching: true,
  recoveryThresholdPercent: 60,
  recoveryDelayMs: 10000,
  maxBackoffMs: 60000
};