const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WatchlistItem = sequelize.define('WatchlistItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'WatchlistCategories',
        key: 'id'
      }
    },
    tmdbMovieId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    posterPath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    addedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    userNote: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    userRating: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    watched: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    watchedDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isWinner: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'WatchlistItems',
    timestamps: true
  });

  return WatchlistItem;
};