import { Request, Response, NextFunction } from 'express';

export class KpiError extends Error {
  public statusCode: number;
  public code: string;
  public context?: Record<string, any>;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'KpiError';
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Erreurs spécialisées
export class ValidationError extends KpiError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, 'VALIDATION_ERROR', context);
  }
}

export class NotFoundError extends KpiError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class DatabaseError extends KpiError {
  constructor(message: string, originalError?: Error) {
    super(message, 500, 'DATABASE_ERROR', {
      originalError: originalError?.message
    });
  }
}

export class ExternalServiceError extends KpiError {
  constructor(service: string, message: string, statusCode: number = 503) {
    super(`${service} service error: ${message}`, statusCode, 'EXTERNAL_SERVICE_ERROR', {
      service
    });
  }
}

export class RateLimitError extends KpiError {
  constructor(limit: number, windowMs: number) {
    super(
      `Rate limit exceeded: ${limit} requests per ${windowMs / 1000} seconds`,
      429,
      'RATE_LIMIT_EXCEEDED',
      { limit, windowMs }
    );
  }
}

export class AuthenticationError extends KpiError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends KpiError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

// Gestionnaire d'erreur centralisé
export class ErrorHandler {
  private static isDevelopment = process.env.NODE_ENV === 'development';

  // Gérer les erreurs operationnelles vs programmation
  static isOperationalError(error: Error): boolean {
    if (error instanceof KpiError) {
      return error.isOperational;
    }
    return false;
  }

  // Formater la réponse d'erreur
  static formatErrorResponse(error: Error, req: Request): {
    error: string;
    message: string;
    code?: string;
    context?: Record<string, any>;
    stack?: string;
    timestamp: string;
    path: string;
    method: string;
  } {
    const baseResponse = {
      error: error.name || 'Error',
      message: error.message,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    };

    if (error instanceof KpiError) {
      return {
        ...baseResponse,
        code: error.code,
        context: error.context,
        ...(this.isDevelopment && { stack: error.stack })
      };
    }

    // Erreur non gérée
    return {
      ...baseResponse,
      error: this.isDevelopment ? error.name : 'Internal Server Error',
      message: this.isDevelopment ? error.message : 'An unexpected error occurred',
      ...(this.isDevelopment && { stack: error.stack })
    };
  }

  // Logger les erreurs de façon sécurisée
  static logError(error: Error, req: Request, additional?: Record<string, any>) {
    const logData = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        // Ne pas logger les headers sensibles
        apiKey: req.headers['x-api-key'] ? 'present' : 'missing'
      },
      ...additional
    };

    if (error instanceof KpiError) {
      logData.error = {
        ...logData.error,
        code: error.code,
        statusCode: error.statusCode,
        context: error.context,
        isOperational: error.isOperational
      };
    }

    // En production, utiliser un service de logging approprié
    if (process.env.NODE_ENV === 'production') {
      if (this.isOperationalError(error)) {
        console.warn('[OPERATIONAL_ERROR]', JSON.stringify(logData));
      } else {
        console.error('[SYSTEM_ERROR]', JSON.stringify(logData));
        // Alerter l'équipe pour les erreurs système
        this.alertOnSystemError(error, logData);
      }
    } else {
      console.error('[ERROR]', logData);
    }
  }

  // Alerter l'équipe en cas d'erreur système critique
  private static alertOnSystemError(error: Error, logData: any) {
    // Ici on pourrait intégrer avec PagerDuty, Slack, etc.
    // Pour l'instant, on log juste
    console.error('[CRITICAL_SYSTEM_ERROR]', {
      alert: 'System error requires attention',
      error: error.message,
      timestamp: logData.timestamp
    });
  }

  // Middleware principal de gestion d'erreur
  static middleware(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Logger l'erreur
    this.logError(error, req);

    // Déterminer le status code
    let statusCode = 500;
    if (error instanceof KpiError) {
      statusCode = error.statusCode;
    }

    // Formater et envoyer la réponse
    const errorResponse = this.formatErrorResponse(error, req);
    res.status(statusCode).json(errorResponse);
  }

  // Gestionnaire pour les promesses rejetées non gérées
  static handleUnhandledRejection() {
    process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      
      // En production, on pourrait vouloir arrêter le processus de façon propre
      if (process.env.NODE_ENV === 'production') {
        console.error('Shutting down due to unhandled promise rejection');
        process.exit(1);
      }
    });
  }

  // Gestionnaire pour les exceptions non capturées
  static handleUncaughtException() {
    process.on('uncaughtException', (error: Error) => {
      console.error('Uncaught Exception:', error);
      
      // Les exceptions non capturées sont toujours fatales
      console.error('Shutting down due to uncaught exception');
      process.exit(1);
    });
  }
}

// Utilitaires pour créer des erreurs communes
export const createError = {
  validation: (message: string, context?: Record<string, any>) => 
    new ValidationError(message, context),
    
  notFound: (resource: string, id?: string) => 
    new NotFoundError(resource, id),
    
  database: (message: string, originalError?: Error) => 
    new DatabaseError(message, originalError),
    
  externalService: (service: string, message: string, statusCode?: number) => 
    new ExternalServiceError(service, message, statusCode),
    
  rateLimit: (limit: number, windowMs: number) => 
    new RateLimitError(limit, windowMs),
    
  authentication: (message?: string) => 
    new AuthenticationError(message),
    
  authorization: (message?: string) => 
    new AuthorizationError(message),
    
  internal: (message: string, context?: Record<string, any>) => 
    new KpiError(message, 500, 'INTERNAL_ERROR', context)
};

// Wrapper pour les fonctions async qui peuvent échouer
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Wrapper pour les opérations de base de données
export async function dbOperation<T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Database operation failed'
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw createError.database(errorMessage, error as Error);
  }
}

// Wrapper pour les appels à des services externes
export async function externalServiceCall<T>(
  serviceName: string,
  operation: () => Promise<T>,
  timeout: number = 10000
): Promise<T> {
  try {
    // Implémenter un timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeout);
    });
    
    return await Promise.race([operation(), timeoutPromise]);
  } catch (error) {
    if (error instanceof Error) {
      throw createError.externalService(serviceName, error.message);
    }
    throw createError.externalService(serviceName, 'Unknown error');
  }
}

// Validation avec gestion d'erreur intégrée
export function validateInput<T>(
  schema: { parse: (data: unknown) => T },
  data: unknown,
  fieldName: string = 'input'
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof Error) {
      throw createError.validation(`Invalid ${fieldName}: ${error.message}`);
    }
    throw createError.validation(`Invalid ${fieldName}`);
  }
}

// Setup complet de la gestion d'erreur
export function setupErrorHandling(app: any) {
  // Gestionnaires pour les erreurs non gérées
  ErrorHandler.handleUnhandledRejection();
  ErrorHandler.handleUncaughtException();
  
  // Middleware de gestion d'erreur (doit être en dernier)
  app.use(ErrorHandler.middleware);
  
  console.log('Error handling configured');
}

// Types pour TypeScript
export interface ErrorContext {
  modelName?: string;
  metricName?: string;
  userId?: string;
  operation?: string;
  [key: string]: any;
}