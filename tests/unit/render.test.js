import { applyTranslations, t } from '../../public/js/i18n.js';
import { renderPlanResult } from '../../public/js/render.js';
import { createPlanBuilder } from '../../src/services/planBuilder.js';
import { createSampleProfile, enLocale, hiLocale, mountGlobalDom } from '../helpers/domFixtures.js';

describe('Plan renderer and disclosure toggles (public/js/render.js)', () => {
  let doc;
  let cleanup;

  beforeEach(() => {
    ({ doc, cleanup } = mountGlobalDom('en'));
  });

  afterEach(() => {
    cleanup();
  });

  test('toggles "Show why" aria-expanded, hidden panel state, and button label on click', async () => {
    const builder = createPlanBuilder();
    const data = await builder.buildPlan({
      manual: { pm25: 195, pm10: 270, label: 'Mathura' },
      profile: createSampleProfile({ commuteKmPerDay: 14 }),
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
      profile: createSampleProfile({
        members: { adults: 2, children: 1, elderly: 1 },
        hasRespiratoryOrHeartCondition: true,
        language: 'hi',
      }),
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
