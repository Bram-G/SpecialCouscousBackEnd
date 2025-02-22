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
    
    // Or from cookies
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
      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Log the decoded token to check its structure
      console.log('Decoded token:', decoded);

      if (!decoded || !decoded.id) {
        return res.status(401).json({
          message: 'Authentication failed',
          details: 'Invalid token structure'
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
        return res.status(401).json({
          message: 'Authentication failed',
          details: 'User not found'
        });
      }

      // Add user info to request
      req.user = user;
      req.userId = user.id;
      req.userGroups = user.Groups || [];
      
      // Helper methods
      req.isInGroup = (groupId) => {
        return user.Groups.some(group => group.id === groupId);
      };

      req.isGroupOwner = (groupId) => {
        return user.Groups.some(group => 
          group.id === groupId && group.createdById === user.id
        );
      };

      next();
    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError);
      
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