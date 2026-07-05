// ============================================================
// PROJECT 360 - dashboard.js (DARK MODE PREMIUM + PIPELINE + AGENTE IA)
// SPA: registro / login / dashboard / whatsapp multi-tenant
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

// Webhook opcional de n8n para generación de copy con Gemini.
// Déjalo vacío para usar el generador local de respaldo; pon tu URL de producción para conectar el Agente IA real.
const N8N_MARKETING_WEBHOOK_URL = '';
// Webhook nuevo, en el MISMO workflow de n8n, para publicar en Facebook/Instagram.
const N8N_PUBLISH_WEBHOOK_URL = '';

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
let citasCache = [];
let editingCarId = null;
let activeLeadId = null;

// Estado del Agente Publicitario IA
let marketingSelectedCarId = null;
let marketingImageFile = null;
let marketingImageUrl = '';

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
  syncIntervalId = setInterval(fetchAndRenderAll, 10000);
}

async function fetchAndRenderAll() {
  if (!currentUser || !currentLote) {
    stopSync();
    return;
  }
  try {
    await Promise.all([fetchLeads(), fetchCars(), fetchCitasReal()]);
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
  procesarMetricasBI();
  renderPipelineKanban();
  calcularOportunidadesRescatadas();
}

// ------------------------------------------------------------
// OPORTUNIDADES RESCATADAS 🌙
// Cuantifica el trabajo del Agente IA fuera de horario humano
// (madrugada: 00:00–06:00) y estima el valor de venta potencial
// de las unidades en que esos prospectos mostraron interés.
// ------------------------------------------------------------
function calcularOportunidadesRescatadas() {
  const leadsCountEl = document.getElementById('rescueLeadsCount');
  const valorEl = document.getElementById('rescueValorPotencial');
  if (!leadsCountEl || !valorEl) return;

  const leadsMadrugada = leadsCache.filter(lead => {
    if (!lead.created_at) return false;
    const hora = new Date(lead.created_at).getHours();
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
  renderPipelineKanban();
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
    container.innerHTML = '<div class="card p-8 text-center text-xs text-[#4B5563]">Sin prospectos calificados registrados en este lote.</div>';
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
      <div class="text-xs font-bold text-[#6B7280] uppercase tracking-wider bg-[#161922] px-4 py-2 rounded-lg border border-[#272A30] inline-block">
        📅 Registros de ${mes}
      </div>

      <div class="card p-2">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead>
              <tr class="text-[#4B5563] border-b border-[#272A30] text-xs uppercase font-semibold">
                <th class="px-4 py-3 font-medium">Nombre Completo</th>
                <th class="px-4 py-3 font-medium">Teléfono / WhatsApp</th>
                <th class="px-4 py-3 font-medium">Auto de Interés</th>
                <th class="px-4 py-3 font-medium">Hora Registro</th>
                <th class="px-4 py-3 font-medium">Estatus</th>
                <th class="px-4 py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#20242F] text-[#F5F5F4]">
              ${leadsAgrupadosPorMes[mes].map(lead => {
                const fechaReg = lead.created_at ? new Date(lead.created_at) : new Date();
                const horaVisual = fechaReg.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
                const diaVisual = fechaReg.getDate();

                const tieneDocumentos = lead.url_ine || lead.url_comprobante_domicilio || lead.url_comprobante_ingresos;
                const badgeDocumentos = tieneDocumentos
                  ? `<span class="badge badge-success ml-2">📎 Datos Recibidos</span>`
                  : '';

                return `
                  <tr class="hover:bg-[#1C202A] transition">
                    <td class="px-4 py-3.5 font-semibold text-sm">
                      <div class="flex items-center justify-start flex-wrap gap-1">
                        <span>${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</span>
                        ${badgeDocumentos}
                      </div>
                    </td>
                    <td class="px-4 py-3.5 text-xs text-[#6B7280] font-mono privacy-sensitive">${escapeHtml(lead.phone_number || lead.telefono || 'Sin número')}</td>
                    <td class="px-4 py-3.5 text-sm font-medium">
                      <div class="flex flex-col">
                        <span style="color: var(--cold);">${escapeHtml(lead.auto_interes || 'General')}</span>
                        ${lead.auto_sugerido ? `<span class="badge badge-success mt-1 w-fit">✨ Sugerido: ${escapeHtml(lead.auto_sugerido)}</span>` : ''}
                      </div>
                    </td>
                    <td class="px-4 py-3.5 text-xs text-[#4B5563]">${diaVisual} de ${mes.slice(0,3)}, ${horaVisual}</td>
                    <td class="px-4 py-3.5">
                      <span class="badge ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Calificado')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-right">
                      <button data-lead-id="${lead.id}" class="btn-ver-perfil text-[11px] btn-primary px-2.5 py-1.5 rounded-lg font-medium cursor-pointer">
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
// CLASIFICADOR DE TEMPERATURA DE LEADS (PIPELINE) 🔥⚡❄️
// Prioriza un campo explícito `temperatura` calculado por la IA en n8n si existe;
// si no, deriva un estimado a partir del avance documental y la cita agendada.
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
      <div data-lead-id="${lead.id}" class="btn-kanban-card kanban-card ${tempClass} p-3 cursor-pointer">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-[#20242F] flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0">${escapeHtml(iniciales)}</div>
            <div class="min-w-0">
              <p class="text-xs font-semibold truncate">${escapeHtml(lead.nombre || 'Prospecto WhatsApp')}</p>
              <p class="text-[10px] text-[#4B5563] font-mono truncate privacy-sensitive">${escapeHtml(lead.phone_number || lead.telefono || 'Sin número')}</p>
            </div>
          </div>
        </div>
        <p class="text-[11px] mt-2 truncate" style="color: var(--cold);">${escapeHtml(lead.auto_interes || 'General')}</p>
      </div>
    `;
  };

  const emptyMsg = '<p class="text-[11px] text-[#4B5563] italic px-2 py-3">Sin prospectos en esta etapa.</p>';

  contCaliente.innerHTML = grupos.caliente.length ? grupos.caliente.map(l => renderCard(l, 'temp-caliente')).join('') : emptyMsg;
  contTemplado.innerHTML = grupos.templado.length ? grupos.templado.map(l => renderCard(l, 'temp-templado')).join('') : emptyMsg;
  contFrio.innerHTML = grupos.frio.length ? grupos.frio.map(l => renderCard(l, 'temp-frio')).join('') : emptyMsg;

  document.querySelectorAll('.btn-kanban-card').forEach(card => {
    card.addEventListener('click', () => openDrawer(card.getAttribute('data-lead-id')));
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
    if (topAutosContainer) topAutosContainer.innerHTML = '<p class="text-xs text-[#4B5563] italic">Esperando recolección de leads...</p>';
    if (engancheContainer) engancheContainer.innerHTML = '<p class="text-xs text-[#4B5563] italic">Esperando recolección de leads...</p>';
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
      topAutosContainer.innerHTML = '<p class="text-xs text-[#4B5563] italic">Falta recolectar modelos de interés en el chat.</p>';
    } else {
      topAutosContainer.innerHTML = autosOrdenados.map((a, index) => `
        <div class="flex items-center justify-between text-xs bg-[var(--surface-2)] p-2.5 rounded-lg">
          <p class="font-medium truncate max-w-[200px]"><span class="font-bold mr-1.5 text-[#6B7280]">#${index+1}</span> ${escapeHtml(a.modelo)}</p>
          <span class="text-[11px] text-[#6B7280] font-semibold">${a.cuenta} ${a.cuenta === 1 ? 'búsqueda' : 'búsquedas'}</span>
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
      <div class="space-y-2 text-xs">
        <div class="flex justify-between items-center bg-[var(--surface-2)] p-2.5 rounded-lg">
          <p class="font-medium text-[#6B7280]">$50,000 a $100,000</p>
          <span class="font-semibold text-[#F5F5F4]">${rango1} prospectos</span>
        </div>
        <div class="flex justify-between items-center bg-[var(--surface-2)] p-2.5 rounded-lg">
          <p class="font-medium text-[#6B7280]">$100,000 a $200,000</p>
          <span class="font-semibold text-[#F5F5F4]">${rango2} prospectos</span>
        </div>
        <div class="flex justify-between items-center bg-[var(--surface-2)] p-2.5 rounded-lg">
          <p class="font-medium text-[#6B7280]">Más de $200,000</p>
          <span class="font-semibold text-[#F5F5F4]">${rango3} prospectos</span>
        </div>
      </div>
    `;
  }
}

// ------------------------------------------------------------
// CITAS CRONOLÓGICAS 📅
// ------------------------------------------------------------
function renderCitasCronologicas() {
  const container = document.getElementById('citasListContainer');
  if (!container) return;

  const citas = citasCache;

  if (citas.length === 0) {
    container.innerHTML = '<p class="text-xs text-[#4B5563] p-4 text-center">No hay citas de clientes agendadas en el patio.</p>';
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
      <div class="text-xs font-bold text-[#4B5563] uppercase tracking-wider bg-[#161922] px-3 py-1.5 rounded-md border border-[#272A30]">${dia}</div>
      <div class="grid grid-cols-1 gap-2 pl-1">
        ${citasAgrupadas[dia].map(cita => {
          const horaVisual = cita.hora_cita ? cita.hora_cita.slice(0, 5) : '12:00';
          const esCancelada = cita.estado_lead === 'Cancelada';

          const claseContenedor = esCancelada
            ? 'opacity-60'
            : 'card-hover';

          const claseTextoNombre = esCancelada
            ? 'text-[#4B5563] line-through'
            : 'text-[#F5F5F4]';

          const botonAccion = esCancelada
            ? `<button data-cita-id="${cita.id}" data-action="delete" class="btn-gestion-cita btn-ghost p-1.5 rounded-lg flex items-center justify-center cursor-pointer" title="Limpiar del historial">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
               </button>`
            : `<button data-cita-id="${cita.id}" data-action="cancel" class="btn-gestion-cita p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition" style="background: var(--danger-soft); color: var(--danger); border: 1px solid rgba(229,87,63,0.25);" title="Marcar como Cancelada">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
               </button>`;

          const indicadorEstatus = esCancelada
            ? `<span class="badge badge-danger">❌ Cancelada por IA</span>`
            : `<span class="badge badge-cold">${horaVisual} hrs</span>`;

          return `
            <div class="flex items-center justify-between p-3 card ${claseContenedor}">
              <div>
                <p class="font-semibold text-sm ${claseTextoNombre}">${escapeHtml(cita.nombre_cliente || 'Cliente Patio')}</p>
                <p class="text-xs text-[#4B5563] font-mono">Tel: ${escapeHtml(cita.telefono || 'Sin número')} • Interés: <span style="color: var(--cold);" class="font-medium">${escapeHtml(cita.auto_interes || 'General')}</span></p>
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
// SECCIÓN INVENTARIO (CATÁLOGO DE TARJETAS) 🏎️
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
  populateMarketingCarSelect();
  calcularOportunidadesRescatadas();
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
  const kpiPublicadosEl = document.getElementById('kpiAutosPublicados');

  let valorTotal = 0;
  let gananciasTotales = 0;

  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const reporteMensual = mesesNombres.map(mes => ({ name: mes, unidades: 0, dinero: 0 }));

  carsCache.forEach(car => {
    const precio = Number(car.price) || 0;
    if (car.status === 'Vendido') {
      gananciasTotales += precio;

      try {
        const fechaTarget = car.fecha_venta || car.created_at;
        if (fechaTarget) {
          const fechaVenta = new Date(fechaTarget);

          if (!isNaN(fechaVenta.getTime())) {
            const numeroMes = fechaVenta.getMonth();
            const anioVenta = fechaVenta.getFullYear();

            if (anioVenta === 2026 && numeroMes >= 0 && numeroMes < 12) {
              reporteMensual[numeroMes].unidades += 1;
              reporteMensual[numeroMes].dinero += precio;
            }
          } else {
            const mesActual = new Date().getMonth();
            reporteMensual[mesActual].unidades += 1;
            reporteMensual[mesActual].dinero += precio;
          }
        } else {
          const mesActual = new Date().getMonth();
          reporteMensual[mesActual].unidades += 1;
          reporteMensual[mesActual].dinero += precio;
        }
      } catch (err) {
        console.warn("[Fix Guard] Error calculando fecha de venta, sumando por defecto:", err);
        const mesActual = new Date().getMonth();
        reporteMensual[mesActual].unidades += 1;
        reporteMensual[mesActual].dinero += precio;
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
      mensualesContainer.innerHTML = `<p class="text-xs text-[#4B5563] italic p-2">Sin registros de facturación cerrados en el año en curso.</p>`;
    } else {
      mensualesContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          ${mesesConVentas.map(mes => `
            <div class="flex items-center justify-between p-3 bg-[#161922] border border-[#272A30] rounded-xl">
              <div>
                <p class="text-xs font-bold">${mes.name}</p>
                <p class="text-[10px] text-[#4B5563] font-medium">${mes.unidades} ${mes.unidades === 1 ? 'unidad vendida' : 'unidades vendidas'}</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-extrabold stat-mono" style="color: var(--text);">${formatCurrency(mes.dinero)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // KPI: Autos publicados en redes este mes (columna opcional `redes_status` / `fecha_publicacion` en tabla cars)
  if (kpiPublicadosEl) {
    const ahora = new Date();
    const publicadosEsteMes = carsCache.filter(car => {
      if (car.redes_status !== 'Publicado') return false;
      const fechaRef = car.fecha_publicacion || car.updated_at;
      if (!fechaRef) return true;
      const f = new Date(fechaRef);
      return !isNaN(f.getTime()) && f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
    }).length;
    kpiPublicadosEl.textContent = publicadosEsteMes;
  }
}

// ------------------------------------------------------------
// SALUD DEL INVENTARIO 🩺
// Composite de 3 señales operativas por unidad: foto real,
// copy generado por el Agente IA, y publicación en redes.
// ------------------------------------------------------------
function calcularSaludInventario(car) {
  const tieneFoto = !!(car.image_url && !car.image_url.includes('placeholder'));
  const tieneCopy = !!(car.copy_ia && String(car.copy_ia).trim().length > 0);
  const publicado = car.redes_status === 'Publicado';

  const items = [
    { label: 'Foto HD', done: tieneFoto },
    { label: 'Copy IA', done: tieneCopy },
    { label: 'Publicado', done: publicado }
  ];
  const completados = items.filter(i => i.done).length;
  const percent = Math.round((completados / items.length) * 100);
  return { percent, items };
}

function renderCars() {
  const grid = document.getElementById('carsGridContainer');
  if (!grid) return;

  if (carsCache.length === 0) {
    grid.innerHTML = '<div class="card p-8 text-center text-xs text-[#4B5563] col-span-full">No hay unidades vehiculares en exhibición.</div>';
    return;
  }

  grid.innerHTML = carsCache.map(car => {
    const shortId = car.id ? String(car.id).slice(-6) : '---';
    const unidadNombre = `${car.brand || ''} ${car.model || ''}`.trim();
    const esVendido = car.status === 'Vendido';

    const estaPublicado = car.redes_status === 'Publicado';
    const dotRedesClass = estaPublicado ? 'status-dot' : 'status-dot status-dot-outline';
    const textoRedes = estaPublicado ? 'Publicado' : 'Pendiente de publicar';

    const dotCatalogClass = car.status === 'Apartado' ? 'status-dot status-dot-outline' : 'status-dot';
    const textoCatalog = car.status === 'Apartado' ? 'Apartado' : 'Disponible';

    const botonEstatus = !esVendido
      ? `<button data-action-id="${car.id}" class="btn-marcar-vendido internal-only text-[11px] px-2.5 py-1 rounded-md font-semibold transition" style="background: var(--surface-2); color: var(--text); border: 1px solid var(--border-strong);">Marcar Vendido</button>`
      : `<span class="text-xs text-[#4B5563] font-medium italic internal-only">Unidad Entregada</span>`;

    const salud = calcularSaludInventario(car);
    const saludColorClass = salud.percent >= 100 ? 'health-high' : salud.percent >= 50 ? 'health-mid' : 'health-low';

    return `
      <div class="car-card flex flex-col ${esVendido ? 'status-vendido' : ''}">
        <img src="${car.image_url || 'https://via.placeholder.com/400x250?text=Sin+Foto'}" class="car-card-img" alt="${escapeHtml(unidadNombre)}">
        <div class="p-5 flex flex-col gap-2 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-sm truncate">${escapeHtml(unidadNombre || 'Unidad')}</p>
              <div class="flex items-center gap-1.5 mt-1.5 internal-only">
                <span class="${dotRedesClass}"></span>
                <span class="text-[11px] text-[#4B5563]">${textoRedes}</span>
              </div>
              <div class="flex items-center gap-1.5 mt-1.5 catalog-only">
                <span class="${dotCatalogClass}"></span>
                <span class="text-[11px] text-[#4B5563]">${textoCatalog}</span>
              </div>
            </div>
            <button data-edit-id="${car.id}" class="btn-editar-car internal-only text-xs opacity-60 hover:opacity-100 transition flex-shrink-0" title="Editar Unidad">✏️</button>
          </div>

          <p class="text-[11px] text-[#4B5563] font-mono">#${shortId} • ${escapeHtml(String(car.year || ''))}</p>
          <p class="text-lg font-bold stat-mono">${formatCurrency(car.price)}</p>
          <p class="catalog-only text-[11px] text-[#6B7280] -mt-1">Financiamiento disponible desde <span class="font-semibold" style="color: var(--text);">${formatCurrency(car.enganche_minimo)}</span></p>

          <div class="internal-only space-y-1.5 pt-1">
            <div class="flex items-center justify-between text-[9px] text-[#4B5563] uppercase font-bold tracking-wider">
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
            <button data-market-id="${car.id}" class="btn-promocionar text-[11px] btn-ghost px-2.5 py-1.5 rounded-lg font-medium">✨ Promocionar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.btn-marcar-vendido').forEach(btn => {
    btn.addEventListener('click', async () => {
      const hoyParaBD = new Date().toISOString().split('T')[0];

      const { error } = await supabaseClient
        .from('cars')
        .update({ status: 'Vendido', fecha_venta: hoyParaBD })
        .eq('id', btn.getAttribute('data-action-id'));

      if (error) {
        alert('Error al actualizar estatus');
        console.error(error);
      }
      await fetchCars();
    });
  });

  grid.querySelectorAll('.btn-editar-car').forEach(btn => {
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
}

// ------------------------------------------------------------
// AGENTE PUBLICITARIO IA — Drag & Drop + Copy + Publicación ✨
// ------------------------------------------------------------
function populateMarketingCarSelect() {
  const select = document.getElementById('marketingCarSelect');
  if (!select) return;

  const valorPrevio = select.value;

  if (carsCache.length === 0) {
    select.innerHTML = '<option value="">Sin unidades registradas</option>';
    marketingSelectedCarId = null;
    return;
  }

  select.innerHTML = carsCache.map(car =>
    `<option value="${car.id}">${escapeHtml(`${car.brand || ''} ${car.model || ''}`.trim())} · ${escapeHtml(String(car.year || ''))}</option>`
  ).join('');

  if (valorPrevio && carsCache.some(c => String(c.id) === valorPrevio)) {
    select.value = valorPrevio;
  }
  marketingSelectedCarId = select.value;
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
    `📲 Escríbenos por WhatsApp y agenda tu cita hoy mismo. ¡Unidades como esta se van rápido!`;
}

async function generarCopyIA(car) {
  if (!N8N_MARKETING_WEBHOOK_URL) {
    return generarCopyLocal(car);
  }
  try {
    const resp = await fetch(N8N_MARKETING_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ car, lote_id: currentLote.id, image_url: marketingImageUrl })
    });
    const data = await resp.json();
    return (data && data.copy) ? data.copy : generarCopyLocal(car);
  } catch (err) {
    console.error('[Agente IA] Fallo al llamar webhook n8n, usando copy local:', err);
    return generarCopyLocal(car);
  }
}

async function subirImagenMarketing(file) {
  const statusText = document.getElementById('marketingStatusText');
  if (statusText) { statusText.textContent = 'Subiendo imagen a la nube... ⏳'; statusText.style.color = 'var(--amber-strong)'; }

  const fileExt = file.name.split('.').pop();
  const fileName = `marketing_${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
  const filePath = `${currentLote.id}/${fileName}`;

  const { error } = await supabaseClient.storage.from('car-images').upload(filePath, file);
  if (error) {
    if (statusText) { statusText.textContent = 'Fallo de Storage al subir la imagen.'; statusText.style.color = 'var(--danger)'; }
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage.from('car-images').getPublicUrl(filePath);
  marketingImageUrl = publicUrlData.publicUrl;

  const preview = document.getElementById('marketingImagePreview');
  const previewWrap = document.getElementById('marketingImagePreviewWrap');
  if (preview && previewWrap) {
    preview.src = marketingImageUrl;
    previewWrap.classList.remove('hidden');
  }
  if (statusText) { statusText.textContent = '¡Imagen lista! Ahora genera el copy con IA. 🖼️'; statusText.style.color = 'var(--success)'; }
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

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) { marketingImageFile = file; subirImagenMarketing(file); }
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-active'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('drag-active'); });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) { marketingImageFile = file; subirImagenMarketing(file); }
  });

  btnGenerar.addEventListener('click', async () => {
    const car = carsCache.find(c => String(c.id) === String(marketingSelectedCarId));
    if (!car) { alert('Selecciona una unidad del inventario primero.'); return; }

    btnGenerar.disabled = true;
    btnGenerar.textContent = '⏳ Generando copy...';
    try {
      const copy = await generarCopyIA(car);
      copyText.value = copy;
      if (statusText) { statusText.textContent = 'Copy generado. Puedes editarlo antes de publicar.'; statusText.style.color = 'var(--text-dim)'; }
    } finally {
      btnGenerar.disabled = false;
      btnGenerar.textContent = '✨ Generar Copy con IA';
    }
  });

  btnPublicar.addEventListener('click', async () => {
    const car = carsCache.find(c => String(c.id) === String(marketingSelectedCarId));
    if (!car) { alert('Selecciona una unidad del inventario primero.'); return; }
    if (!copyText.value.trim()) { alert('Genera o escribe un copy antes de publicar.'); return; }
    if (!N8N_PUBLISH_WEBHOOK_URL) { alert('Falta configurar N8N_PUBLISH_WEBHOOK_URL en dashboard.js.'); return; }

    btnPublicar.disabled = true;
    btnPublicar.textContent = '🚀 Publicando...';

    try {
      const resp = await fetch(N8N_PUBLISH_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ car, copy: copyText.value.trim(), image_url: marketingImageUrl || car.image_url })
      });
      if (!resp.ok) throw new Error(`Webhook respondió ${resp.status}`);
    } catch (err) {
      console.error('[Agente IA] Error al publicar en redes:', err);
      btnPublicar.disabled = false;
      btnPublicar.textContent = '🚀 Publicar con IA en Redes Sociales';
      if (statusText) { statusText.textContent = 'Fallo la publicación en redes. Revisa el webhook de n8n.'; statusText.style.color = 'var(--danger)'; }
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];
    const { error } = await supabaseClient.from('cars').update({
      redes_status: 'Publicado',
      copy_ia: copyText.value.trim(),
      fecha_publicacion: hoy,
      image_url: marketingImageUrl || car.image_url
    }).eq('id', car.id);

    btnPublicar.disabled = false;
    btnPublicar.textContent = '🚀 Publicar con IA en Redes Sociales';

    if (error) {
      console.error('[Agente IA] Error al publicar:', error);
      if (statusText) {
        statusText.textContent = 'No se pudo guardar. Agrega a tu tabla "cars" las columnas redes_status, copy_ia y fecha_publicacion.';
        statusText.style.color = 'var(--danger)';
      }
      return;
    }

    if (statusText) { statusText.textContent = `¡Publicado! ${car.brand} ${car.model} ya está marcado como Publicado en redes.`; statusText.style.color = 'var(--success)'; }
    await fetchCars();
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
    else if (String(lead.situacion_laboral) === '3') textoSituacion = 'No compruebo ingresos';
    else textoSituacion = lead.situacion_laboral;
  }
  document.getElementById('drawerSituacion').textContent = textoSituacion;

  const expedienteContainer = document.getElementById('drawerExpedienteDocs');
  if (expedienteContainer) {
    const docIneHtml = lead.url_ine
      ? `<div class="w-full flex flex-col p-2.5 rounded-lg text-xs" style="background: var(--surface-2);"><span class="font-bold flex items-center gap-1.5 text-[#F5F5F4]"><span class="status-dot"></span>🪪 Clave Elector (INE)</span><span class="mt-1 text-[#6B7280] font-mono select-all">${escapeHtml(lead.url_ine)}</span></div>`
      : `<div class="w-full flex items-center justify-between bg-[#161922] text-[#4B5563] text-xs px-3 py-2 rounded-lg border border-[#272A30]"><span>🪪 Clave Elector (INE)</span> <span class="text-[10px] italic">Pendiente</span></div>`;

    const docDomicilioHtml = lead.url_comprobante_domicilio
      ? `<div class="w-full flex flex-col p-2.5 rounded-lg text-xs mt-2" style="background: var(--surface-2);"><span class="font-bold flex items-center gap-1.5 text-[#F5F5F4]"><span class="status-dot"></span>🏡 Dirección de Residencia</span><span class="mt-1 text-[#6B7280] font-medium select-all">${escapeHtml(lead.url_comprobante_domicilio)}</span></div>`
      : `<div class="w-full flex items-center justify-between bg-[#161922] text-[#4B5563] text-xs px-3 py-2 rounded-lg border border-[#272A30] mt-2"><span>🏡 Dirección Residencia</span> <span class="text-[10px] italic">Pendiente</span></div>`;

    const docIngresosHtml = lead.url_comprobante_ingresos
      ? `<a href="${lead.url_comprobante_ingresos}" target="_blank" class="w-full flex items-center justify-between text-xs font-semibold px-3 py-2 rounded-lg mt-2 transition" style="background: var(--surface-2);"><span class="flex items-center gap-1.5 text-[#F5F5F4]"><span class="status-dot"></span>📊 Estados de Cuenta</span> <span class="text-[10px] text-[#6B7280] font-semibold">Ver Archivo →</span></a>`
      : `<div class="w-full flex items-center justify-between bg-[#161922] text-[#4B5563] text-xs px-3 py-2 rounded-lg border border-[#272A30] mt-2"><span>📊 Estados de Cuenta</span> <span class="text-[10px] italic">Pendiente</span></div>`;

    expedienteContainer.innerHTML = docIneHtml + docDomicilioHtml + docIngresosHtml;
  }

  await refreshChatLive(lead.id);

  document.getElementById('drawerPro').classList.add('drawer-open');
  document.getElementById('drawerOverlay').classList.remove('hidden');
}

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
        <p class="text-[#4B5563] font-medium">No hay logs crudos guardados en la tabla chat_history.</p>
        <p class="text-[11px] text-[#4B5563] bg-[#161922] border border-[#272A30] rounded-lg p-2 max-w-xs mx-auto">Última interacción mapeada: "${escapeHtml(lead.ultimo_mensaje || 'Ninguno')}"</p>
      </div>`;
    return;
  }

  const despegadoDelFondo = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight > 100;

  chatContainer.innerHTML = messages.map(msg => {
    const isBot = String(msg.role).toLowerCase() === 'assistant' || String(msg.role).toLowerCase() === 'bot' || !!msg.response;
    const textContent = msg.message || msg.content || msg.response || '---';

    if (isBot) {
      return `
        <div class="self-start max-w-[85%] bg-[#161922] border border-[#272A30] p-3 rounded-2xl rounded-tl-none space-y-1">
          <p class="font-bold text-[10px] uppercase tracking-wide" style="color: var(--cold);">🤖 Cerebro IA</p>
          <p class="leading-relaxed select-text">${escapeHtml(textContent)}</p>
        </div>
      `;
    } else {
      return `
        <div class="self-end max-w-[85%] p-3 rounded-2xl rounded-tr-none space-y-1 text-right" style="background: var(--text); color: var(--bg);">
          <p class="font-bold text-[10px] uppercase tracking-wide opacity-70">👤 Prospecto</p>
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

// ------------------------------------------------------------
// MODO CATÁLOGO / PRESENTACIÓN 🖼️
// Redacta datos financieros internos y de contacto del lead,
// y transforma el inventario en un catálogo listo para mostrar
// directamente a un cliente en el lote.
// ------------------------------------------------------------
let catalogModeActive = false;

function initCatalogMode() {
  const toggle = document.getElementById('catalogModeToggle');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    catalogModeActive = !catalogModeActive;
    document.body.classList.toggle('catalog-mode', catalogModeActive);
    toggle.classList.toggle('active', catalogModeActive);
    toggle.setAttribute('aria-pressed', String(catalogModeActive));

    if (catalogModeActive) {
      const inventarioBtn = document.querySelector('[data-section="section-inventario"]');
      if (inventarioBtn) inventarioBtn.click();
    }
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
            alert(`¡Éxito! Se extrajeron y cargaron ${autosParaInsertar.length} autos en masa.`);
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
      statusText.style.color = 'var(--amber-strong)';

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const filePath = `${currentLote.id}/${fileName}`;

      const { error } = await supabaseClient.storage
        .from('car-images')
        .upload(filePath, file);

      if (error) {
        statusText.textContent = 'Fallo de Storage. Valida permisos del Bucket.';
        statusText.style.color = 'var(--danger)';
        return;
      }

      const { data: publicUrlData } = supabaseClient.storage
        .from('car-images')
        .getPublicUrl(filePath);

      document.getElementById('carImageUrl').value = publicUrlData.publicUrl;
      statusText.textContent = '¡Imagen montada! Link inyectado al formulario. 🖼️';
      statusText.style.color = 'var(--success)';
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
  initMarketingModule();
  initCatalogMode();
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