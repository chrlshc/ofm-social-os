import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/kpi';

export interface KpiMetric {
  id: number;
  model_name: string;
  metric_name: string;
  value: number;
  platform?: string;
  campaign_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface KpiInsight {
  id: number;
  model_name: string;
  insight: string;
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, any>;
  created_at: string;
}

export interface KpiRecommendation {
  id: number;
  model_name: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'applied' | 'rejected';
  metadata?: Record<string, any>;
  created_at: string;
}

export async function fetchKpiData(
  modelName: string,
  options?: {
    startDate?: string;
    endDate?: string;
    platform?: string;
    limit?: number;
  }
): Promise<{ model: string; count: number; metrics: KpiMetric[] }> {
  const params = new URLSearchParams();
  if (options?.startDate) params.append('startDate', options.startDate);
  if (options?.endDate) params.append('endDate', options.endDate);
  if (options?.platform) params.append('platform', options.platform);
  if (options?.limit) params.append('limit', options.limit.toString());

  const response = await axios.get(`${API_BASE_URL}/${modelName}?${params}`);
  return response.data;
}

export async function fetchAggregatedData(
  modelName: string,
  groupBy: 'hour' | 'day' | 'week' = 'hour',
  metricName?: string
): Promise<any> {
  const params = new URLSearchParams({ groupBy });
  if (metricName) params.append('metricName', metricName);

  const response = await axios.get(`${API_BASE_URL}/${modelName}/aggregated?${params}`);
  return response.data;
}

export async function fetchInsights(
  modelName: string,
  options?: {
    limit?: number;
    severity?: 'info' | 'warning' | 'critical';
  }
): Promise<{ model: string; count: number; insights: KpiInsight[] }> {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.severity) params.append('severity', options.severity);

  const response = await axios.get(`${API_BASE_URL}/${modelName}/insights?${params}`);
  return response.data;
}

export async function fetchRecommendations(
  modelName: string,
  options?: {
    status?: 'pending' | 'applied' | 'rejected';
    priority?: 'low' | 'medium' | 'high';
  }
): Promise<{ model: string; count: number; recommendations: KpiRecommendation[] }> {
  const params = new URLSearchParams();
  if (options?.status) params.append('status', options.status);
  if (options?.priority) params.append('priority', options.priority);

  const response = await axios.get(`${API_BASE_URL}/${modelName}/recommendations?${params}`);
  return response.data;
}

export async function ingestMetric(data: {
  modelName: string;
  metricName: string;
  value: number;
  platform?: string;
  campaignId?: string;
  metadata?: Record<string, any>;
}): Promise<{ status: string; id: number }> {
  const response = await axios.post(`${API_BASE_URL}/ingest`, data);
  return response.data;
}

export async function ingestMetricsBatch(metrics: Array<{
  modelName: string;
  metricName: string;
  value: number;
  platform?: string;
  campaignId?: string;
  metadata?: Record<string, any>;
}>): Promise<{ status: string; count: number; ids: number[] }> {
  const response = await axios.post(`${API_BASE_URL}/ingest/batch`, metrics);
  return response.data;
}

export async function analyzeModel(modelName: string): Promise<{
  status: string;
  model: string;
  insights: number;
  recommendations: number;
  learnings: number;
  result: any;
}> {
  const response = await axios.post(`${API_BASE_URL}/${modelName}/analyze`);
  return response.data;
}

export async function updateRecommendationStatus(
  id: number,
  status: 'pending' | 'applied' | 'rejected'
): Promise<{ status: string; id: number; newStatus: string }> {
  const response = await axios.patch(`${API_BASE_URL}/recommendations/${id}`, { status });
  return response.data;
}

// Hook personnalisé pour l'auto-refresh
export function useAutoRefresh(callback: () => void, interval: number = 30000) {
  const intervalRef = React.useRef<NodeJS.Timeout>();

  React.useEffect(() => {
    intervalRef.current = setInterval(callback, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [callback, interval]);
}

// Utilitaires pour les graphiques
export function formatMetricValue(metricName: string, value: number): string {
  switch (metricName) {
    case 'ctr':
    case 'conversion_rate':
    case 'engagement_rate':
      return `${value.toFixed(2)}%`;
    case 'cpl':
    case 'cac':
    case 'revenue':
      return `${value.toFixed(2)}€`;
    case 'impressions':
    case 'clicks':
    case 'views':
      return value.toLocaleString();
    default:
      return value.toString();
  }
}