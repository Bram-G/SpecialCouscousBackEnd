const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [3, 30]
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [6, 100]
    }
  }
});

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

const MovieMonday = sequelize.define('MovieMonday', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  meal: DataTypes.TEXT,
  dessert: DataTypes.TEXT,
  drinks: DataTypes.TEXT,
  status: {
    type: DataTypes.ENUM('planned', 'in-progress', 'completed'),
    defaultValue: 'planned'
  }
});

const Movie = sequelize.define('Movie', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  imgLink: DataTypes.TEXT,
  actors: DataTypes.TEXT,
  rating: DataTypes.FLOAT,
  length: DataTypes.INTEGER,
  yearReleased: DataTypes.INTEGER,
  description: DataTypes.TEXT
});

const GroupInvite = sequelize.define('GroupInvite', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
    defaultValue: 'pending'
  },
  expiresAt: {
    type: DataTypes.DATE
  }
});

// Add relationships
GroupInvite.belongsTo(User, { as: 'invitedBy' });
GroupInvite.belongsTo(User, { as: 'invitedUser' });
GroupInvite.belongsTo(Group);

// Define relationships
Group.belongsTo(User, { 
  as: 'createdBy',
  foreignKey: {
    allowNull: false
  }
});

MovieMonday.belongsTo(Group, {
  foreignKey: {
    allowNull: false
  },
  onDelete: 'CASCADE'
});

MovieMonday.belongsTo(User, { 
  as: 'picker',
  foreignKey: {
    allowNull: false
  }
});

User.belongsToMany(Group, { through: 'GroupMembers' });
Group.belongsToMany(User, { through: 'GroupMembers' });
MovieMonday.belongsToMany(Movie, { through: 'MovieSelections' });
Movie.belongsToMany(MovieMonday, { through: 'MovieSelections' });

module.exports = {
  User,
  Group,
  MovieMonday,
  Movie,
  GroupInvite,
  sequelize
};