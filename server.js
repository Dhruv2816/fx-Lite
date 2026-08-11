'use strict';

require('dotenv').config();

const createApp = require('./src/app');
const { initializeSchema, DB_PATH } = require('./src/config/db');

const PORT = process.env.PORT || 3000;

// Guarantee the schema exists even if `npm run init-db` was never run
// manually (idempotent — CREATE TABLE IF NOT EXISTS).
initializeSchema();

const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`FX-Lite server listening on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`SQLite database file: ${DB_PATH}`);
  // eslint-disable-next-line no-console
  console.log(`Tip: run "npm run init-db" to seed a demo user (101) with 1000 USD + 50000 INR.`);
});
