// src/scripts/backfillMondaySlugs.js
// One-off fix: any MovieMonday belonging to a public Group but missing its
// own slug gets one generated (`${group.slug}-${date}`), matching the
// convention used everywhere else (import script, PATCH /:id/visibility).
// Run with: heroku run node src/scripts/backfillMondaySlugs.js --app moviemondaybackend

const { Group, MovieMonday, sequelize } = require("../models");
require("dotenv").config();

async function backfillMondaySlugs() {
  try {
    console.log("Starting Monday slug backfill...");
    console.log("=====================================\n");

    const publicGroups = await Group.findAll({
      where: { isPublic: true },
      attributes: ["id", "name", "slug"],
    });

    console.log(`Found ${publicGroups.length} public group(s)\n`);

    let fixedCount = 0;

    for (const group of publicGroups) {
      if (!group.slug) {
        console.log(
          `⚠ Skipping "${group.name}" — group itself has no slug`,
        );
        continue;
      }

      const mondaysNeedingSlugs = await MovieMonday.findAll({
        where: { GroupId: group.id, slug: null },
      });

      if (mondaysNeedingSlugs.length === 0) {
        console.log(`✓ "${group.name}" — all Mondays already have slugs`);
        continue;
      }

      console.log(
        `Fixing ${mondaysNeedingSlugs.length} Monday(s) for "${group.name}"...`,
      );

      for (const mm of mondaysNeedingSlugs) {
        mm.slug = `${group.slug}-${mm.date}`;
        await mm.save();
        fixedCount++;
      }
    }

    console.log("\n=====================================");
    console.log(`✓ Backfill complete — fixed ${fixedCount} Monday(s)`);
    console.log("=====================================\n");
  } catch (error) {
    console.error("Error backfilling Monday slugs:", error);
  } finally {
    await sequelize.close();
  }
}

backfillMondaySlugs();