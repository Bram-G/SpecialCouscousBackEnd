// src/utils/watchlistUtils.js
const { WatchlistCategory } = require('../models');

/**
 * Get or create a user's default watchlist
 * 
 * @param {number} userId - The user's ID
 * @returns {Promise<Object>} - The default watchlist
 */
async function getDefaultWatchlist(userId) {
  try {
    // First try to find the default watchlist (which should have been created during registration)
    let defaultWatchlist = await WatchlistCategory.findOne({
      where: {
        userId,
        name: 'My Watchlist'
      }
    });
    
    // If not found (for whatever reason), create it
    if (!defaultWatchlist) {
      defaultWatchlist = await WatchlistCategory.create({
        name: 'My Watchlist',
        description: 'Your default watchlist for saved movies',
        userId,
        isPublic: false
      });
    }
    
    return defaultWatchlist;
  } catch (error) {
    console.error('Error getting default watchlist:', error);
    throw error;
  }
}

/**
 * Add a movie to the default watchlist
 * 
 * @param {number} userId - The user's ID
 * @param {Object} movieData - The movie data to add
 * @returns {Promise<Object>} - The created watchlist item
 */
async function addToDefaultWatchlist(userId, movieData) {
  try {
    const { tmdbMovieId, title, posterPath } = movieData;
    
    // Get the default watchlist
    const defaultWatchlist = await getDefaultWatchlist(userId);
    
    // Add the movie to the watchlist
    const WatchlistItem = require('../models').WatchlistItem;
    
    // Check if movie is already in the watchlist
    const existingItem = await WatchlistItem.findOne({
      where: {
        categoryId: defaultWatchlist.id,
        tmdbMovieId
      }
    });
    
    if (existingItem) {
      return { alreadyExists: true, item: existingItem };
    }
    
    // Get highest sort order
    const maxSortOrder = await WatchlistItem.max('sortOrder', {
      where: { categoryId: defaultWatchlist.id }
    }) || 0;
    
    // Create the new item
    const newItem = await WatchlistItem.create({
      categoryId: defaultWatchlist.id,
      tmdbMovieId,
      title,
      posterPath,
      sortOrder: maxSortOrder + 1
    });
    
    return { created: true, item: newItem };
  } catch (error) {
    console.error('Error adding to default watchlist:', error);
    throw error;
  }
}

module.exports = {
  getDefaultWatchlist,
  addToDefaultWatchlist
};