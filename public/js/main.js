import { announce, bindDisclosure, byId, moveFocus, UI_TIMINGS } from './a11y.js';
import { ClientApiError, mapErrorToLocaleKey, requestPlan } from './api.js';
import { initCityCombobox } from './combobox.js';
import { bindFormSubmission } from './form.js';
import { initGeolocation } from './geolocation.js';
import { setHeroBand } from './haze.js';
import { applyTranslations, getLanguage, loadLocale, t } from './i18n.js';
import { renderPlanResult } from './render.js';

const STORAGE_LANG_KEY = 'airwise_lang';
const STORAGE_THEME_KEY = 'airwise_theme';

/** @type {import('../../src/types.d.ts').FrontendAppState} */
const state = {
  selectedLocation: null,
  useManual: false,
  lastPlanData: null,
  lastRequestPayload: null,
  isSubmitting: false,
};

let manualDisclosure = null;

function applyTheme(theme, persist) {
  const isDark = theme === 'dark';
  const next = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  if (persist) localStorage.setItem(STORAGE_THEME_KEY, next);
  const btn = byId('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(isDark));
    btn.textContent = t(isDark ? 'app.themeSwitchLight' : 'app.themeSwitchDark');
  }
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_THEME_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(saved === 'dark' || saved === 'light' ? saved : prefersDark ? 'dark' : 'light', false);
  byId('theme-toggle')?.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(dark ? 'light' : 'dark', true);
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

function setManualMode(open) {
  state.useManual = open;
  manualDisclosure?.setOpen(open);
}

function setLoadingUi(loading) {
  state.isSubmitting = loading;
  const resultsRegion = byId('results-region');
  if (resultsRegion) {
    resultsRegion.setAttribute('aria-busy', String(Boolean(loading)));
  }
  const submitBtn = /** @type {HTMLButtonElement|null} */ (byId('submit-btn'));
  if (submitBtn) {
    submitBtn.disabled = loading;
    submitBtn.textContent = t(loading ? 'form.submitting' : 'form.submit');
  }
  const loadingEl = byId('loading-state');
  if (loadingEl) loadingEl.hidden = !loading;
  if (loading) {
    const emptyEl = byId('empty-state');
    const outEl = byId('plan-output');
    if (emptyEl) emptyEl.hidden = true;
    if (outEl) outEl.hidden = true;
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
    const emptyEl = byId('empty-state');
    if (emptyEl && !state.lastPlanData) emptyEl.hidden = false;
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
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(dark ? 'dark' : 'light', false);
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
    const text = [
      `${t('app.name')} — ${aqi.placeLabel || t('result.defaultPlace')}`,
      `PM2.5: ${aqi.pm25} µg/m³ | CPCB AQI: ${aqi.aqi} (${t(`aqi.band.${aqi.band}`)})`,
      plan.headline,
      '',
      ...(plan.items || []).slice(0, 5).map((item, i) => `${i + 1}. ${item.text}`),
    ].join('\n');

    try {
      if (navigator.share) {
        await navigator.share({ title: t('app.name'), text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        const fb = byId('share-feedback');
        if (fb) fb.textContent = t('community.shareCopied');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') showApiError(mapErrorToLocaleKey({ status: 500 }));
    }
  });
}

/**
 * Initialise the AirWise browser application on the active DOM.
 * @returns {Promise<void>}
 */
export async function initApp() {
  const savedLang = localStorage.getItem(STORAGE_LANG_KEY) === 'hi' ? 'hi' : 'en';
  await loadLocale('en');
  if (savedLang === 'hi') await loadLocale('hi');
  applyTranslations(document, savedLang);

  const langBtn = byId('lang-toggle');
  if (langBtn) {
    langBtn.setAttribute('aria-pressed', String(savedLang === 'hi'));
    langBtn.addEventListener('click', handleLanguageToggle);
  }

  const onSelectLocation = (loc) => {
    state.selectedLocation = loc;
  };

  initTheme();
  const { selectCity } = initCityCombobox({
    onSelectLocation,
    t,
    onError: showApiError,
    debounceMs: UI_TIMINGS.citySearchDebounceMs,
  });
  initGeolocation({
    onSelectLocation,
    t,
    setManualMode,
    onError: showApiError,
    onClearError: hideApiError,
    timings: UI_TIMINGS,
  });
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

  bindFormSubmission({
    state,
    t,
    getLanguage,
    selectCity,
    onSubmit: submitPlan,
    onError: showApiError,
  });
}

if (typeof document !== 'undefined' && byId('household-form')) {
  initApp();
}
