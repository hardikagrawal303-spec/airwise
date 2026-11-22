import crypto from 'node:crypto';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Express middleware that forwards unmatched API routes as a 404 AppError.
 *
 * @param {import('express').Request} _req - Express request.
 * @param {import('express').Response} _res - Express response.
 * @param {import('express').NextFunction} next - Express next callback.
 * @returns {void}
 */
export function notFoundHandler(_req, _res, next) {
  next(new AppError(ERROR_CODES.NOT_FOUND, 'The requested resource was not found.', 404));
}

/**
 * Centralized Express error handler returning structured JSON with a per-error requestId.
 *
 * @param {Error & { type?: string, status?: number }} err - Thrown or forwarded error.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} _next - Express next callback (required 4-arg signature).
 * @returns {import('express').Response} Structured JSON error response.
 */
export function errorHandler(err, req, res, _next) {
  const requestId = crypto.randomUUID();

  // Body size exceeded (express.json limit)
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    logger.warn('Request payload exceeded size limit', { requestId, path: req.path });
    return res.status(413).json({
      error: {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: 'Request payload is too large.',
        requestId,
      },
    });
  }

  // Malformed JSON body
  if (err && err.type === 'entity.parse.failed') {
    logger.warn('Malformed JSON payload received', { requestId, path: req.path });
    return res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Request body must be valid JSON.',
        requestId,
      },
    });
  }

  if (err instanceof AppError) {
    logger.warn('Handled application error', {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      path: req.path,
    });
    const payload = {
      code: err.code,
      message: err.safeMessage,
      requestId,
    };
    if (err.details) {
      payload.fields = err.details;
    }
    return res.status(err.statusCode).json({ error: payload });
  }

  // Unexpected internal error — log internally with requestId, never expose stack trace
  logger.error('Unhandled server error', {
    requestId,
    path: req.path,
    errorName: err?.name || 'Error',
  });

  return res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Something went wrong while processing your request. Please try again.',
      requestId,
    },
  });
}
