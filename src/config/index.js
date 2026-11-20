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
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  AQI_CACHE_TTL_SECONDS: z.coerce.number().int().min(10).max(86400).default(600),
  TRUST_PROXY: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional().default(''),
});

function isHostedProxyEnvironment(envSource) {
  return Boolean(
    envSource.K_SERVICE ||
      envSource.K_REVISION ||
      envSource.K_CONFIGURATION ||
      envSource.APP_URL
  );
}

function parseTrustProxy(raw, envSource = {}) {
  if (raw === undefined || String(raw).trim() === '') {
    return isHostedProxyEnvironment(envSource) ? 1 : false;
  }
  const trimmed = String(raw).trim().toLowerCase();
  if (trimmed === 'false' || trimmed === '0') {
    return false;
  }
  if (trimmed === 'true') {
    return true;
  }
  const num = Number(trimmed);
  if (Number.isInteger(num) && num > 0) {
    return num;
  }
  return false;
}

function parseAllowedOrigins(raw) {
  const entries = String(raw || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return Object.freeze([...new Set(entries)]);
}

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
    planRateLimitMax: Math.max(10, Math.floor(data.RATE_LIMIT_MAX / 3)),
    aqiCacheTtlMs: data.AQI_CACHE_TTL_SECONDS * 1000,
    trustProxy: parseTrustProxy(data.TRUST_PROXY, envSource),
    allowedOrigins: parseAllowedOrigins(data.ALLOWED_ORIGINS),
    jsonBodyLimit: '10kb',
    upstreamTimeoutMs: 5000,
    geminiTimeoutMs: 12000,
  });
}

export const config = loadConfig();
