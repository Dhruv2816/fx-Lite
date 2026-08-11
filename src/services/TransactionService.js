'use strict';

const crypto = require('crypto');
const { db } = require('../config/db');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/ApiError');
const walletService = require('./WalletService');
const rateService = require('./RateService');

/**
 * TransactionService
 *
 * The orchestrator for the "convert currency" use case described in
 * requirement #5. It composes WalletService (balance rules) and
 * RateService (external FX rate) and is the only class that knows the
 * full multi-step workflow end-to-end.
 *
 * Atomicity: steps 4 (debit) and 5 (ledger insert) below MUST succeed or
 * fail together — we never want a debit to happen without a matching
 * credit + ledger row. better-sqlite3's db.transaction() wraps a plain
 * function in BEGIN / COMMIT, and automatically issues a ROLLBACK if the
 * function throws, which is exactly the guarantee requirement #5 asks for.
 */
class TransactionService {
  constructor(walletSvc = walletService, rateSvc = rateService, database = db) {
    this.walletService = walletSvc;
    this.rateService = rateSvc;
    this.db = database;
  }

  /**
   * Executes a cross-currency conversion for a user.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.fromCurrency
   * @param {string} params.toCurrency
   * @param {number} params.amount
   * @returns {Promise<object>} the persisted ledger entry
   */
  async convert({ userId, fromCurrency, toCurrency, amount }) {
    this.#validateInput({ userId, fromCurrency, toCurrency, amount });

    fromCurrency = fromCurrency.toUpperCase();
    toCurrency = toCurrency.toUpperCase();

    if (fromCurrency === toCurrency) {
      throw ApiError.badRequest('fromCurrency and toCurrency must be different');
    }

    // Step 1: sufficient-funds check (fast fail before any I/O to the
    // external rate API, and before opening a DB transaction).
    this.walletService.assertSufficientFunds(userId, fromCurrency, amount);

    // Step 2 & 3: fetch the live rate and compute the converted amount.
    // This is an async network call, so it happens OUTSIDE the synchronous
    // DB transaction below — better-sqlite3 transactions must be
    // synchronous, and we don't want to hold a DB lock while waiting on
    // an external HTTP request anyway.
    const { rate } = await this.rateService.getRate(fromCurrency, toCurrency);
    const amountCredited = this.#round(amount * rate);
    const transactionId = crypto.randomUUID();

    // Step 4 & 5: atomically debit, credit, and write the ledger row.
    // db.transaction(fn) returns a new function; calling it immediately
    // runs fn inside BEGIN/COMMIT and ROLLBACKs automatically on throw.
    const runAtomically = this.db.transaction(() => {
      this.walletService.debit(userId, fromCurrency, amount, this.db);
      this.walletService.credit(userId, toCurrency, amountCredited, this.db);

      return Transaction.create(
        {
          transactionId,
          userId,
          fromCurrency,
          toCurrency,
          amountDeducted: this.#round(amount),
          exchangeRate: rate,
          amountCredited,
        },
        this.db
      );
    });

    try {
      return runAtomically();
    } catch (err) {
      // Any failure inside runAtomically() has already been rolled back
      // by better-sqlite3; we just normalize the error for the API layer.
      throw ApiError.internal('Failed to record transaction; changes were rolled back', {
        reason: err.message,
      });
    }
  }

  /** Returns recent ledger history for a user. */
  getHistory(userId, limit) {
    return Transaction.findAllByUser(userId, limit);
  }

  // --- private helpers -----------------------------------------------------
  #validateInput({ userId, fromCurrency, toCurrency, amount }) {
    if (!userId) throw ApiError.badRequest('"userId" is required');
    if (!fromCurrency) throw ApiError.badRequest('"fromCurrency" is required');
    if (!toCurrency) throw ApiError.badRequest('"toCurrency" is required');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw ApiError.badRequest('"amount" must be a positive number');
    }
  }

  #round(value) {
    return Math.round(value * 100) / 100;
  }
}

module.exports = new TransactionService();
module.exports.TransactionService = TransactionService;
