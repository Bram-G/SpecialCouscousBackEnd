// src/migrations/20250924000001-add-public-group-fields.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add isPublic column to Groups
    await queryInterface.addColumn('Groups', 'isPublic', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });

    // Add slug column to Groups
    await queryInterface.addColumn('Groups', 'slug', {
      type: Sequelize.STRING(100),
      allowNull: true,
      unique: true,
    });

    // Add description column to Groups
    await queryInterface.addColumn('Groups', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add coverImagePath column to Groups
    await queryInterface.addColumn('Groups', 'coverImagePath', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add index for slug lookups
    await queryInterface.addIndex('Groups', ['slug'], {
      name: 'groups_slug_index',
    });

    // Add index for public groups
    await queryInterface.addIndex('Groups', ['isPublic'], {
      name: 'groups_is_public_index',
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes
    await queryInterface.removeIndex('Groups', 'groups_slug_index');
    await queryInterface.removeIndex('Groups', 'groups_is_public_index');

    // Remove columns
    await queryInterface.removeColumn('Groups', 'coverImagePath');
    await queryInterface.removeColumn('Groups', 'description');
    await queryInterface.removeColumn('Groups', 'slug');
    await queryInterface.removeColumn('Groups', 'isPublic');
  }
};