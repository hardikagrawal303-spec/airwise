import { isIP } from 'node:net';
import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

dotenv.config({ quiet: true });

const PLACEHOLDER_KEYS = new Set(['', 'your_gemini_api_key_here', 'MY_GEMINI_API_KEY']);

const envSchema = z.object({
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-4-hydrogen'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  GEOCODE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).optional(),
  AQI_CACHE_TTL_SECONDS: z.coerce.number().int().min(10).max(86400).default(600),
  TRUST_PROXY: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional().default(''),
});

function isHostedProxyEnvironment(envSource) {
  return Boolean(
    envSource.K_SERVICE || envSource.K_REVISION || envSource.K_CONFIGURATION || envSource.APP_URL
  );
}

function isValidCidr(entry) {
  const slashIndex = entry.indexOf('/');
  if (slashIndex <= 0 || slashIndex !== entry.lastIndexOf('/')) {
    return false;
  }
  const ip = entry.slice(0, slashIndex);
  const prefixRaw = entry.slice(slashIndex + 1);
  if (!/^\d+$/.test(prefixRaw)) {
    return false;
  }
  const ipVersion = isIP(ip);
  const prefix = Number(prefixRaw);
  if (ipVersion === 4) {
    return prefix >= 0 && prefix <= 32;
  }
  if (ipVersion === 6) {
    return prefix >= 0 && prefix <= 128;
  }
  return false;
}

function parseTrustProxy(raw, envSource = {}) {
  if (raw === undefined || String(raw).trim() === '') {
    return isHostedProxyEnvironment(envSource) ? 1 : false;
  }

  const trimmed = String(raw).trim();
  const lowered = trimmed.toLowerCase();

  if (lowered === 'false') {
    return false;
  }

  // Reject boolean "true" because Express treats it as trusting every proxy hop,
  // allowing clients to spoof X-Forwarded-For and X-Forwarded-Host headers.
  if (lowered === 'true') {
    throw new Error(
      'Invalid environment configuration: TRUST_PROXY cannot be "true"; use "false", a non-negative integer hop count, or CIDR range(s).'
    );
  }

  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  const cidrs = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (cidrs.length > 0 && cidrs.every(isValidCidr)) {
    return cidrs.join(', ');
  }

  throw new Error(
    `Invalid environment configuration: TRUST_PROXY "${trimmed}" must be "false", a non-negative integer, or valid CIDR range(s).`
  );
}

function parseAllowedOrigins(raw) {
  const entries = String(raw || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return Object.freeze([...new Set(entries)]);
}

/**
 * Validate environment variables and return a frozen runtime configuration object.
 *
 * @param {Record<string, string|undefined>} [envSource=process.env] - Environment variable map.
 * @returns {import('../types.d.ts').AppConfig} Frozen validated application config.
 */
export function loadConfig(envSource = process.env) {
  const parsed = envSchema.safeParse(envSource);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const data = parsed.data;
  const rawKey = (data.GEMINI_API_KEY || '').trim();
  const hasRealKey = rawKey.length > 0 && !PLACEHOLDER_KEYS.has(rawKey);

  if (!hasRealKey && data.NODE_ENV !== 'test') {
    logger.warn(
      'GEMINI_API_KEY is not configured; starting AirWise in rule-based fallback mode (AI personalization disabled).'
    );
  }

  return Object.freeze({
    geminiApiKey: hasRealKey ? rawKey : null,
    aiEnabled: hasRealKey,
    geminiModel: data.GEMINI_MODEL,
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    rateLimitWindowMs: data.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: data.RATE_LIMIT_MAX,
    geocodeRateLimitMax:
      data.GEOCODE_RATE_LIMIT_MAX ?? Math.max(1, Math.floor(data.RATE_LIMIT_MAX / 2)),
    planRateLimitMax: Math.max(10, Math.floor(data.RATE_LIMIT_MAX / 3)),
    serverHeadersTimeoutMs: 10000,
    serverRequestTimeoutMs: 20000,
    serverKeepAliveTimeoutMs: 65000,
    serverShutdownTimeoutMs: 10000,
    aqiCacheTtlMs: data.AQI_CACHE_TTL_SECONDS * 1000,
    geocodeCacheTtlMultiplier: 3,
    cacheMaxEntries: 200,
    geocodeResultCount: 5,
    geocodeCoordPrecision: 4,
    aqiCacheCoordPrecision: 2,
    trustProxy: parseTrustProxy(data.TRUST_PROXY, envSource),
    allowedOrigins: parseAllowedOrigins(data.ALLOWED_ORIGINS),
    jsonBodyLimit: '10kb',
    upstreamTimeoutMs: 5000,
    upstreamMaxAttempts: 2,
    upstreamRetryDelayMs: 250,
    geminiTimeoutMs: 12000,
    geminiMaxAttempts: 2,
    geminiMaxOutputTokens: 3072,
    geminiLegacyMaxOutputTokens: 1600,
    geminiLegacyTemperature: 0.3,
  });
}

export const config = loadConfig();
