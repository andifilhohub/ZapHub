import config from '../../../config/index.js';
import logger from '../../lib/logger.js';
import { UnauthorizedError } from '../../utils/errors.js';

/**
 * Authentication Middleware
 * Validates API keys for securing endpoints
 */

/**
 * API Key authentication middleware
 * 
 * Supports two methods:
 * 1. Header: Authorization: Bearer <api-key>
 * 2. Query: ?api_key=<api-key>
 */
export function authenticateApiKey(req, res, next) {
  // Skip if API key authentication is disabled
  if (!config.security.apiKeyEnabled) {
    logger.debug('[Auth] API key authentication disabled, skipping');
    return next();
  }

  // Extract API key from header or query
  let apiKey = null;

  // Method 1: Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  }

  // Method 2: Query parameter
  if (!apiKey && req.query.api_key) {
    apiKey = req.query.api_key;
  }

  // Validate API key
  if (!apiKey) {
    logger.warn('[Auth] Missing API key in request');
    return next(new UnauthorizedError('API key is required. Provide it via Authorization header or api_key query parameter.'));
  }

  if (apiKey !== config.security.apiKey) {
    logger.warn({ providedKey: apiKey.substring(0, 8) + '...' }, '[Auth] Invalid API key');
    return next(new UnauthorizedError('Invalid API key'));
  }

  logger.debug('[Auth] API key validated successfully');
  next();
}

/**
 * Optional API key authentication
 * Validates if provided, but doesn't require it
 */
export function optionalApiKey(req, res, next) {
  if (!config.security.apiKeyEnabled) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const queryApiKey = req.query.api_key;

  // If no API key provided, continue
  if (!authHeader && !queryApiKey) {
    return next();
  }

  // If provided, validate it
  return authenticateApiKey(req, res, next);
}

export default {
  authenticateApiKey,
  optionalApiKey,
};
