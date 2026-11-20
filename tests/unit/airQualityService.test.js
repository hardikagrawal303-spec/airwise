import { jest } from '@jest/globals';
import { createAirQualityService } from '../../src/services/airQualityService.js';
import { ERROR_CODES } from '../../src/utils/errors.js';

describe('airQualityService', () => {
  test('geocodes city names and caches subsequent identical queries', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            name: 'Mathura',
            admin1: 'Uttar Pradesh',
            country: 'India',
            country_code: 'IN',
            latitude: 27.4924,
            longitude: 77.6737,
          },
        ],
      }),
    });

    const svc = createAirQualityService({ fetchImpl: fetchMock, retryDelayMs: 1 });
    const first = await svc.geocode('Mathura');
    const second = await svc.geocode('  mathura  ');

    expect(first).toHaveLength(1);
    expect(first[0].label).toBe('Mathura, Uttar Pradesh, India');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('fetches air quality, retries once on 5xx, and caches by 2-decimal coordinates', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          current: { time: '2026-11-19T08:00', pm2_5: 168.4, pm10: 242.1 },
          hourly: {
            time: ['2026-11-19T13:00', '2026-11-19T14:00', '2026-11-19T15:00'],
            pm2_5: [120, 110, 115],
          },
          timezone: 'Asia/Kolkata',
        }),
      });

    const svc = createAirQualityService({ fetchImpl: fetchMock, retryDelayMs: 1 });
    const first = await svc.getAirQuality(27.4924, 77.6737);
    expect(first.pm25).toBe(168.4);
    expect(first.pm10).toBe(242.1);
    expect(first.cached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Coordinates within same 2-decimal cell hit cache
    const second = await svc.getAirQuality(27.4911, 77.6749);
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('throws AppError with AIR_UPSTREAM_FAILED when upstream fails or returns invalid schema', async () => {
    const failingFetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const svc = createAirQualityService({ fetchImpl: failingFetch, retryDelayMs: 1 });

    await expect(svc.getAirQuality(28.61, 77.21)).rejects.toMatchObject({
      code: ERROR_CODES.AIR_UPSTREAM_FAILED,
      statusCode: 502,
    });
  });

  test('throws AppError with GEOCODE_FAILED when geocode upstream fails', async () => {
    const failingFetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const svc = createAirQualityService({ fetchImpl: failingFetch, retryDelayMs: 1 });

    await expect(svc.geocode('Lucknow')).rejects.toMatchObject({
      code: ERROR_CODES.GEOCODE_FAILED,
      statusCode: 502,
    });
  });

  test('validates coordinate bounds before calling upstream', async () => {
    const fetchMock = jest.fn();
    const svc = createAirQualityService({ fetchImpl: fetchMock });

    await expect(svc.getAirQuality(99, 77)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      statusCode: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('retries once on upstream 429 and succeeds when the retry returns 200', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ current: { time: '2026-11-19T08:00', pm2_5: 55 } }),
      });

    const svc = createAirQualityService({ fetchImpl: fetchMock, retryDelayMs: 1 });
    const reading = await svc.getAirQuality(28.5, 77.2);
    expect(reading.pm25).toBe(55);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('aborts on timeout and retries AbortError before throwing AIR_UPSTREAM_FAILED', async () => {
    const slowFetch = jest.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );

    const svc = createAirQualityService({
      fetchImpl: slowFetch,
      timeoutMs: 15,
      retryDelayMs: 1,
      maxAttempts: 2,
    });

    await expect(svc.getAirQuality(28.61, 77.21)).rejects.toMatchObject({
      code: ERROR_CODES.AIR_UPSTREAM_FAILED,
      statusCode: 502,
    });
    expect(slowFetch).toHaveBeenCalledTimes(2);
  });

  test('fast-fails without retrying on upstream 400 and 404 responses', async () => {
    const fetch400 = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    const svc400 = createAirQualityService({
      fetchImpl: fetch400,
      retryDelayMs: 1,
      maxAttempts: 2,
    });
    await expect(svc400.getAirQuality(28.61, 77.21)).rejects.toMatchObject({
      code: ERROR_CODES.AIR_UPSTREAM_FAILED,
      statusCode: 502,
    });
    expect(fetch400).toHaveBeenCalledTimes(1);

    const fetch404 = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const svc404 = createAirQualityService({
      fetchImpl: fetch404,
      retryDelayMs: 1,
      maxAttempts: 2,
    });
    await expect(svc404.geocode('NowhereTown')).rejects.toMatchObject({
      code: ERROR_CODES.GEOCODE_FAILED,
      statusCode: 502,
    });
    expect(fetch404).toHaveBeenCalledTimes(1);
  });

  test('returns empty array on empty geocode results and rejects too-short queries', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const svc = createAirQualityService({ fetchImpl: fetchMock, retryDelayMs: 1 });

    const empty = await svc.geocode('Zzzzzville');
    expect(empty).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(svc.geocode('a')).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
      statusCode: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('rejects a PM10-only upstream reading (null pm2_5) with AIR_UPSTREAM_FAILED', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        current: { time: '2026-11-19T08:00', pm2_5: null, pm10: 185 },
      }),
    });
    const svc = createAirQualityService({ fetchImpl: fetchMock, retryDelayMs: 1 });

    await expect(svc.getAirQuality(28.61, 77.21)).rejects.toMatchObject({
      code: ERROR_CODES.AIR_UPSTREAM_FAILED,
      statusCode: 502,
    });
  });
});
