import 'dotenv/config';
import express from 'express';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { initializeOtel, shutdownOtel } from './lib/otel';
import { db } from './lib/db';
import { redis } from './lib/redis';

// Import routes
import { authRouter } from './routes/auth';
import { publishRouter } from './routes/publish';
import { temporalRouter } from './routes/temporal';
import { llmBudgetRouter } from './routes/llm-budget';
import { webhookRoutes } from './routes/webhooks';

// Initialize OpenTelemetry first
initializeOtel();

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await db.query('SELECT 1');
    
    // Test Redis connection
    await redis.ping();
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV
    });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/publish', publishRouter);
app.use('/api/temporal', temporalRouter);
app.use('/api/llm-budget', llmBudgetRouter);
app.use('/', webhookRoutes); // Webhook routes at root level

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ 
    err: error,
    method: req.method,
    url: req.url,
    body: req.body
  }, 'Unhandled error');

  if (res.headersSent) {
    return next(error);
  }

  const isDev = env.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Internal Server Error',
    message: isDev ? error.message : 'Something went wrong',
    ...(isDev && { stack: error.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  try {
    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');
      
      // Close database connections
      await db.end();
      logger.info('Database connections closed');
      
      // Close Redis connection
      redis.disconnect();
      logger.info('Redis connection closed');
      
      // Shutdown OpenTelemetry
      await shutdownOtel();
      
      logger.info('Shutdown complete');
      process.exit(0);
    });
    
    // Force close after timeout
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
};

// Start server
const server = app.listen(env.PORT, () => {
  logger.info({
    port: env.PORT,
    environment: env.NODE_ENV,
    nodeVersion: process.version,
    pid: process.pid
  }, `🚀 OFM Social API server started`);
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection');
  process.exit(1);
});

export default app;