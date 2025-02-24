// migrations/20250221000002-create-movie-tables.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create enum type first
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_moviemondays_status AS ENUM ('pending', 'in-progress', 'completed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create MovieMondays table
    await queryInterface.createTable('MovieMondays', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      date: {
        type: Sequelize.DATEONLY, 
        allowNull: false
      },
      pickerUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        }
      },
      GroupId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Groups',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      status: {
        type: "enum_moviemondays_status",
        defaultValue: 'pending'
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
    
   

    // Create MovieSelections table
    await queryInterface.createTable('MovieSelections', {
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
      tmdbMovieId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      posterPath: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      isWinner: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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

    // Create WatchLater table
    await queryInterface.createTable('WatchLater', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      tmdbMovieId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      posterPath: {
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

    // Add constraints
    await queryInterface.addConstraint('MovieMondays', {
      fields: ['date', 'GroupId'],
      type: 'unique',
      name: 'unique_date_per_group'
    });

    // Add unique constraint for user and movie combination
    await queryInterface.addConstraint('WatchLater', {
      fields: ['userId', 'tmdbMovieId'],
      type: 'unique',
      name: 'unique_user_movie'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order
    await queryInterface.dropTable('WatchLater');
    await queryInterface.dropTable('MovieSelections');
    await queryInterface.dropTable('MovieMondays');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_moviemondays_status;');
  }
};