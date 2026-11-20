import { ClientApiError, geocodeCities, mapErrorToLocaleKey } from './api.js';

/**
 * Initialise city search combobox with keyboard navigation and debounced lookup.
 * @param {object} opts
 * @returns {{ selectCity: Function, closeListbox: Function }}
 */
export function initCityCombobox({ state, t, onError, debounceMs, blurCloseMs }) {
  const input = document.getElementById('city-input');
  const listbox = document.getElementById('city-listbox');
  let suggestions = [];
  let activeIndex = -1;
  let debounceTimer = null;

  function closeListbox() {
    if (listbox) {
      listbox.hidden = true;
      listbox.textContent = '';
    }
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    activeIndex = -1;
  }

  function selectCity(city) {
    state.selectedLocation = { lat: city.lat, lon: city.lon, label: city.label };
    if (input) {
      input.value = city.label;
      input.removeAttribute('aria-invalid');
    }
    closeListbox();
  }

  function renderOptions(items, statusText = '') {
    if (!listbox || !input) return;
    listbox.textContent = '';
    suggestions = items;
    activeIndex = -1;

    if (statusText || items.length === 0) {
      const li = document.createElement('li');
      li.className = 'city-option-status';
      li.textContent = statusText || t('search.noResults');
      listbox.appendChild(li);
    } else {
      items.forEach((city, idx) => {
        const li = document.createElement('li');
        li.id = `city-opt-${idx}`;
        li.className = 'city-option';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.textContent = city.label;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectCity(city);
        });
        listbox.appendChild(li);
      });
    }
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function setActiveOption(index) {
    if (!listbox || !input || suggestions.length === 0) return;
    const total = suggestions.length;
    activeIndex = ((index % total) + total) % total;
    listbox.querySelectorAll('[role="option"]').forEach((opt, i) => {
      opt.setAttribute('aria-selected', String(i === activeIndex));
    });
    input.setAttribute('aria-activedescendant', `city-opt-${activeIndex}`);
  }

  if (!input) return { selectCity, closeListbox };

  input.addEventListener('input', () => {
    state.selectedLocation = null;
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      closeListbox();
      return;
    }
    debounceTimer = setTimeout(async () => {
      renderOptions([], t('search.searching'));
      try {
        renderOptions(await geocodeCities(query));
      } catch (err) {
        closeListbox();
        if (err?.name !== 'AbortError') {
          onError(
            err instanceof ClientApiError
              ? err.localeKey
              : mapErrorToLocaleKey({ code: 'GEOCODE_FAILED' })
          );
        }
      }
    }, debounceMs);
  });

  input.addEventListener('keydown', (e) => {
    const open = listbox && !listbox.hidden && suggestions.length > 0;
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setActiveOption(activeIndex + 1);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActiveOption(activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1);
    } else if (e.key === 'Enter' && open && activeIndex >= 0) {
      e.preventDefault();
      selectCity(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      closeListbox();
    }
  });

  input.addEventListener('blur', () => setTimeout(closeListbox, blurCloseMs));
  return { selectCity, closeListbox };
}
