const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const WatchlistLike = sequelize.define('WatchlistLike', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    watchlistCategoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'WatchlistCategories',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    }
  }, {
    tableName: 'WatchlistLikes',
    timestamps: true,
    updatedAt: false
  });

  return WatchlistLike;
};