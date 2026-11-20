import { announce, bindDisclosure } from './a11y.js';

const byId = (id) => document.getElementById(id);

/**
 * Initialise opt-in geolocation consent disclosure and lookup handler.
 * @param {object} opts
 * @returns {void}
 */
export function initGeolocation({ state, t, setManualMode, onError, onClearError, timings }) {
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
      onError('error.GEOLOCATION_UNAVAILABLE');
      close();
      return;
    }
    if (statusEl) statusEl.textContent = t('form.geo.locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.selectedLocation = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          label: t('result.defaultPlace'),
        };
        setManualMode(false);
        const cityInput = byId('city-input');
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
        onError(err?.code === 1 ? 'error.GEOLOCATION_DENIED' : 'error.GEOLOCATION_UNAVAILABLE');
      },
      { enableHighAccuracy: false, timeout: timings.geoTimeoutMs, maximumAge: timings.geoMaxAgeMs }
    );
  });
}
