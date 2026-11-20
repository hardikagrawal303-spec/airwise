/**
 * Typed application error carrying a safe client message and a stable
 * machine-readable error code so the frontend can map every error cleanly
 * without ever exposing raw HTTP status text or stack traces.
 */

export const ERROR_CODES = Object.freeze({
  AIR_UPSTREAM_FAILED: 'AIR_UPSTREAM_FAILED',
  GEOCODE_FAILED: 'GEOCODE_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export class AppError extends Error {
  constructor(code, safeMessage, statusCode = 500, details = undefined) {
    super(safeMessage);
    this.name = 'AppError';
    this.code = code || ERROR_CODES.INTERNAL_ERROR;
    this.safeMessage = safeMessage || 'Something went wrong. Please try again.';
    this.statusCode = statusCode;
    this.details = details;
  }
}
