import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import crypto from 'crypto';

// Configuration de sécurité
export const securityConfig = {
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // limite par IP
    maxRequestsPerUser: 1000, // limite par utilisateur authentifié
    skipSuccessfulRequests: false
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
  },
  csrf: {
    enabled: process.env.NODE_ENV === 'production',
    secret: process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production'
  },
  encryption: {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    tagLength: 16
  }
};

// Middleware de sécurité de base avec Helmet
export const basicSecurity = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false // Pour permettre les WebSockets
});

// Rate limiting avec différents niveaux
export const createRateLimit = (options: {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs || securityConfig.rateLimiting.windowMs,
    max: options.max || securityConfig.rateLimiting.maxRequests,
    message: {
      error: 'Too many requests',
      message: options.message || 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((options.windowMs || securityConfig.rateLimiting.windowMs) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    // Fonction personnalisée pour identifier les utilisateurs
    keyGenerator: (req: Request) => {
      // Priorité : userId > API key > IP
      const userId = req.headers['x-user-id'] as string;
      const apiKey = req.headers['x-api-key'] as string;
      
      if (userId) return `user:${userId}`;
      if (apiKey) return `api:${apiKey}`;
      return req.ip;
    }
  });
};

// Rate limits spécialisés
export const rateLimits = {
  // Rate limit standard pour l'API
  standard: createRateLimit({
    max: 100,
    message: 'Standard API rate limit exceeded'
  }),
  
  // Rate limit strict pour les opérations sensibles
  strict: createRateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10,
    message: 'Sensitive operation rate limit exceeded'
  }),
  
  // Rate limit pour l'ingestion de métriques
  ingestion: createRateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000,
    message: 'Metric ingestion rate limit exceeded',
    skipSuccessfulRequests: true
  }),
  
  // Rate limit pour les WebSockets
  websocket: createRateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50,
    message: 'WebSocket connection rate limit exceeded'
  })
};

// Validation et sanitization des inputs
export class InputValidator {
  // Schémas de validation communs
  static readonly commonSchemas = {
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(1).max(100),
    modelName: z.enum(['marketing', 'onboarding', 'payment', 'all']),
    metricName: z.string().regex(/^[a-zA-Z0-9_]+$/).min(1).max(50),
    platform: z.enum(['instagram', 'tiktok', 'x', 'reddit', 'linkedin', 'youtube']),
    dateString: z.string().datetime(),
    positiveNumber: z.number().positive(),
    severity: z.enum(['info', 'warning', 'critical']),
    email: z.string().email(),
    url: z.string().url(),
    jsonObject: z.record(z.any())
  };

  // Nettoyer les chaînes de caractères
  static sanitizeString(input: string): string {
    return input
      .trim()
      .replace(/[<>]/g, '') // Supprimer les balises HTML basiques
      .replace(/javascript:/gi, '') // Supprimer les URLs JavaScript
      .replace(/on\w+=/gi, '') // Supprimer les handlers d'événements
      .substring(0, 1000); // Limiter la longueur
  }

  // Valider et nettoyer un objet de métadonnées
  static sanitizeMetadata(metadata: any): Record<string, any> {
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }

    const sanitized: Record<string, any> = {};
    const allowedKeys = ['source', 'campaign', 'platform', 'version', 'tags', 'description'];
    
    for (const [key, value] of Object.entries(metadata)) {
      // Seulement les clés autorisées
      if (!allowedKeys.includes(key)) continue;
      
      // Limiter la profondeur et la taille
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'number' && isFinite(value)) {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value) && value.length <= 10) {
        sanitized[key] = value.slice(0, 10).map(item => 
          typeof item === 'string' ? this.sanitizeString(item) : item
        );
      }
    }

    return sanitized;
  }

  // Middleware de validation
  static validate(schema: z.ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = { ...req.body, ...req.query, ...req.params };
        const validated = schema.parse(data);
        
        // Remplacer les données validées
        Object.assign(req.body, validated);
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            error: 'Validation failed',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
              code: err.code
            }))
          });
        } else {
          next(error);
        }
      }
    };
  }
}

// Chiffrement des données sensibles
export class DataEncryption {
  private static getKey(): Buffer {
    const keyString = process.env.ENCRYPTION_KEY;
    if (!keyString || keyString.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string');
    }
    return Buffer.from(keyString, 'hex');
  }

  static encrypt(text: string): string {
    try {
      const key = this.getKey();
      const iv = crypto.randomBytes(securityConfig.encryption.ivLength);
      const cipher = crypto.createCipher(securityConfig.encryption.algorithm, key);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combiner IV + tag + données chiffrées
      return iv.toString('hex') + tag.toString('hex') + encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  static decrypt(encryptedData: string): string {
    try {
      const key = this.getKey();
      
      // Extraire IV, tag et données
      const ivHex = encryptedData.slice(0, securityConfig.encryption.ivLength * 2);
      const tagHex = encryptedData.slice(ivHex.length, ivHex.length + securityConfig.encryption.tagLength * 2);
      const encrypted = encryptedData.slice(ivHex.length + tagHex.length);
      
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      
      const decipher = crypto.createDecipher(securityConfig.encryption.algorithm, key);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  // Chiffrer les configurations sensibles
  static encryptConfig(config: Record<string, any>): Record<string, any> {
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'webhook'];
    const encrypted = { ...config };
    
    for (const [key, value] of Object.entries(config)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field)) && typeof value === 'string') {
        encrypted[key] = this.encrypt(value);
        encrypted[`${key}_encrypted`] = true;
      }
    }
    
    return encrypted;
  }

  static decryptConfig(config: Record<string, any>): Record<string, any> {
    const decrypted = { ...config };
    
    for (const [key, value] of Object.entries(config)) {
      if (key.endsWith('_encrypted') && value === true) {
        const originalKey = key.replace('_encrypted', '');
        if (typeof config[originalKey] === 'string') {
          try {
            decrypted[originalKey] = this.decrypt(config[originalKey]);
            delete decrypted[key];
          } catch (error) {
            console.error(`Failed to decrypt ${originalKey}:`, error);
          }
        }
      }
    }
    
    return decrypted;
  }
}

// Middleware d'authentification et autorisation
export class AuthMiddleware {
  // Vérifier la clé API
  static validateApiKey(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'] as string;
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API key required',
        message: 'Please provide a valid API key in the X-API-Key header'
      });
    }
    
    if (!validApiKeys.includes(apiKey)) {
      return res.status(403).json({ 
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }
    
    // Ajouter des informations sur la clé API dans la requête
    (req as any).apiKey = apiKey;
    next();
  }

  // Vérifier les permissions par modèle
  static checkModelPermissions(allowedModels: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const modelName = req.params.modelName || req.body.modelName;
      
      if (!modelName) {
        return res.status(400).json({ 
          error: 'Model name required' 
        });
      }
      
      if (!allowedModels.includes('*') && !allowedModels.includes(modelName)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          message: `Access to model '${modelName}' is not allowed`
        });
      }
      
      next();
    };
  }

  // Middleware pour les opérations sensibles
  static requireElevatedPermissions(req: Request, res: Response, next: NextFunction) {
    const elevatedKey = req.headers['x-elevated-key'] as string;
    const validElevatedKeys = process.env.ELEVATED_API_KEYS?.split(',') || [];
    
    if (!elevatedKey || !validElevatedKeys.includes(elevatedKey)) {
      return res.status(403).json({ 
        error: 'Elevated permissions required',
        message: 'This operation requires elevated API permissions'
      });
    }
    
    next();
  }
}

// Middleware de logging sécurisé
export class SecurityLogger {
  static logSecurityEvent(
    req: Request,
    eventType: 'auth_failure' | 'rate_limit' | 'validation_error' | 'suspicious_activity',
    details: Record<string, any> = {}
  ) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      path: req.path,
      apiKey: req.headers['x-api-key'] ? 'present' : 'missing',
      details: {
        ...details,
        // Ne jamais logger de données sensibles
        headers: this.sanitizeHeaders(req.headers)
      }
    };
    
    // En production, envoyer vers un service de logging sécurisé
    if (process.env.NODE_ENV === 'production') {
      // Intégration avec service de logging externe
      console.error('[SECURITY]', JSON.stringify(logEntry));
    } else {
      console.warn('[SECURITY]', logEntry);
    }
  }

  private static sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sensitiveHeaders = ['authorization', 'x-api-key', 'x-elevated-key', 'cookie'];
    const sanitized = { ...headers };
    
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  // Middleware pour logger les erreurs de sécurité
  static securityErrorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Logger l'erreur
    this.logSecurityEvent(req, 'validation_error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // Ne pas exposer les détails de l'erreur en production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
      error: 'Internal server error',
      message: isDevelopment ? error.message : 'An error occurred processing your request',
      timestamp: new Date().toISOString(),
      ...(isDevelopment && { stack: error.stack })
    });
  }
}

// Configuration complète de sécurité
export function setupSecurity(app: any) {
  // Sécurité de base
  app.use(basicSecurity);
  
  // Rate limiting global
  app.use('/api', rateLimits.standard);
  
  // Validation d'API key pour tous les endpoints API
  app.use('/api/kpi', AuthMiddleware.validateApiKey);
  
  // Rate limiting spécialisé pour l'ingestion
  app.use('/api/kpi/ingest', rateLimits.ingestion);
  
  // Permissions élevées pour la configuration des alertes
  app.use('/api/kpi/alerts/rules', AuthMiddleware.requireElevatedPermissions);
  app.use('/api/kpi/alerts/channels', AuthMiddleware.requireElevatedPermissions);
  
  // Gestionnaire d'erreur de sécurité
  app.use(SecurityLogger.securityErrorHandler);
  
  console.log('Security middleware configured');
}

// Export des utilitaires
export { InputValidator, DataEncryption, AuthMiddleware, SecurityLogger };