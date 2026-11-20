/**
 * Accessibility helpers: polite live region announcements, focus management,
 * and accessible error summary linking.
 */

export function announce(liveEl, message) {
  if (!liveEl) return;
  liveEl.textContent = '';
  // Brief tick ensures screen readers re-announce identical messages
  setTimeout(() => {
    liveEl.textContent = String(message || '');
  }, 40);
}

export function moveFocus(element) {
  if (!element || typeof element.focus !== 'function') return;
  element.focus();
}

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
