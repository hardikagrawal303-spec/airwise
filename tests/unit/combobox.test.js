import { jest } from '@jest/globals';
import { initCityCombobox } from '../../public/js/combobox.js';
import { t } from '../../public/js/i18n.js';
import { enLocale, mountGlobalDom } from '../helpers/domFixtures.js';

describe('City combobox keyboard interaction (public/js/combobox.js)', () => {
  let dom;
  let doc;
  let cleanup;

  beforeEach(() => {
    ({ dom, doc, cleanup } = mountGlobalDom('en'));
  });

  afterEach(() => {
    cleanup();
  });

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

    let selectedLocation = null;
    const onSelectLocation = jest.fn((loc) => {
      selectedLocation = loc;
    });
    const onError = jest.fn();
    initCityCombobox({ onSelectLocation, t, onError, debounceMs: 5 });

    const input = doc.getElementById('city-input');
    const listbox = doc.getElementById('city-listbox');
    const KeyEvent = dom.window.KeyboardEvent;

    input.value = 'Del';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    expect(listbox.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(2);

    input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe('city-opt-0');
    expect(doc.getElementById('city-opt-0').getAttribute('aria-selected')).toBe('true');

    input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe('city-opt-1');

    input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe('city-opt-0');

    input.dispatchEvent(new KeyEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(listbox.hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(selectedLocation).toBeNull();

    input.value = 'Noi';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(selectedLocation).toEqual({
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

    initCityCombobox({ onSelectLocation: jest.fn(), t, onError: jest.fn(), debounceMs: 5 });

    const input = doc.getElementById('city-input');
    const listbox = doc.getElementById('city-listbox');
    const statusEl = doc.getElementById('city-status');
    const wrap = input.closest('.combobox-wrap');

    input.value = 'Nowhere';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));

    expect(statusEl.getAttribute('role')).toBe('status');
    expect(statusEl.hidden).toBe(false);
    expect(statusEl.textContent).toBe(enLocale['search.searching']);
    expect(listbox.hidden).toBe(true);
    expect(listbox.children).toHaveLength(0);

    resolveFetch({ ok: true, status: 200, json: async () => ({ results: [] }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusEl.hidden).toBe(false);
    expect(statusEl.textContent).toBe(enLocale['search.noResults']);
    expect(listbox.hidden).toBe(true);

    const FocusEventCtor = dom.window.FocusEvent;
    wrap.dispatchEvent(new FocusEventCtor('focusout', { bubbles: true, relatedTarget: statusEl }));
    expect(statusEl.hidden).toBe(false);

    const outside = doc.getElementById('adults-input');
    wrap.dispatchEvent(new FocusEventCtor('focusout', { bubbles: true, relatedTarget: outside }));
    expect(statusEl.hidden).toBe(true);
    expect(statusEl.textContent).toBe('');
  });
});
