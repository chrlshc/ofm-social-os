import { KpiRecord } from '../models/BaseModel';
import * as yup from 'yup';
import { db } from '../utils/db';

// Schémas de validation Yup plus robustes
const kpiSchema = yup.object({
  modelName: yup.string()
    .required('Model name is required')
    .oneOf(['marketing', 'onboarding', 'payment'], 'Invalid model name')
    .transform(val => val?.toLowerCase()),
  
  metricName: yup.string()
    .required('Metric name is required')
    .matches(/^[a-zA-Z0-9_]+$/, 'Metric name must contain only alphanumeric characters and underscores')
    .max(50, 'Metric name too long')
    .transform(val => val?.toLowerCase()),
  
  value: yup.number()
    .required('Value is required')
    .min(0, 'Value must be positive')
    .max(1000000, 'Value too large'),
  
  platform: yup.string()
    .optional()
    .oneOf(['instagram', 'tiktok', 'x', 'reddit', 'linkedin', 'youtube'], 'Invalid platform')
    .transform(val => val?.toLowerCase()),
  
  campaignId: yup.string()
    .optional()
    .matches(/^[a-zA-Z0-9_-]+$/, 'Invalid campaign ID format')
    .max(100, 'Campaign ID too long'),
  
  createdAt: yup.date()
    .optional()
    .default(() => new Date())
    .max(new Date(), 'Date cannot be in the future'),
  
  metadata: yup.object()
    .optional()
    .test('size', 'Metadata too large', val => 
      !val || JSON.stringify(val).length < 1000
    )
});

// Schémas spécialisés par type de métrique
const ctrSchema = kpiSchema.shape({
  value: yup.number().min(0).max(100, 'CTR cannot exceed 100%')
});

const cplSchema = kpiSchema.shape({
  value: yup.number().min(0).max(1000, 'CPL seems unreasonably high')
});

const conversionSchema = kpiSchema.shape({
  value: yup.number().min(0).max(100, 'Conversion rate cannot exceed 100%')
});

export interface ValidationResult {
  valid: KpiRecord[];
  invalid: Array<{
    record: any;
    errors: string[];
  }>;
  stats: {
    total: number;
    validCount: number;
    invalidCount: number;
    duplicates: number;
  };
}

export interface ETLConfig {
  enableDuplicateDetection: boolean;
  enableOutlierDetection: boolean;
  outlierThreshold: number; // nombre d'écarts-types
  batchSize: number;
  enableMetricSpecificValidation: boolean;
}

export class ImprovedETLProcessor {
  private config: ETLConfig;
  private processedIds: Set<string> = new Set(); // Cache pour détecter les doublons
  
  constructor(config: Partial<ETLConfig> = {}) {
    this.config = {
      enableDuplicateDetection: true,
      enableOutlierDetection: true,
      outlierThreshold: 3,
      batchSize: 1000,
      enableMetricSpecificValidation: true,
      ...config
    };
  }

  /**
   * Valide et normalise un enregistrement KPI avec validation spécialisée.
   */
  async validateRecord(raw: any): Promise<KpiRecord> {
    // Choisir le schéma approprié
    let schema = kpiSchema;
    
    if (this.config.enableMetricSpecificValidation && raw.metricName) {
      const metricType = raw.metricName.toLowerCase();
      if (metricType.includes('ctr') || metricType.includes('click_through')) {
        schema = ctrSchema;
      } else if (metricType.includes('cpl') || metricType.includes('cost_per_lead')) {
        schema = cplSchema;
      } else if (metricType.includes('conversion')) {
        schema = conversionSchema;
      }
    }
    
    const validated = await schema.validate(raw, { stripUnknown: true });
    
    return {
      modelName: validated.modelName,
      metricName: validated.metricName,
      value: validated.value,
      platform: validated.platform,
      campaignId: validated.campaignId,
      createdAt: validated.createdAt,
      metadata: this.sanitizeMetadata(validated.metadata)
    };
  }

  /**
   * Traite un batch d'enregistrements avec validation robuste et statistiques détaillées.
   */
  async processBatch(records: any[]): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: [],
      invalid: [],
      stats: {
        total: records.length,
        validCount: 0,
        invalidCount: 0,
        duplicates: 0
      }
    };

    // Traitement par chunks pour éviter la surcharge mémoire
    const chunks = this.chunkArray(records, this.config.batchSize);
    
    for (const chunk of chunks) {
      await this.processChunk(chunk, result);
    }

    // Détection d'outliers si activée
    if (this.config.enableOutlierDetection && result.valid.length > 10) {
      result.valid = this.filterOutliers(result.valid);
    }

    result.stats.validCount = result.valid.length;
    result.stats.invalidCount = result.invalid.length;

    return result;
  }

  /**
   * Traite un chunk avec gestion d'erreur individuelle.
   */
  private async processChunk(chunk: any[], result: ValidationResult): Promise<void> {
    const validationPromises = chunk.map(async (record, index) => {
      try {
        const validated = await this.validateRecord(record);
        
        // Vérification des doublons si activée
        if (this.config.enableDuplicateDetection) {
          const recordId = this.generateRecordId(validated);
          if (this.processedIds.has(recordId)) {
            result.stats.duplicates++;
            return; // Skip duplicate
          }
          this.processedIds.add(recordId);
        }
        
        result.valid.push(validated);
      } catch (error) {
        const validationError = error as yup.ValidationError;
        result.invalid.push({
          record,
          errors: validationError.errors || [validationError.message || 'Unknown validation error']
        });
      }
    });

    await Promise.allSettled(validationPromises);
  }

  /**
   * Filtre les outliers basé sur le z-score.
   */
  private filterOutliers(records: KpiRecord[]): KpiRecord[] {
    const metricGroups = this.groupByMetric(records);
    const filtered: KpiRecord[] = [];

    for (const [metricName, metricRecords] of metricGroups.entries()) {
      if (metricRecords.length < 10) {
        // Pas assez de données pour détecter les outliers
        filtered.push(...metricRecords);
        continue;
      }

      const values = metricRecords.map(r => r.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
      );

      if (stdDev === 0) {
        // Toutes les valeurs sont identiques
        filtered.push(...metricRecords);
        continue;
      }

      const filteredMetricRecords = metricRecords.filter(record => {
        const zScore = Math.abs((record.value - mean) / stdDev);
        return zScore <= this.config.outlierThreshold;
      });

      filtered.push(...filteredMetricRecords);
      
      const outlierCount = metricRecords.length - filteredMetricRecords.length;
      if (outlierCount > 0) {
        console.log(`Filtered ${outlierCount} outliers from ${metricName} (threshold: ${this.config.outlierThreshold} std dev)`);
      }
    }

    return filtered;
  }

  /**
   * Nettoyage et validation des métadonnées.
   */
  private sanitizeMetadata(metadata: any): Record<string, any> {
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }

    const sanitized: Record<string, any> = {};
    const allowedKeys = ['source', 'campaign', 'version', 'tags', 'description', 'experiment'];
    
    for (const [key, value] of Object.entries(metadata)) {
      if (allowedKeys.includes(key)) {
        if (typeof value === 'string' && value.length <= 100) {
          sanitized[key] = value.trim();
        } else if (typeof value === 'number' && isFinite(value)) {
          sanitized[key] = value;
        } else if (Array.isArray(value) && value.length <= 5) {
          sanitized[key] = value.slice(0, 5);
        }
      }
    }

    return sanitized;
  }

  /**
   * Génère un ID unique pour détecter les doublons.
   */
  private generateRecordId(record: KpiRecord): string {
    const timestamp = record.createdAt?.getTime() || Date.now();
    const roundedTimestamp = Math.floor(timestamp / (5 * 60 * 1000)) * (5 * 60 * 1000); // Rond à 5 minutes
    
    return `${record.modelName}-${record.metricName}-${record.platform || 'none'}-${record.campaignId || 'none'}-${roundedTimestamp}`;
  }

  /**
   * Groupe les records par métrique.
   */
  private groupByMetric(records: KpiRecord[]): Map<string, KpiRecord[]> {
    const groups = new Map<string, KpiRecord[]>();
    
    for (const record of records) {
      if (!groups.has(record.metricName)) {
        groups.set(record.metricName, []);
      }
      groups.get(record.metricName)!.push(record);
    }
    
    return groups;
  }

  /**
   * Divise un array en chunks.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Sauvegarde les données validées en base avec gestion de transaction.
   */
  async saveValidatedData(validatedRecords: KpiRecord[]): Promise<{
    saved: number;
    errors: Array<{ record: KpiRecord; error: string }>;
  }> {
    const result = {
      saved: 0,
      errors: [] as Array<{ record: KpiRecord; error: string }>
    };

    // Traiter par chunks pour éviter les transactions trop longues
    const chunks = this.chunkArray(validatedRecords, 100);

    for (const chunk of chunks) {
      try {
        await db.transaction(async (client) => {
          for (const record of chunk) {
            try {
              await client.query(
                `INSERT INTO kpi_metrics (model_name, metric_name, value, platform, campaign_id, metadata, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  record.modelName,
                  record.metricName,
                  record.value,
                  record.platform || null,
                  record.campaignId || null,
                  record.metadata || {},
                  record.createdAt
                ]
              );
              result.saved++;
            } catch (error) {
              result.errors.push({
                record,
                error: error instanceof Error ? error.message : 'Unknown database error'
              });
            }
          }
        });
      } catch (error) {
        // Si toute la transaction échoue, marquer tous les records du chunk comme erreur
        for (const record of chunk) {
          result.errors.push({
            record,
            error: `Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    }

    return result;
  }

  /**
   * Génère un rapport de qualité des données.
   */
  generateQualityReport(validationResult: ValidationResult): {
    overall: { score: number; grade: string };
    details: {
      validationRate: number;
      duplicateRate: number;
      commonErrors: Array<{ error: string; count: number }>;
      metricDistribution: Record<string, number>;
    };
    recommendations: string[];
  } {
    const { stats, invalid, valid } = validationResult;
    
    // Score global (0-100)
    const validationRate = (stats.validCount / stats.total) * 100;
    const duplicateRate = (stats.duplicates / stats.total) * 100;
    const overallScore = Math.max(0, validationRate - duplicateRate * 0.5);
    
    // Grade basé sur le score
    let grade = 'F';
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 80) grade = 'B';
    else if (overallScore >= 70) grade = 'C';
    else if (overallScore >= 60) grade = 'D';
    
    // Analyser les erreurs communes
    const errorCounts = new Map<string, number>();
    invalid.forEach(item => {
      item.errors.forEach(error => {
        errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
      });
    });
    
    const commonErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Distribution des métriques
    const metricDistribution: Record<string, number> = {};
    valid.forEach(record => {
      metricDistribution[record.metricName] = (metricDistribution[record.metricName] || 0) + 1;
    });
    
    // Recommandations
    const recommendations: string[] = [];
    if (validationRate < 90) {
      recommendations.push('Améliorer la validation des données en amont');
    }
    if (duplicateRate > 5) {
      recommendations.push('Mettre en place une déduplication plus stricte');
    }
    if (commonErrors.length > 0) {
      recommendations.push(`Corriger l'erreur la plus fréquente: ${commonErrors[0].error}`);
    }
    
    return {
      overall: { score: Math.round(overallScore), grade },
      details: {
        validationRate,
        duplicateRate,
        commonErrors,
        metricDistribution
      },
      recommendations
    };
  }

  /**
   * Méthode principale pour traiter des données avec rapport complet.
   */
  async processWithReport(records: any[]): Promise<{
    validation: ValidationResult;
    storage: { saved: number; errors: Array<{ record: KpiRecord; error: string }> };
    quality: ReturnType<ImprovedETLProcessor['generateQualityReport']>;
  }> {
    console.log(`Processing ${records.length} records...`);
    
    // Étape 1: Validation
    const validation = await this.processBatch(records);
    console.log(`Validation completed: ${validation.stats.validCount}/${validation.stats.total} valid`);
    
    // Étape 2: Sauvegarde
    const storage = await this.saveValidatedData(validation.valid);
    console.log(`Storage completed: ${storage.saved} saved, ${storage.errors.length} errors`);
    
    // Étape 3: Rapport qualité
    const quality = this.generateQualityReport(validation);
    console.log(`Quality score: ${quality.overall.score}/100 (${quality.overall.grade})`);
    
    return { validation, storage, quality };
  }

  /**
   * Nettoie le cache des doublons (à appeler périodiquement).
   */
  clearDuplicateCache(): void {
    this.processedIds.clear();
    console.log('Duplicate detection cache cleared');
  }

  /**
   * Met à jour la configuration.
   */
  updateConfig(newConfig: Partial<ETLConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}