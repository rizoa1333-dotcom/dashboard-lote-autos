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

  /**
   * @param {{getTenant:()=>({id:string,webhook_token:string}|null), loadToken:(id:string)=>Promise<string>, fetch:typeof fetch}} deps
   * @returns {(url:string, options?:RequestInit)=>Promise<Response>}
   */
  function createTenantWebhookClient(deps) {
    return async function send(url, options = {}) {
      const tenant = deps.getTenant();
      if (!tenant?.id) throw new Error('Tu sesión cambió. Inicia sesión de nuevo.');
      const tenantId = tenant.id;
      const request = (token) => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', 'Bearer ' + token);
        return deps.fetch(url, { ...options, headers });
      };
      const response = await request(tenant.webhook_token);
      // A 401 is rejected before any operation. Never retry ambiguous 5xx or network failures.
      if (response.status !== 401) return response;
      options.signal?.throwIfAborted();
      const token = await deps.loadToken(tenantId);
      const current = deps.getTenant();
      if (!token || current?.id !== tenantId) throw new Error('Tu sesión cambió. Inicia sesión de nuevo.');
      current.webhook_token = token;
      return request(token);
    };
  }

  /** @param {typeof fetch} transport */
  function createRequestScope(transport) {
    let controller = new AbortController();
    let generation = 0;
    const assertCurrent = (version) => {
      if (version !== generation) throw new DOMException('El contexto de la solicitud cambió.', 'AbortError');
    };
    return {
      reset() { generation += 1; controller.abort(); controller = new AbortController(); },
      async fetch(input, options = {}) {
        const version = generation;
        const inheritedSignal = options.signal || (typeof Request !== 'undefined' && input instanceof Request ? input.signal : null);
        const signal = inheritedSignal ? AbortSignal.any([controller.signal, inheritedSignal]) : controller.signal;
        signal.throwIfAborted();
        const response = await transport(input, { ...options, signal });
        assertCurrent(version);
        return new Proxy(response, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (['json', 'text', 'arrayBuffer', 'blob', 'formData', 'bytes'].includes(property) && typeof value === 'function') {
              return async (...args) => { assertCurrent(version); const result = await value.apply(target, args); assertCurrent(version); return result; };
            }
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });
      }
    };
  }

  return { beginSubmit, createTenantWebhookClient, createRequestScope };
});
