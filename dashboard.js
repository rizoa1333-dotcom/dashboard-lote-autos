// ============================================================
// PROJECT 360 - dashboard.js (PRO MENSUAL GROUPING + ADVANCED BI)
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
let citasCache = []; // Guardián global para el almacenamiento de citas 📅
let editingCarId = null; // Guardián global para controlar el modo edición de autos ✏️
let activeLeadId = null; // Guardián del lead activo en pantalla para el live chat live tracking 🛰️

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
    // Sincronización triple en paralelo de la base de datos
    await Promise.all([fetchLeads(), fetchCars(), fetchCitasReal()]);
    
    // Si el dueño tiene abierto un expediente, refresca el chat automáticamente en segundo plano
    if (activeLeadId) {
      await refreshChatLive(activeLeadId);
    }
  } catch (err) {
    console.error('[Sync Core] Error de refresco automatizado:', err);
  }
}

// ------------------------------------------------------------
// SECCIÓN LEADS (MONITOR DE PROSPECTOS GENERALES)
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
  renderCounters();
  procesarMetricasBI(); // Dynamic BI Update
}

// ------------------------------------------------------------
// SECCIÓN CITAS REALES (EXTRACCIÓN MULTI-TENANT DIRECTA) 📅
// ------------------------------------------------------------
async function fetchCitasReal() {
  const { data, error } = await supabaseClient
    .from('citas')
    .select('*')
    .eq('lote_id', currentLote.id)
    .order('fecha_cita', { ascending: true });

  if (error) {
    console.error('[Citas Engine] Error de consulta a tabla citas:', error);
    return;
  }
  citasCache = data || [];
  renderCitasCronologicas();
  renderCounters();
}

function renderCounters() {
  const leadsCountEl = document.getElementById('leadsCount');
  const citasCountEl = document.getElementById('citasCount');
  const citasBadgeEl = document.getElementById('citasBadge');

  const totalLeads = leadsCache.length;
  const totalCitas = citasCache.length; // Cuenta real de la tabla citas

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
    container.innerHTML = '<div class="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-slate-400 shadow-sm">Sin prospectos calificados registrados en este lote.</div>';
    return;
  }

  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const leadsAgrupadosPorMes = {};
  leadsCache.forEach(lead => {
    const fecha = lead.created_at ? new Date(lead.created_at) : new Date();
    const nombreMes = mesesNombres[fecha.getMonth()];
    
    if (!leadsAgrupadosPorMes[nombreMes]) {
      leadsAgrupadosPorMes[nombreMes] = [];
    }
    leadsAgrupadosPorMes[nombreMes].push(lead);
  });

  container.innerHTML = Object.keys(leadsAgrupadosPorMes).map(mes => `
    <div class="space-y-2.5">
      <div class="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-100/90 px-4 py-2 rounded-lg border border-slate-200 inline-block shadow-sm">
        📅 Registros de ${mes}
      </div>
      
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
                
                const tieneDocumentos = lead.url_ine || lead.url_comprobante_domicilio || lead.url_comprobante_ingresos;
                const badgeDocumentos = tieneDocumentos 
                  ? `<span class="ml-2 inline-flex items-center gap-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-md shadow-xs">📎 Papeles Recibidos</span>`
                  : '';
                
                return `
                  <tr class="hover:bg-slate-50/60 transition">
                    <td class="px-4 py-3.5 font-semibold text-slate-800 text-sm">
                      <div class="flex items-center justify-start flex-wrap gap-1">
                        <span>${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</span>
                        ${badgeDocumentos}
                      </div>
                    </td>
                    <td class="px-4 py-3.5 text-xs text-slate-500 font-mono">${escapeHtml(lead.phone_number || lead.telefono || 'Sin número')}</td>
                    <td class="px-4 py-3.5 text-sm font-medium">
                      <div class="flex flex-col">
                        <span class="text-indigo-600">${escapeHtml(lead.auto_interes || 'General')}</span>
                        ${lead.auto_sugerido ? `<span class="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded mt-1 font-bold inline-block w-fit">✨ Sugerido: ${escapeHtml(lead.auto_sugerido)}</span>` : ''}
                      </div>
                    </td>
                    <td class="px-4 py-3.5 text-xs text-slate-400">${diaVisual} de ${mes.slice(0,3)}, ${horaVisual}</td>
                    <td class="px-4 py-3.5">
                      <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Calificado')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-right">
                      <button data-lead-id="${lead.id}" class="btn-ver-perfil text-[11px] bg-slate-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition font-medium cursor-pointer">
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
// MOTOR PREMIUM DE BUSINESS INTELLIGENCE (MÉTRICAS DEL SAAS) 📊
// ------------------------------------------------------------
function procesarMetricasBI() {
  const tasaConversionEl = document.getElementById('biTasaConversion');
  const sinIngresosEl = document.getElementById('biSinIngresosRate');
  const topAutosContainer = document.getElementById('biTopAutosList');
  const engancheContainer = document.getElementById('biEngancheList');

  const totalLeads = leadsCache.length;
  if (totalLeads === 0) {
    if (topAutosContainer) topAutosContainer.innerHTML = '<p class="text-xs text-slate-400 italic">Esperando recolección de leads...</p>';
    if (engancheContainer)  engancheContainer.innerHTML = '<p class="text-xs text-slate-400 italic">Esperando recolección de leads...</p>';
    return;
  }

  const totalCitas = citasCache.length;
  if (tasaConversionEl) tasaConversionEl.textContent = `${((totalCitas / totalLeads) * 100).toFixed(1)}%`;

  const sinIngresosCount = leadsCache.filter(l => String(l.situacion_laboral) === '3' || String(l.situacion_laboral).toLowerCase().includes('no compruebo')).length;
  if (sinIngresosEl) sinIngresosEl.textContent = `${((sinIngresosCount / totalLeads) * 100).toFixed(1)}%`;

  const autoContador = {};
  leadsCache.forEach(l => {
    if (!l.auto_interes || l.auto_interes === 'General' || l.auto_interes === 'null') return;
    autoContador[l.auto_interes] = (autoContador[l.auto_interes] || 0) + 1;
  });

  const autosOrdenados = Object.keys(autoContador)
    .map(key => ({ modelo: key, cuenta: autoContador[key] }))
    .sort((a, b) => b.cuenta - a.cuenta)
    .slice(0, 3);

  if (topAutosContainer) {
    if (autosOrdenados.length === 0) {
      topAutosContainer.innerHTML = '<p class="text-xs text-slate-400 italic">Falta recolectar modelos de interés en el chat.</p>';
    } else {
      topAutosContainer.innerHTML = autosOrdenados.map((a, index) => `
        <div class="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <p class="font-medium text-slate-700 truncate max-w-[200px]"><span class="font-bold text-indigo-600 mr-1.5">#${index+1}</span> ${escapeHtml(a.modelo)}</p>
          <span class="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md border border-indigo-100">${a.cuenta} ${a.cuenta === 1 ? 'búsqueda' : 'búsquedas'}</span>
        </div>
      `).join('');
    }
  }

  let rango1 = 0, rango2 = 0, rango3 = 0;
  leadsCache.forEach(l => {
    const e = String(l.enganche);
    if (e === '1' || l.enganche === '$50,000 a $100,000') rango1++;
    else if (e === '2' || l.enganche === '$100,000 a $200,000') rango2++;
    else if (e === '3' || l.enganche === 'Más de $200,000') rango3++;
  });

  if (engancheContainer) {
    engancheContainer.innerHTML = `
      <div class="space-y-2 text-xs text-slate-700">
        <div class="flex justify-between items-center bg-slate-50 p-2 border border-slate-100 rounded-lg">
          <p class="font-medium text-slate-500">$50,000 a $100,000</p>
          <span class="font-extrabold text-slate-800">${rango1} prospectos</span>
        </div>
        <div class="flex justify-between items-center bg-emerald-50/40 border border-emerald-100 p-2 rounded-lg">
          <p class="font-medium text-emerald-600">$100,000 a $200,000</p>
          <span class="font-extrabold text-emerald-700">${rango2} prospectos</span>
        </div>
        <div class="flex justify-between items-center bg-indigo-50/40 border border-indigo-100 p-2 rounded-lg">
          <p class="font-medium text-indigo-600">Más de $200,000</p>
          <span class="font-extrabold text-indigo-700">${rango3} prospectos</span>
        </div>
      </div>
    `;
  }
}

// ------------------------------------------------------------
// CITAS CRONOLÓGICAS (CORREGIDO CON LA COLUMNA estado_lead) 📅
// ------------------------------------------------------------
function renderCitasCronologicas() {
  const container = document.getElementById('citasListContainer');
  if (!container) return;

  const citas = citasCache;

  if (citas.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 p-4 text-center">No hay citas de clientes agendadas en el patio.</p>';
    return;
  }

  const citasAgrupadas = {};
  citas.forEach(cita => {
    if (!cita.fecha_cita) return;
    
    const fechaObj = new Date(cita.fecha_cita + 'T00:00:00');
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
        ${citasAgrupadas[dia].map(cita => {
          const horaVisual = cita.hora_cita ? cita.hora_cita.slice(0, 5) : '12:00';
          
          // Mapeo correcto utilizando la columna física 'estado_lead' de Supabase
          const esCancelada = cita.estado_lead === 'Cancelada';
          
          const claseContenedor = esCancelada 
            ? 'bg-rose-50/40 border-rose-100 opacity-75' 
            : 'bg-white border-slate-100 hover:shadow-sm';
            
          const claseTextoNombre = esCancelada 
            ? 'text-slate-500 line-through' 
            : 'text-slate-800';

          const botonAccion = esCancelada
            ? `<button data-cita-id="${cita.id}" data-action="delete" class="btn-gestion-cita bg-slate-100 text-slate-500 hover:bg-slate-200 p-1.5 rounded-lg transition border border-slate-200 flex items-center justify-center cursor-pointer shadow-xs" title="Limpiar del historial">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
               </button>`
            : `<button data-cita-id="${cita.id}" data-action="cancel" class="btn-gestion-cita bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white p-1.5 rounded-lg transition border border-rose-100 flex items-center justify-center cursor-pointer shadow-xs" title="Marcar como Cancelada">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
               </button>`;

          const indicadorEstatus = esCancelada
            ? `<span class="text-[10px] font-black text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-md tracking-wide uppercase shadow-xs">❌ Cancelada por IA</span>`
            : `<span class="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">${horaVisual} hrs</span>`;

          return `
            <div class="flex items-center justify-between p-3 border rounded-xl transition ${claseContenedor}">
              <div>
                <p class="font-semibold text-sm ${claseTextoNombre}">${escapeHtml(cita.nombre_cliente || 'Cliente Patio')}</p>
                <p class="text-xs text-slate-400 font-mono">Tel: ${escapeHtml(cita.telefono || 'Sin número')} • Interés: <span class="text-indigo-600 font-medium">${escapeHtml(cita.auto_interes || 'General')}</span></p>
              </div>
              
              <div class="flex items-center gap-3">
                ${indicadorEstatus}
                ${botonAccion}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  // Manejador asíncrono para mutar o eliminar de la base de datos usando estado_lead
  container.querySelectorAll('.btn-gestion-cita').forEach(btn => {
    btn.addEventListener('click', async () => {
      const citaId = btn.getAttribute('data-cita-id');
      const accion = btn.getAttribute('data-action');
      
      if (accion === 'cancel') {
        if (!confirm('¿Deseas marcar esta cita como Cancelada manualmente? Esto liberará el horario de forma inmediata.')) return;
        const { error } = await supabaseClient.from('citas').update({ estado_lead: 'Cancelada' }).eq('id', citaId);
        if (error) return alert('Error al actualizar estatus.');
      } else {
        if (!confirm('¿Deseas eliminar definitivamente este registro histórico de la pantalla?')) return;
        const { error } = await supabaseClient.from('citas').delete().eq('id', citaId);
        if (error) return alert('Error al eliminar registro.');
      }
      await fetchCitasReal();
    });
  });
}

function statusBadgeClass(status) {
  switch (status) {
    case 'Pendiente': return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'Calificado': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'Descartado': return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'Esperando_INE': return 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse';
    case 'Esperando_Domicilio': return 'bg-purple-50 text-purple-700 border border-purple-200 animate-pulse';
    case 'Esperando_Ingresos': return 'bg-cyan-50 text-cyan-700 border border-cyan-200 animate-pulse';
    case 'Completado': return 'bg-emerald-600 text-white border border-emerald-700 font-extrabold';
    default: return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

// ------------------------------------------------------------
// SECCIÓN INVENTARIO (CONTROL GLOBAL DE UNIDADES) 🏎️
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
      const numeroMes = fechaVenta.getUTCMonth();
      const anioVenta = fechaVenta.getUTCForYear();
      
      if (anioVenta === 2026 && numeroMes >= 0 && numeroMes < 12) {
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
// MODAL DRAWER LATERAL ULTRA-CRM (INTEGRACIÓN CHAT LIVE) 🗂️
// ------------------------------------------------------------
async function openDrawer(leadId) {
  const lead = leadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  activeLeadId = lead.id;

  const citaAsociada = citasCache.find(c => String(c.telefono) === String(lead.phone_number || lead.telefono));

  document.getElementById('crmLeadIdDisplay').textContent = lead.id ? String(lead.id).slice(-8).toUpperCase() : '---';
  document.getElementById('drawerNombre').textContent = lead.nombre || '---';
  document.getElementById('drawerTelefono').textContent = lead.phone_number || lead.telefono || '---';
  
  const iniciales = (lead.nombre || 'P W').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('crmAvatarInitials').textContent = iniciales;

  const statusEl = document.getElementById('drawerStatus');
  statusEl.textContent = lead.status || 'Calificado';
  statusEl.className = `inline-block text-[10px] font-black px-2.5 py-0.5 rounded-full tracking-wide uppercase mt-1 ${statusBadgeClass(lead.status)}`;
  
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
    else if (String(lead.situacion_laboral) === '3') textoSituacion = 'No compruebo ingresos';
    else textoSituacion = lead.situacion_laboral;
  }
  document.getElementById('drawerSituacion').textContent = textoSituacion;

  const expedienteContainer = document.getElementById('drawerExpedienteDocs');
  if (expedienteContainer) {
    const docIneHtml = lead.url_ine 
      ? `<a href="${lead.url_ine}" target="_blank" class="w-full flex items-center justify-between bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-100/70 transition"><span>🪪 Identificación (INE)</span> <span class="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded">Ver Archivo</span></a>`
      : `<div class="w-full flex items-center justify-between bg-slate-50 text-slate-400 text-xs px-3 py-2 rounded-lg border border-slate-100"><span>🪪 Identificación (INE)</span> <span class="text-[10px] text-slate-400 italic">Pendiente</span></div>`;

    const docDomicilioHtml = lead.url_comprobante_domicilio 
      ? `<a href="${lead.url_comprobante_domicilio}" target="_blank" class="w-full flex items-center justify-between bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-100/70 transition"><span>🏡 Comprobante Domicilio</span> <span class="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded">Ver Archivo</span></a>`
      : `<div class="w-full flex items-center justify-between bg-slate-50 text-slate-400 text-xs px-3 py-2 rounded-lg border border-slate-100"><span>🏡 Comprobante Domicilio</span> <span class="text-[10px] text-slate-400 italic">Pendiente</span></div>`;

    const docIngresosHtml = lead.url_comprobante_ingresos 
      ? `<a href="${lead.url_comprobante_ingresos}" target="_blank" class="w-full flex items-center justify-between bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-100/70 transition"><span>📊 Estados de Cuenta</span> <span class="bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded">Ver Archivo</span></a>`
      : `<div class="w-full flex items-center justify-between bg-slate-50 text-slate-400 text-xs px-3 py-2 rounded-lg border border-slate-100"><span>📊 Estados de Cuenta</span> <span class="text-[10px] text-slate-400 italic">Pendiente</span></div>`;

    expedienteContainer.innerHTML = docIneHtml + docDomicilioHtml + docIngresosHtml;
  }

  await refreshChatLive(lead.id);

  document.getElementById('drawerPro').classList.add('drawer-open');
  document.getElementById('drawerOverlay').classList.remove('hidden');
}

// Función dedicada para alimentar el chat live tracking continuo sin parpadeos
async function refreshChatLive(leadId) {
  const lead = leadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const chatContainer = document.getElementById('crmChatHistoryContainer');
  if (!chatContainer) return;

  const phoneFilter = lead.phone_number || lead.telefono;
  const { data: messages, error: chatErr } = await supabaseClient
    .from('chat_history')
    .select('*')
    .eq('phone_number', phoneFilter)
    .order('created_at', { ascending: true });

  if (chatErr) {
    console.error('[CRM Live Chat Error]:', chatErr);
    return;
  }

  if (!messages || messages.length === 0) {
    chatContainer.innerHTML = `
      <div class="my-auto text-center space-y-2 p-6">
        <p class="text-slate-400 font-medium">No hay logs crudos guardados en la tabla chat_history.</p>
        <p class="text-[11px] text-slate-400 bg-white border border-slate-200 rounded-lg p-2 max-w-xs mx-auto">Última interacción mapeada: "${escapeHtml(lead.ultimo_mensaje || 'Ninguno')}"</p>
      </div>`;
    return;
  }

  const despegadoDelFondo = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight > 100;

  chatContainer.innerHTML = messages.map(msg => {
    const isBot = String(msg.role).toLowerCase() === 'assistant' || String(msg.role).toLowerCase() === 'bot' || !!msg.response;
    const textContent = msg.message || msg.content || msg.response || '---';
    
    if (isBot) {
      return `
        <div class="self-start max-w-[85%] bg-white border border-slate-200 text-slate-800 p-3 rounded-2xl rounded-tl-none shadow-xs space-y-1">
          <p class="font-bold text-[10px] text-indigo-600 uppercase tracking-wide">🤖 Cerebro IA</p>
          <p class="leading-relaxed select-text">${escapeHtml(textContent)}</p>
        </div>
      `;
    } else {
      return `
        <div class="self-end max-w-[85%] bg-slate-900 text-white p-3 rounded-2xl rounded-tr-none shadow-xs space-y-1 text-right">
          <p class="font-bold text-[10px] text-slate-400 uppercase tracking-wide">👤 Prospecto</p>
          <p class="leading-relaxed text-left select-text">${escapeHtml(textContent)}</p>
        </div>
      `;
    }
  }).join('');
  
  if (!despegadoDelFondo) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function closeDrawer() {
  activeLeadId = null; 
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

  document.getElementById('carDataSubmit') || document.getElementById('formNuevoCar').addEventListener('submit', async (e) => {
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