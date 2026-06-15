// ============================================================
// PROJECT 360 - dashboard.js (PRODUCCIÓN FINAL CON PERSISTENCIA)
// SPA: registro / login / dashboard / whatsapp multi-tenant
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

// CONFIGURACIÓN DE EVOLUTION API DESDE RAILWAY
const EVOLUTION_API_URL = 'evolution-api-production-3652.up.railway.app/v2'; 
const EVOLUTION_GLOBAL_KEY = '600d6bfcce4e4d8e656b1d07fdbdc2b97fd6ba4a0';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

// Variables de Control Global
let currentUser = null;
let currentLote = null;
let syncIntervalId = null;

let leadsCache = [];
let carsCache = [];

// Cambiador Global de Vistas SPA
function showView(viewId) {
  ['view-registro', 'view-login', 'view-dashboard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(viewId);
  if (target) target.classList.remove('hidden');
}

function stopSync() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

function startSync() {
  stopSync();
  fetchAndRenderAll();
  checarEstatusWhatsApp(); // Verifica estatus multi-tenant al arrancar
  syncIntervalId = setInterval(fetchAndRenderAll, 10000); // 10 Segundos en vivo
}

async function fetchAndRenderAll() {
  if (!currentUser || !currentLote) {
    stopSync();
    return;
  }
  try {
    await Promise.all([fetchLeads(), fetchCars()]);
  } catch (err) {
    console.error('[Sync Core] Error de refresco automatizado:', err);
  }
}

// ------------------------------------------------------------
// SECCIÓN LEADS (PROSPECTOS CALIFICADOS POR IA)
// ------------------------------------------------------------
async function fetchLeads() {
  const { data, error } = await supabaseClient
    .from('leads')
    .select('*')
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Leads Engine] Error de consulta:', error);
    return;
  }
  leadsCache = data || [];
  renderLeads();
  renderCitas();
  renderMonitorMensajes();
  renderLeadsCounters();
}

function renderLeadsCounters() {
  const leadsCountEl = document.getElementById('leadsCount');
  const citasCountEl = document.getElementById('citasCount');
  const pipeNuevoEl = document.getElementById('pipeNuevo');
  const pipePendienteEl = document.getElementById('pipePendiente');
  const pipeCitaEl = document.getElementById('pipeCita');

  const pendientes = leadsCache.filter(l => l.status === 'Pendiente').length;
  const citas = leadsCache.filter(l => !!l.fecha_cita).length;
  const nuevos = leadsCache.filter(l => l.status === 'Nuevo').length;

  if (leadsCountEl) leadsCountEl.textContent = pendientes;
  if (citasCountEl) citasCountEl.textContent = citas;
  if (pipeNuevoEl) pipeNuevoEl.textContent = `${nuevos} conversaciones en proceso`;
  if (pipePendienteEl) pipePendienteEl.textContent = `${pendientes} leads listos en Dashboard`;
  if (pipeCitaEl) pipeCitaEl.textContent = `${citas} citas registradas`;
}

function renderLeads() {
  const container = document.getElementById('leadsList');
  if (!container) return;

  if (leadsCache.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center">Sin prospectos precalificados.</p>';
    return;
  }

  container.innerHTML = leadsCache.map(lead => `
    <div class="flex items-center justify-between p-3 border-b border-slate-50 hover:bg-slate-50/60 transition">
      <div>
        <p class="font-semibold text-sm text-slate-800">${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</p>
        <p class="text-xs text-slate-500 font-mono">${escapeHtml(lead.telefono || '')}</p>
        <span class="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Pendiente')}</span>
      </div>
      <button data-lead-id="${lead.id}" class="btn-ver-perfil text-[11px] bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition font-medium">
        Ver Perfil Pro
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-ver-perfil').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.getAttribute('data-lead-id')));
  });
}

function renderCitas() {
  const container = document.getElementById('citasListContainer');
  if (!container) return;
  const citas = leadsCache.filter(l => !!l.fecha_cita);

  if (citas.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center">No hay citas agendadas el día de hoy.</p>';
    return;
  }

  container.innerHTML = citas.map(lead => `
    <div class="flex items-center justify-between p-3 border-b border-slate-50">
      <div>
        <p class="font-semibold text-sm text-slate-800">${escapeHtml(lead.nombre || 'Cliente Patio')}</p>
        <p class="text-xs text-slate-400 font-mono">${escapeHtml(lead.telefono || '')}</p>
      </div>
      <span class="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">${formatDate(lead.fecha_cita)}</span>
    </div>
  `).join('');
}

function renderMonitorMensajes() {
  const container = document.getElementById('monitorMensajesContainer');
  if (!container) return;
  const conMensajes = leadsCache.filter(l => l.ultimo_mensaje);

  if (conMensajes.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center">Esperando tráfico de webhooks de n8n...</p>';
    return;
  }

  container.innerHTML = conMensajes.map(lead => `
    <div class="p-3 border-b border-slate-50">
      <div class="flex justify-between">
        <p class="text-xs font-bold text-slate-700 font-mono">${escapeHtml(lead.telefono || '')}</p>
        <span class="text-[10px] text-indigo-500 font-medium bg-slate-100 px-1.5 rounded">${escapeHtml(lead.auto_interes || 'General')}</span>
      </div>
      <p class="text-xs text-slate-500 truncate mt-1 bg-white p-1.5 border border-slate-100 rounded italic">"${escapeHtml(lead.ultimo_mensaje)}"</p>
    </div>
  `).join('');
}

function statusBadgeClass(status) {
  switch (status) {
    case 'Pendiente': return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'Calificado': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'Descartado': return 'bg-rose-50 text-rose-700 border border-rose-200';
    default: return 'bg-slate-50 text-slate-600';
  }
}

// ------------------------------------------------------------
// SECCIÓN INVENTARIO (CARS)
// ------------------------------------------------------------
async function fetchCars() {
  const { data, error } = await supabaseClient
    .from('cars')
    .select('*')
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Inventory Engine] Fallo:', error);
    return;
  }
  carsCache = data || [];
  renderCars();
  renderCarsCounter();
  calcularMetricasInventario();
}

function renderCarsCounter() {
  const carsCountEl = document.getElementById('carsCount');
  if (carsCountEl) {
    carsCountEl.textContent = carsCache.filter(car => car.status !== 'Vendido').length;
  }
}

function calcularMetricasInventario() {
  const invValorTotalEl = document.getElementById('invValorTotal');
  const invGananciasTotalesEl = document.getElementById('invGananciasTotales');

  let valorTotal = 0;
  let gananciasTotales = 0;

  carsCache.forEach(car => {
    const precio = Number(car.price) || 0;
    if (car.status === 'Vendido') {
      gananciasTotales += precio;
    } else {
      valorTotal += precio;
    }
  });

  if (invValorTotalEl) invValorTotalEl.textContent = formatCurrency(valorTotal);
  if (invGananciasTotalesEl) invGananciasTotalesEl.textContent = formatCurrency(gananciasTotales);
}

function renderCars() {
  const tbody = document.getElementById('carsTableBody');
  if (!tbody) return;

  if (carsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-xs text-slate-400 p-8">No hay unidades vehiculares en exhibición.</td></tr>';
    return;
  }

  tbody.innerHTML = carsCache.map(car => {
    const shortId = car.id ? String(car.id).slice(-6) : '---';
    const unidadNombre = `${car.brand} ${car.model}`;
    const esVendido = car.status === 'Vendido';
    
    const botonEstatus = !esVendido 
      ? `<button data-action-id="${car.id}" class="btn-marcar-vendido bg-emerald-600 text-white text-[11px] px-2.5 py-1 rounded-md font-semibold hover:bg-emerald-700 transition">Marcar Vendido</button>`
      : `<span class="text-xs text-slate-400 font-medium italic">Unidad Entregada</span>`;

    return `
      <tr class="hover:bg-slate-50/60 transition border-b border-slate-100">
        <td class="px-4 py-3.5 text-xs font-mono text-slate-400 font-bold">#${shortId}</td>
        <td class="px-4 py-3.5 font-medium text-slate-800 text-sm">
          <div class="flex items-center gap-2">
            ${car.image_url ? `<a href="${car.image_url}" target="_blank" class="text-indigo-500 opacity-70 hover:opacity-100">🖼️</a>` : ''}
            <span>${escapeHtml(unidadNombre)}</span>
          </div>
        </td>
        <td class="px-4 py-3.5 text-sm text-slate-500">${escapeHtml(String(car.year || ''))}</td>
        <td class="px-4 py-3.5 text-sm font-bold text-slate-800">${formatCurrency(car.price)}</td>
        <td class="px-4 py-3.5">
          <span class="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${car.status === 'Disponible' ? 'bg-green-50 text-green-700 border border-green-200' : car.status === 'Apartado' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500'}">${car.status}</span>
        </td>
        <td class="px-4 py-3.5 text-right">${botonEstatus}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-marcar-vendido').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error } = await supabaseClient.from('cars').update({ status: 'Vendido' }).eq('id', btn.getAttribute('data-action-id'));
      if (error) alert('Error al actualizar estatus');
      await fetchCars();
    });
  });
}

// ------------------------------------------------------------
// DRAWER PERFIL PRO
// ------------------------------------------------------------
function openDrawer(leadId) {
  const lead = leadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  document.getElementById('drawerNombre').textContent = lead.nombre || '---';
  document.getElementById('drawerTelefono').textContent = lead.telefono || '---';
  document.getElementById('drawerStatus').textContent = lead.status || '---';
  document.getElementById('drawerFechaCita').textContent = formatDate(lead.fecha_cita);
  document.getElementById('drawerInteres').textContent = lead.auto_interes || '---';
  document.getElementById('drawerUltimoMensaje').textContent = lead.ultimo_mensaje || 'Sin mensajes capturados por n8n';
  document.getElementById('drawerNotas').textContent = lead.notes || lead.notas || 'Sin anotaciones del bot.';

  document.getElementById('drawerPro').classList.add('drawer-open');
  document.getElementById('drawerOverlay').classList.remove('hidden');
}

function closeDrawer() {
  document.getElementById('drawerPro').classList.remove('drawer-open');
  document.getElementById('drawerOverlay').classList.add('hidden');
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
    });
  });
}

function renderConfigLote() {
  if (!currentLote) return;
  if (document.getElementById('configNombreLote')) document.getElementById('configNombreLote').value = currentLote.nombre || '';
  if (document.getElementById('configPhoneLote')) document.getElementById('configPhoneLote').value = currentLote.whatsapp_number || '';
  document.querySelectorAll('.lote-nombre-display').forEach(el => el.textContent = currentLote.nombre);
}

// ------------------------------------------------------------
// SECCIÓN DINÁMICA MULTI-TENANT DE WHATSAPP (EVOLUTION API)
// ------------------------------------------------------------
async function checarEstatusWhatsApp() {
  if (!currentLote) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('whatsapp_channels')
      .select('*')
      .eq('lote_id', currentLote.id)
      .maybeSingle();

    const badge = document.getElementById('wa-badge');
    const statusText = document.getElementById('wa-status-text');
    const instanceDisplay = document.getElementById('wa-instance-display');
    const container = document.getElementById('qr-container');

    if (data) {
      instanceDisplay.textContent = `Instancia: ${data.instance_name}`;
      statusText.textContent = data.status_conexion;
      
      if (data.status_conexion === 'CONECTADO') {
        badge.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
        container.innerHTML = `
          <div class="text-center space-y-2 text-emerald-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <p class="text-sm font-bold">¡Canal Operando Exitosamente!</p>
            <p class="text-xs text-slate-400">La IA se encuentra respondiendo los mensajes en vivo.</p>
          </div>`;
      }
    }
  } catch (err) {
    console.error('Error al verificar estatus del canal:', err);
  }
}

async function ejecutarFlujoConexionWhatsApp() {
  if (!currentLote) return;
  
  const container = document.getElementById('qr-container');
  container.innerHTML = `<p class="text-xs text-slate-500 font-medium animate-pulse">Solicitando canal a Railway...</p>`;

  const cleanName = currentLote.nombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const instanceName = `${cleanName}_instance`;
  const secureToken = Math.random().toString(36).substring(2, 15);

  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_GLOBAL_KEY
      },
      body: JSON.stringify({
        instanceName: instanceName,
        token: secureToken,
        qrcode: true
      })
    });

    const data = await res.json();

    if (data.qrcode && data.qrcode.base64) {
      container.innerHTML = `
        <div class="text-center space-y-3">
          <img src="${data.qrcode.base64}" alt="Código QR" class="mx-auto rounded-lg shadow-md border border-slate-200 max-w-[220px]" />
          <p class="text-[11px] text-amber-600 font-semibold animate-pulse">⚠️ Esperando escaneo desde el celular...</p>
        </div>`;

      // Subimos el canal en la tabla relacional multi-tenant
      await supabaseClient.from('whatsapp_channels').upsert({
        lote_id: currentLote.id,
        instance_name: instanceName,
        api_key: secureToken,
        status_conexion: 'CONECTADO'
      }, { onConflict: 'lote_id' });

      document.getElementById('wa-status-text').textContent = "CONECTADO";
      document.getElementById('wa-badge').className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
      document.getElementById('wa-instance-display').textContent = `Instancia: ${instanceName}`;
    } else {
      container.innerHTML = `<p class="text-xs text-rose-500 font-semibold">La instancia ya está activa o la API rechazó la solicitud.</p>`;
    }
  } catch (error) {
    container.innerHTML = `<p class="text-xs text-rose-500 font-semibold">Error de red al conectar con Railway.</p>`;
    console.error(error);
  }
}

// ------------------------------------------------------------
// GUARDIÁN RUTEADOR
// ------------------------------------------------------------
async function checkSessionAndLote() {
  console.log('[Proyecto 360] Ejecutando análisis estricto de sesión...');
  try {
    const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr || !sessionData || !sessionData.session) {
      currentUser = null;
      currentLote = null;
      showView('view-login');
      return;
    }

    currentUser = sessionData.session.user;
    
    const { data: loteData, error: loteError } = await supabaseClient
      .from('lotes')
      .select('*')
      .eq('profile_id', currentUser.id);

    if (loteData && loteData.length > 0) {
      currentLote = loteData[0];
      renderConfigLote();
      showView('view-dashboard');
      startSync();
      return;
    }

    currentLote = null;
    showView('view-registro');
  } catch (err) {
    console.error('[Guardián] Excepción:', err);
    showView('view-login');
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    if (errorEl) errorEl.textContent = 'Credenciales no válidas.';
    return;
  }
  currentUser = data.user;
  await checkSessionAndLote();
}

async function handleRegistroSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('registroEmail').value.trim();
  const password = document.getElementById('registroPassword').value;
  const nombreLote = document.getElementById('registroNombreLote').value.trim();
  const phoneLote = document.getElementById('registroPhoneLote').value.trim();
  const errorEl = document.getElementById('registroError');
  if (errorEl) errorEl.textContent = '';

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });
  if (signUpError) {
    if (errorEl) errorEl.textContent = signUpError.message;
    return;
  }

  const { data: loteData, error: loteError } = await supabaseClient
    .from('lotes')
    .insert({ profile_id: signUpData.user.id, nombre: nombreLote, whatsapp_number: phoneLote })
    .select().single();

  currentUser = signUpData.user;
  currentLote = loteData;
  renderConfigLote();
  showView('view-dashboard');
  startSync();
}

// ------------------------------------------------------------
// INICIALIZADOR DE EVENTOS DOM
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);
  if (document.getElementById('registroForm')) document.getElementById('registroForm').addEventListener('submit', handleRegistroSubmit);
  
  if (document.getElementById('configForm')) {
    document.getElementById('configForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { data, error } = await supabaseClient.from('lotes').update({
        nombre: document.getElementById('configNombreLote').value.trim(),
        whatsapp_number: document.getElementById('configPhoneLote').value.trim()
      }).eq('id', currentLote.id).select().single();
      if (!error) { currentLote = data; renderConfigLote(); alert('Lote guardado.'); }
    });
  }

  if (document.getElementById('logoutBtn')) {
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      stopSync(); await supabaseClient.auth.signOut(); currentUser = null; currentLote = null; showView('view-login');
    });
  }

  if (document.getElementById('btnGenerarQR')) {
    document.getElementById('btnGenerarQR').addEventListener('click', ejecutarFlujoConexionWhatsApp);
  }

  // Enlaces SPA internos
  document.getElementById('to-login-btn').addEventListener('click', (e) => { e.preventDefault(); showView('view-login'); });
  document.getElementById('to-registro-btn').addEventListener('click', (e) => { e.preventDefault(); showView('view-registro'); });
  document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

  // Modales de Inventario
  const modalCar = document.getElementById('modalCarOverlay');
  document.getElementById('btnAbrirModalCar').addEventListener('click', () => modalCar.classList.remove('hidden'));
  document.getElementById('btnCerrarModalCar').addEventListener('click', () => modalCar.classList.add('hidden'));

  // REGISTRO DE CARROS
  document.getElementById('formNuevoCar').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentLote) return;

    const brand = document.getElementById('carBrand').value.trim();
    const model = document.getElementById('carModel').value.trim();
    const year = parseInt(document.getElementById('carYear').value);
    const price = parseFloat(document.getElementById('carPrice').value);
    const image_url = document.getElementById('carImageUrl').value.trim() || 'https://via.placeholder.com/400x250?text=Sin+Foto';
    const status = document.getElementById('carStatus').value;
    const transmision = document.getElementById('carTransmision').value;
    const kilometraje = parseFloat(document.getElementById('carKilometraje').value) || 0;
    const enganche_minimo = parseFloat(document.getElementById('carEnganche').value) || 0;

    const { error } = await supabaseClient.from('cars').insert({
      lote_id: currentLote.id, brand, model, year, price, image_url, status, transmision, kilometraje, enganche_minimo
    });

    if (error) { alert('Fallo al insertar carro.'); return; }
    e.target.reset();
    modalCar.classList.add('hidden');
    await fetchCars();
  });

  // Sidebar Móvil Control
  document.getElementById('openSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.remove('-translate-x-full'));
  document.getElementById('closeSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.add('-translate-x-full'));

  initSidebarNav();
  await checkSessionAndLote();
});

// Formateadores globales
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatCurrency(v) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(v) || 0);
}
function formatDate(d) {
  if (!d) return '---';
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' hrs';
}