import { jest } from '@jest/globals';
import axe from 'axe-core';
import { announce, clearFormErrors, showFormErrors } from '../../public/js/a11y.js';
import { setHeroBand, VALID_BANDS } from '../../public/js/haze.js';
import { applyTranslations, t } from '../../public/js/i18n.js';
import { renderPlanResult } from '../../public/js/render.js';
import { createPlanBuilder } from '../../src/services/planBuilder.js';
import { createAppDom, enLocale, hiLocale } from '../helpers/domFixtures.js';

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

    const personalizePlan = jest.fn(async ({ aqiResult, risk, selectedActions }) => ({
      headline: enLocale[`fallback.headline.${aqiResult.category}`],
      summary: enLocale[`fallback.summary.${risk.vulnerabilityLevel}`],
      items: selectedActions.map((a) => ({
        actionId: a.id,
        personalizedText: enLocale[a.textKey],
        whyItMatters: enLocale[a.impactNoteKey],
      })),
      familyTip: enLocale[`fallback.familyTip.${risk.vulnerabilityLevel}`],
      copySource: 'rules',
    }));

    const builder = createPlanBuilder({
      geminiService: {
        isEnabled: () => false,
        personalizePlan,
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

    expect(personalizePlan).toHaveBeenCalledTimes(1);

    setHeroBand(doc.getElementById('hero'), data.aqi.band);
    renderPlanResult(data, { doc, t, lang: 'en' });

    const violations = await runAxe(doc);
    expect(violations).toEqual([]);
    expect(doc.getElementById('plan-output').hidden).toBe(false);
    expect(doc.getElementById('hero').getAttribute('data-band')).toBe('severe');
    expect(doc.getElementById('hero').getAttribute('style')).toBeNull();
    dom.window.close();
  });

  test('Hindi state (lang="hi") with rendered plan has zero axe-core violations', async () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    applyTranslations(doc, 'hi');

    const builder = createPlanBuilder();
    const data = await builder.buildPlan({
      manual: { pm25: 220, pm10: 310, label: 'मथुरा' },
      profile: {
        members: { adults: 2, children: 1, elderly: 0 },
        hasRespiratoryOrHeartCondition: false,
        commute: 'car',
        commuteKmPerDay: 14,
        cookingFuel: 'lpg',
        hasPurifier: false,
        budget: 'medium',
        homeType: 'apartment',
        language: 'hi',
      },
    });

    setHeroBand(doc.getElementById('hero'), data.aqi.band);
    renderPlanResult(data, { doc, t, lang: 'hi' });

    expect(doc.documentElement.lang).toBe('hi');
    const violations = await runAxe(doc);
    expect(violations).toEqual([]);
    dom.window.close();
  });

  test('Dark theme state (data-theme="dark") with rendered plan has zero axe-core violations', async () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    doc.documentElement.setAttribute('data-theme', 'dark');
    doc.getElementById('theme-toggle')?.setAttribute('aria-pressed', 'true');

    const builder = createPlanBuilder();
    const data = await builder.buildPlan({
      manual: { pm25: 150, pm10: 210, label: 'Noida' },
      profile: {
        members: { adults: 2, children: 0, elderly: 1 },
        hasRespiratoryOrHeartCondition: false,
        commute: 'two_wheeler',
        commuteKmPerDay: 12,
        cookingFuel: 'lpg',
        hasPurifier: true,
        budget: 'high',
        homeType: 'apartment',
        language: 'en',
      },
    });

    setHeroBand(doc.getElementById('hero'), data.aqi.band);
    renderPlanResult(data, { doc, t, lang: 'en' });

    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    const violations = await runAxe(doc);
    expect(violations).toEqual([]);
    dom.window.close();
  });

  test('validation error-summary state has zero axe-core violations', async () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    const summaryEl = doc.getElementById('error-summary');
    const listEl = doc.getElementById('error-summary-list');

    showFormErrors(
      [
        { fieldId: 'city-input', message: enLocale['form.error.locationRequired'] },
        { fieldId: 'adults-input', message: enLocale['form.error.adultsInvalid'] },
      ],
      { summaryEl, listEl, doc }
    );

    expect(summaryEl.hidden).toBe(false);
    const violations = await runAxe(doc);
    expect(violations).toEqual([]);
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

  test('language toggle switches html[lang], document.title, and localized aria-labels cleanly between en and hi', () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toBe(enLocale['app.title']);
    expect(doc.getElementById('city-listbox').getAttribute('aria-label')).toBe(
      enLocale['search.suggestionsLabel']
    );
    expect(doc.getElementById('results-region').getAttribute('aria-label')).toBe(
      enLocale['result.regionLabel']
    );

    applyTranslations(doc, 'hi');
    expect(doc.documentElement.lang).toBe('hi');
    expect(doc.title).toBe(hiLocale['app.title']);
    expect(doc.getElementById('hero-heading').textContent).toBe(hiLocale['hero.heading']);
    expect(doc.getElementById('city-listbox').getAttribute('aria-label')).toBe(
      hiLocale['search.suggestionsLabel']
    );
    expect(doc.getElementById('results-region').getAttribute('aria-label')).toBe(
      hiLocale['result.regionLabel']
    );

    applyTranslations(doc, 'en');
    expect(doc.documentElement.lang).toBe('en');
    expect(doc.title).toBe(enLocale['app.title']);
    expect(doc.getElementById('hero-heading').textContent).toBe(enLocale['hero.heading']);
    dom.window.close();
  });

  test('announce cancels pending timers and form errors use unique IDs while preserving existing aria-describedby tokens', async () => {
    const dom = createAppDom();
    const doc = dom.window.document;
    const live = doc.getElementById('live-status');
    expect(live).not.toBeNull();
    expect(live.getAttribute('aria-live')).toBe('polite');

    announce(live, 'First stale status');
    announce(live, 'Plan ready');
    await new Promise((r) => setTimeout(r, 60));
    expect(live.textContent).toBe('Plan ready');

    const form = doc.getElementById('household-form');
    const summaryEl = doc.getElementById('error-summary');
    const listEl = doc.getElementById('error-summary-list');
    const conditionInput = doc.getElementById('condition-input');
    expect(conditionInput.getAttribute('aria-describedby')).toBe('condition-privacy');

    showFormErrors(
      [
        { fieldId: 'city-input', message: 'Pick a city' },
        { fieldId: 'condition-input', message: 'Check condition' },
      ],
      { summaryEl, listEl, doc }
    );
    expect(summaryEl.hidden).toBe(false);
    expect(doc.getElementById('error-city-input')).not.toBeNull();
    expect(doc.getElementById('error-condition-input')).not.toBeNull();
    expect(doc.getElementById('city-input').getAttribute('aria-invalid')).toBe('true');
    expect(doc.getElementById('city-input').getAttribute('aria-describedby')).toBe(
      'error-city-input'
    );
    expect(conditionInput.getAttribute('aria-describedby')).toBe(
      'condition-privacy error-condition-input'
    );

    clearFormErrors(form, summaryEl, listEl);
    expect(summaryEl.hidden).toBe(true);
    expect(doc.getElementById('city-input').getAttribute('aria-invalid')).toBeNull();
    expect(doc.getElementById('city-input').getAttribute('aria-describedby')).toBeNull();
    expect(conditionInput.getAttribute('aria-invalid')).toBeNull();
    expect(conditionInput.getAttribute('aria-describedby')).toBe('condition-privacy');
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
