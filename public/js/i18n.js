const loadedLocales = new Map();
/** @type {'en'|'hi'} */
let currentLang = 'en';

/**
 * Fetch and cache a locale dictionary.
 * @param {string} lang
 * @param {typeof fetch} [fetchImpl=fetch]
 * @returns {Promise<Record<string, string>>}
 */
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

/**
 * Register preloaded locale data.
 * @param {string} lang
 * @param {Record<string, string>} data
 * @returns {void}
 */
export function registerLocaleData(lang, data) {
  const safeLang = lang === 'hi' ? 'hi' : 'en';
  loadedLocales.set(safeLang, data);
}

/**
 * Return the active UI language code.
 * @returns {'en'|'hi'}
 */
export function getLanguage() {
  return currentLang;
}

/**
 * Translate a locale key with optional placeholders.
 * @param {string} key
 * @param {Record<string, string|number>} [vars={}]
 * @param {string} [lang=currentLang]
 * @returns {string}
 */
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

/**
 * Apply translations to [data-i18n*] elements and html[lang].
 * @param {Document|HTMLElement} [root=document]
 * @param {string} [lang=currentLang]
 * @returns {void}
 */
export function applyTranslations(root = document, lang = currentLang) {
  currentLang = lang === 'hi' ? 'hi' : 'en';
  if ('documentElement' in root && root.documentElement) {
    root.documentElement.lang = currentLang;
  }
  if ('title' in root) {
    const translatedTitle = t('app.title', {}, currentLang);
    if (translatedTitle !== 'app.title') {
      root.title = translatedTitle;
    }
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
