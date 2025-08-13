import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth';
import { trainAndSaveModel, suggestContentStrategy } from '../ml/contentCategorizer';
import { TopProfile } from '../models/TopProfile';
import { logger } from '../utils/logger';

const router = Router();

// Authentication required for all routes
router.use(authenticate);

/**
 * POST /api/ml/train
 * Train the content categorization model (admin only)
 */
router.post(
  '/train',
  requireRole('admin'),
  async (req, res) => {
    try {
      logger.info(`Model training triggered by user ${req.user!.id}`);
      
      // Check if we have enough data
      const profileCount = await TopProfile.count({
        where: {
          bio: {
            $ne: null,
            $ne: '',
          },
        },
      });
      
      if (profileCount < 10) {
        return res.status(400).json({
          success: false,
          error: 'Not enough profile data for training. Need at least 10 profiles with bios.',
          currentCount: profileCount,
        });
      }
      
      // Train the model
      await trainAndSaveModel();
      
      // Get cluster statistics
      const clusterStats = await TopProfile.findAll({
        attributes: [
          'cluster',
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('AVG', sequelize.col('followersCount')), 'avgFollowers'],
        ],
        where: {
          cluster: { $ne: null },
        },
        group: ['cluster', 'category'],
        raw: true,
      });
      
      res.json({
        success: true,
        data: {
          message: 'Model trained successfully',
          profilesUsed: profileCount,
          clusters: clusterStats,
        },
      });
    } catch (error) {
      logger.error('Failed to train model:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to train model',
      });
    }
  }
);

/**
 * POST /api/ml/suggest-strategy
 * Get content strategy suggestions based on user profile
 */
router.post(
  '/suggest-strategy',
  [
    body('bio')
      .notEmpty()
      .withMessage('Bio is required')
      .isLength({ min: 10 })
      .withMessage('Bio must be at least 10 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { bio } = req.body;
      
      // Get content strategy suggestions
      const advice = await suggestContentStrategy(bio);
      
      // Find similar profiles if model is trained
      let similarProfiles = [];
      if (advice.cluster !== undefined) {
        similarProfiles = await TopProfile.findAll({
          where: {
            cluster: advice.cluster,
          },
          attributes: ['platform', 'username', 'followersCount', 'bio'],
          order: [['followersCount', 'DESC']],
          limit: 5,
        });
      }
      
      res.json({
        success: true,
        data: {
          advice,
          similarProfiles: similarProfiles.map(p => ({
            platform: p.platform,
            username: p.username,
            followersCount: p.followersCount,
            bioPreview: p.bio?.substring(0, 100) + '...',
          })),
        },
      });
    } catch (error) {
      logger.error('Failed to suggest content strategy:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate content strategy suggestions',
      });
    }
  }
);

/**
 * GET /api/ml/categories
 * Get all content categories and their statistics
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await TopProfile.findAll({
      attributes: [
        'category',
        [sequelize.fn('COUNT', sequelize.col('id')), 'profileCount'],
        [sequelize.fn('AVG', sequelize.col('followersCount')), 'avgFollowers'],
        [sequelize.fn('MAX', sequelize.col('followersCount')), 'maxFollowers'],
        [sequelize.fn('MIN', sequelize.col('followersCount')), 'minFollowers'],
      ],
      where: {
        category: { $ne: null },
      },
      group: ['category'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true,
    });
    
    res.json({
      success: true,
      data: categories.map(cat => ({
        ...cat,
        avgFollowers: Math.round(cat.avgFollowers || 0),
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
    });
  }
});

/**
 * GET /api/ml/model-status
 * Get the current model status
 */
router.get('/model-status', async (req, res) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    
    const modelPath = path.join(__dirname, '../../data/content_model.json');
    
    let modelExists = false;
    let modelInfo = null;
    
    try {
      const stats = await fs.stat(modelPath);
      modelExists = true;
      
      const data = await fs.readFile(modelPath, 'utf-8');
      const model = JSON.parse(data);
      
      modelInfo = {
        lastTrained: stats.mtime,
        clusters: model.clusterNames?.length || 0,
        vocabularySize: model.vectorizer?.vocabulary?.length || 0,
      };
    } catch (error) {
      // Model doesn't exist
    }
    
    const profileStats = await TopProfile.findOne({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN cluster IS NOT NULL THEN 1 END')), 'categorized'],
      ],
      raw: true,
    });
    
    res.json({
      success: true,
      data: {
        modelExists,
        modelInfo,
        profileStats: {
          total: parseInt(profileStats?.total || '0'),
          categorized: parseInt(profileStats?.categorized || '0'),
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get model status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get model status',
    });
  }
});

export default router;