'use strict';

const ApiError = require('../utils/ApiError');

/**
 * notFoundHandler
 * Catches any request that didn't match a defined route and turns it into
 * a consistent 404 ApiError, so it flows through the same error pipeline
 * as every other error in the app.
 */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * errorHandler
 * Single, centralized place where every error in the app is converted to
 * an HTTP response. Express recognizes this as an error-handling
 * middleware because it declares FOUR parameters (err, req, res, next).
 *
 * - Known errors (ApiError / anything with isOperational = true) are
 *   trusted and their message/statusCode/details are sent as-is.
 * - Unknown errors (programming bugs) are logged server-side but never
 *   leak internal details (stack traces, SQL, etc.) to the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isOperational = err instanceof ApiError && err.isOperational;
  const statusCode = isOperational ? err.statusCode : 500;
  const message = isOperational ? err.message : 'Internal Server Error';

  if (!isOperational) {
    // Unexpected/programming errors are worth full logging for debugging.
    // eslint-disable-next-line no-console
    console.error('[Unhandled Error]', err);
  }

  const body = {
    success: false,
    error: {
      message,
      ...(isOperational && err.details ? { details: err.details } : {}),
    },
  };

  res.status(statusCode).json(body);
}

module.exports = { notFoundHandler, errorHandler };
