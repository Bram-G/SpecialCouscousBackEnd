'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get all event details
    const eventDetails = await queryInterface.sequelize.query(
      'SELECT id, meals, cocktails, desserts FROM "MovieMondayEventDetails";',
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Process each record
    for (const detail of eventDetails) {
      // Process meals
      let mealsArray;
      try {
        mealsArray = JSON.parse(detail.meals);
      } catch (e) {
        // If not JSON, create array with single value
        mealsArray = detail.meals ? [detail.meals] : [];
      }

      // Process desserts
      let dessertsArray;
      try {
        dessertsArray = JSON.parse(detail.desserts);
      } catch (e) {
        dessertsArray = detail.desserts ? [detail.desserts] : [];
      }

      // Process cocktails
      let cocktailsArray;
      try {
        cocktailsArray = JSON.parse(detail.cocktails);
      } catch (e) {
        cocktailsArray = detail.cocktails ? [detail.cocktails] : [];
      }

      // Update the record with properly formatted JSON
      await queryInterface.sequelize.query(
        `UPDATE "MovieMondayEventDetails" 
         SET meals = :meals, desserts = :desserts, cocktails = :cocktails
         WHERE id = :id`,
        { 
          replacements: { 
            id: detail.id,
            meals: JSON.stringify(mealsArray),
            desserts: JSON.stringify(dessertsArray),
            cocktails: JSON.stringify(cocktailsArray),
          },
          type: Sequelize.QueryTypes.UPDATE 
        }
      );
    }
  },

  down: async () => {
    // No easy way to downgrade since we're standardizing formats
    return Promise.resolve();
  }
};