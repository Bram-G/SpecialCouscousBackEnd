const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Middleware configuration
app.use(express.json());
app.use(cookieParser()); // Add this before routes but after express.json()

app.use(cors({
  origin: [
    'http://localhost:3000',           // Local development
    'https://movie-monday-beta.vercel.app',  // Your Vercel URL
    'https://movie-monday-rd5dji6cr-brams-projects-69a61965.vercel.app', // Current deployment
    process.env.FRONTEND_URL           // Environment variable fallback
  ].filter(Boolean), // Remove any undefined values
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['set-cookie']
}));

// Routes


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per 15 minutes
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use('/auth/forgot-password', authLimiter);
app.use('/auth/resend-verification', authLimiter);
app.use('/auth/register', authLimiter);

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const movieMondayRoutes = require('./routes/movieMonday');
const groupsRouter = require('./routes/groups');
const watchlistRoutes = require('./routes/watchlists');


// Route middleware
app.use('/api/movie-monday', movieMondayRoutes);
app.use('/api', groupsRouter);
app.use('/api/watchlists', watchlistRoutes);

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});