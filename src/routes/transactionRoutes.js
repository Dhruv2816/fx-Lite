'use strict';

const express = require('express');
const transactionController = require('../controllers/TransactionController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// POST /api/transaction/convert -> execute a cross-currency swap
router.post('/convert', asyncHandler(transactionController.convert.bind(transactionController)));

// GET /api/transaction/:userId -> ledger history for a user (bonus, useful for verification)
router.get('/:userId', asyncHandler(transactionController.getHistory.bind(transactionController)));

module.exports = router;
