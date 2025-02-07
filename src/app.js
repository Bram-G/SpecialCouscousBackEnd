const express = require('express');
const app = express();
require('dotenv').config();

const authRoutes = require('./routes/auth');
const movieMondayRoutes = require('./routes/movieMonday');

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/movie-monday', movieMondayRoutes);

const PORT = process.env.PORT || 3000;

const { sequelize } = require('./models');

sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});