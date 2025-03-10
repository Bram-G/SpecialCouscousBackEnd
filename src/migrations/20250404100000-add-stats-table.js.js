'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Statistics', {
      key: {
        type: Sequelize.STRING(50),
        allowNull: false,
        primaryKey: true
      },
      value: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastUpdated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
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

    // Insert initial values
    await queryInterface.bulkInsert('Statistics', [
      {
        key: 'totalMovieMondays',
        value: 0,
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: 'totalMealsShared',
        value: 0,
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: 'totalCocktailsConsumed',
        value: 0,
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Statistics');
  }
};