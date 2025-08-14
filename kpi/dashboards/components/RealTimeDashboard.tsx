'use client';

import React, { useState, useEffect } from 'react';
import { useModelWebSocket, useRealTimeAlerts } from '../hooks/useWebSocket';
import { Bell, Wifi, WifiOff, Activity, TrendingUp, AlertTriangle } from 'lucide-react';

interface Props {
  modelName: string;
}

export default function RealTimeDashboard({ modelName }: Props) {
  const [filters, setFilters] = useState({
    platforms: [] as string[],
    metricNames: [] as string[]
  });

  // WebSocket principal pour le modèle
  const webSocket = useModelWebSocket(modelName, ['*'], filters);
  
  // WebSocket spécialisé pour les alertes
  const alertsWS = useRealTimeAlerts([modelName], ['warning', 'critical']);

  const [showConnectionStatus, setShowConnectionStatus] = useState(false);

  useEffect(() => {
    // Afficher le statut de connexion temporairement au changement
    setShowConnectionStatus(true);
    const timer = setTimeout(() => setShowConnectionStatus(false), 3000);
    return () => clearTimeout(timer);
  }, [webSocket.connected]);

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    webSocket.updateFilters(newFilters);
  };

  const triggerAnalysis = () => {
    webSocket.triggerAnalysis(modelName);
  };

  const requestLiveData = () => {
    webSocket.requestLiveData({
      modelName,
      timeRange: 60 // Last hour
    });
  };

  return (
    <div className="space-y-6">
      {/* Header avec statut de connexion */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
        <div className="flex items-center space-x-3">
          <Activity className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold">
            Dashboard Temps Réel - {modelName.charAt(0).toUpperCase() + modelName.slice(1)}
          </h2>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Statut de connexion */}
          <div className={`flex items-center space-x-2 ${
            showConnectionStatus ? 'opacity-100' : 'opacity-50'
          } transition-opacity`}>
            {webSocket.connected ? (
              <>
                <Wifi className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-600">Connecté</span>
              </>
            ) : webSocket.connecting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="text-sm text-blue-600">Connexion...</span>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-red-600" />
                <span className="text-sm text-red-600">Déconnecté</span>
              </>
            )}
          </div>

          {/* Compteur d'événements */}
          <div className="text-sm text-gray-600">
            {webSocket.eventsCount} événements
          </div>

          {/* Actions */}
          <button
            onClick={triggerAnalysis}
            disabled={!webSocket.connected}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded disabled:opacity-50"
          >
            Analyser
          </button>
          
          <button
            onClick={requestLiveData}
            disabled={!webSocket.connected}
            className="px-3 py-1 bg-gray-600 text-white text-sm rounded disabled:opacity-50"
          >
            Actualiser
          </button>
        </div>
      </div>

      {/* Erreur de connexion */}
      {webSocket.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-800">{webSocket.error}</span>
          </div>
          <button
            onClick={webSocket.connect}
            className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded"
          >
            Reconnecter
          </button>
        </div>
      )}

      {/* Filtres */}
      <FiltersPanel
        filters={filters}
        onFiltersChange={handleFilterChange}
        availablePlatforms={['instagram', 'tiktok', 'x', 'reddit']}
        availableMetrics={['ctr', 'cpl', 'conversion_rate', 'engagement_rate']}
      />

      {/* Alertes en temps réel */}
      <RealTimeAlerts 
        criticalAlerts={alertsWS.criticalAlerts}
        warningAlerts={alertsWS.warningAlerts}
        connected={alertsWS.connected}
      />

      {/* Métriques en temps réel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveMetricsPanel
          metrics={webSocket.liveMetrics}
          lastEvent={webSocket.lastEvent}
        />
        
        <LiveInsightsPanel
          insights={webSocket.recentInsights}
          eventHistory={webSocket.eventHistory}
        />
      </div>

      {/* Stream d'événements */}
      <EventStream 
        events={webSocket.eventHistory}
        lastEvent={webSocket.lastEvent}
      />
    </div>
  );
}

// Composant pour les filtres
function FiltersPanel({
  filters,
  onFiltersChange,
  availablePlatforms,
  availableMetrics
}: {
  filters: any;
  onFiltersChange: (filters: any) => void;
  availablePlatforms: string[];
  availableMetrics: string[];
}) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="text-lg font-medium mb-3">Filtres</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Filtre plateformes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Plateformes
          </label>
          <div className="space-y-1">
            {availablePlatforms.map(platform => (
              <label key={platform} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.platforms.includes(platform)}
                  onChange={(e) => {
                    const newPlatforms = e.target.checked
                      ? [...filters.platforms, platform]
                      : filters.platforms.filter((p: string) => p !== platform);
                    onFiltersChange({ ...filters, platforms: newPlatforms });
                  }}
                  className="mr-2"
                />
                <span className="text-sm capitalize">{platform}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Filtre métriques */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Métriques
          </label>
          <div className="space-y-1">
            {availableMetrics.map(metric => (
              <label key={metric} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.metricNames.includes(metric)}
                  onChange={(e) => {
                    const newMetrics = e.target.checked
                      ? [...filters.metricNames, metric]
                      : filters.metricNames.filter((m: string) => m !== metric);
                    onFiltersChange({ ...filters, metricNames: newMetrics });
                  }}
                  className="mr-2"
                />
                <span className="text-sm uppercase">{metric}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Composant pour les alertes
function RealTimeAlerts({
  criticalAlerts,
  warningAlerts,
  connected
}: {
  criticalAlerts: any[];
  warningAlerts: any[];
  connected: boolean;
}) {
  if (!connected) return null;

  const totalAlerts = criticalAlerts.length + warningAlerts.length;

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium flex items-center">
          <Bell className="h-5 w-5 mr-2" />
          Alertes Actives ({totalAlerts})
        </h3>
        {totalAlerts > 0 && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            {criticalAlerts.length} critiques
          </span>
        )}
      </div>

      {totalAlerts === 0 ? (
        <p className="text-gray-500 text-sm">Aucune alerte active</p>
      ) : (
        <div className="space-y-2">
          {criticalAlerts.map(alert => (
            <div key={alert.id} className="border-l-4 border-red-500 bg-red-50 p-3">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm font-medium text-red-800">Critique</p>
                  <p className="text-sm text-red-700">{alert.insight}</p>
                  <p className="text-xs text-red-600 mt-1">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
          
          {warningAlerts.map(alert => (
            <div key={alert.id} className="border-l-4 border-yellow-500 bg-yellow-50 p-3">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Attention</p>
                  <p className="text-sm text-yellow-700">{alert.insight}</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Composant pour les métriques live
function LiveMetricsPanel({
  metrics,
  lastEvent
}: {
  metrics: any[];
  lastEvent: any;
}) {
  const recentMetrics = metrics.slice(0, 10);

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">Métriques Temps Réel</h3>
        {lastEvent?.type === 'metric_update' && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <div className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse"></div>
            Live
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {recentMetrics.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune métrique reçue</p>
        ) : (
          recentMetrics.map((metric, index) => (
            <div key={metric.id || index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div>
                <span className="text-sm font-medium">{metric.metric_name?.toUpperCase()}</span>
                {metric.platform && (
                  <span className="ml-2 text-xs text-gray-600">({metric.platform})</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-mono">{parseFloat(metric.value).toFixed(2)}</span>
                <div className="text-xs text-gray-500">
                  {new Date(metric.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Composant pour les insights live
function LiveInsightsPanel({
  insights,
  eventHistory
}: {
  insights: any[];
  eventHistory: any[];
}) {
  const recentInsights = insights.slice(0, 5);

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">Insights Récents</h3>
        <span className="text-xs text-gray-500">
          {eventHistory.filter(e => e.type === 'insight_generated').length} générés
        </span>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto">
        {recentInsights.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucun insight récent</p>
        ) : (
          recentInsights.map((insight, index) => (
            <div key={insight.id || index} className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">{insight.insight}</p>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs px-2 py-1 rounded ${
                  insight.severity === 'critical' ? 'bg-red-100 text-red-800' :
                  insight.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {insight.severity}
                </span>
                <span className="text-xs text-blue-600">
                  {new Date(insight.created_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Composant pour le stream d'événements
function EventStream({
  events,
  lastEvent
}: {
  events: any[];
  lastEvent: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const recentEvents = events.slice(-20);

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">Stream d'Événements</h3>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {expanded ? 'Réduire' : 'Voir plus'}
        </button>
      </div>

      <div className={`space-y-2 overflow-y-auto ${expanded ? 'max-h-96' : 'max-h-40'}`}>
        {recentEvents.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucun événement</p>
        ) : (
          recentEvents.reverse().map((event, index) => (
            <div 
              key={index} 
              className={`p-2 rounded text-sm ${
                event === lastEvent ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  event.type === 'alert_triggered' ? 'bg-red-100 text-red-800' :
                  event.type === 'metric_update' ? 'bg-blue-100 text-blue-800' :
                  event.type === 'insight_generated' ? 'bg-purple-100 text-purple-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {event.type.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-1 text-gray-700">
                {event.data.insight || event.data.metricName || 'Événement système'}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}