'use strict';

const express = require('express');
const walletController = require('../controllers/WalletController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /api/wallet/:userId -> multi-currency balances for a user
router.get('/:userId', asyncHandler(walletController.getWallet.bind(walletController)));

module.exports = router;
