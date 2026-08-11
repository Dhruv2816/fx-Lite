'use strict';

const walletService = require('../services/WalletService');

/**
 * WalletController
 *
 * Thin translation layer between HTTP and WalletService. Controllers do
 * NOT contain business logic — they only extract request data, call the
 * appropriate service method, and shape the HTTP response.
 */
class WalletController {
  /** GET /api/wallet/:userId */
  getWallet(req, res) {
    const { userId } = req.params;
    const result = walletService.getWalletsForUser(userId);
    res.status(200).json({ success: true, data: result });
  }
}

module.exports = new WalletController();
