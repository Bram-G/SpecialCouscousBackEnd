const jwt = require('jsonwebtoken');
const { User, Group } = require('../models');

const authMiddleware = async (req, res, next) => {
  try {
    let token;
    
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    
    // Fallback to cookies if no Authorization header
    if (!token && req.cookies) {
      token = req.cookies.token;
    }

    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ 
        message: 'Authentication required',
        details: 'No token provided'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded token:', decoded);

      if (!decoded.id) {
        console.log('Invalid token structure - no id field:', decoded);
        return res.status(401).json({
          message: 'Invalid token structure',
          details: 'Token missing required fields'
        });
      }

      // Fetch complete user from database
      const user = await User.findOne({
        where: { id: decoded.id },
        include: [{
          model: Group,
          through: 'GroupMembers',
          attributes: ['id', 'name', 'createdById']
        }]
      });

      if (!user) {
        console.log('User not found for id:', decoded.id);
        return res.status(401).json({
          message: 'Authentication failed',
          details: 'User not found'
        });
      }

      // Add user data to request
      req.user = user;
      req.userId = user.id;
      req.userGroups = user.Groups || [];
      
      req.isInGroup = (groupId) => {
        return user.Groups.some(group => group.id === groupId);
      };

      req.isGroupOwner = (groupId) => {
        return user.Groups.some(group => 
          group.id === groupId && group.createdById === user.id
        );
      };

      // Set CORS headers
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,UPDATE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization');
      
      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError);
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