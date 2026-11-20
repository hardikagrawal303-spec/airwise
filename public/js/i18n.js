/**
 * Lightweight bilingual i18n helper (English & Hindi).
 * Loads /locales/en.json and /locales/hi.json with zero external dependencies.
 */

const loadedLocales = new Map();
let currentLang = 'en';

export async function loadLocale(lang, fetchImpl = fetch) {
  const safeLang = lang === 'hi' ? 'hi' : 'en';
  if (loadedLocales.has(safeLang)) {
    return loadedLocales.get(safeLang);
  }
  const res = await fetchImpl(`/locales/${safeLang}.json`);
  if (!res.ok) {
    throw new Error(`Failed to load locale ${safeLang}`);
  }
  const data = await res.json();
  loadedLocales.set(safeLang, data);
  return data;
}

export function registerLocaleData(lang, data) {
  const safeLang = lang === 'hi' ? 'hi' : 'en';
  loadedLocales.set(safeLang, data);
}

export function getLanguage() {
  return currentLang;
}

export function t(key, vars = {}, lang = currentLang) {
  const dict = loadedLocales.get(lang) || loadedLocales.get('en') || {};
  let template = dict[key];
  if (typeof template !== 'string') {
    return key;
  }
  for (const [k, val] of Object.entries(vars)) {
    template = template.replaceAll(`{${k}}`, String(val));
  }
  return template;
}

export function applyTranslations(root = document, lang = currentLang) {
  currentLang = lang === 'hi' ? 'hi' : 'en';
  if (root.documentElement) {
    root.documentElement.lang = currentLang;
  }

  const textNodes = root.querySelectorAll('[data-i18n]');
  for (const el of textNodes) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key, {}, currentLang);
    }
  }

  const placeholderNodes = root.querySelectorAll('[data-i18n-placeholder]');
  for (const el of placeholderNodes) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.setAttribute('placeholder', t(key, {}, currentLang));
    }
  }

  const ariaNodes = root.querySelectorAll('[data-i18n-aria-label]');
  for (const el of ariaNodes) {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) {
      el.setAttribute('aria-label', t(key, {}, currentLang));
    }
  }
}
