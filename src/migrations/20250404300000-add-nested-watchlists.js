'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create WatchlistCategories table
    await queryInterface.createTable('WatchlistCategories', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
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
      isPublic: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      coverImagePath: {
        type: Sequelize.STRING,
        allowNull: true
      },
      likesCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      slug: {
        type: Sequelize.STRING(150),
        allowNull: true,
        unique: true
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

    // 2. Add a unique constraint for user-category combinations
    await queryInterface.addConstraint('WatchlistCategories', {
      fields: ['userId', 'name'],
      type: 'unique',
      name: 'unique_user_watchlist_category'
    });

    // 3. Create a WatchlistItems table that replaces the current WatchLater functionality
    await queryInterface.createTable('WatchlistItems', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      categoryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'WatchlistCategories',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      tmdbMovieId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      posterPath: {
        type: Sequelize.STRING,
        allowNull: true
      },
      sortOrder: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      addedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      userNote: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      userRating: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      watched: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      watchedDate: {
        type: Sequelize.DATE,
        allowNull: true
      },
      isWinner: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
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

    // 4. Add unique constraint for category-movie combinations
    await queryInterface.addConstraint('WatchlistItems', {
      fields: ['categoryId', 'tmdbMovieId'],
      type: 'unique',
      name: 'unique_watchlist_movie'
    });

    // 5. Create a table for watchlist likes
    await queryInterface.createTable('WatchlistLikes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      watchlistCategoryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'WatchlistCategories',
          key: 'id'
        },
        onDelete: 'CASCADE'
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
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // 6. Add unique constraint to prevent duplicate likes
    await queryInterface.addConstraint('WatchlistLikes', {
      fields: ['watchlistCategoryId', 'userId'],
      type: 'unique',
      name: 'unique_watchlist_like'
    });

    // 7. Create a default category for each user (for migration of existing data)
    // Using double quotes for column names to preserve case sensitivity
    await queryInterface.sequelize.query(`
      INSERT INTO "WatchlistCategories" ("name", "userId", "isPublic", "createdAt", "updatedAt")
      SELECT 'My Watchlist', "id", false, NOW(), NOW() FROM "Users";
    `);

    // 8. Migrate existing watchlist data if needed
    await queryInterface.sequelize.query(`
      INSERT INTO "WatchlistItems" (
        "categoryId", 
        "tmdbMovieId", 
        "title", 
        "posterPath", 
        "watched",
        "watchedDate",
        "isWinner",
        "createdAt", 
        "updatedAt"
      )
      SELECT 
        wc."id" as "categoryId",
        wl."tmdbMovieId",
        wl."title",
        wl."posterPath",
        wl."watched",
        wl."watchedDate",
        wl."isWinner",
        wl."createdAt",
        wl."updatedAt"
      FROM "WatchLater" wl
      JOIN "WatchlistCategories" wc ON wl."userId" = wc."userId" AND wc."name" = 'My Watchlist';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order
    await queryInterface.dropTable('WatchlistLikes');
    await queryInterface.dropTable('WatchlistItems');
    await queryInterface.dropTable('WatchlistCategories');
  }
};