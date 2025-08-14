import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { createError, RateLimitError, AuthenticationError, AuthorizationError } from '../utils/errorHandler';

/**
 * Middleware de sécurité renforcé pour l'API KPI
 */

export interface SecurityConfig {
  rateLimit: {
    windowMs: number;
    max: number;
    skipSuccessfulRequests?: boolean;
  };
  apiKey: {
    required: boolean;
    headerName: string;
    validKeys: string[];
  };
  encryption: {
    algorithm: string;
    secretKey: string;
  };
  cors: {
    allowedOrigins: string[];
    allowedMethods: string[];
    maxAge: number;
  };
  csrf: {
    enabled: boolean;
    cookieName: string;
    headerName: string;
  };
}

/**
 * Store pour le rate limiting en mémoire (en production, utiliser Redis)
 */
class RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timer;

  constructor() {
    // Nettoyer le store toutes les minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (now > value.resetTime) {
        this.store.delete(key);
      }
    }
  }

  public hit(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetTime) {
      // Nouveau compteur ou fenêtre expirée
      const record = { count: 1, resetTime: now + windowMs };
      this.store.set(key, record);
      return record;
    } else {
      // Incrémenter le compteur existant
      existing.count++;
      this.store.set(key, existing);
      return existing;
    }
  }

  public get(key: string): { count: number; resetTime: number } | undefined {
    return this.store.get(key);
  }

  public reset(key: string): void {
    this.store.delete(key);
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

const rateLimitStore = new RateLimitStore();

/**
 * Middleware de rate limiting avancé
 */
export function advancedRateLimit(config: SecurityConfig['rateLimit']) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Identifier le client (IP + User-Agent pour plus de précision)
    const clientId = `${req.ip}:${crypto.createHash('md5').update(req.get('User-Agent') || '').digest('hex')}`;
    
    const { count, resetTime } = rateLimitStore.hit(clientId, config.windowMs);
    
    // Headers informatifs
    res.set({
      'X-RateLimit-Limit': config.max.toString(),
      'X-RateLimit-Remaining': Math.max(0, config.max - count).toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString()
    });

    if (count > config.max) {
      throw new RateLimitError(config.max, config.windowMs);
    }

    // Si on skip les requêtes réussies, ne pas compter les 2xx
    if (config.skipSuccessfulRequests) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Décrémenter le compteur pour les requêtes réussies
          const current = rateLimitStore.get(clientId);
          if (current && current.count > 0) {
            current.count--;
            rateLimitStore.hit(clientId, 0); // Update without extending window
          }
        }
      });
    }

    next();
  };
}

/**
 * Middleware d'authentification API Key avec rotation
 */
export function apiKeyAuth(config: SecurityConfig['apiKey']) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.required) {
      return next();
    }

    const apiKey = req.get(config.headerName);
    
    if (!apiKey) {
      throw new AuthenticationError('API key required');
    }

    // Vérification avec hash pour éviter les attaques timing
    const providedHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const validHashes = config.validKeys.map(key => 
      crypto.createHash('sha256').update(key).digest('hex')
    );

    const isValid = validHashes.some(hash => 
      crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(providedHash))
    );

    if (!isValid) {
      throw new AuthenticationError('Invalid API key');
    }

    // Ajouter des infos au request pour les middlewares suivants
    (req as any).apiKeyUsed = apiKey.substring(0, 8) + '...'; // Pour le logging sécurisé
    (req as any).authenticated = true;

    next();
  };
}

/**
 * Middleware de chiffrement/déchiffrement des données sensibles
 */
export function dataEncryption(config: SecurityConfig['encryption']) {
  const encrypt = (text: string): string => {
    const cipher = crypto.createCipher(config.algorithm, config.secretKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  };

  const decrypt = (text: string): string => {
    const decipher = crypto.createDecipher(config.algorithm, config.secretKey);
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  return (req: Request, res: Response, next: NextFunction) => {
    // Ajouter les fonctions de chiffrement au request
    (req as any).encrypt = encrypt;
    (req as any).decrypt = decrypt;

    // Middleware pour chiffrer automatiquement certains champs en réponse
    const originalJson = res.json;
    res.json = function(obj: any) {
      if (obj && typeof obj === 'object') {
        // Chiffrer les champs sensibles automatiquement
        const sensitiveFields = ['apiKey', 'token', 'secret', 'password'];
        
        const encryptSensitiveFields = (data: any): any => {
          if (Array.isArray(data)) {
            return data.map(encryptSensitiveFields);
          } else if (data && typeof data === 'object') {
            const result = { ...data };
            for (const [key, value] of Object.entries(result)) {
              if (sensitiveFields.includes(key) && typeof value === 'string') {
                result[key] = encrypt(value);
              } else if (typeof value === 'object') {
                result[key] = encryptSensitiveFields(value);
              }
            }
            return result;
          }
          return data;
        };

        obj = encryptSensitiveFields(obj);
      }
      
      return originalJson.call(this, obj);
    };

    next();
  };
}

/**
 * Middleware CORS avancé avec whitelist dynamique
 */
export function advancedCors(config: SecurityConfig['cors']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('Origin');
    
    // Vérifier si l'origine est autorisée
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    } else if (config.allowedOrigins.includes('*')) {
      res.set('Access-Control-Allow-Origin', '*');
    }

    // Autres headers CORS
    res.set({
      'Access-Control-Allow-Methods': config.allowedMethods.join(', '),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': config.maxAge.toString()
    });

    // Répondre aux requêtes OPTIONS
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * Middleware CSRF avec tokens
 */
export function csrfProtection(config: SecurityConfig['csrf']) {
  if (!config.enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  const generateToken = (): string => {
    return crypto.randomBytes(32).toString('hex');
  };

  const validateToken = (token: string, sessionToken: string): boolean => {
    if (!token || !sessionToken) return false;
    return crypto.timingSafeEqual(
      Buffer.from(token), 
      Buffer.from(sessionToken)
    );
  };

  return (req: Request, res: Response, next: NextFunction) => {
    // GET requests : générer et envoyer un token
    if (req.method === 'GET') {
      const token = generateToken();
      res.cookie(config.cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000 // 1 hour
      });
      return next();
    }

    // POST/PUT/DELETE : valider le token
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const sessionToken = req.cookies?.[config.cookieName];
      const providedToken = req.get(config.headerName);

      if (!validateToken(providedToken || '', sessionToken || '')) {
        throw createError.authorization('Invalid CSRF token');
      }
    }

    next();
  };
}

/**
 * Middleware de validation et sanitisation des inputs
 */
export function inputSanitization() {
  const sanitizeString = (str: string): string => {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: urls
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  };

  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitiser aussi les clés
        const cleanKey = sanitizeString(key);
        sanitized[cleanKey] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitiser le body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitiser les query params
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Ajouter des headers de sécurité
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; object-src 'none';"
    });

    next();
  };
}

/**
 * Middleware de logging sécurisé des requêtes
 */
export function secureRequestLogging() {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /auth/i,
    /credential/i
  ];

  const sanitizeForLogging = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.length > 100 ? obj.substring(0, 100) + '...' : obj;
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeForLogging);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
        if (isSensitive) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitizeForLogging(value);
        }
      }
      return sanitized;
    }
    return obj;
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log de la requête entrante
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      headers: sanitizeForLogging(req.headers),
      query: sanitizeForLogging(req.query),
      body: sanitizeForLogging(req.body),
      authenticated: (req as any).authenticated || false
    });

    // Log de la réponse
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] Response ${req.method} ${req.path}`, {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('Content-Length'),
        ip: req.ip
      });
    });

    next();
  };
}

/**
 * Middleware de détection d'intrusion basique
 */
export function intrusionDetection() {
  const suspiciousPatterns = [
    /union.*select/i,          // SQL injection
    /<script/i,                // XSS
    /\.\.\/\.\.\//,           // Path traversal
    /\beval\s*\(/i,           // Code injection
    /\bexec\s*\(/i,           // Command injection
    /\bsystem\s*\(/i,         // System commands
    /\bshell_exec\s*\(/i,     // Shell execution
  ];

  const checkForThreats = (data: any): string[] => {
    const threats: string[] = [];
    const checkString = (str: string, context: string) => {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(str)) {
          threats.push(`Suspicious pattern detected in ${context}: ${pattern.source}`);
        }
      }
    };

    const scan = (obj: any, path: string = ''): void => {
      if (typeof obj === 'string') {
        checkString(obj, path || 'string');
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => scan(item, `${path}[${index}]`));
      } else if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          checkString(key, `key:${currentPath}`);
          scan(value, currentPath);
        }
      }
    };

    scan(data);
    return threats;
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const threats: string[] = [];

    // Scanner l'URL
    threats.push(...checkForThreats(req.url, 'url'));
    
    // Scanner les headers
    threats.push(...checkForThreats(req.headers, 'headers'));
    
    // Scanner le body
    if (req.body) {
      threats.push(...checkForThreats(req.body, 'body'));
    }
    
    // Scanner les query params
    if (req.query) {
      threats.push(...checkForThreats(req.query, 'query'));
    }

    if (threats.length > 0) {
      console.warn(`[SECURITY ALERT] Potential intrusion detected from ${req.ip}:`, threats);
      
      // En production, on pourrait bloquer la requête ou alerter
      if (process.env.NODE_ENV === 'production') {
        throw createError.authorization('Request blocked by security policy');
      }
    }

    next();
  };
}

/**
 * Factory pour créer un middleware de sécurité complet
 */
export function createSecurityMiddleware(config: SecurityConfig) {
  return [
    advancedCors(config.cors),
    advancedRateLimit(config.rateLimit),
    inputSanitization(),
    intrusionDetection(),
    apiKeyAuth(config.apiKey),
    dataEncryption(config.encryption),
    csrfProtection(config.csrf),
    secureRequestLogging()
  ];
}

/**
 * Configuration par défaut sécurisée
 */
export const defaultSecurityConfig: SecurityConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limiter à 100 requêtes par IP par fenêtre
    skipSuccessfulRequests: false
  },
  apiKey: {
    required: true,
    headerName: 'X-API-Key',
    validKeys: process.env.VALID_API_KEYS?.split(',') || ['development-key']
  },
  encryption: {
    algorithm: 'aes-256-ctr',
    secretKey: process.env.ENCRYPTION_SECRET || 'default-secret-key-change-me'
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400 // 24 hours
  },
  csrf: {
    enabled: process.env.NODE_ENV === 'production',
    cookieName: '_csrf',
    headerName: 'X-CSRF-Token'
  }
};

/**
 * Fonction d'initialisation complète
 */
export function setupSecurity(app: any, customConfig?: Partial<SecurityConfig>) {
  const config = { ...defaultSecurityConfig, ...customConfig };
  
  // Appliquer tous les middlewares de sécurité
  const securityMiddlewares = createSecurityMiddleware(config);
  securityMiddlewares.forEach(middleware => app.use(middleware));
  
  console.log('Security middleware configured:', {
    rateLimit: config.rateLimit.max + ' per ' + config.rateLimit.windowMs / 1000 + 's',
    apiKeyRequired: config.apiKey.required,
    csrfEnabled: config.csrf.enabled,
    allowedOrigins: config.cors.allowedOrigins.length
  });

  return config;
}

// Cleanup function pour les tests ou l'arrêt propre
export function cleanupSecurity() {
  rateLimitStore.destroy();
}