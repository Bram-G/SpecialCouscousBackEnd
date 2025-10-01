const express = require("express");
const router = express.Router();
const {
  MovieMonday,
  MovieSelection,
  User,
  WatchlistCategory,
  WatchlistItem,
  MovieMondayEventDetails,
  MovieCast,
  MovieCrew,
  sequelize,
  Statistic,
} = require("../models");
const { Op } = require("sequelize");
const NodeCache = require("node-cache");
const statsCache = new NodeCache({ stdTTL: 3600 });
const STATS_CACHE_KEY = "movieMondayStats";
const authMiddleware = require("../middleware/auth");

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const invalidateStatsCache = () => {
  statsCache.del(STATS_CACHE_KEY);
};

const recalculateStats = async () => {
  try {
    const totalMovieMondays = await MovieMonday.count();
    const eventDetails = await MovieMondayEventDetails.findAll();

    let totalMealsShared = 0;
    let totalCocktailsConsumed = 0;

    eventDetails.forEach((event) => {
      // Count meals
      if (event.meals) {
        if (Array.isArray(event.meals)) {
          totalMealsShared += event.meals.length;
        } else if (typeof event.meals === "string") {
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
        } else if (typeof event.cocktails === "string") {
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

    const stats = {
      totalMovieMondays,
      totalMealsShared,
      totalCocktailsConsumed,
    };

    statsCache.set("movieMondayStats", stats);
    return stats;
  } catch (error) {
    console.error("Error calculating statistics:", error);
    throw error;
  }
};

async function updateWatchlistsForWinner(
  movieSelectionId,
  tmdbMovieId,
  isWinner
) {
  try {
    if (!isWinner) return;

    const watchlistEntries = await WatchlistItem.findAll({
      where: { tmdbMovieId },
    });

    console.log(
      `Found ${watchlistEntries.length} watchlist entries for movie ${tmdbMovieId}`
    );

    for (const entry of watchlistEntries) {
      await entry.update({
        watched: true,
        isWinner: true,
        watchedDate: new Date(),
      });
      console.log(`Updated watchlist entry ${entry.id} to watched`);
    }
  } catch (error) {
    console.error("Error updating watchlists for winner:", error);
  }
}

async function generateMovieMondayStats(movieMonday) {
  const actors = [];
  const actorsMap = new Map();

  movieMonday.movieSelections.forEach((movie) => {
    movie.cast.forEach((actor) => {
      const key = actor.actorId.toString();
      if (!actorsMap.has(key)) {
        actorsMap.set(key, {
          id: actor.actorId,
          name: actor.name,
          count: 0,
          isWinner: 0,
        });
      }

      const actorData = actorsMap.get(key);
      actorData.count++;
      if (movie.isWinner) {
        actorData.isWinner++;
      }
    });
  });

  actorsMap.forEach((actor) => {
    actors.push(actor);
  });

  const directors = [];
  const directorsMap = new Map();

  movieMonday.movieSelections.forEach((movie) => {
    movie.crew
      .filter((c) => c.job === "Director")
      .forEach((director) => {
        const key = director.personId.toString();
        if (!directorsMap.has(key)) {
          directorsMap.set(key, {
            id: director.personId,
            name: director.name,
            count: 0,
            isWinner: 0,
          });
        }

        const directorData = directorsMap.get(key);
        directorData.count++;
        if (movie.isWinner) {
          directorData.isWinner++;
        }
      });
  });

  directorsMap.forEach((director) => {
    directors.push(director);
  });

  const genres = [];
  const genresMap = new Map();

  movieMonday.movieSelections.forEach((movie) => {
    if (!movie.genres) return;

    (typeof movie.genres === "string"
      ? JSON.parse(movie.genres)
      : movie.genres
    ).forEach((genre) => {
      if (!genresMap.has(genre)) {
        genresMap.set(genre, {
          name: genre,
          count: 0,
          isWinner: 0,
        });
      }

      const genreData = genresMap.get(genre);
      genreData.count++;
      if (movie.isWinner) {
        genreData.isWinner++;
      }
    });
  });

  genresMap.forEach((genre) => {
    genres.push(genre);
  });

  let meals = [];
  let cocktails = [];
  let desserts = [];

  if (movieMonday.eventDetails) {
    meals = movieMonday.eventDetails.meals || [];
    cocktails = movieMonday.eventDetails.cocktails || [];
    desserts = movieMonday.eventDetails.desserts || [];
  }

  return {
    actors: actors.sort((a, b) => b.count - a.count),
    directors: directors.sort((a, b) => b.count - a.count),
    genres: genres.sort((a, b) => b.count - a.count),
    meals,
    cocktails,
    desserts,
  };
}

async function generateHistoricalStats(currentMonday, allMovieMondays) {
  console.log("Generating enhanced historical stats...");

  const mealFrequencies = new Map();
  const cocktailFrequencies = new Map();
  const dessertFrequencies = new Map();
  const actorAppearances = new Map();
  const directorAppearances = new Map();
  const genreAppearances = new Map();
  const decadeAppearances = new Map();

  let totalMenuItems = 0;
  let totalMovieMondays = allMovieMondays.length + 1;

  allMovieMondays.forEach((monday) => {
    if (monday.eventDetails) {
      (monday.eventDetails.meals || []).forEach((meal) => {
        if (!mealFrequencies.has(meal)) {
          mealFrequencies.set(meal, { count: 0, dates: [] });
        }
        mealFrequencies.get(meal).count++;
        mealFrequencies.get(meal).dates.push(monday.date);
        totalMenuItems++;
      });

      (monday.eventDetails.cocktails || []).forEach((cocktail) => {
        if (!cocktailFrequencies.has(cocktail)) {
          cocktailFrequencies.set(cocktail, { count: 0, dates: [] });
        }
        cocktailFrequencies.get(cocktail).count++;
        cocktailFrequencies.get(cocktail).dates.push(monday.date);
        totalMenuItems++;
      });

      (monday.eventDetails.desserts || []).forEach((dessert) => {
        if (!dessertFrequencies.has(dessert)) {
          dessertFrequencies.set(dessert, { count: 0, dates: [] });
        }
        dessertFrequencies.get(dessert).count++;
        dessertFrequencies.get(dessert).dates.push(monday.date);
        totalMenuItems++;
      });
    }

    monday.movieSelections.forEach((movie) => {
      (movie.cast || []).forEach((actor) => {
        const actorKey = actor.actorId.toString();
        if (!actorAppearances.has(actorKey)) {
          actorAppearances.set(actorKey, {
            id: actor.actorId,
            name: actor.name,
            totalAppearances: 0,
            wins: 0,
            winRate: 0,
          });
        }

        const actorData = actorAppearances.get(actorKey);
        actorData.totalAppearances++;
        if (movie.isWinner) {
          actorData.wins++;
        }
        actorData.winRate = (actorData.wins / actorData.totalAppearances) * 100;
      });

      (movie.crew || [])
        .filter((c) => c.job === "Director")
        .forEach((director) => {
          const directorKey = director.personId.toString();
          if (!directorAppearances.has(directorKey)) {
            directorAppearances.set(directorKey, {
              id: director.personId,
              name: director.name,
              totalAppearances: 0,
              wins: 0,
              winRate: 0,
            });
          }

          const directorData = directorAppearances.get(directorKey);
          directorData.totalAppearances++;
          if (movie.isWinner) {
            directorData.wins++;
          }
          directorData.winRate =
            (directorData.wins / directorData.totalAppearances) * 100;
        });

      if (movie.genres) {
        const genres =
          typeof movie.genres === "string"
            ? JSON.parse(movie.genres)
            : movie.genres;
        genres.forEach((genre) => {
          if (!genreAppearances.has(genre)) {
            genreAppearances.set(genre, {
              name: genre,
              totalAppearances: 0,
              wins: 0,
              winRate: 0,
            });
          }

          const genreData = genreAppearances.get(genre);
          genreData.totalAppearances++;
          if (movie.isWinner) {
            genreData.wins++;
          }
          genreData.winRate =
            (genreData.wins / genreData.totalAppearances) * 100;
        });
      }

      if (movie.releaseYear) {
        const decade = Math.floor(movie.releaseYear / 10) * 10;
        const decadeKey = decade.toString();
        if (!decadeAppearances.has(decadeKey)) {
          decadeAppearances.set(decadeKey, {
            decade: decadeKey,
            totalAppearances: 0,
            wins: 0,
            winRate: 0,
          });
        }

        const decadeData = decadeAppearances.get(decadeKey);
        decadeData.totalAppearances++;
        if (movie.isWinner) {
          decadeData.wins++;
        }
        decadeData.winRate =
          (decadeData.wins / decadeData.totalAppearances) * 100;
      }
    });
  });

  const currentMenuComparison = {
    meals: [],
    cocktails: [],
    desserts: [],
  };

  const currentMovieComparison = {
    actors: [],
    directors: [],
    genres: [],
    decades: [],
  };

  if (currentMonday.eventDetails) {
    (currentMonday.eventDetails.meals || []).forEach((meal) => {
      const historicalData = mealFrequencies.get(meal);
      const popularity = historicalData
        ? (historicalData.count / totalMovieMondays) * 100
        : 0;

      currentMenuComparison.meals.push({
        name: meal,
        historicalCount: historicalData ? historicalData.count : 0,
        popularityPercentage: Math.round(popularity),
        isNew: !historicalData,
        lastSeen: historicalData
          ? historicalData.dates[historicalData.dates.length - 1]
          : null,
      });
    });

    (currentMonday.eventDetails.cocktails || []).forEach((cocktail) => {
      const historicalData = cocktailFrequencies.get(cocktail);
      const popularity = historicalData
        ? (historicalData.count / totalMovieMondays) * 100
        : 0;

      currentMenuComparison.cocktails.push({
        name: cocktail,
        historicalCount: historicalData ? historicalData.count : 0,
        popularityPercentage: Math.round(popularity),
        isNew: !historicalData,
        lastSeen: historicalData
          ? historicalData.dates[historicalData.dates.length - 1]
          : null,
      });
    });

    (currentMonday.eventDetails.desserts || []).forEach((dessert) => {
      const historicalData = dessertFrequencies.get(dessert);
      const popularity = historicalData
        ? (historicalData.count / totalMovieMondays) * 100
        : 0;

      currentMenuComparison.desserts.push({
        name: dessert,
        historicalCount: historicalData ? historicalData.count : 0,
        popularityPercentage: Math.round(popularity),
        isNew: !historicalData,
        lastSeen: historicalData
          ? historicalData.dates[historicalData.dates.length - 1]
          : null,
      });
    });
  }

  currentMonday.movieSelections.forEach((movie) => {
    (movie.cast || []).forEach((actor) => {
      const historicalData = actorAppearances.get(actor.actorId.toString());
      currentMovieComparison.actors.push({
        name: actor.name,
        id: actor.actorId,
        movieTitle: movie.title,
        isWinner: movie.isWinner,
        historicalAppearances: historicalData
          ? historicalData.totalAppearances
          : 0,
        historicalWins: historicalData ? historicalData.wins : 0,
        historicalWinRate: historicalData
          ? Math.round(historicalData.winRate)
          : 0,
        isNew: !historicalData,
      });
    });

    (movie.crew || [])
      .filter((c) => c.job === "Director")
      .forEach((director) => {
        const historicalData = directorAppearances.get(
          director.personId.toString()
        );
        currentMovieComparison.directors.push({
          name: director.name,
          id: director.personId,
          movieTitle: movie.title,
          isWinner: movie.isWinner,
          historicalAppearances: historicalData
            ? historicalData.totalAppearances
            : 0,
          historicalWins: historicalData ? historicalData.wins : 0,
          historicalWinRate: historicalData
            ? Math.round(historicalData.winRate)
            : 0,
          isNew: !historicalData,
        });
      });

    if (movie.genres) {
      const genres =
        typeof movie.genres === "string"
          ? JSON.parse(movie.genres)
          : movie.genres;
      genres.forEach((genre) => {
        const historicalData = genreAppearances.get(genre);
        currentMovieComparison.genres.push({
          name: genre,
          movieTitle: movie.title,
          isWinner: movie.isWinner,
          historicalAppearances: historicalData
            ? historicalData.totalAppearances
            : 0,
          historicalWins: historicalData ? historicalData.wins : 0,
          historicalWinRate: historicalData
            ? Math.round(historicalData.winRate)
            : 0,
          isNew: !historicalData,
        });
      });
    }

    if (movie.releaseYear) {
      const decade = Math.floor(movie.releaseYear / 10) * 10;
      const historicalData = decadeAppearances.get(decade.toString());
      currentMovieComparison.decades.push({
        decade: decade,
        movieTitle: movie.title,
        isWinner: movie.isWinner,
        historicalAppearances: historicalData
          ? historicalData.totalAppearances
          : 0,
        historicalWins: historicalData ? historicalData.wins : 0,
        historicalWinRate: historicalData
          ? Math.round(historicalData.winRate)
          : 0,
        isNew: !historicalData,
      });
    }
  });

  return {
    currentMenuComparison,
    currentMovieComparison,
    overallStats: {
      totalMovieMondays,
      mostPopularMeals: Array.from(mealFrequencies.entries())
        .map(([name, data]) => ({
          name,
          count: data.count,
          popularityPercentage: Math.round(
            (data.count / totalMovieMondays) * 100
          ),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),

      mostPopularCocktails: Array.from(cocktailFrequencies.entries())
        .map(([name, data]) => ({
          name,
          count: data.count,
          popularityPercentage: Math.round(
            (data.count / totalMovieMondays) * 100
          ),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),

      mostPopularDesserts: Array.from(dessertFrequencies.entries())
        .map(([name, data]) => ({
          name,
          count: data.count,
          popularityPercentage: Math.round(
            (data.count / totalMovieMondays) * 100
          ),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),

      topActors: Array.from(actorAppearances.values())
        .sort((a, b) => b.totalAppearances - a.totalAppearances)
        .slice(0, 10),

      topDirectors: Array.from(directorAppearances.values())
        .sort((a, b) => b.totalAppearances - a.totalAppearances)
        .slice(0, 10),

      topGenres: Array.from(genreAppearances.values())
        .sort((a, b) => b.totalAppearances - a.totalAppearances)
        .slice(0, 10),
    },
  };
}

// ============================================================================
// ROUTES - SPECIFIC PATHS FIRST (BEFORE PARAMETERIZED ROUTES)
// ============================================================================

// GET /all - Fetch all movie mondays
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const userGroupIds = req.userGroups.map((group) => group.id);

    if (userGroupIds.length === 0) {
      return res.json([]);
    }

    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: userGroupIds,
      },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
          include: [
            {
              model: MovieCast,
              as: "cast",
              attributes: [
                "id",
                "actorId",
                "name",
                "character",
                "profilePath",
                "order",
              ],
            },
            {
              model: MovieCrew,
              as: "crew",
              attributes: [
                "id",
                "personId",
                "name",
                "job",
                "department",
                "profilePath",
              ],
            },
          ],
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
      order: [["date", "DESC"]],
    });

    const enhancedMovieMondays = movieMondays.map((mm) => {
      const plainMM = mm.get({ plain: true });

      plainMM.movieSelections = plainMM.movieSelections.map((movie) => {
        const directors = movie.crew
          .filter((person) => person.job === "Director")
          .map((director) => ({
            id: director.personId,
            name: director.name,
          }));

        const writers = movie.crew
          .filter(
            (person) => person.job === "Writer" || person.job === "Screenplay"
          )
          .map((writer) => ({
            id: writer.personId,
            name: writer.name,
            job: writer.job,
          }));

        return {
          ...movie,
          director: directors.length > 0 ? directors[0].name : "Unknown",
          directors: directors,
          writers: writers,
          actors: movie.cast.map((actor) => ({
            id: actor.actorId,
            name: actor.name,
            character: actor.character,
          })),
        };
      });

      return plainMM;
    });

    res.json(enhancedMovieMondays);
  } catch (error) {
    console.error("Error fetching all movie mondays:", error);
    res.status(500).json({ error: "Failed to fetch movie data" });
  }
});

// GET /stats - Get overall statistics
router.get("/stats", async (req, res) => {
  try {
    const cachedStats = statsCache.get(STATS_CACHE_KEY);

    if (cachedStats) {
      return res.json(cachedStats);
    }

    const demoStats = {
      totalMovieMondays: 246,
      totalMealsShared: 517,
      totalCocktailsConsumed: 829,
    };

    statsCache.set(STATS_CACHE_KEY, demoStats);

    return res.json(demoStats);
  } catch (error) {
    console.error("Error fetching statistics:", error);

    return res.json({
      totalMovieMondays: 246,
      totalMealsShared: 517,
      totalCocktailsConsumed: 829,
    });
  }
});

// GET /available - Get pending/in-progress movie mondays
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
          as: "movieSelections",
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

// GET /analytics - Get analytics data
router.get("/analytics", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const groupIds = req.userGroups.map((g) => g.id);

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

    const analytics = {
      totalMoviesWatched: 0,
      genres: {},
      actors: {},
      directors: {},
      pickers: {},
      moviesByMonth: {},
      winRates: {},
    };

    movieMondays.forEach((mm) => {
      const plainMM = mm.get({ plain: true });
      const date = new Date(plainMM.date);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      if (!analytics.moviesByMonth[monthKey]) {
        analytics.moviesByMonth[monthKey] = {
          count: 0,
          winners: 0,
        };
      }

      plainMM.movieSelections.forEach((movie) => {
        analytics.totalMoviesWatched++;

        if (movie.isWinner) {
          analytics.moviesByMonth[monthKey].winners++;
        }

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

      analytics.moviesByMonth[monthKey].count += plainMM.movieSelections.length;

      if (plainMM.picker) {
        const pickerName = plainMM.picker.username;
        if (!analytics.pickers[pickerName]) {
          analytics.pickers[pickerName] = {
            id: plainMM.picker.id,
            picks: 0,
            wins: 0,
          };
        }

        const pickerSelections = plainMM.movieSelections.filter(
          (m) => m.isWinner !== null
        );

        if (pickerSelections.length > 0) {
          analytics.pickers[pickerName].picks += pickerSelections.length;

          const pickerWins = pickerSelections.filter((m) => m.isWinner);
          analytics.pickers[pickerName].wins += pickerWins.length;
        }
      }
    });

    const formattedAnalytics = {
      totalMovies: analytics.totalMoviesWatched,

      genres: Object.entries(analytics.genres)
        .map(([name, data]) => ({
          name,
          count: data.count,
          wins: data.wins,
          winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),

      actors: Object.entries(analytics.actors)
        .map(([name, data]) => ({
          name,
          id: data.id,
          count: data.count,
          wins: data.wins,
          winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),

      directors: Object.entries(analytics.directors)
        .map(([name, data]) => ({
          name,
          id: data.id,
          count: data.count,
          wins: data.wins,
          winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count),

      monthlyMovies: Object.entries(analytics.moviesByMonth)
        .map(([month, data]) => ({
          name: month,
          value: data.count,
          winners: data.winners,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),

      winRates: Object.entries(analytics.winRates).map(([title, data]) => ({
        name: title,
        id: data.id,
        selections: data.selections,
        wins: data.wins,
        winRate: data.selections > 0 ? (data.wins / data.selections) * 100 : 0,
        lossRate:
          data.selections > 0 ? 100 - (data.wins / data.selections) * 100 : 0,
      })),

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

// GET /cocktails - Get all unique cocktails (MUST be before /:date route)
router.get("/cocktails", authMiddleware, async (req, res) => {
  try {
    const userGroupIds = req.userGroups.map((group) => group.id);

    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: userGroupIds,
      },
      include: [
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
    });

    const allCocktails = new Set();

    movieMondays.forEach((mm) => {
      if (mm.eventDetails && mm.eventDetails.cocktails) {
        let cocktailsList = [];

        if (Array.isArray(mm.eventDetails.cocktails)) {
          cocktailsList = mm.eventDetails.cocktails;
        } else if (typeof mm.eventDetails.cocktails === "string") {
          try {
            const parsed = JSON.parse(mm.eventDetails.cocktails);
            if (Array.isArray(parsed)) {
              cocktailsList = parsed;
            } else if (parsed && typeof parsed === "string") {
              cocktailsList = [parsed];
            }
          } catch (e) {
            if (mm.eventDetails.cocktails.includes(",")) {
              cocktailsList = mm.eventDetails.cocktails
                .split(",")
                .map((c) => c.trim());
            } else {
              cocktailsList = [mm.eventDetails.cocktails];
            }
          }
        }

        cocktailsList.forEach((cocktail) => {
          if (
            cocktail &&
            typeof cocktail === "string" &&
            cocktail.trim() &&
            cocktail !== "[]" &&
            cocktail !== "[ ]"
          ) {
            allCocktails.add(cocktail.trim());
          }
        });
      }
    });

    const sortedCocktails = Array.from(allCocktails).sort();

    console.log(`Found ${sortedCocktails.length} unique cocktails`);

    res.json(sortedCocktails);
  } catch (error) {
    console.error("Error fetching cocktails:", error);
    res.status(500).json({ message: "Failed to fetch cocktails" });
  }
});

// GET /meals - Get all unique meals (MUST be before /:date route)
router.get("/meals", authMiddleware, async (req, res) => {
  try {
    const userGroupIds = req.userGroups.map((group) => group.id);

    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: userGroupIds,
      },
      include: [
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
    });

    const allMeals = new Set();

    movieMondays.forEach((mm) => {
      if (mm.eventDetails && mm.eventDetails.meals) {
        let mealsList = [];

        if (Array.isArray(mm.eventDetails.meals)) {
          mealsList = mm.eventDetails.meals;
        } else if (typeof mm.eventDetails.meals === "string") {
          try {
            const parsed = JSON.parse(mm.eventDetails.meals);
            if (Array.isArray(parsed)) {
              mealsList = parsed;
            } else if (parsed && typeof parsed === "string") {
              mealsList = [parsed];
            }
          } catch (e) {
            if (mm.eventDetails.meals.includes(",")) {
              mealsList = mm.eventDetails.meals.split(",").map((m) => m.trim());
            } else {
              mealsList = [mm.eventDetails.meals];
            }
          }
        }

        mealsList.forEach((meal) => {
          if (
            meal &&
            typeof meal === "string" &&
            meal.trim() &&
            meal !== "[]" &&
            meal !== "[ ]"
          ) {
            allMeals.add(meal.trim());
          }
        });
      }
    });

    const sortedMeals = Array.from(allMeals).sort();

    console.log(`Found ${sortedMeals.length} unique meals`);

    res.json(sortedMeals);
  } catch (error) {
    console.error("Error fetching meals:", error);
    res.status(500).json({ message: "Failed to fetch meals" });
  }
});

// GET /desserts - Get all unique desserts (MUST be before /:date route)
router.get("/desserts", authMiddleware, async (req, res) => {
  try {
    const userGroupIds = req.userGroups.map((group) => group.id);

    const movieMondays = await MovieMonday.findAll({
      where: {
        GroupId: userGroupIds,
      },
      include: [
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
    });

    const allDesserts = new Set();

    movieMondays.forEach((mm) => {
      if (mm.eventDetails && mm.eventDetails.desserts) {
        let dessertsList = [];

        if (Array.isArray(mm.eventDetails.desserts)) {
          dessertsList = mm.eventDetails.desserts;
        } else if (typeof mm.eventDetails.desserts === "string") {
          try {
            const parsed = JSON.parse(mm.eventDetails.desserts);
            if (Array.isArray(parsed)) {
              dessertsList = parsed;
            } else if (parsed && typeof parsed === "string") {
              dessertsList = [parsed];
            }
          } catch (e) {
            if (mm.eventDetails.desserts.includes(",")) {
              dessertsList = mm.eventDetails.desserts
                .split(",")
                .map((d) => d.trim());
            } else {
              dessertsList = [mm.eventDetails.desserts];
            }
          }
        }

        dessertsList.forEach((dessert) => {
          if (
            dessert &&
            typeof dessert === "string" &&
            dessert.trim() &&
            dessert !== "[]" &&
            dessert !== "[ ]"
          ) {
            allDesserts.add(dessert.trim());
          }
        });
      }
    });

    const sortedDesserts = Array.from(allDesserts).sort();

    console.log(`Found ${sortedDesserts.length} unique desserts`);

    res.json(sortedDesserts);
  } catch (error) {
    console.error("Error fetching desserts:", error);
    res.status(500).json({ message: "Failed to fetch desserts" });
  }
});

// POST /create - Create new movie monday
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

    const dateStr = date.split("T")[0];

    const existingMonday = await MovieMonday.findOne({
      where: {
        date: dateStr,
        GroupId: groupId,
      },
    });

    if (existingMonday) {
      return res.status(409).json({
        message: "MovieMonday already exists for this date and group",
      });
    }

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
    res.status(500).json({
      message: "Failed to create MovieMonday",
      error: error.message,
    });
  }
});

// POST /dates - Batch fetch movie mondays by dates
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

// POST /add-movie - Add movie to movie monday
router.post("/add-movie", authMiddleware, async (req, res) => {
  try {
    const { movieMondayId, tmdbMovieId, title, posterPath } = req.body;

    if (!movieMondayId || !tmdbMovieId) {
      return res.status(400).json({
        message: "Missing required fields",
        details: { movieMondayId, tmdbMovieId },
      });
    }

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

    if (movieMonday.movieSelections.length >= 3) {
      return res.status(400).json({
        message: "Movie Monday already has maximum number of movies",
      });
    }

    const existingMovie = movieMonday.movieSelections.find(
      (ms) => ms.tmdbMovieId === parseInt(tmdbMovieId)
    );
    if (existingMovie) {
      return res.status(400).json({
        message: "Movie already added to this Movie Monday",
      });
    }

    const movieSelection = await MovieSelection.create({
      movieMondayId,
      tmdbMovieId: parseInt(tmdbMovieId),
      title,
      posterPath,
      isWinner: false,
      genres: [],
      releaseYear: null,
    });

    try {
      const tmdbResponse = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbMovieId}?append_to_response=credits&api_key=${process.env.TMDB_API_KEY}`
      );

      if (tmdbResponse.ok) {
        const tmdbData = await tmdbResponse.json();

        const genres = tmdbData.genres
          ? tmdbData.genres.map((g) => g.name)
          : [];
        const releaseYear = tmdbData.release_date
          ? parseInt(tmdbData.release_date.split("-")[0])
          : null;

        await movieSelection.update({
          genres,
          releaseYear,
        });

        if (tmdbData.credits && tmdbData.credits.cast) {
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
        }

        if (tmdbData.credits && tmdbData.credits.crew) {
          const importantJobs = ["Director", "Screenplay", "Writer"];

          const keyCrew = tmdbData.credits.crew
            .filter((person) => importantJobs.includes(person.job))
            .map((person) => {
              if (person.job === "Screenplay") {
                return { ...person, job: "Writer" };
              }
              return person;
            });

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
        }
      }
    } catch (tmdbError) {
      console.error("Error fetching or processing TMDB data:", tmdbError);
    }

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
      stack: error.stack,
    });
  }
});

// PUT /update-picker - Update picker for movie monday
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

// POST /:id/set-winner - Set/unset winner for movie selection
router.post("/:id/set-winner", authMiddleware, async (req, res) => {
  try {
    const { movieSelectionId } = req.body;
    const userGroupIds = req.userGroups.map((group) => group.id);

    if (userGroupIds.length === 0) {
      return res.status(403).json({ message: "User not in any groups" });
    }

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

    const movieSelection = await MovieSelection.findByPk(movieSelectionId);

    if (!movieSelection) {
      return res.status(404).json({ message: "Movie selection not found" });
    }

    const newWinnerStatus = !movieSelection.isWinner;

    await MovieSelection.update(
      { isWinner: newWinnerStatus },
      { where: { id: movieSelectionId } }
    );

    if (newWinnerStatus) {
      await updateWatchlistsForWinner(
        movieSelectionId,
        movieSelection.tmdbMovieId,
        true
      );
    }

    const hasAnyWinner = await MovieSelection.findOne({
      where: {
        movieMondayId: movieMonday.id,
        isWinner: true,
      },
    });

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
      isWinner: newWinnerStatus,
    });
  } catch (error) {
    console.error("Error updating winner:", error);
    res.status(500).json({ message: "Failed to update winner" });
  }
});

// POST /:id/event-details - Update event details (meals, cocktails, desserts)
router.post("/:id/event-details", authMiddleware, async (req, res) => {
  try {
    const { meals, cocktails, desserts, notes } = req.body;
    const movieMondayId = req.params.id;

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

    const cleanCocktails = Array.isArray(cocktails)
      ? cocktails
          .filter(
            (c) =>
              c &&
              typeof c === "string" &&
              c.trim() &&
              c !== "[]" &&
              c !== "[ ]"
          )
          .map((c) => c.trim())
      : [];

    const cleanMeals = Array.isArray(meals)
      ? meals
          .filter(
            (m) =>
              m &&
              typeof m === "string" &&
              m.trim() &&
              m !== "[]" &&
              m !== "[ ]"
          )
          .map((m) => m.trim())
      : [];

    const cleanDesserts = Array.isArray(desserts)
      ? desserts
          .filter(
            (d) =>
              d &&
              typeof d === "string" &&
              d.trim() &&
              d !== "[]" &&
              d !== "[ ]"
          )
          .map((d) => d.trim())
      : [];

    const cleanNotes = notes && typeof notes === "string" ? notes.trim() : "";

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

// DELETE /:movieMondayId/movies/:movieSelectionId - Remove movie from movie monday
router.delete(
  "/:movieMondayId/movies/:movieSelectionId",
  authMiddleware,
  async (req, res) => {
    try {
      const { movieMondayId, movieSelectionId } = req.params;

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

      const movieSelection = await MovieSelection.findOne({
        where: {
          id: movieSelectionId,
          movieMondayId,
        },
      });

      if (!movieSelection) {
        return res.status(404).json({ message: "Movie selection not found" });
      }

      const wasWinner = movieSelection.isWinner;

      await movieSelection.destroy();

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

// GET /:id/details - Get detailed movie monday info with optional history
router.get("/:id/details", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const includeHistory = req.query.include_history === "true";

    const movieMonday = await MovieMonday.findOne({
      where: { id },
      include: [
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
        {
          model: MovieSelection,
          as: "movieSelections",
          include: [
            {
              model: MovieCast,
              as: "cast",
              attributes: ["id", "actorId", "name", "character", "profilePath"],
            },
            {
              model: MovieCrew,
              as: "crew",
              attributes: [
                "id",
                "personId",
                "name",
                "job",
                "department",
                "profilePath",
              ],
            },
          ],
        },
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
    });

    if (!movieMonday) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    const userGroupIds = req.userGroups.map((group) => group.id);
    if (!userGroupIds.includes(movieMonday.GroupId)) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this Movie Monday" });
    }

    const stats = await generateMovieMondayStats(movieMonday);

    const response = {
      movieMonday,
      stats,
    };

    if (includeHistory) {
      const allMovieMondays = await MovieMonday.findAll({
        where: {
          GroupId: movieMonday.GroupId,
          id: { [Op.ne]: movieMonday.id },
        },
        include: [
          {
            model: User,
            as: "picker",
            attributes: ["id", "username"],
          },
          {
            model: MovieSelection,
            as: "movieSelections",
            include: [
              {
                model: MovieCast,
                as: "cast",
                attributes: ["id", "actorId", "name"],
              },
              {
                model: MovieCrew,
                as: "crew",
                attributes: ["id", "personId", "name", "job"],
              },
            ],
          },
          {
            model: MovieMondayEventDetails,
            as: "eventDetails",
          },
        ],
        order: [["date", "DESC"]],
      });

      response.history = await generateHistoricalStats(
        movieMonday,
        allMovieMondays
      );
    }

    res.json(response);
  } catch (error) {
    console.error("Error fetching Movie Monday details:", error);
    res.status(500).json({ message: "Failed to fetch Movie Monday details" });
  }
});

router.get("/public/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    const movieMonday = await MovieMonday.findOne({
      where: {
        slug,
        isPublic: true, // Only public entries
      },
      include: [
        {
          model: Group,
          attributes: ["id", "name", "slug", "isPublic"],
          where: { isPublic: true }, // Ensure group is also public
        },
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
        {
          model: MovieSelection,
          as: "movieSelections",
          include: [
            {
              model: MovieCast,
              as: "cast",
              attributes: ["id", "actorId", "name", "character", "profilePath"],
            },
            {
              model: MovieCrew,
              as: "crew",
              attributes: ["id", "personId", "name", "job"],
            },
          ],
        },
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
    });

    if (!movieMonday) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    // Get stats
    const stats = await generateMovieMondayStats(movieMonday);

    res.json({
      movieMonday,
      stats,
      group: movieMonday.Group,
    });
  } catch (error) {
    console.error("Error fetching public Movie Monday:", error);
    res.status(500).json({ message: "Failed to fetch Movie Monday" });
  }
});

// GET all public movie mondays for a group
// GET all public movie mondays for a group by slug
router.get("/browse/group/:groupSlug", async (req, res) => {
  try {
    const { groupSlug } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const group = await Group.findOne({
      where: { slug: groupSlug, isPublic: true },
      include: [
        {
          model: User,
          attributes: ["id", "username"],
        },
      ],
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const movieMondays = await MovieMonday.findAndCountAll({
      where: {
        GroupId: group.id,
        isPublic: true,
      },
      include: [
        {
          model: User,
          as: "picker",
          attributes: ["id", "username"],
        },
        {
          model: MovieSelection,
          as: "movieSelections",
          attributes: ["id", "tmdbMovieId", "title", "posterPath", "isWinner"],
        },
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
      order: [["date", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    // Calculate group stats
    const allMovieMondays = await MovieMonday.findAll({
      where: {
        GroupId: group.id,
        isPublic: true,
      },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
          include: [
            {
              model: MovieCast,
              as: "cast",
            },
            {
              model: MovieCrew,
              as: "crew",
            },
          ],
        },
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
        },
      ],
    });

    const stats = calculateGroupStats(allMovieMondays, group);

    res.json({
      group: {
        id: group.id,
        name: group.name,
        slug: group.slug,
        description: group.description,
        coverImagePath: group.coverImagePath,
        owner: {
          id: group.createdById,
          username:
            group.Users.find((u) => u.id === group.createdById)?.username ||
            "Unknown",
        },
        members: group.Users,
        stats,
      },
      movieMondays: movieMondays.rows,
      totalCount: movieMondays.count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(movieMondays.count / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error fetching group movie mondays:", error);
    res.status(500).json({ message: "Failed to fetch movie mondays" });
  }
});

router.post("/:id/like", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const movieMonday = await MovieMonday.findByPk(id);
    if (!movieMonday) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    // Check if already liked
    const existingLike = await MovieMondayLike.findOne({
      where: { movieMondayId: id, userId },
    });

    if (existingLike) {
      // Unlike
      await existingLike.destroy();
      await movieMonday.decrement("likesCount");
      return res.json({ liked: false, likesCount: movieMonday.likesCount - 1 });
    } else {
      // Like
      await MovieMondayLike.create({ movieMondayId: id, userId });
      await movieMonday.increment("likesCount");
      return res.json({ liked: true, likesCount: movieMonday.likesCount + 1 });
    }
  } catch (error) {
    console.error("Error toggling like:", error);
    res.status(500).json({ message: "Failed to toggle like" });
  }
});
router.get("/browse/groups", async (req, res) => {
  try {
    const publicGroups = await Group.findAll({
      where: { isPublic: true },
      include: [
        {
          model: User,
          attributes: ["id", "username"],
        },
      ],
    });

    // For each group, calculate stats
    const groupsWithStats = await Promise.all(
      publicGroups.map(async (group) => {
        // Get all public movie mondays for this group
        const movieMondays = await MovieMonday.findAll({
          where: {
            GroupId: group.id,
            isPublic: true,
          },
          include: [
            {
              model: MovieSelection,
              as: "movieSelections",
              include: [
                {
                  model: MovieCast,
                  as: "cast",
                },
                {
                  model: MovieCrew,
                  as: "crew",
                },
              ],
            },
            {
              model: MovieMondayEventDetails,
              as: "eventDetails",
            },
          ],
        });

        // Calculate stats
        const stats = calculateGroupStats(movieMondays, group);

        return {
          id: group.id,
          name: group.name,
          slug: group.slug,
          description: group.description,
          coverImagePath: group.coverImagePath,
          isPublic: group.isPublic,
          likesCount: 0, // TODO: Add this when you create GroupLikes table
          stats,
          owner: {
            id: group.createdById,
            username:
              group.Users.find((u) => u.id === group.createdById)?.username ||
              "Unknown",
          },
        };
      })
    );

    res.json(groupsWithStats);
  } catch (error) {
    console.error("Error fetching public groups:", error);
    res.status(500).json({ message: "Failed to fetch public groups" });
  }
});

// Helper function to calculate group stats
function calculateGroupStats(movieMondays, group) {
  const totalWeeks = movieMondays.length;
  const allMovies = movieMondays.flatMap((mm) => mm.movieSelections || []);
  const totalMovies = allMovies.length;

  // Get member count
  const totalMembers = group.Users?.length || 0;

  // Calculate genre stats
  const genreMap = new Map();
  allMovies.forEach((movie) => {
    if (movie.genres && Array.isArray(movie.genres)) {
      movie.genres.forEach((genre) => {
        genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
      });
    }
  });

  const topGenre = Array.from(genreMap.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];

  // Calculate actor stats
  const actorMap = new Map();
  allMovies.forEach((movie) => {
    if (movie.cast) {
      movie.cast.forEach((actor) => {
        const key = `${actor.actorId}-${actor.name}`;
        actorMap.set(key, (actorMap.get(key) || 0) + 1);
      });
    }
  });

  const topActorEntry = Array.from(actorMap.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const topActor = topActorEntry
    ? {
        name: topActorEntry[0].split("-")[1],
        count: topActorEntry[1],
      }
    : null;

  // Calculate meal/drink stats
  const drinkMap = new Map();
  const mealMap = new Map();

  movieMondays.forEach((mm) => {
    if (mm.eventDetails) {
      // Cocktails
      if (
        mm.eventDetails.cocktails &&
        Array.isArray(mm.eventDetails.cocktails)
      ) {
        mm.eventDetails.cocktails.forEach((drink) => {
          drinkMap.set(drink, (drinkMap.get(drink) || 0) + 1);
        });
      }
      // Meals
      if (mm.eventDetails.meals && Array.isArray(mm.eventDetails.meals)) {
        mm.eventDetails.meals.forEach((meal) => {
          mealMap.set(meal, (mealMap.get(meal) || 0) + 1);
        });
      }
    }
  });

  const topDrink = Array.from(drinkMap.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const topMeal = Array.from(mealMap.entries()).sort((a, b) => b[1] - a[1])[0];

  // Get recent posters (last 4-8 movies)
  const recentPosters = allMovies
    .filter((m) => m.posterPath)
    .slice(-8)
    .map((m) => m.posterPath)
    .reverse();

  // Get earliest Movie Monday date
  const activeSince =
    movieMondays.length > 0
      ? movieMondays.reduce(
          (earliest, mm) =>
            new Date(mm.date) < new Date(earliest) ? mm.date : earliest,
          movieMondays[0].date
        )
      : new Date().toISOString();

  return {
    totalWeeks,
    totalMovies,
    totalMembers,
    topGenre: topGenre ? { name: topGenre[0], count: topGenre[1] } : null,
    topActor,
    signatureDrink: topDrink ? { name: topDrink[0], count: topDrink[1] } : null,
    signatureMeal: topMeal ? { name: topMeal[0], count: topMeal[1] } : null,
    activeSince,
    recentPosters,
  };
}

// PATCH update movie monday visibility
router.patch("/:id/visibility", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublic, weekTheme } = req.body;

    const movieMonday = await MovieMonday.findOne({
      where: { id },
      include: [{ model: Group }],
    });

    if (!movieMonday) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    // Verify user is in the group
    if (!req.isInGroup(movieMonday.GroupId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Only allow making public if group is public
    if (isPublic && !movieMonday.Group.isPublic) {
      return res.status(400).json({
        message: "Cannot make Movie Monday public when group is private",
      });
    }

    // Generate slug if making public and doesn't have one
    if (isPublic && !movieMonday.slug) {
      const baseSlug = `${movieMonday.Group.slug}-${movieMonday.date}`;
      movieMonday.slug = baseSlug;
    }

    if (isPublic !== undefined) movieMonday.isPublic = isPublic;
    if (weekTheme !== undefined) movieMonday.weekTheme = weekTheme;

    await movieMonday.save();

    res.json(movieMonday);
  } catch (error) {
    console.error("Error updating visibility:", error);
    res.status(500).json({ message: "Failed to update visibility" });
  }
});

// ============================================================================
// PARAMETERIZED ROUTES - MUST BE LAST
// ============================================================================

// GET /:date - Get movie monday by date (MUST be after all specific routes)
router.get("/:date", authMiddleware, async (req, res) => {
  try {
    const dateStr = decodeURIComponent(req.params.date);
    console.log("Searching for MovieMonday:", {
      dateStr,
      userGroups: req.userGroups.map((g) => g.id),
      userId: req.user.id,
    });

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      console.warn(`Invalid date format: ${dateStr}`);
      return res.status(400).json({
        message: "Invalid date format. Expected YYYY-MM-DD format.",
        receivedDate: dateStr,
      });
    }

    const userGroupIds = req.userGroups.map((group) => group.id);

    if (!userGroupIds.length) {
      return res.json({
        date: dateStr,
        status: "not_created",
        movieSelections: [],
      });
    }

    const movieMonday = await MovieMonday.findOne({
      where: {
        GroupId: userGroupIds,
        date: dateStr,
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

    if (movieMonday.eventDetails && movieMonday.eventDetails.cocktails) {
      if (typeof movieMonday.eventDetails.cocktails === "string") {
        movieMonday.eventDetails.cocktails = movieMonday.eventDetails.cocktails
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
      }
    }

    res.json(movieMonday);
  } catch (error) {
    console.error("Error in GET /:date route:", error);
    res.status(500).json({ message: "Failed to fetch Movie Monday data" });
  }
});

// ============================================================================
// MODEL HOOKS
// ============================================================================

MovieMonday.afterCreate(async (instance, options) => {
  try {
    await Statistic.increment("totalMovieMondays");
    invalidateStatsCache();
  } catch (error) {
    console.error("Error incrementing totalMovieMondays:", error);
  }
});

MovieMondayEventDetails.afterSave(async (instance, options) => {
  try {
    let mealsCount = 0;
    if (instance.meals) {
      if (Array.isArray(instance.meals)) {
        mealsCount = instance.meals.length;
      } else if (typeof instance.meals === "string") {
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

    let cocktailsCount = 0;
    if (instance.cocktails) {
      if (Array.isArray(instance.cocktails)) {
        cocktailsCount = instance.cocktails.length;
      } else if (typeof instance.cocktails === "string") {
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

    if (options.isNewRecord) {
      if (mealsCount > 0) {
        await Statistic.increment("totalMealsShared", mealsCount);
      }

      if (cocktailsCount > 0) {
        await Statistic.increment("totalCocktailsConsumed", cocktailsCount);
      }

      invalidateStatsCache();
    }
  } catch (error) {
    console.error("Error updating meal/cocktail statistics:", error);
  }
});

module.exports = router;
