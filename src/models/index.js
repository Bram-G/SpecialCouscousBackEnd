const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING(128),
    allowNull: false
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
  drinks: DataTypes.TEXT
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

// Define relationships
User.belongsToMany(Group, { through: 'GroupMembers' });
Group.belongsToMany(User, { through: 'GroupMembers' });
Group.belongsTo(User, { as: 'createdBy' });
MovieMonday.belongsTo(Group);
MovieMonday.belongsTo(User, { as: 'picker' });
MovieMonday.belongsToMany(Movie, { through: 'MovieSelections' });
Movie.belongsToMany(MovieMonday, { through: 'MovieSelections' });

module.exports = {
  User,
  Group,
  MovieMonday,
  Movie,
  sequelize
};