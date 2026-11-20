import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axe from 'axe-core';
import { JSDOM } from 'jsdom';
import { announce, clearFormErrors, showFormErrors } from '../../public/js/a11y.js';
import { setHeroBand, VALID_BANDS } from '../../public/js/haze.js';
import { applyTranslations, registerLocaleData, t } from '../../public/js/i18n.js';
import { renderPlanResult } from '../../public/js/render.js';
import { createPlanBuilder } from '../../src/services/planBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const htmlSource = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
const enLocale = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public/locales/en.json'), 'utf8')
);
const hiLocale = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'public/locales/hi.json'), 'utf8')
);

function createAppDom() {
  const dom = new JSDOM(htmlSource, { url: 'http://localhost:3000/' });
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  registerLocaleData('en', enLocale);
  registerLocaleData('hi', hiLocale);
  applyTranslations(dom.window.document, 'en');
  return dom;
}

async function runAxe(doc) {
  // color-contrast requires canvas layout engine unavailable in jsdom; checked in browser verification
  const results = await axe.run(doc.documentElement, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });
  return results.violations;
}

describe('Accessibility (WCAG 2.1 AA with axe-core + jsdom)', () => {
  test('initial page state has zero axe-core violations', async () => {
    const dom = createAppDom();
    const violations = await runAxe(dom.window.document);
    expect(violations).toEqual([]);
    dom.window.close();
  });

  test('rendered plan results state (Severe + disclosures) has zero axe-core violations', async () => {
    const dom = createAppDom();
    const doc = dom.window.document;

    const builder = createPlanBuilder({
      geminiSvc: {
        isEnabled: () => false,
        personalizePlan: async ({ aqiResult, risk, selectedActions }) => ({
          headline: enLocale[`fallback.headline.${aqiResult.category}`],
          summary: enLocale[`fallback.summary.${risk.vulnerabilityLevel}`],
          items: selectedActions.map((a) => ({
            actionId: a.id,
            personalizedText: enLocale[a.textKey],
            whyItMatters: enLocale[a.impactNoteKey],
          })),
          familyTip: enLocale[`fallback.familyTip.${risk.vulnerabilityLevel}`],
          source: 'rules',
        }),
      },
    });

    const data = await builder.buildPlan({
      manual: { pm25: 300, pm10: 420, label: 'Anand Vihar, Delhi' },
      profile: {
        members: { adults: 2, children: 1, elderly: 1 },
        hasRespiratoryOrHeartCondition: true,
        commute: 'car',
        commuteKmPerDay: 18,
        cookingFuel: 'lpg',
        hasPurifier: false,
        budget: 'medium',
        homeType: 'apartment',
        language: 'en',
      },
    });

    setHeroBand(doc.getElementById('hero'), data.aqi.band);
    renderPlanResult(data, { doc, t, lang: 'en' });

    const violations = await runAxe(doc);
    expect(violations).toEqual([]);
    expect(doc.getElementById('plan-output').hidden).toBe(false);
    expect(doc.getElementById('hero').getAttribute('data-band')).toBe('severe');
    expect(doc.getElementById('hero').getAttribute('style')).toBeNull();
    dom.window.close();
  });

  test('every form control has an associated label element', () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    const controls = doc.querySelectorAll('form input, form select, form textarea');
    expect(controls.length).toBeGreaterThan(8);

    for (const control of controls) {
      const id = control.getAttribute('id');
      const hasForLabel = id ? Boolean(doc.querySelector(`label[for="${id}"]`)) : false;
      const wrappedInLabel = Boolean(control.closest('label'));
      expect(hasForLabel || wrappedInLabel).toBe(true);
    }
    dom.window.close();
  });

  test('language toggle switches html[lang] cleanly between en and hi and translates UI', () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    expect(doc.documentElement.lang).toBe('en');

    applyTranslations(doc, 'hi');
    expect(doc.documentElement.lang).toBe('hi');
    expect(doc.getElementById('hero-heading').textContent).toBe(hiLocale['hero.heading']);

    applyTranslations(doc, 'en');
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.getElementById('hero-heading').textContent).toBe(enLocale['hero.heading']);
    dom.window.close();
  });

  test('polite live region exists and announces status changes, and error summary links fields', async () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    const live = doc.getElementById('live-status');
    expect(live).not.toBeNull();
    expect(live.getAttribute('aria-live')).toBe('polite');

    announce(live, 'Plan ready');
    await new Promise((r) => setTimeout(r, 60));
    expect(live.textContent).toBe('Plan ready');

    const form = doc.getElementById('household-form');
    const summaryEl = doc.getElementById('error-summary');
    const listEl = doc.getElementById('error-summary-list');
    showFormErrors([{ fieldId: 'city-input', message: 'Pick a city' }], {
      summaryEl,
      listEl,
      doc,
    });
    expect(summaryEl.hidden).toBe(false);
    expect(doc.getElementById('city-input').getAttribute('aria-invalid')).toBe('true');

    clearFormErrors(form, summaryEl, listEl);
    expect(summaryEl.hidden).toBe(true);
    expect(doc.getElementById('city-input').getAttribute('aria-invalid')).toBeNull();
    dom.window.close();
  });

  test('hero skyline data-band switches cleanly for all 6 CPCB AQI categories with zero inline styles', () => {
    const dom = createAppDom();
    const hero = dom.window.document.getElementById('hero');
    const categories = ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'];

    categories.forEach((category, idx) => {
      const band = setHeroBand(hero, category, { animate: false });
      expect(band).toBe(VALID_BANDS[idx]);
      expect(hero.getAttribute('data-band')).toBe(VALID_BANDS[idx]);
      expect(hero.getAttribute('style')).toBeNull();
    });

    // Unknown band safely defaults to moderate
    expect(setHeroBand(hero, 'unexpected')).toBe('moderate');
    dom.window.close();
  });
});
