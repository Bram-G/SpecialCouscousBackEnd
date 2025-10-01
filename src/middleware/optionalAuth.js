const jwt = require("jsonwebtoken");
const { User, Group } = require("../models");

const optionalAuth = async (req, res, next) => {
  try {
    let token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token && req.cookies) {
      token = req.cookies.token;
    }

    // If no token, just continue without setting req.user
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findOne({
        where: { id: decoded.id },
        include: [{
          model: Group,
          through: "GroupMembers",
          attributes: ["id", "name", "createdById"],
        }],
      });

      if (user) {
        req.user = user;
        req.userId = user.id;
        req.userGroups = user.Groups || [];
      }
    } catch (jwtError) {
      // Invalid token, treat as unauthenticated
      console.log('Invalid token in optional auth:', jwtError.message);
    }

    next();
  } catch (error) {
    console.error("Optional Auth Middleware Error:", error);
    next(); // Continue anyway
  }
};

module.exports = optionalAuth;