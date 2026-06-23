// src/scripts/backfillMondaySlugs.js
const { sequelize } = require("../models");

async function backfill() {
  try {
    console.log("Backfilling null Movie Monday slugs...");
    const [, meta] = await sequelize.query(`
      UPDATE "MovieMondays"
      SET slug = 'movie-monday-' || to_char("date"::date, 'YYYY-MM-DD')
      WHERE slug IS NULL
    `);
    console.log(`✓ Backfill complete. Rows affected: ${meta?.rowCount ?? "?"}`);
  } catch (err) {
    console.error("Backfill failed:", err);
  } finally {
    await sequelize.close();
  }
}

backfill();
