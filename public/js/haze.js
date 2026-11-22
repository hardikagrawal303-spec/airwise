import { UI_TIMINGS } from './a11y.js';

export const VALID_BANDS = Object.freeze([
  'good',
  'satisfactory',
  'moderate',
  'poor',
  'very-poor',
  'severe',
]);

const CATEGORY_TO_BAND = Object.freeze({
  Good: 'good',
  Satisfactory: 'satisfactory',
  Moderate: 'moderate',
  Poor: 'poor',
  'Very Poor': 'very-poor',
  Severe: 'severe',
});

const settleTimers = new WeakMap();

/**
 * Normalize a CPCB category or slug into a data-band token.
 * @param {string} category
 * @returns {string}
 */
export function bandFromCategory(category) {
  if (typeof category === 'string' && category in CATEGORY_TO_BAND) {
    return CATEGORY_TO_BAND[category];
  }
  const normalized = String(category || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (VALID_BANDS.includes(normalized)) {
    return normalized;
  }
  return 'moderate';
}

/**
 * Set hero skyline haze via data-band attribute only, cancelling any overlapping settle timer.
 * @param {HTMLElement|null} heroEl
 * @param {string} categoryOrBand
 * @param {{animate?: boolean}} [opts]
 * @returns {string}
 */
export function setHeroBand(heroEl, categoryOrBand, { animate = false } = {}) {
  if (!heroEl) return 'moderate';
  const band = bandFromCategory(categoryOrBand);

  const pending = settleTimers.get(heroEl);
  if (pending !== undefined) {
    clearTimeout(pending);
    settleTimers.delete(heroEl);
  }

  if (animate) {
    heroEl.classList.add('haze-settling');
    heroEl.setAttribute('data-band', band);
    const timerId = setTimeout(() => {
      settleTimers.delete(heroEl);
      heroEl.classList.remove('haze-settling');
    }, UI_TIMINGS.hazeSettleMs);
    settleTimers.set(heroEl, timerId);
  } else {
    heroEl.classList.remove('haze-settling');
    heroEl.setAttribute('data-band', band);
  }

  return band;
}
