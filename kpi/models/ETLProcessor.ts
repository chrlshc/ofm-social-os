import { db } from '../utils/db';
import { KpiRecord } from './BaseModel';

export interface ETLConfig {
  modelName: string;
  transformations: TransformationRule[];
  aggregations: AggregationRule[];
  validations: ValidationRule[];
  schedule?: string; // Cron expression
}

export interface TransformationRule {
  name: string;
  sourceMetric: string;
  targetMetric: string;
  transformation: (value: number, metadata?: any) => number;
  condition?: (record: KpiRecord) => boolean;
}

export interface AggregationRule {
  name: string;
  sourceMetrics: string[];
  targetMetric: string;
  aggregationType: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'custom';
  timeWindow: string; // SQL interval like '1 hour', '1 day'
  customAggregation?: (values: number[]) => number;
  groupBy?: string[]; // Fields to group by (platform, campaign_id, etc.)
}

export interface ValidationRule {
  name: string;
  metricName: string;
  validator: (value: number, metadata?: any) => boolean;
  errorAction: 'reject' | 'warn' | 'correct';
  correctionFunction?: (value: number) => number;
}

export interface ProcessedData {
  originalRecords: KpiRecord[];
  transformedRecords: KpiRecord[];
  aggregatedMetrics: KpiRecord[];
  validationErrors: ValidationError[];
  processingStats: {
    totalRecords: number;
    transformedCount: number;
    aggregatedCount: number;
    rejectedCount: number;
    processingTime: number;
  };
}

export interface ValidationError {
  record: KpiRecord;
  rule: string;
  error: string;
  action: 'rejected' | 'corrected' | 'warned';
}

export class ETLProcessor {
  private config: ETLConfig;
  
  constructor(config: ETLConfig) {
    this.config = config;
  }
  
  // Point d'entrée principal pour le processing ETL
  async processKpiData(
    startDate?: Date, 
    endDate?: Date,
    options?: { forceReprocess?: boolean }
  ): Promise<ProcessedData> {
    const startTime = Date.now();
    
    console.log(`Starting ETL processing for model: ${this.config.modelName}`);
    
    // 1. Extract - Récupérer les données brutes
    const rawRecords = await this.extractRawData(startDate, endDate);
    console.log(`Extracted ${rawRecords.length} raw records`);
    
    // 2. Transform - Appliquer les transformations
    const { transformedRecords, validationErrors } = await this.transformData(rawRecords);
    console.log(`Transformed ${transformedRecords.length} records, ${validationErrors.length} validation errors`);
    
    // 3. Load - Générer les agrégations
    const aggregatedMetrics = await this.aggregateData(transformedRecords);
    console.log(`Generated ${aggregatedMetrics.length} aggregated metrics`);
    
    // 4. Sauvegarder les données traitées
    if (options?.forceReprocess || transformedRecords.length > 0) {
      await this.loadProcessedData(transformedRecords, aggregatedMetrics);
    }
    
    const processingTime = Date.now() - startTime;
    
    return {
      originalRecords: rawRecords,
      transformedRecords,
      aggregatedMetrics,
      validationErrors,
      processingStats: {
        totalRecords: rawRecords.length,
        transformedCount: transformedRecords.length,
        aggregatedCount: aggregatedMetrics.length,
        rejectedCount: validationErrors.filter(e => e.action === 'rejected').length,
        processingTime
      }
    };
  }
  
  // Extract - Récupération des données brutes
  private async extractRawData(startDate?: Date, endDate?: Date): Promise<KpiRecord[]> {
    let query = 'SELECT * FROM kpi_metrics WHERE model_name = $1';
    const params: any[] = [this.config.modelName];
    
    if (startDate) {
      params.push(startDate);
      query += ` AND created_at >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      query += ` AND created_at <= $${params.length}`;
    }
    
    // Éviter de reprocesser des données déjà traitées
    query += ` AND (metadata->>'processed' IS NULL OR metadata->>'processed' = 'false')`;
    query += ' ORDER BY created_at ASC';
    
    const result = await db.query(query, params);
    
    return result.rows.map(row => ({
      modelName: row.model_name,
      metricName: row.metric_name,
      value: parseFloat(row.value),
      platform: row.platform,
      campaignId: row.campaign_id,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at)
    }));
  }
  
  // Transform - Application des transformations et validations
  private async transformData(records: KpiRecord[]): Promise<{
    transformedRecords: KpiRecord[];
    validationErrors: ValidationError[];
  }> {
    const transformedRecords: KpiRecord[] = [];
    const validationErrors: ValidationError[] = [];
    
    for (const record of records) {
      // 1. Validation
      const validation = this.validateRecord(record);
      if (validation.errors.length > 0) {
        validationErrors.push(...validation.errors);
        if (validation.shouldReject) {
          continue; // Skip ce record
        }
        // Si correction, utiliser le record corrigé
        if (validation.correctedRecord) {
          Object.assign(record, validation.correctedRecord);
        }
      }
      
      // 2. Transformations
      const transformed = this.applyTransformations(record);
      transformedRecords.push(...transformed);
    }
    
    return { transformedRecords, validationErrors };
  }
  
  // Validation d'un record
  private validateRecord(record: KpiRecord): {
    errors: ValidationError[];
    shouldReject: boolean;
    correctedRecord?: Partial<KpiRecord>;
  } {
    const errors: ValidationError[] = [];
    let shouldReject = false;
    let correctedRecord: Partial<KpiRecord> = {};
    
    const applicableRules = this.config.validations.filter(rule => 
      rule.metricName === record.metricName || rule.metricName === '*'
    );
    
    for (const rule of applicableRules) {
      if (!rule.validator(record.value, record.metadata)) {
        const error: ValidationError = {
          record,
          rule: rule.name,
          error: `Validation failed for ${rule.name}`,
          action: rule.errorAction === 'reject' ? 'rejected' : 
                  rule.errorAction === 'correct' ? 'corrected' : 'warned'
        };
        
        errors.push(error);
        
        if (rule.errorAction === 'reject') {
          shouldReject = true;
        } else if (rule.errorAction === 'correct' && rule.correctionFunction) {
          correctedRecord.value = rule.correctionFunction(record.value);
          correctedRecord.metadata = {
            ...record.metadata,
            corrected: true,
            originalValue: record.value,
            correctionRule: rule.name
          };
        }
      }
    }
    
    return { errors, shouldReject, correctedRecord: Object.keys(correctedRecord).length > 0 ? correctedRecord : undefined };
  }
  
  // Application des transformations
  private applyTransformations(record: KpiRecord): KpiRecord[] {
    const results: KpiRecord[] = [record]; // Toujours inclure le record original
    
    const applicableTransformations = this.config.transformations.filter(transform =>
      transform.sourceMetric === record.metricName &&
      (!transform.condition || transform.condition(record))
    );
    
    for (const transform of applicableTransformations) {
      try {
        const transformedValue = transform.transformation(record.value, record.metadata);
        
        const transformedRecord: KpiRecord = {
          ...record,
          metricName: transform.targetMetric,
          value: transformedValue,
          metadata: {
            ...record.metadata,
            transformed: true,
            sourceMetric: record.metricName,
            transformationRule: transform.name
          }
        };
        
        results.push(transformedRecord);
      } catch (error) {
        console.error(`Transformation ${transform.name} failed for record:`, record, error);
      }
    }
    
    return results;
  }
  
  // Aggregate - Génération des métriques agrégées
  private async aggregateData(records: KpiRecord[]): Promise<KpiRecord[]> {
    const aggregatedMetrics: KpiRecord[] = [];
    
    for (const rule of this.config.aggregations) {
      try {
        const aggregated = await this.applyAggregationRule(records, rule);
        aggregatedMetrics.push(...aggregated);
      } catch (error) {
        console.error(`Aggregation ${rule.name} failed:`, error);
      }
    }
    
    return aggregatedMetrics;
  }
  
  // Application d'une règle d'agrégation
  private async applyAggregationRule(records: KpiRecord[], rule: AggregationRule): Promise<KpiRecord[]> {
    // Filtrer les records applicables
    const applicableRecords = records.filter(record =>
      rule.sourceMetrics.includes(record.metricName)
    );
    
    if (applicableRecords.length === 0) return [];
    
    // Grouper par les dimensions spécifiées
    const groups = this.groupRecords(applicableRecords, rule.groupBy || []);
    
    const results: KpiRecord[] = [];
    
    for (const [groupKey, groupRecords] of groups.entries()) {
      const values = groupRecords.map(r => r.value);
      let aggregatedValue: number;
      
      switch (rule.aggregationType) {
        case 'sum':
          aggregatedValue = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
        case 'count':
          aggregatedValue = values.length;
          break;
        case 'custom':
          aggregatedValue = rule.customAggregation!(values);
          break;
        default:
          throw new Error(`Unknown aggregation type: ${rule.aggregationType}`);
      }
      
      // Parse group key pour extraire les dimensions
      const groupDimensions = this.parseGroupKey(groupKey, rule.groupBy || []);
      const baseRecord = groupRecords[0];
      
      const aggregatedRecord: KpiRecord = {
        modelName: this.config.modelName,
        metricName: rule.targetMetric,
        value: aggregatedValue,
        platform: groupDimensions.platform,
        campaignId: groupDimensions.campaignId,
        metadata: {
          aggregated: true,
          aggregationRule: rule.name,
          sourceMetrics: rule.sourceMetrics,
          recordCount: groupRecords.length,
          timeWindow: rule.timeWindow,
          ...groupDimensions
        },
        createdAt: new Date()
      };
      
      results.push(aggregatedRecord);
    }
    
    return results;
  }
  
  // Grouper les records par dimensions
  private groupRecords(records: KpiRecord[], groupBy: string[]): Map<string, KpiRecord[]> {
    const groups = new Map<string, KpiRecord[]>();
    
    for (const record of records) {
      const key = this.generateGroupKey(record, groupBy);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    }
    
    return groups;
  }
  
  private generateGroupKey(record: KpiRecord, groupBy: string[]): string {
    const keyParts: string[] = [];
    
    for (const dimension of groupBy) {
      let value: string;
      
      switch (dimension) {
        case 'platform':
          value = record.platform || 'unknown';
          break;
        case 'campaignId':
          value = record.campaignId || 'unknown';
          break;
        case 'hour':
          value = record.createdAt ? record.createdAt.getHours().toString() : '0';
          break;
        case 'day':
          value = record.createdAt ? record.createdAt.toISOString().split('T')[0] : 'unknown';
          break;
        default:
          value = record.metadata?.[dimension]?.toString() || 'unknown';
      }
      
      keyParts.push(`${dimension}:${value}`);
    }
    
    return keyParts.join('|');
  }
  
  private parseGroupKey(key: string, groupBy: string[]): any {
    const result: any = {};
    const parts = key.split('|');
    
    for (let i = 0; i < parts.length && i < groupBy.length; i++) {
      const [dimension, value] = parts[i].split(':');
      if (value !== 'unknown') {
        result[dimension] = value;
      }
    }
    
    return result;
  }
  
  // Load - Sauvegarde des données traitées
  private async loadProcessedData(transformedRecords: KpiRecord[], aggregatedMetrics: KpiRecord[]): Promise<void> {
    await db.transaction(async (client) => {
      // Insérer les records transformés
      for (const record of transformedRecords) {
        await client.query(
          `INSERT INTO kpi_metrics (model_name, metric_name, value, platform, campaign_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            record.modelName,
            record.metricName,
            record.value,
            record.platform,
            record.campaignId,
            { ...record.metadata, processed: true }
          ]
        );
      }
      
      // Insérer les métriques agrégées
      for (const metric of aggregatedMetrics) {
        await client.query(
          `INSERT INTO kpi_metrics (model_name, metric_name, value, platform, campaign_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            metric.modelName,
            metric.metricName,
            metric.value,
            metric.platform,
            metric.campaignId,
            metric.metadata
          ]
        );
      }
    });
  }
  
  // Méthode utilitaire pour créer des transformations communes
  static createCommonTransformations(): TransformationRule[] {
    return [
      {
        name: 'percentage_to_decimal',
        sourceMetric: '*',
        targetMetric: '*_decimal',
        transformation: (value: number) => value / 100,
        condition: (record) => record.metricName.includes('_rate') || record.metricName.includes('_percentage')
      },
      {
        name: 'cost_per_mille',
        sourceMetric: 'cost',
        targetMetric: 'cpm',
        transformation: (value: number, metadata?: any) => {
          const impressions = metadata?.impressions || 1000;
          return (value / impressions) * 1000;
        }
      },
      {
        name: 'click_through_rate',
        sourceMetric: 'clicks',
        targetMetric: 'ctr_calculated',
        transformation: (value: number, metadata?: any) => {
          const impressions = metadata?.impressions || 1;
          return (value / impressions) * 100;
        },
        condition: (record) => record.metadata?.impressions !== undefined
      }
    ];
  }
  
  // Méthode utilitaire pour créer des validations communes
  static createCommonValidations(): ValidationRule[] {
    return [
      {
        name: 'positive_values_only',
        metricName: '*',
        validator: (value: number) => value >= 0,
        errorAction: 'reject'
      },
      {
        name: 'percentage_range',
        metricName: '*_rate',
        validator: (value: number) => value >= 0 && value <= 100,
        errorAction: 'correct',
        correctionFunction: (value: number) => Math.max(0, Math.min(100, value))
      },
      {
        name: 'reasonable_cost_range',
        metricName: 'cpl',
        validator: (value: number) => value >= 0 && value <= 1000,
        errorAction: 'warn'
      },
      {
        name: 'remove_outliers',
        metricName: '*',
        validator: (value: number, metadata?: any) => {
          if (!metadata?.expectedRange) return true;
          const { min, max } = metadata.expectedRange;
          return value >= min && value <= max;
        },
        errorAction: 'reject'
      }
    ];
  }
}

// Factory pour créer des processeurs ETL pour chaque modèle
export class ETLProcessorFactory {
  static createMarketingETL(): ETLProcessor {
    const config: ETLConfig = {
      modelName: 'marketing',
      transformations: [
        ...ETLProcessor.createCommonTransformations(),
        {
          name: 'engagement_rate',
          sourceMetric: 'total_engagements',
          targetMetric: 'engagement_rate',
          transformation: (value: number, metadata?: any) => {
            const impressions = metadata?.impressions || 1;
            return (value / impressions) * 100;
          },
          condition: (record) => record.metadata?.impressions !== undefined
        }
      ],
      aggregations: [
        {
          name: 'hourly_ctr',
          sourceMetrics: ['ctr'],
          targetMetric: 'hourly_avg_ctr',
          aggregationType: 'avg',
          timeWindow: '1 hour',
          groupBy: ['platform', 'hour']
        },
        {
          name: 'daily_spend',
          sourceMetrics: ['cost'],
          targetMetric: 'daily_total_spend',
          aggregationType: 'sum',
          timeWindow: '1 day',
          groupBy: ['platform', 'day']
        },
        {
          name: 'campaign_performance',
          sourceMetrics: ['conversion_rate'],
          targetMetric: 'campaign_avg_conversion',
          aggregationType: 'avg',
          timeWindow: '1 day',
          groupBy: ['campaignId']
        }
      ],
      validations: [
        ...ETLProcessor.createCommonValidations(),
        {
          name: 'reasonable_ctr',
          metricName: 'ctr',
          validator: (value: number) => value >= 0 && value <= 50,
          errorAction: 'warn'
        }
      ]
    };
    
    return new ETLProcessor(config);
  }
  
  static createOnboardingETL(): ETLProcessor {
    const config: ETLConfig = {
      modelName: 'onboarding',
      transformations: ETLProcessor.createCommonTransformations(),
      aggregations: [
        {
          name: 'daily_signups',
          sourceMetrics: ['signups_started'],
          targetMetric: 'daily_signup_count',
          aggregationType: 'sum',
          timeWindow: '1 day',
          groupBy: ['day']
        },
        {
          name: 'conversion_funnel',
          sourceMetrics: ['signups_completed', 'signups_started'],
          targetMetric: 'signup_conversion_rate',
          aggregationType: 'custom',
          timeWindow: '1 day',
          customAggregation: (values: number[]) => {
            // Assuming values[0] is completed, values[1] is started
            const completed = values[0] || 0;
            const started = values[1] || 1;
            return (completed / started) * 100;
          },
          groupBy: ['day']
        }
      ],
      validations: ETLProcessor.createCommonValidations()
    };
    
    return new ETLProcessor(config);
  }
  
  static createPaymentETL(): ETLProcessor {
    const config: ETLConfig = {
      modelName: 'payment',
      transformations: [
        ...ETLProcessor.createCommonTransformations(),
        {
          name: 'monthly_recurring_revenue',
          sourceMetric: 'subscription_value',
          targetMetric: 'mrr_contribution',
          transformation: (value: number, metadata?: any) => {
            const billingCycle = metadata?.billingCycle || 'monthly';
            switch (billingCycle) {
              case 'yearly': return value / 12;
              case 'weekly': return value * 4.33;
              case 'daily': return value * 30;
              default: return value;
            }
          }
        }
      ],
      aggregations: [
        {
          name: 'daily_revenue',
          sourceMetrics: ['transaction_amount'],
          targetMetric: 'daily_total_revenue',
          aggregationType: 'sum',
          timeWindow: '1 day',
          groupBy: ['day']
        },
        {
          name: 'monthly_mrr',
          sourceMetrics: ['mrr_contribution'],
          targetMetric: 'total_mrr',
          aggregationType: 'sum',
          timeWindow: '1 month',
          groupBy: ['month']
        }
      ],
      validations: [
        ...ETLProcessor.createCommonValidations(),
        {
          name: 'reasonable_transaction_amount',
          metricName: 'transaction_amount',
          validator: (value: number) => value >= 0 && value <= 10000,
          errorAction: 'warn'
        }
      ]
    };
    
    return new ETLProcessor(config);
  }
}