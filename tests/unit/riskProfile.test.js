import { evaluateRiskProfile } from '../../src/engine/riskProfile.js';

function makeProfile(overrides = {}) {
  return {
    members: { children: 0, elderly: 0, adults: 2 },
    hasRespiratoryOrHeartCondition: false,
    commute: 'metro',
    commuteKmPerDay: 12,
    cookingFuel: 'lpg',
    hasPurifier: false,
    budget: 'medium',
    homeType: 'apartment',
    language: 'en',
    ...overrides,
  };
}

describe('Household risk profile engine', () => {
  test('returns standard for healthy adult household on Good/Satisfactory/Moderate/Poor days', () => {
    for (const category of ['Good', 'Satisfactory', 'Moderate', 'Poor']) {
      const res = evaluateRiskProfile(makeProfile(), { aqi: 100, category });
      expect(res.vulnerabilityLevel).toBe('standard');
      expect(res.isSensitiveGroup).toBe(false);
      expect(res.reasons).toEqual([]);
    }
  });

  test('returns elevated for healthy adult household on Very Poor or Severe days', () => {
    const res = evaluateRiskProfile(makeProfile(), { aqi: 350, category: 'Very Poor' });
    expect(res.vulnerabilityLevel).toBe('elevated');
    expect(res.isSensitiveGroup).toBe(false);
    expect(res.reasons).toContain('risk.reason.severe_air');
  });

  test('returns elevated when children or elderly are present on Good through Poor days', () => {
    const withChild = evaluateRiskProfile(
      makeProfile({ members: { children: 1, elderly: 0, adults: 2 } }),
      { aqi: 40, category: 'Good' }
    );
    expect(withChild.vulnerabilityLevel).toBe('elevated');
    expect(withChild.isSensitiveGroup).toBe(true);
    expect(withChild.reasons).toContain('risk.reason.children');

    const withElderly = evaluateRiskProfile(
      makeProfile({ members: { children: 0, elderly: 2, adults: 2 } }),
      { aqi: 240, category: 'Poor' }
    );
    expect(withElderly.vulnerabilityLevel).toBe('elevated');
    expect(withElderly.isSensitiveGroup).toBe(true);
    expect(withElderly.reasons).toContain('risk.reason.elderly');
  });

  test('escalates children or elderly households to high on Very Poor and Severe days', () => {
    const res = evaluateRiskProfile(
      makeProfile({ members: { children: 1, elderly: 0, adults: 2 } }),
      { aqi: 340, category: 'Very Poor' }
    );
    expect(res.vulnerabilityLevel).toBe('high');
    expect(res.isSensitiveGroup).toBe(true);
  });

  test('returns elevated for respiratory/heart condition on Good-Moderate, and high on Poor+', () => {
    const moderate = evaluateRiskProfile(makeProfile({ hasRespiratoryOrHeartCondition: true }), {
      aqi: 150,
      category: 'Moderate',
    });
    expect(moderate.vulnerabilityLevel).toBe('elevated');
    expect(moderate.isSensitiveGroup).toBe(true);
    expect(moderate.reasons).toContain('risk.reason.health_condition');

    for (const category of ['Poor', 'Very Poor', 'Severe']) {
      const severe = evaluateRiskProfile(makeProfile({ hasRespiratoryOrHeartCondition: true }), {
        aqi: 260,
        category,
      });
      expect(severe.vulnerabilityLevel).toBe('high');
      expect(severe.isSensitiveGroup).toBe(true);
    }
  });

  test('records open-air commute and indoor smoke fuel reasons appropriately', () => {
    const res = evaluateRiskProfile(
      makeProfile({
        commute: 'two_wheeler',
        commuteKmPerDay: 15,
        cookingFuel: 'wood_or_biomass',
      }),
      { aqi: 240, category: 'Poor' }
    );
    expect(res.vulnerabilityLevel).toBe('elevated');
    expect(res.reasons).toContain('risk.reason.open_commute');
    expect(res.reasons).toContain('risk.reason.indoor_smoke_fuel');
  });

  test('does not flag open-air commute below minimum distance or on Moderate air', () => {
    const shortTrip = evaluateRiskProfile(makeProfile({ commute: 'walk', commuteKmPerDay: 2 }), {
      aqi: 250,
      category: 'Poor',
    });
    expect(shortTrip.reasons).not.toContain('risk.reason.open_commute');

    const moderateAir = evaluateRiskProfile(
      makeProfile({ commute: 'cycle', commuteKmPerDay: 12 }),
      { aqi: 120, category: 'Moderate' }
    );
    expect(moderateAir.reasons).not.toContain('risk.reason.open_commute');
  });

  test('throws on invalid profile or aqiResult', () => {
    expect(() => evaluateRiskProfile(null, { aqi: 50, category: 'Good' })).toThrow(TypeError);
    expect(() => evaluateRiskProfile(makeProfile(), { aqi: 50, category: 'Unknown' })).toThrow(
      TypeError
    );
  });
});
