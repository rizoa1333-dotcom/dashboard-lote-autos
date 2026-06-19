// ============================================================
// PROJECT 360 - dashboard.js (OPTIMIZADO CRONOLÓGICO Y CITAS)
// SPA: registro / login / dashboard / whatsapp multi-tenant
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

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
  checarEstatusWhatsApp();
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
// SECCIÓN LEADS (MONITOR COMPLETO CRONOLÓGICO)
// ------------------------------------------------------------
async function fetchLeads() {
  const { data, error } = await supabaseClient
    .from('leads')
    .select('*')
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: false }); // El más nuevo al inicio de la tabla 📅

  if (error) {
    console.error('[Leads Engine] Error de consulta:', error);
    return;
  }
  leadsCache = data || [];
  renderLeadsTable();
  renderCitasCronologicas();
  renderCounters();
}

function renderCounters() {
  const leadsCountEl = document.getElementById('leadsCount');
  const citasCountEl = document.getElementById('citasCount');
  const citasBadgeEl = document.getElementById('citasBadge');

  const totalLeads = leadsCache.length;
  const totalCitas = leadsCache.filter(l => !!l.fecha_cita).length;

  if (leadsCountEl) leadsCountEl.textContent = totalLeads;
  if (citasCountEl) citasCountEl.textContent = totalCitas;
  
  // Alerta o notificación visual en el Sidebar
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
  const tbody = document.getElementById('leadsTableBody');
  if (!tbody) return;

  if (leadsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-xs text-slate-400 p-8">Sin prospectos calificados registrados en este lote.</td></tr>';
    return;
  }

  tbody.innerHTML = leadsCache.map(lead => `
    <tr class="hover:bg-slate-50/60 transition border-b border-slate-100">
      <td class="px-4 py-3.5 font-semibold text-slate-800 text-sm">${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</td>
      <td class="px-4 py-3.5 text-xs text-slate-500 font-mono">${escapeHtml(lead.phone_number || lead.telefono || 'Sin número')}</td>
      <td class="px-4 py-3.5 text-sm font-medium text-indigo-600">${escapeHtml(lead.auto_interes || 'General')}</td>
      <td class="px-4 py-3.5 text-xs text-slate-400">${formatDateShort(lead.created_at)}</td>
      <td class="px-4 py-3.5">
        <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Calificado')}</span>
      </td>
      <td class="px-4 py-3.5 text-right">
        <button data-lead-id="${lead.id}" class="btn-ver-perfil text-[11px] bg-slate-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition font-medium">
          Ver Perfil
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-ver-perfil').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.getAttribute('data-lead-id')));
  });
}

// ------------------------------------------------------------
// CITAS AGRUPADAS Y ORDENADAS POR FECHAS 📅
// ------------------------------------------------------------
function renderCitasCronologicas() {
  const container = document.getElementById('citasListContainer');
  if (!container) return;

  // Filtrar leads que tengan fecha de cita y ordenarlas de más cercana a más lejana
  const citas = leadsCache
    .filter(l => !!l.fecha_cita)
    .sort((a, b) => new Date(a.fecha_cita) - new Date(b.fecha_cita));

  if (citas.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center">No hay citas de clientes agendadas en el patio.</p>';
    return;
  }

  // Agrupar citas por Día (ej. "Lunes, 17 de Junio")
  const citasAgrupadas = {};
  citas.forEach(cita => {
    const fechaObj = new Date(cita.fecha_cita);
    const diaTexto = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    if (!citasAgrupadas[diaTexto]) {
      citasAgrupadas[diaTexto] = [];
    }
    citasAgrupadas[diaTexto].push(cita);
  });

  // Renderizar la lista dividida por tarjetas de fecha
  container.innerHTML = Object.keys(citasAgrupadas).map(dia => `
    <div class="space-y-2">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">${dia}</div>
      <div class="grid grid-cols-1 gap-2 pl-1">
        ${citasAgrupadas[dia].map(lead => {
          const hora = new Date(lead.fecha_cita).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-sm transition">
              <div>
                <p class="font-semibold text-sm text-slate-800">${escapeHtml(lead.nombre || 'Cliente Patio')}</p>
                <p class="text-xs text-slate-400 font-mono">${escapeHtml(lead.phone_number || lead.telefono || '')} • Interés: <span class="text-indigo-600 font-medium">${escapeHtml(lead.auto_interes || 'General')}</span></p>
              </div>
              <div class="text-right">
                <span class="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">${hora} hrs</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function statusBadgeClass(status) {
  switch (status) {
    case 'Pendiente': return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'Calificado': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'Descartado': return 'bg-rose-50 text-rose-700 border border-rose-200';
    default: return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
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
// DRAWER PERFIL PRO (CON CALIFICACIÓN FINANCIERA CORREGIDO)
// ------------------------------------------------------------
function openDrawer(leadId) {
  const lead = leadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  document.getElementById('drawerNombre').textContent = lead.nombre || '---';
  document.getElementById('drawerTelefono').textContent = lead.phone_number || lead.telefono || '---';
  document.getElementById('drawerStatus').textContent = lead.status || '---';
  document.getElementById('drawerFechaCita').textContent = formatDate(lead.fecha_cita);
  document.getElementById('drawerInteres').textContent = lead.auto_interes || '---';
  document.getElementById('drawerUltimoMensaje').textContent = lead.ultimo_mensaje || 'Conversación activa en WhatsApp';
  document.getElementById('drawerNotas').textContent = lead.notes || lead.notas || 'Sin anotaciones del bot.';

  // Formateador dinámico para el Monto de Enganche (Traduce opciones 1, 2, 3)
  let textoEnganche = '---';
  if (lead.enganche) {
    if (String(lead.enganche) === '1') textoEnganche = '$50,000 a $100,000';
    else if (String(lead.enganche) === '2') textoEnganche = '$100,000 a $200,000';
    else if (String(lead.enganche) === '3') textoEnganche = 'Más de $200,000';
    else textoEnganche = lead.enganche;
  }
  document.getElementById('drawerEnganche').textContent = textoEnganche;

  // Formateador dinámico para la Situación Laboral
  let textoSituacion = '---';
  if (lead.situacion_laboral) {
    if (String(lead.situacion_laboral) === '1') textoSituacion = 'Empleado con nómina';
    else if (String(lead.situacion_laboral) === '2') textoSituacion = 'Independiente / Negocio propio';
    else if (String(lead.situacion_laboral) === '3') textoSituacion = 'No compruebo ingresos';
    else textoSituacion = lead.situacion_laboral;
  }
  document.getElementById('drawerSituacion').textContent = textoSituacion;

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

// MULTI-TENANT STATUS WHATSAPP
async function checarEstatusWhatsApp() {
  if (!currentLote) return;
  try {
    const { data } = await supabaseClient.from('whatsapp_channels').select('*').eq('lote_id', currentLote.id).maybeSingle();
    if (data) console.log(`[Multi-Tenant Node] Instancia vinculada activa: ${data.instance_name}`);
  } catch (err) {
    console.error(err);
  }
}

// GUARDIÁN RUTEADOR
async function checkSessionAndLote() {
  console.log('[Proyecto 360] Executing session check...');
  try {
    const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr || !sessionData || !sessionData.session) {
      currentUser = null;
      currentLote = null;
      showView('view-login');
      return;
    }

    currentUser = sessionData.session.user;
    
    const { data: loteData } = await supabaseClient.from('lotes').select('*').eq('profile_id', currentUser.id);

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

  const { data: loteData } = await supabaseClient
    .from('lotes')
    .insert({ profile_id: signUpData.user.id, nombre: nombreLote, whatsapp_number: phoneLote })
    .select().single();

  currentUser = signUpData.user;
  currentLote = loteData;
  renderConfigLote();
  showView('view-dashboard');
  startSync();
}

// EVENTOS DOM
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

  document.getElementById('to-login-btn').addEventListener('click', (e) => { e.preventDefault(); showView('view-login'); });
  document.getElementById('to-registro-btn').addEventListener('click', (e) => { e.preventDefault(); showView('view-registro'); });
  document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

  const modalCar = document.getElementById('modalCarOverlay');
  document.getElementById('btnAbrirModalCar').addEventListener('click', () => modalCar.classList.remove('hidden'));
  document.getElementById('btnCerrarModalCar').addEventListener('click', () => modalCar.classList.add('hidden'));

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

  document.getElementById('openSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.remove('-translate-x-full'));
  document.getElementById('closeSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.add('-translate-x-full'));

  initSidebarNav();
  await checkSessionAndLote();
});

// Formateadores Globales
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatCurrency(v) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(v) || 0);
}
function formatDate(d) {
  if (!d) return '---';
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' hrs';
}
function formatDateShort(d) {
  if (!d) return '---';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}