// src/migrations/20250924000002-add-public-moviemonday-fields.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add isPublic column to MovieMondays
    await queryInterface.addColumn('MovieMondays', 'isPublic', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    // Add slug column to MovieMondays
    await queryInterface.addColumn('MovieMondays', 'slug', {
      type: Sequelize.STRING(150),
      allowNull: true,
      unique: true,
    });

    // Add weekTheme column to MovieMondays
    await queryInterface.addColumn('MovieMondays', 'weekTheme', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    // Add likesCount column to MovieMondays
    await queryInterface.addColumn('MovieMondays', 'likesCount', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });

    // Add indexes
    await queryInterface.addIndex('MovieMondays', ['slug'], {
      name: 'moviemondays_slug_index',
    });

    await queryInterface.addIndex('MovieMondays', ['isPublic'], {
      name: 'moviemondays_is_public_index',
    });

    await queryInterface.addIndex('MovieMondays', ['weekTheme'], {
      name: 'moviemondays_week_theme_index',
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes
    await queryInterface.removeIndex('MovieMondays', 'moviemondays_slug_index');
    await queryInterface.removeIndex('MovieMondays', 'moviemondays_is_public_index');
    await queryInterface.removeIndex('MovieMondays', 'moviemondays_week_theme_index');

    // Remove columns
    await queryInterface.removeColumn('MovieMondays', 'likesCount');
    await queryInterface.removeColumn('MovieMondays', 'weekTheme');
    await queryInterface.removeColumn('MovieMondays', 'slug');
    await queryInterface.removeColumn('MovieMondays', 'isPublic');
  }
};