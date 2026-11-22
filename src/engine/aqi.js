import {
  AQI_CAP,
  AQI_CATEGORIES,
  PM10_BREAKPOINTS,
  PM25_BREAKPOINTS,
} from '../config/aqiBreakpoints.js';

function assertValidConcentration(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  if (value < 0) {
    throw new RangeError(`${label} cannot be negative`);
  }
}

/**
 * Compute CPCB pollutant sub-index via linear interpolation:
 * I = ((Ihi - Ilo) / (BPhi - BPlo)) * (C - BPlo) + Ilo
 * Capped at 500 and rounded to the nearest integer.
 *
 * @param {number} concentration - Pollutant concentration in ug/m3.
 * @param {readonly import('../types.d.ts').AqiBreakpoint[]} breakpoints - Ordered CPCB breakpoint segments.
 * @param {string} [label='concentration'] - Label for validation error messages.
 * @returns {number} Integer CPCB sub-index in [0, 500].
 */
export function calculateSubIndex(concentration, breakpoints, label = 'concentration') {
  assertValidConcentration(concentration, label);

  let band = breakpoints[breakpoints.length - 1];
  for (const candidate of breakpoints) {
    if (concentration <= candidate.bpHi) {
      band = candidate;
      break;
    }
  }

  // Clamp fractional values falling in the 1-unit integer gap (e.g. 30.4 between 30 and 31)
  // to the band's lower breakpoint so interpolation never dips below iLo.
  const effectiveC = Math.max(band.bpLo, concentration);
  const raw =
    ((band.iHi - band.iLo) / (band.bpHi - band.bpLo)) * (effectiveC - band.bpLo) + band.iLo;

  return Math.min(AQI_CAP, Math.round(raw));
}

/**
 * Map a numeric CPCB AQI value to its official category metadata.
 *
 * @param {number} aqi - Computed CPCB AQI score.
 * @returns {import('../types.d.ts').AqiCategoryInfo} Matching CPCB category band.
 */
export function getAqiCategory(aqi) {
  assertValidConcentration(aqi, 'aqi');
  const clamped = Math.min(AQI_CAP, Math.round(aqi));
  for (const entry of AQI_CATEGORIES) {
    if (clamped >= entry.min && clamped <= entry.max) {
      return entry;
    }
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

/**
 * Calculate overall Indian CPCB AQI from PM2.5 and optional PM10 concentrations (ug/m3).
 * Overall AQI = max(subIndex(PM2.5), subIndex(PM10)), capped at 500.
 *
 * @param {{ pm25?: number, pm10?: number|null }} [readings] - Pollutant concentrations.
 * @returns {import('../types.d.ts').AqiResult} Computed CPCB AQI breakdown.
 */
export function calculateAqi({ pm25, pm10 = null } = {}) {
  assertValidConcentration(pm25, 'pm25');

  const pm25SubIndex = calculateSubIndex(pm25, PM25_BREAKPOINTS, 'pm25');
  let pm10SubIndex = null;

  if (pm10 !== null && pm10 !== undefined) {
    assertValidConcentration(pm10, 'pm10');
    pm10SubIndex = calculateSubIndex(pm10, PM10_BREAKPOINTS, 'pm10');
  }

  let aqi = pm25SubIndex;
  /** @type {'PM2.5'|'PM10'} */
  let dominantPollutant = 'PM2.5';

  if (pm10SubIndex !== null && pm10SubIndex > pm25SubIndex) {
    aqi = pm10SubIndex;
    dominantPollutant = 'PM10';
  }

  const categoryInfo = getAqiCategory(aqi);

  return {
    aqi,
    category: categoryInfo.name,
    band: categoryInfo.slug,
    dominantPollutant,
    subIndices: {
      pm25: pm25SubIndex,
      pm10: pm10SubIndex,
    },
  };
}
