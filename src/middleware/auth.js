const jwt = require('jsonwebtoken');
const { User } = require('../models'); // Add this

const authMiddleware = async (req, res, next) => { // Make it async
  try {
    let token;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    if (!token && req.cookies) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ 
        message: 'Authentication required',
        details: 'No token provided'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded token:', decoded);
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        return res.status(401).json({
          message: 'Token expired',
          details: 'Please log in again'
        });
      }

      // Fetch complete user from database
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(401).json({
          message: 'Authentication failed',
          details: 'User not found'
        });
      }

      // Add complete user object to request
      req.user = user;
      
      res.header('Access-Control-Allow-Credentials', 'true');
      
      next();
    } catch (jwtError) {
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          message: 'Invalid token',
          details: 'Token signature is invalid'
        });
      } else if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: 'Token expired',
          details: 'Please log in again'
        });
      }
      
      throw jwtError;
    }
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(500).json({
      message: 'Authentication error',
      details: 'An unexpected error occurred'
    });
  }
};

module.exports = authMiddleware;