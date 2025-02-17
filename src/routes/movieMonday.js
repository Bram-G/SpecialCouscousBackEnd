const express = require('express');
const router = express.Router();
const { MovieMonday, MovieSelection, User, WatchLater } = require('../models'); 
const authMiddleware = require('../middleware/auth');
const { Op } = require('sequelize');

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { groupId, date, meal, dessert, drinks } = req.body;
    
    const movieMonday = await MovieMonday.create({
      groupId,
      date,
      pickerUserId: req.user.userId,
      meal,
      dessert,
      drinks
    });

    res.status(201).json(movieMonday);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/add-movie', authMiddleware, async (req, res) => {
  try {
    const { movieMondayId, movieId, isWinner } = req.body;
    
    const movieMonday = await MovieMonday.findByPk(movieMondayId);
    const movie = await Movie.findByPk(movieId);

    if (!movieMonday || !movie) {
      return res.status(404).json({ message: 'MovieMonday or Movie not found' });
    }

    await movieMonday.addMovie(movie, { through: { isWinner } });
    res.json({ message: 'Movie added to Movie Monday' });
  } catch (error) {
    res.status(400).json({ message: error.message });
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

router.get('/:date', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Special handling for watch-later route
    if (req.params.date === 'watch-later') {
      return res.status(400).json({ message: 'Invalid route' });
    }

    const dateStr = decodeURIComponent(req.params.date);
    console.log('Received date string:', dateStr); // Debug log
    
    const date = new Date(dateStr);
    console.log('Parsed date:', date); // Debug log
    
    if (isNaN(date.getTime())) {
      console.log('Invalid date received:', dateStr);
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Set time to start of day to avoid timezone issues
    date.setHours(0, 0, 0, 0);

    const movieMonday = await MovieMonday.findOne({
      where: { 
        date: date
      },
      include: [
        {
          model: MovieSelection,
          as: 'movieSelections',
          required: false // Make this an outer join
        },
        {
          model: User,
          as: 'picker',
          attributes: ['id', 'username'],
          required: false // Make this an outer join
        }
      ]
    });

    // If no movie monday exists for this date
    if (!movieMonday) {
      return res.json({
        date: date.toISOString(),
        status: 'not_created',
        movieSelections: []
      });
    }

    res.json(movieMonday);
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
    const movieMonday = await MovieMonday.findByPk(req.params.id, {
      include: [
        {
          model: MovieSelection
        }
      ]
    });

    if (!movieMonday) {
      return res.status(404).json({ message: 'Movie Monday not found' });
    }

    // Verify movie selection exists and belongs to this movie monday
    const movieSelection = movieMonday.MovieSelections.find(
      ms => ms.id === movieSelectionId
    );

    if (!movieSelection) {
      return res.status(404).json({ message: 'Movie selection not found' });
    }

    // Reset all winners
    await MovieSelection.update(
      { isWinner: false },
      { where: { movieMondayId: movieMonday.id } }
    );

    // Set new winner
    await MovieSelection.update(
      { isWinner: true },
      { where: { id: movieSelectionId } }
    );

    // Update movie monday status
    movieMonday.status = 'completed';
    await movieMonday.save();

    res.json({ message: 'Winner set successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


module.exports = router;
