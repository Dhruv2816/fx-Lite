'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

require('dotenv').config();

/**
 * Database connection module.
 *
 * Design choice: better-sqlite3 is used instead of the async `sqlite3`
 * driver because it is SYNCHRONOUS. For a ledger service, synchronous
 * writes make it trivial to wrap multi-step balance updates in a single
 * native SQLite transaction (db.transaction(fn)) without juggling promises
 * or callback hell — this directly supports requirement #5 (BEGIN/COMMIT/
 * ROLLBACK consistency) with a clean, readable API.
 *
 * This module exports a single shared Database instance (a lightweight
 * Singleton) so the whole app talks to one open connection/file handle.
 */

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'fxlite.db');

// Ensure the containing folder exists (important for Docker volumes/first run)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Pragmas tuned for a small service: WAL improves concurrent read/write
// behaviour, and foreign_keys enforces referential integrity if we extend
// the schema later.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Creates the schema if it does not already exist. Safe to call on every
 * boot (idempotent) — this is what lets `server.js` guarantee the tables
 * are present even if someone forgets to run the seed script.
 */
function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    TEXT    NOT NULL,
      currency  TEXT    NOT NULL,
      balance   REAL    NOT NULL DEFAULT 0,
      UNIQUE(userId, currency)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      transactionId   TEXT PRIMARY KEY,
      userId          TEXT NOT NULL,
      fromCurrency    TEXT NOT NULL,
      toCurrency      TEXT NOT NULL,
      amountDeducted  REAL NOT NULL,
      exchangeRate    REAL NOT NULL,
      amountCredited  REAL NOT NULL,
      timestamp       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_wallets_userId ON wallets(userId);
    CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId);
  `);
}

// Run schema bootstrap immediately, at module-load time. This is required
// because Model classes (e.g. Wallet, Transaction) prepare their SQL
// statements eagerly in static field initializers as soon as they are
// `require`d — those `db.prepare(...)` calls fail if the tables don't
// exist yet. Running it here guarantees the schema is always in place
// before any model file finishes loading, regardless of require order.
initializeSchema();

module.exports = { db, initializeSchema, DB_PATH };
