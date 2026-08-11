'use strict';

const rateService = require('../services/RateService');
const ApiError = require('../utils/ApiError');

/**
 * RateController
 *
 * Handles GET /api/rates?base=USD&target=INR
 */
class RateController {
  async getRate(req, res) {
    const { base, target } = req.query;

    if (!base || !target) {
      throw ApiError.badRequest('Query params "base" and "target" are required, e.g. ?base=USD&target=INR');
    }

    const result = await rateService.getRate(base, target);
    res.status(200).json({ success: true, data: result });
  }
}

module.exports = new RateController();
