const announceTimers = new WeakMap();

/**
 * Announce a message in a polite live region, cancelling any pending announcement on the same node.
 * @param {HTMLElement|null} liveEl
 * @param {string} message
 * @returns {void}
 */
export function announce(liveEl, message) {
  if (!liveEl) return;
  const pending = announceTimers.get(liveEl);
  if (pending !== undefined) {
    clearTimeout(pending);
  }
  liveEl.textContent = '';
  // Brief tick ensures screen readers re-announce identical messages
  const timerId = setTimeout(() => {
    announceTimers.delete(liveEl);
    liveEl.textContent = String(message || '');
  }, 40);
  announceTimers.set(liveEl, timerId);
}

/**
 * Move keyboard focus to an element.
 * @param {HTMLElement|null} element
 * @returns {void}
 */
export function moveFocus(element) {
  if (!element || typeof element.focus !== 'function') return;
  element.focus();
}

/**
 * Clear form error summary and invalid markers, restoring original aria-describedby tokens.
 * @param {HTMLFormElement|null} formEl
 * @param {HTMLElement|null} summaryEl
 * @param {HTMLElement|null} listEl
 * @returns {void}
 */
export function clearFormErrors(formEl, summaryEl, listEl) {
  if (summaryEl) {
    summaryEl.hidden = true;
  }
  if (listEl) {
    listEl.textContent = '';
  }
  if (!formEl) return;
  const invalidEls = formEl.querySelectorAll('[aria-invalid="true"]');
  for (const el of invalidEls) {
    el.removeAttribute('aria-invalid');
    const orig = el.dataset?.origDescribedby;
    if (orig !== undefined) {
      if (orig.trim()) {
        el.setAttribute('aria-describedby', orig);
      } else {
        el.removeAttribute('aria-describedby');
      }
      delete el.dataset.origDescribedby;
    } else {
      el.removeAttribute('aria-describedby');
    }
  }
}

/**
 * Show validation errors, assign unique error IDs, and preserve existing aria-describedby tokens.
 * @param {Array<{fieldId: string, message: string}>} errors
 * @param {object} opts
 * @returns {void}
 */
export function showFormErrors(errors, { summaryEl, listEl, doc = document }) {
  if (!summaryEl || !listEl) return;
  listEl.textContent = '';

  errors.forEach((err, index) => {
    const errId = `error-${err.fieldId || index}`;
    const li = doc.createElement('li');
    li.id = errId;
    const link = doc.createElement('a');
    link.href = `#${err.fieldId}`;
    link.textContent = err.message;
    link.addEventListener('click', (event) => {
      const target = doc.getElementById(err.fieldId);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    });
    li.appendChild(link);
    listEl.appendChild(li);

    const field = doc.getElementById(err.fieldId);
    if (field) {
      if (field.dataset && field.dataset.origDescribedby === undefined) {
        field.dataset.origDescribedby = field.getAttribute('aria-describedby') ?? '';
      }
      const existing = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (!existing.includes(errId)) {
        existing.push(errId);
      }
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', existing.join(' '));
    }
  });

  summaryEl.hidden = false;
  moveFocus(summaryEl);
}

/**
 * Wire an accessible disclosure button and panel pair.
 * @param {HTMLButtonElement|null} button
 * @param {HTMLElement|null} panel
 * @param {object} [opts]
 * @returns {{setOpen: Function, isOpen: Function}}
 */
export function bindDisclosure(button, panel, { getClosedLabel, getOpenLabel, onToggle } = {}) {
  const setOpen = (open) => {
    const isOpen = Boolean(open);
    if (panel) panel.hidden = !isOpen;
    if (button) {
      button.setAttribute('aria-expanded', String(isOpen));
      if (isOpen && typeof getOpenLabel === 'function') {
        button.textContent = getOpenLabel();
      } else if (!isOpen && typeof getClosedLabel === 'function') {
        button.textContent = getClosedLabel();
      }
    }
    if (typeof onToggle === 'function') onToggle(isOpen);
  };

  const isOpen = () => button?.getAttribute('aria-expanded') === 'true';

  button?.addEventListener('click', () => setOpen(!isOpen()));

  return { setOpen, isOpen };
}
