import { jest } from '@jest/globals';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { createGeminiService } from '../../src/services/geminiService.js';

export const validProfile = {
  members: { children: 1, elderly: 1, adults: 2 },
  hasRespiratoryOrHeartCondition: true,
  commute: 'car',
  commuteKmPerDay: 18,
  cookingFuel: 'lpg',
  hasPurifier: false,
  budget: 'low',
  homeType: 'apartment',
  language: 'en',
};

export function createTestApp({
  airOverrides = {},
  geminiService = createGeminiService({ apiKey: null }),
  configOverrides = {},
} = {}) {
  const baseConfig = loadConfig({
    NODE_ENV: 'test',
    PORT: '3000',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '50',
    ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    ...configOverrides,
  });

  const airQualityService = {
    geocode: jest.fn(async (q) => [
      {
        name: q,
        admin1: 'Uttar Pradesh',
        country: 'India',
        countryCode: 'IN',
        label: `${q}, Uttar Pradesh, India`,
        lat: 27.4924,
        lon: 77.6737,
      },
    ]),
    getAirQuality: jest.fn(async () => ({
      pm25: 168,
      pm10: 230,
      observedAt: '2026-11-19T08:00',
      timezone: 'Asia/Kolkata',
      hourly: {
        time: ['2026-11-19T13:00', '2026-11-19T14:00', '2026-11-19T15:00'],
        pm2_5: [120, 108, 114],
      },
      dataSource: 'open-meteo',
      cached: false,
    })),
    ...airOverrides,
  };

  return {
    app: createApp({ config: baseConfig, airQualityService, geminiService }),
    airQualityService,
  };
}
