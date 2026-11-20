import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { ClientApiError, fetchJson, geocodeCities } from '../../public/js/api.js';
import { initCityCombobox } from '../../public/js/combobox.js';
import { bindFormSubmission, collectAndValidateForm } from '../../public/js/form.js';
import {
  applyTranslations,
  getLanguage,
  loadLocale,
  registerLocaleData,
  t,
} from '../../public/js/i18n.js';
import { renderPlanResult } from '../../public/js/render.js';
import { createPlanBuilder } from '../../src/services/planBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const htmlSource = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
const enLocale = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/locales/en.json'), 'utf8'));
const hiLocale = JSON.parse(fs.readFileSync(path.join(rootDir, 'public/locales/hi.json'), 'utf8'));

function mountDom() {
  const dom = new JSDOM(htmlSource, { url: 'http://localhost:3000/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  registerLocaleData('en', enLocale);
  registerLocaleData('hi', hiLocale);
  applyTranslations(dom.window.document, 'en');
  return dom;
}

describe('Frontend interactive behaviour (jsdom + mocked fetch)', () => {
  let dom;
  let doc;
  let originalFetch;
  let originalNavigatorDescriptor;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    dom = mountDom();
    doc = dom.window.document;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
    dom?.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
  });

  describe('Form validation and submission', () => {
    test('rejects missing location, out-of-range adults, and invalid commute km', () => {
      doc.getElementById('adults-input').value = '0';
      doc.getElementById('commute-km-input').value = '250';

      const result = collectAndValidateForm({
        state: { useManual: false, selectedLocation: null },
        t,
        getLanguage,
      });

      expect(result.ok).toBe(false);
      expect(result.errors.map((e) => e.fieldId)).toEqual([
        'adults-input',
        'commute-km-input',
        'city-input',
      ]);
    });

    test('validates manual PM2.5 and optional PM10 bounds', () => {
      doc.getElementById('manual-pm25').value = '2000';
      doc.getElementById('manual-pm10').value = '-5';

      const invalid = collectAndValidateForm({
        state: { useManual: true, selectedLocation: null },
        t,
        getLanguage,
      });
      expect(invalid.ok).toBe(false);
      expect(invalid.errors.map((e) => e.fieldId)).toEqual(['manual-pm25', 'manual-pm10']);

      doc.getElementById('manual-pm25').value = '165';
      doc.getElementById('manual-pm10').value = '240';
      doc.getElementById('manual-place').value = 'Mathura';

      const valid = collectAndValidateForm({
        state: { useManual: true, selectedLocation: null },
        t,
        getLanguage,
      });
      expect(valid.ok).toBe(true);
      expect(valid.payload.manual).toEqual({ pm25: 165, pm10: 240, label: 'Mathura' });
    });

    test('form submit shows accessible error summary on invalid input and submits on valid input', async () => {
      const state = { useManual: false, selectedLocation: null, isSubmitting: false };
      const onSubmit = jest.fn(async () => {});
      const onError = jest.fn();
      const selectCity = jest.fn((city) => {
        state.selectedLocation = city;
      });

      bindFormSubmission({ state, t, getLanguage, selectCity, onSubmit, onError });

      const form = doc.getElementById('household-form');
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 10));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(doc.getElementById('error-summary').hidden).toBe(false);
      expect(doc.getElementById('city-input').getAttribute('aria-invalid')).toBe('true');

      // Now simulate typed city auto-geocoding on submit
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ lat: 27.49, lon: 77.67, label: 'Mathura, Uttar Pradesh' }],
        }),
      }));
      doc.getElementById('city-input').value = 'Mathura';

      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));

      expect(selectCity).toHaveBeenCalledWith({
        lat: 27.49,
        lon: 77.67,
        label: 'Mathura, Uttar Pradesh',
      });
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].location.label).toBe('Mathura, Uttar Pradesh');
      expect(doc.getElementById('error-summary').hidden).toBe(true);
    });
  });

  describe('City combobox keyboard interaction (Arrow / Enter / Escape)', () => {
    test('navigates suggestions with ArrowDown/ArrowUp, selects with Enter, closes with Escape', async () => {
      const matches = [
        { lat: 28.61, lon: 77.21, label: 'New Delhi, Delhi' },
        { lat: 28.57, lon: 77.32, label: 'Noida, Uttar Pradesh' },
      ];
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ results: matches }),
      }));

      const state = { selectedLocation: null };
      const onError = jest.fn();
      initCityCombobox({ state, t, onError, debounceMs: 5 });

      const input = doc.getElementById('city-input');
      const listbox = doc.getElementById('city-listbox');
      const KeyEvent = dom.window.KeyboardEvent;

      input.value = 'Del';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));

      expect(listbox.hidden).toBe(false);
      expect(input.getAttribute('aria-expanded')).toBe('true');
      expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(2);

      // ArrowDown selects first option
      input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(input.getAttribute('aria-activedescendant')).toBe('city-opt-0');
      expect(doc.getElementById('city-opt-0').getAttribute('aria-selected')).toBe('true');

      // ArrowDown again moves to second option
      input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(input.getAttribute('aria-activedescendant')).toBe('city-opt-1');

      // ArrowUp returns to first option
      input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(input.getAttribute('aria-activedescendant')).toBe('city-opt-0');

      // Escape closes listbox without selecting
      input.dispatchEvent(new KeyEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(listbox.hidden).toBe(true);
      expect(input.getAttribute('aria-expanded')).toBe('false');
      expect(state.selectedLocation).toBeNull();

      // Re-open, navigate to second option, press Enter to select
      input.value = 'Noi';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));

      input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input.dispatchEvent(new KeyEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(state.selectedLocation).toEqual({
        lat: 28.57,
        lon: 77.32,
        label: 'Noida, Uttar Pradesh',
      });
      expect(input.value).toBe('Noida, Uttar Pradesh');
      expect(listbox.hidden).toBe(true);
      expect(onError).not.toHaveBeenCalled();
    });

    test('renders searching/no-results in sibling role=status outside listbox and closes on focusout outside wrapper', async () => {
      let resolveFetch;
      globalThis.fetch = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );

      const state = { selectedLocation: null };
      initCityCombobox({ state, t, onError: jest.fn(), debounceMs: 5 });

      const input = doc.getElementById('city-input');
      const listbox = doc.getElementById('city-listbox');
      const statusEl = doc.getElementById('city-status');
      const wrap = input.closest('.combobox-wrap');

      input.value = 'Nowhere';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));

      // Searching status appears in sibling role="status", listbox stays hidden & empty
      expect(statusEl.getAttribute('role')).toBe('status');
      expect(statusEl.hidden).toBe(false);
      expect(statusEl.textContent).toBe(enLocale['search.searching']);
      expect(listbox.hidden).toBe(true);
      expect(listbox.children).toHaveLength(0);

      // Resolve with empty results -> no-results message in sibling status
      resolveFetch({ ok: true, status: 200, json: async () => ({ results: [] }) });
      await new Promise((r) => setTimeout(r, 20));
      expect(statusEl.hidden).toBe(false);
      expect(statusEl.textContent).toBe(enLocale['search.noResults']);
      expect(listbox.hidden).toBe(true);

      // focusout to an element inside wrap keeps status open; focusout outside closes immediately
      const FocusEventCtor = dom.window.FocusEvent;
      wrap.dispatchEvent(
        new FocusEventCtor('focusout', { bubbles: true, relatedTarget: statusEl })
      );
      expect(statusEl.hidden).toBe(false);

      const outside = doc.getElementById('adults-input');
      wrap.dispatchEvent(new FocusEventCtor('focusout', { bubbles: true, relatedTarget: outside }));
      expect(statusEl.hidden).toBe(true);
      expect(statusEl.textContent).toBe('');
    });
  });

  describe('Language switching (en <-> hi)', () => {
    test('loads locale via fetch and updates html[lang], text, placeholders, and aria-labels', async () => {
      const mockFetch = jest.fn(async (url) => ({
        ok: true,
        status: 200,
        json: async () => (url.includes('hi.json') ? hiLocale : enLocale),
      }));

      await loadLocale('hi', mockFetch);
      applyTranslations(doc, 'hi');

      expect(getLanguage()).toBe('hi');
      expect(doc.documentElement.lang).toBe('hi');
      expect(doc.getElementById('hero-heading').textContent).toBe(hiLocale['hero.heading']);
      expect(doc.getElementById('city-input').getAttribute('placeholder')).toBe(
        hiLocale['form.placeholder.city']
      );
      expect(doc.getElementById('lang-toggle').getAttribute('aria-label')).toBe(
        hiLocale['app.langSwitchLabel']
      );

      applyTranslations(doc, 'en');
      expect(getLanguage()).toBe('en');
      expect(doc.documentElement.lang).toBe('en');
      expect(doc.getElementById('hero-heading').textContent).toBe(enLocale['hero.heading']);
    });
  });

  describe('fetchJson timeout, abort, offline, and non-JSON handling', () => {
    test('maps timeout abort to REQUEST_TIMEOUT ClientApiError', async () => {
      const hangingFetch = (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });

      await expect(
        fetchJson('/api/plan', {}, { timeoutMs: 15, fetchImpl: hangingFetch })
      ).rejects.toMatchObject({
        name: 'ClientApiError',
        code: 'REQUEST_TIMEOUT',
        localeKey: 'error.REQUEST_TIMEOUT',
      });
    });

    test('maps direct AbortError rejection to REQUEST_TIMEOUT', async () => {
      const abortingFetch = async () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      };

      await expect(
        fetchJson('/api/geocode?q=Delhi', {}, { fetchImpl: abortingFetch })
      ).rejects.toMatchObject({
        code: 'REQUEST_TIMEOUT',
        localeKey: 'error.REQUEST_TIMEOUT',
      });
    });

    test('fails fast with NETWORK_OFFLINE when navigator.onLine is false', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: false },
      });
      const spyFetch = jest.fn();

      await expect(fetchJson('/api/plan', {}, { fetchImpl: spyFetch })).rejects.toMatchObject({
        code: 'NETWORK_OFFLINE',
        localeKey: 'error.NETWORK_OFFLINE',
      });
      expect(spyFetch).not.toHaveBeenCalled();
    });

    test('handles non-JSON responses gracefully for both 2xx and 5xx statuses', async () => {
      const okHtmlFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      });
      expect(await fetchJson('/api/health', {}, { fetchImpl: okHtmlFetch })).toBeNull();

      const badGatewayHtmlFetch = async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      });

      let caught = null;
      try {
        await fetchJson('/api/plan', {}, { fetchImpl: badGatewayHtmlFetch });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ClientApiError);
      expect(caught.status).toBe(502);
      expect(caught.localeKey).toBe('error.INTERNAL_ERROR');
    });

    test('geocodeCities encodes Hindi Devanagari queries with encodeURIComponent', async () => {
      const mockFetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ lat: 28.6139, lon: 77.209, label: 'New Delhi, Delhi' }],
        }),
      }));

      const results = await geocodeCities(' नई दिल्ली ', mockFetch);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(`/api/geocode?q=${encodeURIComponent('नई दिल्ली')}`);
      expect(results).toHaveLength(1);
    });
  });

  describe('"Show why" disclosure toggles', () => {
    test('toggles aria-expanded, hidden panel state, and button label on click', async () => {
      const builder = createPlanBuilder();
      const data = await builder.buildPlan({
        manual: { pm25: 195, pm10: 270, label: 'Mathura' },
        profile: {
          members: { adults: 2, children: 1, elderly: 0 },
          hasRespiratoryOrHeartCondition: false,
          commute: 'car',
          commuteKmPerDay: 14,
          cookingFuel: 'lpg',
          hasPurifier: false,
          budget: 'medium',
          homeType: 'apartment',
          language: 'en',
        },
      });

      renderPlanResult(data, { doc, t, lang: 'en' });

      const whyButtons = doc.querySelectorAll('.why-toggle-btn');
      expect(whyButtons.length).toBeGreaterThan(0);

      const btn = whyButtons[0];
      const panelId = btn.getAttribute('aria-controls');
      const panel = doc.getElementById(panelId);

      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(btn.textContent).toBe(enLocale['action.showWhy']);
      expect(panel.hidden).toBe(true);

      btn.click();
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(btn.textContent).toBe(enLocale['action.hideWhy']);
      expect(panel.hidden).toBe(false);

      btn.click();
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(btn.textContent).toBe(enLocale['action.showWhy']);
      expect(panel.hidden).toBe(true);
    });

    test('renders Hindi plan impact table, methodology, and action summaries with zero English impact strings', async () => {
      applyTranslations(doc, 'hi');
      const builder = createPlanBuilder();
      const data = await builder.buildPlan({
        manual: { pm25: 290, pm10: 380, label: 'मथुरा' },
        profile: {
          members: { adults: 2, children: 1, elderly: 1 },
          hasRespiratoryOrHeartCondition: true,
          commute: 'car',
          commuteKmPerDay: 18,
          cookingFuel: 'lpg',
          hasPurifier: false,
          budget: 'medium',
          homeType: 'apartment',
          language: 'hi',
        },
      });

      renderPlanResult(data, { doc, t, lang: 'hi' });

      const impactWrapText = doc.getElementById('commute-impact-wrap').textContent;
      const whyPanelsText = Array.from(doc.querySelectorAll('.why-panel'))
        .map((el) => el.textContent)
        .join(' ');
      const combinedImpactText = `${impactWrapText} ${whyPanelsText}`;

      expect(impactWrapText).toContain(hiLocale['impact.mode.car_petrol']);
      expect(impactWrapText).toContain(hiLocale['impact.mode.metro']);
      expect(impactWrapText).toContain('किग्रा');
      expect(impactWrapText).toContain('किमी');

      const forbiddenEnglishStrings = [
        'Petrol car',
        'Metro rail',
        'Approximate',
        'Qualitative',
        'Baseline',
        'Can help reduce',
        'days =',
        'kg/day',
        'kg/month',
        'Laboratory filtration',
      ];
      for (const phrase of forbiddenEnglishStrings) {
        expect(combinedImpactText).not.toContain(phrase);
      }
    });
  });
});
