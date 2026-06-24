// src/scripts/verifyAllUsers.js
//
// One-off fix: marks every existing user as verified so they can log in.
// Run with:
//   heroku run node src/scripts/verifyAllUsers.js --app moviemondaybackend
//
// (If you only want to unlock your own account, add a where clause —
//  e.g. { where: { username: "Bram" } } — instead of {}.)

const { User, sequelize } = require("../models");

(async () => {
  try {
    const [count] = await User.update(
      { isVerified: true },
      { where: {} } // all users
    );
    console.log(`Marked ${count} user(s) as verified.`);
  } catch (err) {
    console.error("Error verifying users:", err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
