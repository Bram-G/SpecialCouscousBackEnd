const express = require('express');
const router = express.Router();
const { MovieMonday, Movie } = require('../models');
const authMiddleware = require('../middleware/auth');

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

module.exports = router;