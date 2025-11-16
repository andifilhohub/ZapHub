import logger from '../../lib/logger.js';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ConflictError,
} from '../../utils/errors.js';

/**
 * Error Handler Middleware
 * Centralized error handling for the API
 */

/**
 * Convert Joi validation errors to ValidationError
 */
function handleJoiError(err) {
  const message = err.details.map((detail) => detail.message).join('; ');
  return new ValidationError(message);
}

/**
 * Main error handler middleware
 */
export function errorHandler(err, req, res, next) {
  // Log error
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      statusCode: err.statusCode || 500,
    },
    '[ErrorHandler] Request error'
  );

  // Handle Joi validation errors
  if (err.isJoi) {
    err = handleJoiError(err);
  }

  // Handle known application errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        type: err.constructor.name,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Handle database errors
  if (err.code) {
    // PostgreSQL error codes
    const pgErrors = {
      '23505': { status: 409, message: 'Resource already exists (duplicate)' },
      '23503': { status: 400, message: 'Foreign key constraint violation' },
      '23502': { status: 400, message: 'Required field is missing' },
      '22P02': { status: 400, message: 'Invalid input format' },
    };

    const pgError = pgErrors[err.code];
    if (pgError) {
      return res.status(pgError.status).json({
        success: false,
        error: {
          type: 'DatabaseError',
          message: pgError.message,
          code: err.code,
        },
      });
    }
  }

  // Handle unknown errors (500)
  res.status(500).json({
    success: false,
    error: {
      type: 'InternalServerError',
      message: 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && {
        details: err.message,
        stack: err.stack,
      }),
    },
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      type: 'NotFoundError',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
