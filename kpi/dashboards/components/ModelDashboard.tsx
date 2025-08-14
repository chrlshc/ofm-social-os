'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { format, subDays } from 'date-fns';
import { TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { fetchKpiData, fetchInsights, fetchRecommendations } from '../lib/api';

// Enregistrer les composants Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Props {
  modelName: string;
}

export default function ModelDashboard({ modelName }: Props) {
  // Fetch des données
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics', modelName],
    queryFn: () => fetchKpiData(modelName),
    refetchInterval: 30000 // Rafraîchir toutes les 30 secondes
  });

  const { data: insights } = useQuery({
    queryKey: ['insights', modelName],
    queryFn: () => fetchInsights(modelName)
  });

  const { data: recommendations } = useQuery({
    queryKey: ['recommendations', modelName],
    queryFn: () => fetchRecommendations(modelName)
  });

  if (metricsLoading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>;
  }

  // Préparer les données pour les graphiques
  const ctrData = prepareCtrData(metrics?.metrics || []);
  const platformData = preparePlatformData(metrics?.metrics || []);
  const conversionData = prepareConversionData(metrics?.metrics || []);
  const stats = calculateStats(metrics?.metrics || []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">
        Dashboard KPI - {modelName.charAt(0).toUpperCase() + modelName.slice(1)}
      </h1>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="CTR Moyen"
          value={`${stats.avgCtr.toFixed(2)}%`}
          trend={stats.ctrTrend}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="CPL Moyen"
          value={`${stats.avgCpl.toFixed(2)}€`}
          trend={stats.cplTrend}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <StatCard
          title="Conversion"
          value={`${stats.avgConversion.toFixed(2)}%`}
          trend={stats.conversionTrend}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="Alertes Actives"
          value={insights?.insights.filter(i => i.severity === 'critical').length || 0}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Évolution du CTR</h3>
          <Line data={ctrData} options={{
            responsive: true,
            plugins: {
              legend: { position: 'top' as const },
              title: { display: false }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { callback: (value) => `${value}%` }
              }
            }
          }} />
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Répartition par Plateforme</h3>
          <Doughnut data={platformData} options={{
            responsive: true,
            plugins: {
              legend: { position: 'right' as const }
            }
          }} />
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Taux de Conversion par Jour</h3>
          <Bar data={conversionData} options={{
            responsive: true,
            plugins: {
              legend: { position: 'top' as const }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { callback: (value) => `${value}%` }
              }
            }
          }} />
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Insights Récents</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {insights?.insights.slice(0, 5).map((insight, idx) => (
              <InsightCard key={idx} insight={insight} />
            ))}
          </div>
        </div>
      </div>

      {/* Recommandations */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Recommandations IA</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recommendations?.recommendations
            .filter(r => r.status === 'pending')
            .slice(0, 6)
            .map((rec, idx) => (
              <RecommendationCard key={idx} recommendation={rec} />
            ))}
        </div>
      </div>
    </div>
  );
}

// Composants auxiliaires
function StatCard({ title, value, trend, icon }: any) {
  const isPositive = trend > 0;
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {trend !== undefined && (
            <p className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}{trend.toFixed(1)}%
            </p>
          )}
        </div>
        <div className={`p-3 rounded-full ${trend !== undefined && !isPositive ? 'bg-red-100' : 'bg-green-100'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ insight }: any) {
  const severityColors = {
    info: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800'
  };

  return (
    <div className="flex items-start space-x-3">
      <Info className="h-5 w-5 text-gray-400 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-gray-800">{insight.insight}</p>
        <span className={`inline-block px-2 py-1 text-xs rounded-full mt-1 ${severityColors[insight.severity]}`}>
          {insight.severity}
        </span>
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation }: any) {
  const priorityColors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-blue-100 text-blue-800',
    high: 'bg-purple-100 text-purple-800'
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <p className="text-sm text-gray-800 mb-2">{recommendation.recommendation}</p>
      <span className={`inline-block px-2 py-1 text-xs rounded-full ${priorityColors[recommendation.priority]}`}>
        {recommendation.priority}
      </span>
    </div>
  );
}

// Fonctions de préparation des données
function prepareCtrData(metrics: any[]) {
  const ctrMetrics = metrics
    .filter(m => m.metric_name === 'ctr')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-30);

  return {
    labels: ctrMetrics.map(m => format(new Date(m.created_at), 'dd/MM')),
    datasets: [{
      label: 'CTR (%)',
      data: ctrMetrics.map(m => parseFloat(m.value)),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.1,
      fill: true
    }]
  };
}

function preparePlatformData(metrics: any[]) {
  const platforms = ['instagram', 'tiktok', 'x', 'reddit'];
  const counts = platforms.map(p => 
    metrics.filter(m => m.platform === p).length
  );

  return {
    labels: platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)),
    datasets: [{
      data: counts,
      backgroundColor: [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)'
      ],
      borderWidth: 1
    }]
  };
}

function prepareConversionData(metrics: any[]) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    return {
      date,
      label: format(date, 'dd/MM')
    };
  });

  const conversionByDay = last7Days.map(day => {
    const dayMetrics = metrics.filter(m => 
      m.metric_name === 'conversion_rate' &&
      format(new Date(m.created_at), 'dd/MM') === day.label
    );
    const avg = dayMetrics.length > 0
      ? dayMetrics.reduce((sum, m) => sum + parseFloat(m.value), 0) / dayMetrics.length
      : 0;
    return avg;
  });

  return {
    labels: last7Days.map(d => d.label),
    datasets: [{
      label: 'Taux de conversion (%)',
      data: conversionByDay,
      backgroundColor: 'rgba(147, 51, 234, 0.8)',
      borderColor: 'rgb(147, 51, 234)',
      borderWidth: 1
    }]
  };
}

function calculateStats(metrics: any[]) {
  const ctrMetrics = metrics.filter(m => m.metric_name === 'ctr').map(m => parseFloat(m.value));
  const cplMetrics = metrics.filter(m => m.metric_name === 'cpl').map(m => parseFloat(m.value));
  const conversionMetrics = metrics.filter(m => m.metric_name === 'conversion_rate').map(m => parseFloat(m.value));

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  // Calculer les tendances (comparaison avec la période précédente)
  const halfLength = Math.floor(ctrMetrics.length / 2);
  const ctrTrend = halfLength > 0 
    ? ((avg(ctrMetrics.slice(halfLength)) - avg(ctrMetrics.slice(0, halfLength))) / avg(ctrMetrics.slice(0, halfLength))) * 100
    : 0;

  return {
    avgCtr: avg(ctrMetrics),
    avgCpl: avg(cplMetrics),
    avgConversion: avg(conversionMetrics),
    ctrTrend,
    cplTrend: 0, // À implémenter
    conversionTrend: 0 // À implémenter
  };
}