'use strict';
// ============================================================
//  engineRoutes.js  —  Routes for the FX-Core C++ engine
// ============================================================

const express    = require('express');
const { submitOrder, getStatus } = require('../controllers/EngineController');

const router = express.Router();

// POST /api/engine/order  — submit a limit order to the C++ matching engine
router.post('/order', submitOrder);

// GET  /api/engine/status — health check for the C++ engine process
router.get('/status', getStatus);

module.exports = router;
