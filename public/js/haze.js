/**
 * Controls the hero skyline atmospheric haze strictly through the data-band
 * attribute (zero inline styles, zero JS-set CSS properties).
 */

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

export function setHeroBand(heroEl, categoryOrBand, { animate = false } = {}) {
  if (!heroEl) return 'moderate';
  const band = bandFromCategory(categoryOrBand);

  if (animate) {
    heroEl.classList.add('haze-settling');
    heroEl.setAttribute('data-band', band);
    setTimeout(() => {
      heroEl.classList.remove('haze-settling');
    }, 1300);
  } else {
    heroEl.classList.remove('haze-settling');
    heroEl.setAttribute('data-band', band);
  }

  return band;
}
