const express = require("express");
const router = express.Router();
const {
  MovieMonday,
  MovieSelection,
  User,
  WatchLater,
  MovieMondayEventDetails, // Add this import
  sequelize,
} = require("../models");
const authMiddleware = require("../middleware/auth");
const { Op } = require("sequelize");

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { date, groupId } = req.body;

    if (!req.userGroups.some((group) => group.id === parseInt(groupId))) {
      return res.status(403).json({
        message: "Not authorized to create MovieMonday for this group",
      });
    }

    if (!date || !groupId) {
      return res.status(400).json({
        message: "Date and groupId are required",
        receivedData: { date, groupId },
      });
    }

    console.log("Received date:", date); // Log the received date

    // Check for existing MovieMonday on this date for this group
    const existingMonday = await MovieMonday.findOne({
      where: {
        [Op.and]: [
          sequelize.where(
            sequelize.fn("DATE", sequelize.col("date")),
            date // Use the received date string directly
          ),
          { GroupId: groupId },
        ],
      },
    });

    if (existingMonday) {
      return res.status(409).json({
        message: "MovieMonday already exists for this date and group",
      });
    }

    // Create new MovieMonday using the exact date string received
    const movieMonday = await MovieMonday.create({
      date: date, // Use the date string directly
      pickerUserId: req.user.id,
      GroupId: groupId,
      status: "pending",
    });

    // Fetch the complete data to return
    const createdMonday = await MovieMonday.findOne({
      where: { id: movieMonday.id },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
        },
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
      ],
    });

    res.status(201).json(createdMonday);
  } catch (error) {
    console.error("Error creating movie monday:", error);
    res.status(500).json({
      message: "Failed to create MovieMonday",
      error: error.message,
    });
  }
});

router.post("/add-movie", authMiddleware, async (req, res) => {
  try {
    const { movieMondayId, tmdbMovieId, title, posterPath } = req.body;

    if (!movieMondayId || !tmdbMovieId) {
      return res.status(400).json({
        message: "Missing required fields",
        details: { movieMondayId, tmdbMovieId },
      });
    }

    // Find the MovieMonday
    const movieMonday = await MovieMonday.findOne({
      where: { id: movieMondayId },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
        },
      ],
    });

    if (!movieMonday) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    // Check if already has 3 movies
    if (movieMonday.movieSelections.length >= 3) {
      return res
        .status(400)
        .json({ message: "Movie Monday already has maximum number of movies" });
    }

    // Check if movie is already added
    const existingMovie = movieMonday.movieSelections.find(
      (ms) => ms.tmdbMovieId === parseInt(tmdbMovieId)
    );
    if (existingMovie) {
      return res
        .status(400)
        .json({ message: "Movie already added to this Movie Monday" });
    }

    // Add movie selection
    const movieSelection = await MovieSelection.create({
      movieMondayId,
      tmdbMovieId: parseInt(tmdbMovieId),
      title,
      posterPath,
      isWinner: false,
    });

    // Update movie monday status if needed
    if (movieMonday.movieSelections.length + 1 === 3) {
      movieMonday.status = "in-progress";
      await movieMonday.save();
    }

    res.status(201).json({
      message: "Movie added successfully",
      movieSelection,
    });
  } catch (error) {
    console.error("Error adding movie:", error);
    res.status(500).json({
      message: "Failed to add movie",
      error: error.message,
    });
  }
});

router.put("/update-picker", authMiddleware, async (req, res) => {
  try {
    const { movieMondayId, pickerUserId } = req.body;

    const movieMonday = await MovieMonday.findOne({
      where: { id: movieMondayId },
    });

    if (!movieMonday) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    movieMonday.pickerUserId = pickerUserId;
    await movieMonday.save();

    // Fetch updated data with picker info
    const updatedMovieMonday = await MovieMonday.findOne({
      where: { id: movieMondayId },
      include: [
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
      ],
    });

    res.json(updatedMovieMonday);
  } catch (error) {
    console.error("Error updating picker:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get user's watch later list
router.get("/watch-later", authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const watchLaterMovies = await WatchLater.findAll({
      where: { userId: req.user.id },
      raw: true,
    });

    res.json(watchLaterMovies);
  } catch (error) {
    console.error("Error fetching watch later list:", error);
    res.status(500).json({ message: error.message });
  }
});
// Add to watch later list
router.post("/watch-later", authMiddleware, async (req, res) => {
  try {
    const { tmdbMovieId, title, posterPath } = req.body;
    console.log("Adding to watch later:", {
      tmdbMovieId,
      title,
      posterPath,
      userId: req.user.id,
    }); // Debug log

    // Validate required fields
    if (!tmdbMovieId || !title) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const [watchLaterMovie] = await WatchLater.findOrCreate({
      where: {
        userId: req.user.id,
        tmdbMovieId: parseInt(tmdbMovieId),
      },
      defaults: {
        title,
        posterPath,
        userId: req.user.id,
      },
    });

    res.status(201).json(watchLaterMovie);
  } catch (error) {
    console.error("Error adding to watch later:", error);
    res.status(500).json({ message: error.message });
  }
});

// Check if movie is in watch later list
router.get(
  "/watch-later/status/:tmdbMovieId",
  authMiddleware,
  async (req, res) => {
    try {
      console.log("Checking status for:", {
        tmdbMovieId: req.params.tmdbMovieId,
        userId: req.user.id,
      }); // Debug log

      const watchLaterMovie = await WatchLater.findOne({
        where: {
          userId: req.user.id,
          tmdbMovieId: parseInt(req.params.tmdbMovieId),
        },
      });

      console.log("Watch later status result:", watchLaterMovie); // Debug log

      res.json({
        isInWatchLater: !!watchLaterMovie,
      });
    } catch (error) {
      console.error("Error checking watch later status:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

router.get("/available", authMiddleware, async (req, res) => {
  try {
    const userGroupIds = req.userGroups.map((group) => group.id);

    if (userGroupIds.length === 0) {
      return res.json([]);
    }

    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: userGroupIds,
        status: ["pending", "in-progress"],
      },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections", // Add this alias
          attributes: ["id", "tmdbMovieId", "title"],
        },
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
      ],
    });

    res.json(movieMondays);
  } catch (error) {
    console.error("Error fetching available movie mondays:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/:date', authMiddleware, async (req, res) => {
  try {
    const dateStr = decodeURIComponent(req.params.date);
    console.log('Searching for MovieMonday:', {
      dateStr,
      userGroups: req.userGroups,
      userId: req.user.id
    });

    // Get group IDs from req.userGroups
    const userGroupIds = req.userGroups.map(group => group.id);
    
    if (!userGroupIds.length) {
      return res.json({
        date: dateStr,
        status: 'not_created',
        movieSelections: []
      });
    }

    // Use direct equality for DATEONLY column
    const movieMonday = await MovieMonday.findOne({
      where: {
        GroupId: userGroupIds,
        date: dateStr // Direct comparison since column is DATEONLY
      },
      include: [
        {
          model: MovieSelection,
          as: 'movieSelections'
        },
        {
          model: User,
          as: 'picker',
          attributes: ['id', 'username']
        },
        {
          model: MovieMondayEventDetails,
          as: 'eventDetails'
        }
      ]
    });

    console.log('Query result:', {
      found: !!movieMonday,
      data: movieMonday ? {
        id: movieMonday.id,
        date: movieMonday.date,
        status: movieMonday.status,
        GroupId: movieMonday.GroupId
      } : null
    });

    if (!movieMonday) {
      return res.json({
        date: dateStr,
        status: 'not_created',
        movieSelections: []
      });
    }

    res.json(movieMonday);
  } catch (error) {
    console.error('Error in GET /:date route:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { date, groupId } = req.body;
    
    console.log('Creating MovieMonday:', {
      date,
      groupId,
      userId: req.user.id
    });

    if (!date || !groupId) {
      return res.status(400).json({ message: 'Date and groupId are required' });
    }

    // For DATEONLY, we just need YYYY-MM-DD
    const dateStr = date.split('T')[0];

    // Check if MovieMonday already exists
    const existing = await MovieMonday.findOne({
      where: {
        date: dateStr,
        GroupId: groupId
      }
    });

    if (existing) {
      return res.status(409).json({ message: 'MovieMonday already exists for this date and group' });
    }

    // Create new MovieMonday
    const movieMonday = await MovieMonday.create({
      date: dateStr,
      pickerUserId: req.user.id,
      GroupId: groupId,
      status: 'pending'
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
router.post("/dates", authMiddleware, async (req, res) => {
  try {
    const { dates } = req.body;
    const movieMondays = await MovieMonday.findAll({
      where: {
        date: {
          [Op.in]: dates.map((d) => new Date(d)),
        },
      },
      include: [
        {
          model: MovieSelection,
          attributes: ["id", "tmdbMovieId", "title", "posterPath", "isWinner"],
        },
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
      ],
    });

    res.json(movieMondays);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add movie to movie monday
router.post("/add-movie", authMiddleware, async (req, res) => {
  try {
    const { date, tmdbMovieId } = req.body;

    // Find or create MovieMonday for the date
    let [movieMonday] = await MovieMonday.findOrCreate({
      where: { date: new Date(date) },
      defaults: {
        pickerUserId: req.user.id,
        status: "pending",
      },
    });

    // Verify user is the picker
    if (movieMonday.pickerUserId !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Only the assigned picker can add movies" });
    }

    // Check if already has 3 movies
    const movieCount = await MovieSelection.count({
      where: { movieMondayId: movieMonday.id },
    });

    if (movieCount >= 3) {
      return res
        .status(400)
        .json({ message: "Already has maximum number of movies" });
    }

    // Fetch movie details from watch later
    const watchLaterMovie = await WatchLater.findOne({
      where: {
        userId: req.user.id,
        tmdbMovieId,
      },
    });

    if (!watchLaterMovie) {
      return res
        .status(404)
        .json({ message: "Movie not found in watch later list" });
    }

    // Add movie selection
    const movieSelection = await MovieSelection.create({
      movieMondayId: movieMonday.id,
      tmdbMovieId,
      title: watchLaterMovie.title,
      posterPath: watchLaterMovie.posterPath,
    });

    // Update movie monday status
    if (movieCount + 1 === 3) {
      movieMonday.status = "in-progress";
      await movieMonday.save();
    }

    res.json({
      message: "Movie added successfully",
      movieSelection,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/:id/set-winner", authMiddleware, async (req, res) => {
  try {
    const { movieSelectionId } = req.body;
    const userGroupIds = req.userGroups.map((group) => group.id);

    if (userGroupIds.length === 0) {
      return res.status(403).json({ message: "User not in any groups" });
    }

    // Find MovieMonday and verify it belongs to user's group
    const movieMonday = await MovieMonday.findOne({
      where: {
        id: req.params.id,
        GroupId: userGroupIds,
      },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
        },
      ],
    });

    if (!movieMonday) {
      return res.status(404).json({
        message: "Movie Monday not found or you do not have access to it",
      });
    }

    const movieSelection = movieMonday.movieSelections.find(
      (ms) => ms.id === movieSelectionId
    );

    if (!movieSelection) {
      return res.status(404).json({ message: "Movie selection not found" });
    }

    await sequelize.transaction(async (t) => {
      // If this movie is already the winner, we're removing winner status
      if (movieSelection.isWinner) {
        await MovieSelection.update(
          { isWinner: false },
          {
            where: { id: movieSelectionId },
            transaction: t,
          }
        );
        movieMonday.status = "in-progress";
      } else {
        // Setting new winner
        await MovieSelection.update(
          { isWinner: false },
          {
            where: { movieMondayId: movieMonday.id },
            transaction: t,
          }
        );
        await MovieSelection.update(
          { isWinner: true },
          {
            where: { id: movieSelectionId },
            transaction: t,
          }
        );
        movieMonday.status = "completed";
      }
      await movieMonday.save({ transaction: t });
    });

    res.json({
      message: "Winner status updated successfully",
      movieMondayId: movieMonday.id,
      winningMovieId: movieSelection.isWinner ? null : movieSelectionId,
    });
  } catch (error) {
    console.error("Error updating winner:", error);
    res.status(500).json({ message: "Failed to update winner" });
  }
});

router.delete('/:movieMondayId/movies/:movieSelectionId', authMiddleware, async (req, res) => {
  try {
    const { movieMondayId, movieSelectionId } = req.params;
    
    // Verify the movie monday exists and user has access to it
    const movieMonday = await MovieMonday.findOne({
      where: {
        id: movieMondayId,
        GroupId: req.userGroups.map(group => group.id)
      },
      include: [{
        model: MovieSelection,
        as: 'movieSelections'
      }]
    });

    if (!movieMonday) {
      return res.status(404).json({ 
        message: 'Movie Monday not found or you do not have access to it' 
      });
    }

    // Find the movie selection
    const movieSelection = await MovieSelection.findOne({
      where: {
        id: movieSelectionId,
        movieMondayId
      }
    });

    if (!movieSelection) {
      return res.status(404).json({ message: 'Movie selection not found' });
    }

    // If this was the winner, we need to update the MovieMonday status
    const wasWinner = movieSelection.isWinner;

    // Delete the movie selection
    await movieSelection.destroy();

    // If this was the winner or it was the last movie, update the MovieMonday status
    if (wasWinner || movieMonday.movieSelections.length <= 1) {
      movieMonday.status = 'pending';
      await movieMonday.save();
    }

    res.json({ 
      message: 'Movie selection removed successfully',
      movieMondayId,
      removedMovieId: movieSelectionId
    });

  } catch (error) {
    console.error('Error removing movie selection:', error);
    res.status(500).json({ 
      message: 'Failed to remove movie selection',
      error: error.message 
    });
  }
});

router.post("/:id/event-details", authMiddleware, async (req, res) => {
  try {
    const { meals, cocktails, notes } = req.body;
    const movieMondayId = req.params.id;

    // Verify user has access to this MovieMonday
    const userGroupIds = req.userGroups.map((group) => group.id);
    const movieMonday = await MovieMonday.findOne({
      where: {
        id: movieMondayId,
        GroupId: userGroupIds,
      },
    });

    if (!movieMonday) {
      return res.status(404).json({
        message: "Movie Monday not found or you do not have access to it",
      });
    }

    // Process cocktails input
    let processedCocktails = cocktails;
    if (typeof cocktails === "string") {
      processedCocktails = cocktails
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    }

    // Update or create event details
    const [eventDetails, created] = await MovieMondayEventDetails.findOrCreate({
      where: { movieMondayId },
      defaults: {
        meals,
        cocktails: processedCocktails,
        notes,
      },
    });

    if (!created) {
      await eventDetails.update({
        meals,
        cocktails: processedCocktails,
        notes,
      });
    }

    res.json(eventDetails);
  } catch (error) {
    console.error("Error updating event details:", error);
    res.status(500).json({ message: "Failed to update event details" });
  }
});

module.exports = router;
