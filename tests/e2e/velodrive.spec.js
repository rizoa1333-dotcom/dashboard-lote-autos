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

  test('verificar una publicacion parcial identifica la Pagina faltante y no reenvia fotos', async ({page}) => {
    let publications = 0;
    await page.route('**/webhook/publicar-redes', route => { publications++; return route.fulfill({json:{}}); });
    const message = 'Facebook: selecciona o autoriza una Página del negocio. Instagram: publicado';
    await page.route('**/webhook/verificar-publicacion', route => route.fulfill({json:{publicado:false,fallo:true,parcial:true,mensaje:message}}));
    await setupPage(page, session);
    const dialogPromise = page.waitForEvent('dialog');
    const verification = page.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'Verificar Meta';
      document.body.appendChild(button);
      return verificarPublicacionReal(21, 'qa-publication-reference', 'meta', button);
    });
    const dialog = await dialogPromise;
    expect(dialog.message()).toBe(message);
    await dialog.accept();
    await verification;
    expect(publications).toBe(0);
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
    gte() { return this; }
    order() { return this; }
    limit() { return this; }
    single() { this.one = true; return this; }
    maybeSingle() { this.one = true; return this; }
    insert(payload) { this.op = 'insert'; this.payload = payload; return this; }
    update(payload) { this.op = 'update'; this.payload = payload; return this; }
    delete() { this.op = 'delete'; return this; }
    async run() {
      state.queries.push({ table: this.table, op: this.op, columns: this.columns });
      if(this.table==='cars'&&this.op==='select'&&state.failAfterSale&&state.updates.cars>0)return {data:null,error:{message:'Fixture refresh failed'}};
      if(this.table==='car_expenses'&&this.op==='select'&&state.failExpenses)return {data:null,error:{message:'Fixture read failed'}};
      if(this.table==='cars'&&this.op==='select'&&state.failCarsAfterExpense&&state.inserts.car_expenses>0){
        if(state.failCarsAfterExpense==='throw')throw Error('Fixture refresh failed');
        return {data:null,error:{message:'Fixture refresh failed'}};
      }
      if(this.table==='cars'&&this.op==='select'&&state.holdSnapshot){
        const snapshot=structuredClone(state.cars);
        await new Promise(resolve=>{state.releaseSnapshot=resolve;});
        return {data:snapshot,error:null};
      }
      if (state.holdReads && this.op === 'select' && this.table === 'cars') await new Promise(resolve => { state.releaseRead = resolve; });
      if (this.op !== 'select' && !navigator.onLine) return { data: null, error: { message: 'Failed to fetch: offline' } };
      if (this.op === 'insert' || this.op === 'update') await delay(450);
      const key = this.table === 'cars' ? 'cars' : this.table === 'car_expenses' ? 'expenses' : null;
      const rows = key ? state[key] : this.table === 'lotes' ? [state.lote] : this.table === 'chat_history' ? (state.chatMessages || []) : [];
      const matches = rows.filter((row) => this.filters.every(([field, value]) => String(row[field]) === value));
      if (this.op === 'insert') {
        const values = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const item of values) {
          const row = { id: key + '-qa-' + Date.now() + '-' + Math.random(), created_at: new Date().toISOString(), ...item };
          rows.push(row);
          if (state.inserts[this.table] !== undefined) state.inserts[this.table] += 1;
        }
        return { data: null, error: null };
      }
      if (this.op === 'update') {
        for (const row of matches) Object.assign(row, this.payload);
        if (state.updates[key] !== undefined) state.updates[key] += matches.length;
        if(this.one)return {data:matches.length===1?{...matches[0]}:null,error:matches.length===1?null:{message:'Expected one updated row'}};
        return { data: null, error: null };
      }
      if (this.op === 'delete') {
        state[key] = rows.filter((row) => !matches.includes(row));
        if (state.deletes[key] !== undefined) state.deletes[key] += matches.length;
        return { data: null, error: null };
      }
      const selected = ['lotes','chat_history'].includes(this.table) ? matches : rows;
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

async function setupPage(page, session = null, registerResponse = null, search = '', origin = null) {
  const bootstrap = `window.__testSession=sessionStorage.getItem('qa-signed-out')?null:${JSON.stringify(session)};window.__registerResponse=${JSON.stringify(registerResponse)};window.__checkoutRequests=[];const realFetch=window.fetch.bind(window);window.fetch=async(input,options)=>{if(String(input).includes('/api/stripe-checkout-link')){window.__checkoutRequests.push(JSON.parse(options.body));const slug=window.VELODRIVE_STRIPE_TEST_MODE?'test_6oU5kFft7f452Bw0x73oA00':window.VELODRIVE_STRIPE_LIVE_QA_MODE?'fZu8wRbcR09b0to93D3oA07':'9B614p0ydcVXa3Y1Bb3oA06';return new Response(JSON.stringify({url:'https://buy.stripe.com/'+slug+'?client_reference_id=server_signed_reference'}),{status:200,headers:{'Content-Type':'application/json'}})}if(String(input).includes('/api/register-lote')){const r=window.__registerResponse||{status:201,body:{}};return new Response(JSON.stringify(r.body),{status:r.status,headers:{'Content-Type':'application/json'}})}return realFetch(input,options)};`;
  await page.addInitScript({ content: bootstrap + supabaseMock });
  await page.route('https://storage.test/**', route => route.fulfill({ contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
  await page.route('https://cdn.tailwindcss.com/**', (route) => route.abort());
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2**', (route) => route.abort());
  await page.route('**/vendor/supabase-2.118.0.js', route => route.abort());
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto((origin || pathToFileURL(path.resolve(__dirname, '../../dashboard.html')).href) + search, { waitUntil: 'load' });
  // The production Tailwind CDN is intentionally not loaded in this offline
  // test; preserve its visibility utility so the screen flow behaves normally.
  if(!origin)await page.addStyleTag({ content: '.hidden{display:none!important}' });
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

test.describe('inventario', () => {
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

});

test.describe('ventas mensuales',()=>{
 let server,origin;
 test.beforeAll(async()=>{server=require('../../server').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;});
 test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));});
 const year=String(new Date().getFullYear());
 const sold={id:'sale-qa-1',lote_id:'lote-qa-001',brand:'Honda',model:'Civic',year:2022,price:320000,status:'Vendido',sold_price:280000,fecha_venta:year+'-01-12',image_urls:[]};
 async function openSales(page,car=sold){
  await page.route('https://n8n-production-97a4.up.railway.app/**',route=>route.fulfill({json:{}}));
  await setupPage(page,{user:{id:'user-qa-001'},access_token:'mock',seedCars:[car]},null,'',origin);
  await page.evaluate(()=>{stopSync();currentLote.plan_status='active';renderSubscriptionStatus();});
  await page.locator('[data-section="section-ventas"]').click();await expect(page.locator('#section-ventas')).toBeVisible();
 }
 test('muestra ventas reales y elimina utilidad, horas de leads y aviso global',async({page})=>{
  await openSales(page);await expect(page.locator('#ventasMensualesContainer')).toContainText('Enero');
  await expect(page.locator('#ventasMensualesContainer')).toContainText('Honda Civic 2022');await expect(page.locator('#ventasMensualesContainer')).toContainText('12/01/'+year);
  await expect(page.locator('#ventasMensualesContainer')).toContainText('$280,000');await expect(page.locator('#section-ventas')).not.toContainText(/ganancia|compra|gastos/i);
  await expect(page.locator('[data-section="section-utilidad"]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__fakeState.queries.some(q=>q.table==='car_expenses'))).toBe(false);
  await page.evaluate(()=>{setSyncStatus('Datos actualizados.','success');leadsCache=[{id:'lead-test',nombre:'Cliente prueba',status:'Calificado',created_at:new Date().toISOString()}];renderLeadsTable();});
  await expect(page.locator('#dashboardSyncStatus')).toBeHidden();await expect(page.locator('#dashboardSyncStatus')).toBeEmpty();
  expect(await page.locator('#leadsGroupedContainer').textContent()).not.toMatch(/\bHora\b|\d{1,2}:\d{2}\s*[ap]/i);
  await page.screenshot({path:path.resolve(__dirname,'../../.qa/evidence/monthly-sales-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.locator('#sidebar').evaluate(element=>element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:path.resolve(__dirname,'../../.qa/evidence/monthly-sales-mobile.png'),fullPage:true});
 });
 test('registra venta sin compra y bloquea doble envio',async({page})=>{
  await openSales(page,{...sold,status:'Disponible',sold_price:null,fecha_venta:null});await page.locator('[data-section="section-inventario"]').click({force:true});await page.locator('.btn-marcar-vendido').click();
  await expect(page.locator('#ventaPrecio')).toHaveValue('');await page.locator('#ventaPrecio').fill('279999.50');await page.locator('#ventaFecha').fill(year+'-01-10');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#btnGuardarVenta').click();await expect(page.locator('#btnGuardarVenta')).toBeDisabled();
  await page.locator('#formVenta').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await expect(page.locator('#modalVentaOverlay')).toBeHidden();
  const result=await page.evaluate(()=>({car:window.__fakeState.cars[0],updates:window.__fakeState.updates.cars}));
  expect(result.updates).toBe(1);expect(result.car.status).toBe('Vendido');expect(result.car.sold_price).toBe(279999.5);expect(result.car).not.toHaveProperty('purchase_cost');
 });
 test('cancelar confirmacion no modifica el auto',async({page})=>{
  await openSales(page,{...sold,status:'Disponible',sold_price:null});await page.evaluate(()=>abrirVenta('sale-qa-1'));await page.locator('#ventaPrecio').fill('200000');await page.locator('#ventaFecha').fill(year+'-01-10');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#btnGuardarVenta').click();await expect(page.locator('#ventaStatus')).toContainText('sin confirmar');expect(await page.evaluate(()=>window.__fakeState.updates.cars)).toBe(0);
 });
 test('venta sin fecha se completa y precio ausente nunca usa precio de catalogo',async({page})=>{
  await openSales(page,{...sold,fecha_venta:null,sold_price:null});await expect(page.locator('#ventasPendientes')).toContainText('Honda Civic');await expect(page.locator('#ventasMensualesContainer')).toContainText('No hay ventas');
  await page.locator('#ventasPendientes [data-sale-car]').click();await expect(page.locator('#ventaFecha')).toHaveValue('');await page.locator('#ventaFecha').fill(year+'-02-01');await page.locator('#ventaPrecio').fill('250000');await page.locator('#btnGuardarVenta').click();
  await expect(page.locator('#modalVentaOverlay')).toBeHidden();await expect(page.locator('#ventasMensualesContainer')).toContainText('Febrero');await expect(page.locator('#ventasPendientes')).toBeEmpty();
 });
 test('separa años y no suma precios faltantes',async({page})=>{
  await openSales(page,{...sold,fecha_venta:(Number(year)-1)+'-12-01',sold_price:null});await expect(page.locator('#ventasMensualesContainer')).toContainText('No hay ventas');
  await page.locator('#ventasYear').selectOption(String(Number(year)-1));await expect(page.locator('#ventasMensualesContainer')).toContainText('Diciembre');await expect(page.locator('#ventasMensualesContainer')).toContainText('Faltan precios');await expect(page.locator('#ventasMensualesContainer')).not.toContainText('$320,000');
 });
 test('offline conserva el formulario y permite reintentar',async({page,context})=>{
  await openSales(page);await page.locator('[data-sale-car]').click();await page.locator('#ventaPrecio').fill('275000');await context.setOffline(true);await page.locator('#btnGuardarVenta').click();
  await expect(page.locator('#ventaStatus')).toHaveAttribute('role','alert');await expect(page.locator('#ventaPrecio')).toHaveValue('275000');await expect(page.locator('#btnGuardarVenta')).toBeEnabled();
 });
 test('dialogo movil conserva foco y escape',async({page})=>{
  await openSales(page);await page.locator('[data-sale-car]').click();await page.setViewportSize({width:390,height:844});await expect(page.locator('#ventaTitulo')).toBeFocused();
  await page.locator('#btnGuardarVenta').focus();await page.keyboard.press('Tab');await expect(page.locator('#btnCerrarVenta')).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('#modalVentaOverlay')).toBeHidden();await expect(page.locator('[data-sale-car]')).toBeFocused();
 });
 test('venta guardada con refresco fallido no invita a registrarla otra vez',async({page})=>{
  await openSales(page);await page.locator('[data-sale-car]').click();await page.evaluate(()=>{window.__fakeState.failAfterSale=true;});await page.locator('#btnGuardarVenta').click();
  await expect(page.locator('#ventaStatus')).toContainText('Venta guardada. Actualiza');expect(await page.evaluate(()=>window.__fakeState.updates.cars)).toBe(1);await expect(page.locator('#btnGuardarVenta')).toBeEnabled();
 });
 test('otra venta no reutiliza el modal mientras sigue un guardado pendiente',async({page})=>{
  await openSales(page);await page.evaluate(()=>window.__fakeState.cars.push({...window.__fakeState.cars[0],id:'second-car',brand:'Toyota',model:'Yaris'}));
  await page.locator('[data-sale-car="sale-qa-1"]').click();await page.locator('#btnGuardarVenta').click();await expect(page.locator('#btnGuardarVenta')).toBeDisabled();
  await page.locator('#btnCerrarVenta').click();await page.evaluate(()=>abrirVenta('second-car'));await expect(page.locator('#modalVentaOverlay')).toBeHidden();
  await expect(page.locator('#btnGuardarVenta')).toBeEnabled();await page.evaluate(()=>abrirVenta('second-car'));await expect(page.locator('#ventaCarNombre')).toContainText('Toyota Yaris');
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
    const result = await page.evaluate(() => ({ queries: window.__fakeState.queries, cars: carsCache, leads: leadsCache, citas: citasCache }));
    expect(result.queries.map(q => q.table)).toEqual(['cars']);
    expect(result.queries[0].columns).not.toBe('*');
    expect(result.queries[0].columns).not.toMatch(/purchase_cost|sold_price/);
    expect(result.cars[0]).not.toHaveProperty('purchase_cost');
    expect(result.cars[0]).not.toHaveProperty('sold_price');
    expect(result.leads).toEqual([]);
    expect(result.citas).toEqual([]);
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
      marketingImageUrls = ['https://privado.test/imagen'];
      window.__oldRead = fetchCars();
      clearTenantContext();
    });
    await page.evaluate(async () => { window.__fakeState.holdReads = false; window.__fakeState.releaseRead(); await window.__oldRead; });
    const state = await page.evaluate(() => ({ user: currentUser, lote: currentLote, cars: carsCache, leads: leadsCache, citas: citasCache, fotos: marketingImageUrls }));
    expect(state).toEqual({ user: null, lote: null, cars: [], leads: [], citas: [], fotos: [] });
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

test('Checkout Session permite redirigir al dominio oficial de Stripe',async({page})=>{
 await setupPage(page,{user:{id:'user-qa-001'},access_token:'mock'});
 let destination;
 page.on('request',request=>{if(request.url().startsWith('https://checkout.stripe.com/'))destination=request.url();});
 await page.route('https://checkout.stripe.com/**',route=>route.abort());
 await page.evaluate(async()=>{
   sessionRequests.fetch=async()=>new Response(JSON.stringify({url:'https://checkout.stripe.com/c/pay/cs_test_only'}),{status:200});
   await redirigirAStripeCheckout(currentLote).catch(error=>{window.__checkoutError=error.message;});
 });
 await expect.poll(()=>destination).toBe('https://checkout.stripe.com/c/pay/cs_test_only');
});

test.describe('respuesta y estados de acciones',()=>{
 const session={user:{id:'user-qa-001'},access_token:'mock'};
 test('configuracion bloquea doble submit y comunica progreso y exito',async({page})=>{
  await setupPage(page,session);
  await page.evaluate(()=>{stopSync();document.getElementById('section-configuracion').classList.remove('hidden');});
  await page.locator('#configNombreLote').fill('Lote actualizado');
  const button=page.locator('#configForm button[type=submit]');await button.click();
  await expect(button).toHaveAttribute('aria-busy','true');
  await expect(page.locator('#configStatus')).toContainText('Guardando');
  await page.locator('#configForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await expect(page.locator('#configStatus')).toContainText('Configuración guardada');
  await expect(button).toBeEnabled();
  expect(await page.evaluate(()=>window.__fakeState.queries.filter(q=>q.table==='lotes'&&q.op==='update').length)).toBe(1);
  await expect(page.locator('#configNombreLote')).toHaveValue('Lote actualizado');
 });
 test('configuracion offline conserva entradas y muestra error accesible',async({page,context})=>{
  await setupPage(page,session);
  await page.evaluate(()=>{stopSync();document.getElementById('section-configuracion').classList.remove('hidden');});
  await page.locator('#configNombreLote').fill('No perder este nombre');await context.setOffline(true);
  await page.locator('#configForm button[type=submit]').click();
  await expect(page.locator('#configStatus')).toHaveAttribute('role','alert');
  await expect(page.locator('#configStatus')).toContainText('No se pudo guardar');
  await expect(page.locator('#configNombreLote')).toHaveValue('No perder este nombre');
  await expect(page.locator('#configForm button[type=submit]')).toBeEnabled();
 });
 test('inventario no realiza consultas de gastos',async({page})=>{
  await setupPage(page,session);await page.evaluate(async()=>{stopSync();window.__fakeState.queries=[];await fetchCars();});
  expect(await page.evaluate(()=>window.__fakeState.queries.map(q=>q.table))).toEqual(['cars']);
 });
 test('login bloquea envios repetidos mientras valida las credenciales',async({page})=>{
  await setupPage(page);
  await page.evaluate(()=>{window.__loginCount=0;supabaseClient.auth.signInWithPassword=async()=>{window.__loginCount++;await new Promise(r=>{window.__finishLogin=r;});return {data:{},error:{message:'Credenciales inválidas'}};};});
  await page.locator('#loginEmail').fill('qa@example.com');await page.locator('#loginPassword').fill('invalid-password');
  const button=page.locator('#loginForm button[type=submit]');await button.click();await expect(button).toHaveAttribute('aria-busy','true');
  await page.locator('#loginForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(await page.evaluate(()=>window.__loginCount)).toBe(1);await page.evaluate(()=>window.__finishLogin());
  await expect(page.locator('#loginError')).toHaveAttribute('role','alert');await expect(button).toBeEnabled();
 });
 test('generar texto y subir fotos no dejan controles bloqueados por cruces de acciones',async({page})=>{
  await setupPage(page,{...session,seedCars:[{id:21,lote_id:'lote-qa-001',brand:'Honda',model:'Civic'}]});
  await page.evaluate(()=>{
   stopSync();carsCache=window.__fakeState.cars;marketingSelectedCarId=21;
   document.getElementById('section-marketing').classList.remove('hidden');
   generarCopyIA=()=>new Promise(resolve=>{window.__finishCopy=resolve;});
  });
  await page.locator('#btnGenerarCopy').click();await expect(page.locator('#btnGenerarCopy')).toBeDisabled();
  await page.evaluate(()=>subirMediaMarketing([new File(['fixture'],'fixture.jpg',{type:'image/jpeg'})]));
  await expect(page.locator('#marketingStatusText')).toContainText('termine de generar');
  await page.evaluate(()=>window.__finishCopy('Texto terminado'));
  await expect(page.locator('#btnGenerarCopy')).toBeEnabled();
  await expect(page.locator('#btnPublicarRedes')).toBeEnabled();
 });
 test('progreso visible con CSS real, sin desbordamiento movil y respetando movimiento reducido',async({page})=>{
  const server=require('../../server').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
   await page.route('https://n8n-production-97a4.up.railway.app/**',route=>route.fulfill({json:{}}));
   await setupPage(page,session,null,'','http://127.0.0.1:'+server.address().port);
   await page.evaluate(()=>{
    stopSync();document.querySelectorAll('.dashboard-section').forEach(section=>section.classList.add('hidden'));
    document.getElementById('section-configuracion').classList.remove('hidden');
    const query={eq:()=>query,select:()=>query,single:()=>new Promise(resolve=>{window.__finishConfig=resolve;})};
    const original=supabaseClient.from;
    supabaseClient.from=table=>table==='lotes'?{update:()=>query}:original(table);
   });
   const button=page.locator('#configForm button[type=submit]');await button.click();
   await expect(button).toHaveAttribute('aria-busy','true');
   expect(await button.evaluate(element=>getComputedStyle(element,'::before').animationName)).toBe('velodrive-busy');
   await page.screenshot({path:path.resolve(__dirname,'../../.qa/evidence/loading-desktop.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
   await expect.poll(()=>page.locator('#sidebar').evaluate(element=>element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
   await button.scrollIntoViewIfNeeded();
   expect(await button.evaluate(element=>getComputedStyle(element,'::before').animationName)).toBe('none');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:path.resolve(__dirname,'../../.qa/evidence/loading-mobile.png'),fullPage:true});
   await page.evaluate(()=>window.__finishConfig({data:{...window.__fakeState.lote,nombre:'Lote actualizado'},error:null}));
   await expect(button).toBeEnabled();
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
});

test.describe('perfil de prospecto',()=>{
 let server,origin;
 test.beforeAll(async()=>{server=require('../../server').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;});
 test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));});
 async function profilePage(page){
  await page.route('https://n8n-production-97a4.up.railway.app/**',r=>r.fulfill({json:{}}));
  await setupPage(page,{user:{id:'user-qa-001'},access_token:'mock'},null,'',origin);
  await page.evaluate(()=>{
   stopSync();currentLote.plan_status='active';renderSubscriptionStatus();
   leadsCache=[{id:'lead-a',nombre:'Ana Prueba',phone_number:'523121110001',status:'Calificado',created_at:new Date().toISOString()},{id:'lead-b',nombre:'Bruno Prueba',phone_number:'523121110002',status:'Calificado',created_at:new Date().toISOString()}];renderLeadsTable();
  });
 }
 test('Ver Perfil abre el panel dentro de la pantalla y permite cerrarlo',async({page})=>{
  await profilePage(page);await page.locator('.btn-ver-perfil[data-lead-id="lead-a"]:visible').first().click();
  await expect(page.locator('#drawerPro')).toHaveClass(/drawer-open/);
  await expect.poll(()=>page.locator('#drawerPro').evaluate(el=>el.getBoundingClientRect().left)).toBeLessThan(1200);
  await expect(page.locator('#drawerNombre')).toHaveText('Ana Prueba');await page.locator('#closeDrawerBtn').click();await expect(page.locator('#drawerOverlay')).toBeHidden();
 });
 test('el perfil abre inmediatamente aunque el historial tarde y Escape lo cierra',async({page})=>{
  await profilePage(page);await page.evaluate(()=>{refreshChatLive=()=>new Promise(r=>{window.__releaseProfileChat=r;});});
  await page.locator('.btn-ver-perfil[data-lead-id="lead-a"]:visible').first().click();
  await expect(page.locator('#drawerPro')).toHaveClass(/drawer-open/,{timeout:1000});await expect(page.locator('#drawerNombre')).toHaveText('Ana Prueba');
  await page.keyboard.press('Escape');await expect(page.locator('#drawerOverlay')).toBeHidden();await page.evaluate(()=>window.__releaseProfileChat());await expect(page.locator('#drawerOverlay')).toBeHidden();
 });
 test('movil y Shift Tab conservan el perfil accesible dentro de pantalla',async({page})=>{
  await profilePage(page);await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{window.__openingProfile=openDrawer('lead-a');});await page.evaluate(()=>window.__openingProfile);
  await expect.poll(()=>page.locator('#drawerPro').evaluate(el=>Math.abs(el.getBoundingClientRect().left))).toBeLessThan(1);
  const fields=await page.evaluate(()=>({name:document.getElementById('drawerNombre').getBoundingClientRect().bottom,phone:document.getElementById('drawerTelefono').getBoundingClientRect().top}));
  expect(fields.phone).toBeGreaterThan(fields.name);
  await page.locator('#drawerTitle').focus();await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>document.getElementById('drawerPro').contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(()=>document.getElementById('view-dashboard').inert)).toBe(true);
  await page.screenshot({path:path.resolve(__dirname,'../../.qa/evidence/profile-mobile.png'),fullPage:true});
  await page.keyboard.press('Escape');await expect(page.locator('#drawerOverlay')).toBeHidden();expect(await page.evaluate(()=>document.getElementById('view-dashboard').inert)).toBe(false);
 });
 test('un documento tardio no sustituye el expediente de otro prospecto',async({page})=>{
  await profilePage(page);await page.evaluate(()=>{
   leadsCache[0].url_ine='doc-a';leadsCache[1].url_ine='doc-b';
   crearUrlDocumentoPrivado=value=>value==='doc-a'?new Promise(resolve=>{window.__releaseDocA=resolve;}):Promise.resolve(value==='doc-b'?'https://storage.test/b.jpg':'');
   window.__openingA=openDrawer('lead-a');
  });
  await page.evaluate(()=>openDrawer('lead-b'));await expect(page.locator('#drawerNombre')).toHaveText('Bruno Prueba');
  await page.evaluate(async()=>{window.__releaseDocA('https://storage.test/a.jpg');await window.__openingA;});
  await expect(page.locator('#drawerExpedienteDocs a')).toHaveAttribute('href','https://storage.test/b.jpg');await expect(page.locator('#drawerNombre')).toHaveText('Bruno Prueba');
 });
 test('fallo de historial conserva datos basicos y permite cerrar el perfil',async({page})=>{
  await profilePage(page);await page.evaluate(()=>{refreshChatLive=async()=>{throw Error('fixture');};});
  await page.locator('.btn-ver-perfil[data-lead-id="lead-a"]:visible').first().click();await expect(page.locator('#drawerLoadStatus')).toHaveAttribute('role','alert');
  await expect(page.locator('#drawerNombre')).toHaveText('Ana Prueba');await expect(page.locator('#crmChatHistoryContainer')).toContainText('No se pudo cargar');await expect(page.locator('#drawerPro')).not.toHaveAttribute('aria-busy','true');
  await expect.poll(()=>page.locator('#drawerPro').evaluate(el=>el.getBoundingClientRect().right-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:path.resolve(__dirname,'../../.qa/evidence/profile-desktop.png'),fullPage:true});
  await page.locator('#closeDrawerBtn').click();await expect(page.locator('#drawerOverlay')).toBeHidden();
 });
 test('cerrar sesion limpia tambien el perfil y descarta sus respuestas tardias',async({page})=>{
  await profilePage(page);await page.evaluate(()=>{refreshChatLive=()=>new Promise(resolve=>{window.__releaseChat=resolve;});window.__pendingProfile=openDrawer('lead-a');});
  await page.evaluate(()=>clearTenantContext());await page.evaluate(async()=>{window.__releaseChat();await window.__pendingProfile;});
  await expect(page.locator('#drawerOverlay')).toBeHidden();await expect(page.locator('#drawerNombre')).toBeEmpty();await expect(page.locator('#drawerTelefono')).toBeEmpty();await expect(page.locator('#drawerExpedienteDocs')).toBeEmpty();
 });
 test('pausa pendiente de otro perfil no sobrescribe botones ni estado del actual',async({page})=>{
  await profilePage(page);await page.evaluate(()=>{
   const original=supabaseClient.from;supabaseClient.from=table=>{const query=original(table);if(table==='chat_handoffs')query.upsert=()=>new Promise(resolve=>{window.__releasePause=resolve;});return query;};
  });
  await page.locator('.btn-ver-perfil[data-lead-id="lead-a"]:visible').first().click();await expect(page.locator('#btnPauseAiChat')).toBeEnabled();await page.locator('#btnPauseAiChat').click();
  await page.locator('#closeDrawerBtn').click();await page.locator('.btn-ver-perfil[data-lead-id="lead-b"]:visible').first().click();await expect(page.locator('#drawerNombre')).toHaveText('Bruno Prueba');
  await page.evaluate(()=>window.__releasePause({error:null}));await expect(page.locator('#crmAiHandoffStatus')).toHaveText('IA activa');await expect(page.locator('#btnPauseAiChat')).toBeEnabled();await expect(page.locator('#btnPauseAiChat')).toHaveText('Pausar IA · 30 min');
 });
});

test.describe('interaccion tactil del perfil',()=>{
 test.use({viewport:{width:390,height:640},hasTouch:true,isMobile:true});
 let server,origin;
 test.beforeAll(async()=>{server=require('../../server').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;});
 test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));});
 async function openMobileProfile(page){
  await page.route('https://n8n-production-97a4.up.railway.app/**',route=>route.fulfill({json:{}}));
  await setupPage(page,{user:{id:'user-qa-001'},access_token:'mock'},null,'',origin);
  await page.evaluate(()=>{
   stopSync();currentLote.plan_status='active';renderSubscriptionStatus();
   leadsCache=[{id:'touch-lead',nombre:'Prospecto de prueba',phone_number:'523121110001',notes:'Notas extensas del expediente. '.repeat(150),ultimo_mensaje:'Mensaje extenso del prospecto. '.repeat(150),status:'Calificado'}];
   window.__fakeState.chatMessages=Array.from({length:40},(_,i)=>({lote_id:currentLote.id,phone_number:'3121110001',role:i%2?'assistant':'user',message:'Mensaje '+i+' de la conversación de prueba. '.repeat(4)}));renderLeadsTable();
  });
  await page.locator('.btn-ver-perfil:visible').first().tap();
  await expect(page.locator('#drawerPro')).toHaveClass(/drawer-open/);
  await expect(page.locator('#drawerPro')).not.toHaveAttribute('aria-busy','true');
  await expect.poll(()=>page.locator('#drawerPro').evaluate(el=>Math.abs(el.getBoundingClientRect().left))).toBeLessThan(1);
 }
 async function swipe(page,locator,direction){
  const box=await locator.boundingBox();const client=await page.context().newCDPSession(page);
  const x=Math.round(box.x+box.width/2),start=Math.round(box.y+(direction==='up'?0.8:0.2)*box.height),end=Math.round(box.y+(direction==='up'?0.2:0.8)*box.height);
  try{
   await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
   for(let i=1;i<=8;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.round(start+(end-start)*i/8)}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
   await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await client.detach();}
 }
 for(const tab of ['datos','docs'])test('desplaza '+tab+' con el dedo sin quedar recortado',async({page})=>{
  await openMobileProfile(page);await page.locator('[data-drawer-tab="tab-'+tab+'"]').tap();
  const panel=page.locator('#tab-'+tab);
  expect(await panel.evaluate(el=>el.clientHeight<=el.parentElement.clientHeight+1)).toBe(true);
  await swipe(page,panel,'up');await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(20);
  await expect(page.locator('#closeDrawerBtn')).toBeInViewport();
  await page.screenshot({path:path.resolve(__dirname,'../../.qa/evidence/profile-touch-'+tab+'.png')});
 });
 test('desplaza la conversacion hacia mensajes anteriores sin mover todo el perfil',async({page})=>{
  await openMobileProfile(page);await page.locator('[data-drawer-tab="tab-chat"]').tap();
  const history=page.locator('#crmChatHistoryContainer');
  await expect(history.locator('.self-start')).toHaveCount(20);
  expect(await page.locator('#tab-chat').evaluate(el=>el.clientHeight<=el.parentElement.clientHeight+1)).toBe(true);
  await expect.poll(()=>history.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  const before=await history.evaluate(el=>el.scrollTop);await swipe(page,history,'down');
  await expect.poll(()=>history.evaluate(el=>el.scrollTop)).toBeLessThan(before-20);
  await expect(page.locator('#closeDrawerBtn')).toBeInViewport();
 });
 test('restaura las tres columnas al pasar de telefono a escritorio',async({page})=>{
  await openMobileProfile(page);await page.locator('[data-drawer-tab="tab-docs"]').tap();
  await page.locator('[data-drawer-tab="tab-docs"]').focus();
  await page.setViewportSize({width:1365,height:900});
  for(const id of ['tab-datos','tab-chat','tab-docs'])await expect(page.locator('#'+id)).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.getElementById('drawerPro').contains(document.activeElement))).toBe(true);
 });
 test('Tab y Shift Tab permanecen dentro del perfil y omiten pestanas inactivas',async({page})=>{
  await openMobileProfile(page);
  for(const tab of ['datos','docs']){
   await page.locator('[data-drawer-tab="tab-'+tab+'"]').tap();
   await page.locator('#tab-'+tab).focus();await page.keyboard.press('Tab');
   await expect(page.locator('#closeDrawerBtn')).toBeFocused();
   await page.keyboard.press('Shift+Tab');await expect(page.locator('#tab-'+tab)).toBeFocused();
  }
 });
 test('pestanas con teclado y boton de cerrar con area tactil suficiente',async({page})=>{
  await openMobileProfile(page);
  const close=await page.locator('#closeDrawerBtn').boundingBox();expect(close.width).toBeGreaterThanOrEqual(44);expect(close.height).toBeGreaterThanOrEqual(44);
  const first=page.locator('[data-drawer-tab="tab-datos"]');await first.focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-drawer-tab="tab-chat"]')).toBeFocused();await expect(page.locator('#tab-chat')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#drawerOverlay')).toBeHidden();
 });
 for(const viewport of [{width:320,height:568},{width:844,height:390}])test('pantallas compactas '+viewport.width+'x'+viewport.height+' mantienen panel y cierre accesibles',async({page})=>{
  await page.setViewportSize(viewport);await openMobileProfile(page);
  for(const tab of ['datos','docs','chat']){
   await page.locator('[data-drawer-tab="tab-'+tab+'"]').tap();
   expect(await page.locator('#tab-'+tab).evaluate(el=>el.clientHeight<=el.parentElement.clientHeight+1)).toBe(true);
   await expect(page.locator('#closeDrawerBtn')).toBeInViewport();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#closeDrawerBtn').tap();await expect(page.locator('#drawerOverlay')).toBeHidden();
 });
 test('navega por los modulos desde el menu tactil sin clics forzados',async({page})=>{
  await openMobileProfile(page);await page.locator('#closeDrawerBtn').tap();
  for(const section of ['inventario','marketing','pipeline','citas','analiticas','ventas','configuracion']){
   await page.locator('#openSidebar').tap();
   await page.locator('[data-section="section-'+section+'"]').tap();
   await expect(page.locator('#section-'+section)).toBeVisible();await expect(page.locator('#overlay')).toBeHidden();
   await expect.poll(()=>page.locator('#sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
  }
 });
});
