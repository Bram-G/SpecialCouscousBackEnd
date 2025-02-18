const express = require('express');
const router = express.Router();
const { MovieMonday, MovieSelection, User, WatchLater,sequelize } = require('../models'); 
const authMiddleware = require('../middleware/auth');
const { Op } = require('sequelize');

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { date, groupId } = req.body;

    if (!req.userGroups.some(group => group.id === parseInt(groupId))) {
      return res.status(403).json({ message: 'Not authorized to create MovieMonday for this group' });
    }

    if (!date || !groupId) {
      return res.status(400).json({ 
        message: 'Date and groupId are required',
        receivedData: { date, groupId } // For debugging
      });
    }

    console.log('Creating MovieMonday with:', {
      date,
      groupId,
      pickerUserId: req.user.id
    });

    // Create new MovieMonday
    const movieMonday = await MovieMonday.create({
      date: new Date(date),
      pickerUserId: req.user.id,
      GroupId: groupId, // Note the capital G to match the model
      status: 'pending'
    });

    // Fetch the complete data to return
    const createdMonday = await MovieMonday.findOne({
      where: { id: movieMonday.id }
    });

    // Fetch related data
    const [movieSelections, picker] = await Promise.all([
      MovieSelection.findAll({
        where: { movieMondayId: movieMonday.id }
      }),
      User.findOne({
        where: { id: movieMonday.pickerUserId },
        attributes: ['id', 'username']
      })
    ]);

    // Construct the response
    const response = {
      ...createdMonday.toJSON(),
      movieSelections: movieSelections || [],
      picker: picker || null
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating movie monday:', error);
    res.status(400).json({ message: error.message });
  }
});

router.post('/add-movie', authMiddleware, async (req, res) => {
  try {
    const { movieMondayId, tmdbMovieId, title, posterPath } = req.body;

    if (!movieMondayId || !tmdbMovieId) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        details: { movieMondayId, tmdbMovieId }
      });
    }

    // Find the MovieMonday
    const movieMonday = await MovieMonday.findOne({
      where: { id: movieMondayId },
      include: [{
        model: MovieSelection,
        as: 'movieSelections'
      }]
    });

    if (!movieMonday) {
      return res.status(404).json({ message: 'Movie Monday not found' });
    }

    // Check if already has 3 movies
    if (movieMonday.movieSelections.length >= 3) {
      return res.status(400).json({ message: 'Movie Monday already has maximum number of movies' });
    }

    // Check if movie is already added
    const existingMovie = movieMonday.movieSelections.find(
      ms => ms.tmdbMovieId === parseInt(tmdbMovieId)
    );
    if (existingMovie) {
      return res.status(400).json({ message: 'Movie already added to this Movie Monday' });
    }

    // Add movie selection
    const movieSelection = await MovieSelection.create({
      movieMondayId,
      tmdbMovieId: parseInt(tmdbMovieId),
      title,
      posterPath,
      isWinner: false
    });

    // Update movie monday status if needed
    if (movieMonday.movieSelections.length + 1 === 3) {
      movieMonday.status = 'in-progress';
      await movieMonday.save();
    }

    res.status(201).json({ 
      message: 'Movie added successfully',
      movieSelection
    });
  } catch (error) {
    console.error('Error adding movie:', error);
    res.status(500).json({ 
      message: 'Failed to add movie',
      error: error.message 
    });
  }
});

router.put('/update-picker', authMiddleware, async (req, res) => {
  try {
    const { date, pickerId } = req.body;
    
    const movieMonday = await MovieMonday.findOne({
      where: {
        date: new Date(date)
      }
    });

    if (!movieMonday) {
      return res.status(404).json({ message: 'Movie Monday not found' });
    }

    movieMonday.pickerUserId = pickerId;
    await movieMonday.save();

    res.json(movieMonday);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


// Get user's watch later list
router.get('/watch-later', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const watchLaterMovies = await WatchLater.findAll({
      where: { userId: req.user.id },
      raw: true
    });

    res.json(watchLaterMovies);
  } catch (error) {
    console.error('Error fetching watch later list:', error);
    res.status(500).json({ message: error.message });
  }
});
// Add to watch later list
router.post('/watch-later', authMiddleware, async (req, res) => {
  try {
    const { tmdbMovieId, title, posterPath } = req.body;
    console.log('Adding to watch later:', { tmdbMovieId, title, posterPath, userId: req.user.id }); // Debug log

    // Validate required fields
    if (!tmdbMovieId || !title) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [watchLaterMovie] = await WatchLater.findOrCreate({
      where: {
        userId: req.user.id,
        tmdbMovieId: parseInt(tmdbMovieId)
      },
      defaults: {
        title,
        posterPath,
        userId: req.user.id
      }
    });

    res.status(201).json(watchLaterMovie);
  } catch (error) {
    console.error('Error adding to watch later:', error);
    res.status(500).json({ message: error.message });
  }
});

// Check if movie is in watch later list
router.get('/watch-later/status/:tmdbMovieId', authMiddleware, async (req, res) => {
  try {
    console.log('Checking status for:', { 
      tmdbMovieId: req.params.tmdbMovieId, 
      userId: req.user.id 
    }); // Debug log
    
    const watchLaterMovie = await WatchLater.findOne({
      where: {
        userId: req.user.id,
        tmdbMovieId: parseInt(req.params.tmdbMovieId)
      }
    });

    console.log('Watch later status result:', watchLaterMovie); // Debug log

    res.json({
      isInWatchLater: !!watchLaterMovie
    });
  } catch (error) {
    console.error('Error checking watch later status:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/available', authMiddleware, async (req, res) => {
  try {
    const userGroupIds = req.userGroups.map(group => group.id);

    if (userGroupIds.length === 0) {
      return res.json([]);
    }

    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: userGroupIds,
        status: ['pending', 'in-progress']
      },
      include: [
        {
          model: MovieSelection,
          as: 'movieSelections',  // Add this alias
          attributes: ['id', 'tmdbMovieId', 'title']
        },
        {
          model: User,
          as: 'picker',
          attributes: ['id', 'username']
        }
      ]
    });

    res.json(movieMondays);
  } catch (error) {
    console.error('Error fetching available movie mondays:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/:date', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (req.params.date === 'watch-later') {
      return res.status(400).json({ message: 'Invalid route' });
    }

    // Get the user's group IDs
    const userGroupIds = req.userGroups.map(group => group.id);

    if (userGroupIds.length === 0) {
      return res.json({
        date: req.params.date,
        status: 'not_created',
        movieSelections: []
      });
    }

    const dateStr = decodeURIComponent(req.params.date);
    const searchDate = new Date(dateStr);
    
    if (isNaN(searchDate.getTime())) {
      console.log('Invalid date received:', dateStr);
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Find MovieMonday where the date matches ignoring time AND group matches
    const movieMonday = await MovieMonday.findOne({
      where: {
        [Op.and]: [
          sequelize.where(
            sequelize.fn('DATE', sequelize.col('date')),
            sequelize.fn('DATE', searchDate)
          ),
          { GroupId: userGroupIds }
        ]
      }
    });

    // If no movie monday exists for this date
    if (!movieMonday) {
      console.log('No MovieMonday found for date:', dateStr);
      return res.json({
        date: dateStr,
        status: 'not_created',
        movieSelections: []
      });
    }

    // If we found a MovieMonday, fetch the related data separately
    const [movieSelections, picker] = await Promise.all([
      MovieSelection.findAll({
        where: { movieMondayId: movieMonday.id }
      }),
      User.findOne({
        where: { id: movieMonday.pickerUserId },
        attributes: ['id', 'username']
      })
    ]);

    // Construct the response
    const response = {
      ...movieMonday.toJSON(),
      movieSelections: movieSelections || [],
      picker: picker || null
    };

    res.json(response);
  } catch (error) {
    console.error('Error in GET /:date route:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { date, groupId } = req.body;

    if (!date || !groupId) {
      return res.status(400).json({ message: 'Date and groupId are required' });
    }

    // Check if MovieMonday already exists for this date
    const existingMonday = await MovieMonday.findOne({
      where: { date: new Date(date) }
    });

    if (existingMonday) {
      return res.status(409).json({ message: 'MovieMonday already exists for this date' });
    }

    // Create new MovieMonday
    const movieMonday = await MovieMonday.create({
      date: new Date(date),
      pickerUserId: req.user.id,
      status: 'pending',
      GroupId: groupId
    });

    const createdMonday = await MovieMonday.findOne({
      where: { id: movieMonday.id },
      include: [{
        model: MovieSelection,
        as: 'movieSelections'
      }, {
        model: User,
        as: 'picker',
        attributes: ['id', 'username']
      }]
    });

    res.status(201).json(createdMonday);
  } catch (error) {
    console.error('Error creating movie monday:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get movie mondays for multiple dates
router.post('/dates', authMiddleware, async (req, res) => {
  try {
    const { dates } = req.body;
    const movieMondays = await MovieMonday.findAll({
      where: {
        date: {
          [Op.in]: dates.map(d => new Date(d))
        }
      },
      include: [
        {
          model: MovieSelection,
          attributes: ['id', 'tmdbMovieId', 'title', 'posterPath', 'isWinner']
        },
        {
          model: User,
          as: 'picker',
          attributes: ['id', 'username']
        }
      ]
    });

    res.json(movieMondays);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add movie to movie monday
router.post('/add-movie', authMiddleware, async (req, res) => {
  try {
    const { date, tmdbMovieId } = req.body;

    // Find or create MovieMonday for the date
    let [movieMonday] = await MovieMonday.findOrCreate({
      where: { date: new Date(date) },
      defaults: {
        pickerUserId: req.user.id,
        status: 'pending'
      }
    });

    // Verify user is the picker
    if (movieMonday.pickerUserId !== req.user.id) {
      return res.status(403).json({ message: 'Only the assigned picker can add movies' });
    }

    // Check if already has 3 movies
    const movieCount = await MovieSelection.count({
      where: { movieMondayId: movieMonday.id }
    });

    if (movieCount >= 3) {
      return res.status(400).json({ message: 'Already has maximum number of movies' });
    }

    // Fetch movie details from watch later
    const watchLaterMovie = await WatchLater.findOne({
      where: {
        userId: req.user.id,
        tmdbMovieId
      }
    });

    if (!watchLaterMovie) {
      return res.status(404).json({ message: 'Movie not found in watch later list' });
    }

    // Add movie selection
    const movieSelection = await MovieSelection.create({
      movieMondayId: movieMonday.id,
      tmdbMovieId,
      title: watchLaterMovie.title,
      posterPath: watchLaterMovie.posterPath
    });

    // Update movie monday status
    if (movieCount + 1 === 3) {
      movieMonday.status = 'in-progress';
      await movieMonday.save();
    }

    res.json({ 
      message: 'Movie added successfully',
      movieSelection
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});



// Set winning movie
router.post('/:id/set-winner', authMiddleware, async (req, res) => {
  try {
    const { movieSelectionId } = req.body;
    const userGroupIds = req.userGroups.map(group => group.id);

    if (userGroupIds.length === 0) {
      return res.status(403).json({ message: 'User not in any groups' });
    }

    // Find MovieMonday and verify it belongs to user's group
    const movieMonday = await MovieMonday.findOne({
      where: {
        id: req.params.id,
        GroupId: userGroupIds
      },
      include: [
        {
          model: MovieSelection
        }
      ]
    });

    if (!movieMonday) {
      return res.status(404).json({ 
        message: 'Movie Monday not found or you do not have access to it' 
      });
    }

    // Verify user is the picker
    if (movieMonday.pickerUserId !== req.user.id) {
      return res.status(403).json({ 
        message: 'Only the assigned picker can set the winner' 
      });
    }

    // Verify movie selection exists and belongs to this movie monday
    const movieSelection = movieMonday.MovieSelections.find(
      ms => ms.id === movieSelectionId
    );

    if (!movieSelection) {
      return res.status(404).json({ message: 'Movie selection not found' });
    }

    // Use transaction to ensure data consistency
    await sequelize.transaction(async (t) => {
      // Reset all winners for this movie monday
      await MovieSelection.update(
        { isWinner: false },
        { 
          where: { movieMondayId: movieMonday.id },
          transaction: t
        }
      );

      // Set new winner
      await MovieSelection.update(
        { isWinner: true },
        { 
          where: { 
            id: movieSelectionId,
            movieMondayId: movieMonday.id // Extra safety check
          },
          transaction: t
        }
      );

      // Update movie monday status
      movieMonday.status = 'completed';
      await movieMonday.save({ transaction: t });
    });

    res.json({ 
      message: 'Winner set successfully',
      movieMondayId: movieMonday.id,
      winningMovieId: movieSelectionId
    });
  } catch (error) {
    console.error('Error setting winner:', error);
    res.status(500).json({ 
      message: 'Failed to set winner',
      error: error.message 
    });
  }
});


module.exports = router;
