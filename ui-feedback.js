// Helpers pequeños y testeables para comunicar estados de envío en la UI.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VeloDriveUI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const pendingButtons = new WeakSet();

  function beginSubmit(button, status, pendingText, pendingMessage, isCurrent = () => true) {
    if (button && (button.disabled || pendingButtons.has(button))) return null;
    const originalText = button?.textContent || '';
    const originalNodes = button?.childNodes ? Array.from(button.childNodes) : null;
    if (button) {
      pendingButtons.add(button);
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      if (pendingText) button.textContent = pendingText;
    }
    if (status) {
      status.classList?.add('action-status');
      status.style?.removeProperty('color');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = pendingMessage || 'Guardando…';
      status.dataset.state = 'loading';
    }

    let finished = false;
    return function finishSubmit(message, state = 'success') {
      if (finished) return;
      finished = true;
      const updateUi = isCurrent();
      if (button && updateUi) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (originalNodes && button.replaceChildren) button.replaceChildren(...originalNodes);
        else button.textContent = originalText;
      }
      if (button) pendingButtons.delete(button);
      if (status && updateUi) {
        status.setAttribute('role', state === 'error' ? 'alert' : 'status');
        status.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
        status.textContent = message || '';
        status.dataset.state = message ? state : 'idle';
      }
    };
  }

  /**
   * @param {{run:()=>Promise<unknown>,canRun:()=>boolean,intervalMs?:number,
   * schedule?:(fn:()=>void,ms:number)=>unknown,cancel?:(id:unknown)=>void,onError?:(error:unknown)=>void}} deps
   */
  function createRefreshScheduler(deps) {
    let active = false, timer = null, running = null;
    const schedule = deps.schedule || ((fn, ms) => setTimeout(fn, ms));
    const cancel = deps.cancel || (id => clearTimeout(id));
    const clear = () => { if (timer !== null) cancel(timer); timer = null; };
    function refresh() {
      clear();
      if (!active || !deps.canRun()) return Promise.resolve(false);
      if (running) return running;
      running = Promise.resolve().then(deps.run).catch(error => { deps.onError?.(error); return false; }).finally(() => {
        running = null;
        if (active && deps.canRun()) timer = schedule(() => { void refresh(); }, deps.intervalMs || 10000);
      });
      return running;
    }
    return { start() { active = true; return refresh(); }, stop() { active = false; clear(); }, refresh };
  }

  /**
   * @template T,V
   * @param {T[]} items @param {number} limit @param {(item:T,index:number)=>Promise<V>} work
   * @param {(completed:number)=>void} [progress] @returns {Promise<PromiseSettledResult<V>[]>}
   */
  async function mapLimited(items, limit, work, progress = () => {}) {
    if (!Array.isArray(items) || !Number.isInteger(limit) || limit < 1 || limit > 4) throw new TypeError('INVALID_BATCH_LIMIT');
    const results = new Array(items.length);
    let next = 0, completed = 0;
    async function worker() {
      while (next < items.length) {
        const index = next++;
        try { results[index] = {status:'fulfilled', value:await work(items[index], index)}; }
        catch (reason) { results[index] = {status:'rejected', reason}; }
        progress(++completed);
      }
    }
    await Promise.all(Array.from({length:Math.min(limit, items.length)}, worker));
    return results;
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

  /** @param {typeof fetch} transport @param {number} [timeoutMs] Read deadlines never retry writes. */
  function createRequestScope(transport, timeoutMs = 0) {
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
        const signals = [controller.signal];
        if (inheritedSignal) signals.push(inheritedSignal);
        if (timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
        const signal = signals.length > 1 ? AbortSignal.any(signals) : controller.signal;
        signal.throwIfAborted();
        const response = await transport(input, { ...options, signal });
        signal.throwIfAborted();
        assertCurrent(version);
        return new Proxy(response, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (['json', 'text', 'arrayBuffer', 'blob', 'formData', 'bytes'].includes(property) && typeof value === 'function') {
              return async (...args) => { assertCurrent(version); signal.throwIfAborted(); const result = await value.apply(target, args); assertCurrent(version); signal.throwIfAborted(); return result; };
            }
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });
      }
    };
  }

  return { beginSubmit, createRefreshScheduler, mapLimited, createTenantWebhookClient, createRequestScope };
});
