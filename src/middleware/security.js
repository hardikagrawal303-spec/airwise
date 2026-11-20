import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Strict Content-Security-Policy and security headers.
 * Zero inline scripts, zero inline styles, zero external scripts/fonts.
 */
export function createSecurityHeadersMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    referrerPolicy: { policy: 'no-referrer' },
  });
}

function normalizeOrigin(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
}

function parseAllowedOriginsSet(allowedOrigins) {
  const entries = Array.isArray(allowedOrigins)
    ? allowedOrigins
    : String(allowedOrigins || '').split(',');
  return new Set(entries.map(normalizeOrigin).filter(Boolean));
}

function normalizeHostForProtocol(rawHost, protocol) {
  const host = String(rawHost || '').trim().toLowerCase();
  if (protocol === 'https:' && host.endsWith(':443')) {
    return host.slice(0, -4);
  }
  if (protocol === 'http:' && host.endsWith(':80')) {
    return host.slice(0, -3);
  }
  return host;
}

function getFirstForwardedHost(rawHeader) {
  if (!rawHeader) {
    return '';
  }
  return String(rawHeader).split(',')[0].trim();
}

function isNonProdLoopbackHttpOrigin(originUrl) {
  return (
    originUrl.protocol === 'http:' &&
    (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1')
  );
}

/**
 * Same-origin enforcement middleware for API routes.
 * Allows requests when:
 * - Origin header is missing
 * - Origin is listed in ALLOWED_ORIGINS (trimmed, trailing slashes removed)
 * - Origin host matches the request's Host header
 * - Origin host matches the first X-Forwarded-Host header (only when trustProxy is enabled)
 * - In non-production, Origin is http://localhost or http://127.0.0.1 on any port
 * Rejects foreign origins with 403 ORIGIN_NOT_ALLOWED and logs Origin, Host, and X-Forwarded-Host.
 */
export function createOriginGuard(
  allowedOrigins = [],
  { trustProxy = false, nodeEnv = process.env.NODE_ENV || 'development' } = {}
) {
  const allowedSet = parseAllowedOriginsSet(allowedOrigins);
  const trustForwardedHost = Boolean(trustProxy);
  const allowDevLoopback = nodeEnv !== 'production';

  return function originGuard(req, _res, next) {
    const origin = req.get('origin');
    if (!origin) {
      return next();
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedSet.has(normalizedOrigin)) {
      return next();
    }

    const rawHost = req.get('host') || '';
    const rawForwardedHost = req.get('x-forwarded-host') || '';

    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.host.toLowerCase();

      if (allowDevLoopback && isNonProdLoopbackHttpOrigin(originUrl)) {
        return next();
      }

      const reqHost = normalizeHostForProtocol(rawHost, originUrl.protocol);
      if (reqHost && originHost === reqHost) {
        return next();
      }

      if (trustForwardedHost) {
        const forwardedHost = normalizeHostForProtocol(
          getFirstForwardedHost(rawForwardedHost),
          originUrl.protocol
        );
        if (forwardedHost && originHost === forwardedHost) {
          return next();
        }
      }
    } catch {
      // Malformed Origin header falls through to rejection
    }

    logger.warn('Rejected request origin', {
      origin,
      host: rawHost || null,
      xForwardedHost: rawForwardedHost || null,
    });

    return next(
      new AppError(
        ERROR_CODES.ORIGIN_NOT_ALLOWED,
        'This request origin is not permitted.',
        403
      )
    );
  };
}

export function createApiRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Too many requests in a short time. Please wait a minute and try again.',
        },
      });
    },
  });
}
