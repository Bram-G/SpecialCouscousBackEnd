'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, get all existing data
    const eventDetails = await queryInterface.sequelize.query(
      'SELECT id, meals, desserts FROM "MovieMondayEventDetails";',
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Process the existing data to convert strings to JSON arrays
    const processedData = eventDetails.map(detail => {
      return {
        id: detail.id,
        meals: detail.meals ? JSON.stringify([detail.meals]) : JSON.stringify([]),
        desserts: detail.desserts ? JSON.stringify([detail.desserts]) : JSON.stringify([])
      };
    });

    // Update each record with the new JSON array format
    for (const detail of processedData) {
      await queryInterface.sequelize.query(
        `UPDATE "MovieMondayEventDetails" 
         SET meals = '${detail.meals}', desserts = '${detail.desserts}'
         WHERE id = ${detail.id};`
      );
    }

    return Promise.resolve();
  },

  down: async (queryInterface, Sequelize) => {
    // If you need to roll back, you'd have to convert arrays back to strings
    // This is a simplified version and would need more error handling in a real implementation
    const eventDetails = await queryInterface.sequelize.query(
      'SELECT id, meals, desserts FROM "MovieMondayEventDetails";',
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const detail of eventDetails) {
      try {
        const mealsArray = JSON.parse(detail.meals);
        const dessertsArray = JSON.parse(detail.desserts);
        
        await queryInterface.sequelize.query(
          `UPDATE "MovieMondayEventDetails" 
           SET meals = '${mealsArray[0] || ""}', desserts = '${dessertsArray[0] || ""}'
           WHERE id = ${detail.id};`
        );
      } catch (error) {
        console.error(`Error processing data for id ${detail.id}:`, error);
      }
    }

    return Promise.resolve();
  }
};