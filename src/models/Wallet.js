'use strict';

const { db } = require('../config/db');

/**
 * Wallet (Model)
 *
 * Encapsulates all raw SQL access to the `wallets` table. An instance
 * represents a single wallet row (one user's balance in one currency).
 * Static methods act as a small repository/finder API so Services never
 * write raw SQL themselves — this keeps the persistence concern isolated
 * from business logic (Single Responsibility Principle).
 *
 * Prepared statements are created once at module load (better-sqlite3
 * best practice) rather than per-call, for performance.
 */
class Wallet {
  constructor({ id, userId, currency, balance }) {
    this.id = id;
    this.userId = userId;
    this.currency = currency;
    this.balance = balance;
  }

  /** Find a single wallet row by userId + currency. Returns Wallet|null */
  static findOne(userId, currency) {
    const row = Wallet.#findOneStmt.get(userId, currency);
    return row ? new Wallet(row) : null;
  }

  /** Find every currency balance belonging to a user. Returns Wallet[] */
  static findAllByUser(userId) {
    const rows = Wallet.#findAllByUserStmt.all(userId);
    return rows.map((row) => new Wallet(row));
  }

  /**
   * Ensures a wallet row exists for (userId, currency), creating it with a
   * zero balance if necessary. Useful so a user can receive a currency
   * they've never held before (e.g. first-ever conversion into EUR).
   */
  static ensureExists(userId, currency, db_ = db) {
    db_.prepare(
      `INSERT INTO wallets (userId, currency, balance)
       VALUES (?, ?, 0)
       ON CONFLICT(userId, currency) DO NOTHING`
    ).run(userId, currency);
  }

  /**
   * Atomically adjusts a wallet balance by `delta` (positive to credit,
   * negative to debit). Accepts an optional `db_` handle so callers can
   * pass in a transaction-scoped statement runner.
   */
  static adjustBalance(userId, currency, delta, db_ = db) {
    Wallet.ensureExists(userId, currency, db_);
    db_
      .prepare(
        `UPDATE wallets SET balance = balance + ?
         WHERE userId = ? AND currency = ?`
      )
      .run(delta, userId, currency);
  }

  /** Seed/insert a wallet with a specific starting balance (used by initDb). */
  static upsertBalance(userId, currency, balance, db_ = db) {
    db_
      .prepare(
        `INSERT INTO wallets (userId, currency, balance)
         VALUES (?, ?, ?)
         ON CONFLICT(userId, currency) DO UPDATE SET balance = excluded.balance`
      )
      .run(userId, currency, balance);
  }

  // --- Prepared statements (private static fields) -----------------------
  static #findOneStmt = db.prepare(
    'SELECT id, userId, currency, balance FROM wallets WHERE userId = ? AND currency = ?'
  );
  static #findAllByUserStmt = db.prepare(
    'SELECT id, userId, currency, balance FROM wallets WHERE userId = ? ORDER BY currency'
  );
}

module.exports = Wallet;
