import {
  COMMUTE_DAYS_PER_MONTH,
  COMMUTE_MODE_ALIASES,
  EMISSION_FACTORS,
} from '../config/emissionFactors.js';

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
 * Returns transparent formula, assumptions, confidence, and isEstimate: true.
 */
export function estimateCommuteSwitch({ currentMode, newMode, kmPerDay }) {
  const current = resolveMode(currentMode, 'currentMode');
  const target = resolveMode(newMode, 'newMode');

  if (typeof kmPerDay !== 'number' || Number.isNaN(kmPerDay) || !Number.isFinite(kmPerDay) || kmPerDay < 0) {
    throw new RangeError('kmPerDay must be a finite number >= 0');
  }

  const diffPerKm = Math.max(0, current.factor.kgCO2ePerKm - target.factor.kgCO2ePerKm);
  const dailyKgCO2Saved = round2(diffPerKm * kmPerDay);
  const monthlyKgCO2Saved = round2(dailyKgCO2Saved * COMMUTE_DAYS_PER_MONTH);

  const formula = `(${current.factor.kgCO2ePerKm} - ${target.factor.kgCO2ePerKm}) kg CO2e/km * ${kmPerDay} km/day = ${dailyKgCO2Saved} kg/day; * ${COMMUTE_DAYS_PER_MONTH} days = ${monthlyKgCO2Saved} kg/month (estimate)`;

  let summary;
  if (kmPerDay === 0 || current.canonical === target.canonical || diffPerKm === 0) {
    summary = 'No commute CO2e reduction calculated for this comparison (estimate).';
  } else {
    summary = `Switching ${kmPerDay} km/day from ${current.factor.label.toLowerCase()} to ${target.factor.label.toLowerCase()} can help reduce about ${dailyKgCO2Saved} kg CO2e per day (~${monthlyKgCO2Saved} kg/month, estimate).`;
  }

  return {
    currentMode: current.canonical,
    newMode: target.canonical,
    currentLabel: current.factor.label,
    newLabel: target.factor.label,
    kmPerDay,
    dailyKgCO2Saved,
    monthlyKgCO2Saved,
    summary,
    formula,
    assumptions: [
      current.factor.note,
      target.factor.note,
      `Monthly figure assumes ${COMMUTE_DAYS_PER_MONTH} commute days per month.`,
      'Approximate averages only; actual emissions vary with vehicle age, traffic, and occupancy.',
    ],
    confidence: 'medium',
    isEstimate: true,
  };
}

/**
 * Pick a practical cleaner commute comparison for the household profile.
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

  return estimateCommuteSwitch({
    currentMode: current,
    newMode,
    kmPerDay,
  });
}

/**
 * Honest qualitative exposure-reduction guidance for actions.
 * Never invents disease-prevention numbers; uses "can help reduce" language only.
 */
export function estimateExposureReduction(actionId) {
  if (actionId === 'wear_n95_outdoors') {
    return {
      exposureEffect: 'can help reduce personal particle exposure outdoors',
      summary:
        'If an N95/FFP2-type mask is worn with a tight face seal, it is rated to filter at least 95% of test particles (laboratory rating; real-world fit varies). This can help reduce the fine particles you breathe outdoors.',
      formula:
        'Laboratory filtration rating >= 95% at 0.3 um test aerosol; real-world intake depends on seal fit and wear time (estimate).',
      assumptions: [
        'Applies to properly fitted N95/FFP2 respirators, not loose cloth or surgical masks.',
        'Facial hair, gaps at the nose bridge, and removing the mask reduce real-world filtration.',
      ],
      confidence: 'medium',
      isEstimate: true,
    };
  }

  if (actionId === 'run_hepa_purifier') {
    return {
      exposureEffect: 'mainly reduces indoor airborne particles',
      summary:
        'A True HEPA filter is rated to capture 99.97% of 0.3 micron test particles passing through it (laboratory rating). In a closed, right-sized room, running it continuously can help reduce indoor PM2.5.',
      formula:
        'HEPA filter rating = 99.97% single-pass capture at 0.3 um; room-level drop depends on CADR vs room volume and air leakage (estimate).',
      assumptions: [
        'Requires windows and doors to stay mostly shut during peak smog.',
        'Filter performance drops if the unit is undersized for the room or the filter is overdue for replacement.',
      ],
      confidence: 'medium',
      isEstimate: true,
    };
  }

  if (actionId === 'diy_box_fan_filter') {
    return {
      exposureEffect: 'can help reduce indoor particles as a temporary stopgap',
      summary:
        'A taped box fan with a MERV-13 or HEPA replacement filter can help reduce indoor dust and smoke particles when used supervised as a low-cost stopgap.',
      formula:
        'Qualitative estimate: depends on fan airflow, filter grade, and sealing gaps around the filter frame.',
      assumptions: [
        'Stopgap measure only; never leave an improvised fan-filter running unattended or near water.',
        'Effectiveness is lower than a certified room HEPA purifier and depends on keeping gaps sealed.',
      ],
      confidence: 'low',
      isEstimate: true,
    };
  }

  const indoorIds = new Set([
    'timed_window_ventilation',
    'close_windows_evening_night',
    'seal_door_window_gaps',
    'wet_mop_no_dry_sweep',
    'avoid_incense_candles',
    'run_kitchen_exhaust',
    'keep_bedroom_clean_zone',
    'indoor_plants_realistic_note',
  ]);

  const communityIds = new Set([
    'switch_to_metro_or_bus',
    'carpool_school_office',
    'walk_cycle_short_trips',
    'switch_clean_cooking_fuel',
    'no_waste_leaf_burning',
    'avoid_diesel_generator',
    'engine_off_at_red_lights',
    'combine_deliveries_work_remote',
    'report_open_burning',
    'organize_rwa_school_smog_plan',
    'check_on_elderly_neighbours',
    'share_weekly_family_plan',
    'request_water_sprinkling_dust_control',
    'advocate_no_idling_school_gate',
  ]);

  if (indoorIds.has(actionId)) {
    return {
      exposureEffect: 'mainly reduces indoor particle buildup',
      summary:
        actionId === 'indoor_plants_realistic_note'
          ? 'Indoor plants brighten a room, but studies show household plants do not meaningfully lower indoor PM2.5; rely on sealing, ventilation timing, and filtration instead.'
          : 'Can help reduce indoor fine-particle buildup and keep your sleeping and living spaces calmer during peak smog hours.',
      formula: 'Qualitative indoor-air estimate (no single universal percentage applies across homes).',
      assumptions: [
        'Impact varies with room ventilation rate, outdoor AQI, and how tightly doors and windows close.',
      ],
      confidence: 'low',
      isEstimate: true,
    };
  }

  if (communityIds.has(actionId)) {
    return {
      exposureEffect: 'can help reduce local neighbourhood emissions',
      summary:
        'Can help reduce tailpipe, generator, or open-burning smoke in your immediate street and neighbourhood over time.',
      formula: 'Qualitative community-emissions estimate; impact scales with how many households participate.',
      assumptions: [
        'Individual actions matter most when paired with neighbourhood and municipal compliance.',
      ],
      confidence: 'low',
      isEstimate: true,
    };
  }

  return {
    exposureEffect: 'can help reduce personal exposure',
    summary:
      'Can help reduce the amount of polluted air your household breathes during peak winter inversion hours.',
    formula: 'Qualitative exposure-timing estimate based on duration and breathing rate outdoors.',
    assumptions: [
      'Lower breathing rate and shorter time outdoors reduce total inhaled particles, though exact amounts vary by location.',
    ],
    confidence: 'low',
    isEstimate: true,
  };
}
