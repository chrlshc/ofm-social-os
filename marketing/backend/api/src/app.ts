import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { promises as metrics } from './lib/metrics';
import { loggers } from './lib/logger';
import { initializeOTel } from './lib/otel';

// Routes
import authRoutes from './routes/auth';
import creatorRoutes from './routes/creators';
import postRoutes from './routes/posts';
import mediaRoutes from './routes/media';
import webhookRoutes from './routes/webhooks';
import gdprRoutes from './routes/gdpr';

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authMiddleware } from './middleware/auth';

const logger = loggers.app;

// Initialize OpenTelemetry
initializeOTel();

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // For GDPR verification page
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Compression
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
}));

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'healthy',
      redis: 'healthy',
      s3: 'healthy'
    }
  };

  // Record health check metric
  metrics.counter('health_checks_total', {
    status: 'healthy'
  }).inc();

  res.json(health);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate metrics');
    res.status(500).end('Failed to generate metrics');
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/creators', authMiddleware, creatorRoutes);
app.use('/api/posts', authMiddleware, postRoutes);
app.use('/api/media', authMiddleware, mediaRoutes);
app.use('/api/webhooks', webhookRoutes); // No auth required for webhook endpoints
app.use('/api/gdpr', gdprRoutes); // Mixed auth requirements

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  logger.warn({
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  }, 'Route not found');

  metrics.counter('http_requests_total', {
    method: req.method,
    status: '404',
    route: 'not_found'
  }).inc();

  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger.info({
    port,
    env: process.env.NODE_ENV,
    version: process.env.npm_package_version
  }, 'Marketing API server started');
});

export default app;