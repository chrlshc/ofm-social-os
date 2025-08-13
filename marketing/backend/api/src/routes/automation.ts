import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth';
import { getMarketingTemporalClient } from '../temporal/marketingClient';
import { 
  pauseSchedule, 
  resumeSchedule, 
  triggerScheduleNow, 
  getScheduleStatus 
} from '../temporal/schedules';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

/**
 * POST /api/automation/scrape-and-train
 * Manually trigger scrape and train workflow
 */
router.post(
  '/scrape-and-train',
  [
    body('profileLimits')
      .optional()
      .isObject()
      .withMessage('profileLimits must be an object'),
    body('skipTraining')
      .optional()
      .isBoolean()
      .withMessage('skipTraining must be a boolean'),
    body('dryRun')
      .optional()
      .isBoolean()
      .withMessage('dryRun must be a boolean'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const client = await getMarketingTemporalClient();
      
      const { workflowId, runId } = await client.startScrapeAndTrainWorkflow({
        profileLimits: req.body.profileLimits,
        skipTraining: req.body.skipTraining,
        dryRun: req.body.dryRun,
      });

      logger.info('Scrape and train workflow started manually', {
        workflowId,
        runId,
        triggeredBy: req.user!.id,
      });

      res.json({
        success: true,
        data: {
          workflowId,
          runId,
          message: 'Scrape and train workflow started',
        },
      });
    } catch (error) {
      logger.error('Failed to start scrape and train workflow', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start workflow',
      });
    }
  }
);

/**
 * POST /api/automation/scrape-only
 * Manually trigger scraping only
 */
router.post(
  '/scrape-only',
  [
    body('profileLimits')
      .optional()
      .isObject()
      .withMessage('profileLimits must be an object'),
    body('dryRun')
      .optional()
      .isBoolean()
      .withMessage('dryRun must be a boolean'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const client = await getMarketingTemporalClient();
      
      const { workflowId, runId } = await client.startScrapeOnlyWorkflow({
        profileLimits: req.body.profileLimits,
        dryRun: req.body.dryRun,
      });

      res.json({
        success: true,
        data: {
          workflowId,
          runId,
          message: 'Scrape only workflow started',
        },
      });
    } catch (error) {
      logger.error('Failed to start scrape only workflow', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start workflow',
      });
    }
  }
);

/**
 * POST /api/automation/train-only
 * Manually trigger training only
 */
router.post('/train-only', async (req, res) => {
  try {
    const client = await getMarketingTemporalClient();
    
    const { workflowId, runId } = await client.startTrainOnlyWorkflow();

    res.json({
      success: true,
      data: {
        workflowId,
        runId,
        message: 'Train only workflow started',
      },
    });
  } catch (error) {
    logger.error('Failed to start train only workflow', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start workflow',
    });
  }
});

/**
 * GET /api/automation/workflow/:workflowId
 * Get workflow status
 */
router.get('/workflow/:workflowId', async (req, res) => {
  try {
    const client = await getMarketingTemporalClient();
    const status = await client.getWorkflowStatus(req.params.workflowId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to get workflow status', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow status',
    });
  }
});

/**
 * GET /api/automation/schedule/status
 * Get schedule status
 */
router.get('/schedule/status', async (req, res) => {
  try {
    const client = await getMarketingTemporalClient();
    const status = await getScheduleStatus(client.getClient());

    res.json({
      success: true,
      data: {
        ...status,
        enabled: process.env.ENABLE_AUTOMATION !== 'false',
        cronExpression: process.env.SCRAPER_CRON || '0 3 * * *',
      },
    });
  } catch (error) {
    logger.error('Failed to get schedule status', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get schedule status',
    });
  }
});

/**
 * POST /api/automation/schedule/pause
 * Pause the scheduled workflow
 */
router.post('/schedule/pause', async (req, res) => {
  try {
    const client = await getMarketingTemporalClient();
    await pauseSchedule(client.getClient());

    logger.info('Schedule paused by user', { userId: req.user!.id });

    res.json({
      success: true,
      message: 'Schedule paused successfully',
    });
  } catch (error) {
    logger.error('Failed to pause schedule', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause schedule',
    });
  }
});

/**
 * POST /api/automation/schedule/resume
 * Resume the scheduled workflow
 */
router.post('/schedule/resume', async (req, res) => {
  try {
    const client = await getMarketingTemporalClient();
    await resumeSchedule(client.getClient());

    logger.info('Schedule resumed by user', { userId: req.user!.id });

    res.json({
      success: true,
      message: 'Schedule resumed successfully',
    });
  } catch (error) {
    logger.error('Failed to resume schedule', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume schedule',
    });
  }
});

/**
 * POST /api/automation/schedule/trigger
 * Trigger the scheduled workflow immediately
 */
router.post('/schedule/trigger', async (req, res) => {
  try {
    const client = await getMarketingTemporalClient();
    await triggerScheduleNow(client.getClient());

    logger.info('Schedule triggered manually by user', { userId: req.user!.id });

    res.json({
      success: true,
      message: 'Scheduled workflow triggered',
    });
  } catch (error) {
    logger.error('Failed to trigger schedule', error);
    
    if (error.message === 'Workflow is already running') {
      res.status(409).json({
        success: false,
        error: 'Workflow is already running',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to trigger schedule',
      });
    }
  }
});

export default router;