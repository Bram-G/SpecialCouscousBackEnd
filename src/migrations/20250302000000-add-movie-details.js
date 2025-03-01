'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create MovieCast table
    await queryInterface.createTable('MovieCast', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      movieSelectionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'MovieSelections',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      actorId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      character: {
        type: Sequelize.STRING,
        allowNull: true
      },
      profilePath: {
        type: Sequelize.STRING,
        allowNull: true
      },
      order: {
        type: Sequelize.INTEGER,
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

    // Create MovieCrew table
    await queryInterface.createTable('MovieCrew', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      movieSelectionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'MovieSelections',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      personId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      job: {
        type: Sequelize.STRING,
        allowNull: false
      },
      department: {
        type: Sequelize.STRING,
        allowNull: true
      },
      profilePath: {
        type: Sequelize.STRING,
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

    // Add genre information to MovieSelection
    await queryInterface.addColumn('MovieSelections', 'genres', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    // Add release year to MovieSelection
    await queryInterface.addColumn('MovieSelections', 'releaseYear', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('MovieSelections', 'releaseYear');
    await queryInterface.removeColumn('MovieSelections', 'genres');
    await queryInterface.dropTable('MovieCrew');
    await queryInterface.dropTable('MovieCast');
  }
};