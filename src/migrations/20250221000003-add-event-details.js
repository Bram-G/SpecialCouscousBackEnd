// migrations/20250221000003-add-event-details.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('MovieMondayEventDetails', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      movieMondayId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'MovieMondays',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      meals: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      cocktails: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add unique constraint
    await queryInterface.addConstraint('MovieMondayEventDetails', {
      fields: ['movieMondayId'],
      type: 'unique',
      name: 'unique_movie_monday_event_details'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('MovieMondayEventDetails');
  }
};