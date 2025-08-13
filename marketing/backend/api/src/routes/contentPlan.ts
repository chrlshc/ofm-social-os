import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import {
  generateWeeklyContentPlan,
  getWeeklyContentPlan,
  approveContentPlanItem,
  ContentPlanOptions,
} from '../services/contentPlanning';
import { Platform } from '../models/ContentPlan';
import { temporalClient } from '../temporal/client';
import { PublishContentWorkflow } from '../temporal/workflows/contentPublishing';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/content-plan/generate
 * Generate a new weekly content plan
 */
router.post(
  '/generate',
  [
    body('originalsPerWeek')
      .isInt({ min: 1, max: 21 })
      .withMessage('originalsPerWeek must be between 1 and 21'),
    body('platforms')
      .optional()
      .isArray()
      .withMessage('platforms must be an array'),
    body('platforms.*')
      .optional()
      .isIn(Object.values(Platform))
      .withMessage('Invalid platform'),
    body('startDate')
      .optional()
      .isISO8601()
      .withMessage('startDate must be a valid date'),
    body('requireApproval')
      .optional()
      .isBoolean()
      .withMessage('requireApproval must be a boolean'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const userId = req.user!.id;
      const options: ContentPlanOptions = {
        userId,
        originalsPerWeek: req.body.originalsPerWeek,
        platforms: req.body.platforms,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        requireApproval: req.body.requireApproval,
      };

      // Generate the content plan
      const planItems = await generateWeeklyContentPlan(options);

      // Schedule publishing workflows for approved items
      const scheduledItems = planItems.filter(
        item => item.status === 'SCHEDULED'
      );

      for (const item of scheduledItems) {
        try {
          await temporalClient.start(PublishContentWorkflow, {
            workflowId: `publish-content-${item.id}`,
            taskQueue: 'content-publishing',
            args: [{ contentPlanItem: item }],
          });
          
          logger.info(`Scheduled publishing workflow for content ${item.id}`);
        } catch (error) {
          logger.error(`Failed to schedule workflow for content ${item.id}:`, error);
        }
      }

      res.status(201).json({
        success: true,
        data: {
          items: planItems,
          summary: {
            total: planItems.length,
            scheduled: scheduledItems.length,
            pendingApproval: planItems.filter(item => item.status === 'PENDING_APPROVAL').length,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to generate content plan:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate content plan',
      });
    }
  }
);

/**
 * GET /api/content-plan
 * Get content plan for a specific week
 */
router.get(
  '/',
  [
    query('week')
      .optional()
      .matches(/^\d{4}-W\d{2}$/)
      .withMessage('week must be in format YYYY-WNN'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('startDate must be a valid date'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const userId = req.user!.id;
      let startDate: Date | undefined;

      if (req.query.week) {
        // Parse week format YYYY-WNN
        const [year, week] = req.query.week.split('-W');
        const jan1 = new Date(parseInt(year), 0, 1);
        const daysToMonday = (8 - jan1.getDay()) % 7;
        startDate = new Date(jan1);
        startDate.setDate(jan1.getDate() + daysToMonday + (parseInt(week) - 1) * 7);
      } else if (req.query.startDate) {
        startDate = new Date(req.query.startDate as string);
      }

      const planItems = await getWeeklyContentPlan(userId, startDate);

      // Group items by day for better visualization
      const itemsByDay = planItems.reduce((acc, item) => {
        const day = new Date(item.scheduledTime).toISOString().split('T')[0];
        if (!acc[day]) {
          acc[day] = [];
        }
        acc[day].push(item);
        return acc;
      }, {} as Record<string, typeof planItems>);

      res.json({
        success: true,
        data: {
          items: planItems,
          byDay: itemsByDay,
          summary: {
            total: planItems.length,
            byPlatform: planItems.reduce((acc, item) => {
              acc[item.platform] = (acc[item.platform] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
            byStatus: planItems.reduce((acc, item) => {
              acc[item.status] = (acc[item.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>),
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get content plan:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get content plan',
      });
    }
  }
);

/**
 * PUT /api/content-plan/:id/approve
 * Approve a content plan item and schedule it
 */
router.put(
  '/:id/approve',
  [
    param('id').isUUID().withMessage('Invalid content plan item ID'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const userId = req.user!.id;
      const itemId = req.params.id;

      // Approve the item
      const approvedItem = await approveContentPlanItem(itemId, userId);

      // Schedule the publishing workflow
      await temporalClient.start(PublishContentWorkflow, {
        workflowId: `publish-content-${approvedItem.id}`,
        taskQueue: 'content-publishing',
        args: [{ contentPlanItem: approvedItem }],
      });

      logger.info(`Approved and scheduled content ${itemId} for user ${userId}`);

      res.json({
        success: true,
        data: approvedItem,
      });
    } catch (error) {
      logger.error('Failed to approve content plan item:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to approve content plan item',
      });
    }
  }
);

export default router;