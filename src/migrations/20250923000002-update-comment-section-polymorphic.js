'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Add new polymorphic columns
    await queryInterface.addColumn('CommentSections', 'contentType', {
      type: Sequelize.ENUM('movie', 'watchlist', 'moviemonday'),
      allowNull: true, // Temporarily allow null for migration
    });

    await queryInterface.addColumn('CommentSections', 'contentId', {
      type: Sequelize.INTEGER,
      allowNull: true, // Temporarily allow null for migration
    });

    // Step 2: Migrate existing data (movieId -> contentType='movie', contentId=movieId)
    await queryInterface.sequelize.query(`
      UPDATE "CommentSections" 
      SET "contentType" = 'movie', "contentId" = "movieId" 
      WHERE "movieId" IS NOT NULL;
    `);

    // Step 3: Make the new columns required now that data is migrated
    await queryInterface.changeColumn('CommentSections', 'contentType', {
      type: Sequelize.ENUM('movie', 'watchlist', 'moviemonday'),
      allowNull: false,
    });

    await queryInterface.changeColumn('CommentSections', 'contentId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    // Step 4: Remove the old movieId column
    await queryInterface.removeColumn('CommentSections', 'movieId');

    // Step 5: Add the unique constraint for contentType + contentId
    await queryInterface.addIndex('CommentSections', {
      fields: ['contentType', 'contentId'],
      unique: true,
      name: 'unique_content_comment_section'
    });

    // Step 6: Add performance indexes
    await queryInterface.addIndex('CommentSections', {
      fields: ['contentType'],
      name: 'comment_sections_content_type_index'
    });

    await queryInterface.addIndex('CommentSections', {
      fields: ['contentId'],
      name: 'comment_sections_content_id_index'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Reverse the migration
    
    // Remove indexes
    await queryInterface.removeIndex('CommentSections', 'unique_content_comment_section');
    await queryInterface.removeIndex('CommentSections', 'comment_sections_content_type_index');
    await queryInterface.removeIndex('CommentSections', 'comment_sections_content_id_index');

    // Add back movieId column
    await queryInterface.addColumn('CommentSections', 'movieId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Migrate data back (only for movie content)
    await queryInterface.sequelize.query(`
      UPDATE "CommentSections" 
      SET "movieId" = "contentId" 
      WHERE "contentType" = 'movie';
    `);

    // Make movieId required and unique
    await queryInterface.changeColumn('CommentSections', 'movieId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true,
    });

    // Remove polymorphic columns
    await queryInterface.removeColumn('CommentSections', 'contentType');
    await queryInterface.removeColumn('CommentSections', 'contentId');

    // Remove the ENUM type (this might not work on all databases)
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_CommentSections_contentType";');
  }
};