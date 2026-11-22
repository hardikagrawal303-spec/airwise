import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { applyTranslations, registerLocaleData } from '../../public/js/i18n.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '../..');
export const htmlSource = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
export const enLocale = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public/locales/en.json'), 'utf8')
);
export const hiLocale = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public/locales/hi.json'), 'utf8')
);

export function createSampleProfile(overrides = {}) {
  return {
    members: { adults: 2, children: 1, elderly: 0, ...(overrides.members || {}) },
    hasRespiratoryOrHeartCondition: false,
    commute: 'car',
    commuteKmPerDay: 18,
    cookingFuel: 'lpg',
    hasPurifier: false,
    budget: 'medium',
    homeType: 'apartment',
    language: 'en',
    ...overrides,
  };
}

export function createAppDom(lang = 'en') {
  const dom = new JSDOM(htmlSource, { url: 'http://localhost:3000/' });
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  registerLocaleData('en', enLocale);
  registerLocaleData('hi', hiLocale);
  applyTranslations(dom.window.document, lang);
  return dom;
}

export function mountGlobalDom(lang = 'en') {
  const dom = createAppDom(lang);
  const originalFetch = globalThis.fetch;
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;

  const cleanup = () => {
    globalThis.fetch = originalFetch;
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
  };

  return { dom, doc: dom.window.document, cleanup };
}
