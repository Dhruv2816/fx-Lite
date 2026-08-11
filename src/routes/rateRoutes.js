'use strict';

const express = require('express');
const rateController = require('../controllers/RateController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /api/rates?base=USD&target=INR -> live conversion rate
router.get('/', asyncHandler(rateController.getRate.bind(rateController)));

module.exports = router;
