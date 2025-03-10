// src/models/statistics.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Statistic = sequelize.define('Statistic', {
    key: {
      type: DataTypes.STRING(50),
      allowNull: false,
      primaryKey: true
    },
    value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'Statistics',
    timestamps: true
  });

  // Method to increment a statistic
  Statistic.increment = async function(key, amount = 1) {
    try {
      const [stat, created] = await this.findOrCreate({
        where: { key },
        defaults: { value: 0 }
      });
      
      await stat.increment('value', { by: amount });
      await stat.update({ lastUpdated: new Date() });
      
      return stat;
    } catch (error) {
      console.error(`Error incrementing statistic ${key}:`, error);
      throw error;
    }
  };

  // Method to retrieve multiple statistics
  Statistic.getMultiple = async function(keys) {
    try {
      const stats = await this.findAll({
        where: { key: keys }
      });
      
      // Convert to a key-value object
      return stats.reduce((acc, stat) => {
        acc[stat.key] = stat.value;
        return acc;
      }, {});
    } catch (error) {
      console.error('Error retrieving multiple statistics:', error);
      throw error;
    }
  };

  // Method to recalculate statistics based on database data
  Statistic.recalculateAll = async function(models) {
    const t = await sequelize.transaction();
    
    try {
      // Count MovieMondays
      const totalMovieMondays = await models.MovieMonday.count({ transaction: t });
      
      // Get all event details
      const eventDetails = await models.MovieMondayEventDetails.findAll({ transaction: t });
      
      let totalMealsShared = 0;
      let totalCocktailsConsumed = 0;
      
      // Process meals and cocktails
      eventDetails.forEach(event => {
        // Process meals
        if (event.meals) {
          if (Array.isArray(event.meals)) {
            totalMealsShared += event.meals.length;
          } else if (typeof event.meals === 'string') {
            try {
              const parsed = JSON.parse(event.meals);
              if (Array.isArray(parsed)) {
                totalMealsShared += parsed.length;
              } else if (parsed) {
                totalMealsShared += 1;
              }
            } catch (e) {
              totalMealsShared += 1;
            }
          } else {
            totalMealsShared += 1;
          }
        }
        
        // Process cocktails
        if (event.cocktails) {
          if (Array.isArray(event.cocktails)) {
            totalCocktailsConsumed += event.cocktails.length;
          } else if (typeof event.cocktails === 'string') {
            try {
              const parsed = JSON.parse(event.cocktails);
              if (Array.isArray(parsed)) {
                totalCocktailsConsumed += parsed.length;
              } else if (parsed) {
                totalCocktailsConsumed += 1;
              }
            } catch (e) {
              totalCocktailsConsumed += 1;
            }
          } else {
            totalCocktailsConsumed += 1;
          }
        }
      });
      
      // Update statistics
      await this.upsert({ 
        key: 'totalMovieMondays', 
        value: totalMovieMondays,
        lastUpdated: new Date()
      }, { transaction: t });
      
      await this.upsert({ 
        key: 'totalMealsShared', 
        value: totalMealsShared,
        lastUpdated: new Date()
      }, { transaction: t });
      
      await this.upsert({ 
        key: 'totalCocktailsConsumed', 
        value: totalCocktailsConsumed,
        lastUpdated: new Date()
      }, { transaction: t });
      
      await t.commit();
      
      return {
        totalMovieMondays,
        totalMealsShared,
        totalCocktailsConsumed
      };
    } catch (error) {
      await t.rollback();
      console.error('Error recalculating statistics:', error);
      throw error;
    }
  };

  return Statistic;
};