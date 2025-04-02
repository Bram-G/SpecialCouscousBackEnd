const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  User, 
  WatchlistCategory, 
  WatchlistItem, 
  WatchlistLike,
  sequelize
} = require('../models');
const { Op } = require('sequelize');

// Get all watchlist categories for the current user
router.get('/categories', auth, async (req, res) => {
  try {
    const includeItems = req.query.include_items === 'true';
    
    // Build the query
    const query = {
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    };
    
    // Only include items if requested
    if (includeItems) {
      query.include = [{
        model: WatchlistItem,
        as: 'items',
        attributes: ['id', 'tmdbMovieId', 'title', 'posterPath'],
        limit: 4 // Only need a few items for the preview
      }];
    } else {
      query.include = [{
        model: WatchlistItem,
        as: 'items',
        attributes: ['id'],
        limit: 1 // Just to check if there are any
      }];
    }
    
    const categories = await WatchlistCategory.findAll(query);

    // Add a count of movies in each category
    const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
      const count = await WatchlistItem.count({
        where: { categoryId: category.id }
      });
      
      return {
        ...category.get({ plain: true }),
        moviesCount: count
      };
    }));

    res.json(categoriesWithCounts);
  } catch (error) {
    console.error('Error fetching watchlist categories:', error);
    res.status(500).json({ message: 'Failed to fetch watchlist categories' });
  }
});

// Create a new watchlist category
router.post('/categories', auth, async (req, res) => {
  const { name, description, isPublic } = req.body;
  
  if (!name) {
    return res.status(400).json({ message: 'Category name is required' });
  }

  try {
    // Check for duplicate name for this user
    const existingCategory = await WatchlistCategory.findOne({
      where: {
        userId: req.user.id,
        name: name
      }
    });

    if (existingCategory) {
      return res.status(409).json({ message: 'You already have a watchlist with this name' });
    }

    const category = await WatchlistCategory.create({
      name,
      description: description || '',
      userId: req.user.id,
      isPublic: isPublic || false
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating watchlist category:', error);
    res.status(500).json({ message: 'Failed to create watchlist category' });
  }
});

// Update a watchlist category
router.put('/categories/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { name, description, isPublic, coverImagePath } = req.body;
  
  try {
    const category = await WatchlistCategory.findOne({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!category) {
      return res.status(404).json({ message: 'Watchlist category not found' });
    }

    // Check for duplicate name if name is being changed
    if (name && name !== category.name) {
      const existingCategory = await WatchlistCategory.findOne({
        where: {
          userId: req.user.id,
          name,
          id: { [Op.ne]: id } // Exclude the current category
        }
      });

      if (existingCategory) {
        return res.status(409).json({ message: 'You already have a watchlist with this name' });
      }
    }

    // Update only provided fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (isPublic !== undefined) category.isPublic = isPublic;
    if (coverImagePath !== undefined) category.coverImagePath = coverImagePath;

    await category.save();
    
    res.json(category);
  } catch (error) {
    console.error('Error updating watchlist category:', error);
    res.status(500).json({ message: 'Failed to update watchlist category' });
  }
});

// Delete a watchlist category
router.delete('/categories/:id', auth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const category = await WatchlistCategory.findOne({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!category) {
      return res.status(404).json({ message: 'Watchlist category not found' });
    }

    // Check if it's the default category and there's only one category
    const categoriesCount = await WatchlistCategory.count({
      where: { userId: req.user.id }
    });

    if (categoriesCount === 1) {
      return res.status(400).json({ message: 'Cannot delete the only watchlist category' });
    }

    await category.destroy();
    
    res.json({ message: 'Watchlist category deleted successfully' });
  } catch (error) {
    console.error('Error deleting watchlist category:', error);
    res.status(500).json({ message: 'Failed to delete watchlist category' });
  }
});

// Get a specific watchlist category with its items
router.get('/categories/:id', auth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // First determine if we're accessing by ID or slug
    const where = isNaN(id) 
      ? { slug: id } // If not a number, assume it's a slug
      : { id }; // Otherwise use as ID
    
    // Add public filter if no authentication
    if (!req.user) {
      where.isPublic = true;
    }
    
    const category = await WatchlistCategory.findOne({
      where,
      include: [{
        model: WatchlistItem,
        as: 'items',
        order: [
          ['sortOrder', 'ASC'],
          ['addedAt', 'DESC']
        ]
      }]
    });

    if (!category) {
      return res.status(404).json({ message: 'Watchlist category not found' });
    }

    // If not public and not owned by the requesting user, deny access
    if (!category.isPublic && (!req.user || category.userId !== req.user.id)) {
      return res.status(403).json({ message: 'This watchlist is private' });
    }

    // Check if the current user has liked this category
    let userHasLiked = false;
    if (req.user) {
      const like = await WatchlistLike.findOne({
        where: {
          watchlistCategoryId: category.id,
          userId: req.user.id
        }
      });
      userHasLiked = !!like;
    }

    // Get owner information
    const owner = await User.findByPk(category.userId, {
      attributes: ['id', 'username']
    });

    res.json({
      ...category.get({ plain: true }),
      userHasLiked,
      owner
    });
  } catch (error) {
    console.error('Error fetching watchlist category:', error);
    res.status(500).json({ message: 'Failed to fetch watchlist category' });
  }
});

// Get public watchlist categories
router.get('/public', async (req, res) => {
  try {
    const { sort = 'popular', limit = 20, offset = 0 } = req.query;
    
    let order;
    if (sort === 'latest') {
      order = [['createdAt', 'DESC']];
    } else if (sort === 'popular') {
      order = [['likesCount', 'DESC'], ['createdAt', 'DESC']];
    } else {
      order = [['createdAt', 'DESC']];
    }
    
    const categories = await WatchlistCategory.findAndCountAll({
      where: { isPublic: true },
      order,
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: User,
          attributes: ['id', 'username'],
          required: true
        },
        {
          model: WatchlistItem,
          as: 'items',
          attributes: ['id', 'posterPath'],
          limit: 4
        }
      ]
    });

    // Add a count of movies in each category
    const categoriesWithCounts = await Promise.all(categories.rows.map(async (category) => {
      const count = await WatchlistItem.count({
        where: { categoryId: category.id }
      });
      
      return {
        ...category.get({ plain: true }),
        moviesCount: count
      };
    }));

    res.json({
      categories: categoriesWithCounts,
      total: categories.count,
      offset: parseInt(offset),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching public watchlists:', error);
    res.status(500).json({ message: 'Failed to fetch public watchlists' });
  }
});

// Add a movie to a watchlist category
router.post('/categories/:id/movies', auth, async (req, res) => {
  const { id } = req.params;
  const { tmdbMovieId, title, posterPath } = req.body;
  
  if (!tmdbMovieId || !title) {
    return res.status(400).json({ message: 'Movie ID and title are required' });
  }

  try {
    const category = await WatchlistCategory.findOne({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!category) {
      return res.status(404).json({ message: 'Watchlist category not found' });
    }

    // Check if movie already exists in this category
    const existingMovie = await WatchlistItem.findOne({
      where: {
        categoryId: id,
        tmdbMovieId
      }
    });

    if (existingMovie) {
      return res.status(409).json({ 
        message: 'Movie already in this watchlist',
        watchlistItem: existingMovie
      });
    }

    // Get the highest sort order in this category
    const maxSortOrder = await WatchlistItem.max('sortOrder', {
      where: { categoryId: id }
    }) || 0;

    const watchlistItem = await WatchlistItem.create({
      categoryId: id,
      tmdbMovieId,
      title,
      posterPath,
      sortOrder: maxSortOrder + 1
    });

    res.status(201).json(watchlistItem);
  } catch (error) {
    console.error('Error adding movie to watchlist:', error);
    res.status(500).json({ message: 'Failed to add movie to watchlist' });
  }
});

// Remove a movie from a watchlist category
router.delete('/categories/:categoryId/movies/:itemId', auth, async (req, res) => {
  const { categoryId, itemId } = req.params;
  
  try {
    const watchlistItem = await WatchlistItem.findOne({
      where: { id: itemId, categoryId },
      include: [{
        model: WatchlistCategory,
        where: { userId: req.user.id }
      }]
    });

    if (!watchlistItem) {
      return res.status(404).json({ message: 'Watchlist item not found or not authorized' });
    }

    await watchlistItem.destroy();
    
    res.json({ message: 'Movie removed from watchlist successfully' });
  } catch (error) {
    console.error('Error removing movie from watchlist:', error);
    res.status(500).json({ message: 'Failed to remove movie from watchlist' });
  }
});

// Update a watchlist item (notes, rating, watched status)
router.put('/categories/:categoryId/movies/:itemId', auth, async (req, res) => {
  const { categoryId, itemId } = req.params;
  const { userNote, userRating, watched, watchedDate, sortOrder } = req.body;
  
  try {
    const watchlistItem = await WatchlistItem.findOne({
      where: { id: itemId, categoryId },
      include: [{
        model: WatchlistCategory,
        where: { userId: req.user.id }
      }]
    });

    if (!watchlistItem) {
      return res.status(404).json({ message: 'Watchlist item not found or not authorized' });
    }

    // Update only provided fields
    if (userNote !== undefined) watchlistItem.userNote = userNote;
    if (userRating !== undefined) watchlistItem.userRating = userRating;
    if (watched !== undefined) watchlistItem.watched = watched;
    if (watchedDate !== undefined) watchlistItem.watchedDate = watchedDate;
    if (sortOrder !== undefined) watchlistItem.sortOrder = sortOrder;

    await watchlistItem.save();
    
    res.json(watchlistItem);
  } catch (error) {
    console.error('Error updating watchlist item:', error);
    res.status(500).json({ message: 'Failed to update watchlist item' });
  }
});

// Reorder movies in a watchlist category
router.post('/categories/:id/reorder', auth, async (req, res) => {
  const { id } = req.params;
  const { items } = req.body; // Array of { id, sortOrder }
  
  if (!Array.isArray(items)) {
    return res.status(400).json({ message: 'Items array is required' });
  }

  const transaction = await sequelize.transaction();
  
  try {
    const category = await WatchlistCategory.findOne({
      where: {
        id,
        userId: req.user.id
      },
      transaction
    });

    if (!category) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Watchlist category not found' });
    }

    // Update each item's sort order
    const updatePromises = items.map(item => 
      WatchlistItem.update(
        { sortOrder: item.sortOrder },
        { 
          where: { 
            id: item.id,
            categoryId: id
          },
          transaction
        }
      )
    );
    
    await Promise.all(updatePromises);
    await transaction.commit();
    
    res.json({ message: 'Watchlist order updated successfully' });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Error reordering watchlist items:', error);
    res.status(500).json({ message: 'Failed to reorder watchlist items' });
  }
});

// Toggle like on a watchlist category
router.post('/categories/:id/like', auth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const category = await WatchlistCategory.findOne({
      where: { 
        id,
        isPublic: true // Only public watchlists can be liked
      }
    });

    if (!category) {
      return res.status(404).json({ message: 'Public watchlist category not found' });
    }

    // Check if user already liked this watchlist
    const existingLike = await WatchlistLike.findOne({
      where: {
        watchlistCategoryId: id,
        userId: req.user.id
      }
    });

    if (existingLike) {
      // Unlike
      await existingLike.destroy();
      await category.decrementLikes();
      return res.json({ liked: false, likesCount: category.likesCount });
    } else {
      // Like
      await WatchlistLike.create({
        watchlistCategoryId: id,
        userId: req.user.id
      });
      await category.incrementLikes();
      return res.json({ liked: true, likesCount: category.likesCount });
    }
  } catch (error) {
    console.error('Error toggling watchlist like:', error);
    res.status(500).json({ message: 'Failed to update watchlist like' });
  }
});

// Check if a movie is in any of the user's watchlists
router.get('/check-movie/:tmdbMovieId', auth, async (req, res) => {
  const { tmdbMovieId } = req.params;
  
  try {
    const watchlistItems = await WatchlistItem.findAll({
      where: { tmdbMovieId },
      include: [{
        model: WatchlistCategory,
        where: { userId: req.user.id }
      }]
    });

    if (watchlistItems.length === 0) {
      return res.json({ isInWatchlist: false });
    }

    // Return all categories containing this movie
    const categories = watchlistItems.map(item => ({
      id: item.WatchlistCategory.id,
      name: item.WatchlistCategory.name,
      watchlistItemId: item.id
    }));

    res.json({
      isInWatchlist: true,
      categories
    });
  } catch (error) {
    console.error('Error checking movie in watchlist:', error);
    res.status(500).json({ message: 'Failed to check movie in watchlist' });
  }
});

// Add movie to multiple watchlists at once
router.post('/add-to-watchlists', auth, async (req, res) => {
  const { tmdbMovieId, title, posterPath, categoryIds } = req.body;
  
  if (!tmdbMovieId || !title || !categoryIds || !Array.isArray(categoryIds)) {
    return res.status(400).json({ message: 'Movie details and category IDs array are required' });
  }

  const transaction = await sequelize.transaction();
  
  try {
    // Verify all categories belong to the user
    const categories = await WatchlistCategory.findAll({
      where: {
        id: { [Op.in]: categoryIds },
        userId: req.user.id
      },
      transaction
    });

    if (categories.length !== categoryIds.length) {
      await transaction.rollback();
      return res.status(403).json({ message: 'One or more watchlist categories not found or not authorized' });
    }

    // Add movie to each category if not already present
    const results = [];
    for (const category of categories) {
      const [item, created] = await WatchlistItem.findOrCreate({
        where: {
          categoryId: category.id,
          tmdbMovieId
        },
        defaults: {
          title,
          posterPath,
          sortOrder: await WatchlistItem.max('sortOrder', {
            where: { categoryId: category.id },
            transaction
          }) + 1 || 1
        },
        transaction
      });

      results.push({
        categoryId: category.id,
        watchlistItemId: item.id,
        created
      });
    }

    await transaction.commit();
    
    res.status(201).json({
      message: 'Movie added to selected watchlists',
      results
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Error adding movie to multiple watchlists:', error);
    res.status(500).json({ message: 'Failed to add movie to watchlists' });
  }
});

// Copy a movie between watchlists
router.post('/copy-movie', auth, async (req, res) => {
  const { sourceItemId, targetCategoryId } = req.body;
  
  if (!sourceItemId || !targetCategoryId) {
    return res.status(400).json({ message: 'Source item ID and target category ID are required' });
  }

  try {
    // Verify source item
    const sourceItem = await WatchlistItem.findOne({
      where: { id: sourceItemId },
      include: [{
        model: WatchlistCategory,
        where: { userId: req.user.id }
      }]
    });

    if (!sourceItem) {
      return res.status(404).json({ message: 'Source watchlist item not found or not authorized' });
    }

    // Verify target category
    const targetCategory = await WatchlistCategory.findOne({
      where: {
        id: targetCategoryId,
        userId: req.user.id
      }
    });

    if (!targetCategory) {
      return res.status(404).json({ message: 'Target watchlist category not found or not authorized' });
    }

    // Check if movie already exists in target category
    const existingItem = await WatchlistItem.findOne({
      where: {
        categoryId: targetCategoryId,
        tmdbMovieId: sourceItem.tmdbMovieId
      }
    });

    if (existingItem) {
      return res.status(409).json({ 
        message: 'Movie already exists in target watchlist',
        existingItem
      });
    }

    // Get the highest sort order in target category
    const maxSortOrder = await WatchlistItem.max('sortOrder', {
      where: { categoryId: targetCategoryId }
    }) || 0;

    // Create new watchlist item in target category
    const newItem = await WatchlistItem.create({
      categoryId: targetCategoryId,
      tmdbMovieId: sourceItem.tmdbMovieId,
      title: sourceItem.title,
      posterPath: sourceItem.posterPath,
      sortOrder: maxSortOrder + 1,
      userNote: sourceItem.userNote,
      userRating: sourceItem.userRating
    });

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error copying movie between watchlists:', error);
    res.status(500).json({ message: 'Failed to copy movie between watchlists' });
  }
});

// Get all user's liked watchlists
router.get('/likes', auth, async (req, res) => {
  try {
    const likes = await WatchlistLike.findAll({
      where: { userId: req.user.id },
      include: [{
        model: WatchlistCategory,
        include: [{
          model: User,
          attributes: ['id', 'username']
        }]
      }]
    });

    res.json(likes);
  } catch (error) {
    console.error('Error fetching liked watchlists:', error);
    res.status(500).json({ message: 'Failed to fetch liked watchlists' });
  }
});

// Get featured public watchlists for discovery page
router.get('/featured', async (req, res) => {
  try {
    const mostLiked = await WatchlistCategory.findAll({
      where: { 
        isPublic: true,
        likesCount: { [Op.gt]: 0 }
      },
      order: [['likesCount', 'DESC']],
      limit: 10,
      include: [
        {
          model: User,
          attributes: ['id', 'username']
        },
        {
          model: WatchlistItem,
          as: 'items',
          limit: 4,
          attributes: ['id', 'tmdbMovieId', 'posterPath', 'title']
        }
      ]
    });
    
    // Get the most recently created watchlists
    const newest = await WatchlistCategory.findAll({
      where: { isPublic: true },
      order: [['createdAt', 'DESC']],
      limit: 10,
      include: [
        {
          model: User,
          attributes: ['id', 'username']
        },
        {
          model: WatchlistItem,
          as: 'items',
          limit: 4,
          attributes: ['id', 'tmdbMovieId', 'posterPath', 'title']
        }
      ]
    });
    
    // Get watchlists with the most movies
    const mostPopulated = await WatchlistCategory.findAll({
      where: { isPublic: true },
      include: [
        {
          model: User,
          attributes: ['id', 'username']
        },
        {
          model: WatchlistItem,
          as: 'items',
          attributes: ['id']
        }
      ]
    });
    
    // Sort by number of items and take top 10
    const sortedByMovieCount = mostPopulated
      .map(category => ({
        ...category.get({ plain: true }),
        movieCount: category.items.length
      }))
      .sort((a, b) => b.movieCount - a.movieCount)
      .slice(0, 10)
      .map(category => ({
        ...category,
        items: category.items.slice(0, 4) // Limit to 4 posters
      }));
    
    res.json({
      mostLiked,
      newest,
      mostPopulated: sortedByMovieCount
    });
  } catch (error) {
    console.error('Error fetching featured watchlists:', error);
    res.status(500).json({ message: 'Failed to fetch featured watchlists' });
  }
});

// Get a user's public watchlists
router.get('/user/:userId/public', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const categories = await WatchlistCategory.findAll({
      where: { 
        userId,
        isPublic: true
      },
      order: [['createdAt', 'DESC']],
      include: [{
        model: WatchlistItem,
        as: 'items',
        attributes: ['id', 'posterPath'],
        limit: 4
      }]
    });
    
    // Get the username
    let username = null;
    if (categories.length > 0) {
      const user = await User.findByPk(userId, {
        attributes: ['username']
      });
      username = user.username;
    }

    res.json({
      username,
      watchlists: categories
    });
  } catch (error) {
    console.error('Error fetching user public watchlists:', error);
    res.status(500).json({ message: 'Failed to fetch user public watchlists' });
  }
});

router.get('/status/:tmdbMovieId', auth, async (req, res) => {
  try {
    const { tmdbMovieId } = req.params;
    
    if (!tmdbMovieId) {
      return res.status(400).json({ message: 'Movie ID is required' });
    }
    
    // Find all watchlist items for this movie across all user's watchlists
    const watchlistItems = await WatchlistItem.findAll({
      where: { tmdbMovieId: parseInt(tmdbMovieId) },
      include: [{
        model: WatchlistCategory,
        where: { userId: req.user.id },
        attributes: ['id', 'name']
      }]
    });
    
    // Check if movie is in any watchlist
    if (watchlistItems.length === 0) {
      return res.json({ 
        inWatchlist: false,
        watchlists: []
      });
    }
    
    // Get the default watchlist
    const { getDefaultWatchlist } = require('../utils/watchlistUtils');
    const defaultWatchlist = await getDefaultWatchlist(req.user.id);
    
    // Find if it's in the default watchlist
    const inDefaultWatchlist = watchlistItems.some(item => 
      item.WatchlistCategory.id === defaultWatchlist.id
    );
    
    // Format response with all watchlists containing this movie
    const watchlists = watchlistItems.map(item => ({
      watchlistId: item.WatchlistCategory.id,
      watchlistName: item.WatchlistCategory.name,
      itemId: item.id,
      isDefault: item.WatchlistCategory.id === defaultWatchlist.id
    }));
    
    res.json({
      inWatchlist: true,
      inDefaultWatchlist,
      watchlists
    });
  } catch (error) {
    console.error('Error checking watchlist status:', error);
    res.status(500).json({ message: 'Failed to check watchlist status' });
  }
});

router.post('/quick-add', auth, async (req, res) => {
  try {
    const { tmdbMovieId, title, posterPath } = req.body;
    
    if (!tmdbMovieId || !title) {
      return res.status(400).json({ message: 'Movie ID and title are required' });
    }

    const { addToDefaultWatchlist } = require('../utils/watchlistUtils');
    const result = await addToDefaultWatchlist(req.user.id, { tmdbMovieId, title, posterPath });
    
    if (result.alreadyExists) {
      return res.status(200).json({ 
        message: 'Movie already in watchlist',
        watchlistItem: result.item
      });
    }
    
    res.status(201).json({
      message: 'Added to "My Watchlist"',
      watchlistItem: result.item
    });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ message: 'Failed to add movie to watchlist' });
  }
});

// Get user's default watchlist
router.get('/default', auth, async (req, res) => {
  try {
    const { getDefaultWatchlist } = require('../utils/watchlistUtils');
    const defaultWatchlist = await getDefaultWatchlist(req.user.id);
    
    // Get the count of movies
    const WatchlistItem = require('../models').WatchlistItem;
    const count = await WatchlistItem.count({
      where: { categoryId: defaultWatchlist.id }
    });
    
    res.json({
      ...defaultWatchlist.get({ plain: true }),
      moviesCount: count
    });
  } catch (error) {
    console.error('Error fetching default watchlist:', error);
    res.status(500).json({ message: 'Failed to fetch default watchlist' });
  }
});

router.get('/check-movie/:tmdbMovieId', auth, async (req, res) => {
  const { tmdbMovieId } = req.params;
  
  try {
    // Get all user's watchlist categories
    const categories = await WatchlistCategory.findAll({
      where: { userId: req.user.id },
      attributes: ['id', 'name']
    });
    
    if (categories.length === 0) {
      return res.json({ isInWatchlist: false });
    }
    
    const categoryIds = categories.map(cat => cat.id);
    
    // Find any watchlist items matching this movie
    const watchlistItems = await WatchlistItem.findAll({
      where: { 
        tmdbMovieId: parseInt(tmdbMovieId),
        categoryId: { [Op.in]: categoryIds }
      },
      include: [{
        model: WatchlistCategory,
        attributes: ['id', 'name']
      }]
    });

    if (watchlistItems.length === 0) {
      return res.json({ isInWatchlist: false });
    }

    // Return all categories containing this movie
    const movieCategories = watchlistItems.map(item => ({
      id: item.WatchlistCategory.id,
      name: item.WatchlistCategory.name,
      watchlistItemId: item.id
    }));

    res.json({
      isInWatchlist: true,
      categories: movieCategories
    });
  } catch (error) {
    console.error('Error checking movie in watchlists:', error);
    res.status(500).json({ message: 'Failed to check movie in watchlists' });
  }
});

module.exports = router;