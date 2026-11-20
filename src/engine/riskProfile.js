import { CATEGORY_RANK } from '../config/aqiBreakpoints.js';

/**
 * Threshold constants for household vulnerability classification.
 * Kept explicit so every risk decision is auditable and unit-testable.
 */
export const RISK_THRESHOLDS = Object.freeze({
  // AQI rank at which a respiratory/heart condition escalates risk to "high" ("Poor" = rank 3)
  CONDITION_HIGH_AQI_RANK: CATEGORY_RANK['Poor'],
  // AQI rank at which children or elderly escalate risk to "high" ("Very Poor" = rank 4)
  AGE_SENSITIVE_HIGH_AQI_RANK: CATEGORY_RANK['Very Poor'],
  // AQI rank at which even a standard household faces elevated exposure ("Very Poor" = rank 4)
  STANDARD_ELEVATED_AQI_RANK: CATEGORY_RANK['Very Poor'],
  // AQI rank at which open-air commutes add meaningful exposure ("Poor" = rank 3)
  OPEN_COMMUTE_AQI_RANK: CATEGORY_RANK['Poor'],
  // Minimum daily commute distance (km) to note open-air commute exposure
  OPEN_COMMUTE_MIN_KM: 5,
});

export const OPEN_EXPOSURE_COMMUTES = Object.freeze(new Set(['walk', 'cycle', 'two_wheeler', 'auto']));
export const HIGH_INDOOR_SMOKE_FUELS = Object.freeze(new Set(['wood_or_biomass', 'kerosene']));

/**
 * Evaluate household vulnerability level based on household profile and current AQI.
 * Pure function: does not store, mutate, or log any profile fields.
 *
 * @param {object} profile - Validated household profile
 * @param {object} aqiResult - Result from calculateAqi ({ aqi, category })
 * @returns {{ vulnerabilityLevel: 'standard'|'elevated'|'high', reasons: string[], isSensitiveGroup: boolean }}
 */
export function evaluateRiskProfile(profile, aqiResult) {
  if (!profile || typeof profile !== 'object' || !profile.members) {
    throw new TypeError('A valid household profile is required');
  }
  if (!aqiResult || typeof aqiResult.category !== 'string' || !(aqiResult.category in CATEGORY_RANK)) {
    throw new TypeError('A valid aqiResult with a CPCB category is required');
  }

  const aqiRank = CATEGORY_RANK[aqiResult.category];
  const hasChildren = (profile.members.children || 0) > 0;
  const hasElderly = (profile.members.elderly || 0) > 0;
  const hasCondition = Boolean(profile.hasRespiratoryOrHeartCondition);

  const isSensitiveGroup = hasChildren || hasElderly || hasCondition;
  const reasons = [];

  if (hasChildren) {
    reasons.push('risk.reason.children');
  }
  if (hasElderly) {
    reasons.push('risk.reason.elderly');
  }
  if (hasCondition) {
    reasons.push('risk.reason.health_condition');
  }
  if (HIGH_INDOOR_SMOKE_FUELS.has(profile.cookingFuel)) {
    reasons.push('risk.reason.indoor_smoke_fuel');
  }
  if (
    OPEN_EXPOSURE_COMMUTES.has(profile.commute) &&
    (profile.commuteKmPerDay || 0) >= RISK_THRESHOLDS.OPEN_COMMUTE_MIN_KM &&
    aqiRank >= RISK_THRESHOLDS.OPEN_COMMUTE_AQI_RANK
  ) {
    reasons.push('risk.reason.open_commute');
  }

  let vulnerabilityLevel = 'standard';

  if (
    (hasCondition && aqiRank >= RISK_THRESHOLDS.CONDITION_HIGH_AQI_RANK) ||
    ((hasChildren || hasElderly) && aqiRank >= RISK_THRESHOLDS.AGE_SENSITIVE_HIGH_AQI_RANK)
  ) {
    vulnerabilityLevel = 'high';
  } else if (
    isSensitiveGroup ||
    aqiRank >= RISK_THRESHOLDS.STANDARD_ELEVATED_AQI_RANK ||
    (HIGH_INDOOR_SMOKE_FUELS.has(profile.cookingFuel) &&
      aqiRank >= RISK_THRESHOLDS.OPEN_COMMUTE_AQI_RANK)
  ) {
    vulnerabilityLevel = 'elevated';
    if (!isSensitiveGroup && aqiRank >= RISK_THRESHOLDS.STANDARD_ELEVATED_AQI_RANK) {
      reasons.push('risk.reason.severe_air');
    }
  }

  return {
    vulnerabilityLevel,
    reasons,
    isSensitiveGroup,
  };
}
