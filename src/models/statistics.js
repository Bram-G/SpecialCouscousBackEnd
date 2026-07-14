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

  // Single atomic UPSERT — no findOrCreate + separate increment + separate
  // update race. Safe under concurrent hook calls from multiple requests.
  Statistic.increment = async function (key, amount = 1) {
    try {
      await sequelize.query(
        `INSERT INTO "Statistics" (key, value, "lastUpdated", "createdAt", "updatedAt")
         VALUES (:key, :amount, NOW(), NOW(), NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = "Statistics".value + :amount,
                        "lastUpdated" = NOW(),
                        "updatedAt" = NOW()`,
        { replacements: { key, amount } }
      );
    } catch (error) {
      // Log and swallow — a stats miscount should never break the request
      // that triggered it.
      console.error(`Error incrementing statistic ${key}:`, error.message);
    }
  };

  // Method to retrieve multiple statistics
  Statistic.getMultiple = async function (keys) {
    try {
      const stats = await this.findAll({ where: { key: keys } });
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
  Statistic.recalculateAll = async function (models) {
    const t = await sequelize.transaction();

    try {
      const totalMovieMondays = await models.MovieMonday.count({ transaction: t });
      const eventDetails = await models.MovieMondayEventDetails.findAll({ transaction: t });

      let totalMealsShared = 0;
      let totalCocktailsConsumed = 0;

      eventDetails.forEach(event => {
        if (event.meals) {
          if (Array.isArray(event.meals)) {
            totalMealsShared += event.meals.length;
          } else if (typeof event.meals === 'string') {
            try {
              const parsed = JSON.parse(event.meals);
              totalMealsShared += Array.isArray(parsed) ? parsed.length : (parsed ? 1 : 0);
            } catch (e) {
              totalMealsShared += 1;
            }
          } else {
            totalMealsShared += 1;
          }
        }

        if (event.cocktails) {
          if (Array.isArray(event.cocktails)) {
            totalCocktailsConsumed += event.cocktails.length;
          } else if (typeof event.cocktails === 'string') {
            try {
              const parsed = JSON.parse(event.cocktails);
              totalCocktailsConsumed += Array.isArray(parsed) ? parsed.length : (parsed ? 1 : 0);
            } catch (e) {
              totalCocktailsConsumed += 1;
            }
          } else {
            totalCocktailsConsumed += 1;
          }
        }
      });

      await this.upsert({ key: 'totalMovieMondays', value: totalMovieMondays, lastUpdated: new Date() }, { transaction: t });
      await this.upsert({ key: 'totalMealsShared', value: totalMealsShared, lastUpdated: new Date() }, { transaction: t });
      await this.upsert({ key: 'totalCocktailsConsumed', value: totalCocktailsConsumed, lastUpdated: new Date() }, { transaction: t });

      await t.commit();

      return { totalMovieMondays, totalMealsShared, totalCocktailsConsumed };
    } catch (error) {
      await t.rollback();
      console.error('Error recalculating statistics:', error);
      throw error;
    }
  };

  return Statistic;
};