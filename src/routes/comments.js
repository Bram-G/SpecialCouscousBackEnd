const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { 
  CommentSection, 
  Comment, 
  CommentVote, 
  CommentReport,
  User,
  sequelize
} = require('../models');
const { Op } = require('sequelize');

// Rate limiting for comment creation (anti-spam)
const commentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1, // Limit each user to 1 comment per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Please wait a moment before posting another comment',
  keyGenerator: (req) => req.user?.id || req.ip, // Rate limit by user ID
});

// Rate limiting for voting (prevent spam voting)
const voteLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 10, // Max 10 votes per 10 seconds
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many votes, please slow down',
  keyGenerator: (req) => req.user?.id || req.ip,
});

// ============================================
// GET /api/comments/:movieId - Get all comments for a movie
// ============================================
router.get('/:movieId', async (req, res) => {
  try {
    const { movieId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      sort = 'top' // 'top', 'new', 'controversial'
    } = req.query;
    
    const userId = req.user?.id; // Optional auth for this endpoint
    
    if (!movieId || isNaN(movieId)) {
      return res.status(400).json({ message: 'Valid movie ID is required' });
    }

    // Check if comment section exists for this movie
    const commentSection = await CommentSection.findOne({
      where: { movieId: parseInt(movieId) }
    });

    if (!commentSection) {
      return res.json({
        comments: [],
        totalComments: 0,
        hasMore: false,
        currentPage: 1,
        totalPages: 0
      });
    }

    // Build sort order based on request
    let orderClause;
    switch (sort) {
      case 'new':
        orderClause = [['createdAt', 'DESC']];
        break;
      case 'controversial':
        // Sort by comments that have lots of both upvotes and downvotes
        orderClause = [
          [sequelize.literal('(upvotes + downvotes)'), 'DESC'],
          [sequelize.literal('ABS(upvotes - downvotes)'), 'ASC']
        ];
        break;
      case 'top':
      default:
        orderClause = [['voteScore', 'DESC'], ['createdAt', 'DESC']];
        break;
    }

    const offset = (page - 1) * limit;

    // Get top-level comments (parentCommentId is null)
    const { count, rows: topLevelComments } = await Comment.findAndCountAll({
      where: { 
        commentSectionId: commentSection.id,
        parentCommentId: null,
        isDeleted: false,
        isHidden: false
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username']
        },
        {
          model: CommentVote,
          as: 'votes',
          where: userId ? { userId } : undefined,
          required: false,
          attributes: ['voteType']
        }
      ],
      order: orderClause,
      limit: parseInt(limit),
      offset,
      distinct: true
    });

    // Get replies for each top-level comment (first 3 replies)
    const commentsWithReplies = await Promise.all(
      topLevelComments.map(async (comment) => {
        const replies = await Comment.findAll({
          where: { 
            parentCommentId: comment.id,
            isDeleted: false,
            isHidden: false
          },
          include: [
            {
              model: User,
              as: 'author',
              attributes: ['id', 'username']
            },
            {
              model: CommentVote,
              as: 'votes',
              where: userId ? { userId } : undefined,
              required: false,
              attributes: ['voteType']
            }
          ],
          order: [['voteScore', 'DESC'], ['createdAt', 'ASC']],
          limit: 3 // Show first 3 replies
        });

        const commentData = comment.get({ plain: true });
        
        // Add user's vote if they're logged in
        if (userId && comment.votes?.length > 0) {
          commentData.userVote = comment.votes[0].voteType;
        }

        // Format replies with user votes
        const formattedReplies = replies.map(reply => {
          const replyData = reply.get({ plain: true });
          if (userId && reply.votes?.length > 0) {
            replyData.userVote = reply.votes[0].voteType;
          }
          return replyData;
        });

        return {
          ...commentData,
          replies: formattedReplies,
          hasMoreReplies: comment.replyCount > 3
        };
      })
    );

    const totalPages = Math.ceil(count / limit);

    res.json({
      comments: commentsWithReplies,
      totalComments: commentSection.totalComments,
      hasMore: page < totalPages,
      currentPage: parseInt(page),
      totalPages,
      sort
    });

  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Failed to fetch comments' });
  }
});

// ============================================
// GET /api/comments/:commentId/replies - Get replies for a specific comment
// ============================================
router.get('/:commentId/replies', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user?.id;

    if (!commentId || isNaN(commentId)) {
      return res.status(400).json({ message: 'Valid comment ID is required' });
    }

    const offset = (page - 1) * limit;

    const { count, rows: replies } = await Comment.findAndCountAll({
      where: { 
        parentCommentId: parseInt(commentId),
        isDeleted: false,
        isHidden: false
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username']
        },
        {
          model: CommentVote,
          as: 'votes',
          where: userId ? { userId } : undefined,
          required: false,
          attributes: ['voteType']
        }
      ],
      order: [['voteScore', 'DESC'], ['createdAt', 'ASC']],
      limit: parseInt(limit),
      offset
    });

    const formattedReplies = replies.map(reply => {
      const replyData = reply.get({ plain: true });
      if (userId && reply.votes?.length > 0) {
        replyData.userVote = reply.votes[0].voteType;
      }
      return replyData;
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      replies: formattedReplies,
      hasMore: page < totalPages,
      currentPage: parseInt(page),
      totalPages
    });

  } catch (error) {
    console.error('Error fetching comment replies:', error);
    res.status(500).json({ message: 'Failed to fetch comment replies' });
  }
});

// ============================================
// POST /api/comments/:movieId - Create new comment or reply
// ============================================
router.post('/:movieId', auth, commentLimiter, async (req, res) => {
  try {
    const { movieId } = req.params;
    const { content, parentCommentId } = req.body;
    const userId = req.user.id;

    // Validation
    if (!movieId || isNaN(movieId)) {
      return res.status(400).json({ message: 'Valid movie ID is required' });
    }

    if (!content || content.trim().length < 10) {
      return res.status(400).json({ message: 'Comment must be at least 10 characters long' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ message: 'Comment cannot exceed 1000 characters' });
    }

    // Check if user account is old enough (24 hours) - anti-spam
    const user = await User.findByPk(userId);
    const accountAge = Date.now() - new Date(user.createdAt).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    if (accountAge < twentyFourHours) {
      return res.status(403).json({ 
        message: 'Account must be at least 24 hours old to comment' 
      });
    }

    let commentSection;
    let parentComment = null;
    let depth = 0;

    // Get or create comment section (lazy loading!)
    [commentSection] = await CommentSection.findOrCreate({
      where: { movieId: parseInt(movieId) },
      defaults: {
        movieId: parseInt(movieId),
        totalComments: 0,
        isActive: true
      }
    });

    // If this is a reply, validate parent comment and calculate depth
    if (parentCommentId) {
      parentComment = await Comment.findOne({
        where: { 
          id: parentCommentId,
          commentSectionId: commentSection.id,
          isDeleted: false
        }
      });

      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }

      depth = parentComment.depth + 1;
      
      if (depth > 5) {
        return res.status(400).json({ message: 'Maximum reply depth exceeded' });
      }
    }

    // Create the comment
    const comment = await Comment.create({
      commentSectionId: commentSection.id,
      userId,
      parentCommentId: parentCommentId || null,
      content: content.trim(),
      depth,
      voteScore: 0,
      upvotes: 0,
      downvotes: 0,
      replyCount: 0
    });

    // Update counters
    await Promise.all([
      // Increment total comments in section
      commentSection.increment('totalComments'),
      // If this is a reply, increment parent's reply count
      parentComment ? parentComment.increment('replyCount') : Promise.resolve()
    ]);

    // Return the new comment with author info
    const newComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username']
        }
      ]
    });

    res.status(201).json({
      message: 'Comment created successfully',
      comment: {
        ...newComment.get({ plain: true }),
        userVote: null, // New comment has no votes yet
        replies: [], // New comment has no replies yet
        hasMoreReplies: false
      }
    });

  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ message: 'Failed to create comment' });
  }
});

// ============================================
// POST /api/comments/:commentId/vote - Vote on a comment
// ============================================
router.post('/:commentId/vote', auth, voteLimiter, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { voteType } = req.body; // 'upvote' or 'downvote'
    const userId = req.user.id;

    // Validation
    if (!commentId || isNaN(commentId)) {
      return res.status(400).json({ message: 'Valid comment ID is required' });
    }

    if (!voteType || !['upvote', 'downvote'].includes(voteType)) {
      return res.status(400).json({ message: 'Vote type must be "upvote" or "downvote"' });
    }

    // Find the comment
    const comment = await Comment.findOne({
      where: { 
        id: commentId,
        isDeleted: false,
        isHidden: false
      }
    });

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Prevent users from voting on their own comments
    if (comment.userId === userId) {
      return res.status(400).json({ message: 'Cannot vote on your own comment' });
    }

    // Check for existing vote
    const existingVote = await CommentVote.findOne({
      where: { commentId, userId }
    });

    let voteChange = { upvotes: 0, downvotes: 0 };

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // Same vote type - remove the vote
        await existingVote.destroy();
        
        voteChange[voteType === 'upvote' ? 'upvotes' : 'downvotes'] = -1;
        
        res.json({ 
          message: 'Vote removed',
          userVote: null,
          newCounts: {
            upvotes: comment.upvotes + voteChange.upvotes,
            downvotes: comment.downvotes + voteChange.downvotes,
            voteScore: comment.voteScore + (voteChange.upvotes - voteChange.downvotes)
          }
        });
      } else {
        // Different vote type - change the vote
        const oldVoteType = existingVote.voteType;
        await existingVote.update({ voteType });
        
        // Remove old vote and add new vote
        voteChange[oldVoteType === 'upvote' ? 'upvotes' : 'downvotes'] = -1;
        voteChange[voteType === 'upvote' ? 'upvotes' : 'downvotes'] = 1;
        
        res.json({ 
          message: 'Vote changed',
          userVote: voteType,
          newCounts: {
            upvotes: comment.upvotes + voteChange.upvotes,
            downvotes: comment.downvotes + voteChange.downvotes,
            voteScore: comment.voteScore + (voteChange.upvotes - voteChange.downvotes)
          }
        });
      }
    } else {
      // New vote
      await CommentVote.create({ commentId, userId, voteType });
      
      voteChange[voteType === 'upvote' ? 'upvotes' : 'downvotes'] = 1;
      
      res.json({ 
        message: 'Vote added',
        userVote: voteType,
        newCounts: {
          upvotes: comment.upvotes + voteChange.upvotes,
          downvotes: comment.downvotes + voteChange.downvotes,
          voteScore: comment.voteScore + (voteChange.upvotes - voteChange.downvotes)
        }
      });
    }

    // Update comment vote counts
    await comment.update({
      upvotes: comment.upvotes + voteChange.upvotes,
      downvotes: comment.downvotes + voteChange.downvotes,
      voteScore: comment.voteScore + (voteChange.upvotes - voteChange.downvotes)
    });

  } catch (error) {
    console.error('Error voting on comment:', error);
    res.status(500).json({ message: 'Failed to vote on comment' });
  }
});

// ============================================
// DELETE /api/comments/:commentId/vote - Remove vote from comment
// ============================================
router.delete('/:commentId/vote', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    if (!commentId || isNaN(commentId)) {
      return res.status(400).json({ message: 'Valid comment ID is required' });
    }

    const vote = await CommentVote.findOne({
      where: { commentId, userId }
    });

    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }

    const comment = await Comment.findByPk(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const voteType = vote.voteType;
    await vote.destroy();

    // Update comment vote counts
    const voteChange = voteType === 'upvote' ? { upvotes: -1 } : { downvotes: -1 };
    const scoreChange = voteType === 'upvote' ? -1 : 1;

    await comment.update({
      upvotes: comment.upvotes + (voteChange.upvotes || 0),
      downvotes: comment.downvotes + (voteChange.downvotes || 0),
      voteScore: comment.voteScore + scoreChange
    });

    res.json({ 
      message: 'Vote removed successfully',
      userVote: null,
      newCounts: {
        upvotes: comment.upvotes + (voteChange.upvotes || 0),
        downvotes: comment.downvotes + (voteChange.downvotes || 0),
        voteScore: comment.voteScore + scoreChange
      }
    });

  } catch (error) {
    console.error('Error removing vote:', error);
    res.status(500).json({ message: 'Failed to remove vote' });
  }
});

// ============================================
// PUT /api/comments/:commentId - Edit comment (only by author)
// ============================================
router.put('/:commentId', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    // Validation
    if (!commentId || isNaN(commentId)) {
      return res.status(400).json({ message: 'Valid comment ID is required' });
    }

    if (!content || content.trim().length < 10) {
      return res.status(400).json({ message: 'Comment must be at least 10 characters long' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ message: 'Comment cannot exceed 1000 characters' });
    }

    // Find the comment
    const comment = await Comment.findOne({
      where: { 
        id: commentId,
        isDeleted: false
      }
    });

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user is the author
    if (comment.userId !== userId) {
      return res.status(403).json({ message: 'Can only edit your own comments' });
    }

    // Check if comment is too old to edit (24 hours)
    const commentAge = Date.now() - new Date(comment.createdAt).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    if (commentAge > twentyFourHours) {
      return res.status(403).json({ 
        message: 'Comments can only be edited within 24 hours of posting' 
      });
    }

    // Update the comment
    await comment.update({
      content: content.trim(),
      isEdited: true,
      editedAt: new Date()
    });

    // Return updated comment with author info
    const updatedComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username']
        }
      ]
    });

    res.json({
      message: 'Comment updated successfully',
      comment: updatedComment
    });

  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ message: 'Failed to update comment' });
  }
});

// ============================================
// DELETE /api/comments/:commentId - Delete comment (soft delete)
// ============================================
router.delete('/:commentId', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    if (!commentId || isNaN(commentId)) {
      return res.status(400).json({ message: 'Valid comment ID is required' });
    }

    const comment = await Comment.findOne({
      where: { 
        id: commentId,
        isDeleted: false
      }
    });

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user is the author (or admin in the future)
    if (comment.userId !== userId) {
      return res.status(403).json({ message: 'Can only delete your own comments' });
    }

    // Soft delete the comment
    await comment.update({
      isDeleted: true,
      content: '[deleted]'
    });

    // Update comment section total count
    const commentSection = await CommentSection.findByPk(comment.commentSectionId);
    if (commentSection) {
      await commentSection.decrement('totalComments');
    }

    res.json({ message: 'Comment deleted successfully' });

  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ message: 'Failed to delete comment' });
  }
});

// ============================================
// POST /api/comments/:commentId/report - Report a comment
// ============================================
router.post('/:commentId/report', auth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reason, description } = req.body;
    const userId = req.user.id;

    // Validation
    if (!commentId || isNaN(commentId)) {
      return res.status(400).json({ message: 'Valid comment ID is required' });
    }

    if (!reason || !['spam', 'harassment', 'inappropriate', 'other'].includes(reason)) {
      return res.status(400).json({ 
        message: 'Reason must be one of: spam, harassment, inappropriate, other' 
      });
    }

    const comment = await Comment.findOne({
      where: { 
        id: commentId,
        isDeleted: false
      }
    });

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user already reported this comment
    const existingReport = await CommentReport.findOne({
      where: { commentId, reportedByUserId: userId }
    });

    if (existingReport) {
      return res.status(400).json({ message: 'You have already reported this comment' });
    }

    // Create the report
    await CommentReport.create({
      commentId,
      reportedByUserId: userId,
      reason,
      description: description || null,
      isResolved: false
    });

    res.status(201).json({ message: 'Comment reported successfully' });

  } catch (error) {
    console.error('Error reporting comment:', error);
    res.status(500).json({ message: 'Failed to report comment' });
  }
});

module.exports = router;