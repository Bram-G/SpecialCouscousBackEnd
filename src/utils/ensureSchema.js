const { sequelize, GroupGuest, VoteSession, Ballot } = require("../models");

async function ensureSchema() {
  try {
    // 1) Brand-new tables
    await GroupGuest.sync();
    await VoteSession.sync();
    await Ballot.sync();

    // 2) Additive changes to existing tables
    await sequelize.query(
      `ALTER TABLE "MovieMondays" ADD COLUMN IF NOT EXISTS "pickerGuestId" INTEGER;`,
    );
    await sequelize.query(
      `ALTER TABLE "MovieMondays" ALTER COLUMN "pickerUserId" DROP NOT NULL;`,
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS "movie_mondays_picker_guest_id" ON "MovieMondays" ("pickerGuestId");`,
    );

    console.log("✅ Schema check complete (guests + live voting)");
  } catch (error) {
    // Never block the server from booting — log loudly instead.
    console.error("⚠️  ensureSchema failed:", error.message);
  }
}

module.exports = ensureSchema;