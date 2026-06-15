// ============================================================
// PROJECT 360 - dashboard.js (SaaS MULTI-TENANT OPTIMIZADO)
// ============================================================

const SUPABASE_URL = 'https://deljncdcddfghfihuumd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zRD9aSUEnmURrji2G5HLSw_EYxriwf-';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let localLeadsCache = [];
let currentLote = null;

// ============================================================
// CONTROL DE ACCESO E INICIALIZACIÓN GENERAL
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Verificar sesión activa
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    window.location.href = "login.html";
    return;
  }

  // 2. Descargar lote vinculado por profile_id
  const { data: lote, error: loteError } = await supabase
    .from('lotes')
    .select('*')
    .eq('profile_id', user.id)
    .single();

  if (loteError || !lote) {
    console.error("Error al obtener el lote:", loteError);
    alert("Cuenta sin lote asignado. Contacta a soporte.");
    window.location.href = "login.html";
    return;
  }

  currentLote = lote;

  // 3. Modificar UI dinámicamente usando selectores seguros por ID
  const headerText = document.getElementById("loteHeaderName");
  if (headerText) {
    headerText.innerHTML = `${lote.nombre} <span class="text-slate-400 font-normal text-xs">• ID: ${lote.id.slice(0,8)}... • Ciudad: ${lote.ciudad}</span>`;
  }
  
  const sidebarText = document.getElementById("loteSidebarName");
  if (sidebarText) sidebarText.textContent = lote.nombre;

  // Rellenar campos de la pestaña de configuración interna
  const configNombre = document.getElementById("configNombreLote");
  const configPhone = document.getElementById("configPhoneLote");
  if (configNombre) configNombre.value = lote.nombre;
  if (configPhone) configPhone.value = lote.whatsapp_number || '';

  // 4. Inicializar interactividad
  initSidebar();
  initNavigation();
  initDrawer();
  
  await fetchAndRenderAll();
  setInterval(fetchAndRenderAll, 10000);
});

async function fetchAndRenderAll() {
  if (!currentLote) return;
  await renderLeadsAndCounters();
  await renderCars();
}

// ============================================================
// SIDEBAR MÓVIL (Resistente)
// ============================================================
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  const openBtn = document.getElementById("openSidebar");
  const closeBtn = document.getElementById("closeSidebar");

  if (!sidebar) return; 

  const open = () => {
    sidebar.classList.remove("-translate-x-full");
    if (overlay) overlay.classList.remove("hidden");
  };
  const close = () => {
    sidebar.classList.add("-translate-x-full");
    if (overlay) overlay.classList.add("hidden");
  };

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);

  window._closeSidebar = close;
}

// ============================================================
// NAVEGACIÓN ENTRE SECCIONES (Filtro por clases de Tailwind)
// ============================================================
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".section-panel");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((i) => i.classList.remove("active", "bg-[#F1F5F9]", "text-slate-900"));
      item.classList.add("active");

      const target = item.dataset.section;
      sections.forEach((sec) => {
        if (sec.id === `section-${target}`) {
          sec.classList.remove("hidden");
        } else {
          sec.classList.add("hidden");
        }
      });

      if (window.innerWidth < 768 && window._closeSidebar) {
        window._closeSidebar();
      }
    });
  });
}

// ============================================================
// RENDEREADO DE DATA MULTI-TENANT (LEADS)
// ============================================================
async function renderLeadsAndCounters() {
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('lote_id', currentLote.id);

  if (error) return;

  localLeadsCache = leads || [];

  const containerLeadsList = document.getElementById("leadsList");
  const containerCitasList = document.getElementById("citasListContainer");
  const containerMonitorMensajes = document.getElementById("monitorMensajesContainer");

  if (containerLeadsList) containerLeadsList.innerHTML = "";
  if (containerCitasList) containerCitasList.innerHTML = "";
  if (containerMonitorMensajes) containerMonitorMensajes.innerHTML = "";

  let totalCalificadosPendientes = 0;
  let totalCitasHoy = 0;
  let countNuevo = 0;
  let countPendiente = 0;
  let countCita = 0;

  localLeadsCache.forEach((lead) => {
    if (lead.fecha_cita) {
      countCita++;
      totalCitasHoy++;
    } else if (lead.status === 'Pendiente') {
      countPendiente++;
    } else {
      countNuevo++;
    }

    if (lead.status === 'Pendiente' && containerLeadsList) {
      totalCalificadosPendientes++;
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#E2E8F0]";
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-amber-500">★</span>
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-900 truncate">${lead.name || 'Prospecto Anónimo'}</p>
            <p class="text-xs text-slate-400 truncate">${lead.auto_interes || 'Sin especificar'} • Enganche: ${lead.enganche || '—'}</p>
          </div>
        </div>
        <button class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors" data-lead-id="${lead.id}">
          Ver Perfil Pro
        </button>
      `;
      containerLeadsList.appendChild(row);
    }

    if (lead.fecha_cita && containerCitasList) {
      const rowCita = document.createElement("div");
      rowCita.className = "flex items-center justify-between bg-white p-3 rounded-lg border border-[#E2E8F0]";
      rowCita.innerHTML = `
        <div>
          <p class="text-sm font-medium text-slate-900">${lead.name || 'Interesado'}</p>
          <p class="text-xs text-slate-400">${lead.auto_interes || 'Unidad'} • Horario: <strong class="text-slate-700">${lead.fecha_cita}</strong></p>
        </div>
        <span class="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">Agendada</span>
      `;
      containerCitasList.appendChild(rowCita);
    }

    if (containerMonitorMensajes) {
      const rowMsg = document.createElement("div");
      rowMsg.className = "bg-white p-3 rounded-lg border border-[#E2E8F0]";
      rowMsg.innerHTML = `
        <p class="text-sm text-slate-800"><span class="font-medium">${lead.phone_number || 'Sin número'}</span> — <span class="text-xs text-slate-400">Paso: ${lead.encuesta_step || 0}</span></p>
        <p class="text-xs text-slate-500 mt-1">Auto: ${lead.auto_interes || 'No def'} | Trabajo: ${lead.situacion_laboral || '—'}</p>
      `;
      containerMonitorMensajes.appendChild(rowMsg);
    }
  });

  if (containerLeadsList && totalCalificadosPendientes === 0) {
    containerLeadsList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay leads precalificados pendientes.</p>`;
  }
  if (containerCitasList && totalCitasHoy === 0) {
    containerCitasList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay citas registradas.</p>`;
  }

  const leadsCountEl = document.getElementById("leadsCount");
  const citasCountEl = document.getElementById("citasCount");
  if (leadsCountEl) leadsCountEl.textContent = totalCalificadosPendientes;
  if (citasCountEl) citasCountEl.textContent = totalCitasHoy;

  const pNuevo = document.getElementById("pipeNuevo");
  const pPendiente = document.getElementById("pipePendiente");
  const pCita = document.getElementById("pipeCita");
  if (pNuevo) pNuevo.textContent = `${countNuevo} conversaciones en proceso`;
  if (pPendiente) pPendiente.textContent = `${countPendiente} leads listos en Dashboard`;
  if (pCita) pCita.textContent = `${countCita} citas registradas`;

  if (containerLeadsList) {
    containerLeadsList.querySelectorAll("[data-lead-id]").forEach((btn) => {
      btn.addEventListener("click", () => openDrawer(btn.dataset.leadId));
    });
  }
}

// ============================================================
// STOCK MULTI-TENANT (AUTOS)
// ============================================================
async function renderCars() {
  const { data: cars, error } = await supabase
    .from('cars')
    .select('*')
    .eq('lote_id', currentLote.id);

  if (error) return;

  const tbody = document.getElementById("carsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const carsCountEl = document.getElementById("carsCount");
  if (carsCountEl) carsCountEl.textContent = cars ? cars.length : 0;

  if (!cars || cars.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-xs text-slate-400 py-6">Sin autos en el inventario de este lote.</td></tr>`;
    return;
  }

  cars.forEach((car) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100 hover:bg-slate-50 transition-colors";
    tr.innerHTML = `
      <td class="text-slate-400 font-mono text-xs py-3">${car.id.slice(0,8)}...</td>
      <td class="font-medium text-slate-900 py-3">${car.brand_model || '—'}</td>
      <td class="text-slate-600 py-3">${car.year || '—'}</td>
      <td class="text-slate-900 font-medium py-3">$${car.price ? car.price.toLocaleString("es-MX") : '0'}</td>
      <td class="py-3"><span class="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">${car.status || 'Disponible'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// DRAWER
// ============================================================
function initDrawer() {
  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const closeBtn = document.getElementById("closeDrawer");

  if (!drawer || !overlay) return;

  const close = () => {
    drawer.classList.add("translate-x-full");
    overlay.classList.add("hidden");
  };

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);
}

function openDrawer(leadId) {
  const lead = localLeadsCache.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const drawer = document.getElementById("drawer");
  const overlay = document.getElementById("drawerOverlay");
  const subtitle = document.getElementById("drawerSubtitle");
  const containerExtended = document.getElementById("drawerExpandedData");

  if (!drawer || !subtitle || !containerExtended) return;

  subtitle.textContent = `ID Lead: ${lead.id.slice(0,8)}... • Teléfono: ${lead.phone_number || 'Desconocido'}`;
  
  containerExtended.innerHTML = `
    <div class="border-b border-slate-200 pb-2 mb-2">
      <p class="text-xs text-slate-400 uppercase font-bold tracking-wider">Nombre del Cliente</p>
      <p class="text-sm font-semibold text-slate-800">${lead.name || 'No proporcionado'}</p>
    </div>
    <div class="space-y-1 text-xs text-slate-600">
      <p>🚗 <strong>Auto de Interés:</strong> ${lead.auto_interes || 'No especificado'}</p>
      <p>💰 <strong>Enganche:</strong> ${lead.enganche || 'No declarado'}</p>
      <p>💼 <strong>Trabajo:</strong> ${lead.situacion_laboral || 'No capturada'}</p>
      <p>📊 <strong>Buró:</strong> ${lead.historial_crediticio || 'Sin evaluar'}</p>
    </div>
    <div class="mt-3 pt-2 border-t border-slate-200 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
      <p class="text-xs text-emerald-700 font-bold uppercase">📅 Cita de Manejo / Visita:</p>
      <p class="text-sm font-semibold text-emerald-900 mt-0.5">${lead.fecha_cita ? lead.fecha_cita : '❌ Sin cita asignada aún'}</p>
    </div>
  `;

  if (overlay) overlay.classList.remove("hidden");
  drawer.classList.remove("translate-x-full");
}