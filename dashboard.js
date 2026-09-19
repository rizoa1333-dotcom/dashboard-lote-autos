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

const STRIPE_LINK = 'https://buy.stripe.com/8x27sN80F9JLa3Y7Zz3oA05';
const PRECIO_PLAN_MXN = 15000;
function redirigirAStripeCheckout(lote) {
  const url = new URL(STRIPE_LINK);
  url.searchParams.set('client_reference_id', lote.id);
  window.location.href = url.toString();
}

const PLACEHOLDER_IMG = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22400%22%20height%3D%22250%22%20viewBox%3D%220%200%20400%20250%22%3E%3Crect%20width%3D%22400%22%20height%3D%22250%22%20fill%3D%22%2320242F%22/%3E%3Ctext%20x%3D%22200%22%20y%3D%22125%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2216%22%20fill%3D%22%239CA3AF%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ESin%20foto%3C%2Ftext%3E%3C%2Fsvg%3E';

// Variables de Control Global
let currentUser = null;
let currentLote = null;
let syncIntervalId = null;

let leadsCache = [];
let carsCache = [];
let citasCache = [];
let citasCalendarioMes = new Date();
let citasDiaSeleccionado = null;
let editingCarId = null;
let activeLeadId = null;
let carImageUrls = [];

let marketingSelectedCarId = null;
let marketingImageUrls = [];

let catalogModeActive = false;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.sessionStorage,
    storageKey: 'p360-auth-session',
    detectSessionInUrl: true
  }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || (!session && currentUser)) {
    stopSync();
    currentUser = null;
    currentLote = null;
    showView('view-login');
  }
});

function showView(viewId) {
  const displayMap = {
    'view-registro':  'flex',
    'view-login':     'flex',
    'view-dashboard': 'flex'
  };
  ['view-registro', 'view-login', 'view-dashboard'].forEach(id => {
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
    if (activeLeadId && !catalogModeActive) {
      await refreshChatLive(activeLeadId);
    }
  } catch (err) {
    console.error('[Sync Core] Error de refresco automatizado:', err);
  }
}

// ------------------------------------------------------------
// SECCIÓN LEADS
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
  // FIX: solo traer citas de hoy en adelante — las pasadas no deben aparecer
  const hoy = claveDiaMx(new Date());
  const { data, error } = await supabaseClient
    .from('citas')
    .select('*')
    .eq('lote_id', currentLote.id)
    .gte('fecha_cita', hoy)
    .order('fecha_cita', { ascending: true });

  if (error) {
    console.error('[Citas Engine] Error de consulta a tabla citas:', error);
    return;
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
      const fechaReg = lead.created_at ? parseFechaMx(lead.created_at) : new Date();
      const horaVisual = fechaReg.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' });
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
          <td class="px-4 py-3 text-xs text-[#9CA3AF]">${horaVisual}</td>
          <td class="px-4 py-3"><span class="badge ${statusBadgeClass(lead.status)}">${escapeHtml(lead.status || 'Calificado')}</span></td>
          <td class="px-4 py-3 text-right">
            <button data-lead-id="${escapeHtml(lead.id)}" class="btn-ver-perfil text-[11px] btn-primary px-2.5 py-1.5 rounded-lg font-medium cursor-pointer">Ver Perfil</button>
          </td>
        </tr>`;
    };

    const tarjetaHTML = lead => {
      const fechaReg = lead.created_at ? parseFechaMx(lead.created_at) : new Date();
      const horaVisual = fechaReg.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' });
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
            <span class="text-[11px] text-[#9CA3AF]">${horaVisual}</span>
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
                  <th class="px-4 py-3">Hora</th>
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

// FIX #2: fetchInventario no existía — se reemplaza por fetchCars en todos los
// puntos de llamada (ver btn-eliminar-car más abajo).
async function fetchInventario() {
  return fetchCars();
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

  const anioActual = new Date().getFullYear();

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

            // FIX #10: usar anioActual dinámico en vez de 2026 hardcodeado
            if (anioVenta === anioActual && numeroMes >= 0 && numeroMes < 12) {
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
        console.warn("[Fix Guard] Error calculando fecha de venta:", err);
        const mesActual = new Date().getMonth();
        reporteMensual[mesActual].unidades += 1;
        reporteMensual[mesActual].dinero += precio;
      }
    } else {
      valorTotal += precio;
    }
  });

  if (invValorTotalEl) invValorTotalEl.textContent = catalogModeActive ? CATALOG_REDACTED : formatCurrency(valorTotal);
  if (invGananciasTotalesEl) invGananciasTotalesEl.textContent = catalogModeActive ? CATALOG_REDACTED : formatCurrency(gananciasTotales);

  if (mensualesContainer) {
    const mesesConVentas = reporteMensual.filter(m => m.unidades > 0);

    if (catalogModeActive) {
      mensualesContainer.innerHTML = `<p class="text-xs text-[#9CA3AF] italic p-2">Facturación oculta en Modo Catálogo.</p>`;
    } else if (mesesConVentas.length === 0) {
      mensualesContainer.innerHTML = `<p class="text-xs text-[#9CA3AF] italic p-2">Sin registros de facturación cerrados en el año en curso.</p>`;
    } else {
      mensualesContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          ${mesesConVentas.map(mes => `
            <div class="flex items-center justify-between p-3 bg-[#161922] border border-[#272A30] rounded-xl">
              <div>
                <p class="text-xs font-bold">${mes.name}</p>
                <p class="text-[10px] text-[#9CA3AF] font-medium">${mes.unidades} ${mes.unidades === 1 ? 'unidad vendida' : 'unidades vendidas'}</p>
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

  if (kpiPublicadosEl) {
    const publicadosEsteMes = carsCache.filter(car => car.publicado_meta === true || car.publicado_tiktok === true).length;
    kpiPublicadosEl.textContent = publicadosEsteMes;
  }
}

// ------------------------------------------------------------
// SALUD DEL INVENTARIO
// ------------------------------------------------------------
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

  const tieneCopy = !!((car.copy_meta && car.copy_meta.trim()) || (car.tiktok_hook && car.tiktok_hook.trim()));
  const publicado = car.publicado_meta === true || car.publicado_tiktok === true;

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
    const resp = await fetch(N8N_VERIFICAR_PUBLICACION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ car_id: carId, request_id: requestId, plataforma })
    });
    if (!resp.ok) throw new Error(`Webhook respondió ${resp.status}`);
    const data = await resp.json();

    if (data.completado && !data.fallo) {
      btnEl.textContent = '✅ Confirmado';
      btnEl.classList.add('opacity-60');
      btnEl.disabled = true;
    } else if (data.fallo) {
      btnEl.textContent = '❌ Falló en la plataforma';
      btnEl.disabled = false;
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

    const estaPublicado = car.publicado_meta === true || car.publicado_tiktok === true;
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
                ${car.upload_post_request_id_tiktok ? `<button data-verify-id="${escapeHtml(car.id)}" data-request-id="${escapeHtml(car.upload_post_request_id_tiktok)}" data-plataforma="tiktok" class="btn-verificar-publicacion text-[10px] underline text-[#6B7280] hover:text-[#F5F5F4]">Verificar TikTok</button>` : ''}
              </div>
              <div class="flex items-center gap-1.5 mt-1.5 catalog-only">
                <span class="${dotCatalogClass}"></span>
                <span class="text-[11px] text-[#9CA3AF]">${textoCatalog}</span>
              </div>
            </div>
            <button data-edit-id="${escapeHtml(car.id)}" class="btn-editar-car internal-only text-xs opacity-60 hover:opacity-100 transition flex-shrink-0" title="Editar Unidad">✏️</button>
            <button data-delete-id="${escapeHtml(car.id)}" data-nombre="${escapeHtml(unidadNombre)}" class="btn-eliminar-car internal-only text-xs opacity-60 hover:opacity-100 transition flex-shrink-0" title="Eliminar Unidad">🗑️</button>
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
    btn.addEventListener('click', async () => {
      const hoyParaBD = new Date().toISOString().split('T')[0];
      const { error } = await supabaseClient
        .from('cars')
        .update({ status: 'Vendido', fecha_venta: hoyParaBD })
        .eq('id', btn.getAttribute('data-action-id'))
        .eq('lote_id', currentLote.id);

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
      document.getElementById('carCaracteristicas').value = car.caracteristicas || '';
      document.getElementById('carStatus').value = car.status || 'Disponible';
      carImageUrls = Array.isArray(car.image_urls) && car.image_urls.length ? [...car.image_urls] : (car.image_url ? [car.image_url] : []);
      document.getElementById('carImageUrl').value = carImageUrls[0] || '';
      renderCarThumbs();

      document.getElementById('modalCarTitle').textContent = 'Editar Datos de Unidad';
      document.getElementById('btnSubmitCarForm').textContent = 'Actualizar Cambios en Patio';
      document.getElementById('uploadStatusText').textContent = carImageUrls.length ? `${carImageUrls.length} foto(s) activa(s).` : '';

      document.getElementById('modalCarOverlay').classList.remove('hidden');
    });
  });

  grid.querySelectorAll('.btn-eliminar-car').forEach(btn => {
    btn.addEventListener('click', async () => {
      const carId = btn.getAttribute('data-delete-id');
      const nombre = btn.getAttribute('data-nombre') || 'esta unidad';
      if (!confirm(`¿Eliminar permanentemente "${nombre}" del inventario?\n\nEsta acción no se puede deshacer.`)) return;
      btn.textContent = '⏳';
      btn.disabled = true;
      const { error } = await supabaseClient.from('cars').delete().eq('id', carId).eq('lote_id', currentLote.id);
      if (error) {
        alert('Error al eliminar la unidad. Intenta de nuevo.');
        btn.textContent = '🗑️';
        btn.disabled = false;
        return;
      }
      // FIX #2: corregido fetchInventario → fetchCars (la función original no existía)
      await fetchCars();
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

// ------------------------------------------------------------
// AGENTE PUBLICITARIO IA
// ------------------------------------------------------------
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
    const resp = await fetch(N8N_MARKETING_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ car, lote_id: currentLote.id, image_url: marketingImageUrls[0], image_urls: marketingImageUrls })
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

async function subirMediaMarketing(files) {
  const statusText = document.getElementById('marketingStatusText');
  const imageFiles = files.filter(f => f.type.startsWith('image/'));

  if (statusText) { statusText.textContent = `Subiendo ${files.length} archivo(s) a la nube... ⏳`; statusText.style.color = 'var(--amber-strong)'; }

  const subir = async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `marketing_${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
    const filePath = `${currentLote.id}/${fileName}`;
    const { error } = await supabaseClient.storage.from('car-images').upload(filePath, file);
    if (error) return null;
    return supabaseClient.storage.from('car-images').getPublicUrl(filePath).data.publicUrl;
  };

  for (const file of imageFiles) {
    const url = await subir(file);
    if (url) marketingImageUrls.push(url);
  }

  renderMarketingThumbs();
  if (statusText) { statusText.textContent = 'Archivos listos. Ahora genera el contenido con IA. 🖼️'; statusText.style.color = 'var(--success)'; }
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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (files.length) { subirMediaMarketing(files); }
  });

  btnGenerar.addEventListener('click', async () => {
    const car = carsCache.find(c => String(c.id) === String(marketingSelectedCarId));
    if (!car) { alert('Selecciona una unidad del inventario primero.'); return; }

    btnGenerar.disabled = true;
    btnGenerar.textContent = '⏳ Generando copy...';
    try {
      copyText.value = await generarCopyIA(car);
      if (statusText) { statusText.textContent = 'Contenido generado. Puedes editarlo antes de publicar.'; statusText.style.color = 'var(--text-dim)'; }
    } finally {
      btnGenerar.disabled = false;
      btnGenerar.textContent = '✨ Generar Copy con IA';
    }
  });

  btnPublicar.addEventListener('click', async () => {
    const car = carsCache.find(c => String(c.id) === String(marketingSelectedCarId));
    if (!car) { alert('Selecciona una unidad del inventario primero.'); return; }

    const platforms = getSelectedPlatforms();
    if (platforms.length === 0) { alert('Selecciona al menos una red social.'); return; }
    if (!copyText.value.trim()) { alert('Genera o escribe un copy antes de publicar.'); return; }

    btnPublicar.disabled = true;

    try {
      btnPublicar.textContent = 'Publicando...';
      if (!N8N_PUBLISH_WEBHOOK_URL) throw new Error('Falta configurar N8N_PUBLISH_WEBHOOK_URL en dashboard.js.');
      const resp = await fetch(N8N_PUBLISH_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
        body: JSON.stringify({ car, copy: copyText.value.trim(), image_url: marketingImageUrls[0] || car.image_url, image_urls: marketingImageUrls.length ? marketingImageUrls : car.image_urls })
      });
      if (!resp.ok) throw new Error(`Webhook respondió ${resp.status}`);
    } catch (err) {
      console.error('[Agente IA] Error al publicar:', err);
      btnPublicar.disabled = false;
      updateBtnPublicarLabel();
      if (statusText) { statusText.textContent = 'Fallo la publicación. Revisa los webhooks de n8n.'; statusText.style.color = 'var(--danger)'; }
      return;
    }

    const updatePayload = {
      copy_meta: copyText.value.trim(),
      image_url: marketingImageUrls[0] || car.image_url
    };
    if (marketingImageUrls.length) updatePayload.image_urls = marketingImageUrls;

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabaseClient.from('cars').update(updatePayload).eq('id', car.id).eq('lote_id', currentLote.id);
      if (error) {
        console.error('[Agente IA] Error al guardar copy/fotos:', error);
        btnPublicar.disabled = false;
        updateBtnPublicarLabel();
        if (statusText) {
          statusText.textContent = `Se publicó, pero no se pudo guardar el copy/fotos: ${error.message}`;
          statusText.style.color = 'var(--danger)';
        }
        await fetchCars();
        return;
      }
    }

    btnPublicar.disabled = false;
    updateBtnPublicarLabel();

    if (statusText) { statusText.textContent = `¡Publicado! ${car.brand} ${car.model} ya está marcado como Publicado.`; statusText.style.color = 'var(--success)'; }
    await fetchCars();
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

  const expedienteContainer = document.getElementById('drawerExpedienteDocs');
  if (expedienteContainer) {
    expedienteContainer.innerHTML =
      renderDocPreview(lead.url_ine, '🪪', 'Clave Elector (INE)') +
      renderDocPreview(lead.url_comprobante_domicilio, '🏡', 'Dirección de Residencia') +
      renderDocPreview(lead.url_comprobante_ingresos, '📊', 'Estados de Cuenta');
  }

  await refreshChatLive(lead.id);

  document.getElementById('drawerPro').classList.add('drawer-open');
  document.getElementById('drawerOverlay').classList.remove('hidden');
  if (window._activarDrawerTabDatos) window._activarDrawerTabDatos();
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
    .eq('lote_id', currentLote.id)
    .order('created_at', { ascending: true });

  if (chatErr) {
    console.error('[CRM Live Chat Error]:', chatErr);
    return;
  }

  if (!messages || messages.length === 0) {
    chatContainer.innerHTML = `
      <div class="my-auto text-center space-y-2 p-6">
        <p class="text-[#9CA3AF] font-medium">No hay logs guardados en chat_history.</p>
        <p class="text-[11px] text-[#9CA3AF] bg-[#161922] border border-[#272A30] rounded-lg p-2 max-w-xs mx-auto">Última interacción: "${escapeHtml(lead.ultimo_mensaje || 'Ninguno')}"</p>
      </div>`;
    return;
  }

  const despegadoDelFondo = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight > 100;

  chatContainer.innerHTML = messages.map(msg => {
    const isBot = String(msg.role).toLowerCase() === 'assistant' || String(msg.role).toLowerCase() === 'bot' || String(msg.role).toLowerCase() === 'model' || !!msg.response;
    const textContent = msg.message || msg.content || msg.response || '---';
    const hora = msg.created_at
      ? parseFechaMx(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })
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
          <p class="font-bold text-[10px] uppercase tracking-wide opacity-70">👤 Prospecto ${hora ? '· ' + hora : ''}</p>
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
// MODO CATÁLOGO
// FIX #8: limpiar leadsCache al activar para evitar lectura por consola
// ------------------------------------------------------------

// ============================================================
// DRAWER TABS — navegación móvil entre Datos / Chat / Docs
// ============================================================
function initDrawerTabs() {
  const tabs = document.querySelectorAll('.drawer-tab-btn');
  if (!tabs.length) return;

  function activarTab(tabId) {
    // Ocultar todos los paneles
    document.querySelectorAll('.drawer-tab-content').forEach(el => {
      el.style.display = 'none';
    });
    // Desactivar todos los botones
    tabs.forEach(btn => btn.classList.remove('active'));

    // Mostrar panel seleccionado
    const panel = document.getElementById(tabId);
    if (panel) panel.style.display = 'flex';

    // Activar botón correspondiente
    const btn = document.querySelector(`[data-drawer-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    // Si es el chat, hacer scroll al fondo
    if (tabId === 'tab-chat') {
      const chat = document.getElementById('crmChatHistoryContainer');
      if (chat) setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 50);
    }
  }

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      activarTab(btn.getAttribute('data-drawer-tab'));
    });
  });

  // Al abrir el drawer, activar tab de datos por defecto (solo en móvil)
  window._activarDrawerTabDatos = () => {
    if (window.innerWidth < 1024) activarTab('tab-datos');
  };
}

function initCatalogMode() {
  const toggle = document.getElementById('catalogModeToggle');
  if (!toggle) return;

  toggle.addEventListener('click', () => {
    catalogModeActive = !catalogModeActive;
    document.body.classList.toggle('catalog-mode', catalogModeActive);
    toggle.classList.toggle('active', catalogModeActive);
    toggle.setAttribute('aria-pressed', String(catalogModeActive));

    if (catalogModeActive) {
      closeDrawer();
      activeLeadId = null;

      // FIX #8: vaciar caché sensible en memoria para que F12 no exponga datos
      leadsCache = [];
      citasCache = [];

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
    alert('¡Pago recibido! Tu plan se activará en unos segundos.');
    window.history.replaceState({}, '', window.location.pathname);
    setTimeout(async () => {
      const { data } = await supabaseClient.from('lotes').select('*').eq('id', currentLote.id).single();
      if (data) { currentLote = data; renderSubscriptionStatus(); }
    }, 2000);
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
    if (data) console.log('[Multi-Tenant Node] Instancia vinculada:', data.instance_name);
  } catch (err) {
    console.error('[WhatsApp]', err);
  }
}

// ------------------------------------------------------------
// MÓDULO WHATSAPP QR
// ------------------------------------------------------------
async function cargarEstadoWhatsappQr() {
  if (!currentLote || !N8N_QR_WEBHOOK_URL) return;

  const badge = document.getElementById('whatsappEstadoBadge');
  const conectadoWrap = document.getElementById('whatsappConectado');
  const qrWrap = document.getElementById('whatsappQrWrap');
  const qrImg = document.getElementById('whatsappQrImg');
  const qrLoading = document.getElementById('whatsappQrLoading');

  qrLoading.textContent = 'Cargando código QR...';
  qrImg.classList.add('hidden');
  qrLoading.classList.remove('hidden');

  try {
    const resp = await fetch(N8N_QR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ lote_id: currentLote.id })
    });

    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(`n8n respondió ${resp.status} sin JSON válido.`);
    }
    if (!resp.ok) {
      throw new Error(`n8n respondió ${resp.status}: ${data.error || raw.slice(0, 200)}`);
    }

    if (data.conectado) {
      badge.textContent = 'Conectado';
      badge.className = 'badge badge-success';
      conectadoWrap.classList.remove('hidden');
      conectadoWrap.classList.add('flex');
      qrWrap.classList.add('hidden');
      document.getElementById('whatsappNumeroConectado').textContent = data.numero || '--';
    } else {
      badge.textContent = 'Sin conectar';
      badge.className = 'badge badge-warm';
      conectadoWrap.classList.add('hidden');
      qrWrap.classList.remove('hidden');
      if (data.qr_base64) {
        qrImg.src = data.qr_base64;
        qrImg.classList.remove('hidden');
        qrLoading.classList.add('hidden');
      } else {
        qrLoading.textContent = 'No se pudo generar el QR. Intenta actualizar.';
      }
    }
  } catch (err) {
    console.error('[WhatsApp QR] Error:', err);
    qrLoading.textContent = err.message || 'Error al cargar el QR.';
  }
}

// ------------------------------------------------------------
// MÓDULO REDES SOCIALES
// ------------------------------------------------------------
async function conectarRedesSociales() {
  if (!currentLote || !N8N_REDES_WEBHOOK_URL) { alert('Falta configurar N8N_REDES_WEBHOOK_URL en dashboard.js.'); return; }
  const btnConectar = document.getElementById('btnConectarRedes');
  const statusText = document.getElementById('redesStatusText');

  btnConectar.disabled = true;
  btnConectar.textContent = 'Generando enlace seguro...';

  try {
    const resp = await fetch(N8N_REDES_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ accion: 'conectar', lote_id: currentLote.id })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `n8n respondió ${resp.status}`);
    if (!data.access_url) throw new Error('El servidor no devolvió un enlace de conexión.');

    window.open(data.access_url, '_blank', 'noopener');
    statusText.textContent = 'Conecta tus cuentas en la pestaña nueva y regresa aquí.';
    document.getElementById('btnVerificarRedes').classList.remove('hidden');
  } catch (err) {
    console.error('[Redes Sociales] Error al conectar:', err);
    statusText.textContent = 'No se pudo generar el enlace. Intenta de nuevo.';
  } finally {
    btnConectar.disabled = false;
    btnConectar.textContent = 'Conectar Redes Sociales';
  }
}

async function verificarRedesSociales() {
  if (!currentLote || !N8N_REDES_WEBHOOK_URL) return;
  const btnVerificar = document.getElementById('btnVerificarRedes');
  const statusText = document.getElementById('redesStatusText');
  const badge = document.getElementById('redesEstadoBadge');

  btnVerificar.disabled = true;
  btnVerificar.textContent = 'Verificando...';

  try {
    const resp = await fetch(N8N_REDES_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentLote.webhook_token}` },
      body: JSON.stringify({ accion: 'verificar', lote_id: currentLote.id })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `n8n respondió ${resp.status}`);

    if (data.conectado) {
      badge.textContent = 'Conectado';
      badge.className = 'badge badge-success';
      const btnConectar = document.getElementById('btnConectarRedes');
      btnConectar.textContent = '✅ Conectado';
      btnConectar.disabled = true;
      btnConectar.style.background = 'var(--success)';
      btnConectar.style.color = '#fff';
      btnVerificar.classList.add('hidden');
      statusText.textContent = 'Tus redes ya están conectadas.';
    } else {
      statusText.textContent = 'Todavía no detectamos la conexión. Termina el proceso y vuelve a verificar.';
    }
  } catch (err) {
    console.error('[Redes Sociales] Error al verificar:', err);
    statusText.textContent = 'Error al verificar. Intenta de nuevo.';
  } finally {
    btnVerificar.disabled = false;
    btnVerificar.textContent = 'Ya conecté mis cuentas — Verificar';
  }
}

// ------------------------------------------------------------
// ROUTE GUARD
// ------------------------------------------------------------
async function checkSessionAndLote() {
  try {
    const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
    if (sessionErr || !sessionData || !sessionData.session) {
      currentUser = null;
      currentLote = null;
      showView('view-login');
      return false;
    }

    currentUser = sessionData.session.user;
    console.log('[Route Guard] Usuario autenticado:', currentUser.email, '| ID:', currentUser.id);

    const { data: loteData, error: loteError } = await supabaseClient
      .from('lotes')
      .select('*')
      .eq('profile_id', currentUser.id);

    if (loteError) {
      console.error('[Route Guard] Error consultando lote:', loteError);
    }

    console.log('[Route Guard] Lotes encontrados:', loteData?.length || 0, loteData);

    if (loteData && loteData.length > 0) {
      currentLote = loteData[0];
      console.log('[Route Guard] Lote activo:', currentLote.nombre, '| ID:', currentLote.id);
      renderConfigLote();
      renderSubscriptionStatus();
      showView('view-dashboard');
      startSync();
      return true;
    }

    let pendienteRaw = null;
    try { pendienteRaw = sessionStorage.getItem('p360-pending-lote'); } catch (_) {}

    if (pendienteRaw) {
      try {
        const datosLote = JSON.parse(pendienteRaw);
        const loteCreado = await crearLoteParaUsuarioActual(datosLote);
        if (loteCreado) {
          sessionStorage.removeItem('p360-pending-lote');
          currentLote = loteCreado;
          redirigirAStripeCheckout(currentLote);
          return true;
        }
      } catch (err) {
        console.error('[Route Guard] No se pudo completar el lote pendiente:', err);
      }
    }

    currentLote = null;
    showView('view-registro');
    return true;
  } catch (err) {
    console.error('[Route Guard] Excepción validando sesión:', err);
    currentUser = null;
    currentLote = null;
    showView('view-login');
    return false;
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btnLogin = e.target.querySelector('button[type="submit"]');
  if (errorEl) errorEl.textContent = '';
  if (btnLogin) { btnLogin.disabled = true; btnLogin.textContent = 'Iniciando sesión...'; }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[Login] Error Supabase:', error);
      if (errorEl) errorEl.textContent = error.message || 'Credenciales no válidas.';
      return;
    }
    if (!data || !data.user) {
      if (errorEl) errorEl.textContent = 'No se pudo autenticar. Intenta de nuevo.';
      return;
    }
    currentUser = data.user;
    await checkSessionAndLote();
  } catch (err) {
    console.error('[Login] Excepción:', err);
    if (errorEl) errorEl.textContent = 'Error de conexión. Verifica tu internet.';
  } finally {
    if (btnLogin) { btnLogin.disabled = false; btnLogin.textContent = 'Iniciar Sesión'; }
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

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });

  if (signUpError) {
    if (errorEl) errorEl.textContent = signUpError.message;
    if (btnRegistro) btnRegistro.disabled = false;
    return;
  }

  const esCorreoDuplicado = signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0;
  if (esCorreoDuplicado) {
    if (errorEl) errorEl.textContent = 'Ese correo ya tiene una cuenta. Inicia sesión en vez de registrarte de nuevo.';
    if (btnRegistro) btnRegistro.disabled = false;
    return;
  }

  if (!signUpData.session) {
    try {
      sessionStorage.setItem('p360-pending-lote', JSON.stringify(datosLote));
    } catch (_) {}
    if (errorEl) {
      errorEl.classList.remove('text-[#A9584A]');
      errorEl.classList.add('text-[#4B8B72]');
      errorEl.textContent = 'Cuenta creada. Revisa tu correo para confirmarla.';
    }
    if (btnRegistro) btnRegistro.disabled = false;
    return;
  }

  currentUser = signUpData.user;
  const loteCreado = await crearLoteParaUsuarioActual(datosLote);
  if (!loteCreado) {
    if (errorEl) errorEl.textContent = 'Tu cuenta se creó, pero el lote no se pudo registrar. Contacta soporte.';
    if (btnRegistro) btnRegistro.disabled = false;
    return;
  }

  currentLote = loteCreado;
  redirigirAStripeCheckout(currentLote);
}

async function crearLoteParaUsuarioActual(datosLote) {
  if (!currentUser) return null;
  const { data, error } = await supabaseClient
    .from('lotes')
    .insert({ profile_id: currentUser.id, ...datosLote })
    .select()
    .single();

  if (error) {
    console.error('[Registro] No se pudo crear el lote:', error);
    return null;
  }
  return data;
}

// ------------------------------------------------------------
// DOMContentLoaded
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Helper: listener seguro que no revienta si el elemento no existe
  function on(id, event, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  }

  // ── PRIMERO: login y registro — estos SIEMPRE deben funcionar ──────────
  on('loginForm',    'submit', handleLoginSubmit);
  on('registroForm', 'submit', handleRegistroSubmit);

  on('to-login-btn',    'click', (e) => { e.preventDefault(); showView('view-login'); });
  on('to-registro-btn', 'click', (e) => { e.preventDefault(); showView('view-registro'); });

  on('registroEstado', 'change', (e) => {
    const box   = document.getElementById('registroPrecioBox');
    const texto = document.getElementById('registroPrecioTexto');
    if (!box || !texto) return;
    if (!e.target.value) { box.classList.add('hidden'); return; }
    texto.textContent = `${formatCurrency(PRECIO_PLAN_MXN)} + IVA`;
    box.classList.remove('hidden');
  });

  // ── SEGUNDO: detectar sesión y mostrar la vista correcta ───────────────
  await checkSessionAndLote();
  handleStripeReturn();
  handleSocialReturn();

  // ── TERCERO: listeners del dashboard (solo si los elementos existen) ───
  on('subscriptionPayBtn', 'click', () => { if (currentLote) redirigirAStripeCheckout(currentLote); });
  on('btnRefrescarQr',    'click', cargarEstadoWhatsappQr);
  on('btnConectarRedes',  'click', conectarRedesSociales);
  on('btnVerificarRedes', 'click', verificarRedesSociales);
  on('logoutBtn', 'click', async () => {
    stopSync();
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentLote = null;
    showView('view-login');
  });
  on('closeDrawerBtn',  'click', closeDrawer);
  on('drawerOverlay',   'click', closeDrawer);

  on('configForm', 'submit', async (e) => {
    e.preventDefault();
    const { data, error } = await supabaseClient.from('lotes').update({
      nombre:           document.getElementById('configNombreLote').value.trim(),
      whatsapp_number:  document.getElementById('configPhoneLote').value.trim()
    }).eq('id', currentLote.id).select().single();
    if (!error) { currentLote = data; renderConfigLote(); alert('Lote guardado.'); }
  });

  const modalCar = document.getElementById('modalCarOverlay');

  on('btnAbrirModalCar', 'click', () => {
    editingCarId = null;
    carImageUrls = [];
    const form = document.getElementById('formNuevoCar');
    if (form) form.reset();
    const urlEl = document.getElementById('carImageUrl');
    if (urlEl) urlEl.value = '';
    const statusEl = document.getElementById('uploadStatusText');
    if (statusEl) statusEl.textContent = '';
    renderCarThumbs();
    const title = document.getElementById('modalCarTitle');
    if (title) title.textContent = 'Registrar Nuevo Vehículo';
    const btnSubmit = document.getElementById('btnSubmitCarForm');
    if (btnSubmit) btnSubmit.textContent = 'Guardar Unidad en Sistema';
    if (modalCar) modalCar.classList.remove('hidden');
  });

  on('btnCerrarModalCar', 'click', () => {
    if (modalCar) modalCar.classList.add('hidden');
  });

  // Import CSV
  const btnImportar = document.getElementById('btnImportarExcel');
  const fileInputExcel = document.getElementById('excelFileInput');
  if (btnImportar && fileInputExcel) {
    btnImportar.addEventListener('click', () => fileInputExcel.click());
    fileInputExcel.addEventListener('change', function(e) {
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
        if (autosParaInsertar.length > 0) {
          const { error } = await supabaseClient.from('cars').insert(autosParaInsertar);
          if (error) { alert('Error en formato del CSV. Valida tus columnas.'); console.error(error); }
          else { alert(`¡Éxito! Se cargaron ${autosParaInsertar.length} autos.`); await fetchCars(); }
        }
        fileInputExcel.value = '';
      };
      reader.readAsText(file);
    });
  }

  // Upload de fotos de autos
  const imageInput = document.getElementById('carImageFile');
  if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      const statusText = document.getElementById('uploadStatusText');
      if (statusText) { statusText.textContent = `Subiendo ${files.length} foto(s) a la nube... ⏳`; statusText.style.color = 'var(--amber-strong)'; }
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
        const filePath = `${currentLote.id}/${fileName}`;
        const { error } = await supabaseClient.storage.from('car-images').upload(filePath, file);
        if (error) {
          if (statusText) { statusText.textContent = 'Fallo de Storage. Valida permisos del Bucket.'; statusText.style.color = 'var(--danger)'; }
          continue;
        }
        const { data: publicUrlData } = supabaseClient.storage.from('car-images').getPublicUrl(filePath);
        carImageUrls.push(publicUrlData.publicUrl);
      }
      const urlEl = document.getElementById('carImageUrl');
      if (urlEl) urlEl.value = carImageUrls[0] || '';
      renderCarThumbs();
      if (statusText) { statusText.textContent = `${carImageUrls.length} foto(s) lista(s). 🖼️`; statusText.style.color = 'var(--success)'; }
      imageInput.value = '';
    });
  }

  // Submit form nuevo auto
  on('formNuevoCar', 'submit', async (e) => {
    e.preventDefault();
    if (!currentLote) return;
    if (isNaN(parseInt(document.getElementById('carYear').value)) || isNaN(parseFloat(document.getElementById('carPrice').value))) {
      alert('Revisa el año y el precio: deben ser números válidos.');
      return;
    }
    const btnSubmit = document.getElementById('btnSubmitCarForm');
    if (btnSubmit) btnSubmit.disabled = true;
    const carData = {
      lote_id:         currentLote.id,
      brand:           document.getElementById('carBrand').value.trim(),
      model:           document.getElementById('carModel').value.trim(),
      year:            parseInt(document.getElementById('carYear').value),
      price:           parseFloat(document.getElementById('carPrice').value),
      image_url:       document.getElementById('carImageUrl').value.trim() || PLACEHOLDER_IMG,
      image_urls:      carImageUrls,
      status:          document.getElementById('carStatus').value,
      transmision:     document.getElementById('carTransmision').value,
      kilometraje:     parseFloat(document.getElementById('carKilometraje').value) || 0,
      enganche_minimo: parseFloat(document.getElementById('carEnganche').value) || 0,
      caracteristicas: document.getElementById('carCaracteristicas')?.value.trim() || null
    };
    let response;
    if (editingCarId) {
      response = await supabaseClient.from('cars').update(carData).eq('id', editingCarId).eq('lote_id', currentLote.id);
    } else {
      response = await supabaseClient.from('cars').insert(carData);
    }
    if (response.error) {
      console.error('[Inventario] Error al guardar carro:', response.error);
      alert(`Error al guardar: ${response.error.message}`);
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }
    if (btnSubmit) btnSubmit.disabled = false;
    e.target.reset();
    editingCarId = null;
    carImageUrls = [];
    renderCarThumbs();
    if (modalCar) modalCar.classList.add('hidden');
    await fetchCars();
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

function renderDocPreview(rawUrl, emoji, label) {
  const url = sanitizeUrl(rawUrl, '');
  if (!url) {
    return `<div class="w-full flex items-center justify-between bg-[#161922] text-[#9CA3AF] text-xs px-3 py-2 rounded-lg border border-[#272A30] mt-2"><span>${emoji} ${escapeHtml(label)}</span> <span class="text-[10px] italic">Pendiente</span></div>`;
  }
  return `<div class="w-full p-2.5 rounded-lg text-xs mt-2" style="background: var(--surface-2);">
    <span class="font-bold flex items-center gap-1.5 text-[#F5F5F4] mb-2"><span class="status-dot"></span>${emoji} ${escapeHtml(label)}</span>
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="block rounded-lg overflow-hidden border border-[#272A30]">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" class="w-full max-h-40 object-cover" loading="lazy" data-url="${escapeHtml(url)}" data-label="${escapeHtml(label)}" onerror="handleDocPreviewError(this)">
    </a>
  </div>`;
}

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