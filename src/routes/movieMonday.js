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
  Statistic,
} = require("../models");

const { Op } = require("sequelize");
const NodeCache = require('node-cache');
const statsCache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour
const STATS_CACHE_KEY = 'movieMondayStats';
console.log("TMDB API Key available:", !!process.env.TMDB_API_KEY);
// Don't log the actual key for security reasons

const recalculateStats = async () => {
  try {
    // Count total MovieMondays
    const totalMovieMondays = await MovieMonday.count();
    
    // Get all event details
    const eventDetails = await MovieMondayEventDetails.findAll();
    
    let totalMealsShared = 0;
    let totalCocktailsConsumed = 0;
    
    // Process each event to count meals and cocktails
    eventDetails.forEach(event => {
      // Count meals
      if (event.meals) {
        if (Array.isArray(event.meals)) {
          totalMealsShared += event.meals.length;
        } else if (typeof event.meals === 'string') {
          try {
            const parsed = JSON.parse(event.meals);
            if (Array.isArray(parsed)) {
              totalMealsShared += parsed.length;
            } else if (parsed) {
              totalMealsShared += 1;
            }
          } catch (e) {
            if (event.meals.trim()) {
              totalMealsShared += 1;
            }
          }
        } else if (event.meals) {
          totalMealsShared += 1;
        }
      }
      
      // Count cocktails
      if (event.cocktails) {
        if (Array.isArray(event.cocktails)) {
          totalCocktailsConsumed += event.cocktails.length;
        } else if (typeof event.cocktails === 'string') {
          try {
            const parsed = JSON.parse(event.cocktails);
            if (Array.isArray(parsed)) {
              totalCocktailsConsumed += parsed.length;
            } else if (parsed) {
              totalCocktailsConsumed += 1;
            }
          } catch (e) {
            if (event.cocktails.trim()) {
              totalCocktailsConsumed += 1;
            }
          }
        } else if (event.cocktails) {
          totalCocktailsConsumed += 1;
        }
      }
    });
    
    // Return and cache the statistics
    const stats = {
      totalMovieMondays,
      totalMealsShared,
      totalCocktailsConsumed
    };
    
    statsCache.set('movieMondayStats', stats);
    return stats;
  } catch (error) {
    console.error('Error calculating statistics:', error);
    throw error;
  }
};
async function updateWatchlistForWinner(movieSelectionId, tmdbMovieId, isWinner) {
  try {
    // If this is not set as a winner, don't do anything
    if (!isWinner) return;

    // Find all watchlist entries for this movie
    const watchlistEntries = await WatchLater.findAll({
      where: { tmdbMovieId }
    });

    // Log for debugging
    console.log(`Found ${watchlistEntries.length} watchlist entries for movie ${tmdbMovieId}`);

    // Add a 'watched' flag to the watchlist entries
    // Note: You'll need to add a 'watched' and 'isWinner' column to your WatchLater table
    for (const entry of watchlistEntries) {
      await entry.update({
        watched: true,
        isWinner: true
      });
      console.log(`Updated watchlist entry ${entry.id} to watched`);
    }
  } catch (error) {
    console.error('Error updating watchlist for winner:', error);
  }
}


router.get('/stats', async (req, res) => {
  try {
    // Check if stats are in cache
    const cachedStats = statsCache.get(STATS_CACHE_KEY);
    
    if (cachedStats) {
      return res.json(cachedStats);
    }
    
    // For now, just return demo data that we'll cache
    // You can implement the database logic once you've set up the Statistic model
    const demoStats = {
      totalMovieMondays: 246,
      totalMealsShared: 517,
      totalCocktailsConsumed: 829
    };
    
    // Cache the demo stats
    statsCache.set(STATS_CACHE_KEY, demoStats);
    
    // Return the statistics
    return res.json(demoStats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    
    // Return demo data
    return res.json({
      totalMovieMondays: 246,
      totalMealsShared: 517,
      totalCocktailsConsumed: 829
    });
  }
});

const invalidateStatsCache = () => {
  statsCache.del(STATS_CACHE_KEY);
};

MovieMonday.afterCreate(async (instance, options) => {
  try {
    await Statistic.increment('totalMovieMondays');
    invalidateStatsCache(); // Invalidate cache on new data
  } catch (error) {
    console.error('Error incrementing totalMovieMondays:', error);
  }
});

MovieMondayEventDetails.afterSave(async (instance, options) => {
  try {
    // Handle meals
    let mealsCount = 0;
    if (instance.meals) {
      if (Array.isArray(instance.meals)) {
        mealsCount = instance.meals.length;
      } else if (typeof instance.meals === 'string') {
        try {
          const parsed = JSON.parse(instance.meals);
          if (Array.isArray(parsed)) {
            mealsCount = parsed.length;
          } else if (parsed) {
            mealsCount = 1;
          }
        } catch (e) {
          if (instance.meals.trim()) {
            mealsCount = 1;
          }
        }
      } else {
        mealsCount = 1;
      }
    }
    
    // Handle cocktails
    let cocktailsCount = 0;
    if (instance.cocktails) {
      if (Array.isArray(instance.cocktails)) {
        cocktailsCount = instance.cocktails.length;
      } else if (typeof instance.cocktails === 'string') {
        try {
          const parsed = JSON.parse(instance.cocktails);
          if (Array.isArray(parsed)) {
            cocktailsCount = parsed.length;
          } else if (parsed) {
            cocktailsCount = 1;
          }
        } catch (e) {
          if (instance.cocktails.trim()) {
            cocktailsCount = 1;
          }
        }
      } else {
        cocktailsCount = 1;
      }
    }
    
    // Only increment if it's a new record (for updates, we'd need more complex logic)
    if (options.isNewRecord) {
      if (mealsCount > 0) {
        await Statistic.increment('totalMealsShared', mealsCount);
      }
      
      if (cocktailsCount > 0) {
        await Statistic.increment('totalCocktailsConsumed', cocktailsCount);
      }
      
      // Invalidate cache on new data
      invalidateStatsCache();
    }
  } catch (error) {
    console.error('Error updating meal/cocktail statistics:', error);
  }
});

const authMiddleware = require("../middleware/auth");

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
        // Process cocktails data, regardless of format
        let cocktailsList = [];
        
        if (Array.isArray(mm.eventDetails.cocktails)) {
          // If already an array, use it directly
          cocktailsList = mm.eventDetails.cocktails;
        } else if (typeof mm.eventDetails.cocktails === 'string') {
          try {
            // Try to parse as JSON
            const parsed = JSON.parse(mm.eventDetails.cocktails);
            if (Array.isArray(parsed)) {
              cocktailsList = parsed;
            } else if (parsed && typeof parsed === 'string') {
              cocktailsList = [parsed];
            }
          } catch (e) {
            // If not JSON, split by comma or use as single item
            if (mm.eventDetails.cocktails.includes(',')) {
              cocktailsList = mm.eventDetails.cocktails.split(',').map(c => c.trim());
            } else {
              cocktailsList = [mm.eventDetails.cocktails];
            }
          }
        }
        
        // Add each valid cocktail to the set
        cocktailsList.forEach(cocktail => {
          if (cocktail && typeof cocktail === 'string' && cocktail.trim() && 
              cocktail !== '[]' && cocktail !== '[ ]') {
            allCocktails.add(cocktail.trim());
          }
        });
      }
    });
    
    // Sort alphabetically
    const sortedCocktails = Array.from(allCocktails).sort();
    
    console.log(`Found ${sortedCocktails.length} unique cocktails`);
    
    res.json(sortedCocktails);
  } catch (error) {
    console.error("Error fetching cocktails:", error);
    res.status(500).json({ message: "Failed to fetch cocktails" });
  }
});

// For the meals route
router.get("/meals", authMiddleware, async (req, res) => {
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
    
    // Collect all unique meals
    const allMeals = new Set();
    
    movieMondays.forEach(mm => {
      if (mm.eventDetails && mm.eventDetails.meals) {
        // Process meals data, handling different formats
        let mealsList = [];
        
        if (Array.isArray(mm.eventDetails.meals)) {
          // If already an array, use it directly
          mealsList = mm.eventDetails.meals;
        } else if (typeof mm.eventDetails.meals === 'string') {
          try {
            // Try to parse as JSON
            const parsed = JSON.parse(mm.eventDetails.meals);
            if (Array.isArray(parsed)) {
              mealsList = parsed;
            } else if (parsed && typeof parsed === 'string') {
              mealsList = [parsed];
            }
          } catch (e) {
            // If not JSON, split by comma or use as single item
            if (mm.eventDetails.meals.includes(',')) {
              mealsList = mm.eventDetails.meals.split(',').map(m => m.trim());
            } else {
              mealsList = [mm.eventDetails.meals];
            }
          }
        }
        
        // Add each valid meal to the set
        mealsList.forEach(meal => {
          if (meal && typeof meal === 'string' && meal.trim() && 
              meal !== '[]' && meal !== '[ ]') {
            allMeals.add(meal.trim());
          }
        });
      }
    });
    
    // Sort alphabetically
    const sortedMeals = Array.from(allMeals).sort();
    
    console.log(`Found ${sortedMeals.length} unique meals`);
    
    res.json(sortedMeals);
  } catch (error) {
    console.error("Error fetching meals:", error);
    res.status(500).json({ message: "Failed to fetch meals" });
  }
});

// Fix for the desserts endpoint
router.get("/desserts", authMiddleware, async (req, res) => {
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
    
    // Collect all unique desserts
    const allDesserts = new Set();
    
    movieMondays.forEach(mm => {
      if (mm.eventDetails && mm.eventDetails.desserts) {
        // Process desserts data, handling different formats
        let dessertsList = [];
        
        if (Array.isArray(mm.eventDetails.desserts)) {
          // If already an array, use it directly
          dessertsList = mm.eventDetails.desserts;
        } else if (typeof mm.eventDetails.desserts === 'string') {
          try {
            // Try to parse as JSON
            const parsed = JSON.parse(mm.eventDetails.desserts);
            if (Array.isArray(parsed)) {
              dessertsList = parsed;
            } else if (parsed && typeof parsed === 'string') {
              dessertsList = [parsed];
            }
          } catch (e) {
            // If not JSON, split by comma or use as single item
            if (mm.eventDetails.desserts.includes(',')) {
              dessertsList = mm.eventDetails.desserts.split(',').map(d => d.trim());
            } else {
              dessertsList = [mm.eventDetails.desserts];
            }
          }
        }
        
        // Add each valid dessert to the set
        dessertsList.forEach(dessert => {
          if (dessert && typeof dessert === 'string' && dessert.trim() && 
              dessert !== '[]' && dessert !== '[ ]') {
            allDesserts.add(dessert.trim());
          }
        });
      }
    });
    
    // Sort alphabetically
    const sortedDesserts = Array.from(allDesserts).sort();
    
    console.log(`Found ${sortedDesserts.length} unique desserts`);
    
    res.json(sortedDesserts);
  } catch (error) {
    console.error("Error fetching desserts:", error);
    res.status(500).json({ message: "Failed to fetch desserts" });
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
      userId: req.user?.id,
    });

    // Validate required fields
    if (!tmdbMovieId || !title) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Check if already in watchlist
    const existing = await WatchLater.findOne({
      where: {
        userId: req.user.id,
        tmdbMovieId: parseInt(tmdbMovieId),
      },
    });

    if (existing) {
      console.log('Movie already in watchlist:', existing.id);
      return res.status(200).json(existing); // Return existing entry (already in watchlist)
    }

    // Create new watchlist entry
    const [watchLaterMovie] = await WatchLater.findOrCreate({
      where: {
        userId: req.user.id,
        tmdbMovieId: parseInt(tmdbMovieId),
      },
      defaults: {
        title,
        posterPath,
        userId: req.user.id,
        watched: false,
        isWinner: false
      },
    });

    console.log('Created new watchlist entry:', watchLaterMovie.id);
    res.status(201).json(watchLaterMovie);
  } catch (error) {
    console.error("Error adding to watch later:", error);
    res.status(500).json({ message: error.message });
  }
});

router.get("/watch-later/status/:tmdbMovieId", authMiddleware, async (req, res) => {
  try {
    console.log("Checking status for:", {
      tmdbMovieId: req.params.tmdbMovieId,
      userId: req.user.id,
    });

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const watchLaterMovie = await WatchLater.findOne({
      where: {
        userId: req.user.id,
        tmdbMovieId: parseInt(req.params.tmdbMovieId, 10),
      },
    });

    console.log("Watch later status result:", !!watchLaterMovie);

    res.json({
      isInWatchLater: !!watchLaterMovie,
      // If we have a watchlist item, include its details
      ...(watchLaterMovie ? {
        id: watchLaterMovie.id,
        watched: watchLaterMovie.watched,
        isWinner: watchLaterMovie.isWinner
      } : {})
    });
  } catch (error) {
    console.error("Error checking watch later status:", error);
    res.status(500).json({ message: error.message });
  }
});

router.delete("/watch-later/:id", authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { id } = req.params;
    
    console.log(`Attempting to delete watchlist item ${id} for user ${req.user.id}`);
    
    // Find the item first to verify ownership
    const watchLaterItem = await WatchLater.findOne({
      where: {
        id: parseInt(id, 10),
        userId: req.user.id
      }
    });
    
    if (!watchLaterItem) {
      console.log(`Watch later item ${id} not found or does not belong to user ${req.user.id}`);
      return res.status(404).json({ message: "Item not found in your watchlist" });
    }
    
    // Delete the item
    await watchLaterItem.destroy();
    console.log(`Successfully deleted watchlist item ${id}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing from watch later:", error);
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

    // Find the specific movie selection
    const movieSelection = await MovieSelection.findByPk(movieSelectionId);
    const newWinnerStatus = !movieSelection.isWinner;
    
    await MovieSelection.update(
      { isWinner: newWinnerStatus },
      { where: { id: movieSelectionId } }
    );

    // If setting as winner, update watchlists
    if (newWinnerStatus) {
      await updateWatchlistForWinner(movieSelectionId, movieSelection.tmdbMovieId, true);
    }

    if (!movieSelection) {
      return res.status(404).json({ message: "Movie selection not found" });
    }

    // Toggle the winner status of just this movie (without affecting others)
    await MovieSelection.update(
      { isWinner: !movieSelection.isWinner },
      {
        where: { id: movieSelectionId }
      }
    );

    // Check if any movie is now marked as winner
    const hasAnyWinner = await MovieSelection.findOne({
      where: { 
        movieMondayId: movieMonday.id,
        isWinner: true
      }
    });

    // Update MovieMonday status based on whether any movie is a winner
    if (hasAnyWinner) {
      movieMonday.status = "completed";
    } else {
      movieMonday.status = "in-progress";
    }
    
    await movieMonday.save();

    res.json({
      message: "Winner status updated successfully",
      movieMondayId: movieMonday.id,
      movieSelectionId: movieSelectionId,
      isWinner: newWinnerStatus
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



router.post("/:id/event-details", authMiddleware, async (req, res) => {
  try {
    const { meals, cocktails, desserts, notes } = req.body;
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

    // Clean and normalize the arrays before storing
    const cleanCocktails = Array.isArray(cocktails)
      ? cocktails.filter(c => c && typeof c === 'string' && c.trim() && c !== '[]' && c !== '[ ]')
                 .map(c => c.trim())
      : [];
      
    const cleanMeals = Array.isArray(meals)
      ? meals.filter(m => m && typeof m === 'string' && m.trim() && m !== '[]' && m !== '[ ]')
              .map(m => m.trim())
      : [];
      
    const cleanDesserts = Array.isArray(desserts)
      ? desserts.filter(d => d && typeof d === 'string' && d.trim() && d !== '[]' && d !== '[ ]')
                .map(d => d.trim())
      : [];
    
    const cleanNotes = notes && typeof notes === 'string' ? notes.trim() : '';

    // Update or create event details
    const [eventDetails, created] = await MovieMondayEventDetails.findOrCreate({
      where: { movieMondayId },
      defaults: {
        movieMondayId,
        meals: cleanMeals,
        desserts: cleanDesserts,
        cocktails: cleanCocktails,
        notes: cleanNotes,
      },
    });

    if (!created) {
      await eventDetails.update({
        meals: cleanMeals,
        desserts: cleanDesserts,
        cocktails: cleanCocktails,
        notes: cleanNotes || eventDetails.notes,
      });
    }

    res.json(eventDetails);
  } catch (error) {
    console.error("Error updating event details:", error);
    res.status(500).json({ message: "Failed to update event details" });
  }
});
module.exports = router;
