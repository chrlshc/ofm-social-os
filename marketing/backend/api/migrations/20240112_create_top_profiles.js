'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('top_profiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      platform: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      username: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      fullName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      profilePicUrl: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      followersCount: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      followingCount: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      postsCount: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      likesCount: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      cluster: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      scrapedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
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

    // Add unique constraint on platform + username
    await queryInterface.addConstraint('top_profiles', {
      fields: ['platform', 'username'],
      type: 'unique',
      name: 'unique_platform_username',
    });

    // Add indexes
    await queryInterface.addIndex('top_profiles', ['category']);
    await queryInterface.addIndex('top_profiles', ['cluster']);
    await queryInterface.addIndex('top_profiles', ['followersCount']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('top_profiles');
  },
};