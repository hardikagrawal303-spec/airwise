/**
 * API client and strict error-code mapper.
 * Never exposes raw HTTP status codes (e.g. "Request failed with status 403")
 * to the user — every known code and status maps to a localized plain message.
 */

const KNOWN_ERROR_KEYS = Object.freeze({
  AIR_UPSTREAM_FAILED: 'error.AIR_UPSTREAM_FAILED',
  GEOCODE_FAILED: 'error.GEOCODE_FAILED',
  VALIDATION_FAILED: 'error.VALIDATION_FAILED',
  RATE_LIMITED: 'error.RATE_LIMITED',
  ORIGIN_NOT_ALLOWED: 'error.ORIGIN_NOT_ALLOWED',
  PAYLOAD_TOO_LARGE: 'error.PAYLOAD_TOO_LARGE',
  NOT_FOUND: 'error.NOT_FOUND',
  INTERNAL_ERROR: 'error.INTERNAL_ERROR',
  NETWORK_OFFLINE: 'error.NETWORK_OFFLINE',
  REQUEST_TIMEOUT: 'error.REQUEST_TIMEOUT',
  GEOLOCATION_DENIED: 'error.GEOLOCATION_DENIED',
  GEOLOCATION_UNAVAILABLE: 'error.GEOLOCATION_UNAVAILABLE',
});

export function mapErrorToLocaleKey({ code, status, isOffline = false, isTimeout = false } = {}) {
  if (isOffline) return KNOWN_ERROR_KEYS.NETWORK_OFFLINE;
  if (isTimeout) return KNOWN_ERROR_KEYS.REQUEST_TIMEOUT;
  if (code && code in KNOWN_ERROR_KEYS) {
    return KNOWN_ERROR_KEYS[code];
  }
  if (status === 400) return KNOWN_ERROR_KEYS.VALIDATION_FAILED;
  if (status === 403) return KNOWN_ERROR_KEYS.ORIGIN_NOT_ALLOWED;
  if (status === 404) return KNOWN_ERROR_KEYS.NOT_FOUND;
  if (status === 413) return KNOWN_ERROR_KEYS.PAYLOAD_TOO_LARGE;
  if (status === 429) return KNOWN_ERROR_KEYS.RATE_LIMITED;
  if (status >= 500) return KNOWN_ERROR_KEYS.INTERNAL_ERROR;
  return KNOWN_ERROR_KEYS.INTERNAL_ERROR;
}

export class ClientApiError extends Error {
  constructor(localeKey, { code = null, status = 0 } = {}) {
    super(localeKey);
    this.name = 'ClientApiError';
    this.localeKey = localeKey;
    this.code = code;
    this.status = status;
  }
}

async function fetchJson(url, options = {}, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ClientApiError(mapErrorToLocaleKey({ isOffline: true }), {
      code: 'NETWORK_OFFLINE',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const serverCode = body?.error?.code || null;
      const key = mapErrorToLocaleKey({ code: serverCode, status: res.status });
      throw new ClientApiError(key, { code: serverCode, status: res.status });
    }

    return body;
  } catch (err) {
    if (err instanceof ClientApiError) {
      throw err;
    }
    if (err?.name === 'AbortError') {
      throw new ClientApiError(mapErrorToLocaleKey({ isTimeout: true }), {
        code: 'REQUEST_TIMEOUT',
      });
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ClientApiError(mapErrorToLocaleKey({ isOffline: offline }), {
      code: offline ? 'NETWORK_OFFLINE' : 'INTERNAL_ERROR',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeCities(query, fetchImpl = fetch) {
  const params = new URLSearchParams({ q: String(query || '').trim() });
  const data = await fetchJson(`/api/geocode?${params.toString()}`, { method: 'GET' }, { fetchImpl });
  return Array.isArray(data?.results) ? data.results : [];
}

export async function requestPlan(payload, fetchImpl = fetch) {
  return fetchJson(
    '/api/plan',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { timeoutMs: 20000, fetchImpl }
  );
}
