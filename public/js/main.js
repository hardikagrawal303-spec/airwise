import { announce, bindDisclosure, clearFormErrors, moveFocus, showFormErrors } from './a11y.js';
import { ClientApiError, geocodeCities, mapErrorToLocaleKey, requestPlan } from './api.js';
import { setHeroBand } from './haze.js';
import { applyTranslations, getLanguage, loadLocale, t } from './i18n.js';
import { renderPlanResult } from './render.js';

const STORAGE_LANG_KEY = 'airwise_lang';
const STORAGE_THEME_KEY = 'airwise_theme';
const UI_TIMINGS = Object.freeze({
  citySearchDebounceMs: 300,
  listboxBlurCloseMs: 150,
  geoTimeoutMs: 8000,
  geoMaxAgeMs: 300000,
});
const byId = (id) => document.getElementById(id);

const state = {
  selectedLocation: null,
  useManual: false,
  citySuggestions: [],
  activeOptionIndex: -1,
  lastPlanData: null,
  lastRequestPayload: null,
  isSubmitting: false,
  debounceTimer: null,
};

function applyTheme(theme, persist) {
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  if (persist) localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
  const toggleBtn = byId('theme-toggle');
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-pressed', String(isDark));
    toggleBtn.textContent = isDark ? t('app.themeSwitchLight') : t('app.themeSwitchDark');
  }
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_THEME_KEY);
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light', false);
  byId('theme-toggle')?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(isDark ? 'light' : 'dark', true);
  });
}

function showApiError(localeKey) {
  const message = t(localeKey);
  const textEl = byId('api-error-text');
  const banner = byId('api-error-banner');
  if (textEl) textEl.textContent = message;
  if (banner) banner.hidden = false;
  announce(byId('live-status'), message);
}

function hideApiError() {
  const banner = byId('api-error-banner');
  if (banner) banner.hidden = true;
}

let manualDisclosure = null;

function setManualMode(open) {
  state.useManual = open;
  if (manualDisclosure) {
    manualDisclosure.setOpen(open);
  }
}

function closeListbox() {
  const input = byId('city-input');
  const listbox = byId('city-listbox');
  if (listbox) {
    listbox.hidden = true;
    listbox.textContent = '';
  }
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  state.activeOptionIndex = -1;
}

function selectCityOption(city) {
  const input = byId('city-input');
  state.selectedLocation = { lat: city.lat, lon: city.lon, label: city.label };
  if (input) {
    input.value = city.label;
    input.removeAttribute('aria-invalid');
  }
  closeListbox();
}

function renderListboxOptions(items, statusText = '') {
  const input = byId('city-input');
  const listbox = byId('city-listbox');
  if (!listbox || !input) return;

  listbox.textContent = '';
  state.citySuggestions = items;
  state.activeOptionIndex = -1;

  if (statusText || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'city-option-status';
    li.textContent = statusText || t('search.noResults');
    listbox.appendChild(li);
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  items.forEach((city, idx) => {
    const li = document.createElement('li');
    li.id = `city-opt-${idx}`;
    li.className = 'city-option';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.textContent = city.label;
    li.addEventListener('mousedown', (event) => {
      event.preventDefault();
      selectCityOption(city);
    });
    listbox.appendChild(li);
  });

  listbox.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function setActiveOption(index) {
  const input = byId('city-input');
  const listbox = byId('city-listbox');
  if (!listbox || !input || state.citySuggestions.length === 0) return;

  const total = state.citySuggestions.length;
  const wrapped = ((index % total) + total) % total;
  state.activeOptionIndex = wrapped;

  listbox.querySelectorAll('[role="option"]').forEach((opt, i) => {
    opt.setAttribute('aria-selected', String(i === wrapped));
  });
  input.setAttribute('aria-activedescendant', `city-opt-${wrapped}`);
}

function initCityCombobox() {
  const input = byId('city-input');
  if (!input) return;

  input.addEventListener('input', () => {
    state.selectedLocation = null;
    clearTimeout(state.debounceTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      closeListbox();
      return;
    }
    state.debounceTimer = setTimeout(async () => {
      renderListboxOptions([], t('search.searching'));
      try {
        renderListboxOptions(await geocodeCities(query));
      } catch (err) {
        closeListbox();
        showApiError(
          err instanceof ClientApiError
            ? err.localeKey
            : mapErrorToLocaleKey({ code: 'GEOCODE_FAILED' })
        );
      }
    }, UI_TIMINGS.citySearchDebounceMs);
  });

  input.addEventListener('keydown', (event) => {
    const listbox = byId('city-listbox');
    const isOpen = listbox && !listbox.hidden && state.citySuggestions.length > 0;
    if (event.key === 'ArrowDown' && isOpen) {
      event.preventDefault();
      setActiveOption(state.activeOptionIndex + 1);
    } else if (event.key === 'ArrowUp' && isOpen) {
      event.preventDefault();
      setActiveOption(
        state.activeOptionIndex <= 0
          ? state.citySuggestions.length - 1
          : state.activeOptionIndex - 1
      );
    } else if (event.key === 'Enter' && isOpen && state.activeOptionIndex >= 0) {
      event.preventDefault();
      selectCityOption(state.citySuggestions[state.activeOptionIndex]);
    } else if (event.key === 'Escape') {
      closeListbox();
    }
  });

  input.addEventListener('blur', () => setTimeout(closeListbox, UI_TIMINGS.listboxBlurCloseMs));
}

function initGeolocation() {
  const toggleBtn = byId('geo-toggle-btn');
  const panel = byId('geo-consent-panel');
  const statusEl = byId('geo-status');
  const geoDisclosure = bindDisclosure(toggleBtn, panel, {
    onToggle: () => {
      if (statusEl) statusEl.textContent = '';
    },
  });
  const closeConsent = () => geoDisclosure.setOpen(false);

  byId('geo-cancel-btn')?.addEventListener('click', () => {
    closeConsent();
    toggleBtn?.focus();
  });

  byId('geo-confirm-btn')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showApiError('error.GEOLOCATION_UNAVAILABLE');
      closeConsent();
      return;
    }
    if (statusEl) statusEl.textContent = t('form.geo.locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.selectedLocation = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          label: t('result.defaultPlace'),
        };
        setManualMode(false);
        const cityInput = byId('city-input');
        if (cityInput) {
          cityInput.value = t('form.geo.found');
          cityInput.removeAttribute('aria-invalid');
        }
        hideApiError();
        closeConsent();
        announce(byId('live-status'), t('form.geo.found'));
      },
      (err) => {
        closeConsent();
        showApiError(
          err?.code === 1 ? 'error.GEOLOCATION_DENIED' : 'error.GEOLOCATION_UNAVAILABLE'
        );
      },
      {
        enableHighAccuracy: false,
        timeout: UI_TIMINGS.geoTimeoutMs,
        maximumAge: UI_TIMINGS.geoMaxAgeMs,
      }
    );
  });
}

function collectAndValidateForm() {
  const errors = [];
  const adults = Number.parseInt(byId('adults-input')?.value, 10);
  const children = Number.parseInt(byId('children-input')?.value, 10) || 0;
  const elderly = Number.parseInt(byId('elderly-input')?.value, 10) || 0;
  const commute = byId('commute-select')?.value || 'car';
  const commuteKmPerDay = Number(byId('commute-km-input')?.value);
  const homeType = byId('home-type-select')?.value || 'apartment';
  const cookingFuel = byId('fuel-select')?.value || 'lpg';
  const hasPurifier = byId('purifier-select')?.value === 'true';
  const budget = byId('budget-select')?.value || 'medium';
  const hasRespiratoryOrHeartCondition = Boolean(byId('condition-input')?.checked);

  if (!Number.isInteger(adults) || adults < 1 || adults > 10) {
    errors.push({ fieldId: 'adults-input', message: t('form.error.adultsInvalid') });
  }
  if (!Number.isFinite(commuteKmPerDay) || commuteKmPerDay < 0 || commuteKmPerDay > 200) {
    errors.push({ fieldId: 'commute-km-input', message: t('form.error.kmInvalid') });
  }

  let locationPart = null;
  let manualPart = null;

  if (state.useManual) {
    const pm25Raw = byId('manual-pm25')?.value.trim();
    const pm10Raw = byId('manual-pm10')?.value.trim();
    const placeRaw = byId('manual-place')?.value.trim();
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
    if (errors.length === 0) {
      manualPart = { pm25 };
      if (pm10 !== null) manualPart.pm10 = pm10;
      if (placeRaw) manualPart.label = placeRaw;
    }
  } else if (!state.selectedLocation) {
    errors.push({ fieldId: 'city-input', message: t('form.error.locationRequired') });
  } else {
    locationPart = { ...state.selectedLocation };
  }

  if (errors.length > 0) return { ok: false, errors };

  const payload = {
    profile: {
      members: {
        adults,
        children: Math.min(10, Math.max(0, children)),
        elderly: Math.min(10, Math.max(0, elderly)),
      },
      hasRespiratoryOrHeartCondition,
      commute,
      commuteKmPerDay,
      cookingFuel,
      hasPurifier,
      budget,
      homeType,
      language: getLanguage(),
    },
  };
  if (manualPart) payload.manual = manualPart;
  else payload.location = locationPart;

  return { ok: true, payload };
}

function setLoadingUi(isLoading) {
  state.isSubmitting = isLoading;
  const submitBtn = byId('submit-btn');
  const emptyState = byId('empty-state');
  const loadingState = byId('loading-state');
  const planOutput = byId('plan-output');

  if (submitBtn) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? t('form.submitting') : t('form.submit');
  }
  if (loadingState) loadingState.hidden = !isLoading;
  if (isLoading) {
    if (emptyState) emptyState.hidden = true;
    if (planOutput) planOutput.hidden = true;
  }
}

async function submitPlan(payload, { focusResult = true } = {}) {
  const liveEl = byId('live-status');
  hideApiError();
  setLoadingUi(true);
  announce(liveEl, t('live.loading'));

  try {
    const data = await requestPlan(payload);
    state.lastPlanData = data;
    state.lastRequestPayload = payload;
    setLoadingUi(false);
    setHeroBand(byId('hero'), data.aqi.band || data.aqi.category, { animate: true });
    renderPlanResult(data, { doc: document, t, lang: getLanguage() });
    announce(liveEl, t('live.planReady'));
    if (focusResult) moveFocus(byId('plan-heading'));
  } catch (err) {
    setLoadingUi(false);
    const emptyState = byId('empty-state');
    if (emptyState && !state.lastPlanData) emptyState.hidden = false;
    showApiError(
      err instanceof ClientApiError ? err.localeKey : mapErrorToLocaleKey({ status: 500 })
    );
  }
}

async function handleLanguageToggle() {
  const nextLang = getLanguage() === 'en' ? 'hi' : 'en';
  await loadLocale(nextLang);
  applyTranslations(document, nextLang);
  localStorage.setItem(STORAGE_LANG_KEY, nextLang);

  byId('lang-toggle')?.setAttribute('aria-pressed', String(nextLang === 'hi'));
  applyTheme(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
    false
  );
  setManualMode(state.useManual);
  announce(byId('live-status'), t('live.languageChanged'));

  if (state.lastRequestPayload) {
    await submitPlan(
      {
        ...state.lastRequestPayload,
        profile: { ...state.lastRequestPayload.profile, language: nextLang },
      },
      { focusResult: false }
    );
  }
}

function initCommunityActions() {
  byId('print-btn')?.addEventListener('click', () => window.print());
  byId('share-btn')?.addEventListener('click', async () => {
    if (!state.lastPlanData) return;
    const { aqi, plan } = state.lastPlanData;
    const summaryText = [
      `${t('app.name')} — ${aqi.placeLabel || t('result.defaultPlace')}`,
      `PM2.5: ${aqi.pm25} µg/m³ | CPCB AQI: ${aqi.aqi} (${t(`aqi.band.${aqi.band}`)})`,
      plan.headline,
      '',
      ...(plan.items || []).slice(0, 5).map((item, idx) => `${idx + 1}. ${item.text}`),
    ].join('\n');

    try {
      if (navigator.share) {
        await navigator.share({ title: t('app.name'), text: summaryText });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryText);
        const feedbackEl = byId('share-feedback');
        if (feedbackEl) feedbackEl.textContent = t('community.shareCopied');
      }
    } catch {
      // User cancelled share dialog
    }
  });
}

async function bootstrap() {
  const savedLang = localStorage.getItem(STORAGE_LANG_KEY) === 'hi' ? 'hi' : 'en';
  await loadLocale('en');
  if (savedLang === 'hi') await loadLocale('hi');
  applyTranslations(document, savedLang);

  const langBtn = byId('lang-toggle');
  if (langBtn) {
    langBtn.setAttribute('aria-pressed', String(savedLang === 'hi'));
    langBtn.addEventListener('click', handleLanguageToggle);
  }

  initTheme();
  initCityCombobox();
  initGeolocation();
  initCommunityActions();

  manualDisclosure = bindDisclosure(byId('manual-toggle-btn'), byId('manual-panel'), {
    getClosedLabel: () => t('form.manual.toggle'),
    getOpenLabel: () => t('form.manual.toggleHide'),
    onToggle: (open) => {
      state.useManual = open;
      if (open) byId('manual-pm25')?.focus();
    },
  });
  byId('error-open-manual-btn')?.addEventListener('click', () => {
    hideApiError();
    setManualMode(true);
  });

  const form = byId('household-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.isSubmitting) return;

    const summaryEl = byId('error-summary');
    const listEl = byId('error-summary-list');
    clearFormErrors(form, summaryEl, listEl);

    if (!state.useManual && !state.selectedLocation) {
      const typed = byId('city-input')?.value.trim() || '';
      if (typed.length >= 2) {
        try {
          const matches = await geocodeCities(typed);
          if (matches.length > 0) selectCityOption(matches[0]);
        } catch {
          // Validation below will prompt user cleanly
        }
      }
    }

    const validation = collectAndValidateForm();
    if (!validation.ok) {
      showFormErrors(validation.errors, { summaryEl, listEl, doc: document });
      announce(byId('live-status'), t('form.errorSummaryHeading'));
      return;
    }

    await submitPlan(validation.payload, { focusResult: true });
  });
}

bootstrap();
