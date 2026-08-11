'use strict';

const express = require('express');
const walletRoutes = require('./walletRoutes');
const rateRoutes = require('./rateRoutes');
const transactionRoutes = require('./transactionRoutes');

const router = express.Router();

router.use('/wallet', walletRoutes);
router.use('/rates', rateRoutes);
router.use('/transaction', transactionRoutes);

module.exports = router;
