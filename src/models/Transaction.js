'use strict';

const { db } = require('../config/db');

/**
 * Transaction (Model)
 *
 * Encapsulates all raw SQL access to the `transactions` (ledger) table.
 * Every currency conversion produces exactly one immutable ledger row —
 * this class is the only place that knows how to write or read that row.
 */
class Transaction {
  constructor({
    transactionId,
    userId,
    fromCurrency,
    toCurrency,
    amountDeducted,
    exchangeRate,
    amountCredited,
    timestamp,
  }) {
    this.transactionId = transactionId;
    this.userId = userId;
    this.fromCurrency = fromCurrency;
    this.toCurrency = toCurrency;
    this.amountDeducted = amountDeducted;
    this.exchangeRate = exchangeRate;
    this.amountCredited = amountCredited;
    this.timestamp = timestamp;
  }

  /**
   * Inserts a ledger entry. Accepts an optional `db_` handle so it can be
   * called from within an outer db.transaction() block, guaranteeing the
   * ledger write is atomic with the wallet balance updates.
   */
  static create(entry, db_ = db) {
    db_
      .prepare(
        `INSERT INTO transactions
           (transactionId, userId, fromCurrency, toCurrency,
            amountDeducted, exchangeRate, amountCredited)
         VALUES (@transactionId, @userId, @fromCurrency, @toCurrency,
                 @amountDeducted, @exchangeRate, @amountCredited)`
      )
      .run(entry);

    return Transaction.findById(entry.transactionId, db_);
  }

  static findById(transactionId, db_ = db) {
    const row = db_
      .prepare('SELECT * FROM transactions WHERE transactionId = ?')
      .get(transactionId);
    return row ? new Transaction(row) : null;
  }

  /** Returns the most recent transactions for a user, newest first. */
  static findAllByUser(userId, limit = 50) {
    const rows = db
      .prepare(
        `SELECT * FROM transactions
         WHERE userId = ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(userId, limit);
    return rows.map((row) => new Transaction(row));
  }
}

module.exports = Transaction;
