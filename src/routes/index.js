'use strict';

const express = require('express');
const walletRoutes      = require('./walletRoutes');
const rateRoutes        = require('./rateRoutes');
const transactionRoutes = require('./transactionRoutes');
const engineRoutes      = require('./engineRoutes');   // FX-Core C++ engine

const router = express.Router();

router.use('/wallet',      walletRoutes);
router.use('/rates',       rateRoutes);
router.use('/transaction', transactionRoutes);
router.use('/engine',      engineRoutes);              // POST /api/engine/order

module.exports = router;
