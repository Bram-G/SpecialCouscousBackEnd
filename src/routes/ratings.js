// src/routes/ratings.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const { fn, col } = require("sequelize");
const { MovieMonday, MovieMondayRating, Group } = require("../models");

// Compute average + count for a Monday
async function getAggregate(movieMondayId) {
  const row = await MovieMondayRating.findOne({
    where: { movieMondayId },
    attributes: [
      [fn("AVG", col("rating")), "average"],
      [fn("COUNT", col("id")), "count"],
    ],
    raw: true,
  });

  const average =
    row && row.average ? Math.round(parseFloat(row.average) * 10) / 10 : 0;
  const count = row && row.count ? parseInt(row.count, 10) : 0;
  return { average, count };
}

// Only public Mondays can be rated (the widget lives on the public page)
async function getPublicMonday(movieMondayId) {
  return MovieMonday.findOne({
    where: { id: movieMondayId },
    include: [{ model: Group, attributes: ["id", "isPublic"] }],
  });
}

// ============================================================
// GET /api/ratings/moviemonday/:movieMondayId
// Aggregate + the current user's own rating (if logged in)
// ============================================================
router.get("/moviemonday/:movieMondayId", optionalAuth, async (req, res) => {
  try {
    const movieMondayId = parseInt(req.params.movieMondayId, 10);
    if (isNaN(movieMondayId)) {
      return res.status(400).json({ message: "Invalid Movie Monday ID" });
    }

    const monday = await getPublicMonday(movieMondayId);
    if (!monday || !monday.Group || !monday.Group.isPublic) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    const agg = await getAggregate(movieMondayId);

    let userRating = null;
    if (req.user) {
      const mine = await MovieMondayRating.findOne({
        where: { movieMondayId, userId: req.user.id },
      });
      userRating = mine ? mine.rating : null;
    }

    res.json({ ...agg, userRating });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    res.status(500).json({ message: "Failed to fetch ratings" });
  }
});

// ============================================================
// POST /api/ratings/moviemonday/:movieMondayId
// Create or update the current user's rating (1-5)
// ============================================================
router.post("/moviemonday/:movieMondayId", auth, async (req, res) => {
  try {
    const movieMondayId = parseInt(req.params.movieMondayId, 10);
    if (isNaN(movieMondayId)) {
      return res.status(400).json({ message: "Invalid Movie Monday ID" });
    }

    const rating = parseInt(req.body.rating, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const monday = await getPublicMonday(movieMondayId);
    if (!monday || !monday.Group || !monday.Group.isPublic) {
      return res.status(404).json({ message: "Movie Monday not found" });
    }

    const [record, created] = await MovieMondayRating.findOrCreate({
      where: { movieMondayId, userId: req.user.id },
      defaults: { movieMondayId, userId: req.user.id, rating },
    });

    if (!created) {
      record.rating = rating;
      await record.save();
    }

    const agg = await getAggregate(movieMondayId);
    res.json({ ...agg, userRating: rating });
  } catch (error) {
    console.error("Error saving rating:", error);
    res.status(500).json({ message: "Failed to save rating" });
  }
});

// ============================================================
// DELETE /api/ratings/moviemonday/:movieMondayId
// Remove the current user's rating
// ============================================================
router.delete("/moviemonday/:movieMondayId", auth, async (req, res) => {
  try {
    const movieMondayId = parseInt(req.params.movieMondayId, 10);
    if (isNaN(movieMondayId)) {
      return res.status(400).json({ message: "Invalid Movie Monday ID" });
    }

    await MovieMondayRating.destroy({
      where: { movieMondayId, userId: req.user.id },
    });

    const agg = await getAggregate(movieMondayId);
    res.json({ ...agg, userRating: null });
  } catch (error) {
    console.error("Error deleting rating:", error);
    res.status(500).json({ message: "Failed to delete rating" });
  }
});

module.exports = router;