// ============================================================
// PROJECT 360 - dashboard.js (PRODUCCIÓN FINAL CON PERSISTENCIA)
// SPA: registro / login / dashboard
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

// Inicialización de Supabase con almacenamiento local automático para persistencia
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

// ------------------------------------------------------------
// Estado global
// ------------------------------------------------------------
let currentUser = null;
let currentLote = null;
let syncIntervalId = null;

let leadsCache = [];
let carsCache = [];

// ------------------------------------------------------------
// Helpers de vistas
// ------------------------------------------------------------
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
  syncIntervalId = setInterval(fetchAndRenderAll, 10000);
}

// ------------------------------------------------------------
// Sincronización principal (con escudo anti-crash)
// ------------------------------------------------------------
async function fetchAndRenderAll() {
  if (!currentUser || !currentLote) {
    stopSync();
    return;
  }

  try {
    await Promise.all([
      fetchLeads(),
      fetchCars()
    ]);
  } catch (err) {
    console.error('[fetchAndRenderAll] Error de sincronización:', err);
  }
}

// ------------------------------------------------------------
// LEADS
// ------------------------------------------------------------
async function fetchLeads() {
  const { data, error } = await supabaseClient
    .from('leads')
    .select('*')
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchLeads] Error:', error);
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
    container.innerHTML = '<p class="text-sm text-gray-400 p-4">No hay leads registrados.</p>';
    return;
  }

  container.innerHTML = leadsCache.map(lead => `
    <div class="flex items-center justify-between p-3 border-b border-gray-100 hover:bg-gray-50 transition">
      <div>
        <p class="font-semibold text-sm text-gray-800">${escapeHtml(lead.nombre || lead.name || 'Sin nombre')}</p>
        <p class="text-xs text-gray-500">${escapeHtml(lead.telefono || lead.phone_number || '')}</p>
        <span class="inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Pendiente')}</span>
      </div>
      <button data-lead-id="${lead.id}" class="btn-ver-perfil text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition">
        Ver Perfil Pro
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-ver-perfil').forEach(btn => {
    btn.addEventListener('click', () => {
      const leadId = btn.getAttribute('data-lead-id');
      openDrawer(leadId);
    });
  });
}

function renderCitas() {
  const container = document.getElementById('citasListContainer');
  if (!container) return;

  const citas = leadsCache.filter(l => !!l.fecha_cita);

  if (citas.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-400 p-4">No hay citas programadas.</p>';
    return;
  }

  container.innerHTML = citas.map(lead => `
    <div class="flex items-center justify-between p-3 border-b border-gray-100">
      <div>
        <p class="font-semibold text-sm text-gray-800">${escapeHtml(lead.nombre || lead.name || 'Sin nombre')}</p>
        <p class="text-xs text-gray-500">${escapeHtml(lead.telefono || lead.phone_number || '')}</p>
      </div>
      <span class="text-xs font-medium text-indigo-600">${formatDate(lead.fecha_cita)}</span>
    </div>
  `).join('');
}

function renderMonitorMensajes() {
  const container = document.getElementById('monitorMensajesContainer');
  if (!container) return;

  const conMensajes = leadsCache.filter(l => l.ultimo_mensaje || l.encuesta_step !== undefined);

  if (conMensajes.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-400 p-4">Sin mensajes recientes.</p>';
    return;
  }

  container.innerHTML = conMensajes.map(lead => `
    <div class="p-3 border-b border-gray-100">
      <p class="text-xs font-semibold text-gray-700">${escapeHtml(lead.telefono || lead.phone_number || 'Sin número')}</p>
      <p class="text-xs text-gray-500 truncate">Paso encuesta: ${lead.encuesta_step || 0} ${lead.ultimo_mensaje ? `— ${escapeHtml(lead.ultimo_mensaje)}` : ''}</p>
    </div>
  `).join('');
}

function statusBadgeClass(status) {
  switch (status) {
    case 'Pendiente': return 'bg-yellow-100 text-yellow-700';
    case 'Calificado': return 'bg-green-100 text-green-700';
    case 'Descartado': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

// ------------------------------------------------------------
// CARS / INVENTARIO
// ------------------------------------------------------------
async function fetchCars() {
  const { data, error } = await supabaseClient
    .from('cars')
    .select('*')
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchCars] Error:', error);
    return;
  }

  carsCache = data || [];
  renderCars();
  renderCarsCounter();
}

function renderCarsCounter() {
  const carsCountEl = document.getElementById('carsCount');
  if (carsCountEl) carsCountEl.textContent = carsCache.length;
}

function renderCars() {
  const tbody = document.getElementById('carsTableBody');
  if (!tbody) return;

  if (carsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-sm text-gray-400 p-4">No hay unidades en inventario.</td></tr>';
    return;
  }

  tbody.innerHTML = carsCache.map(car => {
    const shortId = car.id ? String(car.id).slice(0, 8) : '---';
    const brandModel = car.brand_model || `${car.marca || ''} ${car.modelo || ''}`.trim() || 'Unidad sin nombre';
    const year = car.year || car.anio || '—';
    const precioFinal = calcularPrecioConComision(car.price || car.precio, car.comision);

    return `
      <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
        <td class="px-4 py-2 text-xs text-gray-500 font-mono">${shortId}</td>
        <td class="px-4 py-2 text-sm text-gray-800">${escapeHtml(brandModel)}</td>
        <td class="px-4 py-2 text-sm text-gray-600">${escapeHtml(String(year))}</td>
        <td class="px-4 py-2 text-sm font-semibold text-gray-800">${formatCurrency(precioFinal)}</td>
        <td class="px-4 py-2">
          <span class="inline-block text-xs px-2 py-0.5 rounded-full ${carStatusBadgeClass(car.status)}">${escapeHtml(car.status || 'Disponible')}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function calcularPrecioConComision(precio, comision) {
  const p = Number(precio) || 0;
  const c = Number(comision) || 0;
  return p + (p * (c / 100));
}

function carStatusBadgeClass(status) {
  switch (status) {
    case 'Disponible': return 'bg-green-100 text-green-700';
    case 'Vendido': return 'bg-gray-200 text-gray-700';
    case 'Apartado': return 'bg-yellow-100 text-yellow-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

// ------------------------------------------------------------
// CONFIGURACIÓN DE LOTE
// ------------------------------------------------------------
function renderConfigLote() {
  if (!currentLote) return;

  const nombreInput = document.getElementById('configNombreLote');
  const phoneInput = document.getElementById('configPhoneLote');

  if (nombreInput) nombreInput.value = currentLote.nombre || '';
  if (phoneInput) phoneInput.value = currentLote.whatsapp_number || '';

  document.querySelectorAll('.lote-nombre-display').forEach(el => {
    el.textContent = currentLote.nombre || 'Mi Lote';
  });
}

async function handleConfigSubmit(e) {
  e.preventDefault();
  if (!currentLote) return;

  const nombreInput = document.getElementById('configNombreLote');
  const phoneInput = document.getElementById('configPhoneLote');

  const updates = {
    nombre: nombreInput ? nombreInput.value.trim() : currentLote.nombre,
    whatsapp_number: phoneInput ? phoneInput.value.trim() : currentLote.whatsapp_number
  };

  const { data, error } = await supabaseClient
    .from('lotes')
    .update(updates)
    .eq('id', currentLote.id)
    .select()
    .single();

  if (error) {
    console.error('[handleConfigSubmit] Error:', error);
    alert('Error al guardar la configuración.');
    return;
  }

  currentLote = data;
  renderConfigLote();
  alert('Configuración guardada exitosamente.');
}

// ------------------------------------------------------------
// DRAWER PRO
// ------------------------------------------------------------
function initDrawer() {
  const drawer = document.getElementById('drawerPro');
  const closeBtn = document.getElementById('closeDrawerBtn');
  const overlay = document.getElementById('drawerOverlay');

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay) overlay.addEventListener('click', closeDrawer);
  if (drawer) drawer.classList.add('hidden');
}

function openDrawer(leadId) {
  const lead = leadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const drawer = document.getElementById('drawerPro');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer) return;

  const fields = {
    drawerNombre: lead.nombre || lead.name,
    drawerTelefono: lead.telefono || lead.phone_number,
    drawerEmail: lead.email,
    drawerStatus: lead.status,
    drawerFechaCita: formatDate(lead.fecha_cita),
    drawerUltimoMensaje: lead.ultimo_mensaje,
    drawerInteres: lead.interes || lead.auto_interes,
    drawerNotas: lead.notas || (lead.enganche ? `Enganche propuesto: ${lead.enganche}` : '')
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '---';
  });

  drawer.classList.remove('hidden');
  drawer.classList.add('drawer-open');
  if (overlay) overlay.classList.remove('hidden');
}

function closeDrawer() {
  const drawer = document.getElementById('drawerPro');
  const overlay = document.getElementById('drawerOverlay');

  if (drawer) {
    drawer.classList.add('hidden');
    drawer.classList.remove('drawer-open');
  }
  if (overlay) overlay.classList.add('hidden');
}

// ------------------------------------------------------------
// SIDEBAR / NAVEGACIÓN INTERNA
// ------------------------------------------------------------
function initSidebarNav() {
  const navButtons = document.querySelectorAll('.nav-btn');
  if (!navButtons.length) return;

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSection = btn.getAttribute('data-section');
      if (!targetSection) return;

      document.querySelectorAll('.dashboard-section').forEach(section => {
        section.classList.add('hidden');
      });

      const target = document.getElementById(targetSection);
      if (target) target.classList.remove('hidden');

      navButtons.forEach(b => b.classList.remove('nav-active'));
      btn.classList.add('nav-active');
    });
  });
}

// ------------------------------------------------------------
// AUTENTICACIÓN
// ------------------------------------------------------------
async function handleLoginSubmit(e) {
  e.preventDefault();

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (errorEl) errorEl.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    if (errorEl) errorEl.textContent = 'Credenciales incorrectas. Intenta de nuevo.';
    console.error('[handleLoginSubmit] Error:', error);
    return;
  }

  currentUser = data.user;
  await checkSessionAndLote();
}

async function handleRegistroSubmit(e) {
  e.preventDefault();

  const emailInput = document.getElementById('registroEmail');
  const passwordInput = document.getElementById('registroPassword');
  const nombreLoteInput = document.getElementById('registroNombreLote');
  const phoneLoteInput = document.getElementById('registroPhoneLote');
  const errorEl = document.getElementById('registroError');

  if (!emailInput || !passwordInput || !nombreLoteInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const nombreLote = nombreLoteInput.value.trim();
  const phoneLote = phoneLoteInput ? phoneLoteInput.value.trim() : '';

  if (errorEl) errorEl.textContent = '';

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (signUpError) {
    if (errorEl) errorEl.textContent = signUpError.message;
    console.error('[handleRegistroSubmit] signUp Error:', signUpError);
    return;
  }

  const userId = signUpData.user ? signUpData.user.id : null;
  if (!userId) {
    if (errorEl) errorEl.textContent = 'No se pudo crear el usuario. Verifica tu correo.';
    return;
  }

  const { data: loteData, error: loteError } = await supabaseClient
    .from('lotes')
    .insert({
      profile_id: userId,
      nombre: nombreLote,
      whatsapp_number: phoneLote
    })
    .select()
    .single();

  if (loteError) {
    if (errorEl) errorEl.textContent = 'Error al crear el lote: ' + loteError.message;
    console.error('[handleRegistroSubmit] lote Error:', loteError);
    return;
  }

  currentUser = signUpData.user;
  currentLote = loteData;

  renderConfigLote();
  showView('view-dashboard');
  startSync();
}

async function handleLogout() {
  stopSync();
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentLote = null;
  leadsCache = [];
  carsCache = [];
  showView('view-login');
}

// 🔥 FUNCIÓN OPTIMIZADA: Comprobación asíncrona con escudo de persistencia
async function checkSessionAndLote() {
  // Primero intentamos recuperar la sesión activa del almacenamiento local
  const { data: sessionData } = await supabaseClient.auth.getSession();
  
  if (!sessionData || !sessionData.session) {
    // Si no hay sesión local, consultamos al servidor por si acaso
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData || !userData.user) {
      currentUser = null;
      currentLote = null;
      showView('view-registro');
      return;
    }
    currentUser = userData.user;
  } else {
    currentUser = sessionData.session.user;
  }

  // Si llegamos aquí, hay usuario autenticado. Buscamos su lote.
  const { data: loteData, error: loteError } = await supabaseClient
    .from('lotes')
    .select('*')
    .eq('profile_id', currentUser.id)
    .maybeSingle();

  if (loteError) {
    console.error('[checkSessionAndLote] Error consultando lote:', loteError);
  }

  if (!loteData) {
    currentLote = null;
    showView('view-registro');
    return;
  }

  currentLote = loteData;
  renderConfigLote();
  showView('view-dashboard');
  startSync();
}

// ------------------------------------------------------------
// UTILIDADES
// ------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '---';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '---';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ------------------------------------------------------------
// INICIALIZACIÓN
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const registroForm = document.getElementById('registroForm');
  const configForm = document.getElementById('configForm');
  const logoutBtn = document.getElementById('logoutBtn');

  if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);
  if (registroForm) registroForm.addEventListener('submit', handleRegistroSubmit);
  if (configForm) configForm.addEventListener('submit', handleConfigSubmit);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Mapeo seguro de los botones de redirección (Alineados con ambos IDs posibles)
  const toLoginBtn = document.getElementById('to-login-btn');
  const goToLoginLink = document.getElementById('goToLoginLink');

  if (toLoginBtn) {
    toLoginBtn.addEventListener('click', (e) => { e.preventDefault(); showView('view-login'); });
  }
  if (goToLoginLink) {
    goToLoginLink.addEventListener('click', (e) => { e.preventDefault(); showView('view-login'); });
  }

  const toRegistroBtn = document.getElementById('to-registro-btn');
  const goToRegistroLink = document.getElementById('goToRegistroLink');

  if (toRegistroBtn) {
    toRegistroBtn.addEventListener('click', (e) => { e.preventDefault(); showView('view-registro'); });
  }
  if (goToRegistroLink) {
    goToRegistroLink.addEventListener('click', (e) => { e.preventDefault(); showView('view-registro'); });
  }

  initDrawer();
  initSidebarNav();

  // Ejecutamos la comprobación de persistencia al arrancar la SPA
  await checkSessionAndLote();
});