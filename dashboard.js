// ============================================================
// PROJECT 360 - dashboard.js (DARK MODE PREMIUM + PIPELINE + AGENTE IA)
// SPA: registro / login / dashboard / whatsapp multi-tenant
// ============================================================

// ============================================================
// 🛡️ POLÍTICA DE LLAVES — Regla de Oro
// Esta constante SOLO debe contener la llave pública "anon" /
// "publishable" de Supabase (prefijo sb_publishable_ o el JWT
// anon clásico). Esta llave está diseñada para vivir en el
// cliente: por sí sola NO concede ningún acceso — el acceso real
// lo controlan las políticas de Row Level Security (RLS) en
// Postgres, evaluadas en el servidor de Supabase en cada query.
//
// NUNCA pegues aquí ni en ningún otro archivo de /public:
//   - La Service Role Key de Supabase (bypassa RLS por completo)
//   - Tokens de acceso de Meta Graph API / TikTok Content API
//   - API Keys de Gemini u otros proveedores de IA
// Esas llaves viven EXCLUSIVAMENTE del lado servidor: en tus
// workflows de n8n Cloud o en variables de entorno de Railway.
// El navegador jamás debe poder leerlas.
// ============================================================
const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

const N8N_MARKETING_WEBHOOK_URL = '';
const N8N_PUBLISH_WEBHOOK_URL = 'https://n8n-production-97a4.up.railway.app/webhook/publicar-redes';
const N8N_QR_WEBHOOK_URL = 'https://n8n-production-97a4.up.railway.app/webhook/whatsapp-qr';
const N8N_REDES_WEBHOOK_URL = 'https://n8n-production-97a4.up.railway.app/webhook/redes-conectar';
const N8N_VERIFICAR_PUBLICACION_URL = 'https://n8n-production-97a4.up.railway.app/webhook/verificar-publicacion';
// FIX #4 eliminado: N8N_VERIFY_PUBLISH_WEBHOOK_URL era código muerto — removido.

const STRIPE_TEST_MODE = window.VELODRIVE_STRIPE_TEST_MODE === true;
const STRIPE_LIVE_QA_MODE = window.VELODRIVE_STRIPE_LIVE_QA_MODE === true;
const STRIPE_LIVE_LINK = 'https://buy.stripe.com/9B614p0ydcVXa3Y1Bb3oA06';
const STRIPE_TEST_LINK = 'https://buy.stripe.com/test_6oU5kFft7f452Bw0x73oA00';
const STRIPE_LIVE_QA_LINK = 'https://buy.stripe.com/fZu8wRbcR09b0to93D3oA07';
const STRIPE_LINK = STRIPE_TEST_MODE ? STRIPE_TEST_LINK : STRIPE_LIVE_QA_MODE ? STRIPE_LIVE_QA_LINK : STRIPE_LIVE_LINK;
const PRECIO_PLAN_MXN = STRIPE_TEST_MODE || STRIPE_LIVE_QA_MODE ? 10 : (Number(window.VELODRIVE_PLAN_PRICE_MXN) || 10000);
const LEGAL_VERSION = '2026-10-03-v2';
const LEGAL_EFFECTIVE_DATE = '3 de octubre de 2026';
if (STRIPE_TEST_MODE) document.getElementById('stripeTestBanner')?.classList.remove('hidden');
if (STRIPE_LIVE_QA_MODE) document.getElementById('stripeLiveQABanner')?.classList.remove('hidden');
let actionToastTimer = null;
function showActionToast(message, state = 'success') {
  const toast = document.getElementById('actionToast');
  if (!toast) return;
  toast.textContent = message;
  toast.setAttribute('role', state === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
  toast.dataset.state = state;
  toast.style.borderColor = state === 'error' ? 'var(--danger)' : 'var(--success)';
  toast.classList.remove('hidden');
  if (actionToastTimer) clearTimeout(actionToastTimer);
  actionToastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
}
let checkoutPending = false;
async function redirigirAStripeCheckout(lote) {
  if (checkoutPending) return;
  checkoutPending = true;
  const finish = window.VeloDriveUI.beginSubmit(document.getElementById('subscriptionPayBtn'), null, 'Preparando pago…');
  try {
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('La cuenta está creada. Inicia sesión para continuar con el pago.');
    const response = await sessionRequests.fetch('/api/stripe-checkout-link', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lote_id: lote.id, qa: STRIPE_LIVE_QA_MODE, test: STRIPE_TEST_MODE }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'No se pudo preparar el pago. Intenta de nuevo.');
    if (currentLote?.id !== lote.id) throw new Error('Tu sesión cambió. Vuelve a iniciar sesión.');
    const url = new URL(result.url);
    if (!['https://buy.stripe.com', 'https://checkout.stripe.com'].includes(url.origin) || url.username || url.password) {
      throw new Error('El enlace de pago no es válido.');
    }
    window.location.href = url.toString();
  } finally {
    checkoutPending = false;
    finish?.();
  }
}

const PLACEHOLDER_IMG = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22400%22%20height%3D%22250%22%20viewBox%3D%220%200%20400%20250%22%3E%3Crect%20width%3D%22400%22%20height%3D%22250%22%20fill%3D%22%2320242F%22/%3E%3Ctext%20x%3D%22200%22%20y%3D%22125%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2216%22%20fill%3D%22%239CA3AF%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20foto%3C%2Ftext%3E%3C%2Fsvg%3E';

// Variables de Control Global
let currentUser = null;
let currentLote = null;
const syncScheduler = window.VeloDriveUI.createRefreshScheduler({
  run: () => fetchAndRenderAll(),
  canRun: () => Boolean(currentUser && currentLote && !document.hidden && navigator.onLine),
  intervalMs: 10000
});
let passwordRecoveryActive = false;
let directPasswordChange = false;

let leadsCache = [];
let carsCache = [];
let salesRefreshRequired = false;
let carsReadGeneration = 0;
let carsReadCommitted = 0;
let activeSaleCarId = null;
let saleReturnFocus = null;
let citasCache = [];
let citasCalendarioMes = new Date();
let citasDiaSeleccionado = null;
let editingCarId = null;
let activeLeadId = null;
let drawerGeneration = 0;
let drawerReturnFocus = null;
let handoffActionPending = false;
let carImageUrls = [];
let carEditorVersion = 0;

let marketingSelectedCarId = null;
let marketingImageUrls = [];
let marketingUploadPending = false;
let socialActionPending = false;

let catalogModeActive = false;
let tenantContextVersion = 0;
const sessionRequests = window.VeloDriveUI.createRequestScope(window.fetch.bind(window));
const privateReads = window.VeloDriveUI.createRequestScope((input, options) => sessionRequests.fetch(input, options), 20000);
const CATALOG_CAR_COLUMNS = 'id,lote_id,brand,model,year,price,status,image_url,image_urls,caracteristicas,enganche_minimo,kilometraje,transmision';
function captureTenantContext() { return { version: tenantContextVersion, loteId: currentLote?.id, catalog: catalogModeActive }; }
function isCurrentTenantContext(context) {
  return context.version === tenantContextVersion && context.loteId === currentLote?.id && context.catalog === catalogModeActive;
}
function clearTenantContext() {
  drawerGeneration += 1;
  closeDrawer();
  for(const id of ['crmLeadIdDisplay','drawerNombre','drawerTelefono','crmAvatarInitials','drawerStatus','drawerFechaCita','drawerInteres','drawerUltimoMensaje','drawerNotas','drawerEnganche','drawerSituacion','crmChatHistoryContainer','drawerExpedienteDocs','crmAiHandoffStatus','drawerLoadStatus'])document.getElementById(id)?.replaceChildren();
  drawerReturnFocus = null;
  tenantContextVersion += 1;
  sessionRequests.reset();
  privateReads.reset();
  stopSync();
  detenerEsperaWhatsapp();
  currentUser = null; currentLote = null;
  leadsCache = []; carsCache = []; citasCache = [];
  salesRefreshRequired=false;
  carsReadGeneration+=1;carsReadCommitted=0;
  activeSaleCarId = null; activeLeadId = null; editingCarId = null;
  saleReturnFocus = null;
  carImageUrls = []; marketingSelectedCarId = null; marketingImageUrls = [];
  whatsappQrExpires = 0; whatsappQrLoteId = null;
  catalogModeActive = false;
  document.body.classList.remove('catalog-mode');
  showView('view-login');
  document.getElementById('view-dashboard')?.replaceChildren();
}
function leaveTenantSession() {
  clearTenantContext();
  // A new document discards old event closures, DOM, widgets and credentials.
  window.location.replace(window.location.pathname);
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: (input, options = {}) => {
    const url = typeof input === 'string' ? input : input.url || String(input);
    if (url.includes('/auth/v1/')) return window.fetch(input, options);
    return (String(options.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase() === 'GET' ? privateReads : sessionRequests).fetch(input, options);
  } },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.sessionStorage,
    storageKey: 'p360-auth-session',
    detectSessionInUrl: true
  }
});

const fetchTenantWebhook = window.VeloDriveUI.createTenantWebhookClient({
  getTenant: () => currentLote,
  loadToken: async (id) => {
    const { data, error } = await supabaseClient.from('lotes').select('webhook_token').eq('id', id).single();
    if (error || !data?.webhook_token) throw new Error('No se pudo renovar la conexión. Revisa tu sesión e inténtalo de nuevo.');
    return data.webhook_token;
  },
  fetch: (url, options) => sessionRequests.fetch(url, options)
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session?.user?.id && currentUser?.id && session.user.id !== currentUser.id) { leaveTenantSession(); return; }
  if (event === 'PASSWORD_RECOVERY') {
    passwordRecoveryActive = true;
    directPasswordChange = false;
    prepararCambioPassword();
    showView('view-password-recovery');
    return;
  }
  if (event === 'SIGNED_OUT' || (!session && currentUser)) leaveTenantSession();
});

function showView(viewId) {
  const displayMap = {
    'view-registro':  'flex',
    'view-login':     'flex',
    'view-dashboard': 'flex',
    'view-password-recovery': 'flex'
  };
  ['view-registro', 'view-login', 'view-dashboard', 'view-password-recovery'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.add('hidden');
    }
  });
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove('hidden');
    target.style.display = displayMap[viewId] || 'block';
    console.log('[Router] Mostrando vista:', viewId);
  }
}

function stopSync() {
  syncScheduler.stop();
}

function startSync() {
  stopSync();
  void syncScheduler.start();
  checarEstatusWhatsApp();
}

function setSyncStatus(message, state = 'idle') {
  const status = document.getElementById('dashboardSyncStatus');
  if (!status) return;
  if(state!=='error'){status.textContent='';status.dataset.state=state;status.classList.add('hidden');return;}
  status.classList.remove('hidden');
  if (status.textContent === message && status.dataset.state === state) return;
  status.textContent = message;
  status.dataset.state = state;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopSync();
  else if (currentLote) void syncScheduler.start();
});
window.addEventListener('offline', () => {
  stopSync();
  setSyncStatus('Sin conexión. Los datos pueden estar desactualizados.', 'error');
});
window.addEventListener('online', () => { if (currentLote) void syncScheduler.start(); });

async function fetchAndRenderAll() {
  if (!currentUser || !currentLote) {
    stopSync();
    return;
  }
  const context = captureTenantContext();
  setSyncStatus('Actualizando datos…', 'loading');
  try {
    const results = await Promise.all(catalogModeActive ? [fetchCars()] : [fetchLeads(), fetchCars(), fetchCitasReal()]);
    if (!isCurrentTenantContext(context)) return;
    if (activeLeadId && !catalogModeActive) {
      await refreshChatLive(activeLeadId);
    }
    if (!isCurrentTenantContext(context)) return;
    setSyncStatus(results.some(value => value === false)
      ? 'No se actualizaron todos los datos. Revisa tu conexión.'
      : 'Datos actualizados.', results.some(value => value === false) ? 'error' : 'success');
  } catch (err) {
    if (isCurrentTenantContext(context)) setSyncStatus('No se pudo actualizar. Revisa tu conexión.', 'error');
  }
}

// ------------------------------------------------------------
// SECCIÓN LEADS
// ------------------------------------------------------------
async function fetchLeads() {
  if (!currentLote || catalogModeActive) return;
  const context = captureTenantContext();
  const { data, error } = await supabaseClient
    .from('leads')
    .select('*')
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: false });

  if (!isCurrentTenantContext(context)) return;
  if (error) {
    console.error('[Leads Engine] Error de consulta:', error);
    return false;
  }
  leadsCache = data || [];
  renderLeadsTable();
  renderCounters();
  procesarMetricasBI();
  renderPipelineKanban();
  calcularOportunidadesRescatadas();
  return true;
}

function calcularOportunidadesRescatadas() {
  const leadsCountEl = document.getElementById('rescueLeadsCount');
  const valorEl = document.getElementById('rescueValorPotencial');
  if (!leadsCountEl || !valorEl) return;

  const leadsMadrugada = leadsCache.filter(lead => {
    if (!lead.created_at) return false;
    const horaMx = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', hour12: false, timeZone: 'America/Mexico_City' }).format(parseFechaMx(lead.created_at));
    const hora = parseInt(horaMx, 10);
    return hora >= 0 && hora < 6;
  });

  let valorPotencial = 0;
  leadsMadrugada.forEach(lead => {
    const interes = String(lead.auto_interes || lead.auto_sugerido || '').toLowerCase().trim();
    if (!interes || interes === 'general') return;

    const carMatch = carsCache.find(car => {
      const nombreCar = `${car.brand || ''} ${car.model || ''}`.trim().toLowerCase();
      return nombreCar && (interes.includes(nombreCar) || nombreCar.includes(interes));
    });

    if (carMatch) valorPotencial += Number(carMatch.price) || 0;
  });

  leadsCountEl.textContent = leadsMadrugada.length;
  valorEl.textContent = formatCurrency(valorPotencial);
}

// ------------------------------------------------------------
// SECCIÓN CITAS
// ------------------------------------------------------------
async function fetchCitasReal() {
  if (!currentLote || catalogModeActive) return;
  const context = captureTenantContext();
  // FIX: solo traer citas de hoy en adelante — las pasadas no deben aparecer
  const hoy = claveDiaMx(new Date());
  const { data, error } = await supabaseClient
    .from('citas')
    .select('*')
    .eq('lote_id', currentLote.id)
    .gte('fecha_cita', hoy)
    .order('fecha_cita', { ascending: true });

  if (!isCurrentTenantContext(context)) return;
  if (error) {
    console.error('[Citas Engine] Error de consulta a tabla citas:', error);
    return false;
  }
  citasCache = data || [];
  const hoyClave = claveDiaMx(new Date());
  if (!citasDiaSeleccionado || (citasDiaSeleccionado !== 'ALL' && citasDiaSeleccionado < hoyClave)) {
    citasDiaSeleccionado = hoyClave;
  }
  if (citasDiaSeleccionado === 'ALL') {
    renderCitasCronologicas();
  } else {
    renderCitasDelDia(citasDiaSeleccionado);
  }
  renderCitasCalendario();
  renderCounters();
  renderPipelineKanban();
  return true;
}

function renderCounters() {
  const leadsCountEl = document.getElementById('leadsCount');
  const citasCountEl = document.getElementById('citasCount');
  const citasBadgeEl = document.getElementById('citasBadge');

  const totalLeads = leadsCache.length;
  const totalCitas = citasCache.length;

  if (leadsCountEl) leadsCountEl.textContent = totalLeads;
  if (citasCountEl) citasCountEl.textContent = totalCitas;

  if (citasBadgeEl) {
    if (totalCitas > 0) {
      citasBadgeEl.textContent = totalCitas;
      citasBadgeEl.classList.remove('hidden');
    } else {
      citasBadgeEl.classList.add('hidden');
    }
  }
}

function renderLeadsTable() {
  const container = document.getElementById('leadsGroupedContainer');
  if (!container) return;

  if (leadsCache.length === 0) {
    container.innerHTML = '<div class="card p-8 text-center text-xs text-[#9CA3AF]">Sin prospectos calificados registrados en este lote.</div>';
    return;
  }

  const hoyClave   = claveDiaMx(new Date());
  const ayerClave  = claveDiaMx(new Date(Date.now() - 86400000));

  const diasMap = {};
  const leadsOrdenados = [...leadsCache].sort((a, b) =>
    new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );

  leadsOrdenados.forEach(lead => {
    const fecha = lead.created_at ? parseFechaMx(lead.created_at) : new Date();
    const clave = claveDiaMx(fecha);
    if (!diasMap[clave]) diasMap[clave] = [];
    diasMap[clave].push(lead);
  });

  function labelDia(clave) {
    if (clave === hoyClave)  return '🟢 Hoy';
    if (clave === ayerClave) return '🕐 Ayer';
    const [y, m, d] = clave.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12))
      .toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  const diasOrdenados = Object.keys(diasMap).sort((a, b) => b.localeCompare(a));

  container.innerHTML = diasOrdenados.map(clave => {
    const leadsDelDia = diasMap[clave];
    const label = labelDia(clave);
    const esHoy = clave === hoyClave;

    const filaHTML = lead => {
      const tieneDocumentos = lead.url_ine || lead.url_comprobante_domicilio || lead.url_comprobante_ingresos;
      const badgeDocs = tieneDocumentos ? `<span class="badge badge-success ml-1">📎 Docs</span>` : '';
      return `
        <tr class="hover:bg-[#1C202A] transition">
          <td class="px-4 py-3 font-semibold text-sm">
            <div class="flex items-center flex-wrap gap-1">
              <span>${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</span>
              ${badgeDocs}
            </div>
          </td>
          <td class="px-4 py-3 text-xs text-[#6B7280] font-mono privacy-sensitive">${catalogModeActive ? CATALOG_REDACTED : escapeHtml(lead.phone_number || lead.telefono || '—')}</td>
          <td class="px-4 py-3 text-sm font-medium" style="color: var(--cold);">${escapeHtml(lead.auto_interes || 'General')}</td>
          <td class="px-4 py-3"><span class="badge ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Calificado')}</span></td>
          <td class="px-4 py-3 text-right">
            <button data-lead-id="${escapeHtml(lead.id)}" class="btn-ver-perfil text-[11px] btn-primary px-2.5 py-1.5 rounded-lg font-medium cursor-pointer">Ver Perfil</button>
          </td>
        </tr>`;
    };

    const tarjetaHTML = lead => {
      const tieneDocumentos = lead.url_ine || lead.url_comprobante_domicilio || lead.url_comprobante_ingresos;
      return `
        <div class="card p-4 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-semibold text-sm truncate">${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</p>
              <p class="text-xs text-[#6B7280] font-mono mt-0.5 privacy-sensitive">${catalogModeActive ? CATALOG_REDACTED : escapeHtml(lead.phone_number || lead.telefono || '—')}</p>
            </div>
            <span class="badge ${statusBadgeClass(lead.status)} flex-shrink-0">${escapeHtml(lead.status || 'Calificado')}</span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-sm font-medium" style="color: var(--cold);">${escapeHtml(lead.auto_interes || 'General')}</span>
            ${tieneDocumentos ? `<span class="badge badge-success">📎 Docs</span>` : ''}
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-[#272A30]">
            <button data-lead-id="${escapeHtml(lead.id)}" class="btn-ver-perfil text-[11px] btn-primary px-3 py-1.5 rounded-lg font-medium cursor-pointer">Ver Perfil</button>
          </div>
        </div>`;
    };

    return `
      <div class="space-y-2.5">
        <div class="flex items-center gap-2">
          <div class="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border inline-flex items-center gap-2
            ${esHoy ? 'text-[#F5F5F4] border-[var(--amber)] bg-[var(--amber-soft)]' : 'text-[#6B7280] border-[#272A30] bg-[#161922]'}">
            ${label}
          </div>
          <span class="text-[10px] text-[#6B7280]">${leadsDelDia.length} prospecto${leadsDelDia.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="card p-2 hidden md:block">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead>
                <tr class="text-[#9CA3AF] border-b border-[#272A30] text-xs uppercase font-semibold">
                  <th class="px-4 py-3">Nombre</th>
                  <th class="px-4 py-3">Teléfono</th>
                  <th class="px-4 py-3">Auto de Interés</th>
                  <th class="px-4 py-3">Estatus</th>
                  <th class="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#20242F] text-[#F5F5F4]">
                ${leadsDelDia.map(filaHTML).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="space-y-2 md:hidden">
          ${leadsDelDia.map(tarjetaHTML).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-ver-perfil').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.getAttribute('data-lead-id')));
  });
}

// ------------------------------------------------------------
// PIPELINE KANBAN
// ------------------------------------------------------------
function getLeadTemperature(lead) {
  if (lead.temperatura) {
    const t = String(lead.temperatura).toLowerCase();
    if (t.includes('cali') || t.includes('hot')) return 'caliente';
    if (t.includes('temp') || t.includes('warm')) return 'templado';
    if (t.includes('fri') || t.includes('cold')) return 'frio';
  }

  if (lead.status === 'Completado') return 'caliente';

  const telefonoLead = String(lead.phone_number || lead.telefono || '');
  const tieneCitaActiva = citasCache.some(c => String(c.telefono) === telefonoLead && c.estado_lead !== 'Cancelada');
  if (tieneCitaActiva) return 'caliente';

  if (['Esperando_INE', 'Esperando_Domicilio', 'Esperando_Ingresos'].includes(lead.status)) return 'templado';
  if (lead.status === 'Calificado' && lead.enganche) return 'templado';
  if (lead.status === 'Descartado') return 'frio';

  return 'frio';
}

function renderPipelineKanban() {
  const contCaliente = document.getElementById('kanbanCaliente');
  const contTemplado = document.getElementById('kanbanTemplado');
  const contFrio = document.getElementById('kanbanFrio');
  if (!contCaliente || !contTemplado || !contFrio) return;

  const grupos = { caliente: [], templado: [], frio: [] };
  leadsCache.forEach(lead => grupos[getLeadTemperature(lead)].push(lead));

  document.getElementById('kanbanCalienteCount').textContent = grupos.caliente.length;
  document.getElementById('kanbanTempladoCount').textContent = grupos.templado.length;
  document.getElementById('kanbanFrioCount').textContent = grupos.frio.length;

  const renderCard = (lead, tempClass) => {
    const iniciales = (lead.nombre || 'P W').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    return `
      <div data-lead-id="${escapeHtml(lead.id)}" class="btn-kanban-card kanban-card ${tempClass} p-3 cursor-pointer">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-[#20242F] flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0">${escapeHtml(iniciales)}</div>
            <div class="min-w-0">
              <p class="text-xs font-semibold truncate">${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</p>
              <p class="text-[10px] text-[#9CA3AF] font-mono truncate privacy-sensitive">${catalogModeActive ? CATALOG_REDACTED : escapeHtml(lead.phone_number || lead.telefono || 'Sin número')}</p>
            </div>
          </div>
        </div>
        <p class="text-[11px] mt-2 truncate" style="color: var(--cold);">${escapeHtml(lead.auto_interes || 'General')}</p>
      </div>
    `;
  };

  const emptyMsg = '<p class="empty-state-mini">Sin prospectos en esta etapa.</p>';

  contCaliente.innerHTML = grupos.caliente.length ? grupos.caliente.map(l => renderCard(l, 'temp-caliente')).join('') : emptyMsg;
  contTemplado.innerHTML = grupos.templado.length ? grupos.templado.map(l => renderCard(l, 'temp-templado')).join('') : emptyMsg;
  contFrio.innerHTML = grupos.frio.length ? grupos.frio.map(l => renderCard(l, 'temp-frio')).join('') : emptyMsg;

  document.querySelectorAll('.btn-kanban-card').forEach(card => {
    card.addEventListener('click', () => openDrawer(card.getAttribute('data-lead-id')));
  });
}

// ------------------------------------------------------------
// BUSINESS INTELLIGENCE
// ------------------------------------------------------------
function procesarMetricasBI() {
  const tasaConversionEl = document.getElementById('biTasaConversion');
  const sinIngresosEl = document.getElementById('biSinIngresosRate');
  const embudoEl = document.getElementById('biEmbudo');
  const actividadEl = document.getElementById('biActividad');

  const totalLeads = leadsCache.length;
  if (totalLeads === 0) {
    if (embudoEl) embudoEl.innerHTML = '<p class="text-xs text-[#9CA3AF] italic">Esperando recolección de leads...</p>';
    if (actividadEl) actividadEl.innerHTML = '<p class="text-xs text-[#9CA3AF] italic">Sin actividad aún.</p>';
    return;
  }

  const totalCitas = citasCache.length;
  if (tasaConversionEl) tasaConversionEl.textContent = `${((totalCitas / totalLeads) * 100).toFixed(1)}%`;

  const sinIngresosCount = leadsCache.filter(l => String(l.situacion_laboral) === '3' || String(l.situacion_laboral).toLowerCase().includes('no compruebo')).length;
  if (sinIngresosEl) sinIngresosEl.textContent = `${((sinIngresosCount / totalLeads) * 100).toFixed(1)}%`;

  // Embudo de calificación por estatus
  if (embudoEl) {
    const conteo = {};
    leadsCache.forEach(l => { const s = l.status || 'Sin estatus'; conteo[s] = (conteo[s] || 0) + 1; });
    embudoEl.innerHTML = Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .map(([estatus, count]) => `
        <div class="flex items-center justify-between text-xs bg-[var(--surface-2)] p-2.5 rounded-lg">
          <span class="badge ${statusBadgeClass(estatus)}">${escapeHtml(estatus)}</span>
          <span class="font-bold text-[#F5F5F4]">${count} lead${count !== 1 ? 's' : ''}</span>
        </div>
      `).join('');
  }

  // Actividad reciente
  if (actividadEl) {
    const hace24h   = new Date(Date.now() - 86400000);
    const recientes = leadsCache.filter(l => l.created_at && parseFechaMx(l.created_at) > hace24h).length;
    const citasHoy  = citasCache.filter(c => c.fecha_cita === claveDiaMx(new Date())).length;
    const completos = leadsCache.filter(l => l.url_ine && l.url_comprobante_domicilio && l.url_comprobante_ingresos).length;
    const sinCita   = leadsCache.filter(l => !l.fecha_cita && l.status !== 'Descartado').length;
    actividadEl.innerHTML = [
      ['Leads últimas 24h', recientes],
      ['Citas agendadas hoy', citasHoy],
      ['Expedientes completos', completos],
      ['Leads sin cita aún', sinCita]
    ].map(([label, val]) => `
      <div class="flex justify-between items-center bg-[var(--surface-2)] p-2.5 rounded-lg text-xs">
        <span class="text-[#9CA3AF]">${label}</span>
        <span class="font-bold text-[#F5F5F4]">${val}</span>
      </div>
    `).join('');
  }
}

// ------------------------------------------------------------
// CITAS — CALENDARIO Y VISTAS
// ------------------------------------------------------------
function claveDiaMx(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

function renderCitaCardHTML(cita) {
  const horaVisual = cita.hora_cita ? cita.hora_cita.slice(0, 5) : '12:00';
  const esCancelada = cita.estado_lead === 'Cancelada';

  const claseContenedor = esCancelada ? 'opacity-60' : 'card-hover';
  const claseTextoNombre = esCancelada ? 'text-[#9CA3AF] line-through' : 'text-[#F5F5F4]';

  const botonAccion = esCancelada
    ? `<button data-cita-id="${escapeHtml(cita.id)}" data-action="delete" class="btn-gestion-cita btn-ghost p-1.5 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0" title="Limpiar del historial">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
       </button>`
    : `<button data-cita-id="${escapeHtml(cita.id)}" data-action="cancel" class="btn-gestion-cita p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition flex-shrink-0" style="background: var(--danger-soft); color: var(--danger); border: 1px solid rgba(229,87,63,0.25);" title="Marcar como Cancelada">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
       </button>`;

  const indicadorEstatus = esCancelada
    ? `<span class="badge badge-danger">❌ Cancelada por IA</span>`
    : `<span class="badge badge-cold">${horaVisual} hrs</span>`;

  return `
    <div class="flex items-center justify-between gap-3 p-3 card ${claseContenedor}">
      <div class="min-w-0">
        <p class="font-semibold text-sm ${claseTextoNombre} truncate">${escapeHtml(cita.nombre_cliente || 'Cliente Patio')}</p>
        <p class="text-xs text-[#9CA3AF] font-mono privacy-sensitive truncate">Tel: ${catalogModeActive ? CATALOG_REDACTED : escapeHtml(cita.telefono || 'Sin número')} • Interés: <span style="color: var(--cold);" class="font-medium">${escapeHtml(cita.auto_interes || 'General')}</span></p>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        ${indicadorEstatus}
        ${botonAccion}
      </div>
    </div>
  `;
}

function activarBotonesGestionCita(scopeEl) {
  scopeEl.querySelectorAll('.btn-gestion-cita').forEach(btn => {
    btn.addEventListener('click', async () => {
      const citaId = btn.getAttribute('data-cita-id');
      const accion = btn.getAttribute('data-action');

      if (accion === 'cancel') {
        if (!confirm('¿Deseas marcar esta cita como Cancelada manualmente? Esto liberará el horario de forma inmediata.')) return;
        const { error } = await supabaseClient.from('citas').update({ estado_lead: 'Cancelada' }).eq('id', citaId).eq('lote_id', currentLote.id);
        if (error) return alert('Error al actualizar estatus.');
      } else {
        if (!confirm('¿Deseas eliminar definitivamente este registro histórico de la pantalla?')) return;
        const { error } = await supabaseClient.from('citas').delete().eq('id', citaId).eq('lote_id', currentLote.id);
        if (error) return alert('Error al eliminar registro.');
      }
      await fetchCitasReal();
    });
  });
}

function renderCitasCronologicas() {
  const container = document.getElementById('citasListContainer');
  const label = document.getElementById('citasDiaSeleccionadoLabel');
  if (!container) return;
  if (label) label.textContent = 'Todas las Citas';

  const citas = citasCache;

  if (citas.length === 0) {
    container.innerHTML = '<p class="text-xs text-[#9CA3AF] p-4 text-center">No hay citas de clientes agendadas en el patio.</p>';
    return;
  }

  const citasAgrupadas = {};
  citas.forEach(cita => {
    if (!cita.fecha_cita) return;
    const fechaObj = new Date(cita.fecha_cita + 'T00:00:00');
    const diaTexto = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
    if (!citasAgrupadas[diaTexto]) citasAgrupadas[diaTexto] = [];
    citasAgrupadas[diaTexto].push(cita);
  });

  container.innerHTML = Object.keys(citasAgrupadas).map(dia => `
    <div class="space-y-2">
      <div class="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider bg-[#161922] px-3 py-1.5 rounded-md border border-[#272A30]">${dia}</div>
      <div class="grid grid-cols-1 gap-2 pl-1">
        ${citasAgrupadas[dia].map(renderCitaCardHTML).join('')}
      </div>
    </div>
  `).join('');

  activarBotonesGestionCita(container);
}

function renderCitasDelDia(diaClave) {
  const container = document.getElementById('citasListContainer');
  const label = document.getElementById('citasDiaSeleccionadoLabel');
  if (!container) return;

  citasDiaSeleccionado = diaClave;

  const [y, m, d] = diaClave.split('-').map(Number);
  const hoyClave = claveDiaMx(new Date());
  const fechaLabel = diaClave === hoyClave
    ? 'Hoy'
    : new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (label) label.textContent = `Citas del ${fechaLabel}`;

  const citasDelDia = citasCache.filter(c => c.fecha_cita === diaClave);

  if (citasDelDia.length === 0) {
    container.innerHTML = '<p class="text-xs text-[#9CA3AF] p-4 text-center">No hay citas agendadas para este día.</p>';
  } else {
    container.innerHTML = `<div class="grid grid-cols-1 gap-2">${citasDelDia.map(renderCitaCardHTML).join('')}</div>`;
    activarBotonesGestionCita(container);
  }

  renderCitasCalendario();
}

function renderCitasCalendario() {
  const grid = document.getElementById('citasCalendarGrid');
  const label = document.getElementById('citasCalendarioMesLabel');
  if (!grid) return;

  const year  = citasCalendarioMes.getFullYear();
  const month = citasCalendarioMes.getMonth();

  if (label) {
    label.textContent = citasCalendarioMes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  const diasEnMes   = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const hoyClave    = claveDiaMx(new Date());
  const DIAS_CORTOS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

  const conteoPorDia = {};
  citasCache.forEach(c => {
    if (!c.fecha_cita || c.estado_lead === 'Cancelada') return;
    conteoPorDia[c.fecha_cita] = (conteoPorDia[c.fecha_cita] || 0) + 1;
  });

  let html = '';
  for (let dia = 1; dia <= diasEnMes; dia++) {
    const claveDia   = `${year}-${String(month + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const cantidad   = conteoPorDia[claveDia] || 0;
    const esHoy      = claveDia === hoyClave;
    const esSelec    = claveDia === citasDiaSeleccionado;
    const diaSemana  = new Date(Date.UTC(year, month, dia)).getUTCDay();

    let clases = 'relative flex-shrink-0 flex flex-col items-center justify-center gap-0.5 w-10 h-12 rounded-xl cursor-pointer transition text-center select-none';
    if (esSelec) {
      clases += ' btn-primary';
    } else if (esHoy) {
      clases += ' border border-[var(--amber)] text-[#F5F5F4] font-bold';
    } else {
      clases += ' bg-[#1C202A] text-[#9CA3AF] hover:bg-[#272A30]';
    }

    html += `
      <button type="button" data-dia="${claveDia}" class="btn-dia-calendario ${clases}">
        <span class="text-[9px] font-bold uppercase opacity-60">${DIAS_CORTOS[diaSemana]}</span>
        <span class="text-sm font-bold leading-none">${dia}</span>
        ${cantidad > 0
          ? `<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style="background:${esSelec ? '#fff' : 'var(--amber)'};"></span>`
          : ''}
      </button>
    `;
  }

  grid.innerHTML = html;

  requestAnimationFrame(() => {
    const target = grid.querySelector(`[data-dia="${citasDiaSeleccionado}"]`)
                || grid.querySelector(`[data-dia="${hoyClave}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });

  grid.querySelectorAll('.btn-dia-calendario').forEach(btn => {
    btn.addEventListener('click', () => renderCitasDelDia(btn.getAttribute('data-dia')));
  });
}

function initCitasCalendario() {
  const btnAnterior = document.getElementById('citasMesAnterior');
  const btnSiguiente = document.getElementById('citasMesSiguiente');
  const btnVerTodas = document.getElementById('btnVerTodasCitas');

  if (btnAnterior) btnAnterior.addEventListener('click', () => {
    citasCalendarioMes = new Date(Date.UTC(citasCalendarioMes.getFullYear(), citasCalendarioMes.getMonth() - 1, 1));
    renderCitasCalendario();
  });
  if (btnSiguiente) btnSiguiente.addEventListener('click', () => {
    citasCalendarioMes = new Date(Date.UTC(citasCalendarioMes.getFullYear(), citasCalendarioMes.getMonth() + 1, 1));
    renderCitasCalendario();
  });
  if (btnVerTodas) btnVerTodas.addEventListener('click', () => {
    citasDiaSeleccionado = 'ALL';
    renderCitasCronologicas();
    renderCitasCalendario();
  });
}

function statusBadgeClass(status) {
  switch (status) {
    case 'Pendiente': return 'badge-warm';
    case 'Calificado': return 'badge-success';
    case 'Descartado': return 'badge-danger';
    case 'Esperando_INE': return 'badge-cold';
    case 'Esperando_Domicilio': return 'badge-cold';
    case 'Esperando_Ingresos': return 'badge-cold';
    case 'Completado': return 'badge-success';
    default: return 'badge-neutral';
  }
}

// ------------------------------------------------------------
// SECCIÓN INVENTARIO
// ------------------------------------------------------------
async function fetchCars() {
  if(!currentLote)return false;
  const context=captureTenantContext(),generation=++carsReadGeneration;
  let result;
  try{result=await supabaseClient.from('cars').select(context.catalog?CATALOG_CAR_COLUMNS:'*').eq('lote_id',context.loteId).order('created_at',{ascending:false});}
  catch(_){result={error:true};}
  if(!isCurrentTenantContext(context))return false;
  if(generation!==carsReadGeneration)return carsReadCommitted===carsReadGeneration;
  if(result.error){marcarVentasPendientes();return false;}
  if(context.catalog){const allowed=CATALOG_CAR_COLUMNS.split(',');carsCache=(result.data||[]).map(car=>Object.fromEntries(allowed.filter(key=>key in car).map(key=>[key,car[key]])));}
  else carsCache=result.data||[];
  salesRefreshRequired=false;carsReadCommitted=generation;
  renderCars();renderCarsCounter();calcularMetricasInventario();renderVentasMensuales();populateMarketingCarSelect();calcularOportunidadesRescatadas();
  return true;
}

async function fetchInventario() {
  return fetchCars();
}

function renderCarsCounter() {
  const carsCountEl = document.getElementById('carsCount');
  if (carsCountEl) {
    carsCountEl.textContent = carsCache.filter(car => car.status !== 'Vendido').length;
  }
}

function fechaActualLocalISO() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function calcularMetricasInventario() {
  const publicados=document.getElementById('kpiAutosPublicados');
  if(publicados)publicados.textContent=String(carsCache.filter(car=>car.publicado_meta===true).length);
}

function renderCarThumbs() {
  const wrap = document.getElementById('carImageThumbs');
  wrap.innerHTML = carImageUrls.map((url, i) => `
    <div class="car-thumb">
      <img src="${escapeHtml(sanitizeUrl(url, ''))}" alt="foto ${i + 1}">
      <button type="button" data-idx="${i}" class="btn-quitar-thumb">×</button>
    </div>
  `).join('');
  wrap.querySelectorAll('.btn-quitar-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      carImageUrls.splice(Number(btn.getAttribute('data-idx')), 1);
      document.getElementById('carImageUrl').value = carImageUrls[0] || '';
      renderCarThumbs();
    });
  });
}

function calcularSaludInventario(car) {
  // FIX: verificar que hay foto real (no placeholder SVG ni vacío)
  const urlFoto = (Array.isArray(car.image_urls) && car.image_urls[0]) || car.image_url || '';
  const esPlaceholder = !urlFoto
    || urlFoto === PLACEHOLDER_IMG
    || urlFoto.startsWith('data:image/svg')
    || urlFoto.includes('Sin%20foto')
    || urlFoto.includes('Sin foto');
  const tieneFoto = !esPlaceholder;

  const tieneCopy = !!(car.copy_meta && car.copy_meta.trim());
  const publicado = car.publicado_meta === true;

  const items = [
    { label: 'Foto HD', done: tieneFoto },
    { label: 'Copy IA', done: tieneCopy },
    { label: 'Publicado', done: publicado }
  ];
  const completados = items.filter(i => i.done).length;
  const percent = Math.round((completados / items.length) * 100);
  return { percent, items };
}

async function verificarPublicacionReal(carId, requestId, plataforma, btnEl) {
  if (!N8N_VERIFICAR_PUBLICACION_URL) { alert('Falta configurar N8N_VERIFICAR_PUBLICACION_URL en dashboard.js.'); return; }

  const textoOriginal = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = 'Verificando...';

  try {
    const resp = await fetchTenantWebhook(N8N_VERIFICAR_PUBLICACION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ car_id: carId, request_id: requestId, plataforma })
    });
    if (!resp.ok) throw new Error(`Webhook respondió ${resp.status}`);
    const data = await resp.json();

    if (data.publicado === true) {
      btnEl.textContent = '✅ Confirmado';
      btnEl.classList.add('opacity-60');
      btnEl.disabled = true;
    } else if (data.fallo) {
      btnEl.textContent = data.parcial ? '⚠️ Publicación parcial' : '❌ Falló en la plataforma';
      btnEl.disabled = false;
      alert(data.mensaje || 'La publicación falló en una plataforma. Revisa la conexión antes de reintentar.');
    } else {
      btnEl.textContent = `⏳ ${data.status || 'procesando'}`;
      btnEl.disabled = false;
    }
    await fetchCars();
  } catch (err) {
    console.error('[Verificar Publicación] Error:', err);
    btnEl.textContent = textoOriginal;
    btnEl.disabled = false;
    alert('No se pudo verificar el estado. Intenta de nuevo.');
  }
}

function renderCars() {
  const grid = document.getElementById('carsGridContainer');
  if (!grid) return;

  if (carsCache.length === 0) {
    grid.innerHTML = `
      <div class="empty-state col-span-full">
        <div class="empty-state-icon">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <p class="empty-state-title">No hay unidades registradas</p>
        <p class="empty-state-desc">Añade tu primer vehículo para comenzar a construir tu catálogo.</p>
        <button id="btnEmptyAddCar" class="btn-ghost text-xs font-medium px-4 py-2 rounded-lg mt-4">+ Añadir primer vehículo</button>
      </div>
    `;
    const btnEmptyAddCar = document.getElementById('btnEmptyAddCar');
    if (btnEmptyAddCar) btnEmptyAddCar.addEventListener('click', () => document.getElementById('btnAbrirModalCar').click());
    return;
  }

  grid.innerHTML = carsCache.map(car => {
    const shortId = car.id ? String(car.id).slice(-6) : '---';
    const unidadNombre = `${car.brand || ''} ${car.model || ''}`.trim();
    const esVendido = car.status === 'Vendido';

    const estaPublicado = car.publicado_meta === true;
    const dotRedesClass = estaPublicado ? 'status-dot' : 'status-dot status-dot-outline';
    const textoRedes = estaPublicado ? 'Publicado' : 'Pendiente de publicar';

    const dotCatalogClass = car.status === 'Apartado' ? 'status-dot status-dot-outline' : 'status-dot';
    const textoCatalog = car.status === 'Apartado' ? 'Apartado' : 'Disponible';

    const botonEstatus = !esVendido
      ? `<button data-action-id="${escapeHtml(car.id)}" class="btn-marcar-vendido internal-only text-[11px] px-2.5 py-1 rounded-md font-semibold transition" style="background: var(--surface-2); color: var(--text); border: 1px solid var(--border-strong);">Marcar Vendido</button>`
      : `<span class="text-xs text-[#9CA3AF] font-medium italic internal-only">Unidad Entregada</span>`;

    const salud = calcularSaludInventario(car);
    const saludColorClass = salud.percent >= 100 ? 'health-high' : salud.percent >= 50 ? 'health-mid' : 'health-low';

    const totalFotos = Array.isArray(car.image_urls) ? car.image_urls.length : (car.image_url ? 1 : 0);
    const fotoPortadaRaw = (Array.isArray(car.image_urls) && car.image_urls[0]) || car.image_url || PLACEHOLDER_IMG;
    const fotoPortada = sanitizeUrl(fotoPortadaRaw, PLACEHOLDER_IMG);

    return `
      <div class="car-card flex flex-col ${esVendido ? 'status-vendido' : ''}">
        <div class="relative">
          <img src="${escapeHtml(fotoPortada)}" class="car-card-img" alt="${escapeHtml(unidadNombre)}">
          ${totalFotos > 1 ? `<span class="photo-count">${totalFotos} fotos</span>` : ''}
        </div>
        <div class="p-5 flex flex-col gap-2 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-sm truncate">${escapeHtml(unidadNombre || 'Unidad')}</p>
              <div class="flex items-center gap-1.5 mt-1.5 internal-only flex-wrap">
                <span class="${dotRedesClass}"></span>
                <span class="text-[11px] text-[#9CA3AF]">${textoRedes}</span>
                ${car.upload_post_request_id_meta ? `<button data-verify-id="${escapeHtml(car.id)}" data-request-id="${escapeHtml(car.upload_post_request_id_meta)}" data-plataforma="meta" class="btn-verificar-publicacion text-[10px] underline text-[#6B7280] hover:text-[#F5F5F4]">Verificar Meta</button>` : ''}
              </div>
              <div class="flex items-center gap-1.5 mt-1.5 catalog-only">
                <span class="${dotCatalogClass}"></span>
                <span class="text-[11px] text-[#9CA3AF]">${textoCatalog}</span>
              </div>
            </div>
            <button data-edit-id="${escapeHtml(car.id)}" class="btn-editar-car internal-only text-xs opacity-60 hover:opacity-100 transition flex-shrink-0" title="Editar Unidad" aria-label="Editar ${escapeHtml(unidadNombre)}">✏️</button>
            <button data-delete-id="${escapeHtml(car.id)}" data-nombre="${escapeHtml(unidadNombre)}" class="btn-eliminar-car internal-only text-xs opacity-60 hover:opacity-100 transition flex-shrink-0" title="Eliminar Unidad" aria-label="Eliminar ${escapeHtml(unidadNombre)}">🗑️</button>
          </div>

          <p class="text-[11px] text-[#9CA3AF] font-mono">#${shortId} • ${escapeHtml(String(car.year || ''))}</p>
          <p class="text-lg font-bold stat-mono">${formatCurrency(car.price)}</p>
          <p class="catalog-only text-[11px] text-[#6B7280] -mt-1">Financiamiento disponible desde <span class="font-semibold" style="color: var(--text);">${formatCurrency(car.enganche_minimo)}</span></p>

          <div class="internal-only space-y-1.5 pt-1">
            <div class="flex items-center justify-between text-[9px] text-[#9CA3AF] uppercase font-bold tracking-wider">
              <span>Salud de Inventario</span>
              <span>${salud.percent}%</span>
            </div>
            <div class="health-track"><div class="health-fill ${saludColorClass}" style="width:${salud.percent}%"></div></div>
            <div class="health-checklist">
              ${salud.items.map(i => `<span class="health-chip ${i.done ? 'done' : ''}">${i.done ? '✓' : '○'} ${i.label}</span>`).join('')}
            </div>
          </div>

          <div class="flex items-center justify-between mt-auto pt-2 border-t border-[#272A30] internal-only">
            ${botonEstatus}
            <button data-market-id="${escapeHtml(car.id)}" class="btn-promocionar text-[11px] btn-ghost px-2.5 py-1.5 rounded-lg font-medium">✨ Promocionar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.btn-marcar-vendido').forEach(btn => {
    btn.addEventListener('click', () => {
      abrirVenta(btn.getAttribute('data-action-id'));
    });
  });

  grid.querySelectorAll('.btn-editar-car').forEach(btn => {
    btn.addEventListener('click', () => {
      const carId = btn.getAttribute('data-edit-id');
      const car = carsCache.find(c => String(c.id) === String(carId));
      if (!car) return;

      carEditorVersion += 1;
      editingCarId = car.id;

      document.getElementById('carBrand').value = car.brand || '';
      document.getElementById('carModel').value = car.model || '';
      document.getElementById('carYear').value = car.year || '';
      document.getElementById('carPrice').value = car.price || '';
      document.getElementById('carTransmision').value = car.transmision || 'Automática';
      document.getElementById('carKilometraje').value = car.kilometraje || 0;
      document.getElementById('carEnganche').value = car.enganche_minimo || 0;
      document.getElementById('carCaracteristicas').value = car.caracteristicas || '';
      document.getElementById('carStatus').value = car.status || 'Disponible';
      document.getElementById('carStatus').disabled=car.status==='Vendido';
      carImageUrls = Array.isArray(car.image_urls) && car.image_urls.length ? [...car.image_urls] : (car.image_url ? [car.image_url] : []);
      document.getElementById('carImageUrl').value = carImageUrls[0] || '';
      renderCarThumbs();

      document.getElementById('modalCarTitle').textContent = 'Editar Datos de Unidad';
      document.getElementById('btnSubmitCarForm').textContent = 'Actualizar Cambios en Patio';
      document.getElementById('uploadStatusText').textContent = carImageUrls.length ? `${carImageUrls.length} foto(s) activa(s).` : '';

      document.getElementById('modalCarOverlay').classList.remove('hidden');
      document.getElementById('carBrand')?.focus();
    });
  });

  grid.querySelectorAll('.btn-eliminar-car').forEach(btn => {
    btn.addEventListener('click', async () => {
      const carId = btn.getAttribute('data-delete-id');
      const nombre = btn.getAttribute('data-nombre') || 'esta unidad';
      if (!confirm(`¿Eliminar permanentemente "${nombre}" del inventario?\n\nEsta acción no se puede deshacer.`)) return;
      btn.textContent = 'Eliminando…';
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      try {
        const { error } = await supabaseClient.from('cars').delete().eq('id', carId).eq('lote_id', currentLote.id);
        if (error) throw error;
        await fetchCars();
        showActionToast('Vehículo eliminado del inventario.');
      } catch (error) {
        console.error('[Inventario] Error al eliminar unidad:', error);
        showActionToast('No se pudo eliminar la unidad. Revisa tu conexión e inténtalo de nuevo.', 'error');
        btn.textContent = '🗑️';
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    });
  });
  grid.querySelectorAll('.btn-promocionar').forEach(btn => {
    btn.addEventListener('click', () => {
      const carId = btn.getAttribute('data-market-id');
      document.querySelector('[data-section="section-marketing"]').click();
      const select = document.getElementById('marketingCarSelect');
      if (select) {
        select.value = carId;
        select.dispatchEvent(new Event('change'));
      }
    });
  });

  grid.querySelectorAll('.btn-verificar-publicacion').forEach(btn => {
    btn.addEventListener('click', () => verificarPublicacionReal(
      btn.getAttribute('data-verify-id'),
      btn.getAttribute('data-request-id'),
      btn.getAttribute('data-plataforma'),
      btn
    ));
  });
}

function abrirVenta(carId) {
  if (catalogModeActive || document.getElementById('btnGuardarVenta')?.disabled) return;
  const car=carsCache.find(item=>String(item.id)===String(carId));
  if (!car) return;
  activeSaleCarId=car.id;
  saleReturnFocus={node:document.activeElement,carId:String(car.id)};
  document.getElementById('ventaCarNombre').textContent=`${car.brand||''} ${car.model||''} ${car.year||''}`.trim();
  document.getElementById('ventaPrecio').value=Number(car.sold_price)>0?car.sold_price:'';
  const date=document.getElementById('ventaFecha');
  date.max=fechaActualLocalISO();date.value=car.fecha_venta||(car.status==='Vendido'?'':fechaActualLocalISO());
  document.getElementById('ventaStatus').textContent='';
  const modal=document.getElementById('modalVentaOverlay');modal.classList.remove('hidden');modal.classList.add('flex');
  document.getElementById('ventaTitulo').focus();
}

function cerrarVenta(){
  const modal=document.getElementById('modalVentaOverlay');modal?.classList.add('hidden');modal?.classList.remove('flex');activeSaleCarId=null;
  let target=saleReturnFocus?.node;
  if(!target?.isConnected&&saleReturnFocus){
    target=[...document.querySelectorAll('[data-sale-car],[data-action-id],[data-edit-id]')].find(element=>
      element.getClientRects().length&&['data-sale-car','data-action-id','data-edit-id'].some(key=>element.getAttribute(key)===saleReturnFocus.carId));
  }
  (target?.isConnected?target:document.querySelector('[data-section="section-ventas"]'))?.focus();saleReturnFocus=null;
}

function marcarVentasPendientes(){salesRefreshRequired=true;renderVentasMensuales();}

function renderVentasMensuales(){
  const container=document.getElementById('ventasMensualesContainer'),pending=document.getElementById('ventasPendientes');
  if(!container)return;
  if(catalogModeActive){container.textContent='Ventas ocultas en Modo Catálogo.';if(pending)pending.replaceChildren();return;}
  if(salesRefreshRequired){container.textContent='No se pudieron actualizar las ventas. Pulsa Actualizar ventas.';pending?.replaceChildren();return;}
  const select=document.getElementById('ventasYear');
  const years=[...new Set([fechaActualLocalISO().slice(0,4),...carsCache.filter(car=>car.status==='Vendido'&&/^\d{4}-\d{2}-\d{2}$/.test(car.fecha_venta||'')).map(car=>car.fecha_venta.slice(0,4))])].sort().reverse();
  const chosen=select?.value&&years.includes(select.value)?select.value:fechaActualLocalISO().slice(0,4);
  if(select){select.replaceChildren(...years.map(year=>{const option=document.createElement('option');option.value=year;option.textContent=year;return option;}));select.value=chosen;}
  let report;
  try{report=window.VeloDriveFinance.buildSalesReport(carsCache,fechaActualLocalISO(),chosen);}
  catch{container.textContent='No se pudo generar el resumen. Revisa los precios de venta.';pending?.replaceChildren();return;}
  const names=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const carName=car=>escapeHtml(`${car.brand||''} ${car.model||''} ${car.year||''}`.trim());
  const edit=car=>`<button type="button" data-sale-car="${escapeHtml(car.id)}" class="btn-ghost px-3 py-2 rounded-lg text-xs">Editar venta</button>`;
  const months=report.months.filter(month=>month.units>0);
  container.innerHTML=months.length?months.map(month=>`<article class="card p-4 sm:p-5 space-y-4">
    <div class="flex flex-wrap justify-between items-start gap-3"><div><h3 class="font-bold">${names[month.month-1]} ${escapeHtml(chosen)}</h3><p class="text-xs text-[#9CA3AF]">${month.units} ${month.units===1?'vehículo vendido':'vehículos vendidos'}</p></div><p class="font-bold stat-mono">${month.totalCents===null?'Faltan precios de venta':formatCurrency(month.totalCents/100)}</p></div>
    ${month.missingPriceCount?'<p class="action-status">Completa los precios pendientes para conocer el total del mes.</p>':''}
    <div class="space-y-3">${month.cars.map(car=>{const cents=window.VeloDriveFinance.toCents(car.sold_price);return `<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#272A30] pt-3"><div class="min-w-0"><p class="font-semibold text-sm break-words">${carName(car)}</p><p class="text-xs text-[#9CA3AF]">Fecha de venta: ${escapeHtml(car.fecha_venta.split('-').reverse().join('/'))} · Inventario #${escapeHtml(String(car.id).slice(-6))}</p></div><div class="flex items-center justify-between sm:justify-end gap-4"><span class="font-semibold text-sm whitespace-nowrap">${cents>0?formatCurrency(cents/100):'Falta precio real'}</span>${edit(car)}</div></div>`;}).join('')}</div>
    </article>`).join(''):'<p class="text-sm text-[#9CA3AF]">No hay ventas registradas en este año.</p>';
  if(pending)pending.innerHTML=report.undated.length?`<div class="card p-4 space-y-3"><h3 class="font-semibold text-sm">Ventas pendientes de fecha</h3><p class="text-xs text-[#9CA3AF]">Estas ventas no se asignan a un mes hasta registrar una fecha válida.</p>${report.undated.map(car=>`<div class="flex flex-wrap items-center justify-between gap-3"><span class="text-sm">${carName(car)}</span>${edit(car)}</div>`).join('')}</div>`:'';
  for(const root of [container,pending])root?.querySelectorAll('[data-sale-car]').forEach(button=>button.addEventListener('click',()=>abrirVenta(button.dataset.saleCar)));
}

async function handleSaleSubmit(event){
  event.preventDefault();
  const button=document.getElementById('btnGuardarVenta');
  if(button.disabled||!currentLote||catalogModeActive||!activeSaleCarId)return;
  const car=carsCache.find(item=>String(item.id)===String(activeSaleCarId));if(!car)return;
  const context=captureTenantContext(),carId=car.id,status=document.getElementById('ventaStatus');
  let update;
  try{update=window.VeloDriveFinance.prepareSale(document.getElementById('ventaPrecio').value,document.getElementById('ventaFecha').value,fechaActualLocalISO());}
  catch(error){status.setAttribute('role','alert');status.textContent=error.message==='SALE_PRICE_REQUIRED'?'Captura un precio real mayor que cero, con hasta dos decimales.':'Captura una fecha de venta válida, sin elegir un día futuro.';return;}
  if(car.status!=='Vendido'&&!confirm(`¿Confirmas la venta de ${car.brand||''} ${car.model||''} por ${formatCurrency(update.sold_price)}?`)){status.textContent='Venta sin confirmar. No se guardaron cambios.';return;}
  const finish=window.VeloDriveUI.beginSubmit(button,status,'Guardando venta…','Registrando el precio y la fecha de venta…');if(!finish)return;
  let persisted=false;
  try{
    const {data,error}=await supabaseClient.from('cars').update(update).eq('id',carId).eq('lote_id',context.loteId).select('id').single();
    if(error||!data||String(data.id)!==String(carId))throw Error('SALE_SAVE_FAILED');
    persisted=true;if(!isCurrentTenantContext(context))return;
    const fresh=await fetchCars();if(!isCurrentTenantContext(context))return;
    if(!fresh){marcarVentasPendientes();finish('Venta guardada. Actualiza las ventas para ver el resultado; no hace falta registrarla otra vez.','error');return;}
    finish('Venta guardada.','success');showActionToast('Venta registrada.');
    if(String(activeSaleCarId)===String(carId))cerrarVenta();
  }catch(_){
    if(isCurrentTenantContext(context)){
      if(persisted)marcarVentasPendientes();
      finish(persisted?'Venta guardada. Actualiza el listado sin registrarla otra vez.':'No se pudo guardar la venta. Revisa tu conexión.','error');
    }
  }finally{finish();}
}

function populateMarketingCarSelect() {
  const select = document.getElementById('marketingCarSelect');
  if (!select) return;

  const valorPrevio = select.value;
  const carsDisponibles = carsCache.filter(car => car.status !== 'Vendido');

  if (carsDisponibles.length === 0) {
    select.innerHTML = '<option value="">Sin unidades disponibles para promocionar</option>';
    marketingSelectedCarId = null;
    return;
  }

  select.innerHTML = carsDisponibles.map(car =>
    `<option value="${car.id}">${escapeHtml(`${car.brand || ''} ${car.model || ''}`.trim())} · ${escapeHtml(String(car.year || ''))}</option>`
  ).join('');

  if (valorPrevio && carsDisponibles.some(c => String(c.id) === valorPrevio)) {
    select.value = valorPrevio;
  }
  marketingSelectedCarId = select.value;
}

function crearPayloadPublicoAuto(car) {
  if (!car) return null;
  const camposPublicos = ['id', 'lote_id', 'brand', 'model', 'year', 'price', 'image_url', 'image_urls', 'status', 'transmision', 'kilometraje', 'enganche_minimo', 'caracteristicas'];
  return Object.fromEntries(camposPublicos.filter(campo => car[campo] !== undefined).map(campo => [campo, car[campo]]));
}

function generarCopyLocal(car) {
  if (!car) return '';
  const nombre = `${car.brand || ''} ${car.model || ''}`.trim();
  const km = car.kilometraje ? `${Number(car.kilometraje).toLocaleString('es-MX')} km` : 'kilometraje bajo';
  const enganche = car.enganche_minimo ? formatCurrency(car.enganche_minimo) : 'un enganche accesible';
  const estatus = car.status === 'Apartado' ? 'Apartado (consulta disponibilidad)' : 'Disponible ahora';

  return `🚗 ${nombre} ${car.year || ''}\n\n` +
    `Unidad en excelente estado, transmisión ${car.transmision || 'Automática'}, con ${km}.\n\n` +
    `💰 Precio: ${formatCurrency(car.price)}\n` +
    `✅ Entrada desde ${enganche}\n` +
    `📋 Estatus: ${estatus}\n\n` +
    `📲 Escríbenos por WhatsApp y agenda tu cita hoy mismo.`;
}

async function generarCopyIA(car) {
  if (!N8N_MARKETING_WEBHOOK_URL) {
    return generarCopyLocal(car);
  }
  try {
    const resp = await fetchTenantWebhook(N8N_MARKETING_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ car: crearPayloadPublicoAuto(car), lote_id: currentLote.id, image_url: marketingImageUrls[0], image_urls: marketingImageUrls })
    });
    const data = await resp.json();
    return (data && data.copy) ? data.copy : generarCopyLocal(car);
  } catch (err) {
    console.error('[Agente IA] Fallo al llamar webhook n8n, usando copy local:', err);
    return generarCopyLocal(car);
  }
}

function getSelectedPlatforms() {
  const platforms = [];
  if (document.getElementById('platformFacebook').checked) platforms.push('facebook');
  if (document.getElementById('platformInstagram').checked) platforms.push('instagram');
  return platforms;
}

function updateBtnPublicarLabel() {
  const btnPublicar = document.getElementById('btnPublicarRedes');
  if (!btnPublicar || btnPublicar.disabled) return;
  btnPublicar.style.opacity = '0';
  setTimeout(() => { btnPublicar.textContent = '🚀 Publicar con IA en Redes Sociales'; btnPublicar.style.opacity = '1'; }, 120);
}

async function uploadPhotoBatch(files, context, progress) {
  if (!files.length || files.length > 20) throw new Error('Selecciona entre 1 y 20 fotos por subida.');
  const extensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  return window.VeloDriveUI.mapLimited(files, 2, async file => {
    if (!isCurrentTenantContext(context)) throw new Error('TENANT_CHANGED');
    if (!extensions[file.type] || file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('INVALID_IMAGE');
    const filePath = `${context.loteId}/${crypto.randomUUID()}.${extensions[file.type]}`;
    const bucket = supabaseClient.storage.from('car-images');
    const { error } = await bucket.upload(filePath, file);
    if (error) throw new Error('PHOTO_UPLOAD_FAILED');
    if (!isCurrentTenantContext(context)) throw new Error('TENANT_CHANGED');
    return bucket.getPublicUrl(filePath).data.publicUrl;
  }, progress);
}

async function subirMediaMarketing(files) {
  if (!currentLote || marketingUploadPending) return;
  if (document.getElementById('btnGenerarCopy')?.disabled) {
    const status = document.getElementById('marketingStatusText');
    if (status) status.textContent = 'Espera a que termine de generar el texto antes de subir fotos.';
    return;
  }
  const context = captureTenantContext(), selectedCar = marketingSelectedCarId;
  const status = document.getElementById('marketingStatusText');
  const finish = window.VeloDriveUI.beginSubmit(document.getElementById('btnPublicarRedes'), status, 'Subiendo fotos…', 'Preparando las fotos…');
  if (!finish) return;
  marketingUploadPending = true;
  const controls = ['marketingFileInput','marketingCarSelect','btnGenerarCopy'].map(id => document.getElementById(id)).filter(Boolean);
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  try {
    const results = await uploadPhotoBatch(files, context, count => {
      if (isCurrentTenantContext(context)) status.textContent = `Subiendo fotos: ${count} de ${files.length} procesadas…`;
    });
    if (!isCurrentTenantContext(context) || String(selectedCar) !== String(marketingSelectedCarId)) return;
    const urls = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    marketingImageUrls.push(...urls); renderMarketingThumbs();
    const failed = results.length - urls.length;
    finish(failed ? `${urls.length} foto(s) subidas; ${failed} no se pudieron subir. Revisa formato (JPG, PNG o WebP), tamaño máximo de 10 MB y conexión. Reintenta solo las faltantes.` : 'Fotos listas. Puedes generar el texto y publicar.', failed ? 'error' : 'success');
  } catch (error) {
    if (isCurrentTenantContext(context)) finish(error.message === 'PHOTO_UPLOAD_FAILED' ? 'No se pudieron subir las fotos.' : 'Selecciona entre 1 y 20 fotos JPG, PNG o WebP de hasta 10 MB.', 'error');
  } finally {
    finish(); marketingUploadPending = false;
    controls.forEach((control,index) => { control.disabled = disabled[index]; });
  }
}

async function subirFotosVehiculo(event) {
  const input = event.target, files = Array.from(input.files || []);
  if (!currentLote || !files.length || input.disabled) return;
  const context = captureTenantContext(), editorVersion = carEditorVersion;
  const status = document.getElementById('uploadStatusText');
  const finish = window.VeloDriveUI.beginSubmit(document.getElementById('btnSubmitCarForm'), status, 'Subiendo fotos…', 'Preparando fotos del vehículo…');
  if (!finish) return;
  input.disabled = true;
  try {
    const results = await uploadPhotoBatch(files, context, count => {
      if (isCurrentTenantContext(context) && editorVersion === carEditorVersion) status.textContent = `Subiendo fotos: ${count} de ${files.length} procesadas…`;
    });
    if (!isCurrentTenantContext(context) || editorVersion !== carEditorVersion) return;
    const urls = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    carImageUrls.push(...urls);
    const urlInput = document.getElementById('carImageUrl');
    if (urlInput) urlInput.value = carImageUrls[0] || '';
    renderCarThumbs();
    const failed = results.length - urls.length;
    finish(failed ? `${urls.length} foto(s) subidas; ${failed} fallaron. Usa JPG, PNG o WebP de hasta 10 MB. Reintenta solo las faltantes.` : `${urls.length} foto(s) listas. Guarda el vehículo para conservar los cambios.`, failed ? 'error' : 'success');
  } catch (_) {
    if (isCurrentTenantContext(context) && editorVersion === carEditorVersion) finish('No se pudieron subir las fotos. Selecciona entre 1 y 20 imágenes de hasta 10 MB.', 'error');
  } finally { finish(); input.disabled = false; input.value = ''; }
}

function renderMarketingThumbs() {
  const wrap = document.getElementById('marketingImageThumbs');
  wrap.classList.toggle('hidden', marketingImageUrls.length === 0);
  wrap.innerHTML = marketingImageUrls.map((url, i) => `
    <div class="car-thumb">
      <img src="${escapeHtml(sanitizeUrl(url, ''))}" alt="foto ${i + 1}">
      <button type="button" data-idx="${i}" class="btn-quitar-thumb-marketing">×</button>
    </div>
  `).join('');
  wrap.querySelectorAll('.btn-quitar-thumb-marketing').forEach(btn => {
    btn.addEventListener('click', () => {
      marketingImageUrls.splice(Number(btn.getAttribute('data-idx')), 1);
      renderMarketingThumbs();
    });
  });
}

function initMarketingModule() {
  const select = document.getElementById('marketingCarSelect');
  const dropzone = document.getElementById('marketingDropzone');
  const fileInput = document.getElementById('marketingFileInput');
  const btnGenerar = document.getElementById('btnGenerarCopy');
  const btnPublicar = document.getElementById('btnPublicarRedes');
  const copyText = document.getElementById('marketingCopyText');
  const statusText = document.getElementById('marketingStatusText');

  if (!select) return;

  select.addEventListener('change', () => { marketingSelectedCarId = select.value; });

  ['platformFacebook', 'platformInstagram'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => { updateBtnPublicarLabel(); });
  });
  updateBtnPublicarLabel();

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length) { subirMediaMarketing(files); fileInput.value = ''; }
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-active'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag-active'); });
  });
  dropzone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) { subirMediaMarketing(files); }
  });

  btnGenerar.addEventListener('click', async () => {
    if (btnGenerar.disabled || marketingUploadPending || !currentLote) return;
    const car = carsCache.find(c => String(c.id) === String(marketingSelectedCarId));
    if (!car) { alert('Selecciona una unidad del inventario primero.'); return; }

    const context = captureTenantContext();
    const finish = window.VeloDriveUI.beginSubmit(btnGenerar, statusText, 'Generando texto…', 'Preparando el texto del vehículo…');
    if (!finish) return;
    try {
      const copy = await generarCopyIA(car);
      if (!isCurrentTenantContext(context)) return;
      if (String(marketingSelectedCarId) !== String(car.id)) { finish('Seleccionaste otro vehículo. Genera su texto antes de publicar.', 'error'); return; }
      copyText.value = copy;
      finish('Contenido generado. Puedes editarlo antes de publicar.', 'success');
    } catch (_) {
      if (isCurrentTenantContext(context)) finish('No se pudo generar el texto. Intenta de nuevo.', 'error');
    } finally {
      finish();
    }
  });

  btnPublicar.addEventListener('click', async () => {
    if (btnPublicar.disabled || !currentLote) return;
    const car = carsCache.find(c => String(c.id) === String(marketingSelectedCarId));
    if (!car) { alert('Selecciona una unidad del inventario primero.'); return; }

    const platforms = getSelectedPlatforms();
    if (platforms.length === 0) { alert('Selecciona al menos una red social.'); return; }
    if (!copyText.value.trim()) { alert('Genera o escribe un copy antes de publicar.'); return; }
    if (copyText.value.trim().length > 2200) { alert('El texto debe tener hasta 2200 caracteres.'); return; }

    const urls = marketingImageUrls.length ? [...marketingImageUrls] :
      (Array.isArray(car.image_urls) && car.image_urls.length ? [...car.image_urls] : [car.image_url]);
    if (!urls.length || urls.length > 10 || urls.some(url => !url || !String(url).startsWith('https://'))) {
      alert('Agrega de 1 a 10 fotos antes de publicar.'); return;
    }
    const storageKey = `velodrive:publication:${currentLote.id}:${car.id}`;
    const fingerprint = JSON.stringify({ platforms, urls, copy: copyText.value.trim() });
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(storageKey)); } catch (_) {}
    // Conserva la misma clave al reintentar una respuesta perdida del proveedor.
    if (!draft || draft.fingerprint !== fingerprint) draft = { fingerprint, requestId: crypto.randomUUID() };
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch (_) {}

    btnPublicar.disabled = true;
    btnPublicar.setAttribute('aria-busy', 'true');
    statusText.setAttribute('role', 'status');
    statusText.textContent = 'Enviando publicación...';

    try {
      btnPublicar.textContent = 'Publicando...';
      if (!N8N_PUBLISH_WEBHOOK_URL) throw new Error('Falta configurar N8N_PUBLISH_WEBHOOK_URL en dashboard.js.');
      const resp = await fetchTenantWebhook(N8N_PUBLISH_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ car: crearPayloadPublicoAuto(car), copy: copyText.value.trim(), image_url: urls[0], image_urls: urls, platforms, request_id: draft.requestId })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success !== true || !data.request_id) throw new Error(data.error || 'No se confirmó el envío. Revisa el estado antes de reintentar.');
      car.upload_post_request_id_meta = data.request_id;
      car.publicado_meta = false;
      const updatePayload = { copy_meta: copyText.value.trim(), image_url: urls[0], image_urls: urls };
      const { error } = await supabaseClient.from('cars').update(updatePayload).eq('id', car.id).eq('lote_id', currentLote.id);
      statusText.textContent = error
        ? 'En proceso. El envío fue aceptado, pero no se guardó el texto. Verifica la publicación antes de reintentar.'
        : 'En proceso. Puedes confirmar el resultado con “Verificar Meta” en Inventario.';
      statusText.style.color = 'var(--text-dim)';
      await fetchCars();
    } catch (err) {
      console.error('[Agente IA] Error al publicar:', err);
      statusText.setAttribute('role', 'alert');
      statusText.textContent = err.name === 'TimeoutError' || !navigator.onLine
        ? 'Se perdió la conexión. Revisa el estado antes de reintentar; conservamos el envío para evitar duplicados.'
        : err.message || 'No se pudo publicar. Revisa el estado antes de reintentar.';
      statusText.style.color = 'var(--danger)';
    } finally {
      btnPublicar.disabled = false;
      btnPublicar.removeAttribute('aria-busy');
      updateBtnPublicarLabel();
    }
  });
}

// ------------------------------------------------------------
// DRAWER CRM
// ------------------------------------------------------------
async function openDrawer(leadId) {
  // FIX #8: guard real — bloquea aunque se llame desde consola
  if (catalogModeActive) {
    console.warn('[Modo Catálogo] Apertura de ficha de lead bloqueada.');
    return;
  }

  const lead = leadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const context = captureTenantContext(), generation = ++drawerGeneration;
  const drawer = document.getElementById('drawerPro');
  if (!drawer.classList.contains('drawer-open')) drawerReturnFocus = {node:document.activeElement,leadId:String(lead.id)};
  const isCurrent = () => isCurrentTenantContext(context) && generation === drawerGeneration && String(activeLeadId) === String(lead.id);
  activeLeadId = lead.id;

  const citaAsociada = citasCache.find(c => String(c.telefono) === String(lead.phone_number || lead.telefono));

  document.getElementById('crmLeadIdDisplay').textContent = lead.id ? String(lead.id).slice(-8).toUpperCase() : '---';
  document.getElementById('drawerNombre').textContent = lead.nombre || '---';
  document.getElementById('drawerTelefono').textContent = lead.phone_number || lead.telefono || '---';

  const iniciales = (lead.nombre || 'P W').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('crmAvatarInitials').textContent = iniciales;

  const statusEl = document.getElementById('drawerStatus');
  statusEl.textContent = lead.status || 'Calificado';
  statusEl.className = `badge ${statusBadgeClass(lead.status)} mt-1`;

  if (citaAsociada && citaAsociada.fecha_cita) {
    const horaClean = citaAsociada.hora_cita ? citaAsociada.hora_cita.slice(0, 5) : '12:00';
    document.getElementById('drawerFechaCita').textContent = `${citaAsociada.fecha_cita} a las ${horaClean} hrs 📅`;
  } else {
    document.getElementById('drawerFechaCita').textContent = 'Sin cita agendada';
  }

  document.getElementById('drawerInteres').textContent = lead.auto_interes || '---';
  document.getElementById('drawerUltimoMensaje').textContent = lead.ultimo_mensaje || 'Conversación activa en WhatsApp';
  document.getElementById('drawerNotas').textContent = lead.notes || lead.notas || 'Sin anotaciones del bot.';

  let textoEnganche = '---';
  if (lead.enganche) {
    if (String(lead.enganche) === '1') textoEnganche = '$50,000 a $100,000';
    else if (String(lead.enganche) === '2') textoEnganche = '$100,000 a $200,000';
    else if (String(lead.enganche) === '3') textoEnganche = 'Más de $200,000';
    else textoEnganche = lead.enganche;
  }
  document.getElementById('drawerEnganche').textContent = textoEnganche;

  let textoSituacion = '---';
  if (lead.situacion_laboral) {
    if (String(lead.situacion_laboral) === '1') textoSituacion = 'Empleado con nómina';
    else if (String(lead.situacion_laboral) === '2') textoSituacion = 'Independiente / Negocio propio';
    else if (String(lead.situacion_laboral) === '3') textoSituacion = 'No comprueba ingresos';
    else textoSituacion = lead.situacion_laboral;
  }
  document.getElementById('drawerSituacion').textContent = textoSituacion;

  drawer.inert = false;
  document.getElementById('view-dashboard').inert = true;
  drawer.setAttribute('aria-hidden', 'false');
  drawer.setAttribute('aria-busy', 'true');
  drawer.classList.add('drawer-open');
  document.getElementById('drawerOverlay').classList.remove('hidden');
  const loadStatus = document.getElementById('drawerLoadStatus');
  loadStatus.setAttribute('role', 'status');loadStatus.textContent = 'Consultando historial y documentos…';
  const chat = document.getElementById('crmChatHistoryContainer');
  if(chat)chat.textContent = 'Cargando conversación…';
  document.getElementById('crmAiHandoffStatus').textContent = 'Consultando estado de la IA…';
  for(const id of ['btnPauseAiChat','btnResumeAiChat'])document.getElementById(id).disabled = true;
  if (window._activarDrawerTabDatos) window._activarDrawerTabDatos();
  document.getElementById('drawerTitle').focus();
  const expedienteContainer = document.getElementById('drawerExpedienteDocs');
  if(expedienteContainer)expedienteContainer.textContent = 'Cargando documentos…';
  const loadDocuments = async () => {
    if(!expedienteContainer)return true;
    const results = await Promise.allSettled([
      crearUrlDocumentoPrivado(lead.url_ine),
      crearUrlDocumentoPrivado(lead.url_comprobante_domicilio),
      crearUrlDocumentoPrivado(lead.url_comprobante_ingresos)
    ]);
    if(!isCurrent())return false;
    const [urlIne,urlDomicilio,urlIngresos]=results.map(result=>result.status==='fulfilled'?result.value:'');
    expedienteContainer.innerHTML =
      renderDocPreview(urlIne, '🪪', 'Clave Elector (INE)', !!lead.url_ine && !urlIne) +
      renderDocPreview(urlDomicilio, '🏡', 'Dirección de Residencia', !!lead.url_comprobante_domicilio && !urlDomicilio) +
      renderDocPreview(urlIngresos, '📊', 'Estados de Cuenta', !!lead.url_comprobante_ingresos && !urlIngresos);
    return results.every(result=>result.status==='fulfilled');
  };
  const loadChat = async () => {
    try { return await refreshChatLive(lead.id); }
    catch (_) { if(isCurrent()&&chat)chat.textContent='No se pudo cargar la conversación. Vuelve a abrir el perfil para reintentar.';return false; }
  };
  const results = await Promise.allSettled([loadDocuments(), loadChat()]);
  if(!isCurrent())return;
  drawer.removeAttribute('aria-busy');
  const partial=results.some(result=>result.status==='rejected'||result.value===false);
  loadStatus.setAttribute('role',partial?'alert':'status');
  loadStatus.textContent=partial?'No se pudo cargar toda la información. Cierra y vuelve a abrir el perfil para reintentar.':'';
}

function normalizarTelefonoChat(value) {
  return String(value || '').split('@')[0].replace(/:\d+$/, '').replace(/[^0-9]/g, '').replace(/^521|^52/, '');
}

async function refreshAiHandoffControls(lead) {
  if (!currentLote || catalogModeActive) return;
  const context = captureTenantContext();
  const generation = drawerGeneration;
  const status = document.getElementById('crmAiHandoffStatus');
  const pauseButton = document.getElementById('btnPauseAiChat');
  const resumeButton = document.getElementById('btnResumeAiChat');
  if (!status || !currentLote || !lead) return;
  const phone = normalizarTelefonoChat(lead.phone_number || lead.telefono);
  let result;
  try{result=await supabaseClient.from('chat_handoffs')
    .select('manual_until')
    .eq('lote_id', currentLote.id)
    .eq('phone_number', phone)
    .maybeSingle();}catch(_){result={data:null,error:true};}
  const {data,error}=result;
  if (!isCurrentTenantContext(context) || generation !== drawerGeneration || String(activeLeadId) !== String(lead.id) || handoffActionPending) return;
  for(const [button,label] of [[pauseButton,'Pausar IA · 30 min'],[resumeButton,'Reactivar IA ahora']]){
    if(button){button.removeAttribute('aria-busy');button.textContent=label;}
  }
  if (error) {
    status.textContent = 'Estado de la IA no disponible. Vuelve a abrir el perfil.';
    status.className = 'text-[10px] font-bold text-amber-400';
    if (pauseButton) pauseButton.disabled = true;
    if (resumeButton) resumeButton.disabled = true;
    return false;
  }
  const expiry = data?.manual_until ? Date.parse(data.manual_until) : 0;
  const paused = Number.isFinite(expiry) && expiry > Date.now();
  if (paused) {
    const minutes = Math.max(1, Math.ceil((expiry - Date.now()) / 60000));
    status.textContent = 'IA pausada · ' + minutes + ' min';
    status.className = 'text-[10px] font-bold text-amber-400';
  } else {
    status.textContent = 'IA activa';
    status.className = 'text-[10px] font-bold text-emerald-400';
  }
  if (pauseButton) { pauseButton.disabled = paused; pauseButton.classList.toggle('opacity-50', paused); }
  if (resumeButton) { resumeButton.classList.toggle('hidden', !paused); resumeButton.disabled = !paused; }
  return true;
}

async function setAiHandoffPaused(paused) {
  const lead = leadsCache.find(item => String(item.id) === String(activeLeadId));
  if (!lead || !currentLote || catalogModeActive || handoffActionPending) return;
  const context = captureTenantContext(), leadId = activeLeadId, generation=drawerGeneration;
  const isCurrent=()=>isCurrentTenantContext(context)&&String(activeLeadId)===String(leadId)&&generation===drawerGeneration;
  const status = document.getElementById('crmAiHandoffStatus');
  const button = document.getElementById(paused ? 'btnPauseAiChat' : 'btnResumeAiChat');
  const finish = window.VeloDriveUI.beginSubmit(button, status, paused ? 'Pausando…' : 'Activando…', 'Actualizando atención de la conversación…', isCurrent);
  if (!finish) return;
  handoffActionPending = true;
  const phone = normalizarTelefonoChat(lead.phone_number || lead.telefono);
  const now = new Date();
  let saved = false;
  try {
    if (!phone) throw new Error('INVALID_CHAT_PHONE');
    const { error } = paused
      ? await supabaseClient.from('chat_handoffs').upsert({
          lote_id: context.loteId, phone_number: phone,
          manual_until: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          last_activity: now.toISOString(), updated_at: now.toISOString(), pause_reason: 'manual_dashboard'
        }, { onConflict: 'lote_id,phone_number' })
      : await supabaseClient.from('chat_handoffs').update({manual_until: now.toISOString(), updated_at: now.toISOString()})
          .eq('lote_id', context.loteId).eq('phone_number', phone);
    if (error) throw new Error('HANDOFF_SAVE_FAILED');
    if (!isCurrent()) return;
    saved = true;
    finish(paused ? 'IA pausada durante 30 minutos.' : 'IA activada.', 'success');
  } catch (_) {
    if (isCurrent()) finish('No se pudo actualizar la atención. Revisa tu conexión.', 'error');
  } finally {
    finish(); handoffActionPending = false;
    if(!isCurrent()&&currentLote&&!catalogModeActive&&document.getElementById('drawerPro')?.classList.contains('drawer-open')){
      const currentLead=leadsCache.find(item=>String(item.id)===String(activeLeadId));
      if(currentLead)void refreshAiHandoffControls(currentLead);
    }
  }
  if (saved) {
    const pauseButton = document.getElementById('btnPauseAiChat'), resumeButton = document.getElementById('btnResumeAiChat');
    if (pauseButton) pauseButton.disabled = paused;
    if (resumeButton) { resumeButton.disabled = !paused; resumeButton.classList?.toggle('hidden', !paused); }
  }
}

async function pauseAiForActiveChat() { return setAiHandoffPaused(true); }

async function resumeAiForActiveChat() {
  return setAiHandoffPaused(false);
}

async function refreshChatLive(leadId) {
  if (!currentLote || catalogModeActive) return;
  const context = captureTenantContext();
  const generation = drawerGeneration;
  const lead = leadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const chatContainer = document.getElementById('crmChatHistoryContainer');
  if (!chatContainer) return;
  const handoffAvailable = await refreshAiHandoffControls(lead);
  if (!isCurrentTenantContext(context) || generation !== drawerGeneration || String(activeLeadId) !== String(leadId)) return false;

  const phoneFilter = normalizarTelefonoChat(lead.phone_number || lead.telefono);
  const { data: messages, error: chatErr } = await supabaseClient
    .from('chat_history')
    .select('*')
    .eq('phone_number', phoneFilter)
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: true });

  if (!isCurrentTenantContext(context) || generation !== drawerGeneration || String(activeLeadId) !== String(leadId)) return false;
  if (chatErr) {
    console.error('[CRM Live Chat Error]:', chatErr);
    chatContainer.textContent = 'No se pudo cargar la conversación. Vuelve a abrir el perfil para reintentar.';
    return false;
  }

  if (!messages || messages.length === 0) {
    chatContainer.innerHTML = `
      <div class="my-auto text-center space-y-2 p-6">
        <p class="text-[#9CA3AF] font-medium">No hay mensajes registrados para este prospecto.</p>
        <p class="text-[11px] text-[#9CA3AF] bg-[#161922] border border-[#272A30] rounded-lg p-2 max-w-xs mx-auto">Última interacción: "${escapeHtml(lead.ultimo_mensaje || 'Ninguno')}"</p>
      </div>`;
    return handoffAvailable !== false;
  }

  const despegadoDelFondo = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight > 100;

  chatContainer.innerHTML = messages.map(msg => {
    const role = String(msg.role || '').toLowerCase();
    const isBot = role === 'assistant' || role === 'bot' || role === 'model' || !!msg.response;
    const isHuman = role === 'human' || role === 'owner' || role === 'agent';
    const textContent = msg.message || msg.content || msg.response || '---';
    const hora = msg.created_at
      ? new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' }).format(parseFechaMx(msg.created_at))
      : '';

    if (isBot) {
      return `
        <div class="self-start max-w-[85%] bg-[#161922] border border-[#272A30] p-3 rounded-2xl rounded-tl-none space-y-1">
          <p class="font-bold text-[10px] uppercase tracking-wide" style="color: var(--cold);">🤖 Cerebro IA ${hora ? '· ' + hora : ''}</p>
          <p class="leading-relaxed select-text">${escapeHtml(textContent)}</p>
        </div>
      `;
    } else {
      return `
        <div class="self-end max-w-[85%] p-3 rounded-2xl rounded-tr-none space-y-1 text-right" style="background: var(--text); color: var(--bg);">
          <p class="font-bold text-[10px] uppercase tracking-wide opacity-70">${isHuman ? '🧑‍💼 Encargado' : '👤 Prospecto'} ${hora ? '· ' + hora : ''}</p>
          <p class="leading-relaxed text-left select-text">${escapeHtml(textContent)}</p>
        </div>
      `;
    }
  }).join('');

  if (!despegadoDelFondo) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  return handoffAvailable !== false;
}

function closeDrawer() {
  const drawer=document.getElementById('drawerPro'),wasOpen=drawer.classList.contains('drawer-open');
  drawerGeneration += 1;
  activeLeadId = null;
  document.getElementById('drawerPro').classList.remove('drawer-open');
  document.getElementById('drawerPro').setAttribute('aria-hidden', 'true');
  document.getElementById('drawerPro').removeAttribute('aria-busy');
  document.getElementById('drawerOverlay').classList.add('hidden');
  document.getElementById('view-dashboard').inert = false;
  let target=drawerReturnFocus?.node;
  if(!target?.isConnected&&drawerReturnFocus)target=[...document.querySelectorAll('.btn-ver-perfil')].find(button=>button.getAttribute('data-lead-id')===drawerReturnFocus.leadId&&button.getClientRects().length);
  if(wasOpen)(target?.isConnected?target:document.querySelector('[data-section="section-panel"]'))?.focus();
  document.getElementById('drawerPro').inert = true;
  drawerReturnFocus = null;
}

// ------------------------------------------------------------
// MODO CATÁLOGO
// FIX #8: limpiar leadsCache al activar para evitar lectura por consola
// ------------------------------------------------------------

// ============================================================
// DRAWER TABS — navegación móvil entre Datos / Chat / Docs
// ============================================================
function initDrawerTabs() {
  const tabs = [...document.querySelectorAll('.drawer-tab-btn')];
  if (!tabs.length) return;
  const desktop = window.matchMedia('(min-width: 1024px)');
  let activeTab = 'tab-datos';

  function renderTabs() {
    document.querySelectorAll('.drawer-tab-content').forEach(panel => {
      const visible = desktop.matches || panel.id === activeTab;
      if (desktop.matches) panel.style.removeProperty('display');
      else panel.style.display = visible ? (panel.id === 'tab-chat' ? 'flex' : 'block') : 'none';
      panel.inert = !visible;
      panel.setAttribute('aria-hidden', String(!visible));
      panel.tabIndex = visible ? 0 : -1;
    });
    tabs.forEach(button => {
      const selected = button.dataset.drawerTab === activeTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }

  function activarTab(tabId) {
    if (!tabs.some(button => button.dataset.drawerTab === tabId)) return;
    activeTab = tabId;
    renderTabs();
    if (!desktop.matches && tabId === 'tab-chat') {
      const chat = document.getElementById('crmChatHistoryContainer');
      if (chat) setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 50);
    }
  }

  tabs.forEach(btn => {
    btn.addEventListener('click', () => activarTab(btn.dataset.drawerTab));
    btn.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(btn);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activarTab(tabs[next].dataset.drawerTab);
      tabs[next].focus();
    });
  });
  desktop.addEventListener('change', () => {
    renderTabs();
    const drawer = document.getElementById('drawerPro');
    if (drawer.classList.contains('drawer-open')) {
      const focused = document.activeElement;
      if (desktop.matches && (focused === document.body || focused?.matches('.drawer-tab-btn'))) {
        document.getElementById(activeTab)?.focus();
      } else if (focused?.closest('.drawer-tab-content[inert]')) {
        tabs.find(button => button.dataset.drawerTab === activeTab)?.focus();
      }
    }
  });
  window._activarDrawerTabDatos = () => activarTab('tab-datos');
  renderTabs();
}

function initCatalogMode() {
  const toggle = document.getElementById('catalogModeToggle');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    tenantContextVersion += 1;
    privateReads.reset();
    catalogModeActive = !catalogModeActive;
    document.body.classList.toggle('catalog-mode', catalogModeActive);
    toggle.classList.toggle('active', catalogModeActive);
    toggle.setAttribute('aria-pressed', String(catalogModeActive));

    if (catalogModeActive) {
      closeDrawer();
      const modalCostos = document.getElementById('modalVentaOverlay');
      modalCostos?.classList.add('hidden');
      modalCostos?.classList.remove('flex');
      activeSaleCarId = null;
      activeLeadId = null;

      // Presentation mode requests only the retail projection; it is not public authorization.
      leadsCache = [];
      citasCache = [];
      saleReturnFocus=null;
      carsCache = carsCache.map(car => {
        return Object.fromEntries(CATALOG_CAR_COLUMNS.split(',').filter(key => key in car).map(key => [key, car[key]]));
      });

      const inventarioBtn = document.querySelector('[data-section="section-inventario"]');
      if (inventarioBtn) inventarioBtn.click();
    } else {
      // Al desactivar, recargar datos reales
      fetchAndRenderAll();
    }

    renderLeadsTable();
    renderPipelineKanban();
    renderCitasCronologicas();
    renderCars();
    calcularMetricasInventario();
    renderVentasMensuales();
  });
}

function initSidebarNav() {
  const navButtons = document.querySelectorAll('.nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionId = btn.getAttribute('data-section');
      document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
      document.getElementById(sectionId).classList.remove('hidden');
      navButtons.forEach(b => b.classList.remove('nav-active'));
      btn.classList.add('nav-active');
      document.getElementById('sidebar').classList.add('-translate-x-full');
      document.getElementById('overlay').classList.add('hidden');
      if (sectionId === 'section-configuracion') {
        cargarEstadoWhatsappQr();
        verificarRedesSociales();
      }
    });
  });
}

function renderConfigLote() {
  if (!currentLote) return;
  if (document.getElementById('configNombreLote')) document.getElementById('configNombreLote').value = currentLote.nombre || '';
  if (document.getElementById('configPhoneLote')) document.getElementById('configPhoneLote').value = currentLote.whatsapp_number || '';
  document.querySelectorAll('.lote-nombre-display').forEach(el => el.textContent = currentLote.nombre);
}

function renderSubscriptionStatus() {
  if (!currentLote) return;
  const activeInfo = document.getElementById('subscriptionActiveInfo');
  const payBtn = document.getElementById('subscriptionPayBtn');
  const renewalDate = document.getElementById('subscriptionRenewalDate');
  const planLabel = document.getElementById('subscriptionPlanLabel');

  const esInterna = currentLote.es_cuenta_interna === true;
  const isActive = currentLote.plan_status === 'active' || esInterna;

  activeInfo.classList.toggle('hidden', !isActive);
  payBtn.classList.toggle('hidden', isActive);
  document.body.classList.toggle('plan-vencido', !isActive);

  if (esInterna) {
    if (planLabel) planLabel.textContent = 'Cuenta Interna';
    if (renewalDate) renewalDate.textContent = 'Exenta de facturación';
  } else if (isActive && currentLote.fecha_vencimiento) {
    if (planLabel) planLabel.textContent = 'Plan Activo';
    const fecha = new Date(currentLote.fecha_vencimiento);
    renewalDate.textContent = `Renueva el ${fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' })}`;
  }
}

function handleStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    window.history.replaceState({}, '', window.location.pathname);
    if (!currentLote?.id) {
      showActionToast('Regresaste de Stripe. Inicia sesión para comprobar el estado del plan.', 'error');
      return;
    }
    showActionToast('Regresaste de Stripe. Estamos confirmando el pago…', 'info');
    void (async () => {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
        const { data, error } = await supabaseClient.from('lotes').select('*').eq('id', currentLote.id).single();
        if (data) {
          currentLote = data;
          renderSubscriptionStatus();
          if (data.plan_status === 'active' || data.es_cuenta_interna === true) {
            showActionToast('Pago confirmado. Tu plan ya está activo.', 'success');
            return;
          }
        }
        if (error) console.warn('[Stripe] Aún no se pudo consultar el estado del plan.');
      }
      showActionToast('El pago aún está en verificación. Actualiza el panel en un momento; si continúa igual, contacta soporte.', 'error');
    })();
  }
}

function handleSocialReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('social') === 'connected') {
    window.history.replaceState({}, '', window.location.pathname);
    const btnConfig = document.querySelector('[data-section="section-configuracion"]');
    if (btnConfig) btnConfig.click();
    const statusText = document.getElementById('redesStatusText');
    if (statusText) statusText.textContent = 'Verificando tu conexión...';
    setTimeout(() => { verificarRedesSociales(); }, 1500);
  }
}

async function checarEstatusWhatsApp() {
  if (!currentLote || !currentLote.id) return;
  try {
    const { data, error } = await supabaseClient
      .from('whatsapp_channels')
      .select('instance_name, phone_number')
      .eq('lote_id', currentLote.id)
      .maybeSingle();
    if (error) { console.warn('[WhatsApp] Error consultando canal:', error.message); return; }
    if (data) console.log('[Multi-Tenant Node] Instancia vinculada.');
  } catch (err) {
    console.error('[WhatsApp]', err);
  }
}

// ------------------------------------------------------------
// MÓDULO WHATSAPP QR
// ------------------------------------------------------------
let whatsappRequestPending=false;
let whatsappPollTimer=null;
let whatsappExpiryTimer=null;
let whatsappQrExpires=0;
let whatsappQrLoteId=null;

function detenerEsperaWhatsapp() {
  clearTimeout(whatsappPollTimer);
  clearTimeout(whatsappExpiryTimer);
  whatsappPollTimer=null;
  whatsappExpiryTimer=null;
}

async function cargarEstadoWhatsappQr(options={}) {
  if (!currentLote || !N8N_QR_WEBHOOK_URL || whatsappRequestPending) return;
  const loteId=currentLote.id;
  const badge=document.getElementById('whatsappEstadoBadge');
  const conectadoWrap=document.getElementById('whatsappConectado');
  const qrWrap=document.getElementById('whatsappQrWrap');
  const qrImg=document.getElementById('whatsappQrImg');
  const status=document.getElementById('whatsappQrLoading');
  const button=document.getElementById('btnRefrescarQr');
  const cached=whatsappQrLoteId===loteId && whatsappQrExpires>Date.now();
  const accion=options.accion==='estado'||(!options.renovar&&cached)?'estado':'conectar';
  whatsappRequestPending=true;
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  if(accion==='conectar') {
    detenerEsperaWhatsapp();
    whatsappQrExpires=0;
    qrImg.classList.add('hidden');
    status.classList.remove('hidden');
    status.textContent='Preparando conexión segura de WhatsApp…';
  }
  try {
    const response=await fetchTenantWebhook(N8N_QR_WEBHOOK_URL,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lote_id:loteId,accion}),signal:AbortSignal.timeout(45000)
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data) throw new Error(data?.error||'No se pudo consultar WhatsApp. Intenta actualizar.');
    if(currentLote?.id!==loteId)return;
    if(data.conectado===true) {
      detenerEsperaWhatsapp();
      whatsappQrExpires=0;
      badge.textContent='Conectado';badge.className='badge badge-success';
      conectadoWrap.classList.remove('hidden');conectadoWrap.classList.add('flex');
      qrWrap.classList.add('hidden');
      document.getElementById('whatsappNumeroConectado').textContent=data.numero||'Instancia vinculada';
      return;
    }
    conectadoWrap.classList.add('hidden');conectadoWrap.classList.remove('flex');
    qrWrap.classList.remove('hidden');
    badge.textContent='Sin conectar';badge.className='badge badge-warm';
    if(accion==='conectar') {
      if(typeof data.qr_base64==='string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data.qr_base64)) {
        qrImg.src=data.qr_base64;qrImg.classList.remove('hidden');
        status.classList.add('hidden');
        whatsappQrLoteId=loteId;
        whatsappQrExpires=Date.now()+Math.min(Number(data.expires_in)||45,45)*1000;
        whatsappExpiryTimer=setTimeout(()=>{
          detenerEsperaWhatsapp();whatsappQrExpires=0;qrImg.classList.add('hidden');
          status.classList.remove('hidden');status.textContent='Actualiza el QR para obtener un código vigente.';
        },whatsappQrExpires-Date.now());
      } else {
        status.textContent='Evolution todavía no entregó el QR. Espera unos segundos y pulsa Actualizar QR.';
      }
    }
    if(whatsappQrExpires>Date.now()) {
      clearTimeout(whatsappPollTimer);
      whatsappPollTimer=setTimeout(()=>{
        if(currentLote?.id===loteId&&!document.getElementById('section-configuracion').classList.contains('hidden'))
          cargarEstadoWhatsappQr({accion:'estado'});
      },4000);
    }
  } catch(error) {
    detenerEsperaWhatsapp();whatsappQrExpires=0;
    qrImg.classList.add('hidden');qrWrap.classList.remove('hidden');
    status.classList.remove('hidden');status.setAttribute('role','alert');
    status.textContent=error.name==='TimeoutError'?'La conexión tardó demasiado. Pulsa Actualizar QR para reintentar.':
      error instanceof TypeError?'No se pudo conectar. Revisa tu internet y pulsa Actualizar QR.':error.message;
    console.error('[WhatsApp QR]',error);
  } finally {
    whatsappRequestPending=false;button.disabled=false;button.removeAttribute('aria-busy');
  }
}

// ------------------------------------------------------------
// MÓDULO REDES SOCIALES
// ------------------------------------------------------------
async function conectarRedesSociales() {
  if (!currentLote || !N8N_REDES_WEBHOOK_URL) { alert('Falta configurar N8N_REDES_WEBHOOK_URL en dashboard.js.'); return; }
  const btnConectar = document.getElementById('btnConectarRedes');
  const statusText = document.getElementById('redesStatusText');
  if (btnConectar.disabled || socialActionPending) return;

  // Abrir la pestaña durante el gesto de clic evita que el navegador bloquee
  // la ventana cuando la respuesta de n8n llega después de una espera de red.
  const connectWindow = window.open('about:blank', '_blank');
  if (!connectWindow) {
    statusText.textContent = 'Permite las ventanas emergentes para abrir la conexión segura de redes.';
    return;
  }
  connectWindow.opener = null;

  btnConectar.disabled = true;
  socialActionPending = true;
  btnConectar.setAttribute('aria-busy', 'true');
  statusText.setAttribute('role', 'status');
  statusText.setAttribute('aria-live', 'polite');
  statusText.textContent = 'Preparando conexión segura…';
  btnConectar.textContent = 'Generando enlace seguro...';

  try {
    const resp = await fetchTenantWebhook(N8N_REDES_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ accion: 'conectar', lote_id: currentLote.id }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || data.message || `n8n respondió ${resp.status}`);
    if (!data.access_url) throw new Error('El servidor no devolvió un enlace de conexión.');
    const link = new URL(data.access_url);
    if (link.origin !== 'https://app.upload-post.com' || !/^\/connect(?:\/|$)/.test(link.pathname)) throw new Error('El enlace de conexión no es válido.');

    connectWindow.location.replace(data.access_url);
    statusText.textContent = 'Conecta tus cuentas en la pestaña nueva y regresa aquí.';
    document.getElementById('btnVerificarRedes').classList.remove('hidden');
  } catch (err) {
    console.error('[Redes Sociales] Error al conectar:', err);
    connectWindow.close();
    statusText.setAttribute('role', 'alert');
    statusText.textContent = err.message || 'No se pudo generar el enlace. Intenta de nuevo.';
  } finally {
    socialActionPending = false;
    btnConectar.removeAttribute('aria-busy');
    btnConectar.disabled = false;
    btnConectar.textContent = 'Conectar o gestionar redes';
  }
}

async function verificarRedesSociales() {
  if (!currentLote || !N8N_REDES_WEBHOOK_URL) return;
  const btnVerificar = document.getElementById('btnVerificarRedes');
  const statusText = document.getElementById('redesStatusText');
  const badge = document.getElementById('redesEstadoBadge');
  if (btnVerificar.disabled || socialActionPending) return;

  socialActionPending = true;
  btnVerificar.disabled = true;
  btnVerificar.setAttribute('aria-busy', 'true');
  statusText.setAttribute('role', 'status');
  statusText.setAttribute('aria-live', 'polite');
  statusText.textContent = 'Consultando conexión de Facebook e Instagram…';
  btnVerificar.textContent = 'Verificando...';

  try {
    const resp = await fetchTenantWebhook(N8N_REDES_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ accion: 'verificar', lote_id: currentLote.id }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `n8n respondió ${resp.status}`);

    badge.textContent = data.conectado ? 'Conectado' : data.parcial ? 'Conexión parcial' : 'Sin conectar';
    badge.className = data.conectado ? 'badge badge-success' : 'badge badge-warm';
    const btnConectar = document.getElementById('btnConectarRedes');
    btnConectar.textContent = 'Conectar o gestionar redes';
    btnConectar.disabled = false;
    btnVerificar.classList.remove('hidden');
    const platforms = data.plataformas || {};
    statusText.textContent = `${platforms.facebook ? 'Facebook conectado' : 'Facebook pendiente'}. ${platforms.instagram ? 'Instagram conectado' : 'Instagram pendiente'}.`;
  } catch (err) {
    console.error('[Redes Sociales] Error al verificar:', err);
    statusText.setAttribute('role', 'alert');
    statusText.textContent = 'Error al verificar. Intenta de nuevo.';
  } finally {
    socialActionPending = false;
    btnVerificar.removeAttribute('aria-busy');
    btnVerificar.disabled = false;
    btnVerificar.textContent = 'Ya conecté mis cuentas — Verificar';
  }
}

// ------------------------------------------------------------
// ROUTE GUARD
// ------------------------------------------------------------
async function checkSessionAndLote() {
  const routeVersion = tenantContextVersion;
  if (passwordRecoveryActive) return false;
  try {
    const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
    if (routeVersion !== tenantContextVersion) return false;
    if (sessionErr || !sessionData || !sessionData.session) {
      currentUser = null;
      currentLote = null;
      showView('view-login');
      return false;
    }

    if (currentUser?.id && currentUser.id !== sessionData.session.user.id) { leaveTenantSession(); return false; }
    currentUser = sessionData.session.user;
    console.log('[Route Guard] Usuario autenticado.');

    const { data: loteData, error: loteError } = await supabaseClient
      .from('lotes')
      .select('*')
      .eq('profile_id', currentUser.id);
    if (routeVersion !== tenantContextVersion) return false;

    if (loteError) {
      console.error('[Route Guard] Error consultando lote:', loteError);
    }

    console.log('[Route Guard] Lotes encontrados:', loteData?.length || 0);

    if (loteData && loteData.length > 0) {
      currentLote = loteData[0];
      console.log('[Route Guard] Lote activo validado.');
      renderConfigLote();
      renderSubscriptionStatus();
      showView('view-dashboard');
      startSync();
      return true;
    }

    currentLote = null;
    showView('view-registro');
    return true;
  } catch (err) {
    console.error('[Route Guard] Excepción validando sesión:', err);
    currentUser = null;
    currentLote = null;
    activeSaleCarId = null;
    showView('view-login');
    return false;
  }
}

async function handleConfigSubmit(e) {
  e.preventDefault();
  if (!currentLote) return;
  const context = captureTenantContext();
  const status = document.getElementById('configStatus');
  const finish = window.VeloDriveUI.beginSubmit(e.target.querySelector('button[type="submit"]'), status, 'Guardando…', 'Guardando configuración…');
  if (!finish) return;
  try {
    const nombre = document.getElementById('configNombreLote').value.trim();
    if (!nombre) throw new Error('INVALID_NAME');
    const { data, error } = await supabaseClient.from('lotes').update({
      nombre, whatsapp_number: document.getElementById('configPhoneLote').value.trim()
    }).eq('id', context.loteId).select().single();
    if (!isCurrentTenantContext(context)) return;
    if (error || data?.id !== context.loteId) throw new Error('CONFIG_SAVE_FAILED');
    currentLote = data;
    renderConfigLote();
    finish('Configuración guardada.', 'success');
  } catch (_) {
    if (isCurrentTenantContext(context)) finish('No se pudo guardar. Revisa los datos y tu conexión.', 'error');
  } finally { finish(); }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btnLogin = e.target.querySelector('button[type="submit"]');
  const finish = window.VeloDriveUI.beginSubmit(btnLogin, errorEl, 'Iniciando sesión…', 'Validando tu acceso…');
  if (!finish) return;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[Login] Error Supabase:', error);
      finish(error.message || 'Credenciales no válidas.', 'error');
      return;
    }
    if (!data || !data.user) {
      finish('No se pudo autenticar. Intenta de nuevo.', 'error');
      return;
    }
    currentUser = data.user;
    await checkSessionAndLote();
  } catch (err) {
    console.error('[Login] Excepción:', err);
    finish('Error de conexión. Verifica tu internet.', 'error');
  } finally {
    finish();
  }
}

async function handleRegistroSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('registroEmail').value.trim();
  const password = document.getElementById('registroPassword').value;
  const nombreLote = document.getElementById('registroNombreLote').value.trim();
  const phoneLote = document.getElementById('registroPhoneLote').value.trim();
  const rfc = document.getElementById('registroRFC').value.trim().toUpperCase();
  const razonSocial = document.getElementById('registroRazonSocial').value.trim();
  const cpFiscal = document.getElementById('registroCP').value.trim();
  const regimenFiscal = document.getElementById('registroRegimenFiscal').value;
  const usoCFDI = document.getElementById('registroUsoCFDI').value;
  const estado = document.getElementById('registroEstado').value;
  const errorEl = document.getElementById('registroError');
  if (errorEl) errorEl.textContent = '';
  if (!documentosLegalesListos()) {
    if (errorEl) {
      errorEl.textContent = 'El registro estará disponible cuando se completen y publiquen los documentos legales de VeloDrive.';
      errorEl.classList.remove('hidden');
    }
    return;
  }
  if (!document.getElementById('aceptaDocumentosLegales')?.checked) {
    if (errorEl) { errorEl.textContent = 'Debes aceptar los Términos del servicio y el Aviso de privacidad.'; errorEl.classList.remove('hidden'); }
    return;
  }

  // Si el wizard está activo, las validaciones ya se hicieron paso a paso
  if (!window._wizardGetDatosLote) {
    if (!/^\d{5}$/.test(cpFiscal)) {
      if (errorEl) errorEl.textContent = 'El código postal debe tener exactamente 5 dígitos.';
      return;
    }
    if (!estado) {
      if (errorEl) errorEl.textContent = 'Selecciona tu estado.';
      return;
    }
  }

  const btnRegistro = document.getElementById('btnSubmitRegistro');
  if (btnRegistro) btnRegistro.disabled = true;

  // FIX: si el wizard está activo, usa sus datos completos (horario, financiamiento, etc.)
  const datosLote = window._wizardGetDatosLote ? window._wizardGetDatosLote() : {
    nombre: nombreLote,
    whatsapp_number: phoneLote,
    rfc,
    razon_social: razonSocial,
    cp_fiscal: cpFiscal,
    regimen_fiscal: regimenFiscal,
    uso_cfdi: usoCFDI,
    estado
  };
  datosLote.email_admin = email;

  if (btnRegistro) {
    btnRegistro.disabled = true;
    btnRegistro.setAttribute('aria-busy', 'true');
    btnRegistro.textContent = 'Creando cuenta y lote…';
  }

  try {
    const legalConsent = {
      version: LEGAL_VERSION,
      accepted_at: new Date().toISOString(),
      terms: true,
      privacy: true
    };
    const response = await fetch('/api/register-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, datosLote, legalConsent })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.message || 'No se pudo completar el registro. Inténtalo de nuevo.');
      error.code = result.code;
      throw error;
    }

    if (result.session?.access_token && result.session?.refresh_token) {
      const { error: sessionError } = await supabaseClient.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });
      if (sessionError) throw new Error('La cuenta y el lote se crearon, pero no se pudo iniciar sesión. Inicia sesión para continuar al pago.');
      currentUser = result.user;
      currentLote = result.lote;
      await redirigirAStripeCheckout(currentLote);
      return;
    }

    if (errorEl) {
      errorEl.classList.remove('hidden', 'text-[#A9584A]');
      errorEl.classList.add('text-[#4B8B72]');
      errorEl.setAttribute('role', 'status');
      errorEl.textContent = 'Cuenta y lote creados. Revisa tu correo para confirmar la cuenta; después inicia sesión y continúa con el pago.';
    }
  } catch (error) {
    console.error('[Registro] No se pudo completar el registro:', error.code || error.message);
    if (errorEl) {
      errorEl.classList.remove('hidden', 'text-[#4B8B72]');
      errorEl.classList.add('text-[#A9584A]');
      errorEl.setAttribute('role', 'alert');
      errorEl.textContent = error.message || 'Error de conexión. Verifica tu internet e inténtalo de nuevo.';
    }
  } finally {
    if (btnRegistro) {
      btnRegistro.disabled = false;
      btnRegistro.removeAttribute('aria-busy');
      btnRegistro.textContent = 'Crear Cuenta y Continuar';
    }
  }
}

const LEGAL_TEXTS = {
  privacidad: {
    title: 'Aviso de privacidad de VeloDrive',
    paragraphs: [
      'Responsable: Ángel Enrique Hernández Rizo, persona física que ofrece el servicio bajo el nombre comercial VeloDrive. Domicilio de contacto: Mar Caribe 442, Vista Bugambilias, Villa de Álvarez, Colima, C.P. 28979, México. Contacto de privacidad y solicitudes: RIZOA1333@gmail.com. Soporte técnico: rizovsolutions@gmail.com.',
      'Datos tratados: datos de cuenta y del lote (correo, nombre comercial, teléfono/WhatsApp, ubicación y datos fiscales como RFC, razón social, código postal, régimen y uso CFDI); inventario y fotografías de vehículos; datos de prospectos, citas y conversaciones de WhatsApp; e información necesaria para administrar pagos, suscripciones, conexiones de redes y soporte.',
      'Finalidades: crear y administrar cuentas; operar el panel, inventario y CRM; habilitar la atención automatizada de prospectos y herramientas de marketing; generar o publicar contenido cuando el usuario lo solicita; gestionar pagos y suscripciones; preparar manualmente los CFDI que solicite el cliente con los datos fiscales proporcionados; y atender soporte y solicitudes de privacidad.',
      'Proveedores que pueden tratar datos para prestar las funciones solicitadas: Supabase (cuentas y base de datos), Railway (alojamiento de la aplicación), Stripe (pagos y suscripciones), n8n (automatizaciones), Facturapi (gestión de CFDI cuando se solicita una factura), Evolution API (conexión de WhatsApp), Upload-Post (publicaciones en redes) y Google Gemini (funciones de inteligencia artificial). Los CFDI no se generan automáticamente por cada cargo; su preparación se gestiona manualmente. Según la configuración e infraestructura de cada proveedor, los datos podrían procesarse o alojarse en México o en otros países. Cada proveedor aplica sus propios términos, medidas y subencargados. No se autoriza a VeloDrive a vender los datos personales. Antes de conectar una cuenta de terceros, el usuario debe revisar sus permisos y avisos de privacidad.',
      'Conservación: al terminar la suscripción, VeloDrive gestionará manualmente la eliminación de los datos operativos y respaldos dentro de un plazo máximo de una semana. Los comprobantes fiscales y demás registros que deban conservarse por obligaciones legales se mantendrán durante el periodo aplicable.',
      'Derechos y solicitudes: para ejercer derechos de acceso, rectificación, cancelación u oposición (ARCO), revocar el consentimiento o limitar el uso de datos, escribe a RIZOA1333@gmail.com e incluye tu nombre, un medio para recibir respuesta, el correo asociado a tu cuenta, el derecho que deseas ejercer y una descripción que ayude a localizar los datos. Para rectificación, indica los cambios y, si aplica, adjunta sustento. Podremos pedir una verificación razonable de identidad o representación. Informaremos la determinación en un máximo de 20 días y, si procede, la haremos efectiva dentro de los 15 días siguientes; esos plazos pueden ampliarse una vez por un periodo igual cuando la ley lo permita y se justifique.',
      'Datos de prospectos: el lote que carga o conecta esos datos determina para qué los usa y debe contar con la base legal y los avisos necesarios. VeloDrive los procesa para prestar las funciones que el lote solicita y no para venderlos ni para fines propios ajenos al servicio.',
      'Cambios al aviso: la versión vigente se mostrará en el panel de VeloDrive. Si el cambio afecta materialmente el tratamiento de datos, se avisará al correo registrado y mediante un aviso dentro del panel antes de aplicarlo cuando sea posible. Se indicará la fecha de actualización.'
    ]
  },
  terminos: {
    title: 'Términos del servicio de VeloDrive',
    paragraphs: [
      'Proveedor: Ángel Enrique Hernández Rizo, persona física que ofrece el servicio bajo el nombre comercial VeloDrive; Mar Caribe 442, Vista Bugambilias, Villa de Álvarez, Colima, C.P. 28979, México; privacidad: RIZOA1333@gmail.com; soporte: rizovsolutions@gmail.com. VeloDrive ofrece un panel para lotes de autos con herramientas de inventario, atención de prospectos y apoyo para crear o publicar contenido.',
      'Cuenta y uso: el usuario debe mantener sus credenciales seguras, tener autorización para conectar sus cuentas y revisar la información generada o publicada. El contenido generado por IA puede contener errores y debe verificarse antes de utilizarse.',
      'Plan, cupo y cobro: $10,000 MXN mensuales más IVA, con cobro recurrente mensual procesado por Stripe. El total con impuestos debe mostrarse en la pantalla de pago. Los CFDI no se emiten automáticamente con cada cargo; el cliente puede solicitarlos a soporte y VeloDrive los tramitará manualmente con los datos fiscales requeridos. VeloDrive ofrecerá el servicio a un máximo de 15 lotes de autos ubicados en el estado de Colima; las nuevas instalaciones dependerán de que haya cupo disponible. Este máximo se refiere al número de clientes de VeloDrive, no a los autos, usuarios, conversaciones ni publicaciones de cada cuenta. El cupo limitado no concede a un cliente exclusividad territorial, municipal, por marca ni por segmento. El uso está sujeto a la disponibilidad, cuotas y reglas de proveedores externos.',
      'Disponibilidad y soporte: soporte por correo en rizovsolutions@gmail.com, de lunes a viernes, de 7:00 a 21:00, hora local de Colima. El objetivo es enviar una primera respuesta dentro de una hora durante ese horario; ese plazo es para responder y no garantiza que el problema quede resuelto en una hora. Los mensajes fuera del horario se atenderán en el siguiente horario hábil. VeloDrive realizará esfuerzos razonables para mantener el servicio, pero puede haber interrupciones por mantenimiento, fallas de internet, plataformas externas o causas fuera de su control; no se promete disponibilidad ininterrumpida. Podrá limitar o suspender temporalmente el acceso ante falta de pago, riesgos de seguridad, uso ilegal, incumplimiento de estos términos o de reglas de proveedores, o para cumplir una obligación legal. Cuando sea posible, se avisará al usuario y se explicará cómo corregir el incumplimiento. Cada cliente es responsable de contar con derechos y base legal para los datos y contenidos que cargue, y de revisar las publicaciones antes de autorizarlas.',
      'Resultados y responsabilidad: VeloDrive prestará el servicio con cuidado razonable, pero no garantiza resultados comerciales, ventas, respuestas de prospectos ni exactitud de contenido generado por inteligencia artificial o servicios externos. El usuario debe revisar y aprobar el contenido antes de publicarlo y mantener copias de la información importante. La responsabilidad de cada parte se determinará conforme a la ley aplicable; estos términos no eliminan derechos irrenunciables ni responsabilidades que legalmente no puedan excluirse.',
      'Ley y jurisdicción: estos términos se interpretan conforme a las leyes de México. Para las controversias que legalmente puedan someterse a elección de foro, las partes se someten a los tribunales competentes de Colima, sin limitar derechos irrenunciables que correspondan al usuario.',
      'Estos términos aplican desde su aceptación. La versión vigente y su fecha se mostrarán en el panel. Los cambios materiales se comunicarán al correo registrado y mediante un aviso dentro del panel; cuando el cambio requiera consentimiento, se solicitará antes de aplicarlo. La aceptación se registra con la versión y fecha correspondientes.'
    ]
  },
  cancelacion: {
    title: 'Cancelación y reembolsos',
    paragraphs: [
      'Puedes solicitar la cancelación desde el portal de facturación de Stripe. La cancelación evita futuras renovaciones y el acceso continúa hasta el final del periodo ya pagado.',
      'No se ofrecen reembolsos por periodos iniciados ni por tiempo no utilizado, salvo cuando la ley aplicable disponga lo contrario.',
      'La cancelación no elimina inmediatamente la cuenta. VeloDrive gestionará manualmente la eliminación de los datos operativos y respaldos dentro de un plazo máximo de una semana después de que termine el periodo pagado. Los comprobantes fiscales se conservarán durante el plazo exigido por las obligaciones aplicables. Para ejercer derechos de privacidad, escribe a RIZOA1333@gmail.com.'
    ]
  }
};

function documentosLegalesListos() {
  return Object.values(LEGAL_TEXTS).every(doc =>
    !/borrador/i.test(doc.title) &&
    doc.paragraphs.every(paragraph => !/\[PENDIENTE:/i.test(paragraph))
  );
}

function prepararCambioPassword() {
  const email = document.getElementById('recoveryEmail');
  const emailWrap = document.getElementById('recoveryEmailWrap');
  const passwordWrap = document.getElementById('newPasswordWrap');
  const button = document.getElementById('recoverySubmitBtn');
  const message = document.getElementById('recoveryMessage');
  const recoveryLink = passwordRecoveryActive || directPasswordChange || new URLSearchParams(window.location.search).get('type') === 'recovery';
  if (email && currentUser?.email) email.value = currentUser.email;
  if (emailWrap) emailWrap.classList.toggle('hidden', recoveryLink);
  if (passwordWrap) passwordWrap.classList.toggle('hidden', !recoveryLink);
  if (button) button.textContent = recoveryLink ? 'Guardar nueva contraseña' : 'Enviar enlace de recuperación';
  if (message) message.textContent = recoveryLink ? 'Elige una contraseña de al menos 8 caracteres.' : '';
  const passwordInput = document.getElementById('newPassword');
  if (passwordInput) passwordInput.required = recoveryLink;
}

async function handlePasswordRecoverySubmit(event) {
  event.preventDefault();
  const recoveryLink = passwordRecoveryActive || directPasswordChange || new URLSearchParams(window.location.search).get('type') === 'recovery';
  const message = document.getElementById('recoveryMessage');
  const button = document.getElementById('recoverySubmitBtn');
  if (message) message.className = 'action-status text-center';
  const finish = window.VeloDriveUI.beginSubmit(button, message, 'Procesando…', recoveryLink ? 'Actualizando tu contraseña…' : 'Solicitando enlace de recuperación…');
  if (!finish) return;
  let outcome = 'success';
  try {
    if (recoveryLink) {
      const password = document.getElementById('newPassword').value;
      if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;
      if (message) { message.textContent = 'Contraseña actualizada. Ya puedes iniciar sesión.'; message.classList.add('text-[#4B8B72]'); }
      passwordRecoveryActive = false;
      directPasswordChange = false;
      await supabaseClient.auth.signOut();
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => showView('view-login'), 1200);
    } else {
      const email = document.getElementById('recoveryEmail').value.trim();
      const redirectTo = `${window.location.origin}${window.location.pathname}?type=recovery`;
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      if (message) { message.textContent = 'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.'; message.classList.add('text-[#4B8B72]'); }
    }
  } catch (error) {
    outcome = 'error';
    if (message) { message.textContent = error.message || 'No se pudo completar la solicitud.'; message.classList.add('text-[#A9584A]'); }
  } finally {
    finish(message?.textContent || '', outcome);
  }
}

async function handleManageSubscription() {
  const status = document.getElementById('subscriptionManageMessage');
  const button = document.getElementById('manageSubscriptionBtn');
  const context = captureTenantContext();
  const finish = window.VeloDriveUI.beginSubmit(button, status, 'Abriendo facturación…', 'Preparando el portal seguro de Stripe…');
  if (!finish) return;
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
    const response = await sessionRequests.fetch('/api/stripe-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionData.session.access_token}` },
      body: JSON.stringify({ lote_id: context.loteId }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!isCurrentTenantContext(context)) return;
    if (!response.ok || !result.url) throw new Error(result.message || 'No se pudo abrir el portal de Stripe.');
    if (new URL(result.url).origin !== 'https://billing.stripe.com') throw new Error('El enlace de facturación no es válido.');
    window.location.assign(result.url);
  } catch (error) {
    if (isCurrentTenantContext(context)) finish(error.message || 'No se pudo abrir el portal de Stripe.', 'error');
  } finally {
    finish();
  }
}

// ------------------------------------------------------------
// DOMContentLoaded
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Instalable como app; el service worker es solo de red y nunca guarda
  // respuestas autenticadas, fichas de autos ni información de clientes.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('[VeloDrive] No se pudo preparar la instalación de la app:', error);
    });
  }

  let installPromptEvent = null;
  const installButton = document.getElementById('pwaInstallBtn');
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isInstalled && installButton) installButton.hidden = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPromptEvent = event;
  });
  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    if (installButton) installButton.hidden = true;
  });
  if (installButton) installButton.addEventListener('click', async () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      installPromptEvent = null;
      if (choice?.outcome === 'accepted') installButton.hidden = true;
      return;
    }

    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const instructions = isAppleMobile
      ? 'En Safari, toca Compartir y luego “Agregar a pantalla de inicio”.'
      : 'Abre el menú del navegador y elige “Instalar aplicación” o “Agregar a pantalla de inicio”.';
    window.alert(`Para instalar VeloDrive: ${instructions}`);
  });

  // Helper: listener seguro que no revienta si el elemento no existe
  function on(id, event, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  }

  // ── PRIMERO: login y registro — estos SIEMPRE deben funcionar ──────────
  on('loginForm',    'submit', handleLoginSubmit);
  on('registroForm', 'submit', handleRegistroSubmit);
  on('passwordRecoveryForm', 'submit', handlePasswordRecoverySubmit);
  on('forgotPasswordBtn', 'click', () => { directPasswordChange = false; passwordRecoveryActive = false; prepararCambioPassword(); showView('view-password-recovery'); });
  on('recoveryBackBtn', 'click', async () => {
    const volverAlDashboard = directPasswordChange && currentUser && currentLote;
    directPasswordChange = false;
    passwordRecoveryActive = false;
    window.history.replaceState({}, '', window.location.pathname);
    if (volverAlDashboard) showView('view-dashboard');
    else {
      if (currentUser) await supabaseClient.auth.signOut();
      showView('view-login');
    }
  });
  on('changePasswordBtn', 'click', () => { directPasswordChange = true; prepararCambioPassword(); showView('view-password-recovery'); });
  on('manageSubscriptionBtn', 'click', handleManageSubscription);
  on('legalDialogClose', 'click', () => {
    const dialog = document.getElementById('legalDialog');
    dialog.classList.add('hidden');
    dialog.classList.remove('flex');
  });
  document.querySelectorAll('[data-legal-open]').forEach(button => button.addEventListener('click', () => {
    const doc = LEGAL_TEXTS[button.dataset.legalOpen];
    if (!doc) return;
    document.getElementById('legalDialogTitle').textContent = doc.title;
    const content = document.getElementById('legalContent');
    content.replaceChildren(...doc.paragraphs.map(paragraph => {
      const p = document.createElement('p');
      p.textContent = paragraph;
      return p;
    }));
    const dialog = document.getElementById('legalDialog');
    const notice = dialog.querySelector('[data-legal-draft-notice]');
    if (notice) notice.textContent = documentosLegalesListos()
      ? `Versión ${LEGAL_VERSION} · Vigente desde ${LEGAL_EFFECTIVE_DATE}.`
      : 'Documento en preparación: completa los campos pendientes y revisa su contenido antes de publicarlo.';
    dialog.classList.remove('hidden');
    dialog.classList.add('flex');
  }));

  on('to-login-btn',    'click', (e) => { e.preventDefault(); showView('view-login'); });
  on('to-registro-btn', 'click', (e) => { e.preventDefault(); showView('view-registro'); });

  on('registroEstado', 'change', (e) => {
    const box   = document.getElementById('registroPrecioBox');
    const texto = document.getElementById('registroPrecioTexto');
    if (!box || !texto) return;
    if (!e.target.value) { box.classList.add('hidden'); return; }
    texto.textContent = STRIPE_TEST_MODE
      ? `Prueba: ${formatCurrency(PRECIO_PLAN_MXN)} al mes · sin cobro real`
      : STRIPE_LIVE_QA_MODE
        ? `Prueba con cobro real: ${formatCurrency(PRECIO_PLAN_MXN)} al mes · recurrente`
        : `${formatCurrency(PRECIO_PLAN_MXN)} + IVA`;
    box.classList.remove('hidden');
  });

  // ── SEGUNDO: detectar sesión y mostrar la vista correcta ───────────────
  await checkSessionAndLote();
  handleStripeReturn();
  handleSocialReturn();

  // ── TERCERO: listeners del dashboard (solo si los elementos existen) ───
  on('subscriptionPayBtn', 'click', async () => {
    if (!currentLote) return;
    try { await redirigirAStripeCheckout(currentLote); }
    catch (error) { showActionToast(error.message || 'No se pudo preparar el pago.', 'error'); }
  });
  on('btnRefrescarQr',    'click', () => cargarEstadoWhatsappQr({renovar:true}));
  on('btnConectarRedes',  'click', conectarRedesSociales);
  on('btnVerificarRedes', 'click', verificarRedesSociales);
  on('logoutBtn', 'click', async () => {
    clearTenantContext();
    try { await supabaseClient.auth.signOut({ scope: 'local' }); }
    finally { window.sessionStorage.removeItem('p360-auth-session'); window.location.replace(window.location.pathname); }
  });
  on('closeDrawerBtn',  'click', closeDrawer);
  on('drawerOverlay',   'click', closeDrawer);
  document.addEventListener('keydown',event=>{
    const drawer=document.getElementById('drawerPro');
    if(!drawer?.classList.contains('drawer-open'))return;
    if(event.key==='Escape'){event.preventDefault();closeDrawer();return;}
    if(event.key!=='Tab')return;
    const controls=[...drawer.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
      .filter(element=>!element.disabled&&element.tabIndex>=0&&!element.closest('[inert]')&&element.getClientRects().length);
    const first=controls[0],last=controls[controls.length-1];
    if(!drawer.contains(document.activeElement)){event.preventDefault();first?.focus();}
    else if(event.shiftKey&&(document.activeElement===first||document.activeElement===document.getElementById('drawerTitle'))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  on('btnPauseAiChat', 'click', pauseAiForActiveChat);
  on('btnResumeAiChat', 'click', resumeAiForActiveChat);

  on('configForm', 'submit', handleConfigSubmit);

  const modalCar = document.getElementById('modalCarOverlay');

  on('btnAbrirModalCar', 'click', () => {
    carEditorVersion += 1;
    editingCarId = null;
    carImageUrls = [];
    const form = document.getElementById('formNuevoCar');
    if (form) form.reset();
    document.getElementById('carStatus').disabled=false;
    const urlEl = document.getElementById('carImageUrl');
    if (urlEl) urlEl.value = '';
    const statusEl = document.getElementById('uploadStatusText');
    if (statusEl) statusEl.textContent = '';
    renderCarThumbs();
    const title = document.getElementById('modalCarTitle');
    if (title) title.textContent = 'Registrar Nuevo Vehículo';
    const btnSubmit = document.getElementById('btnSubmitCarForm');
    if (btnSubmit) btnSubmit.textContent = 'Guardar Unidad en Sistema';
    if (modalCar) {
      modalCar.classList.remove('hidden');
      document.getElementById('carBrand')?.focus();
    }
  });

  on('btnCerrarModalCar', 'click', () => {
    carEditorVersion += 1;
    if (modalCar) modalCar.classList.add('hidden');
    document.getElementById('btnAbrirModalCar')?.focus();
  });

  if (modalCar) modalCar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      modalCar.classList.add('hidden');
      document.getElementById('btnAbrirModalCar')?.focus();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(modalCar.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const modalVenta=document.getElementById('modalVentaOverlay');
  on('ventasYear','change',renderVentasMensuales);
  on('btnActualizarVentas','click',async()=>{
    if(!currentLote||catalogModeActive)return;
    const context=captureTenantContext();
    const finish=window.VeloDriveUI.beginSubmit(document.getElementById('btnActualizarVentas'),document.getElementById('ventasCargaEstado'),'Actualizando…','Consultando ventas…');if(!finish)return;
    try{const fresh=await fetchCars();if(isCurrentTenantContext(context))finish(fresh?'Ventas actualizadas.':'No se pudieron actualizar las ventas.',fresh?'success':'error');}
    catch(_){if(isCurrentTenantContext(context))finish('No se pudieron actualizar las ventas.','error');}
    finally{finish();}
  });
  on('btnCerrarVenta','click',cerrarVenta);
  on('formVenta','submit',handleSaleSubmit);
  document.addEventListener('keydown',event=>{
    if(!modalVenta||modalVenta.classList.contains('hidden'))return;
    if(event.key==='Escape'){event.preventDefault();cerrarVenta();return;}
    if(event.key!=='Tab')return;
    const controls=[...modalVenta.querySelectorAll('button,input,select')].filter(element=>!element.disabled&&element.getClientRects().length);
    const first=controls[0],last=controls[controls.length-1];
    if(!modalVenta.contains(document.activeElement)){event.preventDefault();first?.focus();}
    else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });

  // Import CSV
  const btnImportar = document.getElementById('btnImportarExcel');
  const fileInputExcel = document.getElementById('excelFileInput');
  if (btnImportar && fileInputExcel) {
    btnImportar.addEventListener('click', () => fileInputExcel.click());
    fileInputExcel.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file || !currentLote || catalogModeActive || fileInputExcel.disabled) return;
      const context = captureTenantContext();
      const finish = window.VeloDriveUI.beginSubmit(btnImportar, document.getElementById('importStatus'), 'Importando…', 'Leyendo el archivo CSV…');
      if (!finish) return;
      if (file.size > 2 * 1024 * 1024) { finish('El CSV debe pesar hasta 2 MB.', 'error'); fileInputExcel.value = ''; return; }
      fileInputExcel.disabled = true;
      const reader = new FileReader();
      reader.onerror = () => { finish('No se pudo leer el archivo CSV.', 'error'); fileInputExcel.disabled = false; fileInputExcel.value = ''; };
      reader.onload = async function(event) {
        let persisted = false;
        try {
        const text = event.target.result;
        const lineas = text.split('\n');
        if (lineas.length <= 1 || lineas.length > 502) throw new Error('CSV_ROWS_INVALID');
        const headers = lineas[0].split(',').map(h => h.trim().toLowerCase());
        const autosParaInsertar = [];
        for (let i = 1; i < lineas.length; i++) {
          if (!lineas[i].trim()) continue;
          const celdas = lineas[i].split(',').map(c => c.trim());
          if (celdas.length >= 4) {
            autosParaInsertar.push({
              lote_id: context.loteId,
              brand: celdas[headers.indexOf('marca')] || celdas[headers.indexOf('brand')] || 'Genérico',
              model: celdas[headers.indexOf('modelo')] || celdas[headers.indexOf('model')] || 'Unidad',
              year: parseInt(celdas[headers.indexOf('año')]) || parseInt(celdas[headers.indexOf('year')]) || new Date().getFullYear(),
              price: parseFloat(celdas[headers.indexOf('precio')]) || parseFloat(celdas[headers.indexOf('price')]) || 0,
              transmision: celdas[headers.indexOf('transmision')] || 'Automática',
              kilometraje: parseFloat(celdas[headers.indexOf('kilometraje')]) || 0,
              enganche_minimo: parseFloat(celdas[headers.indexOf('enganche')]) || 0,
              status: 'Disponible',
              image_url: PLACEHOLDER_IMG
            });
          }
        }
        if (!isCurrentTenantContext(context)) return;
        if (autosParaInsertar.length > 0 && autosParaInsertar.length <= 500) {
          document.getElementById('importStatus').textContent = `Guardando ${autosParaInsertar.length} vehículos…`;
          const { error } = await supabaseClient.from('cars').insert(autosParaInsertar);
          if (error) throw new Error('CSV_INSERT_FAILED');
          persisted = true;
          const fresh = await fetchCars();
          if (isCurrentTenantContext(context)) finish(fresh ? `Se importaron ${autosParaInsertar.length} vehículos.` : 'Importación guardada. No se pudo actualizar la vista; actualiza el inventario sin importar otra vez.', fresh ? 'success' : 'error');
        } else throw new Error('CSV_EMPTY');
        } catch (_) {
          if (isCurrentTenantContext(context)) finish(persisted ? 'Importación guardada. Actualiza el inventario sin importar otra vez.' : 'No se confirmó la importación. Revisa el formato y el inventario antes de intentar otra vez. Máximo 500 vehículos.', 'error');
        } finally { finish(); fileInputExcel.value = ''; fileInputExcel.disabled = false; }
      };
      try { reader.readAsText(file); }
      catch (_) { finish('No se pudo leer el CSV.', 'error'); fileInputExcel.value = ''; fileInputExcel.disabled = false; }
    });
  }

  // Upload de fotos de autos
  const imageInput = document.getElementById('carImageFile');
  if (imageInput) imageInput.addEventListener('change', subirFotosVehiculo);

  // Submit form de unidad: muestra el progreso y bloquea envíos repetidos.
  on('formNuevoCar', 'submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSubmitCarForm');
    if (btnSubmit?.disabled) return;
    if (!currentLote) return;
    if (isNaN(parseInt(document.getElementById('carYear').value)) || isNaN(parseFloat(document.getElementById('carPrice').value))) {
      alert('Revisa el año y el precio: deben ser números válidos.');
      return;
    }
    const statusText = document.getElementById('uploadStatusText');
    const esEdicion = Boolean(editingCarId);
    const originalCar=esEdicion?carsCache.find(car=>String(car.id)===String(editingCarId)):null;
    if(document.getElementById('carStatus').value==='Vendido'&&originalCar?.status!=='Vendido'){
      statusText.textContent='Registra el precio real y la fecha desde Marcar Vendido.';
      statusText.setAttribute('role','alert');return;
    }
    const textoOriginal = btnSubmit?.textContent.trim() || 'Guardar Unidad en Sistema';
    const finishSubmit = window.VeloDriveUI?.beginSubmit(
      btnSubmit,
      statusText,
      esEdicion ? 'Actualizando vehículo…' : 'Guardando vehículo…',
      esEdicion ? 'Actualizando la información del vehículo…' : 'Guardando el vehículo…'
    );
    if (!finishSubmit) return;
    const carData = {
      lote_id: currentLote.id,
      brand: document.getElementById('carBrand').value.trim(),
      model: document.getElementById('carModel').value.trim(),
      year: parseInt(document.getElementById('carYear').value),
      price: parseFloat(document.getElementById('carPrice').value),
      image_url: document.getElementById('carImageUrl').value.trim() || PLACEHOLDER_IMG,
      image_urls: carImageUrls,
      status: originalCar?.status==='Vendido'?'Vendido':document.getElementById('carStatus').value,
      transmision: document.getElementById('carTransmision').value,
      kilometraje: parseFloat(document.getElementById('carKilometraje').value) || 0,
      enganche_minimo: parseFloat(document.getElementById('carEnganche').value) || 0,
      caracteristicas: document.getElementById('carCaracteristicas')?.value.trim() || null
    };
    try {
      const response = esEdicion
        ? await supabaseClient.from('cars').update(carData).eq('id', editingCarId).eq('lote_id', currentLote.id)
        : await supabaseClient.from('cars').insert(carData);
      if (response.error) throw response.error;
      e.target.reset();
      editingCarId = null;
      carImageUrls = [];
      renderCarThumbs();
      await fetchCars();
      finishSubmit(esEdicion ? 'Vehículo actualizado.' : 'Vehículo agregado.', 'success');
      showActionToast(esEdicion ? 'Vehículo actualizado.' : 'Vehículo agregado al inventario.');
      if (modalCar) modalCar.classList.add('hidden');
    } catch (error) {
      console.error('[Inventario] Error al guardar carro:', error);
      finishSubmit('No se pudo guardar el vehículo. Revisa tu conexión e inténtalo de nuevo.', 'error');
      showActionToast('No se pudo guardar el vehículo. Revisa tu conexión.', 'error');
    } finally {
      if (btnSubmit?.disabled || btnSubmit?.getAttribute('aria-busy') === 'true') finishSubmit(textoOriginal, 'error');
    }
  });
  // Sidebar móvil
  on('openSidebar', 'click', () => {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if (sb) sb.classList.remove('-translate-x-full');
    if (ov) ov.classList.remove('hidden');
  });
  on('closeSidebar', 'click', () => {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if (sb) sb.classList.add('-translate-x-full');
    if (ov) ov.classList.add('hidden');
  });
  on('overlay', 'click', () => {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    if (sb) sb.classList.add('-translate-x-full');
    if (ov) ov.classList.add('hidden');
  });

  initSidebarNav();
  initMarketingModule();
  initCatalogMode();
  initCitasCalendario();
  initDrawerTabs();
});

// ------------------------------------------------------------
// UTILIDADES GLOBALES
// ------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(rawUrl, fallback = '') {
  if (!rawUrl) return fallback;
  try {
    const parsed = new URL(String(rawUrl), window.location.origin);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch (_) {}
  return fallback;
}

const CATALOG_REDACTED = '•••• Protegido';

async function crearUrlDocumentoPrivado(valor) {
  if (!valor || !currentLote?.id) return '';
  let objectPath = String(valor).trim();
  try {
    if (/^https?:\/\//i.test(objectPath)) {
      const parsed = new URL(objectPath);
      if (parsed.origin !== new URL(SUPABASE_URL).origin) return '';
      const prefix = '/storage/v1/object/public/documentos-leads/';
      if (!parsed.pathname.startsWith(prefix)) return '';
      objectPath = parsed.pathname.slice(prefix.length);
    }
    objectPath = objectPath.split('/').map(segment => decodeURIComponent(segment)).join('/');
  } catch (_) {
    return '';
  }
  if (!objectPath.startsWith(`${currentLote.id}/`)) return '';
  const { data, error } = await supabaseClient.storage
    .from('documentos-leads')
    .createSignedUrl(objectPath, 300);
  if (error) {
    console.warn('[Documentos] No fue posible abrir el documento privado.');
    return '';
  }
  return sanitizeUrl(data?.signedUrl || '', '');
}

function renderDocPreview(rawUrl, emoji, label, noDisponible = false) {
  const url = sanitizeUrl(rawUrl, '');
  if (!url) {
    const estado = noDisponible ? 'Requiere migración o permiso' : 'Pendiente';
    return `<div class="w-full flex items-center justify-between bg-[#161922] text-[#9CA3AF] text-xs px-3 py-2 rounded-lg border border-[#272A30] mt-2"><span>${emoji} ${escapeHtml(label)}</span> <span class="text-[10px] italic">${estado}</span></div>`;
  }
  return `<div class="w-full p-2.5 rounded-lg text-xs mt-2" style="background: var(--surface-2);">
    <span class="font-bold flex items-center gap-1.5 text-[#F5F5F4] mb-2"><span class="status-dot"></span>${emoji} ${escapeHtml(label)}</span>
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="block rounded-lg overflow-hidden border border-[#272A30]">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" class="w-full max-h-40 object-cover" loading="lazy" data-url="${escapeHtml(url)}" data-label="${escapeHtml(label)}" data-doc-preview>
    </a>
  </div>`;
}

document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.matches('[data-doc-preview]')) handleDocPreviewError(event.target);
}, true);

function handleDocPreviewError(imgEl) {
  const url = imgEl.dataset.url || '';
  const label = imgEl.dataset.label || 'Documento';
  const wrapper = imgEl.closest('a');
  if (!wrapper) return;
  wrapper.outerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="w-full flex items-center justify-between text-xs font-semibold px-3 py-2 rounded-lg transition" style="background: var(--surface-3, #1c2029);"><span class="flex items-center gap-1.5 text-[#F5F5F4]">📄 ${escapeHtml(label)}</span> <span class="text-[10px] text-[#6B7280] font-semibold">Ver Archivo →</span></a>`;
}

// FIX #10: parseFechaMx robusto — maneja offsets explícitos y asume UTC solo si no hay info de zona
function parseFechaMx(str) {
  if (!str) return new Date();
  let s = String(str).trim();
  // Normalizar espacio entre fecha y hora/offset
  s = s.replace(' ', 'T');
  // Supabase a veces manda +00 sin minutos (ej: 2026-09-19T07:38:00+00)
  // Convertir a +00:00 para que Date() lo parsee correctamente
  s = s.replace(/([+-]\d{2})$/, '$1:00');
  // Si no tiene offset ni Z, agregar Z (UTC)
  if (!/Z$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s)) s = s + 'Z';
  return new Date(s);
}

function formatCurrency(v) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(v) || 0);
}
function formatDate(d) {
  if (!d) return '---';
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) + ' hrs';
}
function formatDateShort(d) {
  if (!d) return '---';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
}
