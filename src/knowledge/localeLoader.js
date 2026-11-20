import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../../public/locales');

const cache = new Map();

/**
 * Load and cache a frozen translation dictionary for English or Hindi.
 *
 * @param {string} [language='en'] - Requested language code ('en' or 'hi').
 * @returns {Readonly<Record<string, string>>} Frozen locale dictionary.
 */
export function getLocale(language = 'en') {
  const lang = language === 'hi' ? 'hi' : 'en';
  if (!cache.has(lang)) {
    const filePath = path.join(LOCALES_DIR, `${lang}.json`);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    cache.set(lang, Object.freeze(content));
  }
  return cache.get(lang);
}
