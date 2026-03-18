const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const auth = require("../middleware/auth");
const {
  User,
  Group,
  MovieMonday,
  MovieSelection,
  MovieMondayEventDetails,
  UserReview,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");

// ============================================================
// GET /api/users/me  —  Current user's profile
// ============================================================
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "username", "email", "bio", "avatarColor", "displayName", "createdAt"],
      include: [
        {
          model: Group,
          through: "GroupMembers",
          attributes: ["id", "name"],
        },
      ],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// ============================================================
// PUT /api/users/me  —  Update profile info
// ============================================================
router.put("/me", auth, async (req, res) => {
  try {
    const { username, email, bio, avatarColor, displayName } = req.body;
    const userId = req.user.id;

    // Validate username length
    if (username && (username.length < 3 || username.length > 30)) {
      return res.status(400).json({ message: "Username must be between 3 and 30 characters" });
    }

    // Check username uniqueness
    if (username && username !== req.user.username) {
      const existing = await User.findOne({
        where: { username, id: { [Op.ne]: userId } },
      });
      if (existing) {
        return res.status(409).json({ message: "Username already taken" });
      }
    }

    // Check email uniqueness
    if (email && email.toLowerCase().trim() !== req.user.email) {
      const existing = await User.findOne({
        where: { email: email.toLowerCase().trim(), id: { [Op.ne]: userId } },
      });
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
    }

    // Validate bio length
    if (bio && bio.length > 500) {
      return res.status(400).json({ message: "Bio cannot exceed 500 characters" });
    }

    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email.toLowerCase().trim();
    if (bio !== undefined) updateData.bio = bio.trim() || null;
    if (avatarColor !== undefined) updateData.avatarColor = avatarColor;
    if (displayName !== undefined) updateData.displayName = displayName.trim() || null;

    await User.update(updateData, { where: { id: userId } });

    const updatedUser = await User.findByPk(userId, {
      attributes: ["id", "username", "email", "bio", "avatarColor", "displayName", "createdAt"],
    });

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// ============================================================
// PUT /api/users/me/password  —  Change password
// ============================================================
router.put("/me/password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    if (newPassword.length > 100) {
      return res.status(400).json({ message: "New password is too long" });
    }

    const user = await User.findByPk(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.update({ password: hashed }, { where: { id: req.user.id } });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

// ============================================================
// GET /api/users/me/stats  —  Personal statistics
// ============================================================
router.get("/me/stats", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // All Movie Mondays where this user was the picker
    const pickedEvents = await MovieMonday.findAll({
      where: { pickerUserId: userId },
      include: [
        {
          model: MovieSelection,
          as: "movieSelections",
          attributes: ["id", "tmdbMovieId", "title", "genres", "voteAverage", "isWinner"],
        },
      ],
    });

    const totalPickEvents = pickedEvents.length;
    const allSelections = pickedEvents.flatMap((e) => e.movieSelections || []);
    const totalNominations = allSelections.length;

    // Genre breakdown across all nominated movies
    const genreCounts = {};
    allSelections.forEach((s) => {
      const genres = Array.isArray(s.genres) ? s.genres : [];
      genres.forEach((g) => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([genre, count]) => ({ genre, count }));

    // Average TMDB vote average across all nominated movies
    const moviesWithRating = allSelections.filter((s) => s.voteAverage && s.voteAverage > 0);
    const avgVoteAverage =
      moviesWithRating.length > 0
        ? (
            moviesWithRating.reduce((sum, s) => sum + parseFloat(s.voteAverage), 0) /
            moviesWithRating.length
          ).toFixed(1)
        : null;

    // Review count
    let reviewCount = 0;
    try {
      reviewCount = await UserReview.count({ where: { userId } });
    } catch {
      // UserReview table may not exist on older DB instances
    }

    // Total group sessions (all MovieMondays for this user's groups)
    const groupIds = req.userGroups.map((g) => g.id);
    const totalGroupSessions =
      groupIds.length > 0
        ? await MovieMonday.count({ where: { GroupId: groupIds } })
        : 0;

    // Pick rate — how often this user is the picker vs total group sessions
    const pickRate =
      totalGroupSessions > 0
        ? Math.round((totalPickEvents / totalGroupSessions) * 100)
        : 0;

    res.json({
      totalPickEvents,
      totalNominations,
      topGenres,
      avgVoteAverage,
      reviewCount,
      totalGroupSessions,
      pickRate,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

// ============================================================
// GET /api/users/me/picks  —  Pick history (paginated)
// ============================================================
router.get("/me/picks", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 12, 50);
    const offset = (page - 1) * limit;

    const { count, rows } = await MovieMonday.findAndCountAll({
      where: { pickerUserId: userId },
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
            "voteAverage",
          ],
        },
        {
          model: MovieMondayEventDetails,
          as: "eventDetails",
          attributes: ["cocktails", "meals", "dessert"],
          required: false,
        },
      ],
      order: [["date", "DESC"]],
      limit,
      offset,
    });

    res.json({
      picks: rows,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching picks:", error);
    res.status(500).json({ message: "Failed to fetch picks" });
  }
});

module.exports = router;
