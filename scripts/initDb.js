'use strict';

/**
 * scripts/initDb.js
 *
 * Standalone script to (re)create the database schema and seed a demo
 * user so the API is immediately testable after `git clone`.
 *
 * Usage: npm run init-db
 */

const { db, initializeSchema, DB_PATH } = require('../src/config/db');
const Wallet = require('../src/models/Wallet');

function seed() {
  initializeSchema();

  // Requirement #6.3: mock user "101" with 1000 USD and 50000 INR.
  const DEMO_USER_ID = '101';

  const seedTxn = db.transaction(() => {
    Wallet.upsertBalance(DEMO_USER_ID, 'USD', 1000, db);
    Wallet.upsertBalance(DEMO_USER_ID, 'INR', 50000, db);
  });

  seedTxn();

  console.log('✅ Database initialized at:', DB_PATH);
  console.log(`✅ Seeded demo user "${DEMO_USER_ID}" with balances:`);
  console.log('   - 1000 USD');
  console.log('   - 50000 INR');
  console.log('\nTry it out:');
  console.log(`  curl http://localhost:3000/api/wallet/${DEMO_USER_ID}`);
}

seed();
