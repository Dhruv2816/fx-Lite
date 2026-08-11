'use strict';

/**
 * ApiError
 *
 * A single, predictable error shape used across the whole service.
 * Every "expected" failure (insufficient funds, bad input, upstream FX
 * API failure, etc.) should be thrown as an ApiError so the centralized
 * errorHandler middleware can map it to the right HTTP status code
 * without inspecting error messages/strings.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code to send to the client
   * @param {string} message - Human-readable error message
   * @param {object} [details] - Optional extra context (e.g. validation info)
   */
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // distinguishes "expected" errors from bugs

    // Preserve a proper stack trace pointing at where the error was created
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static notFound(message, details) {
    return new ApiError(404, message, details);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }

  static internal(message, details) {
    return new ApiError(500, message, details);
  }

  static badGateway(message, details) {
    return new ApiError(502, message, details);
  }
}

module.exports = ApiError;
