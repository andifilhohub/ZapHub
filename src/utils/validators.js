import Joi from 'joi';
import { ValidationError } from './errors.js';

/**
 * Validate data against a Joi schema
 * @param {object} data - Data to validate
 * @param {Joi.Schema} schema - Joi validation schema
 * @throws {ValidationError}
 * @returns {object} Validated data
 */
export function validate(data, schema) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const details = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    throw new ValidationError('Validation failed', details);
  }

  return value;
}

// Common schemas
export const schemas = {
  uuid: Joi.string().uuid(),
  jid: Joi.string().pattern(/^\d+@s\.whatsapp\.net$/),
  messageType: Joi.string().valid('text', 'image', 'video', 'audio', 'document'),
};

export default {
  validate,
  schemas,
};
