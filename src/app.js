const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Middleware configuration
app.use(express.json());
app.use(cookieParser());

app.get('/setup-database', async (req, res) => {
  try {
    console.log('Starting database setup...');
    
    // Import your models to trigger table creation
    const { sequelize } = require('./models');
    
    // This will create all tables based on your models
    await sequelize.sync({ force: true });
    
    console.log('Database tables created successfully!');
    res.json({ 
      success: true, 
      message: 'Database tables created successfully! You can now run your import script.' 
    });
  } catch (error) {
    console.error('Database setup error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://movie-monday-beta.vercel.app',
    'https://movie-monday-rd5dji6cr-brams-projects-69a61965.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['set-cookie']
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use('/auth/forgot-password', authLimiter);
app.use('/auth/resend-verification', authLimiter);
app.use('/auth/register', authLimiter);

// Import routes
const authRoutes = require('./routes/auth');
const movieMondayRoutes = require('./routes/movieMonday');
const groupsRouter = require('./routes/groups');
const watchlistRoutes = require('./routes/watchlists');
const commentRoutes = require('./routes/comments'); // NEW: Import comment routes

// Mount routes
app.use('/auth', authRoutes);
app.use('/api/movie-monday', movieMondayRoutes);
app.use('/api', groupsRouter);
app.use('/api/watchlists', watchlistRoutes);
app.use('/api/comments', commentRoutes); // NEW: Mount comment routes at /api/comments

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