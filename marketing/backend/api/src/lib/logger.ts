import pino from 'pino';
import { env } from './env';

// Logger configuration based on environment
const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'ofm-social-api',
    version: process.env.npm_package_version || '1.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  ...(env.NODE_ENV === 'production' 
    ? {
        // Production: structured JSON logs
        serializers: pino.stdSerializers,
      }
    : {
        // Development: pretty printing
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'HH:MM:ss',
          },
        },
      }
  ),
});

// Child loggers for different components
export const loggers = {
  auth: logger.child({ component: 'auth' }),
  publisher: logger.child({ component: 'publisher' }),
  temporal: logger.child({ component: 'temporal' }),
  llm: logger.child({ component: 'llm' }),
  webhook: logger.child({ component: 'webhook' }),
};

export { logger };