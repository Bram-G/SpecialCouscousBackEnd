'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create CommentSections table
    await queryInterface.createTable('CommentSections', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      movieId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true
      },
      totalComments: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
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

    // 2. Create Comments table
    await queryInterface.createTable('Comments', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      commentSectionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'CommentSections',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      parentCommentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Comments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      voteScore: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      upvotes: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      downvotes: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      replyCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      depth: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      isDeleted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      isEdited: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      editedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      isHidden: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
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

    // 3. Create CommentVotes table
    await queryInterface.createTable('CommentVotes', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      commentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Comments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      voteType: {
        type: Sequelize.ENUM('upvote', 'downvote'),
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // 4. Create CommentReports table
    await queryInterface.createTable('CommentReports', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      commentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Comments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      reportedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      reason: {
        type: Sequelize.ENUM('spam', 'harassment', 'inappropriate', 'other'),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      isResolved: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      resolvedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      resolvedAt: {
        type: Sequelize.DATE,
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

    // 5. Add indexes for performance
    await queryInterface.addIndex('CommentSections', ['movieId'], {
      unique: true,
      name: 'comment_sections_movie_id_unique'
    });

    await queryInterface.addIndex('Comments', ['commentSectionId'], {
      name: 'comments_section_id_index'
    });

    await queryInterface.addIndex('Comments', ['userId'], {
      name: 'comments_user_id_index'
    });

    await queryInterface.addIndex('Comments', ['parentCommentId'], {
      name: 'comments_parent_id_index'
    });

    await queryInterface.addIndex('Comments', ['voteScore'], {
      name: 'comments_vote_score_index'
    });

    await queryInterface.addIndex('Comments', ['createdAt'], {
      name: 'comments_created_at_index'
    });

    await queryInterface.addIndex('Comments', ['commentSectionId', 'parentCommentId'], {
      name: 'comments_section_parent_index'
    });

    await queryInterface.addIndex('CommentVotes', ['commentId', 'userId'], {
      unique: true,
      name: 'unique_user_comment_vote'
    });

    await queryInterface.addIndex('CommentVotes', ['commentId'], {
      name: 'comment_votes_comment_id_index'
    });

    await queryInterface.addIndex('CommentVotes', ['userId'], {
      name: 'comment_votes_user_id_index'
    });

    await queryInterface.addIndex('CommentReports', ['commentId'], {
      name: 'comment_reports_comment_id_index'
    });

    await queryInterface.addIndex('CommentReports', ['reportedByUserId'], {
      name: 'comment_reports_reporter_id_index'
    });

    await queryInterface.addIndex('CommentReports', ['isResolved'], {
      name: 'comment_reports_resolved_index'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order due to foreign key constraints
    await queryInterface.dropTable('CommentReports');
    await queryInterface.dropTable('CommentVotes');
    await queryInterface.dropTable('Comments');
    await queryInterface.dropTable('CommentSections');
  }
};