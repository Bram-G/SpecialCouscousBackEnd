'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add watched column to WatchLater table
    await queryInterface.addColumn('WatchLater', 'watched', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    
    // Add isWinner column to WatchLater table
    await queryInterface.addColumn('WatchLater', 'isWinner', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    
    // Add watchedDate column (optional, for future features)
    await queryInterface.addColumn('WatchLater', 'watchedDate', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove added columns
    await queryInterface.removeColumn('WatchLater', 'watched');
    await queryInterface.removeColumn('WatchLater', 'isWinner');
    await queryInterface.removeColumn('WatchLater', 'watchedDate');
  }
};