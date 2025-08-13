import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth';
import { scrapeProfiles, getTargetProfiles } from '../scraper';
import { TopProfile } from '../models/TopProfile';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

/**
 * POST /api/scrape-profiles
 * Trigger profile scraping
 */
router.post(
  '/scrape-profiles',
  [
    body('platforms')
      .optional()
      .isObject()
      .withMessage('platforms must be an object'),
    body('useDefaults')
      .optional()
      .isBoolean()
      .withMessage('useDefaults must be a boolean'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Get target profiles
      const platforms = req.body.useDefaults !== false
        ? getTargetProfiles()
        : req.body.platforms || getTargetProfiles();

      // Validate platform structure
      for (const [platform, usernames] of Object.entries(platforms)) {
        if (!Array.isArray(usernames)) {
          return res.status(400).json({
            error: `Invalid usernames for platform ${platform}: must be an array`,
          });
        }
      }

      logger.info(`Starting profile scraping triggered by user ${req.user!.id}`);

      // Run the scraping
      const result = await scrapeProfiles({
        platforms,
        options: {
          delayMs: 1500, // 1.5 second delay between requests
          timeout: 15000, // 15 second timeout per request
        },
        saveToDb: true,
      });

      res.json({
        success: true,
        data: {
          summary: {
            total: result.successful.length + result.failed.length,
            successful: result.successful.length,
            failed: result.failed.length,
          },
          successful: result.successful.map(p => ({
            platform: p.platform,
            username: p.username,
            followersCount: p.followersCount,
          })),
          failed: result.failed,
        },
      });
    } catch (error) {
      logger.error('Failed to run profile scraping:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to run profile scraping',
      });
    }
  }
);

/**
 * GET /api/top-profiles
 * Get scraped profiles with filtering
 */
router.get('/top-profiles', async (req, res) => {
  try {
    const {
      platform,
      category,
      minFollowers,
      limit = 100,
      offset = 0,
    } = req.query;

    const where: any = {};

    if (platform) {
      where.platform = platform;
    }
    if (category) {
      where.category = category;
    }
    if (minFollowers) {
      where.followersCount = { $gte: parseInt(minFollowers as string) };
    }

    const profiles = await TopProfile.findAndCountAll({
      where,
      limit: Math.min(parseInt(limit as string), 1000),
      offset: parseInt(offset as string),
      order: [['followersCount', 'DESC']],
    });

    res.json({
      success: true,
      data: {
        profiles: profiles.rows,
        pagination: {
          total: profiles.count,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch top profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top profiles',
    });
  }
});

/**
 * GET /api/top-profiles/stats
 * Get statistics about scraped profiles
 */
router.get('/top-profiles/stats', async (req, res) => {
  try {
    const stats = await TopProfile.findAll({
      attributes: [
        'platform',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('followersCount')), 'avgFollowers'],
        [sequelize.fn('MAX', sequelize.col('followersCount')), 'maxFollowers'],
        [sequelize.fn('MIN', sequelize.col('followersCount')), 'minFollowers'],
      ],
      group: ['platform'],
      raw: true,
    });

    const categories = await TopProfile.findAll({
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      where: {
        category: { $ne: null },
      },
      group: ['category'],
      raw: true,
    });

    res.json({
      success: true,
      data: {
        byPlatform: stats,
        byCategory: categories,
        total: await TopProfile.count(),
        lastScrapedAt: await TopProfile.max('scrapedAt'),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch profile statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile statistics',
    });
  }
});

export default router;