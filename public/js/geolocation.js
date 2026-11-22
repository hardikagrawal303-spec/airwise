import { announce, bindDisclosure, byId } from './a11y.js';
import { mapErrorToLocaleKey } from './api.js';

/**
 * Initialise opt-in geolocation consent disclosure and lookup handler.
 * @param {{ onSelectLocation: (loc: import('../../src/types.d.ts').SelectedLocation | null) => void, t: import('../../src/types.d.ts').TranslateFn, setManualMode: (open: boolean) => void, onError: (key: string) => void, onClearError: () => void, timings: { geoTimeoutMs: number, geoMaxAgeMs: number } }} opts
 * @returns {void}
 */
export function initGeolocation({
  onSelectLocation,
  t,
  setManualMode,
  onError,
  onClearError,
  timings,
}) {
  const toggleBtn = byId('geo-toggle-btn');
  const statusEl = byId('geo-status');
  const disclosure = bindDisclosure(toggleBtn, byId('geo-consent-panel'), {
    onToggle: () => {
      if (statusEl) statusEl.textContent = '';
    },
  });
  const close = () => disclosure.setOpen(false);

  byId('geo-cancel-btn')?.addEventListener('click', () => {
    close();
    toggleBtn?.focus();
  });

  byId('geo-confirm-btn')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      onError(mapErrorToLocaleKey({ code: 'GEOLOCATION_UNAVAILABLE' }));
      close();
      return;
    }
    if (statusEl) statusEl.textContent = t('form.geo.locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSelectLocation({
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          label: t('result.defaultPlace'),
        });
        setManualMode(false);
        const cityInput = /** @type {HTMLInputElement|null} */ (byId('city-input'));
        if (cityInput) {
          cityInput.value = t('form.geo.found');
          cityInput.removeAttribute('aria-invalid');
        }
        onClearError();
        close();
        announce(byId('live-status'), t('form.geo.found'));
      },
      (err) => {
        close();
        onError(
          mapErrorToLocaleKey({
            code: err?.code === 1 ? 'GEOLOCATION_DENIED' : 'GEOLOCATION_UNAVAILABLE',
          })
        );
      },
      { enableHighAccuracy: false, timeout: timings.geoTimeoutMs, maximumAge: timings.geoMaxAgeMs }
    );
  });
}
