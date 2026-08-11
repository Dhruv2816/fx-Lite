'use strict';

const axios = require('axios');
const ApiError = require('../utils/ApiError');

require('dotenv').config();

const FRANKFURTER_BASE_URL =
  process.env.FRANKFURTER_BASE_URL || 'https://api.frankfurter.app';

/**
 * RateService
 *
 * Sole point of integration with the external Frankfurter API. Isolating
 * this in its own class means: (a) if we ever swap FX data providers, only
 * this file changes, and (b) all upstream-failure handling (timeouts,
 * unknown currency codes, network errors) is normalized into ApiError here
 * rather than leaking axios-specific errors into controllers.
 */
class RateService {
  constructor(httpClient = axios, baseUrl = FRANKFURTER_BASE_URL) {
    this.http = httpClient;
    this.baseUrl = baseUrl;
  }

  /**
   * Fetches the live conversion rate from `base` -> `target`.
   * @returns {Promise<{ base: string, target: string, rate: number, date: string }>}
   */
  async getRate(base, target) {
    if (!base || !target) {
      throw ApiError.badRequest('Both "base" and "target" currency codes are required');
    }

    base = base.toUpperCase();
    target = target.toUpperCase();

    if (base === target) {
      // Same-currency "conversion" is always a 1:1 rate — short-circuit
      // rather than bothering the upstream API.
      return { base, target, rate: 1, date: new Date().toISOString().slice(0, 10) };
    }

    try {
      // validateStatus: () => true tells axios NEVER to throw on any HTTP
      // status. We inspect the status ourselves below so we can return the
      // correct code to OUR client (4xx upstream → 400 client error;
      // 5xx upstream / network timeout → 502 bad gateway).
      const response = await this.http.get(`${this.baseUrl}/latest`, {
        params: { from: base, to: target },
        timeout: 5000,
        validateStatus: () => true,
      });

      // Frankfurter sends a 404 for completely unknown base currencies
      // (e.g. "FAKE"). That is the CALLER's fault, not an infrastructure
      // failure → map to 400.
      if (response.status === 404 || response.status === 400) {
        throw ApiError.badRequest(
          `Unsupported currency pair: ${base} -> ${target}`
        );
      }

      // Any other non-2xx from upstream is an infrastructure problem → 502.
      if (response.status < 200 || response.status >= 300) {
        throw ApiError.badGateway('Exchange rate provider returned an error', {
          base,
          target,
          upstreamStatus: response.status,
        });
      }

      const rate = response.data?.rates?.[target];

      if (typeof rate !== 'number') {
        // Frankfurter returns 200 with an empty `rates` object when the
        // TARGET currency is unknown. Still the caller's fault → 400.
        throw ApiError.badRequest(
          `Unsupported currency pair: ${base} -> ${target}`
        );
      }

      return { base, target, rate, date: response.data.date };
    } catch (err) {
      if (err instanceof ApiError) throw err;

      // Pure network failure (DNS, connection refused, timeout, etc.) → 502.
      throw ApiError.badGateway('Failed to reach exchange rate provider', {
        base,
        target,
        reason: err.message,
      });
    }
  }
}

module.exports = new RateService();
// Also export the class itself so it can be unit-tested with a mock HTTP client.
module.exports.RateService = RateService;
