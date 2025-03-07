const express = require("express");
const router = express.Router();
const {
  MovieMonday,
  MovieSelection,
  User,
  WatchLater,
  MovieMondayEventDetails,
  MovieCast,
  MovieCrew,
  sequelize,
} = require("../models");
const authMiddleware = require("../middleware/auth");
const { Op } = require("sequelize");
console.log("TMDB API Key available:", !!process.env.TMDB_API_KEY);
// Don't log the actual key for security reasons

router.get("/cocktails", authMiddleware, async (req, res) => {
  try {
    const userGroupIds = req.userGroups.map((group) => group.id);
    
    // Find all movie mondays associated with user's groups
    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: userGroupIds
      },
      include: [{
        model: MovieMondayEventDetails,
        as: "eventDetails"
      }]
    });
    
    // Collect all unique cocktails
    const allCocktails = new Set();
    
    movieMondays.forEach(mm => {
      if (mm.eventDetails && mm.eventDetails.cocktails) {
        // Handle both array and string formats
        let cocktailsList = mm.eventDetails.cocktails;
        
        // If it's a string, split it into an array
        if (typeof cocktailsList === 'string') {
          cocktailsList = cocktailsList.split(',').map(c => c.trim()).filter(Boolean);
        }
        
        // Add each cocktail to the set
        if (Array.isArray(cocktailsList)) {
          cocktailsList.forEach(cocktail => {
            if (cocktail && cocktail.trim()) {
              allCocktails.add(cocktail.trim());
            }
          });
        }
      }
    });
    
    // Sort alphabetically
    const sortedCocktails = Array.from(allCocktails).sort();
    
    // Log the result for debugging
    console.log(`Found ${sortedCocktails.length} unique cocktails`);
    
    res.json(sortedCocktails);
  } catch (error) {
    console.error("Error fetching cocktails:", error);
    res.status(500).json({ message: "Failed to fetch cocktails" });
  }
});

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
    console.log("Add movie request received:", {
      body: req.body,
      user: req.user.id,
      groupIds: req.userGroups.map((g) => g.id),
    });

    const { movieMondayId, tmdbMovieId, title, posterPath } = req.body;

    // Log each step
    console.log("Step 1: Validating input");
    if (!movieMondayId || !tmdbMovieId) {
      return res.status(400).json({
        message: "Missing required fields",
        details: { movieMondayId, tmdbMovieId },
      });
    }

    console.log("Step 2: Finding MovieMonday");
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

    console.log("MovieMonday found:", !!movieMonday);
    if (!movieMonday) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    console.log("Step 3: Checking movie count");
    // Check if already has 3 movies
    if (movieMonday.movieSelections.length >= 3) {
      return res.status(400).json({
        message: "Movie Monday already has maximum number of movies",
      });
    }

    console.log("Step 4: Checking for duplicate movie");
    // Check if movie is already added
    const existingMovie = movieMonday.movieSelections.find(
      (ms) => ms.tmdbMovieId === parseInt(tmdbMovieId)
    );
    if (existingMovie) {
      return res.status(400).json({
        message: "Movie already added to this Movie Monday",
      });
    }

    console.log("Step 5: Creating movie selection");
    // Add movie with basic info first
    const movieSelection = await MovieSelection.create({
      movieMondayId,
      tmdbMovieId: parseInt(tmdbMovieId),
      title,
      posterPath,
      isWinner: false,
      genres: [],
      releaseYear: null,
    });

    console.log("Movie selection created:", movieSelection.id);

    // Try fetching TMDB data but don't block if it fails
    try {
      console.log("Step 6: Fetching TMDB data");
      const tmdbResponse = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbMovieId}?append_to_response=credits&api_key=${process.env.TMDB_API_KEY}`
      );

      if (tmdbResponse.ok) {
        console.log("TMDB data fetched successfully");
        const tmdbData = await tmdbResponse.json();

        // Extract and update genres
        const genres = tmdbData.genres
          ? tmdbData.genres.map((g) => g.name)
          : [];
        const releaseYear = tmdbData.release_date
          ? parseInt(tmdbData.release_date.split("-")[0])
          : null;

        // Update the movie with additional data
        await movieSelection.update({
          genres,
          releaseYear,
        });

        console.log("Updated movie with TMDB data");

        // Process cast if available
        if (tmdbData.credits && tmdbData.credits.cast) {
          console.log("Step 7: Processing cast");
          const topCast = tmdbData.credits.cast.slice(0, 10);

          for (const actor of topCast) {
            await MovieCast.create({
              movieSelectionId: movieSelection.id,
              actorId: actor.id,
              name: actor.name,
              character: actor.character || null,
              profilePath: actor.profile_path || null,
              order: actor.order || null,
            });
          }
          console.log(`Added ${topCast.length} cast members`);
        }

        // Updated code for src/routes/movieMonday.js
        // Modify the movie-adding process to limit crew roles

        // Process crew if available
        if (tmdbData.credits && tmdbData.credits.crew) {
          console.log("Step 8: Processing crew");
          // Only track Directors, Writers, and Screenplay - omit Producer
          const importantJobs = ["Director", "Screenplay", "Writer"];

          // Group Writer and Screenplay under one job title
          const keyCrew = tmdbData.credits.crew
            .filter((person) => importantJobs.includes(person.job))
            .map((person) => {
              // Normalize Writer and Screenplay roles to "Writer"
              if (person.job === "Screenplay") {
                return { ...person, job: "Writer" };
              }
              return person;
            });

          // Remove duplicates (same person might be credited as both Writer and Screenplay)
          const uniqueCrew = [];
          const seenPersons = new Set();

          for (const person of keyCrew) {
            const key = `${person.id}-${person.job}`;
            if (!seenPersons.has(key)) {
              seenPersons.add(key);
              uniqueCrew.push(person);
            }
          }

          for (const person of uniqueCrew) {
            await MovieCrew.create({
              movieSelectionId: movieSelection.id,
              personId: person.id,
              name: person.name,
              job: person.job,
              department: person.department || null,
              profilePath: person.profile_path || null,
            });
          }
          console.log(`Added ${uniqueCrew.length} crew members`);
        }
      } else {
        console.error("TMDB API error:", {
          status: tmdbResponse.status,
          statusText: tmdbResponse.statusText,
        });
      }
    } catch (tmdbError) {
      console.error("Error fetching or processing TMDB data:", tmdbError);
      // Continue anyway
    }

    console.log("Step 9: Updating MovieMonday status");
    // Update movie monday status if needed
    if (movieMonday.movieSelections.length + 1 === 3) {
      movieMonday.status = "in-progress";
      await movieMonday.save();
      console.log("Updated MovieMonday status to in-progress");
    }

    console.log("Successfully added movie to MovieMonday");
    res.status(201).json({
      message: "Movie added successfully",
      movieSelection,
    });
  } catch (error) {
    console.error("Error adding movie:", error);
    res.status(500).json({
      message: "Failed to add movie",
      error: error.message,
      stack: error.stack,
    });
  }
});

router.get('/all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const groupIds = req.userGroups.map(g => g.id);

    if (groupIds.length === 0) {
      return res.json([]);
    }
    
    // Get all movie mondays for the user's groups
    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: groupIds
      },
      include: [
        {
          model: MovieSelection,
          as: 'movieSelections',
          attributes: ['id', 'tmdbMovieId', 'title', 'posterPath', 'isWinner', 'genres', 'releaseYear'],
          include: [
            {
              model: MovieCast,
              as: 'cast',
              attributes: ['actorId', 'name', 'character', 'profilePath', 'order']
            },
            {
              model: MovieCrew,
              as: 'crew',
              attributes: ['personId', 'name', 'job', 'department', 'profilePath']
            }
          ]
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

    // Transform data for easier consumption by analytics
    const enhancedMovieMondays = movieMondays.map(mm => {
      const plainMM = mm.get({ plain: true });
      
      // Parse genres if needed (depending on your getter/setter implementation)
      plainMM.movieSelections = plainMM.movieSelections.map(movie => {
        // Extract all directors from crew
        const directors = movie.crew
          .filter(person => person.job === 'Director')
          .map(director => ({ 
            id: director.personId,
            name: director.name
          }));
        
        // Extract all writers (including Screenplay)
        const writers = movie.crew
          .filter(person => person.job === 'Writer' || person.job === 'Screenplay')
          .map(writer => ({ 
            id: writer.personId,
            name: writer.name,
            job: writer.job
          }));
          
        // Format the movie with additional derived fields
        return {
          ...movie,
          // Set primary director (first in the list)
          director: directors.length > 0 ? directors[0].name : 'Unknown',
          // Include all directors
          directors: directors,
          // Include all writers
          writers: writers,
          // Format actors for easier access
          actors: movie.cast.map(actor => ({
            id: actor.actorId,
            name: actor.name,
            character: actor.character
          }))
        };
      });
      
      return plainMM;
    });
  
    res.json(enhancedMovieMondays);
  } catch (error) {
    console.error('Error fetching all movie mondays:', error);
    res.status(500).json({ error: 'Failed to fetch movie data' });
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

router.get("/:date", authMiddleware, async (req, res) => {
  try {
    const dateStr = decodeURIComponent(req.params.date);
    console.log("Searching for MovieMonday:", {
      dateStr,
      userGroups: req.userGroups.map(g => g.id),
      userId: req.user.id,
    });

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      console.warn(`Invalid date format: ${dateStr}`);
      return res.json({
        date: dateStr,
        status: "not_created",
        movieSelections: [],
      });
    }

    // Get group IDs from req.userGroups
    const userGroupIds = req.userGroups.map((group) => group.id);

    if (!userGroupIds.length) {
      return res.json({
        date: dateStr,
        status: "not_created",
        movieSelections: [],
      });
    }

    // Use sequelize.literal to ensure proper date formatting for the database
    const movieMonday = await MovieMonday.findOne({
      where: {
        GroupId: userGroupIds,
        date: dateStr, // Direct comparison with YYYY-MM-DD string format
      },
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
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
    });

    console.log("Query result:", {
      found: !!movieMonday,
      data: movieMonday
        ? {
            id: movieMonday.id,
            date: movieMonday.date,
            status: movieMonday.status,
            GroupId: movieMonday.GroupId,
          }
        : null,
    });

    if (!movieMonday) {
      return res.json({
        date: dateStr,
        status: "not_created",
        movieSelections: [],
      });
    }

    // Process cocktails for consistency (ensure it's an array)
    if (movieMonday.eventDetails && movieMonday.eventDetails.cocktails) {
      if (typeof movieMonday.eventDetails.cocktails === 'string') {
        movieMonday.eventDetails.cocktails = movieMonday.eventDetails.cocktails
          .split(',')
          .map(c => c.trim())
          .filter(Boolean);
      }
    }

    res.json(movieMonday);
  } catch (error) {
    console.error("Error in GET /:date route:", error);
    res.status(500).json({ message: "Failed to fetch Movie Monday data" });
  }
});

router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { date, groupId } = req.body;

    console.log("Creating MovieMonday:", {
      date,
      groupId,
      userId: req.user.id,
    });

    if (!date || !groupId) {
      return res.status(400).json({ message: "Date and groupId are required" });
    }

    // For DATEONLY, we just need YYYY-MM-DD
    const dateStr = date.split("T")[0];

    // Check if MovieMonday already exists
    const existing = await MovieMonday.findOne({
      where: {
        date: dateStr,
        GroupId: groupId,
      },
    });

    if (existing) {
      return res
        .status(409)
        .json({
          message: "MovieMonday already exists for this date and group",
        });
    }

    // Create new MovieMonday
    const movieMonday = await MovieMonday.create({
      date: dateStr,
      pickerUserId: req.user.id,
      GroupId: groupId,
      status: "pending",
    });

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

router.delete(
  "/:movieMondayId/movies/:movieSelectionId",
  authMiddleware,
  async (req, res) => {
    try {
      const { movieMondayId, movieSelectionId } = req.params;

      // Verify the movie monday exists and user has access to it
      const movieMonday = await MovieMonday.findOne({
        where: {
          id: movieMondayId,
          GroupId: req.userGroups.map((group) => group.id),
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

      // Find the movie selection
      const movieSelection = await MovieSelection.findOne({
        where: {
          id: movieSelectionId,
          movieMondayId,
        },
      });

      if (!movieSelection) {
        return res.status(404).json({ message: "Movie selection not found" });
      }

      // If this was the winner, we need to update the MovieMonday status
      const wasWinner = movieSelection.isWinner;

      // Delete the movie selection
      await movieSelection.destroy();

      // If this was the winner or it was the last movie, update the MovieMonday status
      if (wasWinner || movieMonday.movieSelections.length <= 1) {
        movieMonday.status = "pending";
        await movieMonday.save();
      }

      res.json({
        message: "Movie selection removed successfully",
        movieMondayId,
        removedMovieId: movieSelectionId,
      });
    } catch (error) {
      console.error("Error removing movie selection:", error);
      res.status(500).json({
        message: "Failed to remove movie selection",
        error: error.message,
      });
    }
  }
);

router.get("/analytics", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const groupIds = req.userGroups.map((g) => g.id);

    // Get all completed movie mondays for analytics
    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: groupIds,
      },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
          attributes: [
            "id",
            "tmdbMovieId",
            "title",
            "posterPath",
            "isWinner",
            "genres",
            "releaseYear",
          ],
          include: [
            {
              model: MovieCast,
              as: "cast",
              attributes: ["actorId", "name"],
            },
            {
              model: MovieCrew,
              as: "crew",
              attributes: ["personId", "name", "job"],
            },
          ],
        },
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
      ],
    });

    // Calculate various analytics data
    const analytics = {
      totalMoviesWatched: 0,
      genres: {},
      actors: {},
      directors: {},
      pickers: {},
      moviesByMonth: {},
      winRates: {},
    };

    // Process all movie mondays
    movieMondays.forEach((mm) => {
      const plainMM = mm.get({ plain: true });
      const date = new Date(plainMM.date);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      // Initialize month tracking
      if (!analytics.moviesByMonth[monthKey]) {
        analytics.moviesByMonth[monthKey] = {
          count: 0,
          winners: 0,
        };
      }

      // Process each movie
      plainMM.movieSelections.forEach((movie) => {
        // Count movies
        analytics.totalMoviesWatched++;

        // Track winner status
        if (movie.isWinner) {
          analytics.moviesByMonth[monthKey].winners++;
        }

        // Process genres
        if (movie.genres && Array.isArray(movie.genres)) {
          movie.genres.forEach((genre) => {
            if (!analytics.genres[genre]) {
              analytics.genres[genre] = { count: 0, wins: 0 };
            }
            analytics.genres[genre].count++;
            if (movie.isWinner) {
              analytics.genres[genre].wins++;
            }
          });
        }

        // Process cast/actors
        movie.cast.forEach((actor) => {
          if (!analytics.actors[actor.name]) {
            analytics.actors[actor.name] = {
              id: actor.actorId,
              count: 0,
              wins: 0,
            };
          }
          analytics.actors[actor.name].count++;
          if (movie.isWinner) {
            analytics.actors[actor.name].wins++;
          }
        });

        // Process directors
        movie.crew.forEach((person) => {
          if (person.job === "Director") {
            if (!analytics.directors[person.name]) {
              analytics.directors[person.name] = {
                id: person.personId,
                count: 0,
                wins: 0,
              };
            }
            analytics.directors[person.name].count++;
            if (movie.isWinner) {
              analytics.directors[person.name].wins++;
            }
          }
        });

        // Track win rates
        if (!analytics.winRates[movie.title]) {
          analytics.winRates[movie.title] = {
            id: movie.tmdbMovieId,
            selections: 0,
            wins: 0,
          };
        }
        analytics.winRates[movie.title].selections++;
        if (movie.isWinner) {
          analytics.winRates[movie.title].wins++;
        }
      });

      // Count movies in this month
      analytics.moviesByMonth[monthKey].count += plainMM.movieSelections.length;

      // Track picker stats
      if (plainMM.picker) {
        const pickerName = plainMM.picker.username;
        if (!analytics.pickers[pickerName]) {
          analytics.pickers[pickerName] = {
            id: plainMM.picker.id,
            picks: 0,
            wins: 0,
          };
        }

        // Count this picker's picks
        const pickerSelections = plainMM.movieSelections.filter(
          (m) => m.isWinner !== null // Only count decided selections
        );

        if (pickerSelections.length > 0) {
          analytics.pickers[pickerName].picks += pickerSelections.length;

          // Count this picker's wins
          const pickerWins = pickerSelections.filter((m) => m.isWinner);
          analytics.pickers[pickerName].wins += pickerWins.length;
        }
      }
    });

    // Format the data for the frontend
    const formattedAnalytics = {
      totalMovies: analytics.totalMoviesWatched,

      // Format genres for charts
      genres: Object.entries(analytics.genres)
        .map(([name, data]) => ({
          name,
          count: data.count,
          wins: data.wins,
          winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),

      // Format actors for charts
      actors: Object.entries(analytics.actors)
        .map(([name, data]) => ({
          name,
          id: data.id,
          count: data.count,
          wins: data.wins,
          winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),

      // Format directors for charts
      directors: Object.entries(analytics.directors)
        .map(([name, data]) => ({
          name,
          id: data.id,
          count: data.count,
          wins: data.wins,
          winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),

      // Format monthly data for time series
      monthlyMovies: Object.entries(analytics.moviesByMonth)
        .map(([month, data]) => ({
          name: month,
          value: data.count,
          winners: data.winners,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),

      // Format win rates
      winRates: Object.entries(analytics.winRates).map(([title, data]) => ({
        name: title,
        id: data.id,
        selections: data.selections,
        wins: data.wins,
        winRate: data.selections > 0 ? (data.wins / data.selections) * 100 : 0,
        lossRate:
          data.selections > 0 ? 100 - (data.wins / data.selections) * 100 : 0,
      })),

      // Format picker success rates
      pickers: Object.entries(analytics.pickers)
        .map(([name, data]) => ({
          name,
          id: data.id,
          selections: data.picks,
          wins: data.wins,
          successRate: data.picks > 0 ? (data.wins / data.picks) * 100 : 0,
        }))
        .sort((a, b) => b.successRate - a.successRate),
    };

    res.json(formattedAnalytics);
  } catch (error) {
    console.error("Error generating analytics:", error);
    res.status(500).json({ error: "Failed to generate analytics" });
  }
});



// Also make sure the event details route properly handles cocktails
router.post("/:id/event-details", authMiddleware, async (req, res) => {
  try {
    const { meals, cocktails, desserts, notes } = req.body;
    const movieMondayId = req.params.id;
    
    console.log("Received cocktails:", cocktails);

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
    } else if (!Array.isArray(cocktails)) {
      // Handle case where cocktails might be null or undefined
      processedCocktails = [];
    }

    console.log("Processed cocktails:", processedCocktails);

    // Update or create event details
    const [eventDetails, created] = await MovieMondayEventDetails.findOrCreate({
      where: { movieMondayId },
      defaults: {
        meals: meals || '',
        desserts: desserts || '',
        cocktails: processedCocktails,
        notes: notes || '',
      },
    });

    if (!created) {
      await eventDetails.update({
        meals: meals || eventDetails.meals,
        desserts: desserts || eventDetails.desserts,
        cocktails: processedCocktails,
        notes: notes || eventDetails.notes,
      });
    }

    res.json(eventDetails);
  } catch (error) {
    console.error("Error updating event details:", error);
    res.status(500).json({ message: "Failed to update event details" });
  }
});

module.exports = router;
