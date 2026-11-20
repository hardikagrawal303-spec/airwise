/**
 * Announce a message in a polite live region.
 * @param {HTMLElement|null} liveEl
 * @param {string} message
 * @returns {void}
 */
export function announce(liveEl, message) {
  if (!liveEl) return;
  liveEl.textContent = '';
  // Brief tick ensures screen readers re-announce identical messages
  setTimeout(() => {
    liveEl.textContent = String(message || '');
  }, 40);
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
 * Clear form error summary and invalid markers.
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
    el.removeAttribute('aria-describedby');
  }
}

/**
 * Show validation errors and mark invalid fields.
 * @param {Array<{fieldId: string, message: string}>} errors
 * @param {object} opts
 * @returns {void}
 */
export function showFormErrors(errors, { summaryEl, listEl, doc = document }) {
  if (!summaryEl || !listEl) return;
  listEl.textContent = '';

  for (const err of errors) {
    const li = doc.createElement('li');
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
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', 'error-summary');
    }
  }

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
