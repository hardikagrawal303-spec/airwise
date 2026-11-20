import { z } from 'zod';
import { config } from '../config/index.js';
import { TtlCache } from '../utils/cache.js';
import { AppError, ERROR_CODES } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const geocodeItemSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  country: z.string().optional().default(''),
  country_code: z.string().optional().default(''),
  admin1: z.string().optional().default(''),
});

const geocodeResponseSchema = z.object({
  results: z.array(geocodeItemSchema).optional().default([]),
});

const airQualityResponseSchema = z.object({
  current: z.object({
    time: z.string().optional(),
    pm2_5: z.number().finite().min(0).nullable(),
    pm10: z.number().finite().min(0).nullable().optional(),
  }),
  hourly: z
    .object({
      time: z.array(z.string()),
      pm2_5: z.array(z.number().finite().min(0).nullable()),
    })
    .optional(),
  timezone: z.string().optional(),
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a user-provided manual PM2.5/PM10 reading into the standard air reading shape.
 *
 * @param {object} input - Manual pollutant readings.
 * @param {number} input.pm25 - PM2.5 concentration in ug/m3.
 * @param {number|null} [input.pm10=null] - Optional PM10 concentration in ug/m3.
 * @returns {{ pm25: number, pm10: number|null, observedAt: string, hourly: null, dataSource: 'manual', cached: false }} Normalized air reading.
 */
export function createManualAirReading({ pm25, pm10 = null }) {
  return {
    pm25,
    pm10: typeof pm10 === 'number' ? pm10 : null,
    observedAt: new Date().toISOString(),
    hourly: null,
    dataSource: 'manual',
    cached: false,
  };
}

async function fetchJsonWithTimeoutAndRetry(
  url,
  { fetchImpl, timeoutMs, retryDelayMs, maxAttempts = config.upstreamMaxAttempts }
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (response.status >= 500 && attempt < maxAttempts) {
        lastError = new Error(`Upstream 5xx: ${response.status}`);
        await delay(retryDelayMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Upstream HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await delay(retryDelayMs);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/**
 * Create a cached Open-Meteo geocoding and air-quality client.
 *
 * @param {object} [options] - Optional overrides for fetch, timeouts, retries, and cache sizing.
 * @param {typeof fetch} [options.fetchImpl=globalThis.fetch] - Fetch implementation.
 * @param {number} [options.timeoutMs] - Per-request timeout in milliseconds.
 * @param {number} [options.cacheTtlMs] - AQI cache TTL in milliseconds.
 * @param {number} [options.retryDelayMs] - Delay between retry attempts in milliseconds.
 * @param {number} [options.maxAttempts] - Maximum fetch attempts per request.
 * @param {number} [options.maxCacheEntries] - Maximum LRU entries per cache.
 * @returns {{ geocode: Function, getAirQuality: Function }} Air quality service methods.
 */
export function createAirQualityService({
  fetchImpl = globalThis.fetch,
  timeoutMs = config.upstreamTimeoutMs,
  cacheTtlMs = config.aqiCacheTtlMs,
  retryDelayMs = config.upstreamRetryDelayMs,
  maxAttempts = config.upstreamMaxAttempts,
  maxCacheEntries = config.cacheMaxEntries,
} = {}) {
  const aqiCache = new TtlCache({ ttlMs: cacheTtlMs, maxEntries: maxCacheEntries });
  const geocodeCache = new TtlCache({
    ttlMs: cacheTtlMs * config.geocodeCacheTtlMultiplier,
    maxEntries: maxCacheEntries,
  });

  async function geocode(query) {
    const trimmed = String(query || '').trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        'Enter at least 2 characters to search for a city.',
        400
      );
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = geocodeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      name: trimmed,
      count: String(config.geocodeResultCount),
      language: 'en',
      format: 'json',
    });
    const url = `${GEOCODE_ENDPOINT}?${params.toString()}`;

    try {
      const raw = await fetchJsonWithTimeoutAndRetry(url, {
        fetchImpl,
        timeoutMs,
        retryDelayMs,
        maxAttempts,
      });
      const parsed = geocodeResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error('Unexpected geocode response shape');
      }

      const results = parsed.data.results.map((item) => {
        const parts = [item.name, item.admin1, item.country].filter(Boolean);
        return {
          name: item.name,
          admin1: item.admin1,
          country: item.country,
          countryCode: item.country_code,
          label: parts.join(', '),
          lat: Number(item.latitude.toFixed(config.geocodeCoordPrecision)),
          lon: Number(item.longitude.toFixed(config.geocodeCoordPrecision)),
        };
      });

      geocodeCache.set(cacheKey, results);
      return results;
    } catch (err) {
      logger.warn('Open-Meteo geocoding lookup failed', { reason: err?.name || 'Error' });
      throw new AppError(
        ERROR_CODES.GEOCODE_FAILED,
        'We could not look up that city right now. Enter coordinates or a PM2.5 reading manually.',
        502
      );
    }
  }

  async function getAirQuality(lat, lon) {
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        'Location coordinates must be valid latitude and longitude values.',
        400
      );
    }

    // Round to 2 decimal places for caching (~1.1 km grid) and avoid sending or logging PII
    const roundedLat = Number(lat.toFixed(config.aqiCacheCoordPrecision));
    const roundedLon = Number(lon.toFixed(config.aqiCacheCoordPrecision));
    const cacheKey = `${roundedLat},${roundedLon}`;

    const cached = aqiCache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    const params = new URLSearchParams({
      latitude: String(roundedLat),
      longitude: String(roundedLon),
      current: 'pm2_5,pm10',
      hourly: 'pm2_5',
      forecast_days: '1',
      timezone: 'auto',
    });
    const url = `${AIR_QUALITY_ENDPOINT}?${params.toString()}`;

    try {
      const raw = await fetchJsonWithTimeoutAndRetry(url, {
        fetchImpl,
        timeoutMs,
        retryDelayMs,
        maxAttempts,
      });
      const parsed = airQualityResponseSchema.safeParse(raw);
      if (!parsed.success || parsed.data.current.pm2_5 === null) {
        throw new Error('Missing pm2_5 in upstream response');
      }

      const result = {
        pm25: Math.round(parsed.data.current.pm2_5 * 10) / 10,
        pm10:
          typeof parsed.data.current.pm10 === 'number'
            ? Math.round(parsed.data.current.pm10 * 10) / 10
            : null,
        observedAt: parsed.data.current.time || new Date().toISOString(),
        timezone: parsed.data.timezone || 'auto',
        hourly: parsed.data.hourly || null,
        dataSource: 'open-meteo',
        cached: false,
      };

      aqiCache.set(cacheKey, result);
      return result;
    } catch (err) {
      logger.warn('Open-Meteo air quality fetch failed', {
        lat: roundedLat,
        lon: roundedLon,
        reason: err?.name || 'Error',
      });
      throw new AppError(
        ERROR_CODES.AIR_UPSTREAM_FAILED,
        'We could not reach the air-quality service. Enter a PM2.5 reading yourself, or try again in a minute.',
        502
      );
    }
  }

  return {
    geocode,
    getAirQuality,
  };
}

export const airQualityService = createAirQualityService();
