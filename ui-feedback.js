// Helpers pequeños y testeables para comunicar estados de envío en la UI.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VeloDriveUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const pendingButtons = new WeakSet();

  function beginSubmit(button, status, pendingText, pendingMessage) {
    if (button && pendingButtons.has(button)) return null;
    const originalText = button?.textContent || '';
    if (button) {
      pendingButtons.add(button);
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      if (pendingText) button.textContent = pendingText;
    }
    if (status) {
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = pendingMessage || 'Guardando…';
      status.dataset.state = 'loading';
    }

    let finished = false;
    return function finishSubmit(message, state = 'success') {
      if (finished) return;
      finished = true;
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalText;
        pendingButtons.delete(button);
      }
      if (status && message) {
        status.textContent = message;
        status.dataset.state = state;
        status.setAttribute('role', state === 'error' ? 'alert' : 'status');
      }
    };
  }

  return { beginSubmit };
});
