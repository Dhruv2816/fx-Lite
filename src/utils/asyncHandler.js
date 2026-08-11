'use strict';

/**
 * Wraps an async Express route/controller handler so that any rejected
 * promise (thrown error) is automatically forwarded to next(err), instead
 * of every controller needing its own try/catch block. Keeps controllers
 * focused purely on request/response translation.
 *
 * @param {Function} fn - async (req, res, next) => {...}
 * @returns {Function} Express-compatible middleware
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
