import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { gdprManager } from '../lib/gdpr';
import { requireAuth } from '../middleware/auth';
import { loggers } from '../lib/logger';
import { rateLimit } from '../middleware/rateLimit';
import { promises as metrics } from '../lib/metrics';

const router = Router();
const logger = loggers.api;

// Rate limiting for GDPR endpoints
const gdprRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  keyGenerator: (req) => `gdpr:${req.ip}:${req.user?.id || 'anonymous'}`,
  message: 'Too many GDPR requests, please try again later'
});

// Validation middleware
const validateGDPRRequest = [
  body('requestType')
    .isIn(['erasure', 'export'])
    .withMessage('Request type must be either "erasure" or "export"'),
  body('requestorEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required'),
  body('verifyIdentity')
    .optional()
    .isBoolean()
    .withMessage('verifyIdentity must be a boolean')
];

const validateVerification = [
  param('requestId')
    .matches(/^gdpr_(erasure|export)_\d+_[a-z0-9]+$/)
    .withMessage('Invalid request ID format'),
  body('verificationToken')
    .isLength({ min: 32, max: 32 })
    .withMessage('Invalid verification token')
];

const handleValidationErrors = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    metrics.counter('gdpr_validation_errors_total', {
      endpoint: req.route.path
    }).inc();
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// =============================================
// GDPR Request Endpoints
// =============================================

/**
 * POST /gdpr/request
 * Create a new GDPR request (erasure or data export)
 */
router.post('/request',
  gdprRateLimit,
  requireAuth,
  validateGDPRRequest,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { requestType, requestorEmail, verifyIdentity = true } = req.body;
      const creatorId = req.user.id;

      logger.info({
        creatorId,
        requestType,
        requestorEmail,
        verifyIdentity,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }, 'GDPR request initiated');

      const request = await gdprManager.createGDPRRequest(
        creatorId,
        requestType,
        requestorEmail,
        verifyIdentity
      );

      // Remove sensitive information from response
      const response = {
        requestId: request.id,
        requestType: request.requestType,
        status: request.status,
        requestedAt: request.requestedAt,
        requiresVerification: !!request.verificationToken
      };

      if (verifyIdentity) {
        response.message = 'Verification email sent. Please check your email to complete the request.';
      } else {
        response.message = 'Request is being processed.';
      }

      res.status(201).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error({
        err: error,
        creatorId: req.user.id,
        requestType: req.body.requestType,
        ip: req.ip
      }, 'Failed to create GDPR request');

      metrics.counter('gdpr_request_errors_total', {
        request_type: req.body.requestType || 'unknown',
        error_type: error instanceof Error ? error.constructor.name : 'unknown'
      }).inc();

      if (error instanceof Error && error.message.includes('already pending')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to process GDPR request'
      });
    }
  }
);

/**
 * POST /gdpr/verify/:requestId
 * Verify a GDPR request using verification token
 */
router.post('/verify/:requestId',
  gdprRateLimit,
  validateVerification,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const { verificationToken } = req.body;

      logger.info({
        requestId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }, 'GDPR request verification attempted');

      const request = await gdprManager.verifyGDPRRequest(requestId, verificationToken);

      res.json({
        success: true,
        data: {
          requestId: request.id,
          requestType: request.requestType,
          status: request.status,
          message: 'Request verified and processing started'
        }
      });

    } catch (error) {
      logger.error({
        err: error,
        requestId: req.params.requestId,
        ip: req.ip
      }, 'Failed to verify GDPR request');

      metrics.counter('gdpr_verification_errors_total').inc();

      if (error instanceof Error && error.message.includes('Invalid verification')) {
        return res.status(400).json({
          error: 'Invalid verification',
          message: 'Invalid verification token or request expired'
        });
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to verify GDPR request'
      });
    }
  }
);

/**
 * GET /gdpr/status/:requestId
 * Get status of a GDPR request
 */
router.get('/status/:requestId',
  requireAuth,
  param('requestId').matches(/^gdpr_(erasure|export)_\d+_[a-z0-9]+$/),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const creatorId = req.user.id;

      const request = await gdprManager.getGDPRRequestStatus(requestId);

      if (!request) {
        return res.status(404).json({
          error: 'Not found',
          message: 'GDPR request not found'
        });
      }

      // Ensure user can only view their own requests
      if (request.creatorId !== creatorId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied'
        });
      }

      const response = {
        requestId: request.id,
        requestType: request.requestType,
        status: request.status,
        requestedAt: request.requestedAt,
        completedAt: request.completedAt
      };

      // Add download URL for completed exports
      if (request.requestType === 'export' && 
          request.status === 'completed' && 
          request.dataExported) {
        response.downloadUrl = request.dataExported.downloadUrl;
        response.downloadExpiresAt = request.dataExported.expiresAt;
      }

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error({
        err: error,
        requestId: req.params.requestId,
        creatorId: req.user.id
      }, 'Failed to get GDPR request status');

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get request status'
      });
    }
  }
);

/**
 * GET /gdpr/requests
 * List GDPR requests for the authenticated user
 */
router.get('/requests',
  requireAuth,
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const creatorId = req.user.id;
      const limit = req.query.limit as number || 20;

      const requests = await gdprManager.listGDPRRequests(creatorId, limit);

      const response = requests.map(request => ({
        requestId: request.id,
        requestType: request.requestType,
        status: request.status,
        requestedAt: request.requestedAt,
        completedAt: request.completedAt,
        hasDownload: request.requestType === 'export' && 
                    request.status === 'completed' && 
                    !!request.dataExported
      }));

      res.json({
        success: true,
        data: response,
        pagination: {
          limit,
          total: response.length
        }
      });

    } catch (error) {
      logger.error({
        err: error,
        creatorId: req.user.id
      }, 'Failed to list GDPR requests');

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list GDPR requests'
      });
    }
  }
);

// =============================================
// Administrative Endpoints
// =============================================

/**
 * GET /gdpr/health
 * Health check for GDPR system
 */
router.get('/health', async (req, res) => {
  try {
    const health = await gdprManager.healthCheck();

    const status = health.healthy ? 200 : 503;
    
    res.status(status).json({
      healthy: health.healthy,
      metrics: {
        pendingRequests: health.pendingRequests,
        oldestPendingHours: Math.round(health.oldestPendingHours * 100) / 100,
        completionRate24h: Math.round(health.completionRate24h * 100) / 100
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ err: error }, 'GDPR health check failed');

    res.status(503).json({
      healthy: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /gdpr/metrics
 * Prometheus metrics endpoint for GDPR system
 */
router.get('/metrics', async (req, res) => {
  try {
    const health = await gdprManager.healthCheck();

    // Export metrics for Prometheus
    metrics.gauge('gdpr_pending_requests', {}).set(health.pendingRequests);
    metrics.gauge('gdpr_oldest_pending_hours', {}).set(health.oldestPendingHours);
    metrics.gauge('gdpr_completion_rate_24h', {}).set(health.completionRate24h);

    res.set('Content-Type', 'text/plain');
    res.send(await metrics.register.metrics());

  } catch (error) {
    logger.error({ err: error }, 'Failed to generate GDPR metrics');
    res.status(500).send('# Failed to generate metrics\n');
  }
});

// =============================================
// Public Verification Page
// =============================================

/**
 * GET /gdpr/verify
 * Public verification page (can be accessed without auth)
 */
router.get('/verify',
  query('request').matches(/^gdpr_(erasure|export)_\d+_[a-z0-9]+$/),
  query('token').isLength({ min: 32, max: 32 }),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { request: requestId, token } = req.query as { request: string; token: string };

      // Return a simple HTML page for verification
      const html = `
<!DOCTYPE html>
<html>
<head>
    <title>GDPR Request Verification</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .container { background: #f9f9f9; padding: 30px; border-radius: 8px; }
        .btn { background: #007cba; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; }
        .btn:hover { background: #005a87; }
        .error { color: #d63384; margin-top: 10px; }
        .success { color: #198754; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>GDPR Request Verification</h2>
        <p>Click the button below to verify and process your GDPR request.</p>
        <p><strong>Request ID:</strong> ${requestId}</p>
        <p><strong>Type:</strong> ${requestId.includes('erasure') ? 'Data Erasure' : 'Data Export'}</p>
        
        <button class="btn" onclick="verifyRequest()">Verify Request</button>
        
        <div id="message"></div>
    </div>
    
    <script>
        async function verifyRequest() {
            const messageDiv = document.getElementById('message');
            messageDiv.innerHTML = 'Processing...';
            
            try {
                const response = await fetch('/api/gdpr/verify/${requestId}', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        verificationToken: '${token}'
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    messageDiv.innerHTML = '<div class="success">✓ Request verified successfully! Processing has started.</div>';
                } else {
                    messageDiv.innerHTML = '<div class="error">✗ ' + (data.message || 'Verification failed') + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="error">✗ An error occurred. Please try again.</div>';
            }
        }
    </script>
</body>
</html>`;

      res.send(html);

    } catch (error) {
      logger.error({
        err: error,
        requestId: req.query.request,
        ip: req.ip
      }, 'Failed to render verification page');

      res.status(400).send('Invalid verification link');
    }
  }
);

export default router;