import { Insight } from '../models/BaseModel';
import { callLLM } from '../utils/llm';

export interface KPIContext {
  modelName: string;
  aggregatedMetrics: Record<string, number>;
  trends: Record<string, string>;
  benchmarks: Record<string, { rank: number; score: number }>;
  anomalies: string[];
}

export interface RecommendationOptions {
  maxTokens?: number;
  temperature?: number;
  includeActionItems?: boolean;
  priorityLevel?: 'low' | 'medium' | 'high';
}

export async function generateRecommendations(
  context: KPIContext,
  options: RecommendationOptions = {}
): Promise<Insight[]> {
  const { modelName, aggregatedMetrics, trends, benchmarks, anomalies } = context;
  const { maxTokens = 300, temperature = 0.5, includeActionItems = true } = options;

  const prompt = `
Tu es un assistant marketing expert pour le modèle "${modelName}".
Voici les métriques agrégées :
${Object.entries(aggregatedMetrics).map(([k, v]) => `- ${k} : ${v}`).join('\n')}
Tendances observées :
${Object.entries(trends).map(([k, v]) => `- ${k} : ${v}`).join('\n')}
Classement par rapport aux autres modèles :
${Object.entries(benchmarks).map(([k, b]) => `- ${k} : rang ${b.rank}, score ${b.score}`).join('\n')}
Anomalies détectées :
${anomalies.length > 0 ? anomalies.join('\n') : 'Aucune'}

Sur la base de ces informations, liste 3 recommandations actionnables pour améliorer les performances.
Chaque recommandation doit être concise (1 ou 2 phrases) et spécifier la métrique ciblée.
${includeActionItems ? 'Inclus des actions concrètes à prendre immédiatement.' : ''}
`;

  try {
    const response = await callLLM(prompt, {
      maxTokens,
      temperature
    });

    return response
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map((line) => ({
        modelName,
        insight: line.trim(),
        severity: 'info' as const,
        createdAt: new Date()
      }));
  } catch (error) {
    console.error('Error generating AI recommendations:', error);
    return [{
      modelName,
      insight: `Erreur lors de la génération des recommandations: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      severity: 'critical',
      createdAt: new Date()
    }];
  }
}

export async function generateContextualInsights(
  context: KPIContext,
  historicalData: Array<{ date: Date; metrics: Record<string, number> }>
): Promise<Insight[]> {
  const timeSeriesContext = historicalData
    .slice(-7)
    .map(d => `${d.date.toISOString().split('T')[0]}: ${Object.entries(d.metrics).map(([k, v]) => `${k}=${v}`).join(', ')}`)
    .join('\n');

  const enrichedPrompt = `
Contexte historique des 7 derniers jours pour "${context.modelName}":
${timeSeriesContext}

État actuel:
${Object.entries(context.aggregatedMetrics).map(([k, v]) => `- ${k} : ${v}`).join('\n')}

Analyse les patterns temporels et génère 2-3 insights sur les opportunités d'optimisation.
`;

  try {
    const response = await callLLM(enrichedPrompt, {
      maxTokens: 250,
      temperature: 0.3
    });

    return response
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map((line, index) => ({
        modelName: context.modelName,
        insight: line.trim(),
        timestamp: new Date(),
        category: 'temporal_analysis',
        priority: 'medium',
        id: `temporal_${context.modelName}_${Date.now()}_${index}`
      }));
  } catch (error) {
    console.error('Error generating contextual insights:', error);
    return [];
  }
}