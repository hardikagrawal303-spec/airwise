import { jest } from '@jest/globals';
import { selectActions } from '../../src/engine/actionSelector.js';
import { buildCommuteComparison } from '../../src/engine/impact.js';
import { validateAndSanitizeModelOutput } from '../../src/services/geminiSchema.js';
import { createGeminiService } from '../../src/services/geminiService.js';
import { createPlanBuilder } from '../../src/services/planBuilder.js';
import { TtlCache } from '../../src/utils/cache.js';
import { AppError, ERROR_CODES } from '../../src/utils/errors.js';

describe('Uncovered branch and defensive edge cases across engine, services, and utils', () => {
  test('selectActions rejects invalid aqiResult, profile, or risk and enforces homeType filter', () => {
    const validAqi = { aqi: 260, category: 'Poor', band: 'poor', dominantPollutant: 'PM2.5' };
    const validProfile = {
      members: { adults: 2, children: 0, elderly: 0 },
      hasRespiratoryOrHeartCondition: false,
      commute: 'car',
      commuteKmPerDay: 10,
      cookingFuel: 'lpg',
      hasPurifier: false,
      budget: 'medium',
      homeType: 'other_home_type',
    };
    const validRisk = { vulnerabilityLevel: 'standard', reasons: [], isSensitiveGroup: false };

    expect(() =>
      selectActions({ aqiResult: null, profile: validProfile, risk: validRisk })
    ).toThrow(TypeError);
    expect(() => selectActions({ aqiResult: validAqi, profile: null, risk: validRisk })).toThrow(
      TypeError
    );
    expect(() => selectActions({ aqiResult: validAqi, profile: validProfile, risk: null })).toThrow(
      TypeError
    );

    const actions = selectActions({ aqiResult: validAqi, profile: validProfile, risk: validRisk });
    expect(actions.some((a) => a.id === 'request_water_sprinkling_dust_control')).toBe(false);
  });

  test('buildCommuteComparison handles bus, metro, walk, cycle, and work_from_home modes', () => {
    expect(buildCommuteComparison({ commute: 'bus', commuteKmPerDay: 10 }).newMode).toBe('metro');
    expect(buildCommuteComparison({ commute: 'metro', commuteKmPerDay: 10 }).newMode).toBe('cycle');
    expect(buildCommuteComparison({ commute: 'walk', commuteKmPerDay: 4 }).dailyKgCO2Saved).toBe(0);
    expect(
      buildCommuteComparison({ commute: 'work_from_home', commuteKmPerDay: 0 }).dailyKgCO2Saved
    ).toBe(0);
  });

  test('TtlCache overwrites existing keys cleanly and prunes expired entries when full', async () => {
    const cache = new TtlCache({ ttlMs: 30, maxEntries: 2 });
    cache.set('k1', 'v1');
    cache.set('k1', 'v1-updated');
    expect(cache.get('k1')).toBe('v1-updated');

    cache.set('k2', 'v2');
    await new Promise((r) => setTimeout(r, 45));
    cache.set('k3', 'v3');
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k2')).toBeUndefined();
    expect(cache.get('k3')).toBe('v3');
  });

  test('AppError applies safe defaults when constructed without arguments', () => {
    const err = new AppError();
    expect(err.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(err.statusCode).toBe(500);
    expect(err.safeMessage.length).toBeGreaterThan(5);
  });

  test('validateAndSanitizeModelOutput rejects HTML-only fields that become empty after markup stripping', () => {
    const emptyItemHtml = JSON.stringify({
      headline: 'Calm headline',
      summary: 'Calm summary',
      familyTip: 'Stay safe',
      items: [
        {
          actionId: 'wear_n95_outdoors',
          personalizedText: '<script></script>',
          whyItMatters: 'Helps reduce inhalation.',
        },
      ],
    });
    expect(validateAndSanitizeModelOutput(emptyItemHtml, ['wear_n95_outdoors'])).toEqual({
      ok: false,
      reason: 'empty_or_overlength_after_sanitize',
    });

    const emptyTopHtml = JSON.stringify({
      headline: '<b>   </b>',
      summary: 'Calm summary',
      familyTip: 'Stay safe',
      items: [
        {
          actionId: 'wear_n95_outdoors',
          personalizedText: 'Wear an N95 mask outdoors.',
          whyItMatters: 'Can help reduce exposure.',
        },
      ],
    });
    expect(validateAndSanitizeModelOutput(emptyTopHtml, ['wear_n95_outdoors'])).toEqual({
      ok: false,
      reason: 'top_field_empty_or_overlength',
    });
  });

  test('geminiService fails fast without retry on message-encoded PERMISSION_DENIED errors', async () => {
    const generateContent = jest.fn(async () => {
      throw new Error('GoogleGenAI failed: PERMISSION_DENIED for project');
    });
    const svc = createGeminiService({
      apiKey: 'test-key',
      model: 'gemini-4-hydrogen',
      clientFactory: () => ({ models: { generateContent } }),
    });

    const result = await svc.personalizePlan({
      aqiResult: { aqi: 240, category: 'Poor', band: 'poor', dominantPollutant: 'PM2.5' },
      risk: { vulnerabilityLevel: 'standard', reasons: [], isSensitiveGroup: false },
      selectedActions: [
        {
          id: 'wear_n95_outdoors',
          textKey: 'action.wear_n95_outdoors',
          impactNoteKey: 'impact.wear_n95_outdoors',
        },
      ],
      language: 'en',
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(result.copySource).toBe('rules');
  });

  test('planBuilder handles omitted place labels and missing personalized items gracefully', async () => {
    const builder = createPlanBuilder({
      geminiService: {
        isEnabled: () => true,
        personalizePlan: async () => ({
          headline: 'Headline',
          summary: 'Summary',
          items: [],
          familyTip: 'Tip',
          copySource: 'ai',
        }),
      },
    });

    const res = await builder.buildPlan({
      manual: { pm25: 130 },
      profile: {
        members: { adults: 2, children: 0, elderly: 0 },
        hasRespiratoryOrHeartCondition: false,
        commute: 'metro',
        commuteKmPerDay: 10,
        cookingFuel: 'lpg',
        hasPurifier: false,
        budget: 'medium',
        homeType: 'apartment',
        language: 'en',
      },
    });

    expect(res.aqi.placeLabel).toBe('');
    expect(res.plan.items.length).toBeGreaterThan(0);
    expect(res.plan.items[0].text.length).toBeGreaterThan(5);
  });
});
