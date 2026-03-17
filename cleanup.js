const { sequelize } = require('./src/models');
const sql = 'DELETE FROM "GroupMembers" WHERE "GroupId" = 1 AND "UserId" IN (SELECT id FROM "Users" WHERE username IN (\'BramTestUser\',\'Sydtest\',\'Ellietest\',\'Timtest\',\'Kyletest\',\'Austintest\'))';
sequelize.query(sql)
  .then(() => { console.log('Done!'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
