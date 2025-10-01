// src/migrations/20250924000003-create-moviemonday-likes.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create MovieMondayLikes table
    await queryInterface.createTable('MovieMondayLikes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      movieMondayId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'MovieMondays',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add unique constraint to prevent duplicate likes
    await queryInterface.addConstraint('MovieMondayLikes', {
      fields: ['movieMondayId', 'userId'],
      type: 'unique',
      name: 'unique_user_moviemonday_like',
    });

    // Add indexes for performance
    await queryInterface.addIndex('MovieMondayLikes', ['movieMondayId'], {
      name: 'moviemonday_likes_moviemonday_id_index',
    });

    await queryInterface.addIndex('MovieMondayLikes', ['userId'], {
      name: 'moviemonday_likes_user_id_index',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('MovieMondayLikes');
  },
};