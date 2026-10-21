const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test.describe('redes sociales', () => {
  const session = { user: { id: 'user-qa-001' }, access_token: 'mock', seedCars: [
    { id: 21, lote_id: 'lote-qa-001', brand: 'Honda', model: 'Civic', image_url: 'https://storage.test/a.jpg' },
  ] };

  test('publicar respeta Facebook, bloquea doble clic y muestra procesamiento', async ({ page }) => {
    let payload;
    let requests = 0;
    await page.route('**/webhook/publicar-redes', async route => {
      requests++;
      payload = route.request().postDataJSON();
      await new Promise(resolve => setTimeout(resolve, 350));
      await route.fulfill({ json: { success: true, status: 'processing', request_id: payload.request_id } });
    });
    await setupPage(page, session);
    await page.evaluate(() => {
      carsCache = window.__fakeState.cars;
      marketingSelectedCarId = 21;
      marketingImageUrls = ['https://storage.test/a.jpg', 'https://storage.test/b.jpg'];
      document.getElementById('section-marketing').classList.remove('hidden');
    });
    await page.locator('#platformInstagram').uncheck();
    await page.locator('#marketingCopyText').fill('Unidad disponible');
    await page.locator('#btnPublicarRedes').click({ force: true });
    await expect(page.locator('#btnPublicarRedes')).toBeDisabled();
    await page.locator('#btnPublicarRedes').evaluate(btn => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await expect(page.locator('#marketingStatusText')).toContainText('En proceso');
    expect(requests).toBe(1);
    expect(payload.platforms).toEqual(['facebook']);
    expect(payload.image_urls).toHaveLength(2);
    expect(payload.request_id).toMatch(/^[a-zA-Z0-9_-]{16,128}$/);
    await expect(page.locator('#btnPublicarRedes')).toBeEnabled();
    await expect(page.locator('#marketingStatusText')).toHaveAttribute('role', 'status');
  });

  test('una conexión parcial permite gestionar y reconectar las cuentas', async ({ page }) => {
    await page.route('**/webhook/redes-conectar', route => route.fulfill({ json: {
      conectado: false, parcial: true, plataformas: { facebook: true, instagram: false },
    } }));
    await setupPage(page, session);
    await page.evaluate(() => {
      document.getElementById('section-configuracion').classList.remove('hidden');
      document.getElementById('btnVerificarRedes').classList.remove('hidden');
    });
    await page.evaluate(() => verificarRedesSociales());
    await expect(page.locator('#redesStatusText')).toContainText('Facebook conectado');
    await expect(page.locator('#redesStatusText')).toContainText('Instagram pendiente');
    await expect(page.locator('#btnConectarRedes')).toBeEnabled();
  });

  test('una sesión abierta recupera el acceso después de rotar el token del lote',async ({page})=>{
    const headers=[];
    await page.route('**/webhook/redes-conectar',route=>{
      const token=route.request().headers().authorization;
      headers.push(token);
      return route.fulfill({status:token==='Bearer new-token'?200:401,json:token==='Bearer new-token'?
        {conectado:true,plataformas:{facebook:true,instagram:true}}:{error:'Token inválido'}});
    });
    await setupPage(page, session);
    await page.evaluate(()=>{
      currentLote={...currentLote,webhook_token:'old-token'};
      window.__fakeState.lote.webhook_token='new-token';
      document.getElementById('section-configuracion').classList.remove('hidden');
    });
    await page.evaluate(()=>verificarRedesSociales());
    await expect(page.locator('#redesStatusText')).toContainText('Facebook conectado. Instagram conectado.');
    expect(headers).toEqual(['Bearer old-token','Bearer new-token']);
  });

  test('error de publicación conserva el identificador al reintentar y desbloquea la UI', async ({ page }) => {
    const payloads = [];
    await page.route('**/webhook/publicar-redes', async route => {
      payloads.push(route.request().postDataJSON());
      await route.fulfill({ status: 502, json: { success: false, error: 'Revisa el estado antes de reintentar.' } });
    });
    await setupPage(page, session);
    await page.evaluate(() => {
      carsCache = window.__fakeState.cars; marketingSelectedCarId = 21;
      document.getElementById('section-marketing').classList.remove('hidden');
    });
    await page.locator('#marketingCopyText').fill('Unidad disponible');
    for (let i = 0; i < 2; i++) {
      await page.locator('#btnPublicarRedes').click({ force: true });
      await expect(page.locator('#marketingStatusText')).toContainText('Revisa el estado');
      await expect(page.locator('#btnPublicarRedes')).toBeEnabled();
    }
    expect(payloads).toHaveLength(2);
    expect(payloads[0].request_id).toBeTruthy();
    expect(payloads[0].request_id).toBe(payloads[1].request_id);
    await expect(page.locator('#marketingStatusText')).toHaveAttribute('role', 'alert');
  });
});

const supabaseMock = String.raw`(() => {
  const state = window.__fakeState = {
    lote: { id: 'lote-qa-001', profile_id: 'user-qa-001', nombre: 'Lote QA', stripe_customer_id: 'cus_qa', plan_activo: true },
    cars: (window.__testSession?.seedCars || []).map((car) => ({ ...car })), expenses: [], queries: [],
    inserts: { cars: 0, car_expenses: 0 },
    updates: { cars: 0 }, deletes: { cars: 0 }
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.payload = null; }
    select(columns = '*') { this.columns = columns; return this; }
    eq(key, value) { this.filters.push([key, String(value)]); return this; }
    order() { return this; }
    limit() { return this; }
    single() { this.one = true; return this; }
    insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
    update(payload) { this.op = 'update'; this.payload = payload; return this; }
    delete() { this.op = 'delete'; return this; }
    async run() {
      state.queries.push({ table: this.table, op: this.op, columns: this.columns });
      if (state.holdReads && this.op === 'select' && this.table === 'cars') await new Promise(resolve => { state.releaseRead = resolve; });
      if (this.op !== 'select' && !navigator.onLine) return { data: null, error: { message: 'Failed to fetch: offline' } };
      if (this.op === 'insert' || this.op === 'update') await delay(450);
      const key = this.table === 'cars' ? 'cars' : this.table === 'car_expenses' ? 'expenses' : null;
      const rows = key ? state[key] : this.table === 'lotes' ? [state.lote] : [];
      const matches = rows.filter((row) => this.filters.every(([field, value]) => String(row[field]) === value));
      if (this.op === 'insert') {
        const values = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const item of values) {
          const row = { id: key + '-qa-' + Date.now() + '-' + Math.random(), created_at: new Date().toISOString(), ...item };
          rows.push(row);
          if (state.inserts[key] !== undefined) state.inserts[key] += 1;
        }
        return { data: null, error: null };
      }
      if (this.op === 'update') {
        for (const row of matches) Object.assign(row, this.payload);
        if (state.updates[key] !== undefined) state.updates[key] += matches.length;
        return { data: null, error: null };
      }
      if (this.op === 'delete') {
        state[key] = rows.filter((row) => !matches.includes(row));
        if (state.deletes[key] !== undefined) state.deletes[key] += matches.length;
        return { data: null, error: null };
      }
      const selected = this.table === 'lotes' ? matches : rows;
      const data = this.columns && this.columns !== '*' ? selected.map(row => Object.fromEntries(this.columns.split(',').map(column => [column, row[column]]))) : selected;
      return { data: this.one ? (data[0] || null) : data, error: null };
    }
    then(resolve, reject) { return this.run().then(resolve, reject); }
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: window.__testSession || null }, error: null }),
      onAuthStateChange: (callback) => { window.__authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      setSession: async (tokens) => {
        window.__testSession = { ...tokens, user: window.__registerResponse?.body?.user || window.__testSession?.user };
        return { data: { session: window.__testSession }, error: null };
      },
      signOut: async () => { sessionStorage.setItem('qa-signed-out','1'); window.__testSession = null; return { error: null }; },
      signInWithPassword: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null })
    },
    from: (table) => new Query(table),
    storage: { from: () => ({
      upload: async () => ({ data: {}, error: null }),
      getPublicUrl: (path) => ({ data: { publicUrl: 'https://storage.test/' + path } })
    }) }
  };
  window.supabase = { createClient: () => client };
})();`;

async function setupPage(page, session = null, registerResponse = null, search = '') {
  const bootstrap = `window.__testSession=sessionStorage.getItem('qa-signed-out')?null:${JSON.stringify(session)};window.__registerResponse=${JSON.stringify(registerResponse)};window.__checkoutRequests=[];const realFetch=window.fetch.bind(window);window.fetch=async(input,options)=>{if(String(input).includes('/api/stripe-checkout-link')){window.__checkoutRequests.push(JSON.parse(options.body));const slug=window.VELODRIVE_STRIPE_TEST_MODE?'test_6oU5kFft7f452Bw0x73oA00':window.VELODRIVE_STRIPE_LIVE_QA_MODE?'fZu8wRbcR09b0to93D3oA07':'9B614p0ydcVXa3Y1Bb3oA06';return new Response(JSON.stringify({url:'https://buy.stripe.com/'+slug+'?client_reference_id=server_signed_reference'}),{status:200,headers:{'Content-Type':'application/json'}})}if(String(input).includes('/api/register-lote')){const r=window.__registerResponse||{status:201,body:{}};return new Response(JSON.stringify(r.body),{status:r.status,headers:{'Content-Type':'application/json'}})}return realFetch(input,options)};`;
  await page.addInitScript({ content: bootstrap + supabaseMock });
  await page.route('https://storage.test/**', route => route.fulfill({ contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
  await page.route('https://cdn.tailwindcss.com/**', (route) => route.abort());
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2**', (route) => route.abort());
  await page.route('**/vendor/supabase-2.118.0.js', route => route.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname, '../../dashboard.html')).href + search, { waitUntil: 'load' });
  // The production Tailwind CDN is intentionally not loaded in this offline
  // test; preserve its visibility utility so the screen flow behaves normally.
  await page.addStyleTag({ content: '.hidden{display:none!important}' });
  // Seed the same view state the authenticated route guard selects after
  // validating the account, while running the app's real local HTML/scripts.
  await page.evaluate(() => {
    if (window.__testSession) {
      currentUser = window.__testSession.user;
      currentLote = window.__fakeState.lote;
      showView('view-dashboard');
    } else {
      showView('view-login');
    }
    document.querySelectorAll('.wizard-step-content').forEach((step) => {
      step.classList.toggle('hidden', step.id !== 'wizardStep1');
    });
  });
}

async function completeRegistrationWizard(page) {
  if (await page.locator('#to-registro-btn').isVisible()) {
    await page.locator('#to-registro-btn').click();
  } else {
    await expect(page.locator('#view-registro')).toBeVisible();
  }
  // Guard against a late mocked route-guard callback from the about:blank
  // harness; navigation itself is exercised through the visible button above.
  await page.evaluate(() => showView('view-registro'));
  await page.locator('#registroNombreLote').fill('Lote Playwright');
  await page.locator('#registroPhoneLote').fill('523121234567');
  await page.locator('#registroDireccion').fill('Av. Prueba 123');
  await page.locator('#registroCiudad').fill('Colima');
  await page.locator('#registroEstado').selectOption('Colima');
  await page.locator('#wizardNext1').click();
  await page.locator('#registroRFC').fill('XAXX010101000');
  await page.locator('#registroRazonSocial').fill('Lote Playwright');
  await page.locator('#registroCP').fill('28000');
  await page.locator('#wizardNext2').click();
  await page.locator('#wizardNext3').click();
  await page.locator('#registroEmail').fill('qa@example.com');
  await page.locator('#registroPassword').fill('correct-horse-123');
  await page.locator('#aceptaDocumentosLegales').check();
}

test('registro: un 422 muestra error útil, permanece en el formulario y permite reintentar', async ({ page }) => {
  await setupPage(page, null, { status: 422, body: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.' } });
  await completeRegistrationWizard(page);
  const submit = page.locator('#btnSubmitRegistro');
  await submit.click();
  await expect(page.locator('#registroError')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#registroError')).toContainText('Inicia sesión');
  await expect(submit).toBeEnabled();
  await expect(page.locator('#view-registro')).toBeVisible();
});

test('registro: persiste el lote y redirige a Stripe con referencia del lote', async ({ page }) => {
  await setupPage(page, null, {
    status: 201,
    body: {
      user: { id: 'user-qa-001', email: 'qa@example.com' },
      lote: { id: 'lote-qa-001', profile_id: 'user-qa-001' },
      session: { access_token: 'mock-access', refresh_token: 'mock-refresh' },
      requiresEmailConfirmation: false
    }
  });
  let stripeRequest;
  page.on('request', (request) => { if (request.url().startsWith('https://buy.stripe.com/')) stripeRequest = request.url(); });
  await page.route('https://buy.stripe.com/**', (route) => route.abort());
  await completeRegistrationWizard(page);
  await page.locator('#btnSubmitRegistro').click();
  await expect.poll(() => stripeRequest).toContain('client_reference_id=server_signed_reference');
  await expect.poll(() => stripeRequest).toMatch(/^https:\/\/buy\.stripe\.com\/9B614p0ydcVXa3Y1Bb3oA06\?/);
});

test('registro de prueba: muestra el aviso, cobra $10 MXN/mes en Stripe Test y conserva la referencia del lote', async ({ page }) => {
  await setupPage(page, null, {
    status: 201,
    body: {
      user: { id: 'user-qa-001', email: 'qa@example.com' },
      lote: { id: 'lote-qa-001', profile_id: 'user-qa-001' },
      session: { access_token: 'mock-access', refresh_token: 'mock-refresh' },
      requiresEmailConfirmation: false
    }
  }, '?stripe_test=1');
  let stripeRequest;
  page.on('request', (request) => { if (request.url().startsWith('https://buy.stripe.com/')) stripeRequest = request.url(); });
  await page.route('https://buy.stripe.com/**', (route) => route.abort());
  await completeRegistrationWizard(page);
  await expect(page.locator('#stripeTestBanner')).toBeVisible();
  await expect(page.locator('#registroPrecioTexto')).toContainText('Prueba:');
  await expect(page.locator('#registroPrecioTexto')).toContainText('10');
  await page.locator('#btnSubmitRegistro').click();
  await expect.poll(() => stripeRequest).toContain('https://buy.stripe.com/test_6oU5kFft7f452Bw0x73oA00');
  await expect.poll(() => stripeRequest).toContain('client_reference_id=server_signed_reference');
});

test('registro QA con cobro real: muestra aviso de recurrencia y usa el Payment Link de $10 MXN', async ({ page }) => {
  await setupPage(page, null, {
    status: 201,
    body: {
      user: { id: 'user-qa-001', email: 'qa@example.com' },
      lote: { id: 'lote-qa-001', profile_id: 'user-qa-001' },
      session: { access_token: 'mock-access', refresh_token: 'mock-refresh' },
      requiresEmailConfirmation: false
    }
  }, '?stripe_live_qa=1');
  let stripeRequest;
  page.on('request', (request) => { if (request.url().startsWith('https://buy.stripe.com/')) stripeRequest = request.url(); });
  await page.route('https://buy.stripe.com/**', (route) => route.abort());
  await completeRegistrationWizard(page);
  await expect(page.locator('#stripeLiveQABanner')).toBeVisible();
  await expect(page.locator('#stripeLiveQABanner')).toContainText('recurrentes');
  await expect(page.locator('#registroPrecioTexto')).toContainText('cobro real');
  await page.locator('#btnSubmitRegistro').click();
  await expect.poll(() => stripeRequest).toContain('https://buy.stripe.com/fZu8wRbcR09b0to93D3oA07');
  await expect.poll(() => stripeRequest).toContain('client_reference_id=server_signed_reference');
});

test.describe('inventario y utilidad', () => {
  const session = { user: { id: 'user-qa-001', email: 'qa@example.com' }, access_token: 'mock', refresh_token: 'mock', seedCars: [] };

  async function openInventory(page) {
    await page.evaluate(() => showView('view-dashboard'));
    await expect(page.locator('#view-dashboard')).toBeVisible();
    // Tailwind layout utilities are absent in this offline harness, so nav
    // overlay geometry is not representative; dispatch the real button event.
    await page.locator('[data-section="section-inventario"]').click({ force: true });
    await page.locator('#section-inventario').evaluate((section) => section.classList.remove('hidden'));
  }

  async function fillCarForm(page) {
    await page.locator('#carBrand').fill('Honda');
    await page.locator('#carModel').fill('Civic');
    await page.locator('#carYear').fill('2022');
    await page.locator('#carKilometraje').fill('25000');
    await page.locator('#carEnganche').fill('50000');
    await page.locator('#carPrice').fill('320000');
  }

  test('agrega, edita y elimina un vehículo; el doble envío se ejecuta una sola vez', async ({ page }) => {
    await setupPage(page, session);
    page.on('dialog', (dialog) => dialog.accept());
    await openInventory(page);
    await page.locator('#btnAbrirModalCar').click();
    await expect(page.getByRole('dialog', { name: 'Registrar Nuevo Vehículo' })).toBeVisible();
    await expect(page.getByLabel('Marca')).toBeFocused();
    await expect(page.getByLabel('Modelo')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#modalCarOverlay')).toBeHidden();
    await expect(page.locator('#btnAbrirModalCar')).toBeFocused();
    await page.locator('#btnAbrirModalCar').click();
    await fillCarForm(page);
    const save = page.locator('#btnSubmitCarForm');
    await save.click();
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#uploadStatusText')).toContainText('Guardando el vehículo');
    await page.locator('#formNuevoCar').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await expect(page.locator('#actionToast')).toContainText('Vehículo agregado');
    await expect.poll(() => page.evaluate(() => window.__fakeState.inserts.cars)).toBe(1);
    await expect(page.locator('#carsGridContainer')).toContainText('Honda Civic');

    await page.getByRole('button', { name: 'Editar Honda Civic' }).click();
    await page.locator('#carPrice').fill('325000');
    await page.locator('#btnSubmitCarForm').click();
    await expect(page.locator('#actionToast')).toContainText('Vehículo actualizado');
    await expect.poll(() => page.evaluate(() => window.__fakeState.updates.cars)).toBe(1);

    await page.getByRole('button', { name: 'Eliminar Honda Civic' }).click();
    await expect(page.locator('#actionToast')).toContainText('Vehículo eliminado del inventario');
    await expect.poll(() => page.evaluate(() => window.__fakeState.deletes.cars)).toBe(1);
    await expect(page.locator('#carsGridContainer')).toContainText('No hay unidades registradas');
  });

  test('si se pierde internet al guardar, anuncia el error, restaura el botón y permite reintentar', async ({ page, context }) => {
    await setupPage(page, session);
    await openInventory(page);
    await page.locator('#btnAbrirModalCar').click();
    await fillCarForm(page);
    await context.setOffline(true);
    await page.locator('#btnSubmitCarForm').click();
    await expect(page.locator('#uploadStatusText')).toContainText('No se pudo guardar el vehículo');
    await expect(page.locator('#uploadStatusText')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#btnSubmitCarForm')).toBeEnabled();
    await expect(page.locator('#modalCarOverlay')).toBeVisible();
    await context.setOffline(false);
  });

  test('utilidad: guarda compra/venta y gasto con feedback y doble envío bloqueado', async ({ page }) => {
    await setupPage(page, session);
    const seededSession = { ...session, seedCars: [{ id: 'car-qa-1', lote_id: 'lote-qa-001', brand: 'Honda', model: 'Civic', year: 2022, price: 320000, status: 'Disponible', purchase_cost: 250000, sold_price: null, image_urls: [] }] };
    await setupPage(page, seededSession);
    await openInventory(page);
    await page.locator('[data-section="section-utilidad"]').click({ force: true });
    await page.locator('#section-utilidad').evaluate((section) => section.classList.remove('hidden'));
    await page.getByRole('button', { name: 'Editar compra / venta' }).click();
    await page.locator('#controlCostoCompra').fill('250000');
    await page.locator('#controlPrecioVenta').fill('320000');
    const saveFinance = page.locator('#btnGuardarDatosFinancieros');
    await saveFinance.click();
    await expect(saveFinance).toBeDisabled();
    await expect(page.locator('#finanzasStatus')).toContainText('Guardando');
    await expect(page.locator('#finanzasStatus')).toContainText('guardadas', { timeout: 8000 });
    await expect(page.locator('#costosUtilidadResumen')).toContainText('$70,000');

    await page.getByRole('button', { name: 'Registrar gastos' }).click();
    await page.locator('#gastoMonto').fill('5000');
    await page.locator('#gastoDescripcion').fill('Servicio y limpieza');
    await page.locator('#btnGuardarGasto').click();
    await expect(page.locator('#gastoStatus')).toContainText('Gasto guardado.');
    await expect(page.locator('#actionToast')).toContainText('Gasto registrado');
  });
});


test.describe('conexión WhatsApp',()=>{
  const session={user:{id:'user-qa-001'},access_token:'mock'};
  test('solicitudes simultáneas generan un solo QR y restauran el botón',async({page})=>{
    let requests=0;
    await page.route('**/webhook/whatsapp-qr',async route=>{
      requests++;await new Promise(resolve=>setTimeout(resolve,250));
      await route.fulfill({json:{conectado:false,qr_base64:'data:image/png;base64,aGVsbG8=',expires_in:45}});
    });
    await setupPage(page,session);
    await page.evaluate(()=>document.getElementById('section-configuracion').classList.remove('hidden'));
    await page.evaluate(()=>Promise.all([cargarEstadoWhatsappQr(),cargarEstadoWhatsappQr()]));
    expect(requests).toBe(1);
    await expect(page.locator('#btnRefrescarQr')).toBeEnabled();
    await expect(page.locator('#whatsappQrLoading')).toHaveAttribute('role','status');
  });
  test('la conexión se confirma automáticamente sin renovar el QR mostrado',async({page})=>{
    const bodies=[];
    await page.route('**/webhook/whatsapp-qr',route=>{
      bodies.push(route.request().postDataJSON());
      return route.fulfill({json:bodies.length===1?
        {conectado:false,qr_base64:'data:image/png;base64,aGVsbG8=',expires_in:45}:
        {conectado:true,numero:'523121234567'}});
    });
    await setupPage(page,session);
    await page.clock.install();
    await page.evaluate(async()=>{document.getElementById('section-configuracion').classList.remove('hidden');await cargarEstadoWhatsappQr();});
    await page.clock.fastForward(5000);
    await expect(page.locator('#whatsappEstadoBadge')).toHaveText('Conectado');
    expect(bodies[1].accion).toBe('estado');
  });
  test('un fallo de red muestra un error accesible y permite reintentar',async({page})=>{
    await page.route('**/webhook/whatsapp-qr',route=>route.abort('failed'));
    await setupPage(page,session);
    await page.evaluate(async()=>{document.getElementById('section-configuracion').classList.remove('hidden');await cargarEstadoWhatsappQr();});
    await expect(page.locator('#whatsappQrLoading')).toHaveAttribute('role','alert');
    await expect(page.locator('#btnRefrescarQr')).toBeEnabled();
  });
});


test.describe('aislamiento del panel', () => {
  const session = { user: { id: 'user-qa-001' }, access_token: 'mock', seedCars: [
    { id: 31, lote_id: 'lote-qa-001', brand: 'Honda', model: 'Civic', status: 'Disponible', purchase_cost: 123456, sold_price: 150000 },
  ] };

  test('catalogo no consulta leads, citas, gastos ni costos aunque se sincronice de nuevo', async ({ page }) => {
    await setupPage(page, session);
    await page.evaluate(() => stopSync());
    await page.locator('#catalogModeToggle').click();
    await page.evaluate(async () => { window.__fakeState.queries = []; await fetchAndRenderAll(); });
    const result = await page.evaluate(() => ({ queries: window.__fakeState.queries, cars: carsCache, leads: leadsCache, citas: citasCache, expenses: carExpensesCache }));
    expect(result.queries.map(q => q.table)).toEqual(['cars']);
    expect(result.queries[0].columns).not.toBe('*');
    expect(result.queries[0].columns).not.toMatch(/purchase_cost|sold_price/);
    expect(result.cars[0]).not.toHaveProperty('purchase_cost');
    expect(result.cars[0]).not.toHaveProperty('sold_price');
    expect(result.leads).toEqual([]);
    expect(result.citas).toEqual([]);
    expect(result.expenses).toEqual([]);
  });

  test('una lectura privada pendiente no repuebla caches al entrar en catalogo', async ({ page }) => {
    await setupPage(page, session);
    await page.evaluate(() => { stopSync(); window.__fakeState.holdReads = true; window.__oldRead = fetchCars(); });
    await page.locator('#catalogModeToggle').click();
    await page.evaluate(async () => { window.__fakeState.holdReads = false; window.__fakeState.releaseRead(); await window.__oldRead; });
    const cars = await page.evaluate(() => carsCache);
    expect(cars[0]).not.toHaveProperty('purchase_cost');
  });
  test('cerrar el contexto limpia datos y una lectura vieja no puede restaurarlos', async ({ page }) => {
    await setupPage(page, session);
    await page.evaluate(() => {
      stopSync(); window.__fakeState.holdReads = true;
      leadsCache = [{ nombre: 'Cliente privado' }]; citasCache = [{ telefono: '123' }];
      marketingImageUrls = ['https://privado.test/imagen']; carExpensesCache = [{ amount: 10 }];
      window.__oldRead = fetchCars();
      clearTenantContext();
    });
    await page.evaluate(async () => { window.__fakeState.holdReads = false; window.__fakeState.releaseRead(); await window.__oldRead; });
    const state = await page.evaluate(() => ({ user: currentUser, lote: currentLote, cars: carsCache, leads: leadsCache, citas: citasCache, gastos: carExpensesCache, fotos: marketingImageUrls }));
    expect(state).toEqual({ user: null, lote: null, cars: [], leads: [], citas: [], gastos: [], fotos: [] });
    await expect(page.locator('#view-login')).toBeVisible();
    await expect(page.locator('#view-dashboard')).toBeEmpty();
  });

  test('logout visible destruye el documento privado y vuelve a inicio de sesion', async ({ page }) => {
    await setupPage(page, session);
    await page.locator('#logoutBtn').click();
    await expect(page.locator('#view-login')).toBeVisible();
    await expect(page.locator('#view-dashboard')).toBeHidden();
    expect(await page.evaluate(() => ({ user: currentUser, lote: currentLote, cars: carsCache }))).toEqual({ user: null, lote: null, cars: [] });
  });

  test('un cambio de usuario emitido por Auth descarta el contexto anterior', async ({ page }) => {
    await setupPage(page, session);
    await page.evaluate(() => { sessionStorage.setItem('qa-signed-out','1'); window.__authCallback('SIGNED_IN', { user: { id: 'otro-dueno' } }); });
    await expect(page.locator('#view-login')).toBeVisible();
    expect(await page.evaluate(() => ({ user: currentUser, lote: currentLote, leads: leadsCache }))).toEqual({ user: null, lote: null, leads: [] });
  });

});
