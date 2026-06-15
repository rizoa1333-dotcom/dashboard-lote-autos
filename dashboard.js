// ============================================================
// PROJECT 360 - dashboard.js (PRODUCCIÓN FINAL CON PERSISTENCIA)
// SPA: registro / login / dashboard
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

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
// LEADS / PROSPECTOS
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
// CARS / INVENTARIO (MAPEADO A COLUMNAS EN INGLÉS)
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
  calcularMetricasInventario();
}

function renderCarsCounter() {
  const carsCountEl = document.getElementById('carsCount');
  if (carsCountEl) {
    const enExhibicion = carsCache.filter(car => car.status !== 'Vendido').length;
    carsCountEl.textContent = enExhibicion;
  }
}

function calcularMetricasInventario() {
  const invValorTotalEl = document.getElementById('invValorTotal');
  const invGananciasTotalesEl = document.getElementById('invGananciasTotales');

  let valorTotal = 0;
  let gananciasTotales = 0;

  carsCache.forEach(car => {
    const precioFinal = Number(car.price) || 0;

    if (car.status === 'Vendido') {
      gananciasTotales += precioFinal;
    } else {
      valorTotal += precioFinal;
    }
  });

  if (invValorTotalEl) invValorTotalEl.textContent = formatCurrency(valorTotal);
  if (invGananciasTotalesEl) invGananciasTotalesEl.textContent = formatCurrency(gananciasTotales);
}

function renderCars() {
  const tbody = document.getElementById('carsTableBody');
  if (!tbody) return;

  if (carsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-sm text-gray-400 p-4">No hay unidades en inventario.</td></tr>';
    return;
  }

  tbody.innerHTML = carsCache.map(car => {
    const shortId = car.id ? String(car.id).slice(0, 8) : '---';
    const nombreCompleto = `${car.brand || ''} ${car.model || ''}`.trim() || 'Unidad sin nombre';
    const anioAuto = car.year || '—';
    const precioAuto = Number(car.price) || 0;
    
    const botonVendido = car.status !== 'Vendido' 
      ? `<button data-action-id="${car.id}" class="btn-marcar-vendido bg-emerald-600 text-white text-[11px] px-2.5 py-1 rounded-md font-medium hover:bg-emerald-700 transition">Marcar Vendido</button>`
      : `<span class="text-xs text-slate-400 italic">Unidad Vendida</span>`;

    return `
      <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
        <td class="px-4 py-3 text-xs text-gray-500 font-mono">${shortId}</td>
        <td class="px-4 py-3 text-sm font-medium text-slate-800">
          <div class="flex items-center gap-2">
            ${car.image_url ? `<a href="${car.image_url}" target="_blank" class="text-indigo-500 hover:underline">🖼️</a>` : ''}
            <span>${escapeHtml(nombreCompleto)}</span>
          </div>
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">${escapeHtml(String(anioAuto))}</td>
        <td class="px-4 py-3 text-sm font-semibold text-gray-800">${formatCurrency(precioAuto)}</td>
        <td class="px-4 py-3">
          <span class="inline-block text-xs px-2 py-0.5 rounded-full ${carStatusBadgeClass(car.status)}">${escapeHtml(car.status || 'Disponible')}</span>
        </td>
        <td class="px-4 py-3 text-right">${botonVendido}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-marcar-vendido').forEach(btn => {
    btn.addEventListener('click', async () => {
      const carId = btn.getAttribute('data-action-id');
      await cambiarEstatusAuto(carId, 'Vendido');
    });
  });
}

async function cambiarEstatusAuto(carId, nuevoEstatus) {
  const { error } = await supabaseClient
    .from('cars')
    .update({ status: nuevoEstatus })
    .eq('id', carId);

  if (error) {
    console.error('[cambiarEstatusAuto] Error:', error);
    alert('No se pudo actualizar el estatus de la unidad.');
    return;
  }

  await fetchCars();
}

function carStatusBadgeClass(status) {
  switch (status) {
    case 'Disponible': return 'bg-green-100 text-green-700';
    case 'Vendido': return 'bg-slate-100 text-slate-600 font-medium';
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
    drawerNotas: lead.notes || lead.notas || (lead.enganche ? `Enganche: ${lead.enganche}` : '')
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
// 🛡️ GUARDIÁN ANTIRREBOTE CON MODO DIAGNÓSTICO
// ------------------------------------------------------------
async function checkSessionAndLote() {
  console.log('[Proyecto 360] Inicializando validador de lote...');
  
  try {
    const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
    
    if (sessionErr || !sessionData || !sessionData.session) {
      console.warn('[Proyecto 360] Sin sesión local activa. Forzando login.');
      currentUser = null;
      currentLote = null;
      showView('view-login');
      return;
    }

    currentUser = sessionData.session.user;
    console.log('[Proyecto 360] UID de sesión activa:', currentUser.id);

    // Consulta limpia directa
    const { data: loteData, error: loteError } = await supabaseClient
      .from('lotes')
      .select('*')
      .eq('profile_id', currentUser.id);

    if (loteError) {
      console.error('[Proyecto 360] Fallo consulta tabla lotes:', loteError.message);
    }

    if (loteData && loteData.length > 0) {
      currentLote = loteData[0];
      console.log('[Proyecto 360] Acceso concedido al lote:', currentLote.nombre);
      
      renderConfigLote();
      showView('view-dashboard');
      startSync();
      return;
    }

    console.warn('[Proyecto 360] Usuario sin lote asignado. Solicitando onboarding.');
    currentLote = null;
    showView('view-registro');

  } catch (err) {
    console.error('[Proyecto 360] Excepción crítica en el guardián:', err);
    showView('view-login');
  }
}

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
  console.log('[Proyecto 360] Login exitoso para:', currentUser.email);
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
    if (errorEl) errorEl.textContent = 'No se pudo generar la sesión del usuario.';
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
// INICIALIZACIÓN DEL DOM
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

  // 🛡️ Manejadores síncronos corregidos para las pestañas de Login / Registro
  const toLoginBtn = document.getElementById('to-login-btn');
  if (toLoginBtn) {
    toLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showView('view-login');
    });
  }

  const toRegistroBtn = document.getElementById('to-registro-btn');
  if (toRegistroBtn) {
    toRegistroBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showView('view-registro');
    });
  }

  // Modal Control de carros
  const modalCar = document.getElementById('modalCarOverlay');
  const btnAbrirModal = document.getElementById('btnAbrirModalCar');
  const btnCerrarModal = document.getElementById('btnCerrarModalCar');
  const formNuevoCar = document.getElementById('formNuevoCar');

  if (btnAbrirModal && modalCar) {
    btnAbrirModal.addEventListener('click', () => modalCar.classList.remove('hidden'));
  }

  if (btnCerrarModal && modalCar) {
    btnCerrarModal.addEventListener('click', () => modalCar.classList.add('hidden'));
  }

  if (formNuevoCar) {
    formNuevoCar.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentLote) return;

      const brandModel = document.getElementById('carBrandModel').value.trim();
      const year = parseInt(document.getElementById('carYear').value);
      const price = parseFloat(document.getElementById('carPrice').value);
      const imageUrl = document.getElementById('carImageUrl').value.trim();
      const status = document.getElementById('carStatus').value;
      
      const transmision = document.getElementById('carTransmision').value;
      const kilometraje = parseFloat(document.getElementById('carKilometraje').value);
      const engancheMinimo = parseFloat(document.getElementById('carEnganche').value);

      const palabras = brandModel.split(' ');
      const marcaAuto = palabras[0] || '';
      const modeloAuto = palabras.slice(1).join(' ') || '';

      const { error } = await supabaseClient
        .from('cars')
        .insert({
          lote_id: currentLote.id,
          brand: marcaAuto,
          model: modeloAuto,
          price: price,
          image_url: imageUrl,
          status: status,
          year: year,
          kilometraje: kilometraje,
          transmision: transmision,
          enganche_minimo: engancheMinimo
        });

      if (error) {
        console.error('[formNuevoCar] Error al insertar auto:', error);
        alert('Error al registrar el auto: ' + error.message);
        return;
      }

      formNuevoCar.reset();
      modalCar.classList.add('hidden');
      await fetchCars();
      alert('¡Vehículo agregado con éxito con ficha técnica oculta!');
    });
  }

  initDrawer();
  initSidebarNav();

  // Execución tardía del Guardián una vez mapeado el DOM completo
  await checkSessionAndLote();
});