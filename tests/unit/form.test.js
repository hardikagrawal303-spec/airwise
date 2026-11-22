import { jest } from '@jest/globals';
import { bindFormSubmission, collectAndValidateForm } from '../../public/js/form.js';
import { getLanguage, t } from '../../public/js/i18n.js';
import { mountGlobalDom } from '../helpers/domFixtures.js';

describe('Form validation and submission (public/js/form.js)', () => {
  let dom;
  let doc;
  let cleanup;

  beforeEach(() => {
    ({ dom, doc, cleanup } = mountGlobalDom('en'));
  });

  afterEach(() => {
    cleanup();
  });

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
