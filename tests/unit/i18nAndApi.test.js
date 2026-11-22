import { jest } from '@jest/globals';
import {
  ClientApiError,
  fetchJson,
  geocodeCities,
  mapErrorToLocaleKey,
} from '../../public/js/api.js';
import { applyTranslations, getLanguage, loadLocale } from '../../public/js/i18n.js';
import { enLocale, hiLocale, mountGlobalDom } from '../helpers/domFixtures.js';

describe('Frontend i18n and API client (public/js/i18n.js, public/js/api.js)', () => {
  let doc;
  let cleanup;

  beforeEach(() => {
    ({ doc, cleanup } = mountGlobalDom('en'));
  });

  afterEach(() => {
    cleanup();
  });

  test('maps every API error code and HTTP status to friendly localized messages (never raw HTTP text)', () => {
    const cases = [
      { code: 'AIR_UPSTREAM_FAILED', status: 502 },
      { code: 'GEOCODE_FAILED', status: 502 },
      { code: 'VALIDATION_FAILED', status: 400 },
      { code: 'RATE_LIMITED', status: 429 },
      { code: 'ORIGIN_NOT_ALLOWED', status: 403 },
      { code: 'PAYLOAD_TOO_LARGE', status: 413 },
      { code: 'NOT_FOUND', status: 404 },
      { code: 'INTERNAL_ERROR', status: 500 },
      { code: 'GEOLOCATION_DENIED' },
      { code: 'GEOLOCATION_UNAVAILABLE' },
      { status: 400 },
      { status: 403 },
      { status: 404 },
      { status: 413 },
      { status: 429 },
      { status: 500 },
      { status: 503 },
      { isOffline: true },
      { isTimeout: true },
    ];

    for (const input of cases) {
      const key = mapErrorToLocaleKey(input);
      expect(typeof enLocale[key]).toBe('string');
      expect(enLocale[key].trim().length).toBeGreaterThan(10);
      expect(typeof hiLocale[key]).toBe('string');
      expect(hiLocale[key].trim().length).toBeGreaterThan(10);
      expect(enLocale[key]).not.toMatch(/status\s+\d{3}|forbidden|internal server error/i);
    }
  });

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
