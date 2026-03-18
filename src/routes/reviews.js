const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const { UserReview } = require("../models");
const { Op } = require("sequelize");

// ============================================================
// GET /api/reviews/mine  —  Current user's reviews (paginated)
// ============================================================
router.get("/mine", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const { count, rows } = await UserReview.findAndCountAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    res.json({
      reviews: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
});

// ============================================================
// GET /api/reviews/user/:userId  —  Public reviews for a user
// ============================================================
router.get("/user/:userId", optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const isOwner = req.user?.id === parseInt(userId);
    const where = { userId: parseInt(userId) };
    if (!isOwner) where.isPublic = true;

    const { count, rows } = await UserReview.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    res.json({
      reviews: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching user reviews:", error);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
});

// ============================================================
// POST /api/reviews  —  Create a review
// ============================================================
router.post("/", auth, async (req, res) => {
  try {
    const {
      tmdbMovieId,
      movieTitle,
      posterPath,
      rating,
      reviewText,
      isPublic = true,
      containsSpoilers = false,
    } = req.body;

    if (!tmdbMovieId || isNaN(tmdbMovieId)) {
      return res.status(400).json({ message: "Valid movie ID is required" });
    }
    if (!movieTitle || !movieTitle.trim()) {
      return res.status(400).json({ message: "Movie title is required" });
    }
    if (!rating || rating < 1 || rating > 10) {
      return res.status(400).json({ message: "Rating must be between 1 and 10" });
    }
    if (reviewText && reviewText.length > 2000) {
      return res.status(400).json({ message: "Review cannot exceed 2000 characters" });
    }

    // One review per user per movie
    const existing = await UserReview.findOne({
      where: { userId: req.user.id, tmdbMovieId: parseInt(tmdbMovieId) },
    });
    if (existing) {
      return res.status(409).json({ message: "You have already reviewed this movie" });
    }

    const review = await UserReview.create({
      userId: req.user.id,
      tmdbMovieId: parseInt(tmdbMovieId),
      movieTitle: movieTitle.trim(),
      posterPath: posterPath || null,
      rating: parseInt(rating),
      reviewText: reviewText?.trim() || null,
      isPublic: Boolean(isPublic),
      containsSpoilers: Boolean(containsSpoilers),
    });

    res.status(201).json(review);
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ message: "Failed to create review" });
  }
});

// ============================================================
// PUT /api/reviews/:id  —  Update own review
// ============================================================
router.put("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid review ID" });
    }

    const review = await UserReview.findByPk(id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (review.userId !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to edit this review" });
    }

    const { rating, reviewText, isPublic, containsSpoilers } = req.body;

    if (rating !== undefined && (rating < 1 || rating > 10)) {
      return res.status(400).json({ message: "Rating must be between 1 and 10" });
    }
    if (reviewText && reviewText.length > 2000) {
      return res.status(400).json({ message: "Review cannot exceed 2000 characters" });
    }

    const updateData = {};
    if (rating !== undefined) updateData.rating = parseInt(rating);
    if (reviewText !== undefined) updateData.reviewText = reviewText?.trim() || null;
    if (isPublic !== undefined) updateData.isPublic = Boolean(isPublic);
    if (containsSpoilers !== undefined) updateData.containsSpoilers = Boolean(containsSpoilers);

    await review.update(updateData);
    res.json(review);
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({ message: "Failed to update review" });
  }
});

// ============================================================
// DELETE /api/reviews/:id  —  Delete own review
// ============================================================
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid review ID" });
    }

    const review = await UserReview.findByPk(id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    if (review.userId !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to delete this review" });
    }

    await review.destroy();
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ message: "Failed to delete review" });
  }
});

module.exports = router;
