import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Configuration des clients LLM
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// Fonction générique pour appeler un LLM
export async function callLLM(
  prompt: string, 
  options: LLMOptions = {}
): Promise<string> {
  const provider = process.env.LLM_PROVIDER || 'openai';
  
  try {
    if (provider === 'anthropic' && anthropic) {
      const response = await anthropic.messages.create({
        model: options.model || 'claude-3-sonnet-20240229',
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        system: options.systemPrompt || 'Tu es un expert en marketing digital et analyse de données.',
        messages: [{ role: 'user', content: prompt }]
      });
      
      return response.content[0].type === 'text' 
        ? response.content[0].text 
        : JSON.stringify(response.content);
    } else if (provider === 'openai' && openai) {
      const messages: any[] = [];
      
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      
      messages.push({ role: 'user', content: prompt });
      
      const response = await openai.chat.completions.create({
        model: options.model || 'gpt-4-turbo-preview',
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000
      });
      
      return response.choices[0].message.content || '';
    } else {
      // Fallback pour les tests ou si aucun LLM n'est configuré
      console.warn('Aucun LLM configuré, retour d\'une réponse mock');
      return generateMockResponse(prompt);
    }
  } catch (error) {
    console.error('Erreur lors de l\'appel LLM:', error);
    throw new Error(`Erreur LLM: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }
}

// Fonction pour générer des embeddings
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    console.warn('OpenAI non configuré pour les embeddings');
    return Array(1536).fill(0).map(() => Math.random());
  }
  
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Erreur lors de la génération d\'embedding:', error);
    throw error;
  }
}

// Fonction mock pour les tests
function generateMockResponse(prompt: string): string {
  if (prompt.includes('JSON')) {
    return JSON.stringify([
      {
        action: "Optimiser les visuels pour mobile",
        impact: "high",
        timeframe: "court terme"
      },
      {
        action: "Tester de nouveaux horaires de publication",
        impact: "medium",
        timeframe: "court terme"
      },
      {
        action: "Développer une stratégie de contenu UGC",
        impact: "high",
        timeframe: "moyen terme"
      }
    ]);
  }
  
  return "Recommandation basée sur l'analyse: Optimiser le ciblage et tester de nouveaux formats créatifs.";
}

// Cache simple pour éviter les appels répétitifs
const llmCache = new Map<string, { response: string; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 heure

export async function callLLMWithCache(
  prompt: string,
  options: LLMOptions = {}
): Promise<string> {
  const cacheKey = `${prompt}-${JSON.stringify(options)}`;
  const cached = llmCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }
  
  const response = await callLLM(prompt, options);
  llmCache.set(cacheKey, { response, timestamp: Date.now() });
  
  // Nettoyer le cache périodiquement
  if (llmCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of llmCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        llmCache.delete(key);
      }
    }
  }
  
  return response;
}