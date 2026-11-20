import { announce, clearFormErrors, showFormErrors } from './a11y.js';
import { ClientApiError, geocodeCities, mapErrorToLocaleKey } from './api.js';

const byId = (id) => document.getElementById(id);
const val = (id) => byId(id)?.value;

function readManualLocation(errors, t) {
  const pm25Raw = val('manual-pm25')?.trim() ?? '';
  const pm10Raw = val('manual-pm10')?.trim() ?? '';
  const placeRaw = val('manual-place')?.trim() ?? '';
  const pm25 = pm25Raw === '' ? Number.NaN : Number(pm25Raw);

  if (!Number.isFinite(pm25) || pm25 < 0 || pm25 > 1500) {
    errors.push({ fieldId: 'manual-pm25', message: t('form.error.pm25Invalid') });
  }
  let pm10 = null;
  if (pm10Raw) {
    pm10 = Number(pm10Raw);
    if (!Number.isFinite(pm10) || pm10 < 0 || pm10 > 2000) {
      errors.push({ fieldId: 'manual-pm10', message: t('form.error.pm10Invalid') });
    }
  }
  if (errors.length > 0) return null;
  const manual = { pm25 };
  if (pm10 !== null) manual.pm10 = pm10;
  if (placeRaw) manual.label = placeRaw;
  return manual;
}

/**
 * Collect and validate household and location fields into a plan payload.
 * @param {object} opts
 * @returns {{ ok: boolean, errors?: Array, payload?: object }}
 */
export function collectAndValidateForm({ state, t, getLanguage }) {
  const errors = [];
  const adults = Number.parseInt(val('adults-input'), 10);
  const children = Number.parseInt(val('children-input'), 10) || 0;
  const elderly = Number.parseInt(val('elderly-input'), 10) || 0;
  const commuteKmPerDay = Number(val('commute-km-input'));

  if (!Number.isInteger(adults) || adults < 1 || adults > 10) {
    errors.push({ fieldId: 'adults-input', message: t('form.error.adultsInvalid') });
  }
  if (!Number.isFinite(commuteKmPerDay) || commuteKmPerDay < 0 || commuteKmPerDay > 200) {
    errors.push({ fieldId: 'commute-km-input', message: t('form.error.kmInvalid') });
  }

  let location = null;
  let manual = null;
  if (state.useManual) {
    manual = readManualLocation(errors, t);
  } else if (!state.selectedLocation) {
    errors.push({ fieldId: 'city-input', message: t('form.error.locationRequired') });
  } else {
    location = { ...state.selectedLocation };
  }

  if (errors.length > 0) return { ok: false, errors };

  const payload = {
    profile: {
      members: {
        adults,
        children: Math.min(10, Math.max(0, children)),
        elderly: Math.min(10, Math.max(0, elderly)),
      },
      hasRespiratoryOrHeartCondition: Boolean(byId('condition-input')?.checked),
      commute: val('commute-select') || 'car',
      commuteKmPerDay,
      cookingFuel: val('fuel-select') || 'lpg',
      hasPurifier: val('purifier-select') === 'true',
      budget: val('budget-select') || 'medium',
      homeType: val('home-type-select') || 'apartment',
      language: getLanguage(),
    },
  };
  if (manual) payload.manual = manual;
  else payload.location = location;

  return { ok: true, payload };
}

/**
 * Bind household form submission, auto-geocoding fallback, and error summary.
 * @param {object} opts
 * @returns {void}
 */
export function bindFormSubmission({ state, t, getLanguage, selectCity, onSubmit, onError }) {
  const form = byId('household-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.isSubmitting) return;

    const summaryEl = byId('error-summary');
    const listEl = byId('error-summary-list');
    clearFormErrors(form, summaryEl, listEl);

    if (!state.useManual && !state.selectedLocation) {
      const typed = val('city-input')?.trim() || '';
      if (typed.length >= 2) {
        try {
          const matches = await geocodeCities(typed);
          if (matches.length > 0) selectCity(matches[0]);
        } catch (err) {
          if (err?.name !== 'AbortError') {
            onError(
              err instanceof ClientApiError
                ? err.localeKey
                : mapErrorToLocaleKey({ code: 'GEOCODE_FAILED' })
            );
          }
        }
      }
    }

    const validation = collectAndValidateForm({ state, t, getLanguage });
    if (!validation.ok) {
      showFormErrors(validation.errors, { summaryEl, listEl, doc: document });
      announce(byId('live-status'), t('form.errorSummaryHeading'));
      return;
    }

    await onSubmit(validation.payload, { focusResult: true });
  });
}
