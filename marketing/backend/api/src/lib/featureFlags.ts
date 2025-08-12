import { redis } from './redis';
import { loggers } from './logger';
import { withSpan } from './otel';
import { promises as metrics } from './metrics';

const logger = loggers.featureFlags;

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  canaryPercentage: number;
  platforms?: string[];
  createdAt: Date;
  updatedAt: Date;
  description?: string;
  conditions?: FeatureFlagCondition[];
}

export interface FeatureFlagCondition {
  type: 'user_id' | 'creator_id' | 'platform' | 'version' | 'custom';
  operator: 'equals' | 'in' | 'not_in' | 'contains' | 'gt' | 'lt';
  value: string | string[] | number;
}

export interface FeatureFlagContext {
  userId?: string;
  creatorId?: string;
  platform?: string;
  version?: string;
  customAttributes?: Record<string, any>;
}

/**
 * Feature flag manager for canary deployments and platform-specific features
 */
export class FeatureFlagManager {
  private readonly CACHE_PREFIX = 'feature_flags:';
  private readonly CACHE_TTL = 300; // 5 minutes
  private flagsCache = new Map<string, FeatureFlag>();

  constructor() {
    // Initialize default platform flags
    this.initializeDefaultFlags();
  }

  // =============================================
  // Flag Management
  // =============================================

  /**
   * Get a feature flag by name
   */
  async getFeatureFlag(flagName: string): Promise<FeatureFlag | null> {
    return withSpan('feature_flags.get', {
      'flag.name': flagName
    }, async (span) => {
      try {
        // Check cache first
        const cacheKey = `${this.CACHE_PREFIX}${flagName}`;
        const cached = await redis.get(cacheKey);
        
        if (cached) {
          const flag = JSON.parse(cached) as FeatureFlag;
          span.setAttributes({
            'flag.enabled': flag.enabled,
            'flag.canary_percentage': flag.canaryPercentage,
            'cache.hit': true
          });
          return flag;
        }

        // Load from environment or default configuration
        const flag = this.getDefaultFlag(flagName);
        
        if (flag) {
          // Cache the flag
          await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(flag));
          
          span.setAttributes({
            'flag.enabled': flag.enabled,
            'flag.canary_percentage': flag.canaryPercentage,
            'cache.hit': false
          });
        }

        return flag;
      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          flagName
        }, 'Failed to get feature flag');
        return null;
      }
    });
  }

  /**
   * Check if a feature is enabled for a given context
   */
  async isFeatureEnabled(
    flagName: string, 
    context: FeatureFlagContext = {}
  ): Promise<boolean> {
    return withSpan('feature_flags.check', {
      'flag.name': flagName,
      'context.user_id': context.userId,
      'context.creator_id': context.creatorId,
      'context.platform': context.platform
    }, async (span) => {
      try {
        const flag = await this.getFeatureFlag(flagName);
        
        if (!flag) {
          span.setAttributes({ 'flag.found': false });
          return false;
        }

        if (!flag.enabled) {
          span.setAttributes({ 
            'flag.enabled': false,
            'result': false 
          });
          return false;
        }

        // Check platform-specific enablement
        if (flag.platforms && context.platform) {
          if (!flag.platforms.includes(context.platform)) {
            span.setAttributes({ 
              'flag.platform_excluded': true,
              'result': false 
            });
            return false;
          }
        }

        // Check conditions
        if (flag.conditions) {
          const conditionsMet = this.evaluateConditions(flag.conditions, context);
          if (!conditionsMet) {
            span.setAttributes({ 
              'flag.conditions_failed': true,
              'result': false 
            });
            return false;
          }
        }

        // Check canary percentage
        const isInCanary = this.isInCanaryGroup(flagName, context, flag.canaryPercentage);
        
        span.setAttributes({
          'flag.enabled': true,
          'flag.canary_percentage': flag.canaryPercentage,
          'flag.in_canary': isInCanary,
          'result': isInCanary
        });

        // Record metrics
        metrics.counter('feature_flag_evaluations_total', {
          flag_name: flagName,
          platform: context.platform || 'unknown',
          enabled: isInCanary.toString()
        }).inc();

        return isInCanary;
      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          flagName,
          context
        }, 'Failed to check feature flag');
        
        // Fail safe: return false for unknown flags
        return false;
      }
    });
  }

  /**
   * Update a feature flag
   */
  async updateFeatureFlag(
    flagName: string, 
    updates: Partial<FeatureFlag>
  ): Promise<FeatureFlag | null> {
    return withSpan('feature_flags.update', {
      'flag.name': flagName
    }, async (span) => {
      try {
        const existing = await this.getFeatureFlag(flagName);
        if (!existing) {
          throw new Error(`Feature flag ${flagName} not found`);
        }

        const updated: FeatureFlag = {
          ...existing,
          ...updates,
          updatedAt: new Date()
        };

        // Update cache
        const cacheKey = `${this.CACHE_PREFIX}${flagName}`;
        await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(updated));

        // Store in flags cache
        this.flagsCache.set(flagName, updated);

        logger.info({
          flagName,
          updates,
          newFlag: updated
        }, 'Feature flag updated');

        // Record metrics
        metrics.counter('feature_flag_updates_total', {
          flag_name: flagName
        }).inc();

        return updated;
      } catch (error) {
        span.recordException(error as Error);
        logger.error({
          err: error,
          flagName,
          updates
        }, 'Failed to update feature flag');
        throw error;
      }
    });
  }

  // =============================================
  // Platform-Specific Flags
  // =============================================

  /**
   * Check if a platform is enabled for a creator
   */
  async isPlatformEnabled(platform: string, creatorId: string): Promise<boolean> {
    return this.isFeatureEnabled(`platform_${platform}`, { 
      creatorId, 
      platform 
    });
  }

  /**
   * Get all enabled platforms for a creator
   */
  async getEnabledPlatforms(creatorId: string): Promise<string[]> {
    const platforms = ['instagram', 'tiktok', 'x', 'reddit'];
    const enabledPlatforms: string[] = [];

    for (const platform of platforms) {
      const enabled = await this.isPlatformEnabled(platform, creatorId);
      if (enabled) {
        enabledPlatforms.push(platform);
      }
    }

    return enabledPlatforms;
  }

  // =============================================
  // Canary Logic
  // =============================================

  /**
   * Determine if a user is in the canary group for a flag
   */
  private isInCanaryGroup(
    flagName: string,
    context: FeatureFlagContext,
    canaryPercentage: number
  ): boolean {
    if (canaryPercentage >= 100) {
      return true;
    }

    if (canaryPercentage <= 0) {
      return false;
    }

    // Use consistent hashing based on flag name and user identifier
    const identifier = context.userId || context.creatorId || 'anonymous';
    const hashInput = `${flagName}:${identifier}`;
    
    // Simple hash function (in production, use a proper hash function)
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to percentage (0-99)
    const bucket = Math.abs(hash) % 100;
    
    return bucket < canaryPercentage;
  }

  /**
   * Evaluate flag conditions
   */
  private evaluateConditions(
    conditions: FeatureFlagCondition[], 
    context: FeatureFlagContext
  ): boolean {
    return conditions.every(condition => {
      const contextValue = this.getContextValue(condition.type, context);
      
      switch (condition.operator) {
        case 'equals':
          return contextValue === condition.value;
        
        case 'in':
          return Array.isArray(condition.value) && 
                 condition.value.includes(contextValue);
        
        case 'not_in':
          return Array.isArray(condition.value) && 
                 !condition.value.includes(contextValue);
        
        case 'contains':
          return typeof contextValue === 'string' && 
                 typeof condition.value === 'string' &&
                 contextValue.includes(condition.value);
        
        case 'gt':
          return typeof contextValue === 'number' && 
                 typeof condition.value === 'number' &&
                 contextValue > condition.value;
        
        case 'lt':
          return typeof contextValue === 'number' && 
                 typeof condition.value === 'number' &&
                 contextValue < condition.value;
        
        default:
          return false;
      }
    });
  }

  /**
   * Get context value by type
   */
  private getContextValue(type: string, context: FeatureFlagContext): any {
    switch (type) {
      case 'user_id':
        return context.userId;
      case 'creator_id':
        return context.creatorId;
      case 'platform':
        return context.platform;
      case 'version':
        return context.version;
      case 'custom':
        return context.customAttributes;
      default:
        return null;
    }
  }

  // =============================================
  // Default Flags
  // =============================================

  /**
   * Initialize default feature flags from environment
   */
  private initializeDefaultFlags(): void {
    const envFlags = process.env.FEATURE_FLAGS;
    if (envFlags) {
      try {
        const flags = JSON.parse(envFlags);
        
        Object.entries(flags).forEach(([name, config]: [string, any]) => {
          this.flagsCache.set(name, {
            name,
            enabled: config.enabled || false,
            canaryPercentage: config.canaryPercentage || 0,
            platforms: config.platforms || [],
            createdAt: new Date(),
            updatedAt: new Date(),
            description: config.description || '',
            conditions: config.conditions || []
          });
        });
        
        logger.info({ 
          flagCount: Object.keys(flags).length 
        }, 'Feature flags loaded from environment');
      } catch (error) {
        logger.error({ err: error }, 'Failed to parse FEATURE_FLAGS from environment');
      }
    }

    // Set default platform flags
    this.setDefaultPlatformFlags();
  }

  /**
   * Set default platform flags
   */
  private setDefaultPlatformFlags(): void {
    const defaultPlatformFlags: Record<string, Partial<FeatureFlag>> = {
      'platform_instagram': {
        enabled: true,
        canaryPercentage: 10,
        description: 'Instagram publishing functionality'
      },
      'platform_tiktok': {
        enabled: true,
        canaryPercentage: 10,
        description: 'TikTok publishing functionality'
      },
      'platform_x': {
        enabled: false,
        canaryPercentage: 0,
        description: 'X (Twitter) publishing functionality'
      },
      'platform_reddit': {
        enabled: true,
        canaryPercentage: 10,
        description: 'Reddit publishing functionality'
      },
      'feature_whisper_subtitles': {
        enabled: true,
        canaryPercentage: 10,
        description: 'AI-generated subtitles using Whisper'
      },
      'feature_multi_account_scaling': {
        enabled: true,
        canaryPercentage: 10,
        description: 'Multi-account scaling and rate limiting'
      },
      'feature_gdpr_compliance': {
        enabled: true,
        canaryPercentage: 100,
        description: 'GDPR compliance features (always enabled)'
      }
    };

    Object.entries(defaultPlatformFlags).forEach(([name, config]) => {
      if (!this.flagsCache.has(name)) {
        this.flagsCache.set(name, {
          name,
          enabled: config.enabled || false,
          canaryPercentage: config.canaryPercentage || 0,
          platforms: config.platforms || [],
          createdAt: new Date(),
          updatedAt: new Date(),
          description: config.description || '',
          conditions: config.conditions || []
        });
      }
    });
  }

  /**
   * Get default flag configuration
   */
  private getDefaultFlag(flagName: string): FeatureFlag | null {
    return this.flagsCache.get(flagName) || null;
  }

  // =============================================
  // Utility Methods
  // =============================================

  /**
   * Get all feature flags
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    return Array.from(this.flagsCache.values());
  }

  /**
   * Clear flag cache
   */
  async clearCache(): Promise<void> {
    try {
      const keys = await redis.keys(`${this.CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      
      logger.info({ 
        clearedKeys: keys.length 
      }, 'Feature flag cache cleared');
    } catch (error) {
      logger.error({ err: error }, 'Failed to clear feature flag cache');
    }
  }

  /**
   * Health check for feature flag system
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    flagCount: number;
    cacheConnected: boolean;
  }> {
    try {
      // Test Redis connection
      await redis.ping();
      
      const flagCount = this.flagsCache.size;
      
      return {
        healthy: true,
        flagCount,
        cacheConnected: true
      };
    } catch (error) {
      logger.error({ err: error }, 'Feature flag health check failed');
      return {
        healthy: false,
        flagCount: this.flagsCache.size,
        cacheConnected: false
      };
    }
  }
}

// Default feature flag manager instance
export const featureFlagManager = new FeatureFlagManager();