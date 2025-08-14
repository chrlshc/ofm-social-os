import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface WebSocketSubscription {
  modelNames: string[];
  eventTypes: ('metric_update' | 'alert_triggered' | 'insight_generated' | 'recommendation_created' | '*')[];
  filters?: {
    platforms?: string[];
    severity?: ('info' | 'warning' | 'critical')[];
    metricNames?: string[];
  };
}

export interface KpiEvent {
  type: 'metric_update' | 'alert_triggered' | 'insight_generated' | 'recommendation_created';
  modelName: string;
  data: any;
  timestamp: Date;
}

export interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastEvent: KpiEvent | null;
  eventHistory: KpiEvent[];
  subscription: WebSocketSubscription | null;
}

export function useWebSocket(
  subscription: WebSocketSubscription,
  options: UseWebSocketOptions = {}
) {
  const {
    url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    lastEvent: null,
    eventHistory: [],
    subscription: null
  });

  const [liveMetrics, setLiveMetrics] = useState<any[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [recentInsights, setRecentInsights] = useState<any[]>([]);

  // Connection management
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      const socket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      socket.on('connect', () => {
        console.log('WebSocket connected');
        reconnectAttemptsRef.current = 0;
        
        setState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          error: null
        }));

        // Subscribe to events
        socket.emit('subscribe', subscription);
      });

      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setState(prev => ({
          ...prev,
          connected: false,
          connecting: false
        }));

        // Auto-reconnect
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, don't reconnect
          return;
        }

        if (reconnectAttemptsRef.current < reconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay * reconnectAttemptsRef.current);
        } else {
          setState(prev => ({
            ...prev,
            error: 'Failed to reconnect after multiple attempts'
          }));
        }
      });

      socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setState(prev => ({
          ...prev,
          connecting: false,
          error: error.message
        }));
      });

      // Subscription events
      socket.on('subscription_confirmed', (data) => {
        console.log('Subscription confirmed:', data);
        setState(prev => ({
          ...prev,
          subscription: data.subscription
        }));
      });

      // Data events
      socket.on('initial_metrics', (metrics) => {
        setLiveMetrics(metrics);
      });

      socket.on('initial_alerts', (alerts) => {
        setActiveAlerts(alerts);
      });

      socket.on('initial_insights', (insights) => {
        setRecentInsights(insights);
      });

      // Real-time events
      socket.on('kpi_events', (data: { events: KpiEvent[]; count: number; timestamp: Date }) => {
        const newEvents = data.events.map(event => ({
          ...event,
          timestamp: new Date(event.timestamp)
        }));

        setState(prev => ({
          ...prev,
          lastEvent: newEvents[newEvents.length - 1] || null,
          eventHistory: [...prev.eventHistory, ...newEvents].slice(-100) // Keep last 100 events
        }));

        // Update specific data based on event type
        newEvents.forEach(event => {
          switch (event.type) {
            case 'metric_update':
              setLiveMetrics(prev => {
                const updated = [event.data, ...prev.slice(0, 99)]; // Keep last 100
                return updated;
              });
              break;

            case 'alert_triggered':
              setActiveAlerts(prev => {
                const existing = prev.find(alert => alert.id === event.data.id);
                if (!existing) {
                  return [event.data, ...prev.slice(0, 49)]; // Keep last 50
                }
                return prev;
              });
              break;

            case 'insight_generated':
              setRecentInsights(prev => {
                const existing = prev.find(insight => insight.id === event.data.id);
                if (!existing) {
                  return [event.data, ...prev.slice(0, 29)]; // Keep last 30
                }
                return prev;
              });
              break;
          }
        });
      });

      socket.on('live_data', (data) => {
        setLiveMetrics(data);
      });

      socket.on('analysis_triggered', (data) => {
        console.log('Analysis triggered:', data);
      });

      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: error.message
        }));
      });

      socketRef.current = socket;

    } catch (error) {
      setState(prev => ({
        ...prev,
        connecting: false,
        error: error instanceof Error ? error.message : 'Unknown connection error'
      }));
    }
  }, [url, subscription, reconnectAttempts, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setState(prev => ({
      ...prev,
      connected: false,
      connecting: false,
      subscription: null
    }));
  }, []);

  // Subscription management
  const updateFilters = useCallback((filters: WebSocketSubscription['filters']) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('update_filters', filters);
    }
  }, []);

  const requestLiveData = useCallback((request: {
    modelName: string;
    metricName?: string;
    timeRange?: number;
  }) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request_live_data', request);
    }
  }, []);

  const triggerAnalysis = useCallback((modelName: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('trigger_analysis', modelName);
    }
  }, []);

  // Effects
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Update subscription when it changes
  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', subscription);
    }
  }, [subscription]);

  // Event handlers for custom events
  const addEventListener = useCallback((eventType: string, handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(eventType, handler);
      
      return () => {
        if (socketRef.current) {
          socketRef.current.off(eventType, handler);
        }
      };
    }
  }, []);

  const emit = useCallback((eventType: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(eventType, data);
    }
  }, []);

  return {
    // Connection state
    ...state,
    
    // Data
    liveMetrics,
    activeAlerts,
    recentInsights,
    
    // Actions
    connect,
    disconnect,
    updateFilters,
    requestLiveData,
    triggerAnalysis,
    addEventListener,
    emit,
    
    // Utilities
    isConnected: state.connected,
    hasError: !!state.error,
    eventsCount: state.eventHistory.length
  };
}

// Hook spécialisé pour un modèle spécifique
export function useModelWebSocket(
  modelName: string,
  eventTypes: WebSocketSubscription['eventTypes'] = ['*'],
  filters?: WebSocketSubscription['filters']
) {
  const subscription: WebSocketSubscription = {
    modelNames: [modelName],
    eventTypes,
    filters
  };

  return useWebSocket(subscription);
}

// Hook pour surveiller plusieurs modèles
export function useMultiModelWebSocket(
  modelNames: string[],
  eventTypes: WebSocketSubscription['eventTypes'] = ['*'],
  filters?: WebSocketSubscription['filters']
) {
  const subscription: WebSocketSubscription = {
    modelNames,
    eventTypes,
    filters
  };

  return useWebSocket(subscription);
}

// Hook pour les alertes en temps réel
export function useRealTimeAlerts(
  modelNames: string[] = ['*'],
  severityFilter?: ('warning' | 'critical')[]
) {
  const subscription: WebSocketSubscription = {
    modelNames,
    eventTypes: ['alert_triggered'],
    filters: severityFilter ? { severity: severityFilter } : undefined
  };

  const webSocket = useWebSocket(subscription);

  // Notifications du navigateur pour les alertes critiques
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (webSocket.lastEvent?.type === 'alert_triggered' && 
        webSocket.lastEvent.data.severity === 'critical') {
      
      if (Notification.permission === 'granted') {
        new Notification(`Alerte Critique - ${webSocket.lastEvent.modelName}`, {
          body: webSocket.lastEvent.data.insight,
          icon: '/alert-icon.png',
          tag: `alert-${webSocket.lastEvent.data.id}`
        });
      }
    }
  }, [webSocket.lastEvent]);

  return {
    ...webSocket,
    criticalAlerts: webSocket.activeAlerts.filter((alert: any) => alert.severity === 'critical'),
    warningAlerts: webSocket.activeAlerts.filter((alert: any) => alert.severity === 'warning')
  };
}