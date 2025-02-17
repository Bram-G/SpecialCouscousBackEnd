const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

require('dotenv').config();

const app = express();

// Middleware configuration
app.use(express.json());
app.use(cookieParser()); // Add this before routes but after express.json()

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['set-cookie']
}));

// Routes
const authRoutes = require('./routes/auth');
const movieMondayRoutes = require('./routes/movieMonday');
const groupsRouter = require('./routes/groups');

// Route middleware
app.use('/auth', authRoutes);
app.use('/api/movie-monday', movieMondayRoutes);
app.use('/api', groupsRouter);

// Error handling middleware - should be after routes
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler - should be after routes but before error handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 8000;

const { sequelize } = require('./models');

// Database connection and server startup
sequelize.sync({ alter: true }).then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(error => {
  console.error('Unable to connect to the database:', error);
});