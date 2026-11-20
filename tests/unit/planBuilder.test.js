import { jest } from '@jest/globals';
import { createGeminiService } from '../../src/services/geminiService.js';
import { createPlanBuilder } from '../../src/services/planBuilder.js';

const baseProfile = {
  members: { adults: 2, children: 1, elderly: 0 },
  hasRespiratoryOrHeartCondition: false,
  commute: 'car',
  commuteKmPerDay: 15,
  cookingFuel: 'lpg',
  hasPurifier: false,
  budget: 'medium',
  homeType: 'apartment',
  language: 'en',
};

describe('planBuilder live-coordinate and Hindi branches', () => {
  test('uses live coordinates from airQualityService and returns open-meteo hourly timeline', async () => {
    const airQualityService = {
      getAirQuality: jest.fn(async () => ({
        pm25: 135,
        pm10: 210,
        observedAt: '2026-11-19T08:00',
        timezone: 'Asia/Kolkata',
        hourly: {
          time: ['2026-11-19T12:00', '2026-11-19T13:00', '2026-11-19T14:00'],
          pm2_5: [110, 95, 100],
        },
        dataSource: 'open-meteo',
        cached: false,
      })),
    };
    const geminiService = createGeminiService({ apiKey: null });
    const builder = createPlanBuilder({ airQualityService, geminiService });

    const result = await builder.buildPlan({
      location: { lat: 27.4924, lon: 77.6737, label: '  Mathura, UP  ' },
      profile: baseProfile,
    });

    expect(airQualityService.getAirQuality).toHaveBeenCalledWith(27.4924, 77.6737);
    expect(result.aqi.dataSource).toBe('open-meteo');
    expect(result.aqi.placeLabel).toBe('Mathura, UP');
    expect(result.aqi.category).toBe('Very Poor');
    expect(result.plan.bestHours.windowSource).toBe('hourly_model');
    expect(result.plan.bestHours.windowLabel).toBe('12:00 - 14:00');
    expect(result.plan.copySource).toBe('rules');
  });

  test('builds a Hindi plan when profile.language is hi', async () => {
    const airQualityService = { getAirQuality: jest.fn() };
    const geminiService = createGeminiService({ apiKey: null });
    const personalizeSpy = jest.spyOn(geminiService, 'personalizePlan');
    const builder = createPlanBuilder({ airQualityService, geminiService });

    const result = await builder.buildPlan({
      manual: { pm25: 260, label: 'लखनऊ' },
      profile: { ...baseProfile, language: 'hi' },
    });

    expect(airQualityService.getAirQuality).not.toHaveBeenCalled();
    expect(personalizeSpy).toHaveBeenCalledWith(expect.objectContaining({ language: 'hi' }));
    expect(result.aqi.dataSource).toBe('manual');
    expect(result.aqi.placeLabel).toBe('लखनऊ');
    expect(result.plan.headline).toMatch(/[\u0900-\u097F]/);
    expect(result.plan.timeline[0].guidance).toMatch(/[\u0900-\u097F]/);
    expect(result.plan.items[0].text).toMatch(/[\u0900-\u097F]/);
    expect(result.disclaimer).toMatch(/[\u0900-\u097F]/);
  });
});
