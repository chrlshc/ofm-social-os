'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('content_plans', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      contentId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      contentRef: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      platform: {
        type: Sequelize.ENUM('instagram', 'tiktok', 'twitter', 'reddit'),
        allowNull: false,
      },
      scheduledTime: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      caption: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      hashtags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: [],
      },
      status: {
        type: Sequelize.ENUM(
          'PENDING',
          'PENDING_APPROVAL',
          'APPROVED',
          'SCHEDULED',
          'POSTED',
          'FAILED'
        ),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add indexes
    await queryInterface.addIndex('content_plans', ['userId', 'scheduledTime']);
    await queryInterface.addIndex('content_plans', ['platform', 'status']);
    await queryInterface.addIndex('content_plans', ['userId']);
    await queryInterface.addIndex('content_plans', ['platform']);
    await queryInterface.addIndex('content_plans', ['scheduledTime']);
    await queryInterface.addIndex('content_plans', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('content_plans');
  },
};