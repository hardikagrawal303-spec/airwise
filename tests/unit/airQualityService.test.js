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
});
