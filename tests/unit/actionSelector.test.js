import { ACTIONS, VALID_CATEGORIES, VALID_DAYPARTS } from '../../src/knowledge/actions.js';
import {
  MAX_SELECTED_ACTIONS,
  MIN_ACTIONS_PER_CATEGORY,
  selectActions,
} from '../../src/engine/actionSelector.js';
import { evaluateRiskProfile } from '../../src/engine/riskProfile.js';

function makeProfile(overrides = {}) {
  return {
    members: { children: 0, elderly: 0, adults: 2 },
    hasRespiratoryOrHeartCondition: false,
    commute: 'car',
    commuteKmPerDay: 15,
    cookingFuel: 'lpg',
    hasPurifier: false,
    budget: 'medium',
    homeType: 'apartment',
    language: 'en',
    ...overrides,
  };
}

function runSelection(category, profileOverrides = {}) {
  const profile = makeProfile(profileOverrides);
  const aqiMap = {
    Good: 35,
    Satisfactory: 75,
    Moderate: 150,
    Poor: 250,
    'Very Poor': 350,
    Severe: 460,
  };
  const aqiResult = { aqi: aqiMap[category], category };
  const risk = evaluateRiskProfile(profile, aqiResult);
  return {
    actions: selectActions({ aqiResult, profile, risk }),
    risk,
  };
}

describe('Knowledge base structure', () => {
  test('contains between 30 and 40 curated actions', () => {
    expect(ACTIONS.length).toBeGreaterThanOrEqual(30);
    expect(ACTIONS.length).toBeLessThanOrEqual(40);
  });

  test('every action has unique id, valid category, valid daypart, and text/impact keys', () => {
    const ids = new Set();
    for (const action of ACTIONS) {
      expect(ids.has(action.id)).toBe(false);
      ids.add(action.id);
      expect(VALID_CATEGORIES).toContain(action.category);
      expect(VALID_DAYPARTS).toContain(action.daypart);
      expect(action.textKey).toBe(`action.${action.id}`);
      expect(action.impactNoteKey).toBe(`impact.${action.id}`);
    }
  });
});

describe('Action selector rule engine', () => {
  test('gates actions by AQI severity (no Poor+ actions on Good days, no cycling on Severe days)', () => {
    const { actions: goodActions } = runSelection('Good');
    const goodIds = goodActions.map((a) => a.id);
    expect(goodIds).not.toContain('wear_n95_outdoors');
    expect(goodIds).not.toContain('move_exercise_indoors');
    expect(goodIds).not.toContain('diy_box_fan_filter');

    const { actions: severeActions } = runSelection('Severe');
    const severeIds = severeActions.map((a) => a.id);
    expect(severeIds).toContain('wear_n95_outdoors');
    expect(severeIds).not.toContain('walk_cycle_short_trips');
    expect(severeIds).not.toContain('shift_outdoor_exercise');
  });

  test('always includes seek_medical_care_if_symptoms when sensitive group and AQI is Poor+', () => {
    for (const category of ['Poor', 'Very Poor', 'Severe']) {
      const { actions } = runSelection(category, {
        hasRespiratoryOrHeartCondition: true,
      });
      expect(actions.map((a) => a.id)).toContain('seek_medical_care_if_symptoms');
    }

    // Not included when not sensitive
    const { actions: nonSensitive } = runSelection('Severe', {
      members: { children: 0, elderly: 0, adults: 2 },
      hasRespiratoryOrHeartCondition: false,
    });
    expect(nonSensitive.map((a) => a.id)).not.toContain('seek_medical_care_if_symptoms');

    // Not included when Moderate even if sensitive
    const { actions: moderateSensitive } = runSelection('Moderate', {
      hasRespiratoryOrHeartCondition: true,
    });
    expect(moderateSensitive.map((a) => a.id)).not.toContain('seek_medical_care_if_symptoms');
  });

  test('respects purifier ownership (HEPA vs DIY box-fan stopgap)', () => {
    const { actions: noPurifier } = runSelection('Poor', { hasPurifier: false });
    expect(noPurifier.map((a) => a.id)).toContain('diy_box_fan_filter');
    expect(noPurifier.map((a) => a.id)).not.toContain('run_hepa_purifier');

    const { actions: hasPurifier } = runSelection('Poor', { hasPurifier: true });
    expect(hasPurifier.map((a) => a.id)).toContain('run_hepa_purifier');
    expect(hasPurifier.map((a) => a.id)).not.toContain('diy_box_fan_filter');
  });

  test('includes clean cooking fuel switch only for wood/biomass or kerosene', () => {
    const { actions: biomass } = runSelection('Poor', { cookingFuel: 'wood_or_biomass' });
    expect(biomass.map((a) => a.id)).toContain('switch_clean_cooking_fuel');

    const { actions: kerosene } = runSelection('Poor', { cookingFuel: 'kerosene' });
    expect(kerosene.map((a) => a.id)).toContain('switch_clean_cooking_fuel');

    const { actions: induction } = runSelection('Poor', { cookingFuel: 'induction' });
    expect(induction.map((a) => a.id)).not.toContain('switch_clean_cooking_fuel');
    expect(induction.map((a) => a.id)).not.toContain('run_kitchen_exhaust');
  });

  test('prefers free and low-cost actions when budget is low', () => {
    const { actions: lowBudget } = runSelection('Poor', {
      budget: 'low',
      cookingFuel: 'lpg',
    });
    const freeOrLowCount = lowBudget.filter((a) => a.cost === 'free' || a.cost === 'low').length;
    expect(freeOrLowCount).toBe(lowBudget.length);
  });

  test('caps results at 12 and guarantees at least 2 per category where applicable', () => {
    for (const category of ['Good', 'Moderate', 'Poor', 'Very Poor', 'Severe']) {
      const { actions } = runSelection(category, {
        members: { children: 1, elderly: 1, adults: 2 },
        hasRespiratoryOrHeartCondition: true,
      });
      expect(actions.length).toBeLessThanOrEqual(MAX_SELECTED_ACTIONS);
      expect(actions.length).toBeGreaterThanOrEqual(8);

      for (const cat of VALID_CATEGORIES) {
        const count = actions.filter((a) => a.category === cat).length;
        expect(count).toBeGreaterThanOrEqual(MIN_ACTIONS_PER_CATEGORY);
      }
    }
  });

  test('is strictly deterministic (same input yields identical output)', () => {
    const first = runSelection('Very Poor', {
      members: { children: 2, elderly: 1, adults: 2 },
      commute: 'two_wheeler',
      budget: 'low',
    }).actions;
    const second = runSelection('Very Poor', {
      members: { children: 2, elderly: 1, adults: 2 },
      commute: 'two_wheeler',
      budget: 'low',
    }).actions;
    expect(first).toEqual(second);
  });

  test('includes children-specific actions only when children > 0', () => {
    const { actions: withKids } = runSelection('Poor', {
      members: { children: 1, elderly: 0, adults: 2 },
    });
    expect(withKids.map((a) => a.id)).toContain('limit_children_outdoor_play');

    const { actions: noKids } = runSelection('Poor', {
      members: { children: 0, elderly: 0, adults: 2 },
    });
    expect(noKids.map((a) => a.id)).not.toContain('limit_children_outdoor_play');
  });
});
