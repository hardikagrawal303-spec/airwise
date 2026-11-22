import {
  COMMUTE_DAYS_PER_MONTH,
  COMMUTE_MODE_ALIASES,
  EMISSION_FACTORS,
} from '../config/emissionFactors.js';
import { ACTIONS_BY_ID } from '../knowledge/actions.js';

const ACTION_EXPOSURE_GUIDANCE = Object.freeze({
  wear_n95_outdoors: {
    exposureEffectKey: 'impact.exposure.wear_n95_outdoors.effect',
    summaryKey: 'impact.exposure.wear_n95_outdoors.summary',
    formulaKey: 'impact.exposure.wear_n95_outdoors.formula',
    assumptionKeys: [
      'impact.exposure.wear_n95_outdoors.assumption1',
      'impact.exposure.wear_n95_outdoors.assumption2',
    ],
    confidence: 'medium',
    isEstimate: true,
  },
  run_hepa_purifier: {
    exposureEffectKey: 'impact.exposure.run_hepa_purifier.effect',
    summaryKey: 'impact.exposure.run_hepa_purifier.summary',
    formulaKey: 'impact.exposure.run_hepa_purifier.formula',
    assumptionKeys: [
      'impact.exposure.run_hepa_purifier.assumption1',
      'impact.exposure.run_hepa_purifier.assumption2',
    ],
    confidence: 'medium',
    isEstimate: true,
  },
  diy_box_fan_filter: {
    exposureEffectKey: 'impact.exposure.diy_box_fan_filter.effect',
    summaryKey: 'impact.exposure.diy_box_fan_filter.summary',
    formulaKey: 'impact.exposure.diy_box_fan_filter.formula',
    assumptionKeys: [
      'impact.exposure.diy_box_fan_filter.assumption1',
      'impact.exposure.diy_box_fan_filter.assumption2',
    ],
    confidence: 'low',
    isEstimate: true,
  },
  indoor_plants_realistic_note: {
    exposureEffectKey: 'impact.exposure.indoor_plants_realistic_note.effect',
    summaryKey: 'impact.exposure.indoor_plants_realistic_note.summary',
    formulaKey: 'impact.exposure.indoor_air.formula',
    assumptionKeys: ['impact.exposure.indoor_air.assumption1'],
    confidence: 'low',
    isEstimate: true,
  },
});

const COMMUNITY_EMISSIONS_GUIDANCE = Object.freeze({
  exposureEffectKey: 'impact.exposure.community.effect',
  summaryKey: 'impact.exposure.community.summary',
  formulaKey: 'impact.exposure.community.formula',
  assumptionKeys: ['impact.exposure.community.assumption1'],
  confidence: 'low',
  isEstimate: true,
});

const CATEGORY_EXPOSURE_GUIDANCE = Object.freeze({
  indoor_air: {
    exposureEffectKey: 'impact.exposure.indoor_air.effect',
    summaryKey: 'impact.exposure.indoor_air.summary',
    formulaKey: 'impact.exposure.indoor_air.formula',
    assumptionKeys: ['impact.exposure.indoor_air.assumption1'],
    confidence: 'low',
    isEstimate: true,
  },
  community: COMMUNITY_EMISSIONS_GUIDANCE,
  sustainable_alternative: COMMUNITY_EMISSIONS_GUIDANCE,
});

const DEFAULT_EXPOSURE_GUIDANCE = Object.freeze({
  exposureEffectKey: 'impact.exposure.default.effect',
  summaryKey: 'impact.exposure.default.summary',
  formulaKey: 'impact.exposure.default.formula',
  assumptionKeys: ['impact.exposure.default.assumption1'],
  confidence: 'low',
  isEstimate: true,
});

function round2(value) {
  return Math.round(value * 100) / 100;
}

function resolveMode(mode, paramName) {
  if (typeof mode !== 'string' || !(mode in COMMUTE_MODE_ALIASES)) {
    throw new TypeError(`Invalid ${paramName}: "${String(mode)}"`);
  }
  const canonical = COMMUTE_MODE_ALIASES[mode];
  return { canonical, factor: EMISSION_FACTORS[canonical] };
}

/**
 * Estimate daily and monthly CO2e savings from switching daily commute mode.
 * Returns locale keys plus interpolation parameters, confidence, and isEstimate: true.
 *
 * @param {{ currentMode: string, newMode: string, kmPerDay: number }} input - Commute comparison inputs.
 * @returns {import('../types.d.ts').CommuteImpact} Transparent localized CO2e savings estimate with formula and assumptions keys.
 */
export function estimateCommuteSwitch({ currentMode, newMode, kmPerDay }) {
  const current = resolveMode(currentMode, 'currentMode');
  const target = resolveMode(newMode, 'newMode');

  if (
    typeof kmPerDay !== 'number' ||
    Number.isNaN(kmPerDay) ||
    !Number.isFinite(kmPerDay) ||
    kmPerDay < 0
  ) {
    throw new RangeError('kmPerDay must be a finite number >= 0');
  }

  const diffPerKm = Math.max(0, current.factor.kgCO2ePerKm - target.factor.kgCO2ePerKm);
  const dailyKgCO2Saved = round2(diffPerKm * kmPerDay);
  const monthlyKgCO2Saved = round2(dailyKgCO2Saved * COMMUTE_DAYS_PER_MONTH);
  const noReduction = kmPerDay === 0 || current.canonical === target.canonical || diffPerKm === 0;

  return {
    currentMode: current.canonical,
    newMode: target.canonical,
    currentLabelKey: current.factor.labelKey,
    newLabelKey: target.factor.labelKey,
    kmPerDay,
    dailyKgCO2Saved,
    monthlyKgCO2Saved,
    summaryKey: noReduction ? 'impact.commute.summaryNone' : 'impact.commute.summarySwitch',
    summaryParams: noReduction
      ? {}
      : {
          kmPerDay,
          currentModeKey: current.factor.labelKey,
          newModeKey: target.factor.labelKey,
          dailyKgCO2Saved,
          monthlyKgCO2Saved,
        },
    formulaKey: 'impact.commute.formula',
    formulaParams: {
      currentFactor: current.factor.kgCO2ePerKm,
      newFactor: target.factor.kgCO2ePerKm,
      kmPerDay,
      dailyKgCO2Saved,
      commuteDays: COMMUTE_DAYS_PER_MONTH,
      monthlyKgCO2Saved,
    },
    assumptionKeys: [
      { key: current.factor.noteKey, params: { factor: current.factor.kgCO2ePerKm } },
      { key: target.factor.noteKey, params: { factor: target.factor.kgCO2ePerKm } },
      { key: 'impact.commute.assumptionDays', params: { days: COMMUTE_DAYS_PER_MONTH } },
      { key: 'impact.commute.assumptionApproximate', params: {} },
    ],
    confidence: 'medium',
    isEstimate: true,
  };
}

/**
 * Pick a practical cleaner commute comparison for the household profile.
 *
 * @param {import('../types.d.ts').HouseholdProfile} profile - Household profile with commute mode and km/day.
 * @returns {import('../types.d.ts').CommuteImpact} Commute CO2e comparison estimate.
 */
export function buildCommuteComparison(profile) {
  const current = profile?.commute || 'car';
  const kmPerDay = typeof profile?.commuteKmPerDay === 'number' ? profile.commuteKmPerDay : 0;

  let newMode = 'metro';
  if (current === 'metro' || current === 'bus') {
    newMode = current === 'bus' ? 'metro' : 'cycle';
  } else if (current === 'walk' || current === 'cycle' || current === 'work_from_home') {
    newMode = current;
  }

  return estimateCommuteSwitch({ currentMode: current, newMode, kmPerDay });
}

/**
 * Honest qualitative exposure-reduction guidance keys for actions.
 * Never invents disease-prevention numbers; uses localized "can help reduce" copy only.
 *
 * @param {string} actionId - Curated action identifier.
 * @returns {import('../types.d.ts').ExposureImpact} Qualitative impact locale keys.
 */
export function estimateExposureReduction(actionId) {
  const actionCategory = ACTIONS_BY_ID[actionId]?.category;
  const entry =
    ACTION_EXPOSURE_GUIDANCE[actionId] ||
    CATEGORY_EXPOSURE_GUIDANCE[actionCategory] ||
    DEFAULT_EXPOSURE_GUIDANCE;
  return { ...entry, assumptionKeys: [...entry.assumptionKeys] };
}
