// src/migrations/20250308000000-add-movie-selection-columns.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('MovieSelections', 'genres', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    
    await queryInterface.addColumn('MovieSelections', 'releaseYear', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('MovieSelections', 'genres');
    await queryInterface.removeColumn('MovieSelections', 'releaseYear');
  }
};