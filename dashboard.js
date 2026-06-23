// ============================================================
// PROJECT 360 - dashboard.js (PRO MENSUAL GROUPING + BI ENGINE)
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
let editingCarId = null; // Guardián global para controlar el modo edición de autos ✏️

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
// SECCIÓN LEADS (MONITOR TOTALMENTE AGRUPADO POR MES CRONOLÓGICO)
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
  renderLeadsTable();
  renderCitasCronologicas();
  renderCounters();
}

function renderCounters() {
  const leadsCountEl = document.getElementById('leadsCount');
  const citasCountEl = document.getElementById('citasCount');
  const citasBadgeEl = document.getElementById('citasBadge');
  const conversionRateCountEl = document.getElementById('conversionRateCount');

  const totalLeads = leadsCache.length;
  const totalCitas = leadsCache.filter(l => !!l.fecha_cita).length;
  const tasaConversion = totalLeads > 0 ? ((totalCitas / totalLeads) * 100).toFixed(1) : "0.0";

  if (leadsCountEl) leadsCountEl.textContent = totalLeads;
  if (citasCountEl) citasCountEl.textContent = totalCitas;
  if (conversionRateCountEl) conversionRateCountEl.textContent = `${tasaConversion}%`;
  
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
    container.innerHTML = '<div class="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-slate-400 shadow-sm">Sin prospectos calificados registrados en este lote.</div>';
    return;
  }

  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  // Agrupar leads por Nombre de Mes
  const leadsAgrupadosPorMes = {};
  leadsCache.forEach(lead => {
    const fecha = lead.created_at ? new Date(lead.created_at) : new Date();
    const nombreMes = mesesNombres[fecha.getMonth()];
    
    if (!leadsAgrupadosPorMes[nombreMes]) {
      leadsAgrupadosPorMes[nombreMes] = [];
    }
    leadsAgrupadosPorMes[nombreMes].push(lead);
  });

  // INYECCIÓN VISUAL DE BLOQUES MENSUALES INDEPENDIENTES (ESTILO REQUERIDO)
  container.innerHTML = Object.keys(leadsAgrupadosPorMes).map(mes => `
    <div class="space-y-2.5">
      <!-- BLOQUE DE CABECERA MENSUAL -->
      <div class="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-100/80 px-4 py-2 rounded-lg border border-slate-200 inline-block shadow-sm">
        📅 Registros de ${mes}
      </div>
      
      <!-- TABLA DEL MES ESPECÍFICO -->
      <div class="bg-white border border-[#E2E8F0] rounded-xl p-2 shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead>
              <tr class="text-slate-400 border-b border-[#E2E8F0] text-xs uppercase font-semibold">
                <th class="px-4 py-3 font-medium">Nombre Completo</th>
                <th class="px-4 py-3 font-medium">Teléfono / WhatsApp</th>
                <th class="px-4 py-3 font-medium">Auto de Interés</th>
                <th class="px-4 py-3 font-medium">Hora Registro</th>
                <th class="px-4 py-3 font-medium">Estatus</th>
                <th class="px-4 py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              ${leadsAgrupadosPorMes[mes].map(lead => {
                const fechaReg = lead.created_at ? new Date(lead.created_at) : new Date();
                const horaVisual = fechaReg.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
                const diaVisual = fechaReg.getDate();
                
                return `
                  <tr class="hover:bg-slate-50/60 transition">
                    <td class="px-4 py-3.5 font-semibold text-slate-800 text-sm">${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</td>
                    <td class="px-4 py-3.5 text-xs text-slate-500 font-mono">${escapeHtml(lead.phone_number || lead.telefono || 'Sin número')}</td>
                    <td class="px-4 py-3.5 text-sm font-medium text-indigo-600">${escapeHtml(lead.auto_interes || 'General')}</td>
                    <td class="px-4 py-3.5 text-xs text-slate-400">${diaVisual} de ${mes.slice(0,3)}, ${horaVisual}</td>
                    <td class="px-4 py-3.5">
                      <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Calificado')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-right">
                      <button data-lead-id="${lead.id}" class="btn-ver-perfil text-[11px] bg-slate-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition font-medium">
                        Ver Perfil
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-ver-perfil').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.getAttribute('data-lead-id')));
  });
}

// ------------------------------------------------------------
// CITAS AGRUPADAS Y ORDENADAS POR FECHAS 📅
// ------------------------------------------------------------
function renderCitasCronologicas() {
  const container = document.getElementById('citasListContainer');
  if (!container) return;

  const citas = leadsCache
    .filter(l => !!l.fecha_cita)
    .sort((a, b) => new Date(a.fecha_cita) - new Date(b.fecha_cita));

  if (citas.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center">No hay citas de clientes agendadas en el patio.</p>';
    return;
  }

  const citasAgrupadas = {};
  citas.forEach(cita => {
    const fechaObj = new Date(cita.fecha_cita);
    const diaTexto = fechaObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    if (!citasAgrupadas[diaTexto]) {
      citasAgrupadas[diaTexto] = [];
    }
    citasAgrupadas[diaTexto].push(cita);
  });

  container.innerHTML = Object.keys(citasAgrupadas).map(dia => `
    <div class="space-y-2">
      <div class="text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">${dia}</div>
      <div class="grid grid-cols-1 gap-2 pl-1">
        ${citasAgrupadas[dia].map(lead => {
          const hora = new Date(lead.fecha_cita).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
          const numeroLimpio = lead.phone_number || lead.telefono || '';
          const linkWhatsApp = numeroLimpio ? `https://wa.me/${numeroLimpio}` : '#';

          return `
            <div class="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-sm transition">
              <div>
                <p class="font-semibold text-sm text-slate-800">${escapeHtml(lead.nombre || 'Cliente Patio')}</p>
                <p class="text-xs text-slate-400 font-mono">${escapeHtml(numeroLimpio)} • Interés: <span class="text-indigo-600 font-medium">${escapeHtml(lead.auto_interes || 'General')}</span></p>
              </div>
              
              <div class="flex items-center gap-2">
                ${numeroLimpio ? `
                  <a href="${linkWhatsApp}" target="_blank" class="bg-emerald-500 hover:bg-emerald-600 text-white p-1.5 rounded-lg transition-colors flex items-center justify-center shadow-sm" title="Contactar por WhatsApp">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.006 5.291 5.303 0 11.802 0c3.148.001 6.107 1.226 8.332 3.454a11.751 11.751 0 0 1 3.453 8.353c-.006 6.509-5.303 11.799-11.802 11.799-1.996-.001-3.956-.508-5.701-1.474L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.432.001 9.851-4.395 9.856-9.799.002-2.618-1.013-5.08-2.859-6.93C16.378 2.025 13.926.983 11.317.983c-5.433 0-9.85 4.397-9.855 9.802-.001 1.763.481 3.322 1.393 4.821L1.87 21.077l5.777-1.513zm12.333-5.01c-.296-.149-1.754-.867-2.024-.966-.271-.099-.467-.149-.664.149-.197.297-.763.966-.934 1.164-.173.199-.344.223-.64.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.664-1.6-.91-2.193-.239-.574-.482-.496-.664-.505-.172-.009-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.877 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.754-.717 2.001-1.409.248-.693.248-1.288.173-1.409-.074-.122-.272-.198-.57-.347z"/>
                    </svg>
                  </a>
                ` : ''}
                <span class="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">${hora} hrs</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

// ------------------------------------------------------------
// SECCIÓN INVENTARIO (CARS + BOTÓN DE EDICIÓN ✏️)
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
  const mensualesContainer = document.getElementById('ventasMensualesContainer');

  let valorTotal = 0;
  let gananciasTotales = 0;

  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const reporteMensual = mesesNombres.map(mes => ({ name: mes, unidades: 0, dinero: 0 }));

  carsCache.forEach(car => {
    const precio = Number(car.price) || 0;
    if (car.status === 'Vendido') {
      gananciasTotales += precio;

      const fechaVenta = car.updated_at ? new Date(car.updated_at) : new Date(car.created_at);
      const numeroMes = fechaVenta.getMonth();
      
      if (fechaVenta.getFullYear() === 2026 && numeroMes >= 0 && numeroMes < 12) {
        reporteMensual[numeroMes].unidades += 1;
        reporteMensual[numeroMes].dinero += precio;
      }
    } else {
      valorTotal += precio;
    }
  });

  if (invValorTotalEl) invValorTotalEl.textContent = formatCurrency(valorTotal);
  if (invGananciasTotalesEl) invGananciasTotalesEl.textContent = formatCurrency(gananciasTotales);

  if (mensualesContainer) {
    const mesesConVentas = reporteMensual.filter(m => m.unidades > 0);

    if (mesesConVentas.length === 0) {
      mensualesContainer.innerHTML = `<p class="text-xs text-slate-400 italic p-2">Sin registros de facturación cerrados en el año en curso.</p>`;
    } else {
      mensualesContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          ${mesesConVentas.map(mes => `
            <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl shadow-sm">
              <div>
                <p class="text-xs font-bold text-slate-700">${mes.name}</p>
                <p class="text-[10px] text-slate-400 font-medium">${mes.unidades} ${mes.unidades === 1 ? 'unidad vendida' : 'unidades vendidas'}</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-extrabold text-emerald-600">${formatCurrency(mes.dinero)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }
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
            <button data-edit-id="${car.id}" class="btn-editar-car text-xs ml-1 opacity-50 hover:opacity-100 transition cursor-pointer" title="Editar Unidad">✏️</button>
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

  tbody.querySelectorAll('.btn-editar-car').forEach(btn => {
    btn.addEventListener('click', () => {
      const carId = btn.getAttribute('data-edit-id');
      const car = carsCache.find(c => String(c.id) === String(carId));
      if (!car) return;

      editingCarId = car.id;

      document.getElementById('carBrand').value = car.brand || '';
      document.getElementById('carModel').value = car.model || '';
      document.getElementById('carYear').value = car.year || '';
      document.getElementById('carPrice').value = car.price || '';
      document.getElementById('carTransmision').value = car.transmision || 'Automática';
      document.getElementById('carKilometraje').value = car.kilometraje || 0;
      document.getElementById('carEnganche').value = car.enganche_minimo || 0;
      document.getElementById('carStatus').value = car.status || 'Disponible';
      document.getElementById('carImageUrl').value = car.image_url || '';
      
      document.getElementById('modalCarTitle').textContent = 'Editar Datos de Unidad';
      document.getElementById('btnSubmitCarForm').textContent = 'Actualizar Cambios en Patio';
      document.getElementById('uploadStatusText').textContent = car.image_url ? 'Imagen de resguardo activa. Suba otra para reemplazar. 🖼️' : '';

      document.getElementById('modalCarOverlay').classList.remove('hidden');
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
  document.getElementById('drawerTelefono').textContent = lead.phone_number || lead.telefono || '---';
  document.getElementById('drawerStatus').textContent = lead.status || '---';
  document.getElementById('drawerFechaCita').textContent = formatDate(lead.fecha_cita);
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

async function checarEstatusWhatsApp() {
  if (!currentLote) return;
  try {
    const { data } = await supabaseClient.from('whatsapp_channels').select('*').eq('lote_id', currentLote.id).maybeSingle();
    if (data) console.log(`[Multi-Tenant Node] Instancia vinculada activa: ${data.instance_name}`);
  } catch (err) {
    console.error(err);
  }
}

async function checkSessionAndLote() {
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
  
  document.getElementById('btnAbrirModalCar').addEventListener('click', () => {
    editingCarId = null;
    document.getElementById('formNuevoCar').reset();
    document.getElementById('carImageUrl').value = '';
    document.getElementById('uploadStatusText').textContent = '';
    document.getElementById('modalCarTitle').textContent = 'Registrar Nuevo Vehículo';
    document.getElementById('btnSubmitCarForm').textContent = 'Guardar Unidad en Sistema';
    modalCar.classList.remove('hidden');
  });
  
  document.getElementById('btnCerrarModalCar').addEventListener('click', () => modalCar.classList.add('hidden'));

  const btnImportar = document.getElementById('btnImportarExcel');
  const fileInput = document.getElementById('excelFileInput');

  if (btnImportar && fileInput) {
    btnImportar.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function(event) {
        const text = event.target.result;
        const lineas = text.split('\n');
        if (lineas.length <= 1) return;
        
        const headers = lineas[0].split(',').map(h => h.trim().toLowerCase());
        const autosParaInsertar = [];

        for (let i = 1; i < lineas.length; i++) {
          if (!lineas[i].trim()) continue;
          const celdas = lineas[i].split(',').map(c => c.trim());
          
          if (celdas.length >= 4) {
            autosParaInsertar.push({
              lote_id: currentLote.id,
              brand: celdas[headers.indexOf('marca')] || celdas[headers.indexOf('brand')] || 'Genérico',
              model: celdas[headers.indexOf('modelo')] || celdas[headers.indexOf('model')] || 'Unidad',
              year: parseInt(celdas[headers.indexOf('año')]) || parseInt(celdas[headers.indexOf('year')]) || 2026,
              price: parseFloat(celdas[headers.indexOf('precio')]) || parseFloat(celdas[headers.indexOf('price')]) || 0,
              transmision: celdas[headers.indexOf('transmision')] || 'Automática',
              kilometraje: parseFloat(celdas[headers.indexOf('kilometraje')]) || 0,
              enganche_minimo: parseFloat(celdas[headers.indexOf('enganche')]) || 0,
              status: 'Disponible',
              image_url: 'https://via.placeholder.com/400x250?text=Sin+Foto'
            });
          }
        }

        if (autosParaInsertar.length > 0) {
          const { error } = await supabaseClient.from('cars').insert(autosParaInsertar);
          if (error) {
            alert('Error en formato del CSV. Valida tus columnas.');
            console.error(error);
          } else {
            alert(`¡Éxito bro! Se extrajeron y cargaron ${autosParaInsertar.length} autos en masa.`);
            await fetchCars();
          }
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });
  }

  const imageInput = document.getElementById('carImageFile');
  if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const statusText = document.getElementById('uploadStatusText');
      statusText.textContent = 'Subiendo imagen a la nube... ⏳';
      statusText.className = 'text-[11px] text-amber-500 mt-1 italic';

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const filePath = `${currentLote.id}/${fileName}`;

      const { data, error } = await supabaseClient.storage
        .from('car-images')
        .upload(filePath, file);

      if (error) {
        statusText.textContent = 'Fallo de Storage. Valida permisos del Bucket.';
        statusText.className = 'text-[11px] text-rose-500 mt-1 italic';
        return;
      }

      const { data: publicUrlData } = supabaseClient.storage
        .from('car-images')
        .getPublicUrl(filePath);

      document.getElementById('carImageUrl').value = publicUrlData.publicUrl;
      statusText.textContent = '¡Imagen montada! Link inyectado al formulario. 🖼️';
      statusText.className = 'text-[11px] text-emerald-600 mt-1 italic';
    });
  }

  document.getElementById('formNuevoCar').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentLote) return;

    const carData = {
      lote_id: currentLote.id,
      brand: document.getElementById('carBrand').value.trim(),
      model: document.getElementById('carModel').value.trim(),
      year: parseInt(document.getElementById('carYear').value),
      price: parseFloat(document.getElementById('carPrice').value),
      image_url: document.getElementById('carImageUrl').value.trim() || 'https://via.placeholder.com/400x250?text=Sin+Foto',
      status: document.getElementById('carStatus').value,
      transmision: document.getElementById('carTransmision').value,
      kilometraje: parseFloat(document.getElementById('carKilometraje').value) || 0,
      enganche_minimo: parseFloat(document.getElementById('carEnganche').value) || 0
    };

    let response;
    if (editingCarId) {
      response = await supabaseClient.from('cars').update(carData).eq('id', editingCarId);
    } else {
      response = await supabaseClient.from('cars').insert(carData);
    }

    if (response.error) {
      alert('Error operativo en base de datos al guardar carro.');
      return;
    }

    e.target.reset();
    editingCarId = null;
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