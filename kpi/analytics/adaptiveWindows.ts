/**
 * Système de fenêtres temporelles adaptatives basé sur la variabilité des données
 */

import { db } from '../utils/db';
import { calculateBasicStats, analyzeTrends, StatsSummary } from './StatsUtils';
import { createError } from '../utils/errorHandler';

export interface WindowConfig {
  metricName: string;
  modelName: string;
  defaultWindow: number; // en heures
  minWindow: number;
  maxWindow: number;
  adaptiveEnabled: boolean;
  lastCalculated: Date;
  confidence: number; // 0-1
}

export interface VariabilityProfile {
  metricName: string;
  modelName: string;
  meanInterval: number; // Intervalle moyen entre les points (en minutes)
  coefficientOfVariation: number; // CV = stddev/mean
  dataFrequency: number; // Points par heure
  seasonalityStrength: number; // 0-1
  trendStrength: number; // 0-1
  optimalWindow: number; // en heures
  confidence: number;
  sampleSize: number;
  analysisTimestamp: Date;
}

export interface TimeWindowRecommendation {
  currentWindow: number;
  recommendedWindow: number;
  reason: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  dataQuality: number; // 0-1
}

export class AdaptiveWindowManager {
  private windowConfigs: Map<string, WindowConfig> = new Map();
  private variabilityProfiles: Map<string, VariabilityProfile> = new Map();
  private readonly defaultConfigs = {
    // Marketing metrics - patterns courts et volatils
    marketing: {
      ctr: { defaultWindow: 6, minWindow: 1, maxWindow: 24 },
      cpl: { defaultWindow: 12, minWindow: 2, maxWindow: 48 },
      engagement_rate: { defaultWindow: 4, minWindow: 1, maxWindow: 12 },
      reach: { defaultWindow: 24, minWindow: 6, maxWindow: 72 }
    },
    // Payment metrics - patterns plus stables
    payment: {
      conversion_rate: { defaultWindow: 24, minWindow: 6, maxWindow: 168 }, // 1 semaine max
      payment_success: { defaultWindow: 12, minWindow: 2, maxWindow: 72 },
      churn_rate: { defaultWindow: 168, minWindow: 24, maxWindow: 720 }, // 30 jours max
      arpu: { defaultWindow: 168, minWindow: 24, maxWindow: 720 }
    },
    // Onboarding metrics - patterns moyens
    onboarding: {
      completion_rate: { defaultWindow: 48, minWindow: 12, maxWindow: 168 },
      retention_rate: { defaultWindow: 168, minWindow: 24, maxWindow: 720 },
      activation_rate: { defaultWindow: 24, minWindow: 6, maxWindow: 168 }
    }
  };

  constructor() {
    this.initializeConfigs();
  }

  /**
   * Initialiser les configurations par défaut
   */
  private initializeConfigs(): void {
    for (const [modelName, metrics] of Object.entries(this.defaultConfigs)) {
      for (const [metricName, config] of Object.entries(metrics)) {
        const key = `${modelName}_${metricName}`;
        this.windowConfigs.set(key, {
          metricName,
          modelName,
          defaultWindow: config.defaultWindow,
          minWindow: config.minWindow,
          maxWindow: config.maxWindow,
          adaptiveEnabled: true,
          lastCalculated: new Date(0), // Force recalculation
          confidence: 0.5
        });
      }
    }
  }

  /**
   * Analyser la variabilité d'une métrique pour déterminer la fenêtre optimale
   */
  async analyzeMetricVariability(
    modelName: string, 
    metricName: string,
    lookbackDays: number = 30
  ): Promise<VariabilityProfile> {
    
    const startTime = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    
    // Récupérer les données historiques
    const query = `
      SELECT 
        value,
        created_at,
        EXTRACT(EPOCH FROM created_at) as timestamp_epoch
      FROM kpi_metrics 
      WHERE model_name = $1 
        AND metric_name = $2 
        AND created_at >= $3
      ORDER BY created_at ASC
    `;
    
    const result = await db.query(query, [modelName, metricName, startTime]);
    
    if (result.rows.length < 10) {
      throw createError.validation(`Insufficient data for ${modelName}.${metricName}: ${result.rows.length} points`);
    }

    const values = result.rows.map(r => r.value);
    const timestamps = result.rows.map(r => new Date(r.created_at));
    
    // Calculs statistiques de base
    const stats = calculateBasicStats(values);
    const trendResult = analyzeTrends(values, { detectSeasonality: true });
    
    // Analyser la fréquence des données
    const intervals = this.calculateIntervals(timestamps);
    const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length; // en minutes
    const dataFrequency = 60 / meanInterval; // points par heure
    
    // Coefficient de variation (stabilité)
    const coefficientOfVariation = stats.standardDeviation / Math.abs(stats.mean);
    
    // Force de saisonnalité
    const seasonalityStrength = trendResult.seasonality?.detected 
      ? (trendResult.seasonality.amplitude || 0) / stats.mean 
      : 0;
    
    // Force de tendance
    const trendStrength = Math.abs(trendResult.slope) * values.length / stats.mean;
    
    // Calculer la fenêtre optimale
    const optimalWindow = this.calculateOptimalWindow(
      coefficientOfVariation,
      dataFrequency,
      seasonalityStrength,
      trendStrength,
      modelName,
      metricName
    );
    
    // Calculer la confiance basée sur la taille d'échantillon et la cohérence
    const confidence = this.calculateConfidence(result.rows.length, coefficientOfVariation);
    
    const profile: VariabilityProfile = {
      metricName,
      modelName,
      meanInterval,
      coefficientOfVariation,
      dataFrequency,
      seasonalityStrength,
      trendStrength,
      optimalWindow,
      confidence,
      sampleSize: result.rows.length,
      analysisTimestamp: new Date()
    };
    
    // Sauvegarder le profil
    const key = `${modelName}_${metricName}`;
    this.variabilityProfiles.set(key, profile);
    
    return profile;
  }

  /**
   * Calculer les intervalles entre les timestamps
   */
  private calculateIntervals(timestamps: Date[]): number[] {
    const intervals: number[] = [];
    
    for (let i = 1; i < timestamps.length; i++) {
      const interval = (timestamps[i].getTime() - timestamps[i-1].getTime()) / (1000 * 60); // minutes
      intervals.push(interval);
    }
    
    return intervals;
  }

  /**
   * Calculer la fenêtre optimale basée sur les caractéristiques des données
   */
  private calculateOptimalWindow(
    cv: number,
    frequency: number,
    seasonality: number,
    trend: number,
    modelName: string,
    metricName: string
  ): number {
    
    const baseConfig = this.getBaseConfig(modelName, metricName);
    let optimalWindow = baseConfig.defaultWindow;
    
    // Ajustements basés sur la variabilité
    if (cv > 1.0) {
      // Très variable -> fenêtre plus courte pour capturer les changements
      optimalWindow *= 0.6;
    } else if (cv < 0.2) {
      // Très stable -> fenêtre plus longue pour éviter le bruit
      optimalWindow *= 1.5;
    }
    
    // Ajustements basés sur la fréquence des données
    if (frequency > 10) {
      // Haute fréquence -> peut se permettre une fenêtre plus courte
      optimalWindow *= 0.8;
    } else if (frequency < 1) {
      // Basse fréquence -> besoin d'une fenêtre plus longue
      optimalWindow *= 2.0;
    }
    
    // Ajustements basés sur la saisonnalité
    if (seasonality > 0.3) {
      // Forte saisonnalité -> aligner sur le cycle détecté
      if (metricName.includes('daily') || seasonality > 0.7) {
        optimalWindow = Math.max(optimalWindow, 24); // Au moins 24h
      }
    }
    
    // Ajustements basés sur la tendance
    if (trend > 0.1) {
      // Forte tendance -> fenêtre plus longue pour la détecter
      optimalWindow *= 1.3;
    }
    
    // Contraintes min/max
    optimalWindow = Math.max(baseConfig.minWindow, 
                    Math.min(baseConfig.maxWindow, optimalWindow));
    
    return Math.round(optimalWindow);
  }

  /**
   * Calculer la confiance de la recommandation
   */
  private calculateConfidence(sampleSize: number, cv: number): number {
    // Confiance basée sur la taille d'échantillon
    const sampleConfidence = Math.min(sampleSize / 100, 1); // 100 points = confiance max
    
    // Confiance basée sur la stabilité (CV faible = plus confiant)
    const stabilityConfidence = Math.exp(-cv * 2); // Décroissance exponentielle
    
    // Moyenne pondérée
    return (sampleConfidence * 0.4 + stabilityConfidence * 0.6);
  }

  /**
   * Obtenir la configuration de base pour une métrique
   */
  private getBaseConfig(modelName: string, metricName: string): {
    defaultWindow: number;
    minWindow: number; 
    maxWindow: number;
  } {
    const modelDefaults = this.defaultConfigs[modelName as keyof typeof this.defaultConfigs];
    if (modelDefaults && modelDefaults[metricName as keyof typeof modelDefaults]) {
      return modelDefaults[metricName as keyof typeof modelDefaults];
    }
    
    // Valeurs par défaut génériques
    return { defaultWindow: 24, minWindow: 2, maxWindow: 168 };
  }

  /**
   * Générer une recommandation de fenêtre pour une métrique
   */
  async generateWindowRecommendation(
    modelName: string,
    metricName: string
  ): Promise<TimeWindowRecommendation> {
    
    const key = `${modelName}_${metricName}`;
    let config = this.windowConfigs.get(key);
    
    if (!config) {
      // Créer une configuration par défaut
      const baseConfig = this.getBaseConfig(modelName, metricName);
      config = {
        metricName,
        modelName,
        ...baseConfig,
        adaptiveEnabled: true,
        lastCalculated: new Date(0),
        confidence: 0.5
      };
      this.windowConfigs.set(key, config);
    }
    
    // Analyser la variabilité si nécessaire
    const shouldRecalculate = 
      Date.now() - config.lastCalculated.getTime() > 24 * 60 * 60 * 1000 || // Plus de 24h
      config.confidence < 0.7; // Confiance faible
    
    let profile = this.variabilityProfiles.get(key);
    
    if (shouldRecalculate || !profile) {
      try {
        profile = await this.analyzeMetricVariability(modelName, metricName);
        config.lastCalculated = new Date();
        config.confidence = profile.confidence;
      } catch (error) {
        // Pas assez de données, utiliser la configuration par défaut
        return {
          currentWindow: config.defaultWindow,
          recommendedWindow: config.defaultWindow,
          reason: 'Insufficient data for analysis, using default window',
          confidence: 0.3,
          impact: 'low',
          dataQuality: 0.3
        };
      }
    }
    
    // Générer la recommandation
    const currentWindow = config.defaultWindow;
    const recommendedWindow = profile.optimalWindow;
    const difference = Math.abs(recommendedWindow - currentWindow);
    const relativeDifference = difference / currentWindow;
    
    let reason = 'Window analysis based on data variability';
    let impact: 'low' | 'medium' | 'high' = 'low';
    
    if (relativeDifference > 0.5) {
      impact = 'high';
      if (recommendedWindow > currentWindow) {
        reason = `High data stability (CV: ${profile.coefficientOfVariation.toFixed(2)}) suggests longer window`;
      } else {
        reason = `High data variability (CV: ${profile.coefficientOfVariation.toFixed(2)}) suggests shorter window`;
      }
    } else if (relativeDifference > 0.2) {
      impact = 'medium';
      reason = `Moderate adjustment based on data frequency (${profile.dataFrequency.toFixed(1)} points/hour)`;
    }
    
    if (profile.seasonalityStrength > 0.3) {
      reason += `. Strong seasonality detected (${(profile.seasonalityStrength * 100).toFixed(1)}%)`;
    }
    
    if (profile.trendStrength > 0.1) {
      reason += `. Trend detected (strength: ${(profile.trendStrength * 100).toFixed(1)}%)`;
    }
    
    // Calculer la qualité des données
    const dataQuality = Math.min(
      profile.sampleSize / 100, // Plus d'échantillons = meilleure qualité
      1 / (1 + profile.coefficientOfVariation), // Moins de variabilité = meilleure qualité
      profile.confidence
    );
    
    return {
      currentWindow,
      recommendedWindow,
      reason,
      confidence: profile.confidence,
      impact,
      dataQuality
    };
  }

  /**
   * Appliquer automatiquement les recommandations à forte confiance
   */
  async applyAutomaticAdjustments(minConfidence: number = 0.8): Promise<{
    applied: number;
    skipped: number;
    results: Array<{
      modelName: string;
      metricName: string;
      oldWindow: number;
      newWindow: number;
      confidence: number;
    }>;
  }> {
    
    const results = [];
    let applied = 0;
    let skipped = 0;
    
    for (const [key, config] of this.windowConfigs.entries()) {
      if (!config.adaptiveEnabled) {
        skipped++;
        continue;
      }
      
      try {
        const recommendation = await this.generateWindowRecommendation(
          config.modelName, 
          config.metricName
        );
        
        if (recommendation.confidence >= minConfidence && 
            recommendation.impact === 'high' &&
            recommendation.recommendedWindow !== recommendation.currentWindow) {
          
          // Appliquer la recommandation
          const oldWindow = config.defaultWindow;
          config.defaultWindow = recommendation.recommendedWindow;
          config.confidence = recommendation.confidence;
          
          results.push({
            modelName: config.modelName,
            metricName: config.metricName,
            oldWindow,
            newWindow: recommendation.recommendedWindow,
            confidence: recommendation.confidence
          });
          
          applied++;
          
          console.log(`Applied window adjustment: ${config.modelName}.${config.metricName}: ${oldWindow}h → ${recommendation.recommendedWindow}h (confidence: ${(recommendation.confidence * 100).toFixed(1)}%)`);
        } else {
          skipped++;
        }
        
      } catch (error) {
        console.warn(`Failed to analyze ${config.modelName}.${config.metricName}:`, error instanceof Error ? error.message : 'Unknown error');
        skipped++;
      }
    }
    
    return { applied, skipped, results };
  }

  /**
   * Obtenir la fenêtre optimale pour une métrique donnée
   */
  getOptimalWindow(modelName: string, metricName: string): number {
    const key = `${modelName}_${metricName}`;
    const config = this.windowConfigs.get(key);
    return config?.defaultWindow || this.getBaseConfig(modelName, metricName).defaultWindow;
  }

  /**
   * Analyser toutes les métriques et générer un rapport complet
   */
  async generateAdaptiveWindowReport(): Promise<{
    summary: {
      totalMetrics: number;
      adaptiveEnabled: number;
      highConfidence: number;
      needsAdjustment: number;
    };
    recommendations: TimeWindowRecommendation[];
    profiles: VariabilityProfile[];
  }> {
    
    const recommendations: TimeWindowRecommendation[] = [];
    const profiles: VariabilityProfile[] = [];
    
    let adaptiveEnabled = 0;
    let highConfidence = 0;
    let needsAdjustment = 0;
    
    for (const [key, config] of this.windowConfigs.entries()) {
      if (config.adaptiveEnabled) {
        adaptiveEnabled++;
        
        try {
          const recommendation = await this.generateWindowRecommendation(
            config.modelName,
            config.metricName
          );
          
          recommendations.push(recommendation);
          
          if (recommendation.confidence > 0.7) {
            highConfidence++;
          }
          
          if (recommendation.impact !== 'low') {
            needsAdjustment++;
          }
          
          const profile = this.variabilityProfiles.get(key);
          if (profile) {
            profiles.push(profile);
          }
          
        } catch (error) {
          console.warn(`Failed to analyze ${key}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
    
    return {
      summary: {
        totalMetrics: this.windowConfigs.size,
        adaptiveEnabled,
        highConfidence,
        needsAdjustment
      },
      recommendations,
      profiles
    };
  }

  /**
   * Sauvegarder les configurations dans la base de données
   */
  async saveConfigurations(): Promise<void> {
    const configurations = Array.from(this.windowConfigs.entries()).map(([key, config]) => {
      const profile = this.variabilityProfiles.get(key);
      return {
        model_name: config.modelName,
        metric_name: config.metricName,
        default_window: config.defaultWindow,
        min_window: config.minWindow,
        max_window: config.maxWindow,
        adaptive_enabled: config.adaptiveEnabled,
        confidence: config.confidence,
        last_calculated: config.lastCalculated,
        variability_profile: profile ? JSON.stringify(profile) : null
      };
    });

    // Upsert en base de données
    for (const config of configurations) {
      await db.query(
        `INSERT INTO kpi_adaptive_windows 
         (model_name, metric_name, default_window, min_window, max_window, 
          adaptive_enabled, confidence, last_calculated, variability_profile)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (model_name, metric_name) 
         DO UPDATE SET 
           default_window = EXCLUDED.default_window,
           confidence = EXCLUDED.confidence,
           last_calculated = EXCLUDED.last_calculated,
           variability_profile = EXCLUDED.variability_profile`,
        [
          config.model_name,
          config.metric_name,
          config.default_window,
          config.min_window,
          config.max_window,
          config.adaptive_enabled,
          config.confidence,
          config.last_calculated,
          config.variability_profile
        ]
      );
    }
  }

  /**
   * Charger les configurations depuis la base de données
   */
  async loadConfigurations(): Promise<void> {
    const result = await db.query(`
      SELECT * FROM kpi_adaptive_windows
    `);

    for (const row of result.rows) {
      const key = `${row.model_name}_${row.metric_name}`;
      
      const config: WindowConfig = {
        metricName: row.metric_name,
        modelName: row.model_name,
        defaultWindow: row.default_window,
        minWindow: row.min_window,
        maxWindow: row.max_window,
        adaptiveEnabled: row.adaptive_enabled,
        confidence: row.confidence,
        lastCalculated: new Date(row.last_calculated)
      };
      
      this.windowConfigs.set(key, config);
      
      if (row.variability_profile) {
        try {
          const profile = JSON.parse(row.variability_profile);
          this.variabilityProfiles.set(key, profile);
        } catch (error) {
          console.warn(`Failed to parse variability profile for ${key}`);
        }
      }
    }
  }
}

/**
 * Instance singleton du gestionnaire de fenêtres adaptatives
 */
let adaptiveWindowManager: AdaptiveWindowManager | null = null;

export function getAdaptiveWindowManager(): AdaptiveWindowManager {
  if (!adaptiveWindowManager) {
    adaptiveWindowManager = new AdaptiveWindowManager();
  }
  return adaptiveWindowManager;
}

/**
 * Job périodique pour l'ajustement automatique des fenêtres
 */
export async function runAdaptiveWindowAdjustment(): Promise<void> {
  console.log('Starting adaptive window adjustment...');
  
  try {
    const manager = getAdaptiveWindowManager();
    await manager.loadConfigurations();
    
    const results = await manager.applyAutomaticAdjustments(0.8);
    
    if (results.applied > 0) {
      await manager.saveConfigurations();
      console.log(`Applied ${results.applied} window adjustments, skipped ${results.skipped}`);
    } else {
      console.log(`No adjustments needed, skipped ${results.skipped} metrics`);
    }
    
  } catch (error) {
    console.error('Adaptive window adjustment failed:', error);
  }
}