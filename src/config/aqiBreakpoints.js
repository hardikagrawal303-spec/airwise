/**
 * Indian CPCB (Central Pollution Control Board) National Air Quality Index
 * categories and 24-hour concentration breakpoints for PM2.5 and PM10 (ug/m3).
 *
 * Note: Applying 24-hour CPCB breakpoint tables to instantaneous/current
 * concentrations is a transparent approximation (documented in README).
 * For the open-ended Severe band (PM2.5 > 250, PM10 > 430), we extrapolate
 * linearly across a matching top-band width (251-380 for PM2.5, 431-510 for
 * PM10) and cap the resulting sub-index at 500.
 */

export const AQI_CATEGORIES = Object.freeze([
  Object.freeze({ name: 'Good', slug: 'good', min: 0, max: 50, rank: 0 }),
  Object.freeze({ name: 'Satisfactory', slug: 'satisfactory', min: 51, max: 100, rank: 1 }),
  Object.freeze({ name: 'Moderate', slug: 'moderate', min: 101, max: 200, rank: 2 }),
  Object.freeze({ name: 'Poor', slug: 'poor', min: 201, max: 300, rank: 3 }),
  Object.freeze({ name: 'Very Poor', slug: 'very-poor', min: 301, max: 400, rank: 4 }),
  Object.freeze({ name: 'Severe', slug: 'severe', min: 401, max: 500, rank: 5 }),
]);

export const CATEGORY_RANK = Object.freeze(
  Object.fromEntries(AQI_CATEGORIES.map((c) => [c.name, c.rank]))
);

export const PM25_BREAKPOINTS = Object.freeze([
  Object.freeze({ bpLo: 0, bpHi: 30, iLo: 0, iHi: 50, category: 'Good' }),
  Object.freeze({ bpLo: 31, bpHi: 60, iLo: 51, iHi: 100, category: 'Satisfactory' }),
  Object.freeze({ bpLo: 61, bpHi: 90, iLo: 101, iHi: 200, category: 'Moderate' }),
  Object.freeze({ bpLo: 91, bpHi: 120, iLo: 201, iHi: 300, category: 'Poor' }),
  Object.freeze({ bpLo: 121, bpHi: 250, iLo: 301, iHi: 400, category: 'Very Poor' }),
  Object.freeze({ bpLo: 251, bpHi: 380, iLo: 401, iHi: 500, category: 'Severe' }),
]);

export const PM10_BREAKPOINTS = Object.freeze([
  Object.freeze({ bpLo: 0, bpHi: 50, iLo: 0, iHi: 50, category: 'Good' }),
  Object.freeze({ bpLo: 51, bpHi: 100, iLo: 51, iHi: 100, category: 'Satisfactory' }),
  Object.freeze({ bpLo: 101, bpHi: 250, iLo: 101, iHi: 200, category: 'Moderate' }),
  Object.freeze({ bpLo: 251, bpHi: 350, iLo: 201, iHi: 300, category: 'Poor' }),
  Object.freeze({ bpLo: 351, bpHi: 430, iLo: 301, iHi: 400, category: 'Very Poor' }),
  Object.freeze({ bpLo: 431, bpHi: 510, iLo: 401, iHi: 500, category: 'Severe' }),
]);

export const AQI_CAP = 500;
