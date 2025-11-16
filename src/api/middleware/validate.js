import { ValidationError } from '../../utils/errors.js';

/**
 * Validation Middleware
 * Validates request data against Joi schemas
 */

/**
 * Validate request body
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((detail) => detail.message).join('; ');
      return next(new ValidationError(message));
    }

    req.body = value;
    next();
  };
}

/**
 * Validate request params
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((detail) => detail.message).join('; ');
      return next(new ValidationError(message));
    }

    req.params = value;
    next();
  };
}

/**
 * Validate request query
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((detail) => detail.message).join('; ');
      return next(new ValidationError(message));
    }

    // Store validated query in a new property (req.query is read-only in Express 5)
    req.validatedQuery = value;
    next();
  };
}

export default {
  validateBody,
  validateParams,
  validateQuery,
};
