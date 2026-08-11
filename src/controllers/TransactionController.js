'use strict';

const transactionService = require('../services/TransactionService');

/**
 * TransactionController
 *
 * Handles POST /api/transaction/convert and GET /api/transaction/:userId
 * (history). All the multi-step conversion logic (funds check, live rate
 * lookup, atomic ledger write) lives in TransactionService — this class
 * only marshals the HTTP request/response.
 */
class TransactionController {
  async convert(req, res) {
    const { userId, fromCurrency, toCurrency, amount } = req.body;

    const result = await transactionService.convert({
      userId,
      fromCurrency,
      toCurrency,
      amount,
    });

    res.status(201).json({ success: true, data: result });
  }

  getHistory(req, res) {
    const { userId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = transactionService.getHistory(userId, limit);
    res.status(200).json({ success: true, data: result });
  }
}

module.exports = new TransactionController();
