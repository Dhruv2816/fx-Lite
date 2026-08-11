'use strict';

const Wallet = require('../models/Wallet');
const ApiError = require('../utils/ApiError');

/**
 * WalletService
 *
 * Owns all business rules around wallet balances: reading balances,
 * verifying sufficient funds, and applying debits/credits. Controllers
 * and other services (like TransactionService) never touch the Wallet
 * model directly — they go through this service, which keeps balance
 * rules (e.g. "never go negative") in one place.
 */
class WalletService {
  /**
   * Returns every currency balance held by a user as a plain object:
   * { userId, wallets: [{ currency, balance }, ...] }
   * Throws 404 if the user has no wallets at all.
   */
  getWalletsForUser(userId) {
    const wallets = Wallet.findAllByUser(userId);

    if (wallets.length === 0) {
      throw ApiError.notFound(`No wallet found for userId "${userId}"`);
    }

    return {
      userId,
      wallets: wallets.map((w) => ({
        currency: w.currency,
        balance: Number(w.balance.toFixed(2)),
      })),
    };
  }

  /** Returns the raw numeric balance a user holds in a given currency (0 if none). */
  getBalance(userId, currency) {
    const wallet = Wallet.findOne(userId, currency);
    return wallet ? wallet.balance : 0;
  }

  /**
   * Verifies the user can afford to spend `amount` of `currency`.
   * Throws a 400 ApiError (Insufficient Funds) otherwise — this satisfies
   * requirement #5, step 1 of the conversion workflow.
   */
  assertSufficientFunds(userId, currency, amount) {
    const balance = this.getBalance(userId, currency);
    if (balance < amount) {
      throw ApiError.badRequest('Insufficient Funds', {
        userId,
        currency,
        requested: amount,
        available: Number(balance.toFixed(2)),
      });
    }
  }

  /**
   * Debits `amount` from a wallet. Optionally scoped to a transaction-bound
   * database handle (`dbHandle`) so it participates in an outer atomic
   * BEGIN/COMMIT block managed by TransactionService.
   */
  debit(userId, currency, amount, dbHandle) {
    Wallet.adjustBalance(userId, currency, -Math.abs(amount), dbHandle);
  }

  /** Credits `amount` to a wallet, creating it if it doesn't exist yet. */
  credit(userId, currency, amount, dbHandle) {
    Wallet.adjustBalance(userId, currency, Math.abs(amount), dbHandle);
  }
}

// Exported as a singleton instance — this service is stateless (holds no
// per-request data), so one shared instance is sufficient for the app.
module.exports = new WalletService();
