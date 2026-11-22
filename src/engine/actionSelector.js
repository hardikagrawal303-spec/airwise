import { CATEGORY_RANK } from '../config/aqiBreakpoints.js';
import { ACTIONS, VALID_CATEGORIES } from '../knowledge/actions.js';

export const MAX_SELECTED_ACTIONS = 12;
export const MIN_ACTIONS_PER_CATEGORY = 2;

const COST_BONUS_BY_BUDGET = Object.freeze({
  low: Object.freeze({ free: 18, low: 10, medium: -6, high: -14 }),
  medium: Object.freeze({ free: 8, low: 6, medium: 2, high: -4 }),
  high: Object.freeze({ free: 4, low: 4, medium: 4, high: 4 }),
});

const EFFORT_BONUS = Object.freeze({
  easy: 6,
  moderate: 3,
  hard: 0,
});

const SCORE_WEIGHTS = Object.freeze({
  base: 20,
  minRankMultiplier: 8,
  poorSeverityBonus: 12,
  mandatorySensitivePoorBonus: 100,
  sensitiveMatchBonus: 16,
  highVulnCoreBonus: 8,
  commuteMatchBonus: 12,
  longCommuteBonus: 4,
  longCommuteMinKm: 8,
  cleanCookingFuelBonus: 32,
  cookingFuelMatchBonus: 16,
  purifierMatchBonus: 14,
  noPurifierMatchBonus: 14,
  childrenMatchBonus: 14,
  plantsNotePenalty: -10,
});

const SPECIAL_ACTION_IDS = Object.freeze({
  switchCleanCookingFuel: 'switch_clean_cooking_fuel',
  indoorPlantsRealisticNote: 'indoor_plants_realistic_note',
});

function isActionApplicable(action, { aqiRank, profile, risk }) {
  const minRank = CATEGORY_RANK[action.minCategory];
  if (aqiRank < minRank) {
    return false;
  }

  if (action.maxCategory) {
    const maxRank = CATEGORY_RANK[action.maxCategory];
    if (aqiRank > maxRank) {
      return false;
    }
  }

  const rules = action.appliesTo || {};

  if (rules.sensitiveOnly && !risk.isSensitiveGroup) {
    return false;
  }
  if (rules.needsChildren && !(profile.members?.children > 0)) {
    return false;
  }
  if (rules.needsPurifier && !profile.hasPurifier) {
    return false;
  }
  if (rules.needsNoPurifier && profile.hasPurifier) {
    return false;
  }
  if (Array.isArray(rules.commute) && !rules.commute.includes(profile.commute)) {
    return false;
  }
  if (Array.isArray(rules.cookingFuel) && !rules.cookingFuel.includes(profile.cookingFuel)) {
    return false;
  }
  if (Array.isArray(rules.homeType) && !rules.homeType.includes(profile.homeType)) {
    return false;
  }

  return true;
}

function scoreAction(action, { aqiRank, profile, risk }) {
  const minRank = CATEGORY_RANK[action.minCategory];
  const rules = action.appliesTo || {};

  // 1. Relevance to current AQI severity: higher-threshold actions get higher priority when triggered
  let score = SCORE_WEIGHTS.base + minRank * SCORE_WEIGHTS.minRankMultiplier;
  if (aqiRank >= CATEGORY_RANK['Poor'] && minRank >= CATEGORY_RANK['Poor']) {
    score += SCORE_WEIGHTS.poorSeverityBonus;
  }

  // 2. Sensitivity weight
  if (
    action.mandatoryIfSensitivePoorPlus &&
    risk.isSensitiveGroup &&
    aqiRank >= CATEGORY_RANK['Poor']
  ) {
    score += SCORE_WEIGHTS.mandatorySensitivePoorBonus;
  } else if (risk.isSensitiveGroup && (rules.sensitiveOnly || rules.needsChildren)) {
    score += SCORE_WEIGHTS.sensitiveMatchBonus;
  }
  if (
    risk.vulnerabilityLevel === 'high' &&
    (action.category === 'daily_routine' || action.category === 'indoor_air')
  ) {
    score += SCORE_WEIGHTS.highVulnCoreBonus;
  }

  // 3. Budget and effort alignment
  const budgetTable = COST_BONUS_BY_BUDGET[profile.budget] || COST_BONUS_BY_BUDGET.medium;
  score += budgetTable[action.cost] ?? 0;
  score += EFFORT_BONUS[action.effort] ?? 0;

  // 4. Direct household profile match bonuses
  if (Array.isArray(rules.commute) && rules.commute.includes(profile.commute)) {
    score += SCORE_WEIGHTS.commuteMatchBonus;
    if ((profile.commuteKmPerDay || 0) >= SCORE_WEIGHTS.longCommuteMinKm) {
      score += SCORE_WEIGHTS.longCommuteBonus;
    }
  }
  if (Array.isArray(rules.cookingFuel) && rules.cookingFuel.includes(profile.cookingFuel)) {
    const isSolidOrKerosene =
      profile.cookingFuel === 'wood_or_biomass' || profile.cookingFuel === 'kerosene';
    score +=
      isSolidOrKerosene && action.id === SPECIAL_ACTION_IDS.switchCleanCookingFuel
        ? SCORE_WEIGHTS.cleanCookingFuelBonus
        : SCORE_WEIGHTS.cookingFuelMatchBonus;
  }
  if (rules.needsPurifier && profile.hasPurifier) {
    score += SCORE_WEIGHTS.purifierMatchBonus;
  }
  if (rules.needsNoPurifier && !profile.hasPurifier) {
    score += SCORE_WEIGHTS.noPurifierMatchBonus;
  }
  if (rules.needsChildren && profile.members?.children > 0) {
    score += SCORE_WEIGHTS.childrenMatchBonus;
  }

  // Keep realistic plants note lower priority so practical protective steps lead
  if (action.id === SPECIAL_ACTION_IDS.indoorPlantsRealisticNote) {
    score += SCORE_WEIGHTS.plantsNotePenalty;
  }

  return score;
}

function compareScored(a, b) {
  if (b.priorityScore !== a.priorityScore) {
    return b.priorityScore - a.priorityScore;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Deterministically select up to 12 prioritized actions from the curated catalogue,
 * guaranteeing at least 2 actions per category where applicable and always including
 * the medical-care safety action for sensitive groups when AQI is Poor or worse.
 *
 * @param {{ aqiResult: import('../types.d.ts').AqiResult, profile: import('../types.d.ts').HouseholdProfile, risk: import('../types.d.ts').RiskProfile }} input - Action selection inputs.
 * @returns {import('../types.d.ts').ActionItem[]} Priority-sorted actions capped at MAX_SELECTED_ACTIONS.
 */
export function selectActions({ aqiResult, profile, risk }) {
  if (!aqiResult || !(aqiResult.category in CATEGORY_RANK)) {
    throw new TypeError('selectActions requires a valid aqiResult');
  }
  if (!profile || typeof profile !== 'object') {
    throw new TypeError('selectActions requires a valid profile');
  }
  if (!risk || typeof risk !== 'object') {
    throw new TypeError('selectActions requires a valid risk profile');
  }

  const aqiRank = CATEGORY_RANK[aqiResult.category];
  const ctx = { aqiRank, profile, risk };

  const eligible = ACTIONS.filter((action) => isActionApplicable(action, ctx))
    .map((action) => ({
      ...action,
      priorityScore: scoreAction(action, ctx),
    }))
    .sort(compareScored);

  const chosen = [];
  const chosenIds = new Set();

  const pick = (item) => {
    if (!item || chosenIds.has(item.id) || chosen.length >= MAX_SELECTED_ACTIONS) {
      return false;
    }
    chosen.push(item);
    chosenIds.add(item.id);
    return true;
  };

  // Step 1: Mandatory safety action when sensitive group + Poor or worse
  if (risk.isSensitiveGroup && aqiRank >= CATEGORY_RANK['Poor']) {
    const mandatory = eligible.find((a) => a.mandatoryIfSensitivePoorPlus);
    pick(mandatory);
  }

  // Step 2: Guarantee at least MIN_ACTIONS_PER_CATEGORY per category where applicable
  for (const category of VALID_CATEGORIES) {
    const existingCount = chosen.filter((a) => a.category === category).length;
    let needed = Math.max(0, MIN_ACTIONS_PER_CATEGORY - existingCount);
    if (needed === 0) continue;

    for (const candidate of eligible) {
      if (candidate.category === category && !chosenIds.has(candidate.id)) {
        if (pick(candidate)) {
          needed -= 1;
          if (needed === 0) break;
        }
      }
    }
  }

  // Step 3: Fill remaining slots up to MAX_SELECTED_ACTIONS in priority order
  for (const candidate of eligible) {
    if (chosen.length >= MAX_SELECTED_ACTIONS) break;
    pick(candidate);
  }

  return chosen.sort(compareScored);
}
